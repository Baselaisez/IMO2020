// Mac (ve Windows) masaüstü kabuğu.
//
// Renderer, iPhone sürümüyle BİREBİR AYNI www/ paketini yükler. Bu dosyanın işi
// üç şey: (1) pencereyi macOS'a yakışır biçimde açmak, (2) dosya sistemine
// erişimi güvenli bir IPC arkasına almak, (3) gerçek bir Mac menü çubuğu vermek.
//
// GÜVENLİK: pencere Electron'un güvenli varsayılanlarıyla açılır —
// contextIsolation açık, nodeIntegration kapalı, sandbox açık. Renderer'da Node
// API'si YOKTUR; tüm dosya işleri buradaki ipcMain işleyicilerinden geçer ve
// yalnızca uygulamanın kendi veri klasörüne dokunabilir (bkz. resolveIn).
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeTheme } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const isMac = process.platform === 'darwin';

// Veri klasörü.
//   macOS   → ~/Library/Application Support/HastaKayit
//   Windows → %USERPROFILE%\HastaKayit   (eski kurulumlarla uyum için değişmedi)
function dataDir() {
  return isMac ? path.join(app.getPath('appData'), 'HastaKayit') : path.join(os.homedir(), 'HastaKayit');
}

const KINDS = { db: '', daily: 'daily', backups: 'backups' };

// Yol geçişini (../) engelle: renderer yalnızca dosya ADI verebilir, yol veremez.
function resolveIn(kind, name) {
  if (!(kind in KINDS)) throw new Error(`Bilinmeyen klasör: ${kind}`);
  const base = path.join(dataDir(), KINDS[kind]);
  const full = path.join(base, path.basename(String(name)));
  if (path.dirname(full) !== path.resolve(base)) throw new Error('Geçersiz dosya adı.');
  return full;
}

const dbFile = () => path.join(dataDir(), 'hastakayit.sqlite');

// --- Eşitleme klasörü ------------------------------------------------------
// Eşitleme klasörünün dar kapısı ayrı bir dosyada (kendi testi var).
const { syncPath } = require('./sync-path.cjs');

ipcMain.handle('hk:sync-read', async (_e, dir, name) => {
  try { return await fsp.readFile(syncPath(dir, name), 'utf8'); }
  catch (err) {
    // Dosya/klasör yok = "karşı cihaz henüz yazmamış", hata değil.
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) return null;
    throw err;
  }
});

ipcMain.handle('hk:sync-write', async (_e, dir, name, text) => {
  const full = syncPath(dir, name);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, String(text), 'utf8');
});

ipcMain.handle('hk:sync-rename', async (_e, dir, from, to) => {
  // rename mevcut hedefin üzerine yazar — eşitlemenin atomik değişimi buna dayanır.
  await fsp.rename(syncPath(dir, from), syncPath(dir, to));
});

ipcMain.handle('hk:sync-remove', async (_e, dir, name) => {
  try { await fsp.unlink(syncPath(dir, name)); } catch { /* zaten yok */ }
});

// Klasör gerçekten var mı, klasör mü, YAZILABİLİR mi? Salt-okunur bir klasör
// seçilirse eşitleme sessizce hiç çalışmaz; deneme yazması bunu baştan yakalar.
ipcMain.handle('hk:sync-validate', async (_e, dir) => {
  const p = String(dir || '').trim();
  if (!p) return { ok: false, error: 'Klasör yolu boş.' };
  try {
    const st = await fsp.stat(p);
    if (!st.isDirectory()) return { ok: false, error: 'Bu bir klasör değil: ' + p };
    const probe = path.join(p, '.hastakayit-yazma-testi');
    await fsp.writeFile(probe, 'ok', 'utf8');
    await fsp.unlink(probe);
    return { ok: true, path: path.resolve(p) };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: false, error: 'Bu klasör bulunamadı: ' + p };
    return { ok: false, error: 'Klasöre yazılamıyor: ' + (err?.message || err) };
  }
});

// Yerli klasör seçici. Yol yapıştırmaktan iyidir: kullanıcı yanlış yazamaz ve
// macOS'ta uygulamaya o klasör için erişim izni de bu panel üzerinden verilir.
ipcMain.handle('hk:sync-pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(liveWin() ?? undefined, {
    title: 'Eşitleme klasörünü seçin',
    message: 'İki cihazın da göreceği bir klasör seçin (örn. iCloud Drive içinde bir klasör).',
    properties: ['openDirectory', 'createDirectory'],
    buttonLabel: 'Bu Klasörü Kullan',
  });
  return canceled || !filePaths?.length ? null : filePaths[0];
});

// --- Pencere ---------------------------------------------------------------
let win = null;
let readyToClose = false;

/**
 * Kullanılabilir pencere, yoksa null.
 *
 * DİKKAT — `if (win)` YETMEZ. macOS'ta pencere kapansa da uygulama ayakta kalır
 * (aşağıdaki window-all-closed) ve `win` YOK EDİLMİŞ bir nesneyi göstermeye
 * devam eder. Yok edilmiş bir BrowserWindow nesnesi hâlâ "truthy"dir; üzerinde
 * herhangi bir metot çağırmak `TypeError: Object has been destroyed` ile ana
 * süreci düşürür ve kullanıcı "A JavaScript error occurred in the main process"
 * penceresini görür. Pencereye dokunan HER yol bu kapıdan geçmeli.
 */
function liveWin() {
  return win && !win.isDestroyed() ? win : null;
}

const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch {}
  return { width: 1040, height: 800 };
}

function saveWindowState() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  try {
    const b = win.getBounds();
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch {}
}

function createWindow() {
  const s = loadWindowState();
  win = new BrowserWindow({
    width: s.width,
    height: s.height,
    x: s.x,
    y: s.y,
    minWidth: 380,
    minHeight: 560,
    title: 'Hasta Kayıt',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#fafafa',
    // macOS: başlık çubuğunu gizleyip trafik ışıklarını uygulamanın kendi mavi
    // üst çubuğunun üzerine bindiriyoruz — pencere böylece yerli bir Mac
    // uygulaması gibi görünür. Üst çubuğun sol boşluğu CSS'te açılıyor
    // (html[data-platform="macos"] .appbar), ışıklar ← / 🏠 düğmelerini örtmesin.
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 14, y: 15 } : undefined,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  if (s.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));

  for (const ev of ['resize', 'move', 'close']) win.on(ev, saveWindowState);
  // Referansı bırak: yok edilmiş bir pencereyi tutmak yukarıdaki çökmenin
  // kaynağıydı. readyToClose da sıfırlanmalı, yoksa aynı oturumda açılan ikinci
  // pencere kapanış el sıkışmasını hiç yapmaz ve bekleyen yazma kaybolur.
  win.on('closed', () => { win = null; readyToClose = false; });

  // Kapanış el sıkışması: bekleyen veritabanı yazması diske inmeden pencere
  // KAPANMAZ. Renderer 'hk:before-quit' sinyalini alır, flush eder ve
  // 'hk:ready-to-close' ile geri döner. Renderer yanıt vermezse 3 sn sonra
  // yine de kapanır — kilitlenmiş bir renderer uygulamayı rehin alamaz.
  win.on('close', e => {
    if (readyToClose) return;
    e.preventDefault();
    win.webContents.send('hk:before-quit');
    setTimeout(() => { readyToClose = true; liveWin()?.close(); }, 3000);
  });

  attachContextMenu(win);

  // Dış bağlantılar (tel:, mailto:, https:) uygulamanın İÇİNDE açılmaz —
  // varsayılan tarayıcıya/telefon uygulamasına gider.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });
}

// --- Sağ tık menüsü --------------------------------------------------------
// Electron bir web sayfası gösterir ve web sayfalarının VARSAYILAN sağ tık
// menüsü YOKTUR — tarayıcıdaki menüyü Chrome'un kendisi ekler, Electron
// eklemez. Bu yüzden uygulamada sağ tıklamak hiçbir şey yapmıyordu: kopyala,
// yapıştır, geri al hepsi yalnızca klavyeden erişilebiliyordu. Bir hasta
// kaydında metin taşıyan doktor için bu ciddi bir eksikti.
//
// Menü içeriği tıklanan yere göre değişir: yazı kutusundaysanız düzenleme
// eylemleri, düz metindeyseniz yalnızca kopyalama. Etkin/pasif durumları
// Chromium'un bildirdiği editFlags'ten gelir — yani "Yapıştır" panoda bir şey
// yoksa sönük görünür, tıklayıp hiçbir şey olmamasını izlemezsiniz.
function attachContextMenu(w) {
  w.webContents.on('context-menu', (_event, params) => {
    const f = params.editFlags || {};
    const items = [];

    // Yazım önerileri (varsa) en üstte — macOS'ta beklenen yer burasıdır.
    for (const suggestion of params.dictionarySuggestions || []) {
      items.push({ label: suggestion, click: () => w.webContents.replaceMisspelling(suggestion) });
    }
    if (items.length) items.push({ type: 'separator' });

    if (params.isEditable) {
      items.push(
        { label: 'Geri Al', role: 'undo', enabled: f.canUndo !== false },
        { label: 'Yinele', role: 'redo', enabled: f.canRedo !== false },
        { type: 'separator' },
        { label: 'Kes', role: 'cut', enabled: !!f.canCut },
        { label: 'Kopyala', role: 'copy', enabled: !!f.canCopy },
        { label: 'Yapıştır', role: 'paste', enabled: !!f.canPaste },
        { type: 'separator' },
        { label: 'Tümünü Seç', role: 'selectAll' },
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      items.push(
        { label: 'Kopyala', role: 'copy' },
        { type: 'separator' },
        { label: 'Tümünü Seç', role: 'selectAll' },
      );
    } else {
      // Boş alanda sağ tık: hiç menü açmamak, "bozuk" hissi verir. Tek bir
      // anlamlı eylem bırakıyoruz.
      items.push({ label: 'Tümünü Seç', role: 'selectAll' });
    }

    Menu.buildFromTemplate(items).popup({ window: w });
  });
}

// --- Menü ------------------------------------------------------------------
// Gerçek bir macOS menü çubuğu. Düzen menüsü sadece süs değil: ⌘C/⌘V/⌘Z
// kısayolları ve "Dikteyi Başlat" oradan gelir — menüsüz bir Electron
// penceresinde kopyala-yapıştır bile çalışmaz.
function send(cmd) { liveWin()?.webContents.send('hk:menu', cmd); }

function buildMenu() {
  const template = [
    ...(isMac ? [{
      label: 'Hasta Kayıt',
      submenu: [
        { role: 'about', label: 'Hasta Kayıt Hakkında' },
        { type: 'separator' },
        { label: 'Ayarlar & Yedekleme', accelerator: 'Cmd+,', click: () => send('settings') },
        { type: 'separator' },
        { role: 'services', label: 'Hizmetler' },
        { type: 'separator' },
        { role: 'hide', label: 'Hasta Kayıt’ı Gizle' },
        { role: 'hideOthers', label: 'Diğerlerini Gizle' },
        { role: 'unhide', label: 'Tümünü Göster' },
        { type: 'separator' },
        { role: 'quit', label: 'Hasta Kayıt’tan Çık' },
      ],
    }] : []),
    {
      label: 'Dosya',
      submenu: [
        { label: 'Yeni Hasta', accelerator: 'CmdOrCtrl+N', click: () => send('new-patient') },
        { type: 'separator' },
        { label: "Excel'e Aktar…", accelerator: 'CmdOrCtrl+E', click: () => send('export-xlsx') },
        { label: 'Yedek Al (JSON)…', accelerator: 'CmdOrCtrl+S', click: () => send('backup-json') },
        { label: 'İçe Aktar…', accelerator: 'CmdOrCtrl+O', click: () => send('import') },
        { type: 'separator' },
        { label: 'Veri Klasörünü Göster', click: () => shell.openPath(dataDir()) },
        { type: 'separator' },
        { label: 'Ekranı Kilitle', accelerator: 'CmdOrCtrl+L', click: () => send('lock') },
        isMac ? { role: 'close', label: 'Pencereyi Kapat' } : { role: 'quit', label: 'Çık' },
      ],
    },
    {
      label: 'Düzen',
      submenu: [
        { role: 'undo', label: 'Geri Al' },
        { role: 'redo', label: 'Yinele' },
        { type: 'separator' },
        { role: 'cut', label: 'Kes' },
        { role: 'copy', label: 'Kopyala' },
        { role: 'paste', label: 'Yapıştır' },
        { role: 'selectAll', label: 'Tümünü Seç' },
        ...(isMac ? [
          { type: 'separator' },
          { label: 'Konuşma', submenu: [{ role: 'startSpeaking', label: 'Konuşmayı Başlat' }, { role: 'stopSpeaking', label: 'Konuşmayı Durdur' }] },
        ] : []),
      ],
    },
    {
      label: 'Görünüm',
      submenu: [
        { role: 'resetZoom', label: 'Gerçek Boyut' },
        { role: 'zoomIn', label: 'Büyüt' },
        { role: 'zoomOut', label: 'Küçült' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Tam Ekran' },
        { role: 'toggleDevTools', label: 'Geliştirici Araçları' },
      ],
    },
    {
      label: 'Pencere',
      submenu: isMac
        ? [{ role: 'minimize', label: 'Simge Durumuna Küçült' }, { role: 'zoom', label: 'Yakınlaştır' }, { type: 'separator' }, { role: 'front', label: 'Tümünü Öne Getir' }]
        : [{ role: 'minimize', label: 'Simge Durumuna Küçült' }, { role: 'close', label: 'Kapat' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// --- IPC -------------------------------------------------------------------
async function atomicWrite(full, data) {
  await fsp.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, full); // aynı dosya sisteminde atomiktir: yarım dosya kalmaz
}

ipcMain.handle('hk:data-dir', () => dataDir());

ipcMain.handle('hk:db-read', async () => {
  try { return await fsp.readFile(dbFile()); } catch { return null; }
});

ipcMain.handle('hk:db-write', async (_e, bytes) => {
  await atomicWrite(dbFile(), Buffer.from(bytes));
});

ipcMain.handle('hk:wasm-read', async () => {
  const dir = path.join(__dirname, '..', 'www', 'assets');
  const name = (await fsp.readdir(dir)).find(f => f.endsWith('.wasm'));
  if (!name) throw new Error('sql.js WASM bulunamadı.');
  return await fsp.readFile(path.join(dir, name));
});

ipcMain.handle('hk:file-write', async (_e, kind, name, text) => {
  const full = resolveIn(kind, name);
  await atomicWrite(full, Buffer.from(String(text), 'utf8'));
  return full;
});

ipcMain.handle('hk:file-read', async (_e, kind, name) => fsp.readFile(resolveIn(kind, name), 'utf8'));

ipcMain.handle('hk:file-list', async (_e, kind, prefix = '') => {
  try {
    const dir = path.join(dataDir(), KINDS[kind] ?? '');
    return (await fsp.readdir(dir)).filter(f => f.startsWith(prefix));
  } catch { return []; }
});

ipcMain.handle('hk:file-delete', async (_e, kind, name) => {
  try { await fsp.unlink(resolveIn(kind, name)); } catch {}
});

// Dışa aktarma: gerçek "Farklı Kaydet…" paneli. iPhone'daki paylaşım
// sayfasının Mac'teki karşılığı budur.
ipcMain.handle('hk:save-export', async (_e, name, base64) => {
  const { canceled, filePath } = await dialog.showSaveDialog(liveWin() ?? undefined, {
    title: 'Farklı Kaydet',
    defaultPath: path.join(app.getPath('downloads'), String(name)),
    buttonLabel: 'Kaydet',
  });
  if (canceled || !filePath) return null;
  await fsp.writeFile(filePath, Buffer.from(String(base64), 'base64'));
  return filePath;
});

ipcMain.handle('hk:reveal-data-dir', async () => {
  await fsp.mkdir(dataDir(), { recursive: true });
  shell.openPath(dataDir());
});

ipcMain.handle('hk:ready-to-close', () => {
  readyToClose = true;
  liveWin()?.close();
});

// --- Yaşam döngüsü ---------------------------------------------------------
// Tek örnek: iki pencere aynı SQLite dosyasına yazarsa veri kaybolur.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const w = liveWin();
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
    // Pencere kapatılmış ama uygulama macOS'ta ayakta kalmıştı: uygulamayı
    // yeniden başlatmaya çalışan kullanıcı penceresini geri istiyor demektir.
    else createWindow();
  });

  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: 'Hasta Kayıt',
      applicationVersion: app.getVersion(),
      credits: 'Hasta kayıt, ödeme ve randevu takibi — veriler yalnızca bu bilgisayarda saklanır.',
    });
    buildMenu();
    createWindow();
    // macOS: Dock simgesine tıklandığında pencere yoksa yenisi açılır.
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });
}

// macOS'ta pencere kapanınca uygulama ÇIKMAZ (platform geleneği); diğerlerinde çıkar.
app.on('window-all-closed', () => { if (!isMac) app.quit(); });
