// autosave.js — hasta formunun kendiliğinden kaydedilmesi.
//
// İSTEK: "en gerekli alanları girdiklerinde, ✅ düğmesine basmasalar bile
// uygulama 7-10 saniye içinde kaydetsin; kayıt ekranında beklemek istemiyoruz."
//
// TASARIM KARARLARI (hepsi bilerek)
//
// 1. ASLA MÜKERRER KAYIT. İlk otomatik kayıt yeni hastayı OLUŞTURUR; o andan
//    sonra aynı form aynı kaydı GÜNCELLER. Bunu sağlayan şey `onSaved`
//    geri çağrısıyla çağıranın (ui-form.js) state.editing/currentId'yi
//    çevirmesidir — yani ✅ düğmesi de artık aynı kaydı günceller.
//
// 2. ASLA YAZARKEN KESME. Sayaç her tuş vuruşunda sıfırlanır; yalnızca doktor
//    yazmayı bıraktıktan sonra çalışır. Odak, ekran, kaydırma konumu değişmez.
//
// 3. ASLA SESSİZ OLMAMA. Her otomatik kayıt formda görünür bir satır bırakır
//    ("Otomatik kaydedildi 20:41 · Geri Al"). Sessiz kayıt, doktorun bilmediği
//    bir hasta kaydı demektir; bu kabul edilemez.
//
// 4. ASLA YARIM KAYIT. "Gerekli alanlar" = ad (en az 3 harf, en az bir boşluk
//    ARAMAZ — tek isimli hasta olabilir) + başlangıç tarihi (zaten dolu gelir).
//    Ad yoksa hiçbir şey olmaz; zaten veritabanı da adsız kaydı kabul etmez.
//
// 5. GERİ ALINABİLİR. Otomatik OLUŞTURULAN (güncellenen değil) kayıt tek
//    dokunuşla silinebilir.
//
// 6. KAPATILABİLİR. Ayarlar → "Otomatik kayıt": Kapalı / 5 / 8 / 15 sn.

export const AUTOSAVE_DEFAULT_MS = 8000;

// Ayarlar ekranındaki seçeneklerin karşılığı. 'off' dışındakiler saniyedir.
export function autosaveDelayMs(setting) {
  if (setting === 'off') return 0;
  const n = Number(setting);
  return Number.isFinite(n) && n >= 3 && n <= 60 ? n * 1000 : AUTOSAVE_DEFAULT_MS;
}

/**
 * Bu form otomatik kaydedilmeye HAZIR mı? Saf — testi var.
 *
 * Tek şart addır. Adı "Ali" diye yazmaya başlayan biri 3. harfte eşiği geçer
 * ama sayaç son tuştan sonra başladığı için yazmayı sürdürdüğü sürece kayıt
 * olmaz; asıl koruma sayaç, eşik değil.
 */
export function readyToAutosave(values) {
  const name = String(values?.name ?? '').trim();
  if (name.length < 3) return false;
  // Sadece rakam/noktalama olan bir "ad" gerçek bir ad değildir.
  if (!/[A-Za-zÇĞİIÖŞÜçğıöşüÂÎÛâîû]{3}/.test(name)) return false;
  if (!String(values?.start_date ?? '').trim()) return false;
  return true;
}

/**
 * Bir öncekiyle aynı içerik mi? Aynıysa tekrar yazmaya gerek yok — hem diske
 * boşuna yazmayalım hem "Otomatik kaydedildi" satırı durup dururken yenilenmesin.
 * Saf.
 */
export function sameValues(a, b) {
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (String(a[k] ?? '') !== String(b[k] ?? '')) return false;
  }
  return true;
}

/**
 * Sayaç. DOM bilmez; ui-form.js ona değerleri ve kaydetme işini verir.
 *
 * @param {object} opts
 * @param {() => object} opts.getValues      formun o anki değerleri
 * @param {() => number} opts.getDelayMs     0 = kapalı
 * @param {(values) => Promise<any>} opts.save  gerçek kaydetme (ekle veya güncelle)
 * @param {(info) => void} [opts.onSaved]    kaydedildikten sonra
 * @param {(err) => void} [opts.onError]
 * @param {() => boolean} [opts.isActive]    form hâlâ açık mı
 */
export function createAutosave(opts) {
  let timer = null;
  let lastSaved = null;
  let running = false;

  function cancel() { clearTimeout(timer); timer = null; }

  // Yeni bir form açıldı: geçmiş sayaç ve "en son kaydedilen" hafızası sıfırlanır.
  function reset() { cancel(); lastSaved = null; }

  async function runNow() {
    cancel();
    if (running) return { skipped: 'busy' };
    if (opts.isActive && !opts.isActive()) return { skipped: 'inactive' };
    const values = opts.getValues();
    if (!readyToAutosave(values)) return { skipped: 'incomplete' };
    if (sameValues(lastSaved, values)) return { skipped: 'unchanged' };
    running = true;
    try {
      const info = await opts.save(values);
      lastSaved = { ...values };
      opts.onSaved?.(info);
      return { saved: true, info };
    } catch (e) {
      opts.onError?.(e);
      return { error: e };
    } finally {
      running = false;
    }
  }

  // Her tuş vuruşunda çağrılır: sayacı baştan başlatır.
  function bump() {
    cancel();
    const delay = opts.getDelayMs();
    if (!delay) return;
    timer = setTimeout(() => { timer = null; runNow(); }, delay);
  }

  // Formdan çıkılırken: bekleyen bir sayaç varsa BEKLETME, hemen kaydet.
  // "Kayıt ekranında beklemek istemiyoruz" isteğinin diğer yarısı budur.
  async function flush() {
    if (!timer) return { skipped: 'idle' };
    return runNow();
  }

  return { bump, flush, runNow, reset, cancel, isPending: () => !!timer };
}
