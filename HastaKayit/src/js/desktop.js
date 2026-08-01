// Masaüstü (Electron) köprüsü — renderer tarafındaki TEK dosya sistemi kapısı.
//
// NEDEN KÖPRÜ, NEDEN DOĞRUDAN `window.require('fs')` DEĞİL
// Eski Windows kabuğu `nodeIntegration: true` ile açılıyordu; renderer içinde
// tüm Node API'si vardı. Mac sürümü için pencereyi `contextIsolation: true` +
// `nodeIntegration: false` ile açıyoruz (Electron'un güvenli varsayılanı ve
// hardened runtime altında imzalama/noterleme için istenen yapı). O modda
// renderer'da `require` YOKTUR — dosya işleri ana sürece IPC ile taşınır.
//
// Geriye dönük uyumluluk: köprü bulunamazsa (eski kabuk) aynı işlemler
// `window.require` ile senkron olarak yapılır. Böylece bu dosyayı kullanan
// db-desktop.js ve files.js iki kabukta da değişmeden çalışır.
import { isDesktop } from './platform.js';

function bridge() {
  return typeof window !== 'undefined' ? window.hkDesktop : undefined;
}

export function hasDesktop() {
  return isDesktop();
}

// --- Eski (nodeIntegration) kabuk için yedek uygulama -----------------------
function legacy() {
  const fs = window.require('fs');
  const path = window.require('path');
  const os = window.require('os');
  const base = path.join(os.homedir(), 'HastaKayit');
  const dirOf = kind => (kind === 'daily' ? path.join(base, 'daily')
    : kind === 'backups' ? path.join(base, 'backups') : base);
  return {
    base, fs, path,
    async dataDir() { return base; },
    async readDb() {
      const f = path.join(base, 'hastakayit.sqlite');
      return fs.existsSync(f) ? new Uint8Array(fs.readFileSync(f)) : null;
    },
    async writeDb(bytes) {
      fs.mkdirSync(base, { recursive: true });
      fs.writeFileSync(path.join(base, 'hastakayit.sqlite'), Buffer.from(bytes));
    },
    async readWasm() {
      const url = window.require('url');
      const wwwDir = url.fileURLToPath(window.location.href.replace(/[^/]*$/, ''));
      const assetsDir = path.join(wwwDir, 'assets');
      const name = fs.readdirSync(assetsDir).find(f => f.endsWith('.wasm'));
      return new Uint8Array(fs.readFileSync(path.join(assetsDir, name)));
    },
    async writeText(kind, name, text) {
      const dir = dirOf(kind);
      fs.mkdirSync(dir, { recursive: true });
      const full = path.join(dir, name);
      fs.writeFileSync(full, text, 'utf8');
      return full;
    },
    async readText(kind, name) { return fs.readFileSync(path.join(dirOf(kind), name), 'utf8'); },
    async list(kind, prefix = '') {
      try { return fs.readdirSync(dirOf(kind)).filter(f => f.startsWith(prefix)); } catch { return []; }
    },
    async remove(kind, name) { try { fs.unlinkSync(path.join(dirOf(kind), name)); } catch {} },
    async saveExport(name, base64) {
      // Eski kabukta kaydetme paneli yok: indirilenler klasörüne yazılır.
      const dl = path.join(window.require('os').homedir(), 'Downloads');
      fs.mkdirSync(dl, { recursive: true });
      const full = path.join(dl, name);
      fs.writeFileSync(full, Buffer.from(base64, 'base64'));
      return full;
    },
    onBeforeQuit() {},
    async readyToClose() {},
    async revealDataDir() {},
  };
}

let impl = null;
function api() {
  if (impl) return impl;
  impl = bridge() || legacy();
  return impl;
}

export const desktop = {
  dataDir: () => api().dataDir(),
  readDb: () => api().readDb(),
  writeDb: bytes => api().writeDb(bytes),
  readWasm: () => api().readWasm(),
  writeText: (kind, name, text) => api().writeText(kind, name, text),
  readText: (kind, name) => api().readText(kind, name),
  list: (kind, prefix) => api().list(kind, prefix),
  remove: (kind, name) => api().remove(kind, name),
  saveExport: (name, base64, mime) => api().saveExport(name, base64, mime),
  onBeforeQuit: cb => api().onBeforeQuit(cb),
  readyToClose: () => api().readyToClose(),
  revealDataDir: () => api().revealDataDir(),
  onMenu: cb => api().onMenu?.(cb),
};

/**
 * Saf yardımcı: bir klasördeki dosya listesini adına göre eskiden yeniye sıralar
 * ve en yeni `keep` tanesi DIŞINDA kalanları (silinecekleri) döndürür.
 * Dosya adları makine üretimi (ISO damgalı) olduğu için sıralama ordinaldir —
 * yerel ayara göre karşılaştırma (tr locale) 'I' harfi yüzünden sapabilir.
 */
export function toDelete(names, keep) {
  const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return sorted.slice(0, Math.max(0, sorted.length - keep));
}
