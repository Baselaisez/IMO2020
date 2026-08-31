import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { initSchema, addPatient, addPayment, addDelivery, listTodayAppointments, listUpcoming } from '../src/js/repo.js';
import { buildSchedule } from '../src/js/notify.js';

// "Bugün" şeridi ve bildirim zamanlaması eskiden TÜM veriyi belleğe alıyordu
// (45.000 kayıtta ölçülen: 1.474 ms ve 962 ms, üstelik her kayıt sonrası).
// Bu testler dar sorguların aynı sonucu verdiğini sabitliyor.

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

const BASE = { start_date: '2026-08-01' };

test('listTodayAppointments: sadece bugünün aktif randevuları', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Bugün Hasta', next_appt: '2026-08-26 14:30' });
  await addPatient(x, { ...BASE, name: 'Yarın Hasta', next_appt: '2026-08-27 09:00' });
  await addPatient(x, { ...BASE, name: 'Randevusuz' });
  const rows = await listTodayAppointments(x, '2026-08-26');
  assert.deepEqual(rows.map(r => r.name), ['Bugün Hasta']);
});

test('listTodayAppointments: tamamlanmış hasta şeritte görünmez', async () => {
  const x = await db();
  const id = await addPatient(x, { ...BASE, name: 'Biten', next_appt: '2026-08-26 10:00' });
  await x.run(`UPDATE patients SET status='done' WHERE id=?`, [id]);
  assert.deepEqual(await listTodayAppointments(x, '2026-08-26'), []);
});

test('listTodayAppointments: aynı gün birden fazla randevu saate göre sıralı', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Öğleden Sonra', next_appt: '2026-08-26 16:00' });
  await addPatient(x, { ...BASE, name: 'Sabah', next_appt: '2026-08-26 08:00' });
  const rows = await listTodayAppointments(x, '2026-08-26');
  assert.deepEqual(rows.map(r => r.name), ['Sabah', 'Öğleden Sonra']);
});

test('listUpcoming: geçmiş işler getirilmez', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Geçmiş', next_appt: '2026-08-01 10:00' });
  await addPatient(x, { ...BASE, name: 'Gelecek', next_appt: '2026-09-01 10:00' });
  const up = await listUpcoming(x, '2026-08-26');
  assert.deepEqual(up.patients.map(p => p.name), ['Gelecek']);
});

test('listUpcoming: teslimat/ödeme için hasta ADI da geliyor', async () => {
  const x = await db();
  const id = await addPatient(x, { ...BASE, name: 'Paketli Hasta' });
  await addDelivery(x, { patient_id: id, method: 'kargo', planned_date: '2026-09-05', planned_time: '10:00' });
  const up = await listUpcoming(x, '2026-08-26');
  assert.equal(up.deliveries.length, 1);
  const named = up.patients.find(p => p.id === id);
  assert.ok(named, 'teslimatın hastası adıyla birlikte gelmeli');
  assert.equal(named.name, 'Paketli Hasta');
  // buildSchedule bu girdiyle bildirimi kurabilmeli.
  const sched = buildSchedule(up.patients, up.deliveries, up.payments, Date.parse('2026-08-26T00:00:00Z'));
  assert.equal(sched.length, 1);
  assert.match(sched[0].body, /Paketli Hasta/);
});

test('listUpcoming: teslim edilmiş paket ve ödenmiş ödeme atlanır', async () => {
  const x = await db();
  const id = await addPatient(x, { ...BASE, name: 'Hasta' });
  const dId = await addDelivery(x, { patient_id: id, method: 'kargo', planned_date: '2026-09-05' });
  await x.run(`UPDATE deliveries SET delivered=1 WHERE id=?`, [dId]);
  await addPayment(x, { patient_id: id, pay_date: '2026-09-10', amount: 100, status: 'paid' });
  const up = await listUpcoming(x, '2026-08-26');
  assert.equal(up.deliveries.length, 0);
  assert.equal(up.payments.length, 0);
});

test('listUpcoming: bekleyen ödeme bildirime giriyor', async () => {
  const x = await db();
  const id = await addPatient(x, { ...BASE, name: 'Borçlu Hasta' });
  await addPayment(x, { patient_id: id, pay_date: '2026-09-10', amount: 100, status: 'pending' });
  const up = await listUpcoming(x, '2026-08-26');
  assert.equal(up.payments.length, 1);
  const sched = buildSchedule(up.patients, up.deliveries, up.payments, Date.parse('2026-08-26T00:00:00Z'));
  assert.match(sched[0].body, /Borçlu Hasta/);
});
