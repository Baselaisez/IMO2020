function checksum(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

export function makeBackup(patients, payments, exportedAtIso, deliveries = [], deletions = []) {
  const data = { patients, payments, deliveries, deletions };
  return {
    app: 'hastakayit',
    version: 7,
    exported_at: exportedAtIso,
    counts: { patients: patients.length, payments: payments.length, deliveries: deliveries.length },
    checksum: checksum(JSON.stringify(data)),
    data,
  };
}

const DELIVERY_METHODS = new Set(['elden', 'kargo']);
const PAYMENT_STATUSES = new Set(['paid', 'pending']);
const DELETION_ENTITIES = new Set(['patient', 'payment', 'delivery']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseBackup(jsonText) {
  let b;
  try { b = JSON.parse(jsonText); } catch { return { ok: false, error: 'Dosya okunamadı: geçerli JSON değil.' }; }
  if (!b || b.app !== 'hastakayit') return { ok: false, error: 'Bu bir Hasta Kayıt yedeği değil.' };
  if (![1, 2, 3, 4, 5, 6, 7].includes(b.version)) return { ok: false, error: `Desteklenmeyen yedek sürümü: ${b.version}` };
  const d = b.data;
  if (!d || !Array.isArray(d.patients) || !Array.isArray(d.payments)) return { ok: false, error: 'Yedek verisi eksik.' };
  const hasDeliveries = b.version >= 2;
  if (hasDeliveries && !Array.isArray(d.deliveries)) return { ok: false, error: 'Yedek verisi eksik.' };
  const deliveries = hasDeliveries ? d.deliveries : [];
  const hasDeletions = b.version >= 5;
  if (hasDeletions && !Array.isArray(d.deletions)) return { ok: false, error: 'Yedek verisi eksik.' };
  const deletions = hasDeletions ? d.deletions : [];
  if (
    d.patients.length !== b.counts?.patients ||
    d.payments.length !== b.counts?.payments ||
    (hasDeliveries && deliveries.length !== b.counts?.deliveries)
  )
    return { ok: false, error: 'Kayıt sayıları uyuşmuyor (yedek bozuk olabilir).' };
  if (checksum(JSON.stringify(d)) !== b.checksum)
    return { ok: false, error: 'Bütünlük kontrolü başarısız: yedek dosyası değiştirilmiş veya bozuk.' };
  for (const p of d.patients) {
    if (!p.name || !p.start_date) return { ok: false, error: 'Hasta kaydında zorunlu alan eksik.' };
    if (p.planned_sessions !== undefined && p.planned_sessions !== null && p.planned_sessions !== '') {
      if (!Number.isInteger(p.planned_sessions) || !(p.planned_sessions > 0))
        return { ok: false, error: 'Planlanan seans sayısı geçersiz.' };
    }
    // v4: birth_date must be a valid ISO date if present (else age/UI silently break).
    if (p.birth_date !== undefined && p.birth_date !== null && p.birth_date !== '' && !DATE_RE.test(String(p.birth_date)))
      return { ok: false, error: 'Doğum tarihi geçersiz.' };
    // v6: photo (a base64 data-URL) must be a string when present; null/undefined
    // mean "no photo" and are fine. A non-string would corrupt the <img> src.
    if (p.photo !== undefined && p.photo !== null && typeof p.photo !== 'string')
      return { ok: false, error: 'Fotoğraf verisi geçersiz.' };
  }
  for (const o of d.payments) {
    if (!o.patient_id || !o.pay_date) return { ok: false, error: 'Ödeme kaydında zorunlu alan eksik.' };
    if (typeof o.amount !== 'number' || !Number.isFinite(o.amount) || !(o.amount > 0))
      return { ok: false, error: 'Ödeme tutarı sayı olmalı.' };
    if (o.status !== undefined && !PAYMENT_STATUSES.has(o.status))
      return { ok: false, error: 'Ödeme durumu geçersiz.' };
    // v7: receipt (the dekont) is a base64 data-URL. null/undefined mean "no
    // dekont" and are fine; anything else must be a string that actually starts
    // with `data:` — a remote URL or a non-string would either break the
    // <img>/open path or silently point the doctor's records at something
    // outside the backup file.
    if (o.receipt !== undefined && o.receipt !== null &&
        (typeof o.receipt !== 'string' || !o.receipt.startsWith('data:')))
      return { ok: false, error: 'Dekont verisi geçersiz.' };
  }
  const patientIds = new Set();
  for (const p of d.patients) {
    if (!Number.isInteger(p.id) || patientIds.has(p.id))
      return { ok: false, error: 'Hasta kimlikleri geçersiz veya mükerrer.' };
    patientIds.add(p.id);
  }
  const paymentIds = new Set();
  for (const o of d.payments) {
    if (!Number.isInteger(o.id) || paymentIds.has(o.id))
      return { ok: false, error: 'Ödeme kimlikleri geçersiz veya mükerrer.' };
    paymentIds.add(o.id);
    if (!patientIds.has(o.patient_id))
      return { ok: false, error: 'Ödeme kaydı olmayan bir hastaya bağlı.' };
  }
  const deliveryIds = new Set();
  for (const dl of deliveries) {
    if (!Number.isInteger(dl.id) || deliveryIds.has(dl.id))
      return { ok: false, error: 'Teslimat kimlikleri geçersiz veya mükerrer.' };
    deliveryIds.add(dl.id);
    if (!DELIVERY_METHODS.has(dl.method))
      return { ok: false, error: 'Teslimat yöntemi geçersiz.' };
    if (!patientIds.has(dl.patient_id))
      return { ok: false, error: 'Teslimat kaydı olmayan bir hastaya bağlı.' };
    if (Number(dl.delivered) === 1 && !DATE_RE.test(dl.delivered_date || ''))
      return { ok: false, error: 'Teslim edilmiş kayıt için teslim tarihi eksik veya geçersiz.' };
    // v4: planned_time must be HH:MM if present (else the reminder silently never fires).
    if (dl.planned_time !== undefined && dl.planned_time !== null && dl.planned_time !== '' && !/^\d{2}:\d{2}$/.test(String(dl.planned_time)))
      return { ok: false, error: 'Teslim saati geçersiz.' };
  }
  // uuid is the sync identity; when present it must be unique per entity
  // (uuid is optional for v1-v4 backups, so we only enforce uniqueness among
  // records that actually carry one — never require it to be present).
  const patientUuids = new Set();
  for (const p of d.patients) {
    if (!p.uuid) continue;
    if (patientUuids.has(p.uuid)) return { ok: false, error: 'Hasta UUID değerleri mükerrer (yedek bozuk).' };
    patientUuids.add(p.uuid);
  }
  const paymentUuids = new Set();
  for (const o of d.payments) {
    if (!o.uuid) continue;
    if (paymentUuids.has(o.uuid)) return { ok: false, error: 'Ödeme UUID değerleri mükerrer (yedek bozuk).' };
    paymentUuids.add(o.uuid);
  }
  const deliveryUuids = new Set();
  for (const dl of deliveries) {
    if (!dl.uuid) continue;
    if (deliveryUuids.has(dl.uuid)) return { ok: false, error: 'Teslimat UUID değerleri mükerrer (yedek bozuk).' };
    deliveryUuids.add(dl.uuid);
  }
  if (hasDeletions) {
    for (const del of deletions) {
      if (typeof del?.uuid !== 'string' || !del.uuid)
        return { ok: false, error: 'Silme kaydında kimlik eksik.' };
      if (!DELETION_ENTITIES.has(del.entity))
        return { ok: false, error: 'Silme kaydı türü geçersiz.' };
      if (typeof del.deleted_at !== 'string' || !del.deleted_at)
        return { ok: false, error: 'Silme kaydında tarih eksik.' };
    }
  }
  const payments = d.payments.map((o) => ({ ...o, status: o.status === 'pending' ? 'pending' : 'paid' }));
  return { ok: true, data: { patients: d.patients, payments, deliveries, deletions }, exported_at: b.exported_at, counts: b.counts };
}
