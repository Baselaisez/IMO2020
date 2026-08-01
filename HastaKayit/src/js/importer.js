// Birleştirmeli içe aktarma (saf). Dedup anahtarı: Ad Soyad + Anne Adı.
export function normKey(name, motherName) {
  // Fold the whole I-family (dotted İ, dotless I/ı) to plain 'i' BEFORE lowercasing,
  // so a name typed with an ASCII I (common on non-Turkish keyboards / OCR / ALL-CAPS
  // Excel) dedups against the same name typed with Turkish İ. Prevents a re-import
  // creating a duplicate patient just because of I-casing variance.
  const n = s => String(s ?? '').trim().replace(/[İIıi]/g, 'i').toLocaleLowerCase('tr');
  return `${n(name)}|${n(motherName)}`;
}
export function mergePatients(existingPatients, incoming) {
  const have = new Set((existingPatients || []).map(p => normKey(p.name, p.mother_name)));
  const seen = new Set();
  const newPatients = [];
  const keepIds = new Set();
  for (const p of incoming.patients || []) {
    const k = normKey(p.name, p.mother_name);
    if (have.has(k) || seen.has(k)) continue;
    seen.add(k);
    newPatients.push(p);
    keepIds.add(p.id);
  }
  const payments = (incoming.payments || []).filter(o => keepIds.has(o.patient_id));
  const deliveries = (incoming.deliveries || []).filter(d => keepIds.has(d.patient_id));
  const skipped = (incoming.patients || []).length - newPatients.length;
  return { toAdd: { patients: newPatients, payments, deliveries }, added: newPatients.length, skipped };
}
