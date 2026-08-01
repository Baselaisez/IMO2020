import * as XLSX from 'xlsx';

// Doktorun kendi (serbest biçimli) Excel'ini içe aktarır: sütun başlıklarını
// Türkçe/İngilizce eşanlamlı sözlüğüyle eşleştirip alan adlarına haritalar.
// Kendi dışa aktarımımız (parseWorkbook, excel.js) için değil — bu, ilk kurulum
// göçü (Task 6) için ayrı bir "genel" içe aktarıcı.

const SYNONYMS = {
  name: ['ad soyad', 'adı soyadı', 'isim', 'ad', 'hasta', 'hasta adı', 'isim soyisim', 'ad-soyad', 'name'],
  mother_name: ['anne adı', 'anne'],
  residence: ['ikametgah', 'ikamet', 'adres', 'şehir'],
  birth_date: ['doğum tarihi', 'doğum'],
  diagnosis: ['tanı', 'teşhis', 'hastalık', 'rahatsızlık', 'illness'],
  referral: ['sevk eden', 'sevk', 'yönlendiren', 'referans', 'kaynak', 'referenced', 'referred by'],
  phone: ['telefon', 'tel', 'gsm', 'cep', 'phone'],
  start_date: ['başlangıç', 'başlama', 'ilk geliş', 'başlangıç tarihi', 'first came', 'ilk tarih'],
  end_date: ['bitiş', 'bitiş tarihi', 'tamamlanma', 'done', 'son tarih'],
  amount: ['ödeme', 'tutar', 'ücret', 'ödenen', 'toplam', 'paid', 'how much paid'],
  notes: ['not', 'notlar', 'açıklama'],
};

const FIELD_ORDER = Object.keys(SYNONYMS);

// Türkçe locale'de büyük 'I' harfi noktasız 'ı'ya döner (Ankara→ankara doğru, ama
// İngilizce "Illness"→"ıllness" olur, eşanlamlı sözlükle eşleşmez). Bu yüzden hem
// tr-locale hem düz (ASCII) küçük harfe çevrilmiş biçimi normalize kümesine ekliyoruz;
// böylece 'İsim'→'isim' (tr) ve 'Illness'→'illness' (ASCII) ikisi de eşleşir.
function normalizeHeaderVariants(h) {
  const s = String(h).trim();
  return [s.toLocaleLowerCase('tr'), s.toLowerCase()];
}

// Excel seri sayısını (1900 epoch) yyyy-MM-dd biçimine çevirir.
function serialToIso(n) {
  if (XLSX.SSF && typeof XLSX.SSF.parse_date_code === 'function') {
    const d = XLSX.SSF.parse_date_code(n);
    if (d && d.y) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const ms = Date.UTC(1899, 11, 30) + n * 86400000;
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) return '';
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// İzin veren tarih ayrıştırıcı: dd.MM.yyyy, yyyy-MM-dd veya Excel seri sayısı; aksi halde ''.
function gDate(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'number') return serialToIso(v) || '';
  const s = String(v).trim();
  if (!s) return '';
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

export function parseGeneralWorkbook(input, todayIso = '2026-01-01') {
  let wb;
  try { wb = XLSX.read(input, { type: typeof input === 'string' ? 'base64' : 'array' }); }
  catch { return { ok: false, error: 'Excel dosyası okunamadı.' }; }

  const sheetName = wb.SheetNames[0];
  const sheet = sheetName ? wb.Sheets[sheetName] : null;
  if (!sheet) return { ok: false, error: 'Excel içinde sayfa bulunamadı.' };

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  // Orijinal başlıkları normalize edilmiş biçimden orijinale eşle (tüm sütunlar için).
  const originalHeaders = rows.length ? Object.keys(rows[0]) : [];
  const normToOriginal = new Map();
  for (const h of originalHeaders) {
    for (const n of normalizeHeaderVariants(h)) {
      if (!normToOriginal.has(n)) normToOriginal.set(n, h);
    }
  }

  const mapping = {};
  for (const field of FIELD_ORDER) {
    for (const syn of SYNONYMS[field]) {
      if (normToOriginal.has(syn)) { mapping[field] = normToOriginal.get(syn); break; }
    }
  }

  if (!mapping.name) {
    return { ok: false, error: 'Ad/İsim sütunu bulunamadı. Sütun başlıklarını kontrol edin.' };
  }

  const matchedOriginals = new Set(Object.values(mapping));
  const unmatched = originalHeaders.filter(h => !matchedOriginals.has(h));

  const patients = [];
  const payments = [];
  let pid = 1;
  let payId = 1;

  for (const row of rows) {
    const name = String(row[mapping.name] || '').trim();
    if (!name) continue;
    const id = pid++;
    const start_date = gDate(row[mapping.start_date]) || todayIso;
    const end_date = mapping.end_date ? (gDate(row[mapping.end_date]) || null) : null;
    const birth_date = mapping.birth_date ? (gDate(row[mapping.birth_date]) || null) : null;
    patients.push({
      id,
      name,
      mother_name: mapping.mother_name ? String(row[mapping.mother_name] || '').trim() : '',
      residence: mapping.residence ? String(row[mapping.residence] || '').trim() : '',
      birth_date,
      diagnosis: mapping.diagnosis ? String(row[mapping.diagnosis] || '').trim() : '',
      referral: mapping.referral ? String(row[mapping.referral] || '').trim() : '',
      phone: mapping.phone ? String(row[mapping.phone] || '').trim() : '',
      notes: mapping.notes ? String(row[mapping.notes] || '').trim() : '',
      start_date,
      end_date,
      next_appt: null,
      status: end_date ? 'done' : 'active',
      planned_sessions: null,
    });

    if (mapping.amount) {
      const amount = Number(row[mapping.amount]);
      if (Number.isFinite(amount) && amount > 0) {
        payments.push({
          id: payId++,
          patient_id: id,
          pay_date: start_date,
          amount,
          description: 'Seans',
          status: 'paid',
        });
      }
    }
  }

  return { ok: true, data: { patients, payments, deliveries: [] }, mapping, unmatched };
}
