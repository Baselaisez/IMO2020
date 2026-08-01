// Masaüstü (Mac / Windows, Electron) veritabanı adaptörü.
//
// sql.js (WASM) motorunu kullanır ama veriyi KALICI bir dosyaya yazar:
//   • macOS   → ~/Library/Application Support/HastaKayit/hastakayit.sqlite
//   • Windows → %USERPROFILE%\HastaKayit\hastakayit.sqlite
// Yolu ana süreç belirler (electron/main.cjs); burada bilinmesi gerekmez.
//
// Her mutasyondan (COMMIT/INSERT/UPDATE/DELETE/CREATE/ALTER) sonra dosya
// gecikmeli olarak diske yazılır. Pencere kapanırken ana süreç önce bir
// "kapanmak üzereyim" sinyali gönderir; bekleyen yazma kesin olarak
// tamamlandıktan SONRA kapanışa izin verilir (bkz. electron/main.cjs).
// Eski sürümdeki `beforeunload` yaklaşımı asenkron IPC ile çalışmazdı: pencere
// yazma bitmeden kapanabiliyordu.
import initSqlJs from 'sql.js';
import { desktop } from './desktop.js';

export async function openDesktopDb() {
  // WASM'ı fetch yerine ana süreçten oku: uygulama file:// üzerinden yüklendiği
  // için fetch güvenilmez, asar arşivi içinde ise hiç çalışmaz.
  const wasmBinary = await desktop.readWasm();
  const SQL = await initSqlJs({ wasmBinary });

  const existing = await desktop.readDb();
  const db = existing ? new SQL.Database(existing) : new SQL.Database();

  let saveTimer = null;
  let saving = null;
  const save = async () => {
    try { saving = desktop.writeDb(db.export()); await saving; }
    catch (e) { console.error('DB kaydedilemedi:', e); }
    finally { saving = null; }
  };
  const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 200); };

  // Bekleyen her şeyi diske indir; kapanış yolu bunu bekler.
  const flush = async () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    await save();
  };

  // Ana süreç pencereyi kapatmadan önce burayı çağırır.
  desktop.onBeforeQuit(async () => {
    try { await flush(); } finally { desktop.readyToClose(); }
  });
  // Köprüsüz (eski) kabukta sinyal gelmez — orada senkron yedek yol budur.
  window.addEventListener('beforeunload', () => { if (saveTimer) { clearTimeout(saveTimer); save(); } });

  const MUT = ['COMMIT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'REPLACE'];
  return {
    async run(sql, params = []) {
      db.run(sql, params);
      const head = String(sql).trim().slice(0, 7).toUpperCase();
      if (MUT.some(k => head.startsWith(k))) scheduleSave();
      return { changes: db.getRowsModified() };
    },
    async query(sql, params = []) {
      const st = db.prepare(sql);
      st.bind(params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      st.free();
      return rows;
    },
    flush,
  };
}
