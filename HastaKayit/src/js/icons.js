// icons.js — Uygulamanın simge seti.
//
// NEDEN VAR (gerçek bir arıza)
// Arayüzdeki bütün simgeler EMOJİ karakteriydi: ⚙️ 🏠 ← ✅ ✏️ 🎤 ⚡ ☑️ 🔍 ⛔ …
// Doktorun Mac'inde bu karakterlerin hiçbiri çizilmedi. Sonuç: üst çubuk
// bomboş göründü, "Ayarlar", "Geri", "Ana menü", "Kaydet", "Düzenle", "Hızlı
// Ekle" ve "Seç" düğmeleri EKRANDA HİÇ YOKMUŞ gibi oldu — düğmeler oradaydı,
// tıklanabiliyordu, ama görünmüyorlardı. Arama kutusundaki 🔍 ve "Asla
// Bakılmayacak" çipindeki ⛔ de kayıptı. Hayatta kalan tek simge, zaten SVG
// olarak çizilen yeşil "Metinden Hasta Ekle" düğmesiydi — çözümü de o gösterdi.
//
// Emoji bir YAZI TİPİNE bağlıdır (macOS'ta Apple Color Emoji). Yazı tipi
// bozulursa, devre dışı kalırsa ya da yazı tipi önbelleği bozulursa simge
// sessizce kaybolur ve geriye tıklanabilir ama görünmez bir düğme kalır.
// Bir tıbbi kayıt uygulamasında "Kaydet" düğmesinin görünmemesi kabul edilemez.
//
// SVG hiçbir yazı tipine bağlı değildir: aynı çizim her Mac'te, her iPhone'da
// ve her Android'de birebir aynı görünür. Üstelik `currentColor` sayesinde
// düğmenin rengini alır (üst çubukta beyaz, yeşil Kaydet'te yeşil).
//
// TEK KAYNAK: index.html içindeki statik SVG'ler de buradaki çizimlerle AYNI
// olmak zorunda (test/icons.test.mjs bunu kilitliyor). Statik HTML'e gömülü
// olmalarının sebebi, JavaScript hiç çalışmasa bile düğmelerin görünür
// kalması.

/**
 * Simge çizimleri. Hepsi 24×24 kutuda, çizgi tabanlı ve `currentColor`
 * kullanır — böylece renk düğmeden miras alınır.
 */
export const ICON_PATHS = {
  // Gezinme
  back: '<path d="M15 5l-7 7 7 7"/>',
  home: '<path d="M4 10.5L12 4l8 6.5"/><path d="M6.5 9.5V20h11V9.5"/><path d="M10 20v-5.5h4V20"/>',
  // Eylem
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8l1.4 2.6 2.9-.5 .5 2.9 2.6 1.4-1.6 2.5 1.6 2.5-2.6 1.4-.5 2.9-2.9-.5L12 21.2l-1.4-2.6-2.9.5-.5-2.9-2.6-1.4L6.2 12 4.6 9.5l2.6-1.4.5-2.9 2.9.5z"/>',
  bolt: '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  select: '<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 12.2l2.8 2.8L16.5 9.3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0"/><path d="M12 18v3"/>',
  camera: '<path d="M3.5 8.5h3l1.6-2.5h5.8l1.6 2.5h3V19h-15z"/><circle cx="12" cy="13.5" r="3.4"/>',
  clipboard: '<rect x="8" y="3" width="8" height="3.4" rx="1"/><path d="M8.5 4.7H6.5V21h11V4.7h-2"/><path d="M9.5 11h5M9.5 14.5h5M9.5 18h3"/>',
  trash: '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4h5v2.5"/><path d="M6.5 6.5L7.5 21h9l1-14.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.4 15.4L21 21"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 18L18 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  // Veri / dosya
  chart: '<path d="M4 20h16"/><rect x="6" y="11" width="3.2" height="6"/><rect x="11" y="6.5" width="3.2" height="10.5"/><rect x="16" y="13.5" width="3.2" height="3.5"/>',
  save: '<path d="M5 3.5h10.5L20 8v12.5H5z"/><path d="M8.5 3.5v6h7v-6"/><rect x="8" y="13" width="8" height="5.5"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h6M9 19h3.5"/>',
  restore: '<path d="M4 12a8 8 0 1 1 2.6 5.9"/><path d="M3.5 19.5V14h5.5"/>',
  importIn: '<path d="M12 3.5v10.5"/><path d="M8 10.5l4 4 4-4"/><path d="M4.5 18.5h15"/>',
  books: '<rect x="4" y="4" width="4" height="16" rx="1"/><rect x="9.5" y="4" width="4" height="16" rx="1"/><path d="M15.5 5.6l3.6 1 -3.4 13.1 -3.6-1z"/>',
  broom: '<path d="M14.5 3.5L19 8"/><path d="M12.5 7.5L4.5 15.5l4 4 8-8z"/><path d="M4.5 19.5l-1.5 1.5"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9"/><path d="M17.5 12v3.5"/><path d="M20.5 12v2.5"/>',
  lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2"/><path d="M8 10V7.5a4 4 0 118 0V10"/>',
  unlock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2"/><path d="M8 10V7.5a4 4 0 017.5-2"/>',
  folder: '<path d="M3.5 6.5h6l2 2.5h9V19h-17z"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.3-4.3"/><path d="M4 13a8 8 0 0 0 14.3 4.3"/><path d="M4.5 3v4h4"/><path d="M19.5 21v-4h-4"/>',
  help: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.5 2.5 0 114.3 2c-.9.8-1.9 1.3-1.9 2.6"/><path d="M12 17.3v.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  calendar: '<rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17"/><path d="M8 3.5v4M16 3.5v4"/>',
  box: '<path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5 3.5 16.5z"/><path d="M3.5 7.5L12 11.5l8.5-4"/><path d="M12 11.5v9"/>',
  hand: '<path d="M8 11V5.5a1.6 1.6 0 013.2 0V11"/><path d="M11.2 10.5V4.6a1.6 1.6 0 013.2 0V11"/><path d="M14.4 11V6.8a1.6 1.6 0 013.2 0V14a6.5 6.5 0 01-6.5 6.5h-.6A6.5 6.5 0 014 14v-1.5a1.6 1.6 0 013.2 0V15"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.3 2"/>',
  undo: '<path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 010 11h-3"/>',
  warn: '<path d="M12 3.8L21 19.5H3z"/><path d="M12 9.8v4.4"/><path d="M12 17v.3"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  pin: '<path d="M12 21s6.5-6.1 6.5-11A6.5 6.5 0 005.5 10c0 4.9 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  phone: '<path d="M6.5 3.5h3l1.6 4-2 1.5a12 12 0 005.9 5.9l1.5-2 4 1.6v3a2 2 0 01-2.2 2A16.5 16.5 0 014.5 5.7a2 2 0 012-2.2z"/>',
  bell: '<path d="M6.5 10a5.5 5.5 0 0111 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10z"/><path d="M10 19a2.2 2.2 0 004 0"/>',
};

/** `title`/`aria-label` yoksa en azından anlamlı bir ad kalsın diye. */
export const ICON_LABELS = {
  back: 'Geri', home: 'Ana menü', check: 'Kaydet', edit: 'Düzenle',
  settings: 'Ayarlar', bolt: 'Hızlı Ekle', select: 'Seç', mic: 'Sesli yaz',
  camera: 'Fotoğraf', clipboard: 'Panodan yapıştır', trash: 'Sil',
  search: 'Ara', ban: 'Engelli', receipt: 'Dekont',
};

/**
 * Bir simgenin SVG metni. Saf.
 *
 * `aria-hidden`: düğmenin kendi `aria-label`'ı okunsun, simge iki kez
 * seslendirilmesin. `focusable="false"`: eski tarayıcılarda SVG sekme sırasına
 * girmesin.
 *
 * @param {keyof ICON_PATHS} name
 * @param {number} size kenar uzunluğu (px)
 */
export function iconHtml(name, size = 20) {
  const d = ICON_PATHS[name];
  if (!d) throw new Error(`Bilinmeyen simge: ${name}`);
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" `
    + `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" `
    + `aria-hidden="true" focusable="false">${d}</svg>`;
}

/**
 * Var olan bir düğmenin içini simgeyle değiştirir ve erişilebilirlik
 * etiketlerini korur/tamamlar. Düğme yoksa sessizce geçer: simge bir
 * SÜSLEMEDİR, eksikliği akışı durdurmamalı.
 */
export function setIcon(el, name, label) {
  if (!el) return;
  el.innerHTML = iconHtml(name);
  const text = label || ICON_LABELS[name];
  if (text) {
    if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', text);
    if (!el.getAttribute('title')) el.setAttribute('title', text);
  }
}

/** Etiketli düğme: simge + yazı. Yazı HER ZAMAN kalır (simge sadece destek). */
export function iconLabelHtml(name, text, size = 18) {
  return `${iconHtml(name, size)}<span>${text}</span>`;
}
