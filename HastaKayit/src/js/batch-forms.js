// batch-forms.js — batch intake-form import engine.
//
// A clinic seeing ~20 clients/day should drop 20 filled forms at once instead of
// typing each one. This module is the pure engine behind that: it parses a list
// of files (DOCX or PDF) into app patient fields, and flags which of them the
// database already knows about. No DOM, no storage — the UI layer owns both.
//
// Design notes:
//   * One bad file must NEVER abort the batch. Every file is parsed inside its
//     own try/catch and reports its own ok/error.
//   * Files are processed SEQUENTIALLY. Parsing is CPU-bound (unzip + XML scan,
//     or pdf-lib document load), so concurrency buys nothing on a single-threaded
//     WebView and would only make memory spikes and failure ordering harder to
//     reason about. Predictable > clever.
//   * Output order always mirrors input order, so the UI can pair a result row
//     with the file the user dropped.

import { parseDocx } from './docx-form.js';
import { parseForm } from './pdf-form.js';
import { emptyResult } from './form-fields.js';

// Lowercased extension of a file name, without the dot ('' when there is none).
function extOf(fileName) {
  const s = String(fileName ?? '');
  const dot = s.lastIndexOf('.');
  if (dot < 0 || dot === s.length - 1) return '';
  return s.slice(dot + 1).toLocaleLowerCase('en');
}

// Extension -> parser. Both parsers accept Uint8Array/ArrayBuffer and are
// already "never throw on bad content" — but we still guard, because a caller
// could hand us bytes that blow up before the parser is even reached.
const PARSERS = {
  docx: parseDocx,
  pdf: parseForm,
};

function result(file, ok, fields, error) {
  return { file, ok, fields, error };
}

/**
 * parseFormFiles(files) -> Promise<Array<{file, ok, fields, error}>>
 *
 * files: Array<{ name: string, bytes: Uint8Array|ArrayBuffer }>
 * fields: { name, mother_name, birth_date, residence, phone, diagnosis } —
 *   ALWAYS present (the parsers' emptyResult shape), even on failure, so the UI
 *   can show whatever partial data was recovered and let the user finish the
 *   record by hand. Nothing here whitelists field names: whatever the parsers
 *   return flows unchanged into batch-review.pickChecked and on to
 *   repo.addPatientsBatch. `birth_date` arrives already ISO (or '') — the
 *   parsers normalize it, because repo/backup reject any other spelling.
 *
 * ok:false cases and their Turkish messages:
 *   - unknown/absent extension  -> 'Desteklenmeyen dosya türü'
 *   - parsed but no name found  -> 'Form boş veya okunamadı (isim yok)'
 *   - parser/IO threw           -> 'Dosya okunamadı: <detay>'
 */
export async function parseFormFiles(files) {
  const out = [];
  for (const f of files || []) {
    // Read `name`/`bytes` defensively: a getter on a host File-like object can
    // itself throw, and that must be reported as this file's error, not crash
    // the batch.
    let fileName = '';
    try {
      fileName = String(f?.name ?? '');
      const parse = PARSERS[extOf(fileName)];
      if (!parse) {
        out.push(result(fileName, false, emptyResult(), 'Desteklenmeyen dosya türü'));
        continue;
      }
      const bytes = f.bytes;
      const fields = await parse(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
      // A form without a name cannot become a patient record (repo requires a
      // name), but its other fields are still worth showing.
      if (!String(fields.name || '').trim()) {
        out.push(result(fileName, false, fields, 'Form boş veya okunamadı (isim yok)'));
        continue;
      }
      out.push(result(fileName, true, fields, ''));
    } catch (e) {
      out.push(result(fileName, false, emptyResult(), `Dosya okunamadı: ${e?.message || e}`));
    }
  }
  return out;
}

// --- Duplicate detection ----------------------------------------------------

// Same folding rule as importer.normKey: fold the whole I-family (İ/I/ı/i) to
// plain 'i' BEFORE lowercasing, so a name typed on an ASCII keyboard, OCR'd, or
// shouted in ALL-CAPS still matches. Additionally trim and collapse runs of
// whitespace — a form filled in Word often carries stray double spaces.
function norm(s) {
  return String(s ?? '')
    .replace(/[İIıi]/g, 'i')
    .toLocaleLowerCase('tr')
    .replace(/\s+/g, ' ')
    .trim();
}

function dupKey(name, motherName) {
  return `${norm(name)}|${norm(motherName)}`;
}

/**
 * markDuplicates(parsed, existingPatients) -> NEW array, entries copied
 *
 * Adds { duplicate: boolean, duplicateOf: number|null } to each entry.
 * Never mutates `parsed` or its entries.
 *
 * Rule (the app's existing convention, importer.normKey): normalized full name
 * AND normalized mother name must BOTH be equal. Because the key includes the
 * mother verbatim, a blank incoming mother only ever matches an existing record
 * whose mother is ALSO blank — a "Fatma"-mother record is never fused with a
 * blank-mother form, and vice versa. That asymmetric-blank case is exactly the
 * one worth being conservative about: merging two different people is far worse
 * than importing a duplicate the user can delete.
 *
 * IN-BATCH duplicates: the user may drop two files for the same person (a
 * re-send, or the same form saved twice). The FIRST occurrence is the keeper;
 * every later occurrence gets duplicate:true with duplicateOf:null — null means
 * "duplicate of another file in this batch", since there is no database row to
 * point at yet. A match against an existing DB row always wins and reports that
 * row's real id.
 *
 * Failed entries (ok:false) are carried through unflagged: they have no usable
 * identity to compare.
 */
export function markDuplicates(parsed, existingPatients) {
  const byKey = new Map();
  for (const p of existingPatients || []) {
    const k = dupKey(p.name, p.mother_name);
    if (!byKey.has(k)) byKey.set(k, p.id); // first row wins on a pre-existing dup
  }

  const seen = new Set();
  return (parsed || []).map((entry) => {
    const fields = entry?.fields || emptyResult();
    if (!entry?.ok || !String(fields.name || '').trim()) {
      return { ...entry, duplicate: false, duplicateOf: null };
    }
    const k = dupKey(fields.name, fields.mother_name);
    if (byKey.has(k)) return { ...entry, duplicate: true, duplicateOf: byKey.get(k) };
    if (seen.has(k)) return { ...entry, duplicate: true, duplicateOf: null }; // in-batch
    seen.add(k);
    return { ...entry, duplicate: false, duplicateOf: null };
  });
}
