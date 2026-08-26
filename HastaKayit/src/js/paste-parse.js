// Pure, heuristic Turkish free-text patient parser.
//
// The doctor sends every new client this WhatsApp template:
//
//   KİŞİNİN ESKİ OLMAYAN BİR RESMİNİ
//   Adı Soyadı:
//   Doğum tarihi (gün/ay/yıl):
//   Nerede oturuyor (İl - İlçe):
//   Telefon No:
//   Anne adı:
//   Şikayetiniz:
//
// …and clients answer in whatever shape they feel like. Three shapes matter:
//
//   A) LABELLED   — "Adı Soyadı: Ali Şahin" …  (labels echoed back)
//   B) INLINE     — "Mahmut Ekşi 42 yaşında sultanbeyli oturuyor Annesinin adı
//                    Emine"                     (one prose line)
//   C) BARE LINES — the common real case: the answers only, one per line, no
//                   labels at all, with lines added, omitted or reordered.
//
// Position alone is therefore NOT reliable. Shape C is classified by CONTENT
// first — the phone and birth-date lines are unambiguous ANCHORS — and only the
// remaining lines are placed by position RELATIVE to those anchors, following
// the template order (name, birth, residence, phone, mother, complaint).
//
// Two invariants hold everywhere:
//   * NEVER invent data. A field that cannot be read stays ''.
//   * NEVER silently drop what the client wrote. Anything unclassified is
//     appended to `diagnosis`; on top of that the caller (ui-home.js) always
//     stores the full original text in Notlar.
//
// parsePatientText(text, todayIso)
//   -> { name, mother_name, birth_date, residence, phone, diagnosis }

import { labelToKey, normalizeBirthDate, emptyResult } from './form-fields.js';

const KEYWORDS = ['yaşında', 'oturuyor', 'yaşıyor', 'anne', 'ikamet', 'doğum', 'yaşadığı'];

// Turkish letters, for "is this a word a person's name could be made of".
const L = 'A-Za-zÇĞİIÖŞÜçğıöşüÂÎÛâîû';
const NAME_WORD_RE = new RegExp(`^[${L}]+(?:['’\\-][${L}]+)*$`);
const HAS_LETTER_RE = new RegExp(`[${L}]`);

// A whole line that is nothing but a phone number (digits + the separators
// people actually type).
const PHONE_LINE_RE = /^[+(]?\d[\d\s\-().+]*$/;
// A phone-shaped run of digits embedded in a longer line ("Telefon 0534 …").
const PHONE_TOKEN_RE = /[+(]?\d[\d\s\-().]{7,}\d/;
// A D/M/YYYY-ish run embedded in a longer line; validated by normalizeBirthDate.
const DATE_TOKEN_RE = /\d{1,2}([./\- ])\d{1,2}\1\d{4}/;

// --- Turkish-aware casing ---------------------------------------------------

function trLower(s) {
  return s.replace(/İ/g, 'i').replace(/I/g, 'ı').toLowerCase();
}

function trUpperFirst(word) {
  if (!word) return word;
  const first = word[0];
  const rest = word.slice(1);
  let upperFirst;
  if (first === 'i') upperFirst = 'İ';
  else if (first === 'ı') upperFirst = 'I';
  else upperFirst = first.toLocaleUpperCase('tr-TR');
  return upperFirst + trLower(rest);
}

// Capitalises after spaces AND after "/" or "-", so "ANKARA/SİNCAN" becomes
// "Ankara/Sincan" rather than "Ankara/sincan" (clients write İl/İlçe that way).
function titleCase(str) {
  return String(str ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.split(/([/\-])/).map((part) => (part === '/' || part === '-' ? part : trUpperFirst(part))).join(''))
    .join(' ');
}

// --- Small line predicates --------------------------------------------------

const words = (line) => String(line).trim().split(/\s+/).filter(Boolean);
const hasLetters = (line) => HAS_LETTER_RE.test(line);

// Connectives and complaint vocabulary that never appear in a person's name.
// Without this, a short şikayet line ("Sürekli sinirlilik ve öfke") is four
// alphabetic words and would be taken as the name.
const NON_NAME_WORDS = new Set([
  've', 'ile', 'için', 'bir', 'çok', 'hep', 'ama', 'ki', 'da', 'de', 'mi', 'mı', 'ya', 'veya',
  'var', 'yok', 'sorun', 'sorunu', 'sorunlar', 'şikayet', 'şikayetim', 'şikâyet',
  'yaşıyorum', 'yaşanıyor', 'oluyor', 'çıkıyor', 'istemiyorum', 'sürekli', 'sıkıntı', 'sıkıntım',
]);

function isNameLine(line, minWords, maxWords) {
  const w = words(line);
  if (w.length < minWords || w.length > maxWords) return false;
  if (!w.every((x) => NAME_WORD_RE.test(x))) return false;
  return !w.some((x) => NON_NAME_WORDS.has(trLower(x)));
}

function isMostlyDigits(line) {
  const compact = String(line).replace(/\s/g, '');
  if (!compact) return false;
  const digits = (compact.match(/\d/g) || []).length;
  return digits / compact.length > 0.5;
}

/**
 * phoneFrom(raw) -> the client's own digits, or '' when it is not a phone.
 * A Turkish mobile is 11 digits ("05340174164"); with a country code it can
 * reach 13. We keep the digits EXACTLY as typed (only separators are dropped)
 * plus a leading '+' when there was one — no reformatting, no assumed prefix.
 */
function phoneFrom(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 13) return '';
  return (s.startsWith('+') ? '+' : '') + digits;
}

// --- Shape B: single-line inline prose (unchanged behaviour) -----------------

function findKeywordIndex(lowerText) {
  let earliest = -1;
  for (const kw of KEYWORDS) {
    const idx = lowerText.indexOf(kw);
    if (idx !== -1 && (earliest === -1 || idx < earliest)) earliest = idx;
  }
  const digitMatch = lowerText.match(/\d/);
  if (digitMatch) {
    const idx = digitMatch.index;
    if (earliest === -1 || idx < earliest) earliest = idx;
  }
  return earliest;
}

function extractName(original, lowerText) {
  const stopIdx = findKeywordIndex(lowerText);
  const leading = stopIdx === -1 ? original : original.slice(0, stopIdx);
  const w = leading.trim().split(/\s+/).filter((x) => /^[a-zçğıöşüİĞÜŞÖÇ]+$/i.test(x));
  if (w.length === 0) return '';
  return titleCase(w.join(' '));
}

// Drop everything from the first keyword word onward (keyword marks the end
// of the value we actually want, e.g. mother name stops at "yaşadığı").
function cutBeforeKeyword(w) {
  const lower = w.map(trLower);
  const idx = lower.findIndex((x) => KEYWORDS.includes(x));
  return idx === -1 ? w : w.slice(0, idx);
}

// Keep only the words after the LAST keyword occurrence (keyword marks the
// end of an unrelated preceding phrase, e.g. "42 yaşında sultanbeyli" before
// "oturuyor" — we want just "sultanbeyli").
function keepAfterLastKeyword(w) {
  const lower = w.map(trLower);
  let idx = -1;
  lower.forEach((x, i) => { if (KEYWORDS.includes(x)) idx = i; });
  return w.slice(idx + 1);
}

function extractMotherName(original) {
  const re = /(?:annesinin ad[ıi]|anne ad[ıi]|anne ismi)\s*:?\s*([a-zçğıöşüİĞÜŞÖÇ]+(?:[ \t]+[a-zçğıöşüİĞÜŞÖÇ]+){0,4})/i;
  const m = original.match(re);
  if (!m) return '';
  let w = m[1].trim().split(/\s+/).filter(Boolean);
  w = cutBeforeKeyword(w).slice(0, 2);
  if (w.length === 0) return '';
  return titleCase(w.join(' '));
}

function extractResidence(original) {
  // (a) words right before "oturuyor"
  let m = original.match(/([a-zçğıöşüİĞÜŞÖÇ]+(?:\s+[a-zçğıöşüİĞÜŞÖÇ]+){0,2})\s+oturuyor/i);
  if (m) {
    const w = keepAfterLastKeyword(m[1].trim().split(/\s+/).filter(Boolean));
    if (w.length === 0) return '';
    return titleCase(w.slice(-3).join(' '));
  }
  // (b) after "yaşadığı yer" / "yaşıyor" / "ikamet(i)?"
  m = original.match(/(?:yaşadığı yer|yaşıyor|ikamet(?:i)?)\s*:?\s*([a-zçğıöşüİĞÜŞÖÇ]+(?:\s+[a-zçğıöşüİĞÜŞÖÇ]+){0,2})/i);
  if (m) {
    const stopRe = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'i');
    const w = m[1].trim().split(/\s+/).filter(Boolean);
    const cut = [];
    for (const x of w) {
      if (stopRe.test(x)) break;
      cut.push(x);
    }
    const take = cut.length ? cut : w;
    return titleCase(take.slice(0, 3).join(' '));
  }
  return '';
}

function extractBirthDate(original, maxYear) {
  if (/doğum günü belli değil/i.test(original)) return '';

  // DD/MM/YYYY or DD.MM.YYYY first (more specific — 3 groups)
  let m = original.match(/\b(\d{1,2})[/.](\d{1,2})[/.](\d{4})\b/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (year >= 1900 && year <= maxYear && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
  }

  // MM/YYYY or MM.YYYY
  m = original.match(/\b(\d{1,2})[/.](\d{4})\b/);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (year >= 1900 && year <= maxYear && month >= 1 && month <= 12) {
      return `${year}-${String(month).padStart(2, '0')}-01`;
    }
    return '';
  }

  return '';
}

function extractDiagnosis(original) {
  const parts = [];
  const ageMatch = original.match(/\d+\s*yaşında/i);
  if (ageMatch) parts.push(ageMatch[0]);
  return parts.join(' ').trim();
}

/** parseInline(line, maxYear) — shape B: one line of Turkish prose. */
function parseInline(line, maxYear) {
  const out = emptyResult();
  const original = String(line).trim();
  if (!original) return out;
  const lower = trLower(original);

  out.name = extractName(original, lower);
  out.mother_name = extractMotherName(original);
  out.residence = extractResidence(original);
  out.birth_date = extractBirthDate(original, maxYear);
  const token = original.match(PHONE_TOKEN_RE);
  out.phone = token ? phoneFrom(token[0].trim()) : '';
  out.diagnosis = extractDiagnosis(original);
  return out;
}

// --- Shape A: "Label: value" lines ------------------------------------------

/**
 * splitLabel(line) -> { key, value } | null
 * A line only counts as labelled when the text before the first colon is a
 * label labelToKey recognises — so "Saat 10:30 uyanıyorum" stays free text.
 * Parentheticals are stripped on a second attempt, because the doctor's own
 * template writes "Doğum tarihi (gün/ay/yıl):".
 */
function splitLabel(line) {
  const i = line.search(/[:：]/);
  if (i <= 0) return null;
  const rawLabel = line.slice(0, i);
  if (!rawLabel.trim()) return null;
  const key = labelToKey(rawLabel) || labelToKey(rawLabel.replace(/\([^)]*\)/g, ' '));
  if (!key) return null;
  return { key, value: line.slice(i + 1).trim() };
}

function parseLabelled(lines, maxYear) {
  const out = emptyResult();
  const raw = {};
  const diagParts = [];
  let seenLabel = false;

  for (const line of lines) {
    const hit = splitLabel(line);
    if (hit) {
      seenLabel = true;
      if (hit.key === 'diagnosis') {
        if (hit.value) diagParts.push(hit.value);
      } else if (hit.value && !(hit.key in raw)) {
        raw[hit.key] = hit.value;
      }
      continue;
    }
    // Lines BEFORE the first label are the template's own boilerplate (the
    // "KİŞİNİN ESKİ OLMAYAN BİR RESMİNİ" photo instruction) — they are not the
    // client's words, so they must not become a phantom complaint. They still
    // survive in Notlar, which the caller fills with the untouched original.
    if (seenLabel) diagParts.push(line);
  }

  out.name = titleCase(raw.name);
  out.mother_name = titleCase(raw.mother_name);
  out.residence = titleCase(raw.residence);
  out.birth_date = raw.birth_date ? normalizeBirthDate(raw.birth_date, maxYear) : '';
  out.phone = raw.phone ? (phoneFrom(raw.phone) || raw.phone.trim()) : '';
  out.diagnosis = diagParts.join('\n');
  return out;
}

// --- Shape C: bare positional lines -----------------------------------------

function parseBareLines(lines, maxYear) {
  const out = emptyResult();
  const used = new Array(lines.length).fill(false);
  const extraDiag = [];

  // 1. BIRTH-DATE ANCHOR. A whole line that is a real calendar date wins;
  //    otherwise a date-shaped token inside a line. normalizeBirthDate rejects
  //    impossible dates ("31 02 1990"), and a rejected line simply is not an
  //    anchor — it falls through to diagnosis rather than becoming a fake date.
  let dateIdx = -1;
  for (let i = 0; i < lines.length && dateIdx < 0; i++) {
    const d = normalizeBirthDate(lines[i], maxYear);
    if (d) { dateIdx = i; out.birth_date = d; }
  }
  for (let i = 0; i < lines.length && dateIdx < 0; i++) {
    const m = lines[i].match(DATE_TOKEN_RE);
    const d = m ? normalizeBirthDate(m[0], maxYear) : '';
    if (d) { dateIdx = i; out.birth_date = d; }
  }
  if (dateIdx >= 0) used[dateIdx] = true;

  // 2. PHONE ANCHOR. Same two tiers: a line that is only a number first, then a
  //    phone-shaped token inside a line ("Telefon 0534 017 41 64").
  let phoneIdx = -1;
  for (let i = 0; i < lines.length && phoneIdx < 0; i++) {
    if (used[i] || !PHONE_LINE_RE.test(lines[i])) continue;
    const p = phoneFrom(lines[i]);
    if (p) { phoneIdx = i; out.phone = p; }
  }
  for (let i = 0; i < lines.length && phoneIdx < 0; i++) {
    if (used[i]) continue;
    const m = lines[i].match(PHONE_TOKEN_RE);
    const p = m ? phoneFrom(m[0].trim()) : '';
    if (p) { phoneIdx = i; out.phone = p; }
  }
  if (phoneIdx >= 0) used[phoneIdx] = true;

  // 3. INLINE-PROSE LINES. Some clients mix shapes ("Annesinin adı Emine" on
  //    its own line). Run the shape-B heuristics on that ONE line — they are
  //    keyword-anchored, so a line without "anne adı"/"oturuyor"/… yields
  //    nothing and is left for the positional passes below.
  const anchors = [dateIdx, phoneIdx].filter((i) => i >= 0);

  // NAME runs BEFORE the inline-prose pass on purpose. KEYWORDS are matched as
  // substrings, so an ordinary şikayet ("…AYRILIK SORUNU YAŞIYORUM") contains
  // "yaşıyor"; the prose pass would then treat that line as "<name> <keyword>…"
  // and claim the name, pushing the real one out to diagnosis. A clean
  // name-shaped line always beats a name guessed out of prose, so we settle it
  // first and the prose pass below only fills what is still missing.
  let nameIdx = -1;
  const nameLimit = anchors.length ? Math.min(...anchors) : lines.length;
  if (!out.name) {
    for (const minWords of [2, 1]) {
      if (nameIdx >= 0) break;
      for (let i = 0; i < nameLimit; i++) {
        if (used[i]) continue;
        // A bare name line never contains "anne adı" / "oturuyor" / "yaşında"…
        // Those belong to the prose pass below ("Annesinin adı Emine" is three
        // clean words and would otherwise be claimed here as the name).
        if (KEYWORDS.some((kw) => trLower(lines[i]).includes(kw))) continue;
        if (isNameLine(lines[i], minWords, 4)) { nameIdx = i; break; }
      }
    }
    if (nameIdx >= 0) { out.name = titleCase(lines[nameIdx]); used[nameIdx] = true; }
  }

  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    const lower = trLower(lines[i]);
    if (!KEYWORDS.some((kw) => lower.includes(kw))) continue;
    const inline = parseInline(lines[i], maxYear);
    let hit = false;
    for (const k of ['name', 'mother_name', 'residence', 'birth_date', 'phone']) {
      if (out[k] || !inline[k]) continue;
      // A KEYWORD can appear INSIDE an ordinary word — the complaint
      // "…AYRILIK SORUNU YAŞIYORUM…" contains "yaşıyor". parseInline then treats
      // everything before it as a name and swallows the whole şikayet line,
      // pushing the real name out to diagnosis. A person's name is never 5+
      // words, so reject over-long inline names and leave the line for the
      // positional passes (it ends up in diagnosis, where it belongs).
      if (k === 'name' && words(inline[k]).length > 4) continue;
      out[k] = inline[k]; hit = true;
    }
    if (!hit) continue;
    used[i] = true;
    if (inline.diagnosis) extraDiag.push(inline.diagnosis);
  }

  // 5. RESIDENCE — the first line between the date anchor and the phone anchor
  //    (template order). Extra lines in that gap ("Şuan Hırvatistan Zagreb")
  //    stay unused and end up in diagnosis. Only runs when at least one anchor
  //    exists; without anchors there is nothing to be positioned relative to,
  //    and guessing would invent a residence.
  let resIdx = -1;
  if (!out.residence && anchors.length) {
    const from = dateIdx >= 0 ? dateIdx : nameIdx;
    const to = phoneIdx >= 0 ? phoneIdx : lines.length;
    for (let i = from + 1; i < to; i++) {
      if (used[i] || !hasLetters(lines[i]) || isMostlyDigits(lines[i])) continue;
      resIdx = i;
      break;
    }
    if (resIdx >= 0) { out.residence = titleCase(lines[resIdx]); used[resIdx] = true; }
  }

  // 6. MOTHER — the template puts it directly after the phone, so only the
  //    FIRST unused line after that anchor is considered, and only if it is
  //    short (1..2 alphabetic words). That stops a one-line complaint from
  //    being filed as the mother's name.
  const motherAfter = phoneIdx >= 0 ? phoneIdx : resIdx;
  if (!out.mother_name && motherAfter >= 0) {
    for (let i = motherAfter + 1; i < lines.length; i++) {
      if (used[i]) continue;
      if (isNameLine(lines[i], 1, 2)) { out.mother_name = titleCase(lines[i]); used[i] = true; }
      break;
    }
  }

  // 7. Last chance for the mother: an explicit "anne adı …" anywhere left.
  if (!out.mother_name) {
    for (let i = 0; i < lines.length; i++) {
      if (used[i]) continue;
      const m = extractMotherName(lines[i]);
      if (m) { out.mother_name = m; used[i] = true; break; }
    }
  }

  // 8. ZERO LOSS — every line nobody claimed becomes the complaint, in the
  //    order the client wrote it.
  const leftovers = lines.filter((_, i) => !used[i]);
  out.diagnosis = [...extraDiag, ...leftovers].join('\n');
  return out;
}

// --- Entry point ------------------------------------------------------------

export function parsePatientText(text, todayIso) {
  if (!text || typeof text !== 'string' || !text.trim()) return emptyResult();

  const maxYear = todayIso ? Number(String(todayIso).slice(0, 4)) : new Date().getFullYear();
  const lines = text.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);

  // Labels are the strongest signal we can get — if the client echoed even one
  // back, trust labels over position.
  if (lines.some((l) => splitLabel(l))) return parseLabelled(lines, maxYear);
  if (lines.length > 1) return parseBareLines(lines, maxYear);
  return parseInline(lines[0], maxYear);
}
