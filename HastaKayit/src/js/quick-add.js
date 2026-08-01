// quick-add.js — pure (DOM-free, DB-free) helpers behind the "⚡ Hızlı Ekle"
// walk-in entry sheet.
//
// The sheet's whole point is speed: name (+ optional fee, phone), Enter, next.
// The two things that must NOT be sloppy at that speed are money and duplicates,
// so both rules live here, unit-tested, instead of inline in the UI.

import { normKey } from './importer.js';

/**
 * nameKey(name) -> normalized duplicate key for a patient name.
 *
 * Reuses importer.normKey (the app's existing dedup convention: trim, fold the
 * whole I-family İ/I/ı/i to 'i', then tr-lowercase) with an EMPTY mother name,
 * because the quick sheet only asks for the name. Runs of whitespace are
 * collapsed first — "Ayşe  Yılmaz" typed in a hurry is the same person as
 * "Ayşe Yılmaz".
 */
export function nameKey(name) {
  return normKey(String(name ?? '').replace(/\s+/g, ' '), '');
}

/** buildNameIndex(patients) -> Set of normalized names (blank names ignored). */
export function buildNameIndex(patients) {
  const s = new Set();
  for (const p of patients || []) {
    const n = String(p?.name ?? '').trim();
    if (n) s.add(nameKey(n));
  }
  return s;
}

/**
 * isDuplicateName(name, index) -> boolean
 * A soft warning only: the UI turns this into one extra "Ekle" tap, never a
 * hard block — a clinic really can have two people with the same name.
 */
export function isDuplicateName(name, index) {
  const n = String(name ?? '').trim();
  if (!n || !index || typeof index.has !== 'function') return false;
  return index.has(nameKey(n));
}

/**
 * parseAmountInput(raw) -> { ok:true, amount:number|null } | { ok:false, error }
 *
 * amount === null means "left blank" -> no payment row is written at all.
 * The accept/reject rules are deliberately IDENTICAL to repo.assertPaymentInput
 * (finite, > 0, at most 2 decimals) so the sheet can never build a payload the
 * repo would reject — the only extra tolerance is a Turkish decimal comma,
 * normalized before the numeric checks.
 */
export function parseAmountInput(raw) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (!s) return { ok: true, amount: null };
  const n = Number(s);
  if (!Number.isFinite(n) || !(n > 0)) return { ok: false, error: 'Tutar 0’dan büyük olmalı.' };
  if (Math.round(n * 100) / 100 !== n) return { ok: false, error: 'Tutar en fazla 2 ondalık basamak olabilir.' };
  return { ok: true, amount: n };
}
