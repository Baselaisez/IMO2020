import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { isNative, isDesktop } from './platform.js';
import { desktop, toDelete } from './desktop.js';

const SNAP_DIR = 'HastaKayit/snapshots';
const DAILY_DIR = 'HastaKayit/daily';

export { isNative, isDesktop };

// --- Masaüstü (Mac / Windows) yedekleme yolu --------------------------------
// macOS   → ~/Library/Application Support/HastaKayit/{backups,daily}
// Windows → %USERPROFILE%\HastaKayit\{backups,daily}
// Klasörü ana süreç seçer (electron/main.cjs); burada yalnızca 'backups' /
// 'daily' mantıksal adları kullanılır. Rotasyon mantığı Capacitor yoluyla
// birebir aynı: en yeni N dosya tutulur, gerisi silinir.
async function writeDailyFileDesktop(name, json) {
  const full = await desktop.writeText('daily', name, json);
  try {
    const files = await desktop.list('daily', 'daily-');
    for (const f of toDelete(files, 30)) await desktop.remove('daily', f);
  } catch {}
  return { path: full };
}

async function writeSnapshotFileDesktop(json, stamp) {
  const name = `snap-${stamp}.json`;
  const full = await desktop.writeText('backups', name, json);
  // read-back verify (aynı kontrol Capacitor yolunda da var)
  const back = await desktop.readText('backups', name);
  if (back !== json) throw new Error('Snapshot doğrulanamadı.');
  const snaps = await desktop.list('backups', 'snap-');
  for (const f of toDelete(snaps, 20)) await desktop.remove('backups', f);
  return { path: full };
}

// Memoized after first success: avoids a native IPC mkdir per file op.
let snapDirCache = null;

async function snapshotDirectory() {
  if (snapDirCache) return snapDirCache;
  // Documents is user-visible and survives uninstall; fall back to app-private Data.
  // iOS'ta Documents ayrıca Dosyalar (Files) uygulamasında görünür — Info.plist'te
  // UIFileSharingEnabled + LSSupportsOpeningDocumentsInPlace açık olduğu için
  // doktor yedek JSON'larına telefondan doğrudan ulaşabilir.
  try {
    await Filesystem.mkdir({ path: SNAP_DIR, directory: Directory.Documents, recursive: true });
    snapDirCache = Directory.Documents;
  } catch (e) {
    // Stable plugin error code first; message substring as fallback.
    if (e?.code === 'OS-PLUG-FILE-0010' || String(e?.message || '').includes('exists')) {
      snapDirCache = Directory.Documents;
    } else {
      await Filesystem.mkdir({ path: SNAP_DIR, directory: Directory.Data, recursive: true }).catch(() => {});
      snapDirCache = Directory.Data;
    }
  }
  return snapDirCache;
}

export async function writeDailyFile(name, json) {
  if (isDesktop()) return writeDailyFileDesktop(name, json);
  if (!isNative()) return { skipped: true };
  const dir = await snapshotDirectory();
  const path = `${DAILY_DIR}/${name}`;
  await Filesystem.writeFile({ path, directory: dir, data: json, encoding: Encoding.UTF8, recursive: true });
  try {
    const ls = await Filesystem.readdir({ path: DAILY_DIR, directory: dir });
    const files = ls.files.filter(f => f.name.startsWith('daily-')).sort((a, b) => a.name < b.name ? -1 : 1);
    for (const f of files.slice(0, Math.max(0, files.length - 30))) {
      await Filesystem.deleteFile({ path: `${DAILY_DIR}/${f.name}`, directory: dir });
    }
  } catch {}
  return { path, dir };
}

export async function writeSnapshotFile(json, stamp) {
  if (isDesktop()) return writeSnapshotFileDesktop(json, stamp);
  if (!isNative()) return { skipped: true };
  const dir = await snapshotDirectory();
  const path = `${SNAP_DIR}/snap-${stamp}.json`;
  await Filesystem.writeFile({ path, directory: dir, data: json, encoding: Encoding.UTF8, recursive: true });
  // read-back verify
  const back = await Filesystem.readFile({ path, directory: dir, encoding: Encoding.UTF8 });
  if (back.data !== json) throw new Error('Snapshot doğrulanamadı.');
  await rotateSnapshots(dir);
  return { path, dir };
}

async function rotateSnapshots(dir, keep = 20) {
  const ls = await Filesystem.readdir({ path: SNAP_DIR, directory: dir });
  // Ordinal (not locale) compare: deterministic for machine-generated names.
  const snaps = ls.files.filter(f => f.name.startsWith('snap-'))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const f of snaps.slice(0, Math.max(0, snaps.length - keep))) {
    await Filesystem.deleteFile({ path: `${SNAP_DIR}/${f.name}`, directory: dir });
  }
}

export async function listSnapshots() {
  if (isDesktop()) {
    try {
      const files = await desktop.list('backups', 'snap-');
      return files.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)).map(name => ({ name }));
    } catch { return []; }
  }
  if (!isNative()) return [];
  const dir = await snapshotDirectory();
  try {
    const ls = await Filesystem.readdir({ path: SNAP_DIR, directory: dir });
    // Ordinal compare, newest first.
    return ls.files.filter(f => f.name.startsWith('snap-'))
      .sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  } catch { return []; }
}

export async function readSnapshot(name) {
  if (isDesktop()) return desktop.readText('backups', name);
  if (!isNative()) throw new Error('Yalnızca cihazda kullanılabilir.');
  const dir = await snapshotDirectory();
  const r = await Filesystem.readFile({ path: `${SNAP_DIR}/${name}`, directory: dir, encoding: Encoding.UTF8 });
  return r.data;
}

/**
 * Dışa aktarılan dosyayı (Excel / JSON / PDF / Word) kullanıcıya teslim eder.
 *   • iPhone & Android → dosya Cache'e yazılır, ardından sistemin paylaşım
 *     sayfası açılır (iOS'ta AirDrop / Dosyalar'a Kaydet / Mail).
 *   • Mac (Electron)   → gerçek "Farklı Kaydet…" paneli açılır.
 *   • tarayıcı         → indirme bağlantısı.
 * Dönüş değeri çağırana ne olduğunu söyler; Mac'te kullanıcı paneli iptal
 * edebildiği için "hazırlandı" demek yeterli değil (bkz. exportMessage).
 */
export async function shareFile(filename, base64Data, mime) {
  if (isDesktop()) {
    const saved = await desktop.saveExport(filename, base64Data, mime);
    return saved ? { path: saved } : { cancelled: true };
  }
  if (isNative()) {
    const w = await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data: base64Data });
    await Share.share({ title: filename, url: w.uri, dialogTitle: filename });
    return { shared: true };
  }
  const a = document.createElement('a');
  a.href = `data:${mime};base64,${base64Data}`;
  a.download = filename;
  a.click();
  return { downloaded: true };
}

// Chunked to avoid blowing the call-stack / argument-count limit that
// String.fromCharCode(...bigArray) hits on large exports (e.g. full backups
// or a generated PDF's bytes).
export function bytesToBase64(bytes) {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function textToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

/**
 * Dışa aktarma sonucunu kullanıcıya doğru anlatan mesaj. Saf.
 *
 * Mac'te artık gerçek bir "Farklı Kaydet…" paneli açılıyor ve kullanıcı bunu
 * İPTAL edebiliyor. Eski sabit "hazırlandı ✓" mesajı bu durumda yalan söylerdi;
 * dosya nereye yazıldıysa onu, yazılmadıysa iptal edildiğini söylüyoruz.
 */
export function exportMessage(result, label) {
  if (result?.cancelled) return { text: 'Kaydetme iptal edildi.', kind: 'ok' };
  if (result?.path) return { text: `${label} kaydedildi ✓ — ${result.path}`, kind: 'ok' };
  return { text: `${label} hazırlandı ✓`, kind: 'ok' };
}
