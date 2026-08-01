// Pure, heuristic Turkish free-text patient parser.
// Doctor pastes a WhatsApp-style description; this pre-fills the new-patient
// form for the doctor to review/correct. NEVER invent data — unknown fields
// come back as ''.
//
// parsePatientText(text, todayIso) -> { name, mother_name, residence, birth_date, diagnosis }

const KEYWORDS = ['yaşında', 'oturuyor', 'yaşıyor', 'anne', 'ikamet', 'doğum', 'yaşadığı'];

// Turkish-aware lowercase/uppercase helpers (dotted/dotless i).
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

function titleCase(str) {
  return str
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(trUpperFirst)
    .join(' ');
}

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
  const words = leading.trim().split(/\s+/).filter(w => /^[a-zçğıöşüİĞÜŞÖÇ]+$/i.test(w));
  if (words.length === 0) return '';
  return titleCase(words.join(' '));
}

// Drop everything from the first keyword word onward (keyword marks the end
// of the value we actually want, e.g. mother name stops at "yaşadığı").
function cutBeforeKeyword(words) {
  const lower = words.map(trLower);
  const idx = lower.findIndex(w => KEYWORDS.includes(w));
  return idx === -1 ? words : words.slice(0, idx);
}

// Keep only the words after the LAST keyword occurrence (keyword marks the
// end of an unrelated preceding phrase, e.g. "42 yaşında sultanbeyli" before
// "oturuyor" — we want just "sultanbeyli").
function keepAfterLastKeyword(words) {
  const lower = words.map(trLower);
  let idx = -1;
  lower.forEach((w, i) => { if (KEYWORDS.includes(w)) idx = i; });
  return words.slice(idx + 1);
}

function extractMotherName(original) {
  const re = /(?:annesinin ad[ıi]|anne ad[ıi]|anne ismi)\s*:?\s*([a-zçğıöşüİĞÜŞÖÇ]+(?:\s+[a-zçğıöşüİĞÜŞÖÇ]+){0,4})/i;
  const m = original.match(re);
  if (!m) return '';
  let words = m[1].trim().split(/\s+/).filter(Boolean);
  words = cutBeforeKeyword(words).slice(0, 2);
  if (words.length === 0) return '';
  return titleCase(words.join(' '));
}

function extractResidence(original) {
  // (a) words right before "oturuyor"
  let m = original.match(/([a-zçğıöşüİĞÜŞÖÇ]+(?:\s+[a-zçğıöşüİĞÜŞÖÇ]+){0,2})\s+oturuyor/i);
  if (m) {
    const words = keepAfterLastKeyword(m[1].trim().split(/\s+/).filter(Boolean));
    if (words.length === 0) return '';
    return titleCase(words.slice(-3).join(' '));
  }
  // (b) after "yaşadığı yer" / "yaşıyor" / "ikamet(i)?"
  m = original.match(/(?:yaşadığı yer|yaşıyor|ikamet(?:i)?)\s*:?\s*([a-zçğıöşüİĞÜŞÖÇ]+(?:\s+[a-zçğıöşüİĞÜŞÖÇ]+){0,2})/i);
  if (m) {
    const stopRe = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'i');
    const words = m[1].trim().split(/\s+/).filter(Boolean);
    const cut = [];
    for (const w of words) {
      if (stopRe.test(w)) break;
      cut.push(w);
    }
    const take = cut.length ? cut : words;
    return titleCase(take.slice(0, 3).join(' '));
  }
  return '';
}

function extractBirthDate(original, todayIso) {
  if (/doğum günü belli değil/i.test(original)) return '';

  const currentYear = todayIso ? Number(String(todayIso).slice(0, 4)) : new Date().getFullYear();

  // DD/MM/YYYY or DD.MM.YYYY first (more specific — 3 groups)
  let m = original.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3]);
    if (year >= 1900 && year <= currentYear && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return '';
  }

  // MM/YYYY or MM.YYYY
  m = original.match(/\b(\d{1,2})[\/.](\d{4})\b/);
  if (m) {
    const month = Number(m[1]);
    const year = Number(m[2]);
    if (year >= 1900 && year <= currentYear && month >= 1 && month <= 12) {
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

export function parsePatientText(text, todayIso) {
  const result = { name: '', mother_name: '', residence: '', birth_date: '', diagnosis: '' };
  if (!text || typeof text !== 'string' || !text.trim()) return result;

  const original = text.trim();
  const lowerText = trLower(original);

  result.name = extractName(original, lowerText);
  result.mother_name = extractMotherName(original);
  result.residence = extractResidence(original);
  result.birth_date = extractBirthDate(original, todayIso);
  result.diagnosis = extractDiagnosis(original);

  return result;
}
