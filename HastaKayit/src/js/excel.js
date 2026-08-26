import * as XLSX from 'xlsx';
import { totalPaid, durationMonths, monthlySummary, fmtDate, sessionLabel, sumByStatus } from './compute.js';

// Hata izolasyonu: tek bir bozuk kayıt (end_date < start_date) tüm dışa aktarımı
// düşürmez — sadece o hücre 'GEÇERSİZ' olur (monthlySummary'nin GEÇERSİZ-kova deseni).
function safeDuration(startIso, endIso, todayIso) {
  try {
    return durationMonths(startIso, endIso, todayIso);
  } catch {
    return 'GEÇERSİZ';
  }
}

// Boş satır dizisinde bile başlık satırı üretilsin (0-hastalı dışa aktarım boş sayfa olmasın).
function toSheet(rows, headers) {
  const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
  if (rows.length === 0) XLSX.utils.sheet_add_aoa(ws, [headers]);
  return ws;
}

const HASTALAR_HEADERS = ['Ad Soyad', 'Anne Adı', 'İkametgah', 'Doğum Tarihi', 'Tanı', 'Sevk Eden', 'Başlangıç', 'Bitiş', 'Süre (Ay)', 'Seans', 'Toplam Ödeme (₺)', 'Telefon', 'Durum'];
const ODEMELER_HEADERS = ['Tarih', 'Hasta', 'Tutar (₺)', 'Açıklama', 'Durum'];
const OZET_HEADERS = ['Ay', 'Tahsilat (₺)', 'Bekleyen (₺)', 'Ödeme Sayısı', 'Aktif Hasta'];
const TESLIMATLAR_HEADERS = ['Hasta', 'Yöntem', 'Takip No', 'Planlanan Teslim', 'Saat', 'Teslim Edildi', 'Teslim Tarihi'];

function durumLabel(status) {
  if (status === 'done') return 'Tamamlandı';
  if (status === 'blocked') return 'Asla Bakılmayacak';
  return 'Aktif';
}

export function buildWorkbook(patients, payments, todayIso, deliveries = []) {
  const nameById = Object.fromEntries(patients.map(p => [p.id, p.name]));
  const grouped = {};
  for (const o of payments) (grouped[o.patient_id] ??= []).push(o);

  const hastalar = patients.map(p => ({
    'Ad Soyad': p.name,
    'Anne Adı': p.mother_name || '',
    'İkametgah': p.residence || '',
    'Doğum Tarihi': p.birth_date ? fmtDate(p.birth_date) : '',
    'Tanı': p.diagnosis || '',
    'Sevk Eden': p.referral || '',
    'Başlangıç': fmtDate(p.start_date),
    'Bitiş': p.end_date ? fmtDate(p.end_date) : '',
    'Süre (Ay)': safeDuration(p.start_date, p.end_date, todayIso),
    'Seans': sessionLabel((grouped[p.id] || []).length, p.planned_sessions),
    'Toplam Ödeme (₺)': totalPaid(grouped[p.id] || []),
    'Telefon': p.phone || '',
    'Durum': durumLabel(p.status),
  }));

  const odemeler = [...payments]
    .sort((a, b) => b.pay_date.localeCompare(a.pay_date) || b.id - a.id)
    .map(o => ({
      'Tarih': fmtDate(o.pay_date),
      'Hasta': nameById[o.patient_id] || `#${o.patient_id}`,
      'Tutar (₺)': Number(o.amount),
      'Açıklama': o.description || '',
      'Durum': o.status === 'pending' ? 'Yapılacak' : 'Yapıldı',
    }));

  const ozet = monthlySummary(patients, payments).map(r => {
    const monthPays = payments.filter(o => String(o.pay_date).slice(0, 7) === r.month);
    return {
      'Ay': r.month,
      'Tahsilat (₺)': sumByStatus(monthPays, 'paid'),
      'Bekleyen (₺)': sumByStatus(monthPays, 'pending'),
      'Ödeme Sayısı': r.count,
      'Aktif Hasta': r.activePatients,
    };
  });

  const teslimatlar = [...deliveries]
    // planned_date DESC, but unscheduled (null) deliveries sort LAST, not top.
    .sort((a, b) => {
      const pa = a.planned_date || '', pb = b.planned_date || '';
      if (pa && pb) return pb.localeCompare(pa) || b.id - a.id;
      if (pa) return -1;
      if (pb) return 1;
      return b.id - a.id;
    })
    .map(d => ({
      'Hasta': nameById[d.patient_id] || `#${d.patient_id}`,
      'Yöntem': d.method === 'kargo' ? 'Kargo' : 'Elden',
      'Takip No': d.tracking_no || '',
      'Planlanan Teslim': d.planned_date ? fmtDate(d.planned_date) : '',
      'Saat': d.planned_time || '',
      'Teslim Edildi': d.delivered ? 'Evet' : 'Hayır',
      'Teslim Tarihi': d.delivered_date ? fmtDate(d.delivered_date) : '',
    }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, toSheet(hastalar, HASTALAR_HEADERS), 'Hastalar');
  XLSX.utils.book_append_sheet(wb, toSheet(odemeler, ODEMELER_HEADERS), 'Ödemeler');
  XLSX.utils.book_append_sheet(wb, toSheet(ozet, OZET_HEADERS), 'Aylık Özet');
  XLSX.utils.book_append_sheet(wb, toSheet(teslimatlar, TESLIMATLAR_HEADERS), 'Teslimatlar');
  return wb;
}

export function workbookToBase64(wb) {
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}

// dd.MM.yyyy (dışa aktarım biçimi) veya yyyy-MM-dd kabul eder; aksi halde boş dize.
function parseDate(v) {
  if (!v) return '';
  const s = String(v).trim();
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return '';
}

// Uygulamanın kendi dışa aktarımını (buildWorkbook çıktısı) geri içe aktarır.
export function parseWorkbook(input) {
  let wb;
  // cellDates: tarih hücreleri Date olarak gelsin (yoksa ham Excel sayısı).
  try { wb = XLSX.read(input, { type: typeof input === 'string' ? 'base64' : 'array', cellDates: true }); }
  catch { return { ok: false, error: 'Excel dosyası okunamadı.' }; }
  const H = wb.Sheets['Hastalar'], O = wb.Sheets['Ödemeler'], T = wb.Sheets['Teslimatlar'];
  if (!H) return { ok: false, error: 'Excel içinde "Hastalar" sayfası yok.' };
  const hs = XLSX.utils.sheet_to_json(H), os = O ? XLSX.utils.sheet_to_json(O) : [], ts = T ? XLSX.utils.sheet_to_json(T) : [];
  const patients = [], nameToId = {};
  let pid = 1;
  for (const r of hs) {
    const name = String(r['Ad Soyad'] || '').trim();
    if (!name) return { ok: false, error: 'Hastalar sayfasında adı boş satır var.' };
    const start = parseDate(r['Başlangıç']);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return { ok: false, error: `Geçersiz başlangıç tarihi: ${r['Başlangıç']}` };
    const durum = String(r['Durum'] || '').trim();
    const status = durum === 'Tamamlandı' ? 'done' : durum === 'Asla Bakılmayacak' ? 'blocked' : 'active';
    const seans = String(r['Seans'] || '');
    const planned = seans.includes('/') ? Number(seans.split('/')[1].trim()) : NaN;
    const id = pid++;
    patients.push({ id, name, mother_name: String(r['Anne Adı'] || ''),
      residence: String(r['İkametgah'] || ''), birth_date: parseDate(r['Doğum Tarihi']) || null,
      diagnosis: String(r['Tanı'] || ''),
      referral: String(r['Sevk Eden'] || ''), phone: String(r['Telefon'] || ''), start_date: start,
      end_date: parseDate(r['Bitiş']) || null, next_appt: null, status,
      planned_sessions: Number.isInteger(planned) && planned > 0 ? planned : null });
    if (!(name in nameToId)) nameToId[name] = id;
  }
  const payments = [], deliveries = [];
  let payId = 1, delId = 1;
  for (const r of os) {
    const patient_id = nameToId[String(r['Hasta'] || '').trim()];
    if (!patient_id) continue;
    const amount = Number(r['Tutar (₺)']);
    if (!Number.isFinite(amount) || !(amount > 0)) return { ok: false, error: `Geçersiz ödeme tutarı: ${r['Tutar (₺)']}` };
    const pd = parseDate(r['Tarih']);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pd)) return { ok: false, error: `Geçersiz ödeme tarihi: ${r['Tarih']}` };
    payments.push({ id: payId++, patient_id, pay_date: pd, amount, description: String(r['Açıklama'] || 'Seans'),
      status: String(r['Durum'] || '').trim() === 'Yapılacak' ? 'pending' : 'paid' });
  }
  for (const r of ts) {
    const patient_id = nameToId[String(r['Hasta'] || '').trim()];
    if (!patient_id) continue;
    const ym = String(r['Yöntem'] || '').trim();
    const method = ym === 'Kargo' ? 'kargo' : ym === 'Elden' ? 'elden' : null;
    if (!method) return { ok: false, error: `Geçersiz teslim yöntemi: ${r['Yöntem']}` };
    const delivered = String(r['Teslim Edildi'] || '').trim() === 'Evet' ? 1 : 0;
    const pt = String(r['Saat'] || '').trim();
    deliveries.push({ id: delId++, patient_id, method, tracking_no: String(r['Takip No'] || ''),
      planned_date: parseDate(r['Planlanan Teslim']) || null,
      planned_time: /^\d{2}:\d{2}$/.test(pt) ? pt : null, delivered,
      delivered_date: delivered ? (parseDate(r['Teslim Tarihi']) || null) : null });
  }
  return { ok: true, data: { patients, payments, deliveries } };
}
