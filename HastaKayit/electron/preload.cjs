// Renderer ile ana süreç arasındaki TEK kapı.
//
// `sandbox: true` ile çalışır: burada Node'un `fs`/`path`'i YOKTUR, sadece
// ipcRenderer vardır. Uygulama koduna açılan yüzey bilerek dardır — dosya adı
// alan, yol almayan çağrılar (ana süreçte resolveIn ile klasöre hapsedilir).
const { contextBridge, ipcRenderer } = require('electron');

const beforeQuitHandlers = [];
ipcRenderer.on('hk:before-quit', () => { for (const h of beforeQuitHandlers) h(); });

const menuHandlers = [];
ipcRenderer.on('hk:menu', (_e, cmd) => { for (const h of menuHandlers) h(cmd); });

contextBridge.exposeInMainWorld('hkDesktop', {
  platform: process.platform,

  dataDir: () => ipcRenderer.invoke('hk:data-dir'),

  // structuredClone üzerinden gelen Buffer'ı sql.js'in beklediği Uint8Array'e çevir.
  readDb: async () => {
    const b = await ipcRenderer.invoke('hk:db-read');
    return b ? new Uint8Array(b) : null;
  },
  writeDb: bytes => ipcRenderer.invoke('hk:db-write', bytes),
  readWasm: async () => new Uint8Array(await ipcRenderer.invoke('hk:wasm-read')),

  writeText: (kind, name, text) => ipcRenderer.invoke('hk:file-write', kind, name, text),
  readText: (kind, name) => ipcRenderer.invoke('hk:file-read', kind, name),
  list: (kind, prefix) => ipcRenderer.invoke('hk:file-list', kind, prefix),
  remove: (kind, name) => ipcRenderer.invoke('hk:file-delete', kind, name),

  saveExport: (name, base64) => ipcRenderer.invoke('hk:save-export', name, base64),
  revealDataDir: () => ipcRenderer.invoke('hk:reveal-data-dir'),

  onBeforeQuit: cb => { if (typeof cb === 'function') beforeQuitHandlers.push(cb); },
  readyToClose: () => ipcRenderer.invoke('hk:ready-to-close'),
  onMenu: cb => { if (typeof cb === 'function') menuHandlers.push(cb); },
});
