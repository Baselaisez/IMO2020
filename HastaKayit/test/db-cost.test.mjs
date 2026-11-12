// iPhone'da HER x.query/x.run bir Capacitor köprü gidiş-dönüşüdür. Bu yüzden
// "kaç çağrı yapıldığı" en az "ne kadar sürdüğü" kadar önemli bir ölçüdür —
// ve Node'da yapılan süre ölçümlerinde hiç görünmez.
//
// ÖLÇÜLEN HATA: birleştirme uygulanırken her kayıt için ayrı bir
// `SELECT updated_at ... WHERE uuid=?` çalışıyordu. 20.000 hasta + 30.000
// ödemede, HİÇBİR ŞEY DEĞİŞMEMİŞ bir turda 50.003 çağrı ve 112.784 ms.
// İki ayrı sebep vardı ve ikisi de düzeltildi:
//   1. uuid sütununda indeks yoktu -> her arama tam tarama, maliyet karesel
//      (indeks eklenince 112.784 ms -> 454 ms)
//   2. kayıt başına bir sorgu -> köprü maliyeti kayıt sayısıyla doğrusal
//      (haritaya alınınca 50.003 çağrı -> 41 çağrı)
import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {
  SCHEMA, initSchema, addPatient, addPayment, buildSyncState, applyMergedState, allData,
} from '../src/js/repo.js';
import { mergeStates } from '../src/js/sync-merge.js';
import { makeBackup, parseBackup, serializeBackupAsync } from '../src/js/backup.js';

/** Çağrıları SAYAN bir yürütücü. */
async function countingDb() {
  const SQL = await initSqlJs({ locateFile: f => `node_modules/sql.js/dist/${f}` });
  const d = new SQL.Database();
  const stats = { query: 0, run: 0, get total() { return this.query + this.run; } };
  const x = {
    async run(sql, p = []) { stats.run++; d.run(sql, p); return { changes: d.getRowsModified() }; },
    async query(sql, p = []) {
      stats.query++;
      const st = d.prepare(sql); st.bind(p);
      const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free(); return rows;
    },
  };
  await initSchema(x);
  return { x, stats };
}

test('uuid sütunları indeksli (yoksa her arama tam tarama olur)', () => {
  const sql = SCHEMA.join('\n');
  for (const tbl of ['patients', 'payments', 'deliveries']) {
    assert.match(sql, new RegExp(`CREATE INDEX IF NOT EXISTS idx_${tbl}_uuid ON ${tbl}\\(uuid\\)`),
      `${tbl}.uuid indekssiz kalırsa birleştirme karesel maliyete döner`);
  }
});

test('applyMergedState: veritabanı çağrısı kayıt sayısıyla BÜYÜMÜYOR', async () => {
  // Asıl iddia bu. İki farklı boyutta ölçüp çağrı sayısının kayıt sayısıyla
  // orantılı ARTMADIĞINI gösteriyoruz.
  const olc = async (n) => {
    const { x, stats } = await countingDb();
    for (let i = 0; i < n; i++) {
      const id = await addPatient(x, { name: `HASTA ${i}`, start_date: '2026-11-12' });
      await addPayment(x, { patient_id: id, amount: 100, pay_date: '2026-11-12', status: 'paid' });
    }
    const local = await buildSyncState(x, { onYield: null });
    const merged = mergeStates(local, { patients: [], payments: [], deliveries: [], deletions: [] }, Date.now());
    const once = stats.total;
    const applied = await applyMergedState(x, merged);
    assert.deepEqual(applied, { patientsUpserted: 0, paymentsUpserted: 0, deliveriesUpserted: 0, deleted: 0 },
      'değişiklik yokken hiçbir şey yazılmamalı');
    return stats.total - once;
  };
  const az = await olc(20);
  const cok = await olc(200);   // 10 kat kayıt
  assert.ok(cok <= az + 6,
    `kayıt 10 katına çıkınca çağrı sayısı neredeyse aynı kalmalı: 20 kayıt -> ${az}, 200 kayıt -> ${cok}`);
  assert.ok(cok < 40, `200 hasta + 200 ödeme için ${cok} çağrı fazla — kayıt başına sorgu geri gelmiş olabilir`);
});

test('applyMergedState: karşı taraftan GELEN kayıt yine de yazılıyor', async () => {
  // Hız uğruna doğruluktan ödün verilmediğinin kanıtı.
  const { x } = await countingDb();
  await addPatient(x, { name: 'YEREL HASTA', start_date: '2026-11-12' });
  const local = await buildSyncState(x, { onYield: null });
  const uzak = {
    patients: [{ uuid: 'uzak-1', name: 'UZAK HASTA', start_date: '2026-11-12',
      status: 'active', created_at: '2026-11-12T10:00:00.000Z', updated_at: '2026-11-12T10:00:00.000Z' }],
    payments: [], deliveries: [], deletions: [],
  };
  const merged = mergeStates(local, uzak, Date.now());
  const applied = await applyMergedState(x, merged);
  assert.equal(applied.patientsUpserted, 1);
  const adlar = (await x.query('SELECT name FROM patients ORDER BY name')).map(r => r.name);
  assert.deepEqual(adlar, ['UZAK HASTA', 'YEREL HASTA']);
});

test('applyMergedState: YEREL daha yeniyse karşı taraf onu EZMEZ', async () => {
  const { x } = await countingDb();
  const id = await addPatient(x, { name: 'GÜNCEL AD', start_date: '2026-11-12' });
  const uuid = (await x.query('SELECT uuid FROM patients WHERE id=?', [id]))[0].uuid;
  const local = await buildSyncState(x, { onYield: null });
  const uzak = {
    patients: [{ uuid, name: 'ESKİ AD', start_date: '2026-11-12', status: 'active',
      created_at: '2020-01-01T00:00:00.000Z', updated_at: '2020-01-01T00:00:00.000Z' }],
    payments: [], deliveries: [], deletions: [],
  };
  await applyMergedState(x, mergeStates(local, uzak, Date.now()));
  assert.equal((await x.query('SELECT name FROM patients WHERE uuid=?', [uuid]))[0].name, 'GÜNCEL AD');
});

test('allData: pencereli okuma aynı veriyi veriyor', async () => {
  const { x } = await countingDb();
  for (let i = 0; i < 13; i++) {
    const id = await addPatient(x, { name: `HASTA ${i}`, start_date: '2026-11-12' });
    await addPayment(x, { patient_id: id, amount: 10 + i, pay_date: '2026-11-12', status: 'paid' });
  }
  const buyuk = await allData(x, { pageSize: 10_000, onYield: null });
  const kucuk = await allData(x, { pageSize: 3, onYield: null });
  assert.deepEqual(kucuk, buyuk);
  assert.equal(buyuk.patients.length, 13);
});

test('yedek: parçalı üretim, tek seferlikle BAYT BAYT aynı ve geri okunabiliyor', async () => {
  const ISO = '2026-11-12T09:00:00.000Z';
  const hastalar = Array.from({ length: 23 }, (_, i) => ({
    id: i + 1, uuid: `p${i}`, name: `ALİ "tırnak" ${i}`, start_date: '2026-11-12',
    status: 'active', created_at: ISO, updated_at: ISO }));
  const odemeler = Array.from({ length: 7 }, (_, i) => ({
    id: i + 1, uuid: `o${i}`, patient_id: i + 1, amount: 1500, pay_date: '2026-11-12',
    description: 'Seans', status: 'paid', created_at: ISO, updated_at: ISO }));
  const beklenen = JSON.stringify(makeBackup(hastalar, odemeler, ISO, [], []));
  for (const chunk of [1, 5, 22, 23, 24, 9999]) {
    assert.equal(await serializeBackupAsync(hastalar, odemeler, ISO, [], [], { chunk, onYield: null }),
      beklenen, `chunk=${chunk} aynı metni vermeli`);
  }
  // Sağlama yol boyunca hesaplanıyor; yanlış olsaydı geri yükleme reddederdi.
  const geri = parseBackup(await serializeBackupAsync(hastalar, odemeler, ISO, [], [], { chunk: 4, onYield: null }));
  assert.equal(geri.ok, true, geri.error);
  assert.equal(geri.data.patients.length, 23);
});

test('yedek: boş veritabanı da geçerli dosya üretir', async () => {
  const ISO = '2026-11-12T09:00:00.000Z';
  const text = await serializeBackupAsync([], [], ISO, [], [], { onYield: null });
  assert.equal(text, JSON.stringify(makeBackup([], [], ISO, [], [])));
  assert.equal(parseBackup(text).ok, true);
});
