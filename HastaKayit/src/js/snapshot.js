import { allData, getMeta, setMeta } from './repo.js';
import { makeBackup } from './backup.js';
import { writeSnapshotFile, writeDailyFile } from './files.js';
import { isNative, isDesktop } from './platform.js';
import { state, banner } from './ui.js';
import { rescheduleNotifications } from './notify.js';

let timer = null;

export function scheduleSnapshot() {
  clearTimeout(timer);
  // banner already shown inside takeSnapshot; catch only silences the
  // unhandled rejection in the timer context.
  timer = setTimeout(() => { timer = null; takeSnapshot().catch(() => {}); }, 5000);
}

// Called on app background: fire the pending debounced snapshot immediately
// instead of losing it if the process gets killed while backgrounded.
export function flushSnapshot() {
  if (timer) { clearTimeout(timer); timer = null; takeSnapshot().catch(() => {}); }
}

export async function takeSnapshot() {
  try {
    const data = await allData(state.exec);
    const backup = makeBackup(data.patients, data.payments, new Date().toISOString(), data.deliveries, data.deletions);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const r = await writeSnapshotFile(JSON.stringify(backup), stamp);
    if (!r.skipped) {
      await setMeta(state.exec, 'last_snapshot', JSON.stringify({
        at: backup.exported_at, patients: backup.counts.patients, payments: backup.counts.payments, deliveries: backup.counts.deliveries,
      }));
    }
    // Own try/catch: a notification-scheduling failure must NOT masquerade as a
    // snapshot-write failure (the snapshot already succeeded above).
    try { await rescheduleNotifications(data.patients, data.deliveries, data.payments); } catch (e) { console.error('reschedule', e); }
    return backup;
  } catch (e) {
    console.error(e);
    banner(`YEDEK ANLIK GÖRÜNTÜSÜ YAZILAMADI — ${e.message || e}`, 'error', 0);
    throw e;
  }
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function dailyBackupIfDue() {
  try {
    if (!isNative() && !isDesktop()) return;
    const today = todayStr();
    if ((await getMeta(state.exec, 'last_daily')) === today) return;
    const data = await allData(state.exec);
    const backup = makeBackup(data.patients, data.payments, new Date().toISOString(), data.deliveries, data.deletions);
    const r = await writeDailyFile(`daily-${today}.json`, JSON.stringify(backup));
    if (!r.skipped) await setMeta(state.exec, 'last_daily', today);
  } catch (e) { console.error('dailyBackup', e); }
}

// Güncelleme-öncesi yedek (repo.initSchema'nın onBeforeMigrate kancası).
// Şema yükseltmesi ÇALIŞMADAN önce eldeki veri, günlük yedeklerle AYNI klasöre
// yazılır: Mac'te ~/Library/Application Support/HastaKayit/daily, Windows'ta
// %USERPROFILE%\HastaKayit\daily, iPhone ve Android'de Belgeler/HastaKayit/daily. Dosya adı: pre-update-<eski>-to-<yeni>-<zaman>.json
// Zarf makeBackup ile üretildiği için standart checksum'lı biçimdedir ve
// Ayarlar → "Yedekten Geri Yükle" ile aynen geri yüklenebilir. writeDailyFile'ın
// rotasyonu sadece "daily-" ile başlayan dosyaları siler, bu yüzden bu yedekler
// kendiliğinden silinmez. state.exec KULLANILMAZ: veri parametre olarak gelir,
// çünkü kanca app.js'te initSnapshots'tan ÖNCE çalışır.
export async function writePreUpdateBackup(data, { from, to } = {}) {
  const backup = makeBackup(
    data?.patients || [], data?.payments || [], new Date().toISOString(),
    data?.deliveries || [], data?.deletions || []
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return writeDailyFile(`pre-update-${from}-to-${to}-${stamp}.json`, JSON.stringify(backup));
}

let midnightTimer = null;
export function scheduleMidnight() {
  clearTimeout(midnightTimer);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 5, 0); // 00:05 tomorrow
  const ms = Math.max(1000, next.getTime() - now.getTime());
  midnightTimer = setTimeout(() => { dailyBackupIfDue().finally(scheduleMidnight); }, ms);
}

export async function initSnapshots() {
  state.onMutate = scheduleSnapshot;
  try {
    // PRAGMA integrity_check returns rows, it does NOT throw on corruption —
    // the verdict must be inspected. Column-name fallback covers executor
    // differences in result key naming.
    const ic = await state.exec.query('PRAGMA integrity_check');
    const verdict = ic[0]?.integrity_check ?? ic[0]?.[Object.keys(ic[0] || {})[0]];
    if (String(verdict ?? 'ok').toLowerCase() !== 'ok') throw new Error(`Bütünlük kontrolü: ${verdict}`);
    const last = JSON.parse((await getMeta(state.exec, 'last_snapshot')) || 'null');
    if (last && (isNative() || isDesktop())) {
      const d = await allData(state.exec);
      if (d.patients.length < last.patients || d.payments.length < last.payments) {
        banner(`DİKKAT: Veritabanında son yedekten daha az kayıt var (beklenen ${last.patients} hasta / ${last.payments} ödeme). Ayarlar → Yedekten Geri Yükle ile kontrol edin. (Az önce kayıt sildiyseniz bu normal olabilir.)`, 'error', 0);
      }
    }
  } catch (e) {
    banner(`VERİTABANI BÜTÜNLÜK UYARISI — ${e.message || e}`, 'error', 0);
  }
}
