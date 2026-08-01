import { initSchema, allData, getMeta } from './repo.js';
import { isDesktop, isNative, platform } from './platform.js';
import { openNativeDb } from './db-capacitor.js';
import { openWebDb } from './db-web.js';
import { openDesktopDb } from './db-desktop.js';
import { state, showScreen, banner, initHomeButtons } from './ui.js';
import { initLock } from './lock.js';
import { initHome, refreshHome } from './ui-home.js';
import { initForm } from './ui-form.js';
import { initCard } from './ui-card.js';
import { initSettings } from './ui-settings.js';
import { initSnapshots, dailyBackupIfDue, scheduleMidnight, writePreUpdateBackup } from './snapshot.js';
import { rescheduleNotifications, requestNotifyPermission, ensureChannels, setNotifSound } from './notify.js';
import { initDesktopMenu } from './desktop-menu.js';

async function main() {
  try {
    // Electron (Mac / Windows masaüstü) → kalıcı dosya-tabanlı sql.js;
    // iPhone & Android → yerel SQLite eklentisi; tarayıcı önizleme → bellek-içi sql.js.
    document.documentElement.dataset.platform = platform();
    state.exec = isDesktop() ? await openDesktopDb()
      : isNative() ? await openNativeDb()
      : await openWebDb();
    // Uygulama güncellendiğinde ilk açılışta şema yükseltmesi çalışabilir. Bu,
    // verinin en riskli anıdır — bu yüzden yükseltme BAŞLAMADAN önce mevcut
    // veri tam bir yedek dosyasına yazılır (bkz. docs/GUNCELLEME-VE-VERI.md).
    // Yedek yazılamazsa initSchema geçişi yine de tamamlar (repo.js'te try/catch).
    await initSchema(state.exec, { onBeforeMigrate: writePreUpdateBackup });
    await initSnapshots();
    initHome(); initForm(); initCard(); initSettings(); initDesktopMenu();
    // 🏠 düğmeleri statik markup (form/kart/ayarlar üst çubukları) — bir kez,
    // delege edilerek bağlanır. Geri okuyla aynı yolu izler, ama hangi ekranda
    // olursak olalım daima ana listeye iner.
    initHomeButtons(async () => { await refreshHome(); showScreen('home'); });
    await initLock(async () => {
      await refreshHome();
      showScreen('home');
      await requestNotifyPermission();
      await ensureChannels();
      setNotifSound((await getMeta(state.exec, 'notif_sound')) !== 'off');
      const d = await allData(state.exec);
      await rescheduleNotifications(d.patients, d.deliveries, d.payments);
      await dailyBackupIfDue();
      scheduleMidnight();
    });
  } catch (e) {
    console.error(e);
    banner(`UYGULAMA BAŞLATILAMADI — ${e.message || e}`, 'error', 0);
  }
}
main();
