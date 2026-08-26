import { totalPaid, sumByStatus } from './compute.js';
import { mergePatients } from './importer.js';

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    name TEXT NOT NULL,
    phone TEXT DEFAULT '',
    diagnosis TEXT DEFAULT '',
    referral TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    mother_name TEXT DEFAULT '',
    planned_sessions INTEGER DEFAULT NULL,
    residence TEXT DEFAULT '',
    birth_date TEXT DEFAULT NULL,
    appt_remind_min INTEGER DEFAULT NULL,
    appt_cal_id TEXT DEFAULT NULL,
    photo TEXT DEFAULT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT DEFAULT NULL,
    next_appt TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    pay_date TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT DEFAULT 'Seans',
    status TEXT NOT NULL DEFAULT 'paid',
    receipt TEXT DEFAULT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id)`,
  `CREATE TABLE IF NOT EXISTS deliveries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    patient_id INTEGER NOT NULL REFERENCES patients(id),
    method TEXT NOT NULL,
    tracking_no TEXT DEFAULT '',
    planned_date TEXT DEFAULT NULL,
    delivered INTEGER NOT NULL DEFAULT 0,
    delivered_date TEXT DEFAULT NULL,
    planned_time TEXT DEFAULT NULL,
    remind_min INTEGER DEFAULT NULL,
    cal_id TEXT DEFAULT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_deliveries_patient ON deliveries(patient_id)`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS deletions (uuid TEXT PRIMARY KEY, entity TEXT NOT NULL, deleted_at TEXT NOT NULL)`,
];

// uuid is the sync identity; a collision (e.g. a hand-built backup, or a
// future bug in mergeImport/dedup) must fail loudly rather than silently
// collapsing two records' ledgers on the next sync. Partial (WHERE uuid IS
// NOT NULL) because rows inserted via a raw insert that omits uuid
// legitimately have NULL uuid and must not be forced unique against each
// other. Run on a FRESH install (columns already exist) and again at the end
// of migrateTo5 (after the uuid column exists and has been backfilled) — NOT
// as part of SCHEMA above, since v1-v4 DBs reach initSchema's SCHEMA loop
// before the uuid column has been added by migrateTo5.
async function createUuidIndexes(x) {
  await x.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_uuid ON patients(uuid) WHERE uuid IS NOT NULL');
  await x.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_uuid ON payments(uuid) WHERE uuid IS NOT NULL');
  await x.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_uuid ON deliveries(uuid) WHERE uuid IS NOT NULL');
}

async function migrateTo2(x) {
  // v1 patients table lacks these; ALTER ADD COLUMN is non-destructive.
  // try/catch makes it idempotent if a prior run partially applied.
  for (const col of ["ADD COLUMN mother_name TEXT DEFAULT ''", 'ADD COLUMN planned_sessions INTEGER DEFAULT NULL']) {
    try { await x.run(`ALTER TABLE patients ${col}`); }
    catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  }
  await setMeta(x, 'schema_version', '2');
}

async function migrateTo3(x) {
  // v2 payments table lacks status; ALTER ADD COLUMN is non-destructive.
  // try/catch makes it idempotent if a prior run partially applied.
  try { await x.run("ALTER TABLE payments ADD COLUMN status TEXT NOT NULL DEFAULT 'paid'"); }
  catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  await setMeta(x, 'schema_version', '3');
}

async function migrateTo4(x) {
  // v3 patients/deliveries tables lack these; ALTER ADD COLUMN is
  // non-destructive. try/catch makes it idempotent if a prior run partially
  // applied (e.g. app killed mid-migration on the phone).
  const cols = [
    ['patients', "ADD COLUMN residence TEXT DEFAULT ''"],
    ['patients', 'ADD COLUMN birth_date TEXT DEFAULT NULL'],
    ['patients', 'ADD COLUMN appt_remind_min INTEGER DEFAULT NULL'],
    ['patients', 'ADD COLUMN appt_cal_id TEXT DEFAULT NULL'],
    ['deliveries', 'ADD COLUMN planned_time TEXT DEFAULT NULL'],
    ['deliveries', 'ADD COLUMN remind_min INTEGER DEFAULT NULL'],
    ['deliveries', 'ADD COLUMN cal_id TEXT DEFAULT NULL'],
  ];
  for (const [t, c] of cols) {
    try { await x.run(`ALTER TABLE ${t} ${c}`); }
    catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  }
  await setMeta(x, 'schema_version', '4');
}

async function migrateTo5(x) {
  // v4 patients/payments/deliveries tables lack uuid; ALTER ADD COLUMN is
  // non-destructive, and existing rows get a backfilled uuid so every row
  // has a stable sync identity. try/catch makes it idempotent if a prior
  // run partially applied (e.g. app killed mid-migration on the phone).
  for (const t of ['patients', 'payments', 'deliveries']) {
    try { await x.run(`ALTER TABLE ${t} ADD COLUMN uuid TEXT`); }
    catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
    const rows = await x.query(`SELECT id FROM ${t} WHERE uuid IS NULL`);
    for (const r of rows) await x.run(`UPDATE ${t} SET uuid=? WHERE id=?`, [crypto.randomUUID(), r.id]);
  }
  await x.run(`CREATE TABLE IF NOT EXISTS deletions (uuid TEXT PRIMARY KEY, entity TEXT NOT NULL, deleted_at TEXT NOT NULL)`);
  // Indexes created AFTER the uuid backfill above, so every existing row
  // already has a populated, unique uuid before uniqueness is enforced.
  await createUuidIndexes(x);
  await setMeta(x, 'schema_version', '5');
}

async function migrateTo6(x) {
  // v5 patients table lacks photo; ALTER ADD COLUMN is non-destructive and
  // leaves every existing row's photo NULL. try/catch on /duplicate column/
  // makes it idempotent if a prior run partially applied (e.g. app killed
  // mid-migration on the phone).
  try { await x.run('ALTER TABLE patients ADD COLUMN photo TEXT'); }
  catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  await setMeta(x, 'schema_version', '6');
}

async function migrateTo7(x) {
  // v6 payments table lacks receipt (the "dekont" data-URL); ALTER ADD COLUMN
  // is non-destructive and leaves every existing payment's receipt NULL —
  // amounts, dates and statuses are untouched. try/catch on /duplicate column/
  // makes it idempotent if a prior run partially applied (e.g. app killed
  // mid-migration on the phone).
  try { await x.run('ALTER TABLE payments ADD COLUMN receipt TEXT'); }
  catch (e) { if (!/duplicate column/i.test(String(e && e.message || e))) throw e; }
  await setMeta(x, 'schema_version', '7');
}

// The version every DB ends at after initSchema. Bump this together with a new
// migrateToN — it is what the fresh-install path stamps AND what decides
// whether an existing DB is about to be migrated (and therefore needs a
// pre-update backup).
export const TERMINAL_SCHEMA_VERSION = 7;

// Pre-migration dump for the onBeforeMigrate hook. Deliberately NOT allData():
// allData is written against the CURRENT schema, so it is only safe once the
// migrations have run — exactly the moment we are trying to get ahead of. Here
// every table is read with a bare `SELECT *` (never a column list, which a
// pre-migration DB may not satisfy) and each read has its own try/catch, so a
// v1-era DB that is missing `deliveries`/`deletions` yields [] for that table
// instead of throwing away the patients we DID manage to read.
async function dumpBeforeMigrate(x) {
  const out = { patients: [], payments: [], deliveries: [], deletions: [] };
  for (const t of Object.keys(out)) {
    try { out[t] = await x.query(`SELECT * FROM ${t}`); }
    catch (e) { console.error(`pre-migration dump: ${t} okunamadı`, e); }
  }
  return out;
}

// initSchema(x) behaves exactly as before. initSchema(x, { onBeforeMigrate })
// additionally hands the caller a full dump of the existing data at the single
// riskiest moment of any app update — after the stored schema_version has been
// read but BEFORE the first migrateToN touches the tables — so the caller can
// persist it (app.js writes it as a pre-update-*.json backup file). The hook
// fires at most once per initSchema call, and only for an existing DB that is
// genuinely behind (a fresh install and an already-current DB never fire it).
//
// repo.js must not know about the file layer, hence the injected hook rather
// than an import. A failing/slow/missing backup must never cost the doctor the
// migration itself, so the whole hook call is swallowed by try/catch: worst
// case the update proceeds without the extra safety net, exactly as it did
// before this hook existed.
export async function initSchema(x, { onBeforeMigrate } = {}) {
  // Connection-scoped PRAGMA: FK enforcement resets on every new connection,
  // so it must run after every connection open — initSchema guarantees that.
  await x.run('PRAGMA foreign_keys=ON');
  // meta table may not exist yet on a truly fresh DB, so read schema_version
  // only after SCHEMA has run (CREATE TABLE IF NOT EXISTS never touches an
  // existing meta row, so this ordering is still safe for v1 upgrades).
  for (const sql of SCHEMA) await x.run(sql); // IF NOT EXISTS: safe on existing DBs; fresh gets v5 columns + deliveries + deletions
  const before = await getMeta(x, 'schema_version');
  if (before === null) {
    await createUuidIndexes(x); // fresh install: uuid column already exists on all v5 tables
    await setMeta(x, 'schema_version', String(TERMINAL_SCHEMA_VERSION)); // fresh install has all v7 columns (SCHEMA already includes patients.photo and payments.receipt)
  } else {
    // Cumulative: a v1 DB runs all migrations in order and any DB ends at v7.
    const v = Number(before);
    // Pre-update backup: the LAST point at which the data is still exactly as
    // the previous app version left it. Failure here is logged and ignored —
    // never allowed to abort the migration (see the initSchema doc comment).
    if (onBeforeMigrate && v < TERMINAL_SCHEMA_VERSION) {
      try {
        await onBeforeMigrate(await dumpBeforeMigrate(x), { from: v, to: TERMINAL_SCHEMA_VERSION });
      } catch (e) {
        console.error('onBeforeMigrate yedeği alınamadı (geçiş yine de sürüyor)', e);
      }
    }
    if (v < 2) await migrateTo2(x);
    if (v < 3) await migrateTo3(x);
    if (v < 4) await migrateTo4(x);
    if (v < 5) await migrateTo5(x);
    if (v < 6) await migrateTo6(x);
    if (v < 7) await migrateTo7(x);
  }
}

export async function getMeta(x, key) {
  const r = await x.query('SELECT value FROM meta WHERE key=?', [key]);
  return r.length ? r[0].value : null;
}

export async function setMeta(x, key, value) {
  if (value == null) throw new Error('Meta değeri boş olamaz: ' + key);
  await x.run('INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, String(value)]);
}

export function nowIso() {
  return new Date().toISOString();
}

// Per-executor promise queue: serializes concurrent withTx calls (e.g. a UI
// double-tap) so BEGIN never runs inside an open transaction.
const txQueues = new WeakMap();

export function withTx(x, fn) {
  const prev = txQueues.get(x) || Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    await x.run('BEGIN');
    try {
      const r = await fn();
      await x.run('COMMIT');
      return r;
    } catch (e) {
      try { await x.run('ROLLBACK'); } catch {}
      throw e;
    }
  });
  txQueues.set(x, run);
  return run;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function assertPatientInput(p) {
  if (!p.name || !String(p.name).trim()) throw new Error('Ad Soyad zorunlu.');
  if (!DATE_RE.test(String(p.start_date || ''))) throw new Error('Başlangıç tarihi geçersiz.');
  if (p.planned_sessions != null && p.planned_sessions !== '') {
    const ps = Number(p.planned_sessions);
    if (!Number.isInteger(ps) || ps <= 0) throw new Error('Planlanan seans pozitif tam sayı olmalı.');
  }
  if (p.birth_date != null && p.birth_date !== '' && !DATE_RE.test(String(p.birth_date))) throw new Error('Doğum tarihi geçersiz.');
}

async function lastId(x) {
  return (await x.query('SELECT last_insert_rowid() AS id'))[0].id;
}

async function tombstone(x, uuid, entity) {
  if (!uuid) return;
  await x.run('INSERT OR REPLACE INTO deletions (uuid, entity, deleted_at) VALUES (?,?,?)', [uuid, entity, nowIso()]);
}

export async function addPatient(x, p) {
  assertPatientInput(p);
  return withTx(x, async () => {
    await x.run(
      `INSERT INTO patients (uuid,name,mother_name,phone,diagnosis,referral,notes,start_date,end_date,next_appt,status,planned_sessions,residence,birth_date,appt_remind_min,photo,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      // end_date forced NULL: status is hard-coded 'active' and an active
      // patient with an end date is incoherent. Use completeTreatment to end.
      [p.uuid || crypto.randomUUID(), p.name.trim(), p.mother_name || '', p.phone || '', p.diagnosis || '', p.referral || '', p.notes || '',
       p.start_date, null, p.next_appt || null, 'active',
       (p.planned_sessions == null || p.planned_sessions === '') ? null : Number(p.planned_sessions),
       p.residence || '', p.birth_date || null,
       (p.appt_remind_min == null || p.appt_remind_min === '') ? null : Number(p.appt_remind_min),
       p.photo ?? null,
       nowIso(), nowIso()]
    );
    const id = await lastId(x);
    const back = await x.query('SELECT * FROM patients WHERE id=?', [id]);
    if (!back.length || back[0].name !== p.name.trim()) throw new Error('Kayıt doğrulanamadı (read-back).');
    return id;
  });
}

// addPatientsBatch(x, patients) -> { added, ids, skipped }
//
// Batch intake-form import: a clinic that drops 20 filled forms at once must end
// up with 20 patients or ZERO — never half a clinic day. So the whole batch runs
// in ONE withTx: any throw rolls every insert back.
//
// Column list, defaults and read-back verification deliberately mirror
// addPatient (uuid via crypto.randomUUID when absent, status 'active', end_date
// forced NULL, created_at/updated_at = nowIso()). start_date defaults to today —
// per-patient `todayIso` overrides the derivation, which keeps the function
// testable and lets the caller pin a clinic date for the whole batch.
//
// A row with an empty/whitespace name cannot be a patient record: it is SKIPPED
// (counted in `skipped`), never inserted, and never throws — one unreadable form
// must not cost the user the other 19.
export async function addPatientsBatch(x, patients = []) {
  return withTx(x, async () => {
    const before = (await x.query('SELECT COUNT(*) c FROM patients'))[0].c;
    const ids = [];
    let skipped = 0;

    for (const p of patients) {
      const name = String(p?.name ?? '').trim();
      if (!name) { skipped++; continue; }
      const startDate = p.start_date || p.todayIso || nowIso().slice(0, 10);
      await x.run(
        `INSERT INTO patients (uuid,name,mother_name,phone,diagnosis,referral,notes,start_date,end_date,next_appt,status,planned_sessions,residence,birth_date,appt_remind_min,photo,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.uuid || crypto.randomUUID(), name, p.mother_name || '', p.phone || '', p.diagnosis || '', p.referral || '', p.notes || '',
         startDate, null, p.next_appt || null, 'active',
         (p.planned_sessions == null || p.planned_sessions === '') ? null : Number(p.planned_sessions),
         p.residence || '', p.birth_date || null,
         (p.appt_remind_min == null || p.appt_remind_min === '') ? null : Number(p.appt_remind_min),
         p.photo ?? null,
         nowIso(), nowIso()]
      );
      ids.push(await lastId(x));
    }

    // Read-back verify: the committed row-count delta must equal what we counted
    // as added. Cheap at batch sizes of ~20-100, and a mismatch (a silently
    // ignored INSERT, a constraint quietly dropping a row) throws here so the
    // transaction rolls back rather than reporting a success the DB never made.
    const after = (await x.query('SELECT COUNT(*) c FROM patients'))[0].c;
    if (after - before !== ids.length) {
      throw new Error('Toplu hasta ekleme doğrulanamadı (read-back): eklenen sayısı tutarsız.');
    }
    return { added: ids.length, ids, skipped };
  });
}

export async function updatePatient(x, id, p) {
  assertPatientInput(p);
  return withTx(x, async () => {
    const cur = await x.query('SELECT id FROM patients WHERE id=?', [id]);
    if (!cur.length) throw new Error('Hasta bulunamadı.');
    await x.run(
      `UPDATE patients SET name=?,mother_name=?,phone=?,diagnosis=?,referral=?,notes=?,start_date=?,next_appt=?,planned_sessions=?,residence=?,birth_date=?,appt_remind_min=?,photo=?,updated_at=? WHERE id=?`,
      [p.name.trim(), p.mother_name || '', p.phone || '', p.diagnosis || '', p.referral || '', p.notes || '',
       p.start_date, p.next_appt || null,
       (p.planned_sessions == null || p.planned_sessions === '') ? null : Number(p.planned_sessions),
       p.residence || '', p.birth_date || null,
       (p.appt_remind_min == null || p.appt_remind_min === '') ? null : Number(p.appt_remind_min),
       p.photo ?? null,
       nowIso(), id]
    );
    const back = await x.query('SELECT * FROM patients WHERE id=?', [id]);
    if (!back.length || back[0].name !== p.name.trim()) throw new Error('Güncelleme doğrulanamadı (read-back).');
  });
}

// setPatientPhoto(x, id, photo): store a base64 data-URL string (or null to
// remove). The UI resizes/compresses before calling; we store the string
// as-is. Read-back verify confirms the write landed (photo may legitimately be
// null, so the verification compares the stored value to what we asked for).
export async function setPatientPhoto(x, id, photo) {
  const value = photo ?? null;
  return withTx(x, async () => {
    const cur = await x.query('SELECT id FROM patients WHERE id=?', [id]);
    if (!cur.length) throw new Error('Hasta bulunamadı.');
    await x.run('UPDATE patients SET photo=?, updated_at=? WHERE id=?', [value, nowIso(), id]);
    const back = await x.query('SELECT photo FROM patients WHERE id=?', [id]);
    if (!back.length || (back[0].photo ?? null) !== value) throw new Error('Fotoğraf güncelleme doğrulanamadı (read-back).');
  });
}

export async function completeTreatment(x, id, endDate) {
  if (!DATE_RE.test(endDate)) throw new Error('Bitiş tarihi geçersiz.');
  return withTx(x, async () => {
    const cur = await x.query('SELECT start_date FROM patients WHERE id=?', [id]);
    if (!cur.length) throw new Error('Hasta bulunamadı.');
    if (endDate < cur[0].start_date) throw new Error('Bitiş tarihi başlangıçtan önce olamaz.');
    await x.run(`UPDATE patients SET end_date=?, status='done', next_appt=NULL, updated_at=? WHERE id=?`, [endDate, nowIso(), id]);
    const back = await x.query('SELECT status,end_date FROM patients WHERE id=?', [id]);
    if (!back.length || back[0].status !== 'done') throw new Error('Tamamlama doğrulanamadı (read-back).');
  });
}

const STATUSES = new Set(['active', 'done', 'blocked']);
export async function setStatus(x, id, status) {
  if (!STATUSES.has(status)) throw new Error('Geçersiz durum.');
  return withTx(x, async () => {
    const cur = await x.query('SELECT id FROM patients WHERE id=?', [id]);
    if (!cur.length) throw new Error('Hasta bulunamadı.');
    if (status === 'active' || status === 'blocked') {
      await x.run(`UPDATE patients SET status=?, end_date=NULL, updated_at=? WHERE id=?`, [status, nowIso(), id]);
    } else {
      await x.run(`UPDATE patients SET status=?, updated_at=? WHERE id=?`, [status, nowIso(), id]);
    }
    const back = await x.query('SELECT status FROM patients WHERE id=?', [id]);
    if (!back.length || back[0].status !== status) throw new Error('Durum güncelleme doğrulanamadı.');
  });
}

// Deleting a nonexistent id is intentionally a no-op (idempotent delete):
// a UI double-tap on "Sil" must not surface an error on the second tap.
export async function deletePatient(x, id) {
  return withTx(x, async () => {
    const pu = (await x.query('SELECT uuid FROM patients WHERE id=?', [id]))[0]?.uuid;
    const payU = (await x.query('SELECT uuid FROM payments WHERE patient_id=?', [id])).map(r => r.uuid);
    const delU = (await x.query('SELECT uuid FROM deliveries WHERE patient_id=?', [id])).map(r => r.uuid);
    await x.run('DELETE FROM payments WHERE patient_id=?', [id]);
    await x.run('DELETE FROM deliveries WHERE patient_id=?', [id]);
    await x.run('DELETE FROM patients WHERE id=?', [id]);
    const back = await x.query('SELECT id FROM patients WHERE id=?', [id]);
    if (back.length) throw new Error('Silme doğrulanamadı.');
    for (const u of payU) await tombstone(x, u, 'payment');
    for (const u of delU) await tombstone(x, u, 'delivery');
    await tombstone(x, pu, 'patient');
  });
}

export async function listPatients(x) {
  const patients = await x.query('SELECT * FROM patients ORDER BY name COLLATE NOCASE');
  const payments = await x.query('SELECT patient_id, amount, status FROM payments');
  const grouped = {};
  for (const o of payments) (grouped[o.patient_id] ??= []).push(o);
  return patients.map(p => ({ ...p, total: sumByStatus(grouped[p.id] || [], 'paid') }));
}

export async function getPatient(x, id) {
  const rows = await x.query('SELECT * FROM patients WHERE id=?', [id]);
  if (!rows.length) throw new Error('Hasta bulunamadı.');
  const payments = await x.query('SELECT * FROM payments WHERE patient_id=? ORDER BY pay_date DESC, id DESC', [id]);
  const deliveries = await x.query('SELECT * FROM deliveries WHERE patient_id=? ORDER BY COALESCE(delivered_date, planned_date) DESC, id DESC', [id]);
  const paidTotal = sumByStatus(payments, 'paid');
  const pendingTotal = sumByStatus(payments, 'pending');
  return { patient: rows[0], payments, total: paidTotal, paidTotal, pendingTotal, deliveries, sessionCount: payments.length };
}

const PAY_STATUS = new Set(['paid', 'pending']);

function assertPaymentInput(o) {
  if (!DATE_RE.test(String(o.pay_date || ''))) throw new Error('Ödeme tarihi geçersiz.');
  const n = Number(o.amount);
  if (!Number.isFinite(n) || !(n > 0)) throw new Error('Tutar 0’dan büyük olmalı.');
  if (Math.round(n * 100) / 100 !== n) throw new Error('Tutar en fazla 2 ondalık basamak olabilir.');
  if (o.status != null && !PAY_STATUS.has(o.status)) throw new Error('Ödeme durumu geçersiz (paid/pending).');
}

export async function addPayment(x, o) {
  assertPaymentInput(o);
  return withTx(x, async () => {
    const parent = await x.query('SELECT id FROM patients WHERE id=?', [o.patient_id]);
    if (!parent.length) throw new Error('Hasta bulunamadı.');
    await x.run(
      `INSERT INTO payments (uuid,patient_id,pay_date,amount,description,status,receipt,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
      [o.uuid || crypto.randomUUID(), o.patient_id, o.pay_date, Number(o.amount), o.description || 'Seans', o.status || 'paid', o.receipt ?? null, nowIso(), nowIso()]
    );
    const id = await lastId(x);
    const back = await x.query('SELECT * FROM payments WHERE id=?', [id]);
    if (!back.length || back[0].amount !== Number(o.amount)) throw new Error('Ödeme doğrulanamadı (read-back).');
    return id;
  });
}

export async function updatePayment(x, id, o) {
  assertPaymentInput(o);
  return withTx(x, async () => {
    const cur = await x.query('SELECT id FROM payments WHERE id=?', [id]);
    if (!cur.length) throw new Error('Ödeme bulunamadı.');
    // receipt is written unconditionally: the payment sheet preloads the
    // existing dekont into `o`, so an untouched sheet round-trips the same
    // value and an explicit null means the doctor removed it.
    await x.run(`UPDATE payments SET pay_date=?, amount=?, description=?, status=?, receipt=?, updated_at=? WHERE id=?`,
      [o.pay_date, Number(o.amount), o.description || 'Seans', o.status || 'paid', o.receipt ?? null, nowIso(), id]);
    const back = await x.query('SELECT amount FROM payments WHERE id=?', [id]);
    if (!back.length || back[0].amount !== Number(o.amount)) throw new Error('Ödeme güncelleme doğrulanamadı.');
  });
}

// setPaymentReceipt(x, id, receipt): attach/replace/remove a payment's dekont
// without touching its money. `receipt` is a base64 data-URL string (image or
// PDF — the UI resizes images and rejects oversized PDFs before calling), or
// null/undefined to remove. Mirrors setPatientPhoto: read-back verify compares
// the stored value to what we asked for, since null is a legitimate value.
export async function setPaymentReceipt(x, id, receipt) {
  const value = receipt ?? null;
  return withTx(x, async () => {
    const cur = await x.query('SELECT id FROM payments WHERE id=?', [id]);
    if (!cur.length) throw new Error('Ödeme bulunamadı.');
    await x.run('UPDATE payments SET receipt=?, updated_at=? WHERE id=?', [value, nowIso(), id]);
    const back = await x.query('SELECT receipt FROM payments WHERE id=?', [id]);
    if (!back.length || (back[0].receipt ?? null) !== value) throw new Error('Dekont güncelleme doğrulanamadı (read-back).');
  });
}

// Idempotent like deletePatient: deleting a nonexistent id is intentional
// double-tap safety, not an error.
export async function deletePayment(x, id) {
  return withTx(x, async () => {
    const u = (await x.query('SELECT uuid FROM payments WHERE id=?', [id]))[0]?.uuid;
    await x.run('DELETE FROM payments WHERE id=?', [id]);
    const back = await x.query('SELECT id FROM payments WHERE id=?', [id]);
    if (back.length) throw new Error('Ödeme silme doğrulanamadı.');
    await tombstone(x, u, 'payment');
  });
}

const METHODS = new Set(['elden', 'kargo']);
function assertDeliveryInput(o) {
  if (!METHODS.has(o.method)) throw new Error('Teslim yöntemi geçersiz (elden/kargo).');
  if (o.planned_date != null && o.planned_date !== '' && !DATE_RE.test(String(o.planned_date))) throw new Error('Planlanan teslim tarihi geçersiz.');
  if (Number(o.delivered) === 1 && !DATE_RE.test(String(o.delivered_date || ''))) throw new Error('Teslim edildi işaretliyse teslim tarihi zorunlu.');
  if (o.planned_time != null && o.planned_time !== '' && !TIME_RE.test(String(o.planned_time))) throw new Error('Teslim saati geçersiz.');
}

export async function addDelivery(x, o) {
  assertDeliveryInput(o);
  return withTx(x, async () => {
    const parent = await x.query('SELECT id FROM patients WHERE id=?', [o.patient_id]);
    if (!parent.length) throw new Error('Hasta bulunamadı.');
    await x.run(
      `INSERT INTO deliveries (uuid,patient_id,method,tracking_no,planned_date,delivered,delivered_date,planned_time,remind_min,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [o.uuid || crypto.randomUUID(), o.patient_id, o.method, o.tracking_no || '', o.planned_date || null,
       Number(o.delivered) === 1 ? 1 : 0, Number(o.delivered) === 1 ? o.delivered_date : null,
       o.planned_time || null, (o.remind_min == null || o.remind_min === '') ? null : Number(o.remind_min),
       nowIso(), nowIso()]
    );
    const id = await lastId(x);
    const back = await x.query('SELECT * FROM deliveries WHERE id=?', [id]);
    if (!back.length || back[0].method !== o.method) throw new Error('Teslimat doğrulanamadı (read-back).');
    return id;
  });
}

export async function updateDelivery(x, id, o) {
  assertDeliveryInput(o);
  return withTx(x, async () => {
    const cur = await x.query('SELECT id FROM deliveries WHERE id=?', [id]);
    if (!cur.length) throw new Error('Teslimat bulunamadı.');
    await x.run(
      `UPDATE deliveries SET method=?,tracking_no=?,planned_date=?,delivered=?,delivered_date=?,planned_time=?,remind_min=?,updated_at=? WHERE id=?`,
      [o.method, o.tracking_no || '', o.planned_date || null,
       Number(o.delivered) === 1 ? 1 : 0, Number(o.delivered) === 1 ? o.delivered_date : null,
       o.planned_time || null, (o.remind_min == null || o.remind_min === '') ? null : Number(o.remind_min),
       nowIso(), id]
    );
    const back = await x.query('SELECT method FROM deliveries WHERE id=?', [id]);
    if (!back.length || back[0].method !== o.method) throw new Error('Teslimat güncelleme doğrulanamadı.');
  });
}

// Idempotent like deletePayment/deletePatient: deleting a nonexistent id is
// intentional double-tap safety, not an error.
export async function deleteDelivery(x, id) {
  return withTx(x, async () => {
    const u = (await x.query('SELECT uuid FROM deliveries WHERE id=?', [id]))[0]?.uuid;
    await x.run('DELETE FROM deliveries WHERE id=?', [id]);
    const back = await x.query('SELECT id FROM deliveries WHERE id=?', [id]);
    if (back.length) throw new Error('Teslimat silme doğrulanamadı.');
    await tombstone(x, u, 'delivery');
  });
}

export async function listDeliveries(x) {
  return x.query('SELECT * FROM deliveries ORDER BY id');
}

export async function allData(x) {
  return {
    patients: await x.query('SELECT * FROM patients ORDER BY id'),
    payments: await x.query('SELECT * FROM payments ORDER BY id'),
    deliveries: await x.query('SELECT * FROM deliveries ORDER BY id'),
    deletions: await getDeletions(x),
  };
}

export async function restoreAll(x, data) {
  const deliveries = data.deliveries || [];
  return withTx(x, async () => {
    await x.run('DELETE FROM deliveries');
    await x.run('DELETE FROM payments');
    await x.run('DELETE FROM patients');
    for (const p of data.patients) {
      await x.run(
        `INSERT INTO patients (id,uuid,name,mother_name,phone,diagnosis,referral,notes,start_date,end_date,next_appt,status,planned_sessions,residence,birth_date,appt_remind_min,photo,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.id, p.uuid || crypto.randomUUID(), p.name, p.mother_name || '', p.phone || '', p.diagnosis || '', p.referral || '', p.notes || '',
         p.start_date, p.end_date || null, p.next_appt || null, p.status || 'active',
         (p.planned_sessions == null || p.planned_sessions === '') ? null : Number(p.planned_sessions),
         p.residence || '', p.birth_date || null,
         (p.appt_remind_min == null || p.appt_remind_min === '') ? null : Number(p.appt_remind_min),
         p.photo ?? null,
         p.created_at || nowIso(), p.updated_at || nowIso()]
      );
    }
    for (const o of data.payments) {
      // Defense-in-depth: parseBackup already validates amounts strictly, but
      // restoreAll must not trust its caller for money-critical data.
      const n = Number(o.amount);
      if (!Number.isFinite(n) || !(n > 0)) throw new Error('Geri yükleme: geçersiz ödeme tutarı.');
      await x.run(
        `INSERT INTO payments (id,uuid,patient_id,pay_date,amount,description,status,receipt,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        // `|| nowIso()` fallbacks only fire for hand-built data — the
        // parseBackup-gated pipeline always carries timestamps. `receipt ?? null`
        // keeps a restored dekont, and defaults pre-v7 rows (no key) to NULL.
        [o.id, o.uuid || crypto.randomUUID(), o.patient_id, o.pay_date, n, o.description || 'Seans', PAY_STATUS.has(o.status) ? o.status : 'paid', o.receipt ?? null, o.created_at || nowIso(), o.updated_at || nowIso()]
      );
    }
    for (const d of deliveries) {
      // Defense-in-depth: same rationale as the payment amount check above.
      if (!METHODS.has(d.method)) throw new Error('Geri yükleme: geçersiz teslim yöntemi.');
      await x.run(
        `INSERT INTO deliveries (id,uuid,patient_id,method,tracking_no,planned_date,delivered,delivered_date,planned_time,remind_min,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.id, d.uuid || crypto.randomUUID(), d.patient_id, d.method, d.tracking_no || '', d.planned_date || null,
         Number(d.delivered) === 1 ? 1 : 0, d.delivered_date || null,
         d.planned_time || null, (d.remind_min == null || d.remind_min === '') ? null : Number(d.remind_min),
         d.created_at || nowIso(), d.updated_at || nowIso()]
      );
    }
    if (Array.isArray(data.deletions)) {
      for (const del of data.deletions) {
        await x.run('INSERT OR REPLACE INTO deletions (uuid, entity, deleted_at) VALUES (?,?,?)', [del.uuid, del.entity, del.deleted_at]);
      }
    }
    const pc = (await x.query('SELECT COUNT(*) c FROM patients'))[0].c;
    const oc = (await x.query('SELECT COUNT(*) c FROM payments'))[0].c;
    const dc = (await x.query('SELECT COUNT(*) c FROM deliveries'))[0].c;
    if (pc !== data.patients.length || oc !== data.payments.length || dc !== deliveries.length) throw new Error('Geri yükleme sayım doğrulaması başarısız.');
    return { patients: pc, payments: oc, deliveries: dc };
  });
}

export async function mergeImport(x, payload) {
  const existing = await x.query('SELECT id, name, mother_name FROM patients');
  const { toAdd, added, skipped } = mergePatients(existing, payload);
  await withTx(x, async () => {
    for (const p of toAdd.patients) {
      if (!p.name || !String(p.name).trim()) throw new Error('İçe aktarma: hasta adı boş.');
      if (!DATE_RE.test(String(p.start_date || ''))) throw new Error('İçe aktarma: geçersiz başlangıç tarihi.');
      await x.run(
        `INSERT INTO patients (uuid,name,mother_name,phone,diagnosis,referral,notes,start_date,end_date,next_appt,status,planned_sessions,residence,birth_date,appt_remind_min,photo,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [p.uuid || crypto.randomUUID(), p.name, p.mother_name || '', p.phone || '', p.diagnosis || '', p.referral || '', p.notes || '',
         p.start_date, p.end_date || null, p.next_appt || null, p.status || 'active',
         (p.planned_sessions == null || p.planned_sessions === '') ? null : Number(p.planned_sessions),
         p.residence || '', p.birth_date || null,
         (p.appt_remind_min == null || p.appt_remind_min === '') ? null : Number(p.appt_remind_min),
         p.photo ?? null,
         p.created_at || nowIso(), p.updated_at || nowIso()]
      );
      const newId = await lastId(x);
      for (const o of toAdd.payments.filter(o => o.patient_id === p.id)) {
        const n = Number(o.amount);
        if (!Number.isFinite(n) || !(n > 0)) throw new Error('İçe aktarma: geçersiz ödeme tutarı.');
        // Validate status rather than silently coercing a bad value to 'paid' —
        // a mistyped status must never turn a pending payment into "collected".
        const st = o.status == null ? 'paid' : o.status;
        if (!PAY_STATUS.has(st)) throw new Error('İçe aktarma: geçersiz ödeme durumu.');
        await x.run(
          `INSERT INTO payments (uuid,patient_id,pay_date,amount,description,status,receipt,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          [o.uuid || crypto.randomUUID(), newId, o.pay_date, n, o.description || 'Seans', st, o.receipt ?? null, o.created_at || nowIso(), o.updated_at || nowIso()]
        );
      }
      for (const d of toAdd.deliveries.filter(d => d.patient_id === p.id)) {
        if (!['elden', 'kargo'].includes(d.method)) throw new Error('İçe aktarma: geçersiz teslim yöntemi.');
        await x.run(
          `INSERT INTO deliveries (uuid,patient_id,method,tracking_no,planned_date,delivered,delivered_date,planned_time,remind_min,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [d.uuid || crypto.randomUUID(), newId, d.method, d.tracking_no || '', d.planned_date || null,
           Number(d.delivered) === 1 ? 1 : 0, d.delivered_date || null,
           d.planned_time || null, (d.remind_min == null || d.remind_min === '') ? null : Number(d.remind_min),
           d.created_at || nowIso(), d.updated_at || nowIso()]
        );
      }
    }
  });
  return { added, skipped };
}

export async function getDeletions(x) { return x.query('SELECT * FROM deletions'); }
export async function buildSyncState(x) {
  const patients = await x.query('SELECT * FROM patients');
  const payments = await x.query('SELECT * FROM payments');
  const deliveries = await x.query('SELECT * FROM deliveries');
  const uuidById = Object.fromEntries(patients.map(p => [p.id, p.uuid]));
  return {
    patients,
    payments: payments.map(o => ({ ...o, patient_uuid: uuidById[o.patient_id] })),
    deliveries: deliveries.map(d => ({ ...d, patient_uuid: uuidById[d.patient_id] })),
    deletions: await getDeletions(x),
  };
}

// applyMergedState writes a merged sync state (see sync-merge.js) into the
// local DB in one transaction. Upsert-by-uuid, newer-updated_at-wins; a local
// row strictly newer than the incoming one is left untouched (never
// clobbered). Upserts are applied before tombstones so that if a uuid
// somehow appears in both merged.patients/payments/deliveries and
// merged.deletions, the tombstone wins (defensive — the merge engine should
// already guarantee this doesn't happen). Money is validated through the
// same assert* gates as manual entry: a bad amount throws and rolls back the
// whole apply rather than silently writing corrupt financial data.
function newer(incomingUpdatedAt, localUpdatedAt) {
  // Missing local updated_at (shouldn't happen — column is NOT NULL — but
  // treat defensively as "adopt remote" rather than risk a stuck record).
  return String(incomingUpdatedAt || '') > String(localUpdatedAt || '');
}

export async function applyMergedState(x, merged) {
  const patients = merged.patients || [];
  const payments = merged.payments || [];
  const deliveries = merged.deliveries || [];
  const deletions = merged.deletions || [];

  return withTx(x, async () => {
    let patientsUpserted = 0, paymentsUpserted = 0, deliveriesUpserted = 0, deleted = 0;

    for (const p of patients) {
      if (!p.uuid) continue; // no sync identity — can't upsert safely, skip
      const cur = (await x.query('SELECT updated_at FROM patients WHERE uuid=?', [p.uuid]))[0];
      if (cur && !newer(p.updated_at, cur.updated_at)) continue; // local wins
      assertPatientInput(p);
      if (!cur) {
        await x.run(
          `INSERT INTO patients (uuid,name,mother_name,phone,diagnosis,referral,notes,start_date,end_date,next_appt,status,planned_sessions,residence,birth_date,appt_remind_min,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [p.uuid, p.name.trim(), p.mother_name || '', p.phone || '', p.diagnosis || '', p.referral || '', p.notes || '',
           p.start_date, p.end_date || null, p.next_appt || null, p.status || 'active',
           (p.planned_sessions == null || p.planned_sessions === '') ? null : Number(p.planned_sessions),
           p.residence || '', p.birth_date || null,
           (p.appt_remind_min == null || p.appt_remind_min === '') ? null : Number(p.appt_remind_min),
           p.created_at || nowIso(), p.updated_at || nowIso()]
        );
      } else {
        await x.run(
          `UPDATE patients SET name=?,mother_name=?,phone=?,diagnosis=?,referral=?,notes=?,start_date=?,end_date=?,next_appt=?,status=?,planned_sessions=?,residence=?,birth_date=?,appt_remind_min=?,updated_at=? WHERE uuid=?`,
          [p.name.trim(), p.mother_name || '', p.phone || '', p.diagnosis || '', p.referral || '', p.notes || '',
           p.start_date, p.end_date || null, p.next_appt || null, p.status || 'active',
           (p.planned_sessions == null || p.planned_sessions === '') ? null : Number(p.planned_sessions),
           p.residence || '', p.birth_date || null,
           (p.appt_remind_min == null || p.appt_remind_min === '') ? null : Number(p.appt_remind_min),
           p.updated_at, p.uuid]
        );
      }
      const back = await x.query('SELECT * FROM patients WHERE uuid=?', [p.uuid]);
      if (!back.length || back[0].name !== p.name.trim()) throw new Error('Senkronizasyon: hasta yazılamadı (read-back).');
      patientsUpserted++;
    }

    // patient_uuid -> local id map, built AFTER the patient upsert loop so it
    // reflects patients that just arrived in this same merge.
    const patRows = await x.query('SELECT id, uuid FROM patients');
    const idByUuid = Object.fromEntries(patRows.map(r => [r.uuid, r.id]));

    for (const o of payments) {
      if (!o.uuid) continue;
      const patId = idByUuid[o.patient_uuid];
      if (!patId) continue; // parent not present locally (and not in this merge) — can't FK it, skip
      const cur = (await x.query('SELECT updated_at FROM payments WHERE uuid=?', [o.uuid]))[0];
      if (cur && !newer(o.updated_at, cur.updated_at)) continue; // local wins
      assertPaymentInput(o); // audit safety: never silently write bad money
      if (!cur) {
        await x.run(
          `INSERT INTO payments (uuid,patient_id,pay_date,amount,description,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
          [o.uuid, patId, o.pay_date, Number(o.amount), o.description || 'Seans', o.status || 'paid', o.created_at || nowIso(), o.updated_at || nowIso()]
        );
      } else {
        await x.run(
          `UPDATE payments SET patient_id=?, pay_date=?, amount=?, description=?, status=?, updated_at=? WHERE uuid=?`,
          [patId, o.pay_date, Number(o.amount), o.description || 'Seans', o.status || 'paid', o.updated_at, o.uuid]
        );
      }
      const back = await x.query('SELECT * FROM payments WHERE uuid=?', [o.uuid]);
      if (!back.length || back[0].amount !== Number(o.amount)) throw new Error('Senkronizasyon: ödeme yazılamadı (read-back).');
      paymentsUpserted++;
    }

    for (const d of deliveries) {
      if (!d.uuid) continue;
      const patId = idByUuid[d.patient_uuid];
      if (!patId) continue; // parent not present locally — can't FK it, skip
      const cur = (await x.query('SELECT updated_at FROM deliveries WHERE uuid=?', [d.uuid]))[0];
      if (cur && !newer(d.updated_at, cur.updated_at)) continue; // local wins
      assertDeliveryInput(d);
      if (!cur) {
        await x.run(
          `INSERT INTO deliveries (uuid,patient_id,method,tracking_no,planned_date,delivered,delivered_date,planned_time,remind_min,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [d.uuid, patId, d.method, d.tracking_no || '', d.planned_date || null,
           Number(d.delivered) === 1 ? 1 : 0, Number(d.delivered) === 1 ? d.delivered_date : null,
           d.planned_time || null, (d.remind_min == null || d.remind_min === '') ? null : Number(d.remind_min),
           d.created_at || nowIso(), d.updated_at || nowIso()]
        );
      } else {
        await x.run(
          `UPDATE deliveries SET patient_id=?,method=?,tracking_no=?,planned_date=?,delivered=?,delivered_date=?,planned_time=?,remind_min=?,updated_at=? WHERE uuid=?`,
          [patId, d.method, d.tracking_no || '', d.planned_date || null,
           Number(d.delivered) === 1 ? 1 : 0, Number(d.delivered) === 1 ? d.delivered_date : null,
           d.planned_time || null, (d.remind_min == null || d.remind_min === '') ? null : Number(d.remind_min),
           d.updated_at, d.uuid]
        );
      }
      const back = await x.query('SELECT * FROM deliveries WHERE uuid=?', [d.uuid]);
      if (!back.length || back[0].method !== d.method) throw new Error('Senkronizasyon: teslimat yazılamadı (read-back).');
      deliveriesUpserted++;
    }

    // Tombstones applied last (after upserts), and are idempotent: a missing
    // local row is a no-op, not an error — the record may already be gone
    // (this same delete synced earlier) or never existed locally.
    for (const del of deletions) {
      if (!del.uuid || !del.entity) continue;
      if (del.entity === 'patient') {
        const row = (await x.query('SELECT id FROM patients WHERE uuid=?', [del.uuid]))[0];
        if (!row) continue;
        // Delete children by patient_id first to avoid orphan FK rows — the
        // merged state's own payments/deliveries lists only carry survivors,
        // so this tombstone is the sole place that removes a dead patient's
        // remaining local children.
        await x.run('DELETE FROM payments WHERE patient_id=?', [row.id]);
        await x.run('DELETE FROM deliveries WHERE patient_id=?', [row.id]);
        await x.run('DELETE FROM patients WHERE id=?', [row.id]);
        const back = await x.query('SELECT id FROM patients WHERE id=?', [row.id]);
        if (back.length) throw new Error('Senkronizasyon: silme doğrulanamadı (hasta).');
        deleted++;
      } else if (del.entity === 'payment') {
        const r = await x.run('DELETE FROM payments WHERE uuid=?', [del.uuid]);
        deleted += r.changes || 0;
      } else if (del.entity === 'delivery') {
        const r = await x.run('DELETE FROM deliveries WHERE uuid=?', [del.uuid]);
        deleted += r.changes || 0;
      }
    }

    return { patientsUpserted, paymentsUpserted, deliveriesUpserted, deleted };
  });
}

// ---------------------------------------------------------------------------
// Bulk data-layer ops (F4b/F1/F4d): built for a ~77k-row HTS import on a phone.
// ---------------------------------------------------------------------------

// Multi-row INSERT OR IGNORE: one native call per chunk instead of one per row,
// cutting the JS<->sql bridge crossings ~50-100x. OR IGNORE + the UNIQUE partial
// uuid index give idempotency: a re-import of the same uuids inserts nothing.
async function chunkInsertIgnore(x, table, cols, rows) {
  if (!rows.length) return;
  const rowPh = `(${cols.map(() => '?').join(',')})`;
  const placeholders = rows.map(() => rowPh).join(',');
  const flat = [];
  for (const r of rows) for (const v of r) flat.push(v);
  await x.run(`INSERT OR IGNORE INTO ${table} (${cols.join(',')}) VALUES ${placeholders}`, flat);
}

// bulkImport(x, { patients, payments, deliveries }, onProgress)
//   -> { patientsAdded, paymentsAdded, deliveriesAdded, skipped }
// Idempotent (INSERT OR IGNORE keyed by uuid). Added counts come from COUNT(*)
// deltas per phase, so ignored duplicates are naturally excluded. Patients are
// inserted first (each chunk its own small tx so a 77k import is many short
// transactions, not one giant one); then a single uuid->id map resolves the
// children's patient_uuid. A child whose parent is missing, or a payment whose
// amount is not a finite integer > 0, is skipped and counted (never throws the
// whole import, never writes fractional/negative money).
// residence / birth_date / notes toplu içe aktarmada UZUN SÜRE eksikti: HTS
// Excel'inde "İKAMET", "DOĞUM TARİHİ" ve yaş bilgisi dolu olduğu hâlde bu üç
// sütun yazılmadığı için sessizce kayboluyordu.
const PAT_COLS = ['uuid', 'name', 'mother_name', 'diagnosis', 'phone', 'residence', 'birth_date', 'notes', 'start_date', 'status', 'photo', 'created_at', 'updated_at'];
const PAY_COLS = ['uuid', 'patient_id', 'pay_date', 'amount', 'description', 'status', 'receipt', 'created_at', 'updated_at'];
const DEL_COLS = ['uuid', 'patient_id', 'method', 'tracking_no', 'planned_date', 'delivered', 'delivered_date', 'planned_time', 'remind_min', 'created_at', 'updated_at'];

export async function bulkImport(x, { patients = [], payments = [], deliveries = [] } = {}, onProgress) {
  const total = patients.length + payments.length + deliveries.length;
  let done = 0;
  let skipped = 0;
  const progress = () => { if (onProgress) onProgress({ done, total }); };
  // Chunk so bound params stay <= 900 (SQLite's default SQLITE_MAX_VARIABLE_NUMBER
  // headroom): chunkRows = floor(900 / colCount).
  const patChunk = Math.floor(900 / PAT_COLS.length); // 100
  const payChunk = Math.floor(900 / PAY_COLS.length); // 112
  const delChunk = Math.floor(900 / DEL_COLS.length); // 81

  // ---- patients ----
  const patOld = (await x.query('SELECT COUNT(*) c FROM patients'))[0].c;
  for (let i = 0; i < patients.length; i += patChunk) {
    const slice = patients.slice(i, i + patChunk);
    const rows = slice.map(p => {
      const ts = nowIso();
      // HTS/Excel-imported patients carry no photo (NULL); keep any that a
      // caller happens to supply.
      return [p.uuid, p.name, p.mother_name || '', p.diagnosis || '', p.phone || '',
        p.residence || '', p.birth_date ?? null, p.notes || '',
        p.start_date, 'active', p.photo ?? null, ts, ts];
    });
    await withTx(x, () => chunkInsertIgnore(x, 'patients', PAT_COLS, rows));
    done += slice.length;
    progress();
  }
  const patNew = (await x.query('SELECT COUNT(*) c FROM patients'))[0].c;
  const patientsAdded = patNew - patOld;
  if (patientsAdded < 0 || patientsAdded > patients.length) throw new Error('Toplu içe aktarma: hasta sayımı tutarsız.');

  // patient uuid -> local id, built once after the whole patient phase.
  const patRows = await x.query('SELECT id, uuid FROM patients');
  const uuidToId = new Map(patRows.map(r => [r.uuid, r.id]));

  // ---- payments ----
  const payOld = (await x.query('SELECT COUNT(*) c FROM payments'))[0].c;
  for (let i = 0; i < payments.length; i += payChunk) {
    const slice = payments.slice(i, i + payChunk);
    const rows = [];
    for (const o of slice) {
      const pid = uuidToId.get(o.patient_uuid);
      const amt = o.amount;
      if (!pid || !Number.isInteger(amt) || !(amt > 0)) { skipped++; continue; }
      const ts = nowIso();
      // HTS/Excel-imported payments carry no dekont (NULL); keep any a caller supplies.
      rows.push([o.uuid, pid, o.pay_date, amt, o.description || 'Seans', o.status || 'paid', o.receipt ?? null, ts, ts]);
    }
    if (rows.length) await withTx(x, () => chunkInsertIgnore(x, 'payments', PAY_COLS, rows));
    done += slice.length;
    progress();
  }
  const payNew = (await x.query('SELECT COUNT(*) c FROM payments'))[0].c;
  const paymentsAdded = payNew - payOld;
  if (paymentsAdded < 0 || paymentsAdded > payments.length) throw new Error('Toplu içe aktarma: ödeme sayımı tutarsız.');

  // ---- deliveries ----
  const delOld = (await x.query('SELECT COUNT(*) c FROM deliveries'))[0].c;
  for (let i = 0; i < deliveries.length; i += delChunk) {
    const slice = deliveries.slice(i, i + delChunk);
    const rows = [];
    for (const d of slice) {
      const pid = uuidToId.get(d.patient_uuid);
      if (!pid || !METHODS.has(d.method)) { skipped++; continue; }
      const ts = nowIso();
      // HTS delivery 'description' maps to the schema's tracking_no column.
      rows.push([d.uuid, pid, d.method, d.description || '', d.planned_date || null, Number(d.delivered) === 1 ? 1 : 0, null, null, null, ts, ts]);
    }
    if (rows.length) await withTx(x, () => chunkInsertIgnore(x, 'deliveries', DEL_COLS, rows));
    done += slice.length;
    progress();
  }
  const delNew = (await x.query('SELECT COUNT(*) c FROM deliveries'))[0].c;
  const deliveriesAdded = delNew - delOld;
  if (deliveriesAdded < 0 || deliveriesAdded > deliveries.length) throw new Error('Toplu içe aktarma: teslimat sayımı tutarsız.');

  progress(); // guarantee a final { done: total, total } is emitted
  return { patientsAdded, paymentsAdded, deliveriesAdded, skipped };
}

// bulkDeletePatients(x, ids) -> { deleted }. One transaction. Per patient:
// gather child uuids, cascade-delete children then the patient, read-back verify,
// then write v5 tombstones (patient + each child). A missing id is skipped (no
// tombstone) so a re-delete is idempotent — mirrors deletePatient's double-tap
// safety but batched.
export async function bulkDeletePatients(x, ids = []) {
  return withTx(x, async () => {
    let deleted = 0;
    for (const id of ids) {
      const row = (await x.query('SELECT uuid FROM patients WHERE id=?', [id]))[0];
      if (!row) continue; // missing -> skip, no tombstone
      const pu = row.uuid;
      const payU = (await x.query('SELECT uuid FROM payments WHERE patient_id=?', [id])).map(r => r.uuid);
      const delU = (await x.query('SELECT uuid FROM deliveries WHERE patient_id=?', [id])).map(r => r.uuid);
      await x.run('DELETE FROM payments WHERE patient_id=?', [id]);
      await x.run('DELETE FROM deliveries WHERE patient_id=?', [id]);
      await x.run('DELETE FROM patients WHERE id=?', [id]);
      const back = await x.query('SELECT id FROM patients WHERE id=?', [id]);
      if (back.length) throw new Error('Toplu silme doğrulanamadı.');
      for (const u of payU) await tombstone(x, u, 'payment');
      for (const u of delU) await tombstone(x, u, 'delivery');
      await tombstone(x, pu, 'patient');
      deleted++;
    }
    return { deleted };
  });
}

// listPatientsPage(x, { limit, offset, search }) -> same row shape as
// listPatients (each row + computed paid `total`), but a single page. The paid
// total is computed only for the rows on this page (payments fetched by the page's
// patient ids), so a 77k-row DB never loads every payment to render one screen.
export async function listPatientsPage(x, { limit = 100, offset = 0, search = '' } = {}) {
  const like = `%${search}%`;
  // Telefon aramasında rakam dışı her şeyi atıyoruz (hem aranan metinden hem
  // kayıttaki numaradan): doktor "0534 017" yazsa da "05340174164" bulunsun.
  // Ad, anne adı, tanı ve telefon birlikte taranır.
  const digits = String(search).replace(/[^0-9]/g, '');
  const dlike = digits ? `%${digits}%` : 'x';
  const patients = await x.query(
    `SELECT * FROM patients
       WHERE ? = ''
          OR name LIKE ?
          OR IFNULL(mother_name,'') LIKE ?
          OR IFNULL(diagnosis,'') LIKE ?
          OR REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''),' ',''),'-',''),'(',''),')','') LIKE ?
       ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`,
    [search, like, like, like, dlike, limit, offset]
  );
  if (!patients.length) return [];
  const ids = patients.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const payments = await x.query(`SELECT patient_id, amount, status FROM payments WHERE patient_id IN (${placeholders})`, ids);
  const grouped = {};
  for (const o of payments) (grouped[o.patient_id] ??= []).push(o);
  return patients.map(p => ({ ...p, total: sumByStatus(grouped[p.id] || [], 'paid') }));
}

export async function countPatients(x, search = '') {
  const like = `%${search}%`;
  const digits = String(search).replace(/[^0-9]/g, '');
  const dlike = digits ? `%${digits}%` : 'x';
  const r = await x.query(
    `SELECT COUNT(*) c FROM patients
       WHERE ? = ''
          OR name LIKE ?
          OR IFNULL(mother_name,'') LIKE ?
          OR IFNULL(diagnosis,'') LIKE ?
          OR REPLACE(REPLACE(REPLACE(REPLACE(IFNULL(phone,''),' ',''),'-',''),'(',''),')','') LIKE ?`,
    [search, like, like, like, dlike]);
  return r[0].c;
}

export async function setApptCalId(x, id, calId) {
  return withTx(x, async () => { await x.run('UPDATE patients SET appt_cal_id=? WHERE id=?', [calId || null, id]); });
}
export async function setDeliveryCalId(x, id, calId) {
  return withTx(x, async () => { await x.run('UPDATE deliveries SET cal_id=? WHERE id=?', [calId || null, id]); });
}
