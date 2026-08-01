import { App } from '@capacitor/app';
import { getMeta, setMeta } from './repo.js';
import { genSaltHex, hashPin, verifyPin, lockoutMs } from './pin.js';
import {
  hasRecoverySetup, getRecoveryStatus, verifySecurityAnswers, verifyRecoveryCode,
  resetPinAfterRecovery, getRecoveryFailState, bumpRecoveryFail, clearRecoveryFail,
} from './pin-recovery.js';
import { state, banner, showScreen, openSheet, closeSheet, esc } from './ui.js';
import { isNative, isDesktop } from './platform.js';
import { flushSnapshot } from './snapshot.js';
import { shouldRequirePin } from './compute.js';

let onUnlockCb = null;
let bioAvailable = false;
let bgAt = 0;
let lockedFrom = null;

async function getFailState() {
  const fc = Number((await getMeta(state.exec, 'fail_count')) || '0');
  const lu = Number((await getMeta(state.exec, 'locked_until')) || '0');
  return { failCount: fc, lockedUntil: lu };
}

async function setFailState(failCount, lockedUntil) {
  await setMeta(state.exec, 'fail_count', String(failCount));
  await setMeta(state.exec, 'locked_until', String(lockedUntil));
}

/**
 * Biyometri düğmesinin YAZISI. Saf — eklentinin biometryType değerini alır.
 * Sabit "👆 Parmak izi ile aç" yazısı iPhone'da yanlıştı: cihazların çoğunda
 * Face ID vardır ve kullanıcı parmağını okutmaya çalışır. Bilinmeyen tür →
 * nötr ifade.
 */
export function biometryLabel(type) {
  switch (type) {
    case 'faceId': return '🙂 Face ID ile aç';
    case 'touchId': return '👆 Touch ID ile aç';
    case 'fingerprintAuthentication': return '👆 Parmak izi ile aç';
    case 'faceAuthentication': return '🙂 Yüz tanıma ile aç';
    case 'irisAuthentication': return '👁️ İris ile aç';
    default: return '🔓 Biyometri ile aç';
  }
}

async function biometricAvailable() {
  if (!isNative()) return false;
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    const r = await BiometricAuth.checkBiometry();
    if (!r.isAvailable) return false;
    const btn = document.getElementById('btn-bio');
    if (btn) btn.textContent = biometryLabel(r.biometryType);
    return true;
  } catch { return false; }
}

async function tryBiometric() {
  try {
    const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
    await BiometricAuth.authenticate({
      reason: 'Hasta kayıtlarına erişim',
      cancelTitle: 'PIN kullan',
      // iOS: LAContext'in düğme yazıları. Verilmezse İngilizce "Cancel"/"Enter
      // Password" görünür — arayüzün geri kalanı Türkçeyken tutarsız olurdu.
      iosFallbackTitle: 'PIN kullan',
      allowDeviceCredential: false,
    });
  } catch { return; } // user cancelled / no match — silent, PIN remains
  try { await unlock(); }
  catch (e) { banner(`Açılış hatası — ${e.message || e}`, 'error', 0); }
}

async function unlock() {
  await setFailState(0, 0).catch(() => {});
  document.getElementById('pin-input').value = '';
  if (onUnlockCb) await onUnlockCb();
  // Return to where the user was before backgrounding (keeps a half-filled form).
  // Cold start has no lockedFrom → stays on the home screen the callback showed.
  if (lockedFrom && lockedFrom !== 'home') showScreen(lockedFrom);
  lockedFrom = null;
}

async function submitPin() {
  try {
    const { failCount, lockedUntil } = await getFailState();
    const now = Date.now();
    if (now < lockedUntil) {
      banner(`Çok fazla yanlış deneme — ${Math.ceil((lockedUntil - now) / 1000)} sn bekleyin.`, 'error', 3000);
      return;
    }
    const pin = document.getElementById('pin-input').value;
    const salt = await getMeta(state.exec, 'pin_salt');
    const hash = await getMeta(state.exec, 'pin_hash');
    if (!salt || !hash) {
      // state corrupted or first-run not completed — restart setup instead of dead end
      await firstRunSetPin();
      return;
    }
    if (await verifyPin(pin, salt, hash)) {
      // Correct PIN: unlock failure (refreshHome/DB) is NOT a verification
      // error — banner it honestly under its own message.
      try { await unlock(); }
      catch (e) { banner(`Açılış hatası — ${e.message || e}`, 'error', 0); }
      return;
    }
    const fc = failCount + 1;
    const ms = lockoutMs(fc);
    await setFailState(fc, ms ? now + ms : 0);
    document.getElementById('pin-input').value = '';
    banner(ms ? `Yanlış PIN. ${ms / 1000} sn kilitlendi.` : 'Yanlış PIN.', 'error', 2500);
  } catch (e) {
    banner(`PIN doğrulama hatası — ${e.message || e}`, 'error', 0);
  }
}

async function firstRunSetPin() {
  document.getElementById('lock-msg').textContent = 'İlk kurulum: 4-6 haneli bir PIN belirleyin';
  document.getElementById('btn-bio').classList.add('hidden');
  const btn = document.getElementById('btn-pin-ok');
  btn.textContent = 'PIN Belirle';
  return new Promise(resolve => {
    const handler = async () => {
      try {
        const pin = document.getElementById('pin-input').value;
        if (!/^\d{4,6}$/.test(pin)) { banner('PIN 4-6 rakam olmalı.', 'error', 2500); return; }
        const salt = genSaltHex();
        await setMeta(state.exec, 'pin_salt', salt);
        await setMeta(state.exec, 'pin_hash', await hashPin(pin, salt));
        btn.removeEventListener('click', handler);
        btn.textContent = 'Aç';
        document.getElementById('lock-msg').textContent = 'PIN girin';
        document.getElementById('pin-input').value = '';
        banner('PIN kaydedildi ✓', 'ok');
        resolve();
      } catch (e) {
        banner(`PIN kaydedilemedi — ${e.message || e}`, 'error', 0);
      }
    };
    btn.addEventListener('click', handler);
  });
}

export async function changePinFlow() {
  openSheet(`
    <h4>PIN Değiştir</h4>
    <div class="form" style="padding:0">
      <label>Mevcut PIN<input id="pin-old" type="password" inputmode="numeric" maxlength="6"></label>
      <label>Yeni PIN (4-6 rakam)<input id="pin-new" type="password" inputmode="numeric" maxlength="6"></label>
      <button id="pin-change-go" class="primary">Değiştir</button>
      <button id="pin-change-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('pin-change-cancel').addEventListener('click', closeSheet);
  document.getElementById('pin-change-go').addEventListener('click', async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      const oldPin = document.getElementById('pin-old').value;
      const newPin = document.getElementById('pin-new').value;
      const salt = await getMeta(state.exec, 'pin_salt');
      const hash = await getMeta(state.exec, 'pin_hash');
      if (!(await verifyPin(oldPin, salt, hash))) { banner('Mevcut PIN yanlış.', 'error', 2500); btn.disabled = false; return; }
      if (!/^\d{4,6}$/.test(newPin)) { banner('Yeni PIN 4-6 rakam olmalı.', 'error', 2500); btn.disabled = false; return; }
      const newSalt = genSaltHex();
      await setMeta(state.exec, 'pin_salt', newSalt);
      await setMeta(state.exec, 'pin_hash', await hashPin(newPin, newSalt));
      closeSheet();
      banner('PIN değiştirildi ✓', 'ok');
    } catch (e) {
      banner(`PIN doğrulama hatası — ${e.message || e}`, 'error', 0);
      btn.disabled = false;
    }
  });
}

// ---------------------------------------------------------------------------
// Offline PIN recovery ("PİN'imi unuttum"). Two methods (security questions,
// recovery code); both share one rate-limited counter (recovery_fail) so an
// attacker gets 5 attempts TOTAL across methods, not 5 per method. On success
// the user sets a new PIN via resetPinAfterRecovery and the app unlocks.
// ---------------------------------------------------------------------------

// Returns true if the caller may proceed; false if currently locked out (and
// shows the wait banner). Shared by both recovery methods.
async function recoveryLockOk() {
  const { lockedUntil } = await getRecoveryFailState(state.exec);
  const now = Date.now();
  if (now < lockedUntil) {
    banner(`Çok fazla yanlış deneme — ${Math.ceil((lockedUntil - now) / 1000)} sn bekleyin.`, 'error', 3000);
    return false;
  }
  return true;
}

// Records a failed recovery attempt and shows remaining-attempts / lockout.
async function recoveryFailed() {
  const { lockedUntil, lockMs } = await bumpRecoveryFail(state.exec, Date.now());
  if (lockMs) {
    banner(`Yanlış. Çok fazla deneme — ${lockMs / 1000} sn kilitlendi.`, 'error', 3000);
  } else {
    const remaining = Math.max(0, 5 - (await getRecoveryFailState(state.exec)).failCount);
    banner(`Yanlış. Kalan deneme: ${remaining}.`, 'error', 2500);
  }
}

export async function forgotPinFlow() {
  try {
    if (!(await hasRecoverySetup(state.exec))) {
      openSheet(`
        <h4>PİN'imi unuttum</h4>
        <p class="muted">Kurtarma yöntemi ayarlanmamış. Verileriniz Yedek dosyalarınızdan kurtarılabilir.</p>
        <div class="form" style="padding:0"><button id="rec-close" class="primary">Kapat</button></div>
      `);
      document.getElementById('rec-close').addEventListener('click', closeSheet);
      return;
    }
    const st = await getRecoveryStatus(state.exec);
    openSheet(`
      <h4>PİN Kurtarma</h4>
      <p class="muted">Kurtarma yöntemini seçin.</p>
      <div class="form" style="padding:0">
        ${st.questions ? '<button id="rec-sq" class="primary">Güvenlik sorularını yanıtla</button>' : ''}
        ${st.code ? '<button id="rec-code">Kurtarma kodu gir</button>' : ''}
        <button id="rec-cancel" type="button" class="ghost">Vazgeç</button>
      </div>
    `);
    document.getElementById('rec-cancel').addEventListener('click', closeSheet);
    if (st.questions) document.getElementById('rec-sq').addEventListener('click', recoverBySecurityQuestions);
    if (st.code) document.getElementById('rec-code').addEventListener('click', recoverByCode);
  } catch (e) {
    banner(`Kurtarma açılamadı — ${e.message || e}`, 'error', 0);
  }
}

async function recoverBySecurityQuestions() {
  const q1 = await getMeta(state.exec, 'sq1_q');
  const q2 = await getMeta(state.exec, 'sq2_q');
  openSheet(`
    <h4>Güvenlik Soruları</h4>
    <div class="form" style="padding:0">
      <label>${esc(q1 || 'Soru 1')}<input id="rec-a1" type="text" autocomplete="off"></label>
      <label>${esc(q2 || 'Soru 2')}<input id="rec-a2" type="text" autocomplete="off"></label>
      <button id="rec-sq-go" class="primary">Doğrula</button>
      <button id="rec-sq-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('rec-sq-cancel').addEventListener('click', closeSheet);
  document.getElementById('rec-sq-go').addEventListener('click', async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      if (!(await recoveryLockOk())) { btn.disabled = false; return; }
      const a1 = document.getElementById('rec-a1').value;
      const a2 = document.getElementById('rec-a2').value;
      if (await verifySecurityAnswers(state.exec, [a1, a2])) {
        await clearRecoveryFail(state.exec);
        newPinAfterRecovery();
      } else {
        await recoveryFailed();
        btn.disabled = false;
      }
    } catch (e) {
      banner(`Doğrulama hatası — ${e.message || e}`, 'error', 0);
      btn.disabled = false;
    }
  });
}

async function recoverByCode() {
  openSheet(`
    <h4>Kurtarma Kodu</h4>
    <div class="form" style="padding:0">
      <label>Kurtarma kodunuz<input id="rec-code-in" type="text" autocomplete="off" placeholder="XXXX-XXXX-XXXX" style="text-transform:uppercase"></label>
      <button id="rec-code-go" class="primary">Doğrula</button>
      <button id="rec-code-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('rec-code-cancel').addEventListener('click', closeSheet);
  document.getElementById('rec-code-go').addEventListener('click', async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      if (!(await recoveryLockOk())) { btn.disabled = false; return; }
      const code = document.getElementById('rec-code-in').value;
      if (await verifyRecoveryCode(state.exec, code)) {
        await clearRecoveryFail(state.exec);
        newPinAfterRecovery();
      } else {
        await recoveryFailed();
        btn.disabled = false;
      }
    } catch (e) {
      banner(`Doğrulama hatası — ${e.message || e}`, 'error', 0);
      btn.disabled = false;
    }
  });
}

// Reached only after a recovery method verified. Sets a new PIN, then unlocks.
function newPinAfterRecovery() {
  openSheet(`
    <h4>Yeni PIN belirle</h4>
    <div class="form" style="padding:0">
      <label>Yeni PIN (4-6 rakam)<input id="rec-pin1" type="password" inputmode="numeric" maxlength="6"></label>
      <label>Yeni PIN (tekrar)<input id="rec-pin2" type="password" inputmode="numeric" maxlength="6"></label>
      <button id="rec-pin-go" class="primary">Kaydet ve Aç</button>
    </div>
  `);
  document.getElementById('rec-pin-go').addEventListener('click', async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    try {
      const p1 = document.getElementById('rec-pin1').value;
      const p2 = document.getElementById('rec-pin2').value;
      if (!/^\d{4,6}$/.test(p1)) { banner('Yeni PIN 4-6 rakam olmalı.', 'error', 2500); btn.disabled = false; return; }
      if (p1 !== p2) { banner('PIN’ler eşleşmiyor.', 'error', 2500); btn.disabled = false; return; }
      await resetPinAfterRecovery(state.exec, p1);
      closeSheet();
      banner('PIN sıfırlandı ✓', 'ok');
      try { await unlock(); }
      catch (e) { banner(`Açılış hatası — ${e.message || e}`, 'error', 0); }
    } catch (e) {
      banner(`PIN sıfırlanamadı — ${e.message || e}`, 'error', 0);
      btn.disabled = false;
    }
  });
}

export function lockNow() {
  showScreen('lock');
}

export async function initLock(onUnlock) {
  onUnlockCb = onUnlock;
  showScreen('lock');
  // Listeners BEFORE awaiting first-run setup, otherwise Enter is dead during
  // setup. The textContent guard keeps submitPin off while in "PIN Belirle" mode.
  document.getElementById('btn-pin-ok').addEventListener('click', () => { if (document.getElementById('btn-pin-ok').textContent === 'Aç') submitPin(); });
  document.getElementById('pin-input').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (document.getElementById('btn-pin-ok').textContent === 'Aç') submitPin();
    else document.getElementById('btn-pin-ok').click(); // first-run: Enter = "PIN Belirle"
  });
  document.getElementById('btn-forgot-pin').addEventListener('click', forgotPinFlow);
  if ((await getMeta(state.exec, 'pin_hash')) === null) await firstRunSetPin();
  // A PIN now exists (either pre-existing or just set): offer recovery on the lock screen.
  document.getElementById('btn-forgot-pin').classList.remove('hidden');

  bioAvailable = await biometricAvailable();
  document.getElementById('btn-bio').classList.toggle('hidden', !bioAvailable);
  if (bioAvailable) {
    document.getElementById('btn-bio').addEventListener('click', tryBiometric);
    tryBiometric(); // prompt immediately on open
  }

  // Arka plana geçişte kilitle. iPhone/Android'de Capacitor'ın appStateChange'i,
  // Mac'te pencerenin blur/focus olayları aynı işi görür: uygulama öne gelmediği
  // sürece hasta listesi ekranda durmaz. (iOS'ta ayrıca uygulama değiştirici
  // önizlemesinde hasta adı görünmesin diye ekran her hâlükârda karartılır.)
  const onBackground = () => {
    // Fold WAL into the main DB file so the platform's own backup (iCloud on
    // iOS, Google Auto Backup on Android) captures a coherent single file.
    // Fire-and-forget: must never block backgrounding.
    // query, not run: this PRAGMA returns a result row (busy/log/checkpointed).
    state.exec.query('PRAGMA wal_checkpoint(TRUNCATE)').catch(() => {});
    flushSnapshot();
    // Remember where we were (to restore on unlock) only if we were actually
    // unlocked and PIN setup is done. Always blank the screen for the thumbnail.
    const setUp = document.getElementById('btn-pin-ok').textContent === 'Aç';
    if (state.screen !== 'lock' && setUp) { lockedFrom = state.screen; bgAt = Date.now(); }
    lockNow();
  };

  if (isNative()) {
    App.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) onBackground(); else onResume();
    });
  } else if (isDesktop()) {
    window.addEventListener('blur', onBackground);
    window.addEventListener('focus', onResume);
  }
}

async function onResume() {
  // Only when we're on the lock screen after a real background (PIN setup done).
  if (state.screen !== 'lock' || document.getElementById('btn-pin-ok').textContent !== 'Aç') return;
  if (!lockedFrom) { if (bioAvailable) tryBiometric(); return; } // never was unlocked this session
  let policy = '2';
  try { policy = (await getMeta(state.exec, 'lock_policy')) || '2'; } catch {}
  if (!shouldRequirePin(policy, Date.now() - bgAt)) {
    // Auto-unlock: reveal the prior screen, no PIN, no heavy refresh (DOM intact).
    showScreen(lockedFrom); lockedFrom = null;
  } else if (bioAvailable) {
    tryBiometric();
  }
}
