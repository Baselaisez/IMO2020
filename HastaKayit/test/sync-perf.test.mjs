// Eşitleme ve anlık görüntünün MALİYETİNİ sabitleyen testler.
//
// Doktorun defterinde (100.784 hasta) ölçülmüştü: her kayıttan 3 saniye sonra
// tam bir eşitleme turu başlıyor, bu tur 7,0 saniye CPU harcayıp 76 MB dosya
// yazıyor, karşı tarafın dosyasını doğrulamak 3,1 saniye daha sürüyordu.
// Arka arkaya hasta girerken uygulama zamanının yarısından fazlasını
// eşitlemede geçiriyordu — "yavaş çalışıyor" şikâyetinin sebebi buydu.
//
// Buradaki testler üç düzeltmeyi yerinde tutar:
//   1. yük TEK geçişte metne çevrilir (üç kopya + iki stringify yerine)
//   2. kayıt sonrası tur, ölçülen tur süresine göre geri çekilir
//   3. veri değişmediyse anlık görüntü hiç alınmaz
import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { initSchema, addPatient, addPayment, buildSyncState } from '../src/js/repo.js';
import {
  serializeSyncPayload, parseSyncPayload, checksumMatches, wrapSyncPayload,
  mutationDelayMs, MUTATION_DEBOUNCE_MS, MUTATION_MAX_DELAY_MS, ROUND_BUDGET,
} from '../src/js/sync-file.js';
import { snapshotChanged } from '../src/js/snapshot.js';

async function db() {
  const SQL = await initSqlJs({ locateFile: f => `node_modules/sql.js/dist/${f}` });
  const d = new SQL.Database();
  const x = {
    async run(sql, p = []) { d.run(sql, p); return { changes: d.getRowsModified() }; },
    async query(sql, p = []) {
      const st = d.prepare(sql); st.bind(p);
      const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free(); return rows;
    },
  };
  await initSchema(x);
  return x;
}

// --- 1. Yük: yerel kimlik sızmaz, bağ uuid ile kurulur ----------------------

test('buildSyncState: yerel kimlikleri DIŞARIDA bırakır, patient_uuid ile bağlar', async () => {
  const x = await db();
  const id = await addPatient(x, { name: 'ALİ VELİ', start_date: '2026-01-01' });
  await addPayment(x, { patient_id: id, amount: 1500, pay_date: '2026-01-02', status: 'paid' });
  const s = await buildSyncState(x);

  assert.equal(s.patients.length, 1);
  assert.ok(!('id' in s.patients[0]), 'hastada yerel id kalmamalı');
  assert.ok(s.patients[0].uuid, 'uuid taşınmalı');
  assert.ok(!('id' in s.payments[0]), 'ödemede yerel id kalmamalı');
  assert.ok(!('patient_id' in s.payments[0]), 'ödemede yerel patient_id kalmamalı');
  assert.equal(s.payments[0].patient_uuid, s.patients[0].uuid, 'bağ uuid ile kurulmalı');
});

test('buildSyncState: şemaya eklenen YENİ sütun kendiliğinden eşitlenir', async () => {
  // Sütun listesi elle yazılmış olsaydı, yeni bir alan eklendiği gün sessizce
  // eşitlenmemeye başlardı. PRAGMA ile okunduğu için bu test onu yakalar.
  const x = await db();
  await x.run('ALTER TABLE patients ADD COLUMN sigorta TEXT DEFAULT NULL');
  const id = await addPatient(x, { name: 'YENİ ALAN', start_date: '2026-01-01' });
  await x.run('UPDATE patients SET sigorta=? WHERE id=?', ['SGK', id]);
  const s = await buildSyncState(x);
  assert.equal(s.patients[0].sigorta, 'SGK');
});

test('buildSyncState: sahipsiz ödeme DÜŞMEZ (LEFT JOIN)', async () => {
  // INNER JOIN olsaydı öksüz bir kayıt sessizce eşitleme dışında kalırdı.
  // Tıbbi kayıtta eşitlemenin veri eksiltmesi yasak.
  //
  // Normalde yabancı anahtar kısıtı öksüz kayda izin vermiyor (iyi). Ama
  // kısıt her zaman açık olmayabilir: eski bir yedekten geri yükleme, elle
  // düzeltilmiş bir dosya ya da `PRAGMA foreign_keys` kapalı bir sürüm böyle
  // bir satır bırakabilir. O satır da eşitlenmeli. Kısıtı yalnızca bu testte
  // kapatıp gerçek bir öksüz satır üretiyoruz.
  const x = await db();
  const id = await addPatient(x, { name: 'SİLİNECEK', start_date: '2026-01-01' });
  await addPayment(x, { patient_id: id, amount: 500, pay_date: '2026-01-02', status: 'paid' });
  await x.run('PRAGMA foreign_keys=OFF');
  await x.run('DELETE FROM patients WHERE id=?', [id]);
  await x.run('PRAGMA foreign_keys=ON');
  const s = await buildSyncState(x);
  assert.equal(s.payments.length, 1, 'öksüz ödeme yükte kalmalı');
  assert.equal(s.payments[0].patient_uuid, null);
});

// --- 2. Tek geçişli metin üretimi -------------------------------------------

const STATE = {
  patients: [{ uuid: 'p1', name: 'ALİ "tırnaklı" }{ ŞAHİN', notes: '"data": tuzak metni' }],
  payments: [{ uuid: 'o1', patient_uuid: 'p1', amount: 1500 }],
  deliveries: [], deletions: [{ uuid: 'p9', entity: 'patient', deleted_at: '2026-01-01T00:00:00.000Z' }],
};

test('serializeSyncPayload: zarf biçimi korunur ve geri okunabilir', () => {
  const text = serializeSyncPayload(STATE, '2026-11-06T12:00:00.000Z');
  const env = JSON.parse(text);
  assert.equal(env.app, 'hastakayit-sync');
  assert.equal(env.written_at, '2026-11-06T12:00:00.000Z');
  assert.deepEqual(env.counts, { patients: 1, payments: 1, deliveries: 0, deletions: 1 });
  // Alan sırası: data EN SONDA olmalı — hızlı sağlama yolu buna dayanıyor.
  assert.deepEqual(Object.keys(env), ['app', 'version', 'written_at', 'counts', 'checksum', 'data']);
  const back = parseSyncPayload(text);
  assert.equal(back.patients[0].name, STATE.patients[0].name);
  assert.equal(back.payments[0].patient_uuid, 'p1');
});

test('serializeSyncPayload ile wrapSyncPayload aynı zarfı üretir', () => {
  const a = JSON.parse(serializeSyncPayload(STATE, '2026-11-06T12:00:00.000Z'));
  const b = wrapSyncPayload(STATE, '2026-11-06T12:00:00.000Z');
  assert.deepEqual(a, b);
});

test('checksumMatches: hızlı yol doğrular, kurcalamayı REDDEDER', () => {
  const text = serializeSyncPayload(STATE, '2026-11-06T12:00:00.000Z');
  const env = JSON.parse(text);
  assert.equal(checksumMatches(text, env.data, env.checksum), true);

  // Tutar değiştirilmiş dosya hiçbir yoldan geçmemeli.
  const tampered = text.replace('1500', '9999');
  const tenv = JSON.parse(tampered);
  assert.equal(checksumMatches(tampered, tenv.data, tenv.checksum), false);
  assert.throws(() => parseSyncPayload(tampered), /bütünlük/);
});

test('checksumMatches: alan sırası farklıysa pahalı yola düşer ve yine DOĞRU der', () => {
  // Hızlı yol bir gün tutmazsa doktorun eşitlemesi "dosya bozuk" diye
  // DURMAMALI; sessizce kesin yönteme düşmeli.
  const env = JSON.parse(serializeSyncPayload(STATE, '2026-11-06T12:00:00.000Z'));
  const reordered = JSON.stringify({ data: env.data, app: env.app, version: env.version,
    written_at: env.written_at, counts: env.counts, checksum: env.checksum });
  assert.equal(checksumMatches(reordered, env.data, env.checksum), true);
  assert.equal(parseSyncPayload(reordered).patients.length, 1);
});

// --- 3. Kayıt sonrası turun geri çekilmesi ----------------------------------

test('mutationDelayMs: küçük defterde davranış değişmez, büyük defterde geri çekilir', () => {
  // Hiç tur ölçülmemiş / anlamsız değerler -> taban süre.
  assert.equal(mutationDelayMs(0), MUTATION_DEBOUNCE_MS);
  assert.equal(mutationDelayMs(undefined), MUTATION_DEBOUNCE_MS);
  assert.equal(mutationDelayMs(NaN), MUTATION_DEBOUNCE_MS);
  assert.equal(mutationDelayMs(-5), MUTATION_DEBOUNCE_MS);
  // Küçük defter: tur 20 ms -> taban süre korunur (eski davranış).
  assert.equal(mutationDelayMs(20), MUTATION_DEBOUNCE_MS);
  // Doktorun defteri: tur ~5 sn -> 20 sn bekle, yani zamanın en çok 1/4'ü.
  assert.equal(mutationDelayMs(5000), 5000 * ROUND_BUDGET);
  // Üst sınır aşılmaz: eşitleme bir dakikadan fazla gecikmesin.
  assert.equal(mutationDelayMs(600000), MUTATION_MAX_DELAY_MS);
});

test('mutationDelayMs: eşitlemeye ayrılan pay her zaman 1/ROUND_BUDGET altında', () => {
  for (const round of [50, 500, 1000, 3000, 5000, 9000, 14999]) {
    const pay = round / (round + mutationDelayMs(round));
    assert.ok(pay <= 1 / ROUND_BUDGET + 1e-9,
      `tur ${round} ms için eşitleme payı ${(pay * 100).toFixed(1)}% — 25%'i aşmamalı`);
  }
});

// --- 4. Değişmediyse anlık görüntü alınmaz ----------------------------------

test('snapshotChanged: aynı parmak izinde atlar, değişince alır', () => {
  assert.equal(snapshotChanged('a|b|c', 'a|b|c'), false, 'değişmediyse atlanmalı');
  assert.equal(snapshotChanged('a|b|c', 'a|b|d'), true, 'değiştiyse alınmalı');
  assert.equal(snapshotChanged(null, 'a|b|c'), true, 'ilk görüntü alınmalı');
  // Parmak izi HESAPLANAMADIYSA emniyetli taraf: yedeği al.
  assert.equal(snapshotChanged('a|b|c', null), true, 'belirsizse alınmalı');
});
