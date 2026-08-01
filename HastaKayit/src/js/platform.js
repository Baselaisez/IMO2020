// Tek platform tespiti.
//
// Uygulama artık ÜÇ kabukta çalışıyor ve üçü de AYNI www/ paketini yükler:
//   • iPhone / iPad → Capacitor + WKWebView          → platform() === 'ios'
//   • Mac masaüstü  → Electron + preload köprüsü     → platform() === 'macos'
//   • Android       → Capacitor + Chromium WebView   → platform() === 'android'
//   • tarayıcı      → geliştirme önizlemesi          → platform() === 'web'
//
// Daha önce bu kontrol üç ayrı dosyada (app.js, files.js, ui-voice.js)
// `window.process.versions.electron` diye tekrarlanıyordu. Bu, contextIsolation
// açık bir Electron penceresinde ÇALIŞMAZ (renderer'da `process` yoktur), ayrıca
// Windows/Mac ayrımını da yapamaz. Tespit tek yere alındı; eski kontrol ise
// geriye dönük uyumluluk için hâlâ kabul ediliyor (bkz. legacyElectron).
import { Capacitor } from '@capacitor/core';

// Electron preload'ın contextBridge ile açtığı köprü (electron/preload.cjs).
// contextIsolation kapalı eski bir kabukta bu yoktur; o durumda `process`e bakılır.
function bridge() {
  return typeof window !== 'undefined' ? window.hkDesktop : undefined;
}

function legacyElectron(win = typeof window === 'undefined' ? undefined : window) {
  return !!(win && win.process && win.process.versions && win.process.versions.electron);
}

// Saf: verilen (köprü, window) ikilisinden platform adını üretir. Test edilebilir
// olsun diye dışarıdan enjekte edilebiliyor; varsayılanları gerçek ortamdır.
export function detectPlatform(b = bridge(), win = typeof window === 'undefined' ? undefined : window,
  capPlatform = Capacitor.getPlatform()) {
  if (b) return b.platform === 'darwin' ? 'macos' : b.platform === 'win32' ? 'windows' : 'linux';
  if (legacyElectron(win)) {
    const p = String(win?.navigator?.platform || '');
    return /Mac/i.test(p) ? 'macos' : /Win/i.test(p) ? 'windows' : 'linux';
  }
  if (capPlatform === 'ios' || capPlatform === 'android') return capPlatform;
  return 'web';
}

let cached = null;
export function platform() {
  if (cached === null) cached = detectPlatform();
  return cached;
}

/** Capacitor eklentilerinin (SQLite, bildirim, biyometri) çalıştığı kabuk. */
export function isNative() {
  return Capacitor.isNativePlatform();
}

/** Electron kabuğu (Mac veya Windows masaüstü). */
export function isDesktop() {
  const p = platform();
  return p === 'macos' || p === 'windows' || p === 'linux';
}

export function isMac() { return platform() === 'macos'; }
export function isIOS() { return platform() === 'ios'; }

/**
 * Kullanıcıya gösterilecek platform adı — ayarlar ekranındaki bilgi satırları ve
 * yardım metinleri bunu kullanır, böylece Android'e özel ifadeler iPhone'da
 * görünmez.
 */
export function platformLabel(p = platform()) {
  return { ios: 'iPhone', android: 'Android', macos: 'Mac', windows: 'Windows', linux: 'Linux', web: 'Tarayıcı' }[p] || p;
}
