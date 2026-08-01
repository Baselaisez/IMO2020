// batch-review.js — pure (DOM-free, DB-free) helpers behind the "📚 Toplu Form
// Aktarımı" review sheet.
//
// The review sheet is the safety gate: ~20 parsed forms are about to become ~20
// patient records in ONE transaction, so the doctor must see exactly what will
// land and be able to deselect rows. All the counting/selection arithmetic lives
// here so it can be unit-tested without a browser.
//
// Input shape everywhere below is the output of
// batch-forms.markDuplicates(parseFormFiles(files), existingPatients):
//   { file, ok, fields:{name,mother_name,residence,phone,diagnosis}, error,
//     duplicate, duplicateOf }

/**
 * summarizeBatch(marked) -> { ok, dup, err }
 *
 * ok  — files parsed successfully (INCLUDING ones flagged as duplicates: they
 *       were read fine, they are just probably already in the database)
 * dup — successfully parsed files flagged duplicate
 * err — files that could not be parsed at all
 */
export function summarizeBatch(marked) {
  let ok = 0;
  let dup = 0;
  let err = 0;
  for (const e of marked || []) {
    if (!e) continue;
    if (!e.ok) { err++; continue; }
    ok++;
    if (e.duplicate) dup++;
  }
  return { ok, dup, err };
}

/**
 * defaultChecked(entry) -> boolean
 *
 * A row is pre-checked only when it is safe to import blindly: parsed OK and not
 * flagged as a duplicate. Duplicates and unreadable files start UNCHECKED — the
 * doctor opts them in deliberately (and an unreadable one cannot be opted in at
 * all, its checkbox is disabled by the UI).
 */
export function defaultChecked(entry) {
  return !!(entry && entry.ok && !entry.duplicate);
}

/** initialChecks(marked) -> boolean[] parallel to `marked`. */
export function initialChecks(marked) {
  return (marked || []).map(defaultChecked);
}

/**
 * countChecked(marked, checks) -> number
 *
 * How many rows the "Seçilenleri Kaydet (N)" button would actually save. A row
 * that failed to parse can never be counted even if its flag says true — it has
 * no name, so addPatientsBatch would only skip it. Counting it would promise the
 * doctor a record that never appears.
 */
export function countChecked(marked, checks) {
  let n = 0;
  for (let i = 0; i < (marked || []).length; i++) {
    if (checks && checks[i] && marked[i] && marked[i].ok) n++;
  }
  return n;
}

/**
 * pickChecked(marked, checks) -> Array<fields>
 *
 * The patient payloads to hand to repo.addPatientsBatch, in the order the files
 * were dropped. Same ok-only rule as countChecked, so the button's N always
 * equals the number of records actually attempted.
 */
export function pickChecked(marked, checks) {
  const out = [];
  for (let i = 0; i < (marked || []).length; i++) {
    const e = marked[i];
    if (!checks || !checks[i] || !e || !e.ok) continue;
    out.push({ ...(e.fields || {}) });
  }
  return out;
}

/**
 * allChecked(marked, checks) -> boolean
 * True when every SELECTABLE row (i.e. every ok row) is already checked. Backs
 * the "Tümünü Seç / Hiçbirini Seçme" toggle: when everything selectable is on,
 * the toggle clears; otherwise it selects everything selectable.
 * An all-unreadable batch has nothing selectable -> false (toggle stays a
 * harmless no-op rather than claiming "all selected").
 */
export function allChecked(marked, checks) {
  let selectable = 0;
  for (let i = 0; i < (marked || []).length; i++) {
    if (!marked[i] || !marked[i].ok) continue;
    selectable++;
    if (!checks || !checks[i]) return false;
  }
  return selectable > 0;
}

/**
 * setAllChecks(marked, on) -> boolean[]
 * Every ok row set to `on`; unreadable rows always stay false (their checkbox is
 * disabled, so they must never be flipped on by the select-all toggle).
 */
export function setAllChecks(marked, on) {
  return (marked || []).map(e => (!!on && !!(e && e.ok)));
}

/**
 * truncateText(s, max) -> string
 * Long free-text (a paragraph-long "Şikayet / Hastalık") must not push the
 * filename and badge off the row. Cuts on a whole character count and appends an
 * ellipsis only when something was actually removed.
 */
export function truncateText(s, max = 48) {
  const str = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (max <= 0 || str.length <= max) return str;
  return str.slice(0, max).trimEnd() + '…';
}

/**
 * detailLine(fields) -> string
 * The muted second line of a review row: mother · residence · phone · diagnosis,
 * empty parts dropped, diagnosis truncated. '—' when the form yielded nothing
 * beyond the name.
 */
export function detailLine(fields) {
  const f = fields || {};
  const parts = [
    String(f.mother_name ?? '').trim(),
    String(f.residence ?? '').trim(),
    String(f.phone ?? '').trim(),
    truncateText(f.diagnosis, 48),
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}
