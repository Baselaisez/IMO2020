// form-fields.js — ONE source of truth for the Hasta Kayıt client-intake form.
//
// Both the PDF form (pdf-form.js) and the DOCX form (docx-form.js) build their
// fields from FORM_FIELDS, and both parse returned files through the same
// tolerant label matching (labelToKey). New formats (HTML, plain text, …) reuse
// the same model instead of re-declaring labels and re-inventing matching.

// Canonical field model. `key` is the internal id, `label` is the Turkish label
// shown to the client, `app` is the app's patient-record field name.
export const FORM_FIELDS = [
  { key: 'name', label: 'İsim Soyisim', app: 'name' },
  { key: 'mother', label: 'Anne Adı', app: 'mother_name' },
  { key: 'birthdate', label: 'Doğum Tarihi (GG.AA.YYYY)', app: 'birth_date' },
  { key: 'residence', label: 'İkametgah (Yaşadığı yer)', app: 'residence' },
  { key: 'phone', label: 'Telefon', app: 'phone' },
  { key: 'diagnosis', label: 'Şikayet / Hastalık', app: 'diagnosis' },
];

// key -> app field name.
const KEY_TO_APP = Object.fromEntries(FORM_FIELDS.map((f) => [f.key, f.app]));

/**
 * normLabel(s) — normalize a label for tolerant matching.
 * Lowercases (tr locale), folds the whole I-family (İ/I/ı/i) to 'i' BEFORE
 * lowercasing (same approach as importer.normKey — handles ASCII-I keyboards,
 * OCR and ALL-CAPS variance), strips punctuation/`:`/`：`, collapses whitespace.
 */
export function normLabel(s) {
  return String(s ?? '')
    .replace(/[İIıi]/g, 'i')
    .toLocaleLowerCase('tr')
    .replace(/[.,;:：/()\-_*·•|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Raw label variants a client might type, grouped by canonical key. Normalized
// at load time into LABEL_SYNONYMS so we never hand-maintain folded strings.
const RAW_SYNONYMS = {
  name: ['isim', 'ad soyad', 'adı soyadı', 'isim soyisim', 'ad soyisim', 'isim soyad', 'ad', 'adi soyadi', 'hasta adı', 'hasta adi'],
  mother: ['anne adı', 'anne ismi', 'ana adı', 'anne adi', 'ana adi', 'anne'],
  // ASCII counterparts ('dogum …') sit alongside the Turkish spellings for the
  // same reason the other groups carry them: normLabel folds the I-family but
  // NOT ğ/ü, so a client typing on an ASCII keyboard needs its own variant.
  birthdate: [
    'doğum tarihi', 'dogum tarihi', 'doğum günü', 'dogum gunu',
    'd.tarihi', 'doğum', 'dogum', 'birth date',
    'doğum tarihi (gg.aa.yyyy)', 'dogum tarihi (gg.aa.yyyy)',
  ],
  // 'nerede oturuyor' / 'il ilçe' come from the doctor's own WhatsApp template
  // ("Nerede oturuyor (İl - İlçe):"), which clients copy back verbatim.
  residence: [
    'ikamet', 'ikametgah', 'ikametgâh', 'yaşadığı yer', 'yasadigi yer', 'adres',
    'şehir', 'sehir', 'ikametgah yaşadığı yer',
    'nerede oturuyor', 'nerede oturuyorsunuz', 'oturduğu yer', 'oturdugu yer',
    'il ilçe', 'il ilce',
  ],
  phone: ['telefon', 'tel', 'gsm', 'cep', 'cep telefonu', 'telefon no', 'telefon numarası', 'telefon numarasi'],
  diagnosis: [
    'şikayet', 'şikâyet', 'sikayet', 'hastalık', 'hastalik', 'tanı', 'tani', 'durum',
    'şikayet hastalık', 'sikayet hastalik',
    'şikayetiniz', 'sikayetiniz', 'şikayetleriniz', 'sikayetleriniz', 'şikayeti', 'sikayeti',
  ],
};

// Normalized label variant -> canonical key.
export const LABEL_SYNONYMS = (() => {
  const out = {};
  for (const [key, variants] of Object.entries(RAW_SYNONYMS)) {
    for (const v of variants) out[normLabel(v)] = key;
  }
  return out;
})();

/**
 * labelToKey(rawLabel) -> app field name | null
 * Normalizes rawLabel and looks it up in LABEL_SYNONYMS. Returns the app field
 * name (name/mother_name/residence/phone/diagnosis) or null for unknown labels.
 */
export function labelToKey(rawLabel) {
  const norm = normLabel(rawLabel);
  if (!norm) return null;
  const key = LABEL_SYNONYMS[norm];
  return key ? KEY_TO_APP[key] : null;
}

/** emptyResult() -> a fresh all-empty parse result in the app's field shape. */
export function emptyResult() {
  return {
    name: '', mother_name: '', birth_date: '', residence: '', phone: '', diagnosis: '',
  };
}

// --- Birth date normalization ----------------------------------------------

const MIN_YEAR = 1900;
// \2 = the SAME separator twice. A single space counts as a separator because
// the doctor's template asks for "Doğum tarihi (gün/ay/yıl)" and clients answer
// "28 06 1990" far more often than "28.06.1990". Still strict: exactly one
// separator character, used consistently ("12. 05. 1980" stays rejected).
const DMY_RE = /^(\d{1,2})([./\- ])(\d{1,2})\2(\d{4})$/;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// Real-calendar check: rejects 31.04, 31.02 and non-leap 29.02 (the Date
// constructor would otherwise silently roll them over into the next month).
function isRealDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * normalizeBirthDate(raw[, nowYear]) -> 'YYYY-MM-DD' | ''
 *
 * The DB column `patients.birth_date` is an ISO string and repo.js/backup.js both
 * reject anything that is not /^\d{4}-\d{2}-\d{2}$/ — so whatever a client types
 * into the intake form must be converted here or dropped. Accepted:
 *   D.M.YYYY / DD.MM.YYYY, and the same with '/' or '-' (one separator, used
 *   consistently), plus an already-ISO YYYY-MM-DD.
 * Everything else — partials, prose, two-digit years, mixed separators,
 * impossible dates, years outside 1900..current — returns '' .
 *
 * This function NEVER guesses: an unparseable answer leaves the field empty for
 * the doctor to fill in by hand, it does not become a wrong date in the record.
 */
export function normalizeBirthDate(raw, nowYear) {
  const s = String(raw ?? '').trim();
  if (!s) return '';

  let y;
  let m;
  let d;
  const iso = ISO_RE.exec(s);
  if (iso) {
    [, y, m, d] = iso;
  } else {
    const dmy = DMY_RE.exec(s);
    if (!dmy) return '';
    [, d, , m, y] = dmy;
  }
  y = Number(y);
  m = Number(m);
  d = Number(d);

  const maxYear = Number(nowYear) || new Date().getFullYear();
  if (y < MIN_YEAR || y > maxYear) return '';
  if (!isRealDate(y, m, d)) return '';
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
