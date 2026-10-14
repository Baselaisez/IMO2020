import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {
  initSchema, addPatient, addPayment, addDelivery,
  findDuplicatePatient, countJunkPatients, deleteJunkPatients,
  noteRecentPatient, listRecentPatients, monthlyAggregates,
} from '../src/js/repo.js';
import { monthlySummaryFrom, monthlySummary } from '../src/js/compute.js';

// 5.8 ile gelen üç özellik: mükerrer koruması, çöp temizleme, son açılanlar.
// Artı aylık özetin SQL tarafına taşınması.

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
const BASE = { start_date: '2026-01-10' };

// --- Mükerrer koruması ------------------------------------------------------

test('findDuplicatePatient: ad TEK BAŞINA mükerrer saymaz', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ayşe Yılmaz' });
  assert.equal(await findDuplicatePatient(x, { name: 'Ayşe Yılmaz' }), null,
    'yaygın bir ad tek başına aynı kişi kanıtı değildir');
});

test('findDuplicatePatient: ad + anne adı eşleşirse mükerrer', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ayşe Yılmaz', mother_name: 'Fatma' });
  const d = await findDuplicatePatient(x, { name: 'Ayşe Yılmaz', mother_name: 'Fatma' });
  assert.ok(d); assert.equal(d.name, 'Ayşe Yılmaz');
});

test('findDuplicatePatient: Türkçe büyük/küçük harf farkı engel değil', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'ALİ ŞAHİN', mother_name: 'AYŞE' });
  // SQLite'ın COLLATE NOCASE'i bu harfleri katlamaz; iki taraf da elle katlanıyor.
  const d = await findDuplicatePatient(x, { name: 'ali şahin', mother_name: 'ayşe' });
  assert.ok(d, 'ALİ ŞAHİN ile ali şahin aynı kişi sayılmalı');
});

test('findDuplicatePatient: telefon TEK BAŞINA yeterlidir', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ayşe Yılmaz', phone: '0532 111 22 33' });
  const d = await findDuplicatePatient(x, { name: 'Bambaşka Biri', phone: '05321112233' });
  assert.ok(d, 'aynı numara aynı kişidir — yazım farkı önemsiz');
});

test('findDuplicatePatient: kaydın kendisi mükerrer sayılmaz (düzenleme)', async () => {
  const x = await db();
  const id = await addPatient(x, { ...BASE, name: 'Ayşe Yılmaz', mother_name: 'Fatma' });
  assert.equal(await findDuplicatePatient(x, { name: 'Ayşe Yılmaz', mother_name: 'Fatma' }, id), null);
});

test('findDuplicatePatient: adsız girdi için null', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ayşe Yılmaz' });
  assert.equal(await findDuplicatePatient(x, { name: '' }), null);
});

// --- Çöp temizleme ----------------------------------------------------------

test('çöp temizleme: harfsiz ve ödemesiz kayıtları siler', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: '"' });
  await addPatient(x, { ...BASE, name: ',' });
  await addPatient(x, { ...BASE, name: 'Gerçek Hasta' });
  assert.equal(await countJunkPatients(x), 2);
  assert.equal(await deleteJunkPatients(x), 2);
  assert.equal(await countJunkPatients(x), 0);
  const kalan = await x.query('SELECT name FROM patients');
  assert.deepEqual(kalan.map(r => r.name), ['Gerçek Hasta']);
});

test('çöp temizleme: ÖDEMESİ olan kayda asla dokunmaz', async () => {
  const x = await db();
  const id = await addPatient(x, { ...BASE, name: '.' });
  await addPayment(x, { patient_id: id, pay_date: '2026-02-01', amount: 100 });
  assert.equal(await countJunkPatients(x), 0, 'parayla ilişkili kayıt çöp değildir');
});

test('çöp temizleme: TESLİMATI olan kayda dokunmaz', async () => {
  const x = await db();
  const id = await addPatient(x, { ...BASE, name: '-' });
  await addDelivery(x, { patient_id: id, method: 'kargo', planned_date: '2026-03-01' });
  assert.equal(await countJunkPatients(x), 0);
});

test('çöp temizleme: "İsimsiz — 12.03.2024" kayıtları çöp DEĞİLDİR', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'İsimsiz — 12.03.2024', diagnosis: 'nazar' });
  assert.equal(await countJunkPatients(x), 0,
    'adında harf var ve tarihi/tanısı olan gerçek bir ziyaretten geliyor');
});

// --- Son açılanlar ----------------------------------------------------------

test('son açılanlar: en son açılan başta, tekrar yok', async () => {
  const x = await db();
  const a = await addPatient(x, { ...BASE, name: 'Bir Hasta' });
  const b = await addPatient(x, { ...BASE, name: 'İki Hasta' });
  await noteRecentPatient(x, a);
  await noteRecentPatient(x, b);
  await noteRecentPatient(x, a); // yeniden açıldı → başa gelmeli
  assert.deepEqual((await listRecentPatients(x)).map(r => r.name), ['Bir Hasta', 'İki Hasta']);
});

test('son açılanlar: en fazla 8 kayıt tutulur', async () => {
  const x = await db();
  for (let i = 0; i < 12; i++) {
    const id = await addPatient(x, { ...BASE, name: `Hasta ${i}` });
    await noteRecentPatient(x, id);
  }
  assert.equal((await listRecentPatients(x)).length, 8);
});

test('son açılanlar: silinmiş hasta listede kalmaz', async () => {
  const x = await db();
  const id = await addPatient(x, { ...BASE, name: 'Silinecek' });
  await noteRecentPatient(x, id);
  await x.run('DELETE FROM patients WHERE id=?', [id]);
  assert.deepEqual(await listRecentPatients(x), []);
});

test('son açılanlar: bozuk meta kaydı çökertmez', async () => {
  const x = await db();
  await x.run("INSERT OR REPLACE INTO meta (key,value) VALUES ('recent_ids','bozuk{')");
  assert.deepEqual(await listRecentPatients(x), []);
});

// --- Aylık özet SQL tarafında ----------------------------------------------

test('monthlySummaryFrom: eski monthlySummary ile AYNI sonucu verir', async () => {
  const x = await db();
  const a = await addPatient(x, { name: 'A Hasta', start_date: '2026-01-05' });
  const b = await addPatient(x, { name: 'B Hasta', start_date: '2026-02-05' });
  await addPayment(x, { patient_id: a, pay_date: '2026-01-20', amount: 150 });
  await addPayment(x, { patient_id: a, pay_date: '2026-02-20', amount: 250.5 });
  await addPayment(x, { patient_id: b, pay_date: '2026-02-21', amount: 100 });

  const patients = await x.query('SELECT * FROM patients');
  const payments = await x.query('SELECT * FROM payments');
  const eski = monthlySummary(patients, payments);
  const yeni = monthlySummaryFrom(await monthlyAggregates(x));
  assert.deepEqual(yeni, eski);
});

test('monthlySummaryFrom: geçersiz tarihli ödeme GEÇERSİZ kovasında ve en sonda', async () => {
  const x = await db();
  const a = await addPatient(x, { name: 'A Hasta', start_date: '2026-01-05' });
  await addPayment(x, { patient_id: a, pay_date: '2026-01-20', amount: 100 });
  await x.run(`UPDATE payments SET pay_date='bozuk' WHERE id=(SELECT MAX(id) FROM payments)`);
  await addPayment(x, { patient_id: a, pay_date: '2026-02-20', amount: 50 });
  const rows = monthlySummaryFrom(await monthlyAggregates(x));
  assert.equal(rows[rows.length - 1].month, 'GEÇERSİZ');
  assert.equal(rows[rows.length - 1].activePatients, 0);
});
