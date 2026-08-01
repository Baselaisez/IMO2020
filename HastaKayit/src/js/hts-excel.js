// Doktorun eski (~78k satır) HTS / HTS KAYIT Excel dosyalarını içe aktarır.
// Bu dosyalar iki farklı şema kullanıyor ("İSİM SOYİSİM"/MISIR veya "ADI SOYADI"/TL)
// ve "RANDEVU ELDEN" sayfası, sütun başlıkları ile gerçek veri sırası kaydırılmış
// (isim/tarih yer değiştirmiş). Kimlik (uuid) üretimi tamamen içerik-tabanlı (djb2)
// olduğu için parseHtsWorkbook idempotent'tir: aynı workbook iki kez parse edilirse
// aynı uuid kümesi üretilir (satır sırası deterministik olduğu sürece).
import * as XLSX from 'xlsx';
import { normKey } from './importer.js';

const NAME_COL_CANDIDATES = ['İSİM SOYİSİM', 'ADI SOYADI'];
const MOTHER_COL_CANDIDATES = ['ANNE ADI'];
const DURUM_COL_CANDIDATES = ['DURUM'];
const PAY_COL_CANDIDATES = ['TL', 'MISIR'];
const TARIH_COL_CANDIDATES = ['TARİH'];
const ILETISIM_COL_CANDIDATES = ['İLETİŞİM'];

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

function isValidDate(v) {
  return v instanceof Date && !isNaN(v.getTime()) && v.getUTCFullYear() >= 1990;
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

export function isHtsWorkbook(workbook) {
  const sheet = workbook?.Sheets?.['ÖN KAYIT'];
  if (!sheet) return false;
  const rows = sheetRows(sheet);
  const header = rows[0] || [];
  const hasName = findCol(header, NAME_COL_CANDIDATES) !== -1;
  const hasDurum = findCol(header, DURUM_COL_CANDIDATES) !== -1;
  const hasPay = findCol(header, PAY_COL_CANDIDATES) !== -1;
  return hasName && hasDurum && hasPay;
}

export function parseHtsWorkbook(workbook, todayIso) {
  const stats = { totalRows: 0, patients: 0, payments: 0, deliveries: 0, nameless: 0, merged: 0, skipped: 0 };
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
    return false;
  }

  // ---- ÖN KAYIT: patients + payments ----
  const onKayit = workbook?.Sheets?.['ÖN KAYIT'];
  if (onKayit) {
    const rows = sheetRows(onKayit);
    const header = rows[0] || [];
    const nameIdx = findCol(header, NAME_COL_CANDIDATES);
    const motherIdx = findCol(header, MOTHER_COL_CANDIDATES);
    const durumIdx = findCol(header, DURUM_COL_CANDIDATES);
    const payIdx = findCol(header, PAY_COL_CANDIDATES);
    const tarihIdx = findCol(header, TARIH_COL_CANDIDATES);
    const contactIdx = findCol(header, ILETISIM_COL_CANDIDATES);

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

      const validDate = isValidDate(rawTarih) ? rawTarih : null;
      const start_date = validDate ? isoFromDate(validDate) : todayIso;

      let name = String(rawName ?? '').trim();
      const isNameless = name === '' || name === 'İSİM SOYİSİM';
      if (isNameless) {
        stats.nameless++;
        const dateStr = validDate ? ddmmyyyyFromDate(validDate) : `(tarihsiz #${excelRow})`;
        name = `İsimsiz — ${dateStr}`;
      }

      const mother_name = String(rawMother ?? '').trim();
      let diagnosis = String(rawDurum ?? '').trim();
      if (!validDate && typeof rawTarih === 'string' && rawTarih.trim() !== '') {
        diagnosis += ` [tarih: ${rawTarih.trim()}]`;
      }

      const phone = String(rawContact ?? '').replace(/\D/g, '');

      const total = parseAmount(rawPay);
      if (total <= 0 && typeof rawPay === 'string' && rawPay.trim() !== '') {
        diagnosis += ` [ödeme: ${rawPay.trim()}]`;
      }
      diagnosis = diagnosis.trim();

      const normName = fold(name);
      const normMother = fold(mother_name);
      const wordCount = normName.split(' ').filter(Boolean).length;
      const rowKey = djb2([normName, normMother, start_date, total || 0, diagnosis].join('|'));

      let patientUuid;
      const isMergeCandidate = wordCount >= 2 && normMother !== '';
      if (isMergeCandidate) {
        patientUuid = `hts-m-${djb2(normName + '|' + normMother)}`;
      } else {
        patientUuid = `hts-p-${rowKey}`;
      }

      const isNew = registerPatient(patientUuid, { uuid: patientUuid, name, mother_name, diagnosis, phone, start_date });
      if (isMergeCandidate && !isNew) stats.merged++;

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

      const planned_date = isValidDate(dateCell) ? isoFromDate(dateCell) : todayIso;
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
        registerPatient(patientUuid, { uuid: patientUuid, name, mother_name: '', diagnosis: '', phone: '', start_date: todayIso });
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
