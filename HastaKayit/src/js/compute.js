// Geçersiz tutarlar sessizce 0'a dönüşmez — sesli hata (denetim güvenliği).
function num(v) {
  if (v == null || v === '') throw new Error('Geçersiz tutar: ' + v);
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error('Geçersiz tutar: ' + v);
  return n;
}

// Para toplama kuruş (tamsayı) cinsinden yapılır: float sürüklenmesi dışa sızamaz.
function toKurus(v) {
  return Math.round(num(v) * 100);
}

export function totalPaid(payments) {
  return payments.reduce((s, p) => s + toKurus(p.amount), 0) / 100;
}

export function sumByStatus(payments, status) {
  return totalPaid(payments.filter(p => (p.status || 'paid') === status));
}

export function durationMonths(startIso, endIso, todayIso) {
  const days = (Date.parse(endIso || todayIso) - Date.parse(startIso)) / 86400000;
  if (Number.isNaN(days)) throw new Error('Geçersiz tarih.');
  if (days < 0) throw new Error('Bitiş tarihi başlangıçtan önce olamaz.');
  return Math.max(1, Math.round(days / 30.44));
}

const INVALID_MONTH = 'GEÇERSİZ';

export function monthlySummary(patients, payments) {
  const months = {};
  for (const p of payments) {
    // Bozuk pay_date parası kaybolmaz ve sahte bir aya düşmez: GEÇERSİZ kovasına gider.
    const m = /^\d{4}-\d{2}-\d{2}/.test(String(p.pay_date))
      ? String(p.pay_date).slice(0, 7)
      : INVALID_MONTH;
    months[m] ??= { month: m, totalKurus: 0, count: 0 };
    months[m].totalKurus += toKurus(p.amount);
    months[m].count++;
  }
  const out = Object.values(months).sort((a, b) => {
    if (a.month === INVALID_MONTH) return 1;
    if (b.month === INVALID_MONTH) return -1;
    return b.month.localeCompare(a.month);
  });
  for (const row of out) {
    row.total = row.totalKurus / 100;
    delete row.totalKurus;
    row.activePatients = row.month === INVALID_MONTH ? 0 : patients.filter(pt =>
      String(pt.start_date).slice(0, 7) <= row.month &&
      (!pt.end_date || String(pt.end_date).slice(0, 7) >= row.month)
    ).length;
  }
  return out;
}

export function todaysAppointments(patients, todayIso) {
  return patients
    .filter(p => p.next_appt && String(p.next_appt).startsWith(todayIso))
    .sort((a, b) => a.next_appt.localeCompare(b.next_appt));
}

export function fmtTL(n) {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(Number(n) || 0) + ' ₺';
}

// ISO tarih dizesi bekler ('YYYY-MM-DD' veya başı ISO olan daha uzun dize).
export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

export function sessionLabel(sessionCount, plannedSessions) {
  const n = Number(sessionCount) || 0;
  if (plannedSessions == null || plannedSessions === '') return String(n);
  return `${n} / ${Number(plannedSessions)}`;
}

export function fmtDateTime(iso) {
  if (!iso) return '';
  const [date, time] = String(iso).split(' ');
  return `${fmtDate(date)}${time ? ' ' + time : ''}`;
}

export function ageFrom(birthIso, todayIso) {
  if (!birthIso || !/^\d{4}-\d{2}-\d{2}$/.test(String(birthIso))) return null;
  const b = new Date(birthIso + 'T00:00:00'), t = new Date(todayIso + 'T00:00:00');
  if (isNaN(b) || isNaN(t)) return null;
  let age = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) age--;
  return age;
}
export function humanizeLead(min) {
  const n = Number(min) || 0;
  if (n === 0) return '';
  if (n === 1440) return 'Yarın';
  if (n === 60) return 'Bir saat sonra';
  if (n % 60 === 0) return `${n / 60} saat sonra`;
  return `${n} dakika sonra`;
}

/**
 * SOĞUK BAŞLANGIÇTA PIN atlanmalı mı? Saf — testi var.
 *
 * GERÇEK ŞİKÂYET: "PIN'i 10 dakikaya aldım ama 2-3 dakikada yine soruyor."
 * Ayar doğru kaydediliyordu; sorun başka yerdeydi. iPhone, arka plandaki
 * uygulamaları bellek için SONLANDIRIR ve bu uygulama 100.000 kayıtla epey
 * bellek tutuyor — birkaç dakika içinde öldürülmesi olağan. Öldürülünce geri
 * dönüş artık "arka plandan geri gelme" değil, uygulamanın SIFIRDAN açılması
 * olur: `lockedFrom`/`bgAt` gibi bellek içi değerler yok olur ve kilit ekranı
 * ayardan bağımsız olarak PIN ister. Kullanıcının gördüğü şey "ayar
 * çalışmıyor"dur; oysa ayar hiç sorulmamıştır.
 *
 * Çözüm: arka plana geçiş ANI diske yazılır ve açılışta okunur. Süre dolmadıysa
 * PIN sorulmaz. Güvenlikten ödün verilmez, çünkü verilen karar kullanıcının
 * zaten seçtiği karardır: "şu kadar dakika boyunca sorma".
 *
 * Yalnızca SÜRE temelli ayarlar için geçerli:
 *   'switch' → her uygulama değişiminde sorulsun demek; soğuk başlangıç evveliyatla sorar.
 *   'close'  → "sadece uygulama kapanınca" demek; süreç öldüyse uygulama GERÇEKTEN
 *              kapanmıştır, dolayısıyla sorulmalı.
 *
 * Emniyetli taraf her durumda "PIN sor": damga yoksa, bozuksa ya da saat geri
 * alınmışsa false döner.
 */
export function coldStartGrace(policy, bgAtMs, nowMs) {
  const p = policy || '2';
  if (p === 'switch' || p === 'close') return false;
  const bg = Number(bgAtMs);
  if (!Number.isFinite(bg) || bg <= 0) return false;
  const elapsed = Number(nowMs) - bg;
  if (!Number.isFinite(elapsed) || elapsed < 0) return false;
  return elapsed < (Number(p) || 2) * 60000;
}

// PIN-lock policy: given the setting and how long the app was backgrounded (ms),
// should we demand the PIN on resume? Default (null/unknown) = 2 minutes.
export function shouldRequirePin(policy, elapsedMs) {
  const p = policy || '2';
  if (p === 'switch') return true;
  if (p === 'close') return false;
  // Fail closed on clock skew / bad input: a negative or non-finite elapsed
  // (e.g. the user moved the device clock backward to defeat the grace timer)
  // must REQUIRE re-auth, never auto-unlock.
  const e = Number(elapsedMs);
  if (!Number.isFinite(e) || e < 0) return true;
  return e >= (Number(p) || 2) * 60000;
}

/**
 * monthlyAggregates()'in SQL çıktısını aylık özet satırlarına çevirir. Saf.
 *
 * monthlySummary ile aynı sonucu verir ama girdisi tüm hastalar/ödemeler değil,
 * SQLite'ın yaptığı toplama. Ayarlar ekranı 45.000 kayıtta allData() için
 * 814 ms harcıyordu; artık harcamıyor.
 *
 * activePatients: o ayda "açık" olan hasta sayısı = başlangıcı o aya kadar olan
 * hastalar eksi bitişi o aydan ÖNCE olanlar. İki sıralı dizide ikili arama ile
 * hesaplanıyor (her ay için tüm hastaları taramak yerine).
 */
export function monthlySummaryFrom({ payments = [], spans = [] } = {}) {
  const starts = spans.map(s => String(s.sm ?? '')).sort();
  const ends = spans.map(s => s.em).filter(v => v != null && v !== '').map(String).sort();
  const countLE = (arr, value) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= value) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const countLT = (arr, value) => {
    let lo = 0, hi = arr.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < value) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const out = payments.map(p => ({
    month: String(p.month) === '__gecersiz__' ? INVALID_MONTH : String(p.month),
    total: Number(p.kurus || 0) / 100,
    count: Number(p.count || 0),
    activePatients: 0,
  }));
  out.sort((a, b) => {
    if (a.month === INVALID_MONTH) return 1;
    if (b.month === INVALID_MONTH) return -1;
    return b.month.localeCompare(a.month);
  });
  for (const row of out) {
    row.activePatients = row.month === INVALID_MONTH
      ? 0
      : countLE(starts, row.month) - countLT(ends, row.month);
  }
  return out;
}
