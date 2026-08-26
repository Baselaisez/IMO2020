// Doktorun eski (~78k satır) HTS / HTS KAYIT Excel dosyalarını içe aktarır.
// Bu dosyalar iki farklı şema kullanıyor ("İSİM SOYİSİM"/MISIR veya "ADI SOYADI"/TL)
// ve "RANDEVU ELDEN" sayfası, sütun başlıkları ile gerçek veri sırası kaydırılmış
// (isim/tarih yer değiştirmiş). Kimlik (uuid) üretimi tamamen içerik-tabanlı (djb2)
// olduğu için parseHtsWorkbook idempotent'tir: aynı workbook iki kez parse edilirse
// aynı uuid kümesi üretilir (satır sırası deterministik olduğu sürece).
import * as XLSX from 'xlsx';
import { normKey } from './importer.js';

// Doktorun dosyaları yıllar içinde ÜÇ farklı başlık takımı kullanmış. Aynı
// alanın adı değiştiği için her biri ayrı bir aday listesi olarak duruyor;
// eksik bir ad, o sütunun sessizce yok sayılması demektir (2026'da tam olarak
// bu oldu: "TANI" ve "FİYAT" tanınmadığı için dosya HTS sayılmadı ve genel
// içe aktarıcıya düştü — orada tarih ve ücret hiç okunmadı).
const NAME_COL_CANDIDATES = ['İSİM SOYİSİM', 'ADI SOYADI', 'AD SOYAD'];
const MOTHER_COL_CANDIDATES = ['ANNE ADI', 'ANNE ADİ', 'ANNESİ'];
const DURUM_COL_CANDIDATES = ['DURUM', 'TANI', 'ŞİKAYET'];
const PAY_COL_CANDIDATES = ['TL', 'MISIR', 'FİYAT', 'ÜCRET'];
const TARIH_COL_CANDIDATES = ['TARİH', 'TARIH'];
const ILETISIM_COL_CANDIDATES = ['İLETİŞİM', 'TELEFON', 'TEL', 'CEP'];
const IKAMET_COL_CANDIDATES = ['İKAMET', 'İKAMETGAH', 'ADRES'];
const DOGUM_COL_CANDIDATES = ['DOĞUM TARİHİ', 'DOĞUM', 'YAŞ'];

const RANDEVU_KISI_CANDIDATES = ['ALACAK KİŞİ'];
const RANDEVU_TARIH_CANDIDATES = ['ALACAK TARİH'];
const RANDEVU_EMANET_CANDIDATES = ['EMANET'];

// Fold Turkish I-family exactly like importer.normKey does, then collapse
// internal whitespace, so "  Ali   Veli " and "ALI VELI" normalize the same.
function fold(s) {
  const [n] = normKey(s, '').split('|');
  return n.replace(/\s+/g, ' ').trim();
}

function findCol(header, candidates) {
  const folded = header.map(h => fold(h));
  for (const cand of candidates) {
    const idx = folded.indexOf(fold(cand));
    if (idx !== -1) return idx;
  }
  return -1;
}

// Classic djb2a (xor variant) -> unsigned 32-bit hex string. Deterministic,
// content-only (no row index, no randomness) so identity survives re-imports.
function djb2(str) {
  let hash = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash = ((hash * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function parseAmount(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v);
  const matches = String(v).match(/\d+/g);
  if (!matches) return 0;
  return matches.reduce((sum, m) => sum + parseInt(m, 10), 0);
}

// Excel'in gün sayacı: 0 = 1899-12-30 (1900 artık yıl hatası bu başlangıçla
// zaten telafi edilmiş olur).
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);
// Alt sınır 1910: bundan küçük sayılar tarih değil YAŞ'tır (defterin "DOĞUM
// TARİHİ" sütununda 13, 37, 52 gibi değerler var). Üst sınır 2200: ötesi tarih
// değil, ölçü/miktar.
const SERIAL_MIN = 3654;     // 1910-01-01
const SERIAL_MAX = 109575;   // 2200-01-01

/**
 * Hücreyi tarihe çevir — Date de olabilir, Excel'in ham gün sayısı da.
 *
 * İkincisi teoride gereksizdi ama pratikte ŞARTTI: uygulama defterleri
 * `XLSX.read(buf, {type:'array'})` ile okuyordu, yani `cellDates` KAPALI, yani
 * her TARİH hücresi bir sayı olarak geliyordu (45524 gibi) ve `instanceof Date`
 * kontrolünden geçemiyordu. Sonuç: 53.096 satırlık defterin TEK BİR tarihi bile
 * okunamıyor, hepsi "bugün" oluyordu. Çağıran taraf artık `cellDates: true`
 * geçiyor; burası da ikinci emniyet olarak duruyor. Saf.
 */
export function toDate(v) {
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number' && Number.isFinite(v) && v >= SERIAL_MIN && v <= SERIAL_MAX) {
    return new Date(EXCEL_EPOCH_MS + Math.round(v) * 86400000);
  }
  return null;
}

// ZİYARET tarihi: 1990 öncesi bir "tarih" bu defterlerde gerçek değil, Excel'in
// 1899/1900 sadece-saat hücresidir. Üst sınır da şart — defterde 4725 ve 7113
// yıllarına düşen 588 satır var (yanlış biçimlendirilmiş hücreler). Üst sınır
// olmasaydı bu kayıtlar "gelecek yüzyılda başlamış" gibi görünür ve aylık
// özette anlamsız satırlar açardı; şimdi tarihsiz sayılıp bir önceki tarihi
// devralıyorlar.
function asDate(v) {
  const d = toDate(v);
  if (!d) return null;
  const y = d.getUTCFullYear();
  return y >= 1990 && y <= new Date().getUTCFullYear() + 1 ? d : null;
}

// DOĞUM tarihi bambaşka bir aralıktır: 1988 doğumlu bir hasta gayet olağan, ama
// ziyaret tarihi olarak 1988 saçmadır. Bu yüzden iki ayrı eşik var.
function asBirthDate(v) {
  const d = toDate(v);
  if (!d) return null;
  const y = d.getUTCFullYear();
  return y >= 1900 && y <= new Date().getUTCFullYear() ? d : null;
}

function isoFromDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function ddmmyyyyFromDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${day}.${m}.${y}`;
}

function sheetRows(sheet) {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
}

/**
 * Bu, doktorun HTS defteri mi?
 *
 * Eski kural üç sütunun (isim + DURUM + TL/MISIR) HEPSİNİ arıyordu ve bu yüzden
 * 2026 dosyasını (TANI + FİYAT başlıklı, üstelik FİYAT sütunu neredeyse boş)
 * reddetti. Dosya sessizce genel içe aktarıcıya düştü, orada TARİH ve FİYAT
 * "eşleşmeyen sütun" diye atıldı ve 53.096 satırlık defter 15.727 hastaya indi.
 *
 * Yeni kural: "ÖN KAYIT" adlı sayfa + bir isim sütunu + yardımcı sütunlardan en
 * az biri. Sayfa adı zaten çok ayırt edici olduğu için bu, yabancı bir Excel'i
 * yanlışlıkla HTS sanma riskini artırmaz.
 */
export function isHtsWorkbook(workbook) {
  const sheet = workbook?.Sheets?.['ÖN KAYIT'];
  if (!sheet) return false;
  const rows = sheetRows(sheet);
  const header = rows[0] || [];
  if (findCol(header, NAME_COL_CANDIDATES) === -1) return false;
  return [DURUM_COL_CANDIDATES, PAY_COL_CANDIDATES, TARIH_COL_CANDIDATES, MOTHER_COL_CANDIDATES]
    .some(c => findCol(header, c) !== -1);
}

/**
 * "DOĞUM TARİHİ" sütunu bu defterlerde iki farklı şey tutuyor: bazen gerçek bir
 * tarih, ÇOĞU ZAMAN sadece yaş (13, 37, hatta `52"`). İkisini karıştırmamak
 * gerek — yaşı doğum tarihi diye kaydetmek veriyi bozar. Saf.
 * @returns {{birth_date: string|null, age: number|null}}
 */
export function parseBirthOrAge(v) {
  const d = asBirthDate(v);
  if (d) return { birth_date: isoFromDate(d), age: null };
  if (v === '' || v === null || v === undefined) return { birth_date: null, age: null };
  // Excel'in 1899/1900 "sadece saat" hücreleri asBirthDate'ten zaten geçemez.
  if (v instanceof Date) return { birth_date: null, age: null };
  const m = String(v).match(/\d+/);
  if (!m) return { birth_date: null, age: null };
  const n = parseInt(m[0], 10);
  return n >= 1 && n <= 120 ? { birth_date: null, age: n } : { birth_date: null, age: null };
}

export function parseHtsWorkbook(workbook, todayIso) {
  const stats = {
    totalRows: 0, patients: 0, payments: 0, deliveries: 0,
    nameless: 0, named: 0, anonymous: 0, merged: 0, skipped: 0, emptyRows: 0,
    dated: 0, dateCarried: 0, undated: 0,
    columns: {}, ignoredColumns: [],
  };
  const patientsByUuid = new Map(); // uuid -> patient record (insertion order preserved)
  const paymentsByUuid = new Map();
  const deliveriesByUuid = new Map();
  const nameIndex = new Map(); // normName -> patient uuid (first match wins)

  function registerPatient(uuid, record) {
    if (!patientsByUuid.has(uuid)) {
      patientsByUuid.set(uuid, record);
      const nn = fold(record.name);
      if (nn && !nameIndex.has(nn)) nameIndex.set(nn, uuid);
      return true;
    }
    // Already exists: prefer a real name over a still-nameless one.
    const existing = patientsByUuid.get(uuid);
    if (existing.name.startsWith('İsimsiz —') && !record.name.startsWith('İsimsiz —')) {
      existing.name = record.name;
      const nn = fold(record.name);
      if (nn && !nameIndex.has(nn)) nameIndex.set(nn, uuid);
    }
    // Aynı kişinin başka bir satırında dolu olan alanı KAYBETME: defterde bir
    // hastanın telefonu bir yıl, ikametgahı başka bir yıl yazılmış olabiliyor.
    // Yalnızca boş alanlar doldurulur — mevcut bir değerin üzerine yazılmaz.
    for (const k of ['mother_name', 'phone', 'residence', 'notes']) {
      if (!existing[k] && record[k]) existing[k] = record[k];
    }
    if (!existing.birth_date && record.birth_date) existing.birth_date = record.birth_date;
    // Tanı satır satır değişiyor (her ziyaretin kendi şikayeti); birikmeli tut.
    if (record.diagnosis && !existing.diagnosis.includes(record.diagnosis)) {
      existing.diagnosis = existing.diagnosis ? `${existing.diagnosis} · ${record.diagnosis}` : record.diagnosis;
    }
    // Defterdeki EN ERKEN tarih hastanın başlangıcıdır.
    if (record.start_date && record.start_date < existing.start_date) existing.start_date = record.start_date;
    return false;
  }

  // ---- ÖN KAYIT: patients + payments ----
  const onKayit = workbook?.Sheets?.['ÖN KAYIT'];
  if (onKayit) {
    const rows = sheetRows(onKayit);
    let lastValidDate = null; // kronolojik defterde devralınan son geçerli tarih
    const header = rows[0] || [];
    const nameIdx = findCol(header, NAME_COL_CANDIDATES);
    const motherIdx = findCol(header, MOTHER_COL_CANDIDATES);
    const durumIdx = findCol(header, DURUM_COL_CANDIDATES);
    const payIdx = findCol(header, PAY_COL_CANDIDATES);
    const tarihIdx = findCol(header, TARIH_COL_CANDIDATES);
    const contactIdx = findCol(header, ILETISIM_COL_CANDIDATES);
    const ikametIdx = findCol(header, IKAMET_COL_CANDIDATES);
    const dogumIdx = findCol(header, DOGUM_COL_CANDIDATES);
    stats.columns = {
      isim: nameIdx >= 0 ? header[nameIdx] : null,
      anne: motherIdx >= 0 ? header[motherIdx] : null,
      tani: durumIdx >= 0 ? header[durumIdx] : null,
      ucret: payIdx >= 0 ? header[payIdx] : null,
      tarih: tarihIdx >= 0 ? header[tarihIdx] : null,
      telefon: contactIdx >= 0 ? header[contactIdx] : null,
      ikamet: ikametIdx >= 0 ? header[ikametIdx] : null,
      dogum: dogumIdx >= 0 ? header[dogumIdx] : null,
    };
    const usedIdx = new Set([nameIdx, motherIdx, durumIdx, payIdx, tarihIdx, contactIdx, ikametIdx, dogumIdx].filter(i => i >= 0));
    stats.ignoredColumns = header
      .map((h, i) => ({ h: String(h ?? '').trim(), i }))
      .filter(c => c.h && !usedIdx.has(c.i))
      .map(c => c.h);

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const excelRow = i + 1;
      stats.totalRows++;

      const rawName = nameIdx >= 0 ? row[nameIdx] : '';
      const rawMother = motherIdx >= 0 ? row[motherIdx] : '';
      const rawDurum = durumIdx >= 0 ? row[durumIdx] : '';
      const rawPay = payIdx >= 0 ? row[payIdx] : '';
      const rawTarih = tarihIdx >= 0 ? row[tarihIdx] : '';
      const rawContact = contactIdx >= 0 ? row[contactIdx] : '';
      const rawIkamet = ikametIdx >= 0 ? row[ikametIdx] : '';
      const rawDogum = dogumIdx >= 0 ? row[dogumIdx] : '';

      // TARİH dışındaki her şeyi boş olan satır kayıt değildir (defterin
      // sonundaki tek tarihli boş satır gibi). Bunlar "İsimsiz — …" hastasına
      // dönüşürse liste anlamsız kayıtlarla dolar.
      const hasContent = [rawName, rawMother, rawDurum, rawPay, rawContact, rawIkamet, rawDogum]
        .some(v => String(v ?? '').trim() !== '');
      if (!hasContent) { stats.emptyRows++; continue; }

      const validDate = asDate(rawTarih);
      // Defter KRONOLOJİK: satırlar en eskiden en yeniye sıralı. Tarihi
      // okunamayan satır (Excel'in 1899 "sadece saat" hücreleri, elle yazılmış
      // metinler — bu dosyada 13.871 satır) için hepsini BUGÜNE yazmak, o
      // kayıtları 2026 Ağustos'ta başlamış gibi gösterirdi ve aylık özeti
      // bozardı. Bunun yerine defterdeki bir önceki geçerli tarih devralınır;
      // ham hücre metni zaten tanıya [tarih: …] olarak ekleniyor, yani tahmin
      // gizlenmiyor.
      if (validDate) { stats.dated++; lastValidDate = validDate; }
      else if (lastValidDate) stats.dateCarried++;
      else stats.undated++;
      const effectiveDate = validDate || lastValidDate;
      const start_date = effectiveDate ? isoFromDate(effectiveDate) : todayIso;

      let name = String(rawName ?? '').trim();
      // "İSİM SOYİSİM" bir isim değil, eski defterde adın hiç yazılmadığı
      // satırların yer tutucusu (bu dosyada 28.965 satır). Genel içe aktarıcı
      // bunu gerçek bir ad sanıp hepsini TEK hastada birleştiriyordu.
      const isNameless = name === '' || fold(name) === fold('İSİM SOYİSİM');
      if (isNameless) {
        stats.nameless++;
        const dateStr = effectiveDate ? ddmmyyyyFromDate(effectiveDate) : `(tarihsiz #${excelRow})`;
        name = `İsimsiz — ${dateStr}`;
      }

      const mother_name = String(rawMother ?? '').trim();
      let diagnosis = String(rawDurum ?? '').trim();
      if (!validDate && typeof rawTarih === 'string' && rawTarih.trim() !== '') {
        diagnosis += ` [tarih: ${rawTarih.trim()}]`;
      }

      const phone = String(rawContact ?? '').replace(/\D/g, '');
      const residence = String(rawIkamet ?? '').trim();
      const { birth_date, age } = parseBirthOrAge(rawDogum);
      // Yaş bir tarih değildir, o yüzden birth_date'e yazılmaz; kaybolmaması
      // için nota düşülür ve hangi tarihteki yaş olduğu belirtilir.
      const notes = age != null ? `Yaş: ${age}${validDate ? ` (${ddmmyyyyFromDate(validDate)})` : ''}` : '';

      const total = parseAmount(rawPay);
      if (total <= 0 && typeof rawPay === 'string' && rawPay.trim() !== '') {
        diagnosis += ` [ödeme: ${rawPay.trim()}]`;
      }
      diagnosis = diagnosis.trim();

      const normName = fold(name);
      const normMother = fold(mother_name);
      const wordCount = normName.split(' ').filter(Boolean).length;
      const rowKey = djb2([normName, normMother, start_date, total || 0, diagnosis].join('|'));

      // Aynı kişiyi birleştirmek için İSİM TEK BAŞINA yetmez — "AYŞE YILMAZ"
      // defterde farklı kişiler olabilir. İkinci bir güçlü kanıt aranır:
      // anne adı ya da telefon numarası. İkisi de yoksa satır kendi başına bir
      // kayıt olarak durur; yanlış birleştirmek, ayrı durmaktan daha kötüdür.
      const normPhone = phone.length >= 10 ? phone.slice(-10) : ''; // 0/+90 önekleri farklı yazılmış olabiliyor
      let patientUuid;
      let isMergeCandidate = false;
      if (wordCount >= 2 && normMother !== '') {
        isMergeCandidate = true;
        patientUuid = `hts-m-${djb2(normName + '|' + normMother)}`;
      } else if (wordCount >= 2 && normPhone !== '') {
        isMergeCandidate = true;
        patientUuid = `hts-t-${djb2(normName + '|' + normPhone)}`;
      } else {
        patientUuid = `hts-p-${rowKey}`;
      }

      const isNew = registerPatient(patientUuid, { uuid: patientUuid, name, mother_name, diagnosis, phone, residence, birth_date, notes, start_date });
      if (isMergeCandidate && !isNew) stats.merged++;
      if (isNameless) stats.anonymous++; else stats.named++;

      if (total > 0) {
        const paymentUuid = `hts-y-${rowKey}`;
        if (!paymentsByUuid.has(paymentUuid)) {
          paymentsByUuid.set(paymentUuid, {
            uuid: paymentUuid,
            patient_uuid: patientUuid,
            pay_date: start_date,
            amount: total,
            status: 'paid',
            description: String(rawPay).trim(),
          });
        }
      }
    }
  }

  // ---- RANDEVU ELDEN: deliveries ----
  const randevu = workbook?.Sheets?.['RANDEVU ELDEN'];
  if (randevu) {
    const rows = sheetRows(randevu);
    const header = rows[0] || [];
    const kisiIdx = findCol(header, RANDEVU_KISI_CANDIDATES);
    const tarihIdx = findCol(header, RANDEVU_TARIH_CANDIDATES);
    const emanetIdx = findCol(header, RANDEVU_EMANET_CANDIDATES);
    const kisiCol = kisiIdx >= 0 ? kisiIdx : 0;
    const tarihCol = tarihIdx >= 0 ? tarihIdx : 5;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      stats.totalRows++;

      const kisiVal = row[kisiCol];
      const tarihVal = row[tarihCol];
      // Header labels are unreliable here (doctor's sheet has name/date swapped
      // for most historical rows); trust whichever cell actually IS a Date.
      let dateCell, nameCell;
      if (kisiVal instanceof Date) { dateCell = kisiVal; nameCell = tarihVal; }
      else if (tarihVal instanceof Date) { dateCell = tarihVal; nameCell = kisiVal; }
      else { dateCell = tarihVal; nameCell = kisiVal; } // neither is a real Date: fall back to header-literal mapping

      const name = String(nameCell ?? '').trim();
      if (name === '') { stats.skipped++; continue; }

      const plannedDateObj = asDate(dateCell);
      const planned_date = plannedDateObj ? isoFromDate(plannedDateObj) : todayIso;
      const emanetRaw = emanetIdx >= 0 ? row[emanetIdx] : '';
      const amount = parseAmount(emanetRaw);

      let description = 'Elden teslim';
      if (emanetRaw !== '' && emanetRaw !== null && emanetRaw !== undefined) {
        description += ` (${String(emanetRaw).trim()})`;
      }

      const normName = fold(name);
      let patientUuid = nameIndex.get(normName);
      if (!patientUuid) {
        patientUuid = `hts-p-${djb2(normName)}`;
        registerPatient(patientUuid, { uuid: patientUuid, name, mother_name: '', diagnosis: '', phone: '', residence: '', birth_date: null, notes: '', start_date: planned_date });
      }

      const deliveryUuid = `hts-d-${djb2(normName + '|' + planned_date + '|' + amount)}`;
      if (!deliveriesByUuid.has(deliveryUuid)) {
        deliveriesByUuid.set(deliveryUuid, {
          uuid: deliveryUuid,
          patient_uuid: patientUuid,
          method: 'elden',
          planned_date,
          delivered: 0,
          description,
        });
      }
    }
  }

  const patients = [...patientsByUuid.values()];
  const payments = [...paymentsByUuid.values()];
  const deliveries = [...deliveriesByUuid.values()];
  stats.patients = patients.length;
  stats.payments = payments.length;
  stats.deliveries = deliveries.length;

  return { patients, payments, deliveries, stats };
}
