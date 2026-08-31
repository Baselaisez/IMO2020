import { initSchema, listUpcoming, getMeta } from './repo.js';
import { isDesktop, isNative, platform } from './platform.js';
import { openNativeDb } from './db-capacitor.js';
import { openWebDb } from './db-web.js';
import { openDesktopDb } from './db-desktop.js';
import { state, showScreen, banner, initHomeButtons, todayIso } from './ui.js';
import { initLock } from './lock.js';
import { initHome, refreshHome } from './ui-home.js';
import { initForm } from './ui-form.js';
import { initCard } from './ui-card.js';
import { initSettings } from './ui-settings.js';
import { initSnapshots, dailyBackupIfDue, scheduleMidnight, writePreUpdateBackup } from './snapshot.js';
import { rescheduleNotifications, requestNotifyPermission, ensureChannels, setNotifSound } from './notify.js';
import { initDesktopMenu } from './desktop-menu.js';
import { startAutoSync, scheduleSyncAfterMutation } from './sync-file.js';

// Otomatik eşitlemenin tek "gürültü" kuralı: bir hata banner'ı EN FAZLA bir kez
// gösterilir. Arka plandaki eşitleme kullanıcının işini asla kesmemeli; klasör
// bir süre erişilemezse (bulut istemcisi kapalı, disk çıkarılmış) her 5 dakikada
// bir uyarı basmak sadece rahatsız eder. Elle "Şimdi Eşitle" denince hata her
// zaman gösterilir (bkz. ui-settings.js).
let syncWarned = false;

async function onSyncResult(r, reason) {
  if (r?.error) {
    if (!syncWarned) {
      syncWarned = true;
      banner(`Eşitleme yapılamadı — ${r.error} (kayıtlarınız yerinde duruyor)`, 'error', 6000);
    }
    return;
  }
  if (r?.skipped) return;
  syncWarned = false;
  // Karşı cihazdan gerçekten kayıt geldiyse listeyi tazele; boş turlarda DOM'a
  // dokunma (doktor bir şey yazarken listenin altından kayması istenmez).
  const a = r?.applied;
  const changed = (a?.patientsUpserted || 0) + (a?.paymentsUpserted || 0) + (a?.deliveriesUpserted || 0) + (a?.deleted || 0);
  if (changed && state.screen === 'home') await refreshHome();
  if (changed && reason !== 'mutation') banner('Diğer cihazdan kayıtlar alındı ✓', 'ok');
}

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
      // Bildirimler için TÜM veriyi yüklemeye gerek yok: buildSchedule zaten
      // yalnızca gelecekteki işleri planlıyor. allData() burada 45.000 kayıtta
      // 962 ms sürüyordu ve kilit açılışını o kadar geciktiriyordu.
      const up = await listUpcoming(state.exec, todayIso());
      await rescheduleNotifications(up.patients, up.deliveries, up.payments);
      await dailyBackupIfDue();
      scheduleMidnight();
      // Cihazlar arası eşitleme: kilit açıldıktan ~3 sn sonra bir kez, sonra her
      // ~5 dk. Klasör ayarlanmamışsa hepsi sessiz no-op'tur. Mutasyon kancası
      // initSnapshots'ın kancasını EZMEZ, ona ZİNCİRLENİR (yedek anlık görüntüsü
      // + ~15 sn debounce ile eşitleme).
      startAutoSync(state.exec, { onResult: onSyncResult });
      const prevOnMutate = state.onMutate;
      state.onMutate = () => { prevOnMutate?.(); scheduleSyncAfterMutation(); };
    });
  } catch (e) {
    console.error(e);
    banner(`UYGULAMA BAŞLATILAMADI — ${e.message || e}`, 'error', 0);
  }
}
main();
