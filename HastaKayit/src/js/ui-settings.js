import * as XLSX from 'xlsx';
import { allData, restoreAll, getMeta, setMeta, mergeImport, bulkImport } from './repo.js';
import { makeBackup, parseBackup } from './backup.js';
import { buildWorkbook, workbookToBase64, parseWorkbook } from './excel.js';
import { parseGeneralWorkbook } from './general-excel.js';
import { isHtsWorkbook, parseHtsWorkbook } from './hts-excel.js';
import { shareFile, textToBase64, bytesToBase64, exportMessage, validateSyncFolder, pickSyncFolder } from './files.js';
import { isNative, isDesktop, platform, platformLabel } from './platform.js';
import { desktop } from './desktop.js';
import { getSyncSettings, syncIfConfigured, ANDROID_SYNC_LABEL } from './sync-file.js';
import { state, showScreen, guarded, banner, openSheet, closeSheet, todayIso, esc } from './ui.js';
import { monthlySummary, fmtTL } from './compute.js';
import { refreshHome } from './ui-home.js';
import { openForm, setFormPhotoFromFile } from './ui-form.js';
import { initDragDrop, classifyFiles, attachDropZone } from './ui-dnd.js';
import { generateBlankForm, parseForm } from './pdf-form.js';
import { generateBlankDocx, parseDocx } from './docx-form.js';
import { takeSnapshot } from './snapshot.js';
import { changePinFlow } from './lock.js';
import { getRecoveryStatus, setSecurityQuestions, setRecoveryCode } from './pin-recovery.js';
import { setNotifSound } from './notify.js';
import { openBatchImport } from './ui-batch.js';

function isNativeSafe() { try { return isNative() || isDesktop(); } catch { return false; } }

/**
 * Otomatik yedeklemenin o platformda nereden geldiğini anlatan cümle. Saf.
 * Android'e özgü "Google Drive" ifadesi iPhone'da yanlış olurdu; iPhone'da
 * karşılığı iCloud yedeklemesidir, Mac'te ise yerel klasör (yedek bulutta değil).
 */
export function autoBackupNote(p) {
  if (p === 'android') return ' Google Drive yedeği Android tarafından otomatik alınır.';
  if (p === 'ios') return ' iPhone yedeklemesi açıksa (Ayarlar → Apple Kimliği → iCloud → iCloud Yedeklemesi) veriler cihaz yedeğine de dahil edilir.';
  return '';
}

/**
 * Bildirim sesinin nereden ayarlandığı platforma göre değişir; Android'e özgü
 * "Telefon Ayarları → Uygulamalar" yolu iPhone'da ve Mac'te yanlıştır. Saf.
 */
export function notifHelpText(p) {
  if (p === 'ios') return 'Bildirim sesi ve gösterim biçimi: Ayarlar → Bildirimler → Hasta Kayıt. Takvim hatırlatma sesi iPhone’un Takvim uygulamasından ayarlanır.';
  if (p === 'android') return 'Özel bir zil sesi seçmek için: Telefon Ayarları → Uygulamalar → Hasta Kayıt → Bildirimler. Takvim hatırlatma sesi telefonun Takvim uygulamasından ayarlanır.';
  if (p === 'macos') return 'Masaüstü sürümünde hatırlatmalar uygulama açıkken gösterilir; bildirim izni ve sesi macOS Sistem Ayarları → Bildirimler → Hasta Kayıt bölümünden yönetilir.';
  if (p === 'windows' || p === 'linux') return 'Masaüstü sürümünde hatırlatmalar uygulama açıkken gösterilir.';
  return '';
}

/**
 * "Verilerim nerede duruyor?" satırı. Doktorun yedeği elle alması ya da başka bir
 * cihaza taşıması için gereken TEK bilgi bu, o yüzden her platformda somut bir
 * yol/konum yazıyoruz — Mac'te gerçek klasör yolu (+ Finder'da açma düğmesi),
 * iPhone'da Dosyalar uygulamasındaki karşılığı.
 */
async function showDataLocation() {
  const el = document.getElementById('data-location-info');
  const btn = document.getElementById('btn-reveal-data');
  if (!el) return;
  if (isDesktop()) {
    const dir = await desktop.dataDir().catch(() => null);
    el.textContent = dir
      ? `💾 Veri konumu: ${dir} — yedekler: ${dir}/daily (günlük), ${dir}/backups (anlık görüntü)`
      : '💾 Veri konumu bulunamadı.';
    if (btn) {
      btn.classList.remove('hidden');
      btn.textContent = platform() === 'macos' ? "📂 Finder'da Göster" : '📂 Klasörü Aç';
    }
  } else if (platform() === 'ios') {
    el.textContent = '💾 Yedekler: Dosyalar uygulaması → iPhone\'umda → Hasta Kayıt → HastaKayit/daily (günlük) ve HastaKayit/snapshots (anlık görüntü). Buradan Dosyalar üzerinden kopyalayabilir veya paylaşabilirsiniz.';
    btn?.classList.add('hidden');
  } else if (platform() === 'android') {
    el.textContent = '💾 Yedekler: Belgeler/HastaKayit/daily (günlük) ve Belgeler/HastaKayit/snapshots (anlık görüntü).';
    btn?.classList.add('hidden');
  } else {
    el.textContent = `${platformLabel()} önizlemesinde veriler kalıcı DEĞİLDİR — yalnızca deneme amaçlıdır.`;
    btn?.classList.add('hidden');
  }
}

const FIELD_TR = { name: 'Ad Soyad', mother_name: 'Anne Adı', residence: 'İkametgah', birth_date: 'Doğum Tarihi', diagnosis: 'Tanı', referral: 'Sevk Eden', phone: 'Telefon', start_date: 'Başlangıç', end_date: 'Bitiş', amount: 'Ödeme', notes: 'Not' };

/**
 * Defterin NASIL okunduğunu açık açık yazan not. Saf (test edilebilir).
 *
 * Buna ihtiyaç doğdu çünkü 53.096 satırlık bir defter sessizce 15.727 kayda
 * inmişti ve ekranda bunu haber veren hiçbir şey yoktu: dosya HTS olarak
 * tanınmamış, genel içe aktarıcıya düşmüş, orada TARİH ve FİYAT sütunları
 * "eşleşmedi" diye atılmış, "İSİM SOYİSİM" yer tutucusu da gerçek bir ad
 * sanılıp 28.965 satır tek hastada birleştirilmişti. Bir daha aynı şey sessizce
 * olmasın diye sayılar artık önizlemede duruyor.
 */
export function htsReadNote(stats) {
  const cols = stats.columns || {};
  const used = [
    ['Ad', cols.isim], ['Anne', cols.anne], ['Tanı', cols.tani], ['Ücret', cols.ucret],
    ['Tarih', cols.tarih], ['Telefon', cols.telefon], ['İkamet', cols.ikamet], ['Yaş/Doğum', cols.dogum],
  ].filter(([, v]) => v).map(([k, v]) => `${k} ← “${esc(String(v))}”`);
  const lines = [`<b>${stats.totalRows}</b> satır okundu.`];
  if (stats.emptyRows) lines.push(`<b>${stats.emptyRows}</b> tamamen boş satır atlandı.`);
  if (stats.merged) lines.push(`<b>${stats.merged}</b> satır, aynı kişinin başka satırıyla birleştirildi (anne adı veya telefon eşleşmesi).`);
  if (stats.dateCarried) lines.push(`<b>${stats.dateCarried}</b> satırın tarihi okunamadı; defter kronolojik olduğu için bir önceki tarihe yazıldı (ham metin tanıya eklendi).`);
  if (stats.undated) lines.push(`<b>${stats.undated}</b> satırın hiç tarihi yok; bugünün tarihiyle kaydedilecek.`);
  if (stats.skipped) lines.push(`<b>${stats.skipped}</b> teslimat satırı isimsiz olduğu için atlandı.`);
  const ignored = stats.ignoredColumns || [];
  if (ignored.length) lines.push(`<b>Okunmayan sütun:</b> ${esc(ignored.join(', '))} — bu sütunlardaki bilgi aktarılmayacak.`);
  return `<details style="margin:8px 0"><summary class="muted">Dosya nasıl okundu? (${stats.totalRows} satır)</summary>
    <p class="muted" style="margin-top:6px">${lines.join('<br>')}</p>
    <p class="muted"><b>Kullanılan sütunlar:</b> ${used.join(' · ') || 'yok'}</p></details>`;
}

// HTS (doktorun eski ~78k satırlık) Excel dosyasını içe aktarır: önce bir önizleme
// onayı (kaç hasta/ödeme/teslimat), sonra bulkImport ile toplu yazım.
// bulkImport zaten idempotent (uuid + INSERT OR IGNORE) ve her chunk kendi
// transaction'ında, yani bir hata mevcut veriyi bozmadan yarıda kesilir.
async function importHtsWorkbook(workbook) {
  let patients, payments, deliveries, stats;
  try {
    ({ patients, payments, deliveries, stats } = parseHtsWorkbook(workbook, todayIso()));
  } catch (e) {
    banner(`İÇE AKTARMA REDDEDİLDİ — HTS dosyası okunamadı: ${e.message || e}`, 'error', 0);
    return;
  }
  openSheet(`
    <h4>HTS Excel İçe Aktar</h4>
    <p class="muted">Bu dosyadan içeri aktarılacak:<br>
    • <b>${stats.patients}</b> hasta kaydı — ${stats.named} isimli, ${stats.anonymous} isimsiz<br>
    • <b>${stats.payments}</b> ödeme<br>
    • <b>${stats.deliveries}</b> teslimat</p>
    ${htsReadNote(stats)}
    <p class="muted">Aynı kayıtlar tekrar eklenmez. Devam edilsin mi?</p>
    <div class="form" style="padding:0">
      <button id="hts-go" class="primary">İçeri Aktar</button>
      <button id="hts-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('hts-cancel').addEventListener('click', closeSheet);
  document.getElementById('hts-go').addEventListener('click', async ev => {
    ev.currentTarget.disabled = true;
    const total = patients.length + payments.length + deliveries.length;
    openSheet(`
      <h4>İçeri Aktarılıyor…</h4>
      <p class="muted" id="hts-progress-text">0 / ${total}</p>
      <div style="background:var(--line);border-radius:6px;overflow:hidden;height:10px;margin-top:8px">
        <div id="hts-progress-bar" style="height:100%;width:0%;background:var(--blue);transition:width .15s linear"></div>
      </div>
    `);
    const textEl = document.getElementById('hts-progress-text');
    const barEl = document.getElementById('hts-progress-bar');
    // 77k satırlık bir içe aktarma yüzlerce chunk'tan oluşur; her chunk'ta DOM'u
    // güncellemek gereksiz reflow'a yol açar, o yüzden ~1000 satırda bir güncelle.
    // rAF beklemesi: Android'de (gerçek Capacitor SQLite köprüsü) her chunk zaten
    // native'e gidip geldiği için tarayıcı arada boyama fırsatı buluyor; masaüstü/web
    // önizlemede (sql.js WASM, tamamen senkron) bu beklemenin garantisi yok — o yüzden
    // metin/çubuğu HER ZAMAN önce senkron güncelliyoruz, rAF sadece ekstra fırsat.
    let lastRepaint = 0;
    const onProgress = ({ done, total: t }) => {
      if (!textEl || (done - lastRepaint < 1000 && done < t)) return;
      lastRepaint = done;
      textEl.textContent = `${done} / ${t}`;
      barEl.style.width = `${t ? Math.round((done / t) * 100) : 100}%`;
      new Promise(requestAnimationFrame).catch(() => {});
    };
    const res = await guarded(() => bulkImport(state.exec, { patients, payments, deliveries }, onProgress));
    if (!res.ok) return; // hata banner'ı guarded() içinde gösterildi; mevcut veri bozulmadı
    closeSheet();
    const { patientsAdded, paymentsAdded, deliveriesAdded } = res.value;
    banner(`İçeri aktarma tamam: ${patientsAdded} hasta, ${paymentsAdded} ödeme, ${deliveriesAdded} teslimat eklendi.`, 'ok', 5000);
    await refreshHome();
    await openSettings();
  });
}

export async function openSettings() {
  try {
    const d = await allData(state.exec);
    const last = JSON.parse((await getMeta(state.exec, 'last_snapshot')) || 'null');
    document.getElementById('backup-info').textContent = last
      ? `Son otomatik yedek: ${last.at.slice(0, 16).replace('T', ' ')} (${last.patients} hasta, ${last.payments} ödeme).${autoBackupNote(platform())}`
      : `Henüz otomatik yedek alınmadı.${autoBackupNote(platform())}`;
    const notifHelp = document.getElementById('notif-help');
    if (notifHelp) notifHelp.textContent = notifHelpText(platform());
    // iOS'ta bildirim sesi uygulamadan değil, sistem ayarlarından yönetilir
    // (bkz. notify.js/ensureChannels) — çalışmayacak bir seçenek gösterilmez.
    document.getElementById('notif-sound')?.closest('label')?.classList.toggle('hidden', platform() === 'ios');
    await showDataLocation();
    let rows;
    try {
      rows = monthlySummary(d.patients, d.payments);
    } catch (e) {
      document.getElementById('monthly-table').innerHTML = `<p class="muted">Aylık özet hesaplanamadı: ${esc(e.message || String(e))}</p>`;
      rows = null;
    }
    if (rows) {
      document.getElementById('monthly-table').innerHTML = rows.length
        ? `<table class="monthly"><tr><th>Ay</th><th>Tahsilat</th><th>Ödeme</th><th>Aktif Hasta</th></tr>
           ${rows.map(r => `<tr><td>${esc(r.month)}</td><td>${fmtTL(r.total)}</td><td>${r.count}</td><td>${r.activePatients}</td></tr>`).join('')}</table>`
        : '<p class="muted">Henüz ödeme kaydı yok.</p>';
    }
    document.getElementById('lock-policy').value = (await getMeta(state.exec, 'lock_policy')) || '2';
    document.getElementById('default-remind').value = (await getMeta(state.exec, 'default_remind_min')) || '60';
    document.getElementById('notif-sound').value = (await getMeta(state.exec, 'notif_sound')) || 'on';
    await refreshRecoveryStatus();
    await refreshSyncUi();
    showScreen('settings');
  } catch (e) {
    banner(`Ayarlar yüklenemedi — ${e.message || e}`, 'error', 0);
  }
}

async function refreshRecoveryStatus() {
  const el = document.getElementById('recovery-status');
  if (!el) return;
  try {
    const s = await getRecoveryStatus(state.exec);
    if (!s.questions && !s.code) {
      el.textContent = 'Kurtarma yöntemi ayarlanmadı. PIN’i unutursanız kurtaramazsınız.';
    } else {
      const parts = [];
      if (s.questions) parts.push('güvenlik soruları ✓');
      if (s.code) parts.push('kurtarma kodu ✓');
      el.textContent = `Kurtarma: ${parts.join(', ')}`;
    }
  } catch { el.textContent = ''; }
}

// Setup UI: two security questions (question + answer) and a one-time recovery
// code. Answers/code are hashed by the repo functions — never stored in plaintext.
export function recoverySetupFlow() {
  openSheet(`
    <h4>🔐 Kurtarma Ayarları</h4>
    <p class="muted">PIN’inizi unutursanız bu yöntemlerle sıfırlayabilirsiniz.</p>
    <div class="form" style="padding:0">
      <h3 style="margin:4px 0">Güvenlik Soruları</h3>
      <label>Soru 1<input id="rs-q1" type="text" placeholder="Örn. İlk okulunuzun adı?"></label>
      <label>Yanıt 1<input id="rs-a1" type="text" autocomplete="off"></label>
      <label>Soru 2<input id="rs-q2" type="text" placeholder="Örn. İlk evcil hayvanınız?"></label>
      <label>Yanıt 2<input id="rs-a2" type="text" autocomplete="off"></label>
      <button id="rs-save-sq" class="primary">Soruları Kaydet</button>
      <h3 style="margin:12px 0 4px">Kurtarma Kodu</h3>
      <button id="rs-gen-code">Kurtarma Kodu Oluştur</button>
      <div id="rs-code-box"></div>
      <button id="rs-close" type="button" class="ghost">Kapat</button>
    </div>
  `);
  const q1 = document.getElementById('rs-q1');
  getMeta(state.exec, 'sq1_q').then(v => { if (v) q1.value = v; });
  getMeta(state.exec, 'sq2_q').then(v => { if (v) document.getElementById('rs-q2').value = v; });

  document.getElementById('rs-close').addEventListener('click', async () => { closeSheet(); await refreshRecoveryStatus(); });

  document.getElementById('rs-save-sq').addEventListener('click', async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    const r = await guarded(() => setSecurityQuestions(state.exec, [
      { q: document.getElementById('rs-q1').value, a: document.getElementById('rs-a1').value },
      { q: document.getElementById('rs-q2').value, a: document.getElementById('rs-a2').value },
    ]));
    btn.disabled = false;
    if (r.ok) {
      document.getElementById('rs-a1').value = '';
      document.getElementById('rs-a2').value = '';
      banner('Güvenlik soruları kaydedildi ✓', 'ok');
      await refreshRecoveryStatus();
    }
  });

  document.getElementById('rs-gen-code').addEventListener('click', async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    const r = await guarded(() => setRecoveryCode(state.exec));
    if (!r.ok) { btn.disabled = false; return; }
    document.getElementById('rs-code-box').innerHTML = `
      <div style="margin:8px 0;padding:12px;border:1px solid var(--line);border-radius:8px;text-align:center">
        <div style="font-size:1.4em;font-weight:700;letter-spacing:2px;font-family:monospace">${esc(r.value)}</div>
        <p class="muted" style="margin:8px 0 0">Bu kodu güvenli bir yere kaydedin — bir daha gösterilmeyecek.</p>
      </div>`;
    btn.textContent = 'Yeni Kod Oluştur (eskisini geçersiz kılar)';
    btn.disabled = false;
    await refreshRecoveryStatus();
  });
}

export function initSettings() {
  document.querySelector('#screen-settings .btn-back').addEventListener('click', async () => { await refreshHome(); showScreen('home'); });

  document.getElementById('btn-recovery-setup').addEventListener('click', recoverySetupFlow);

  document.getElementById('btn-export-xlsx').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await guarded(async () => {
      const d = await allData(state.exec);
      const wb = buildWorkbook(d.patients, d.payments, todayIso(), d.deliveries);
      return shareFile(`HastaKayit_${todayIso()}.xlsx`, workbookToBase64(wb),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    });
    btn.disabled = false;
    if (r.ok) { const m = exportMessage(r.value, 'Excel'); banner(m.text, m.kind); }
  });

  document.getElementById('btn-export-json').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await guarded(async () => {
      const d = await allData(state.exec);
      const b = makeBackup(d.patients, d.payments, new Date().toISOString(), d.deliveries, d.deletions);
      return shareFile(`HastaKayit_Yedek_${todayIso()}.json`, textToBase64(JSON.stringify(b, null, 1)), 'application/json');
    });
    btn.disabled = false;
    if (r.ok) { const m = exportMessage(r.value, 'Yedek'); banner(m.text, m.kind); }
  });

  // Generate the fillable intake PDF and hand it off via the SAME save/share
  // path as the Excel export (iPhone/Android paylaşım sayfası, Mac'te
  // "Farklı Kaydet…" paneli, tarayıcıda indirme) — only the bytes/MIME differ.
  document.getElementById('btn-blank-form').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await guarded(async () => {
      const bytes = await generateBlankForm();
      return shareFile('Danisan-Kayit-Formu.pdf', bytesToBase64(bytes), 'application/pdf');
    });
    btn.disabled = false;
    if (r.ok) { const m = exportMessage(r.value, 'Boş hasta formu (PDF)'); banner(m.text, m.kind); }
  });

  // Word (.docx) variant — same save/share path, different bytes/MIME. DOCX
  // renders Turkish labels perfectly (no Helvetica font limitation).
  document.getElementById('btn-blank-form-docx').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await guarded(async () => {
      const bytes = await generateBlankDocx();
      return shareFile('Danisan-Kayit-Formu.docx', bytesToBase64(bytes),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });
    btn.disabled = false;
    if (r.ok) { const m = exportMessage(r.value, 'Boş hasta formu (Word)'); banner(m.text, m.kind); }
  });

  document.getElementById('btn-restore').addEventListener('click', () => document.getElementById('restore-file').click());
  document.getElementById('restore-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const r = parseBackup(text);
    if (!r.ok) { banner(`GERİ YÜKLEME REDDEDİLDİ — ${r.error}`, 'error', 0); return; }
    openSheet(`
      <h4>Yedeği Geri Yükle</h4>
      <p class="muted">Yedek tarihi: ${esc(String(r.exported_at || '').slice(0, 16).replace('T', ' '))}<br>
      İçerik: <b>${r.counts.patients} hasta, ${r.counts.payments} ödeme${r.counts.deliveries != null ? ', ' + r.counts.deliveries + ' teslimat' : ''}</b><br><br>
      MEVCUT TÜM VERİ bu yedekle DEĞİŞTİRİLECEK. Mevcut verinin anlık görüntüsü önce otomatik alınır.</p>
      <div class="form" style="padding:0">
        <button id="restore-go" class="primary" style="background:var(--red)">Evet, Geri Yükle</button>
        <button id="restore-cancel" type="button" class="ghost">Vazgeç</button>
      </div>
    `);
    document.getElementById('restore-cancel').addEventListener('click', closeSheet);
    document.getElementById('restore-go').addEventListener('click', async ev => {
      const btn = ev.currentTarget; btn.disabled = true;
      const res = await guarded(async () => {
        if (isNativeSafe()) await takeSnapshot(); // pre-restore safety snapshot (native only)
        return restoreAll(state.exec, r.data);
      });
      if (!res.ok) { btn.disabled = false; return; }
      closeSheet();
      banner('Geri yükleme tamamlandı ✓', 'ok');
      await refreshHome();
      await openSettings();
    });
  });

  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', async e => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    await handleImportFile(file);
  });

  // Toplu (çoklu) form aktarımı: many filled intake forms at once, reviewed
  // before anything is written. Same destination as a multi-file drag-drop.
  document.getElementById('btn-batch-forms').addEventListener('click', () => document.getElementById('batch-forms-file').click());
  document.getElementById('batch-forms-file').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // allow re-picking the same files
    if (!files.length) return;
    await openBatchImport(files);
  });

  document.getElementById('btn-change-pin').addEventListener('click', () => changePinFlow());

  document.getElementById('lock-policy').addEventListener('change', async e => {
    const r = await guarded(() => setMeta(state.exec, 'lock_policy', e.target.value));
    if (r.ok) banner('PIN ayarı kaydedildi ✓', 'ok');
  });

  document.getElementById('default-remind').addEventListener('change', async e => {
    const r = await guarded(() => setMeta(state.exec, 'default_remind_min', e.target.value));
    if (r.ok) banner('Varsayılan hatırlatma kaydedildi ✓', 'ok');
  });

  document.getElementById('notif-sound').addEventListener('change', async e => {
    const v = e.target.value;
    const r = await guarded(() => setMeta(state.exec, 'notif_sound', v));
    if (!r.ok) return;
    setNotifSound(v !== 'off');
    if (state.onMutate) state.onMutate(); // re-run reschedule so the channel change takes effect
    banner('Bildirim ayarı kaydedildi ✓', 'ok');
  });

  initSyncUi();
  initDropHandling();
}

// --- 🔄 Cihazlar Arası Eşitleme ---------------------------------------------
// Taşıma katmanı sync-file.js'te; burada yalnızca ayarlar ve durum satırı var.
// Dil DÜRÜST olmak zorunda: Android'de klasörü bulut uygulaması eşitleyemiyorsa
// bunu saklamıyoruz (bkz. docs/ESITLEME.md).

function fmtSyncTime(iso) {
  if (!iso) return 'henüz yapılmadı';
  return String(iso).slice(0, 16).replace('T', ' ');
}

// Electron'da <input webkitdirectory> ile seçilen klasörün MUTLAK yolunu bul.
// Electron 32+ File.path'i kaldırdı, yerine webUtils.getPathForFile geldi;
// ikisini de deniyoruz. Hiçbiri çalışmazsa '' döner ve kullanıcıdan yolu
// yapıştırması istenir (yol kutusu her zaman görünür durur).
function folderPathFromFiles(files) {
  const f = files && files[0];
  if (!f) return '';
  let full = '';
  try {
    const { webUtils } = window.require('electron');
    if (webUtils?.getPathForFile) full = webUtils.getPathForFile(f);
  } catch { /* webUtils yok */ }
  if (!full) full = f.path || '';
  if (!full) return '';
  const path = window.require('path');
  const rel = String(f.webkitRelativePath || '').replace(/\\/g, '/');
  let dir = path.dirname(full);
  const depth = rel ? rel.split('/').length - 1 : 1; // seçilen klasör ile dosya arasındaki basamak
  for (let i = 1; i < depth; i++) dir = path.dirname(dir);
  return dir;
}

export async function refreshSyncUi() {
  const s = await getSyncSettings(state.exec);
  const sel = document.getElementById('sync-enabled');
  if (sel) sel.value = s.enabled ? 'on' : 'off';
  const desk = document.getElementById('sync-desktop');
  const note = document.getElementById('sync-mobile-note');
  const nowBtn = document.getElementById('btn-sync-now');
  const helpBtn = document.getElementById('btn-sync-help');
  if (helpBtn) helpBtn.onclick = () => showSyncHelp(s.platform);
  if (desk) desk.classList.toggle('hidden', s.platform !== 'desktop');
  if (note) note.classList.toggle('hidden', s.platform === 'desktop');
  if (s.platform === 'desktop') {
    const inp = document.getElementById('sync-folder');
    if (inp) inp.value = s.folder || '';
  } else if (note) {
    note.textContent = s.platform === 'mobile'
      ? `Bu telefonda eşitleme dosyası şuraya yazılır: ${ANDROID_SYNC_LABEL}. `
        + 'DİKKAT: Google Drive ve OneDrive’ın Android uygulamaları telefondaki bir klasörü kendiliğinden eşitlemez — '
        + 'bu klasörün bilgisayara ulaşması için klasör eşitleyen bir uygulama (Syncthing, FolderSync vb.) kurmanız ya da '
        + 'yukarıdaki “Yedek Al (JSON)” / “İçe Aktar” adımlarını elle kullanmanız gerekir.'
      : 'Eşitleme yalnızca masaüstü uygulamasında (Mac/Windows) ve telefonda çalışır (tarayıcı önizlemesinde kapalıdır).';
  }
  if (nowBtn) nowBtn.disabled = !s.active;
  const st = document.getElementById('sync-status');
  if (st) {
    st.textContent = s.active
      ? `Son eşitleme: ${fmtSyncTime(s.last)}`
      : (s.enabled ? 'Eşitleme açık ama klasör seçilmedi — henüz çalışmıyor.' : `Eşitleme kapalı. Son eşitleme: ${fmtSyncTime(s.last)}`);
  }
}

async function runManualSync() {
  const btn = document.getElementById('btn-sync-now');
  const st = document.getElementById('sync-status');
  if (btn) btn.disabled = true;
  if (st) st.textContent = 'Eşitleniyor…';
  try {
    const r = await syncIfConfigured(state.exec, { onProgress: (p) => { if (st) st.textContent = `Eşitleniyor… (${p})`; } });
    if (r.error) banner(`EŞİTLEME BAŞARISIZ — ${r.error} (kayıtlarınıza dokunulmadı)`, 'error', 0);
    else if (r.skipped) banner(r.reason === 'busy' ? 'Eşitleme zaten sürüyor.' : 'Eşitleme kapalı.', 'ok');
    else banner(`Eşitlendi ✓ (${r.applied.patientsUpserted} hasta, ${r.applied.paymentsUpserted} ödeme, ${r.applied.deliveriesUpserted} teslimat güncellendi)`, 'ok');
    if (!r.error && !r.skipped) await refreshHome();
  } finally {
    if (btn) btn.disabled = false;
    await refreshSyncUi();
  }
}

function initSyncUi() {
  const sel = document.getElementById('sync-enabled');
  if (!sel) return; // eski markup — eşitleme bölümü yoksa sessizce çık
  sel.addEventListener('change', async e => {
    const v = e.target.value === 'on' ? 'on' : 'off';
    const r = await guarded(() => setMeta(state.exec, 'sync_enabled', v));
    if (r.ok) banner(v === 'on' ? 'Eşitleme açıldı ✓' : 'Eşitleme kapatıldı ✓', 'ok');
    await refreshSyncUi();
  });

  // Mac/Windows'ta GERÇEK klasör seçme paneli. Eski yol gizli bir dosya
  // seçicinin (webkitdirectory) döndürdüğü göreli yollardan klasörü tahmin
  // etmeye çalışıyordu; macOS'ta o yol MUTLAK yolu hiç vermez, yani "Klasör
  // yolu okunamadı" deyip kullanıcıyı elle yol yapıştırmaya zorlardı.
  // Yerli panel hem yanlış yazmayı imkânsız kılar hem de seçilen klasörü aynı
  // anda ana süreçte "izin verilmiş" olarak kaydeder.
  document.getElementById('btn-sync-pick')?.addEventListener('click', async () => {
    if (isDesktop()) {
      const dir = await pickSyncFolder();
      if (!dir) return; // kullanıcı vazgeçti
      document.getElementById('sync-folder').value = dir;
      banner('Klasör seçildi — kaydetmek için "Klasörü Kaydet"e basın.', 'ok');
      return;
    }
    document.getElementById('sync-folder-picker')?.click();
  });

  document.getElementById('sync-folder-picker')?.addEventListener('change', e => {
    const files = e.target.files;
    e.target.value = '';
    const dir = folderPathFromFiles(files);
    if (!dir) {
      banner('Klasör yolu okunamadı. Lütfen klasörün tam yolunu kutuya yapıştırıp "Klasörü Kaydet"e basın.', 'error', 0);
      return;
    }
    document.getElementById('sync-folder').value = dir;
    banner('Klasör seçildi — kaydetmek için "Klasörü Kaydet"e basın.', 'ok');
  });

  document.getElementById('btn-sync-save')?.addEventListener('click', async () => {
    const dir = document.getElementById('sync-folder').value.trim();
    const v = await validateSyncFolder(dir);
    if (!v.ok) { banner(`KLASÖR KAYDEDİLEMEDİ — ${v.error}`, 'error', 0); return; }
    const r = await guarded(() => setMeta(state.exec, 'sync_folder', v.path));
    if (r.ok) banner('Eşitleme klasörü kaydedildi ✓', 'ok');
    await refreshSyncUi();
  });

  document.getElementById('btn-sync-now')?.addEventListener('click', runManualSync);
}

// The single place that decides what an incoming file IS and where it goes.
// Called by the Ayarlar file picker (#import-file) AND by the drag-drop
// handler — the routing logic exists exactly once.
export async function handleImportFile(file) {
  if (!file) return;
  // A filled intake PDF: parse it and open the NEW-patient form pre-filled for
  // the doctor to review/save (same path as paste-to-add). parseForm never
  // throws; guard only the byte read so nothing crosses the file boundary.
  if (/\.pdf$/i.test(file.name)) {
    let p;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      p = await parseForm(bytes);
    } catch (err) {
      banner('PDF okunamadı — ' + (err.message || err), 'error', 0);
      return;
    }
    if (p && p.name && p.name.trim()) {
      // birth_date arrives from parseForm already normalized to YYYY-MM-DD (or
      // '' when the client wrote something unparseable), which is exactly what
      // the form's date input and repo.js expect.
      openForm(null, { name: p.name, mother_name: p.mother_name, birth_date: p.birth_date, residence: p.residence, phone: p.phone, diagnosis: p.diagnosis });
    } else {
      banner('PDF formundan veri okunamadı; alanların doldurulduğundan emin olun.', 'error', 0);
    }
    return;
  }
  // A filled intake Word (.docx): same flow as PDF. parseDocx never throws;
  // guard only the byte read so nothing crosses the file boundary.
  if (/\.docx$/i.test(file.name)) {
    let p;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      p = await parseDocx(bytes);
    } catch (err) {
      banner('Word belgesi okunamadı — ' + (err.message || err), 'error', 0);
      return;
    }
    if (p && p.name && p.name.trim()) {
      openForm(null, { name: p.name, mother_name: p.mother_name, birth_date: p.birth_date, residence: p.residence, phone: p.phone, diagnosis: p.diagnosis });
    } else {
      banner('Word formundan veri okunamadı; alanların doldurulduğundan emin olun.', 'error', 0);
    }
    return;
  }
  let payload;
  let mappingInfo = '';
  if (/\.xlsx$/i.test(file.name)) {
    const buf = new Uint8Array(await file.arrayBuffer());
    let workbook = null;
    // cellDates ŞART: onsuz her tarih hücresi ham bir sayı (45524) olarak gelir
    // ve tarih olarak tanınmaz — 53.096 satırlık defterin bütün tarihleri bu
    // yüzden kayboluyordu.
    try { workbook = XLSX.read(buf, { type: 'array', cellDates: true }); } catch { workbook = null; }
    if (workbook && isHtsWorkbook(workbook)) {
      await importHtsWorkbook(workbook);
      return;
    }
    const isAppFormat = !!(workbook && workbook.SheetNames.includes('Hastalar'));
    if (isAppFormat) {
      const r = parseWorkbook(buf);
      if (!r.ok) { banner(`İÇE AKTARMA REDDEDİLDİ — ${r.error}`, 'error', 0); return; }
      payload = r.data;
    } else {
      const r = parseGeneralWorkbook(buf, todayIso());
      if (!r.ok) { banner(`İÇE AKTARMA REDDEDİLDİ — ${r.error}`, 'error', 0); return; }
      payload = r.data;
      const mapLines = Object.entries(r.mapping).map(([f, h]) => `${FIELD_TR[f] || f} ← "${esc(h)}"`).join(', ');
      mappingInfo = `<p class="muted">Algılanan: ${mapLines}.${r.unmatched.length ? ` Eşleşmeyen sütunlar: ${esc(r.unmatched.join(', '))}.` : ''}</p>`;
    }
  } else {
    const r = parseBackup(await file.text());
    if (!r.ok) { banner(`İÇE AKTARMA REDDEDİLDİ — ${r.error}`, 'error', 0); return; }
    payload = r.data;
  }
  const existing = (await allData(state.exec)).patients;
  const { mergePatients } = await import('./importer.js');
  const prev = mergePatients(existing, payload);
  openSheet(`
    <h4>İçe Aktar / Birleştir</h4>
    ${mappingInfo}
    <p class="muted"><b>${prev.added}</b> yeni hasta eklenecek, <b>${prev.skipped}</b> zaten var (atlanacak). Mevcut kayıtlar DEĞİŞMEZ.</p>
    <div class="form" style="padding:0">
      <button id="imp-go" class="primary">Evet, Birleştir</button>
      <button id="imp-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('imp-cancel').addEventListener('click', closeSheet);
  document.getElementById('imp-go').addEventListener('click', async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    const res = await guarded(() => mergeImport(state.exec, payload));
    if (!res.ok) { btn.disabled = false; return; }
    closeSheet();
    banner(`${res.value.added} yeni hasta eklendi, ${res.value.skipped} atlandı ✓`, 'ok', 4000);
    await refreshHome(); await openSettings();
  });
}

const FORM_EXT = /\.(pdf|docx)$/i;

// Several document files at once. Exactly one file behaves exactly as the
// Ayarlar picker does (unchanged). Two or more INTAKE FORMS (PDF/Word) is the
// case "📚 Toplu Form Aktarımı" exists for, so the drop goes straight into the
// batch review sheet — the doctor must never import 20 forms one at a time.
//
// The WHOLE dropped list is passed on, not just the forms: a stray .xlsx among
// them shows up in the review sheet as its own "Desteklenmeyen dosya türü" row,
// so nothing is ever silently dropped. A multi-file drop with fewer than two
// forms (e.g. two Excel files) has no batch path and keeps the old behaviour.
export async function handleImportFiles(files) {
  const list = (files || []).filter(Boolean);
  if (!list.length) return;
  if (list.length === 1) { await handleImportFile(list[0]); return; }
  const forms = list.filter(f => FORM_EXT.test(String(f.name || '')));
  if (forms.length > 1) { await openBatchImport(list); return; }
  banner(`${list.length} dosya bırakıldı — toplu aktarım sadece PDF/Word formlar için; şimdilik sadece ilki içe aktarılıyor.`, 'ok', 6000);
  await handleImportFile(list[0]);
}

// Window-level drag & drop, wired once at startup (initSettings runs from
// app.js before the lock screen). Context-aware: an image goes to the OPEN
// patient form's photo, documents go through the very same import routing as
// the Ayarlar file picker.
function initDropHandling() {
  initDragDrop({
    onFiles: async files => {
      // initSettings runs before the PIN is entered, so the listeners are live
      // on the lock screen too — a dropped file must never open a form or an
      // import sheet behind the lock. lock.js uses the same 'lock' screen test.
      if (state.screen === 'lock') return;
      const { images, docs } = classifyFiles(files);
      // Patient form open + an image dropped → that is the patient's photo.
      if (images.length && state.screen === 'form') {
        const ok = await setFormPhotoFromFile(images[0]); // shows its own error banner
        if (ok) banner(images.length > 1 ? 'İlk fotoğraf eklendi ✓' : 'Fotoğraf eklendi ✓', 'ok');
        return;
      }
      if (docs.length) { await handleImportFiles(docs); return; }
      if (images.length) { banner('Fotoğrafı eklemek için önce bir hasta formunu açın.', 'error', 0); return; }
      banner('Desteklenmeyen dosya türü.', 'error', 0);
    },
  });
  attachDropZone(document.getElementById('dnd-zone'));
}

// Eşitleme kullanım kılavuzu — doktorun ekranında, dosya açmadan.
// Masaüstü ve telefon adımları farklı olduğu için platforma göre gösterilir.
function showSyncHelp(platform) {
  const desktop = platform === 'desktop';
  openSheet(`
    <h4>🔄 Eşitleme Nasıl Kullanılır?</h4>
    <p class="muted">Aynı hasta kayıtlarını hem bilgisayarda hem telefonda görmek için,
    iki cihazın da <b>aynı bulut klasörünü</b> kullanması yeterlidir. Hesap açmanıza gerek yok —
    OneDrive, Google Drive veya Dropbox'ın bilgisayarınızdaki klasörünü kullanır.</p>

    <div class="sec-title">1) Bir bulut klasörü seçin</div>
    <p class="muted">Örn. Mac'te <code>iCloud Drive → HastaKayit</code>, Windows'ta <code>OneDrive\HastaKayit</code> klasörünü oluşturun.
    Bu klasör iki cihazda da <b>otomatik eşitlenen</b> bir klasör olmalı.</p>

    <div class="sec-title">2) Bilgisayarda</div>
    <p class="muted">Ayarlar → Eşitleme'yi <b>Açık</b> yapın → <b>📁 Klasör Seç</b> ile o klasörü seçin →
    <b>💾 Klasörü Kaydet</b>. Sonra <b>🔄 Şimdi Eşitle</b>.</p>

    <div class="sec-title">3) Telefonda</div>
    <p class="muted">${desktop
      ? 'Telefonda uygulamayı açıp Eşitleme\'yi açın; telefon sabit bir klasör kullanır ve ekranda size o klasörün yolunu gösterir. Drive/OneDrive uygulamanızı <b>o klasörü</b> eşitleyecek şekilde ayarlayın.'
      : 'Eşitleme\'yi <b>Açık</b> yapın. Telefon yukarıda yazan sabit klasörü kullanır. Drive/OneDrive uygulamanızda <b>o klasörü</b> eşitlemeye ekleyin.'}</p>

    <div class="sec-title">Nasıl çalışır?</div>
    <p class="muted">• Kayıtlar <b>birleştirilir</b>, üzerine yazılmaz. İki cihazda ayrı hastalar eklediyseniz ikisi de kalır.<br>
    • Aynı hasta iki cihazda değiştiyse <b>en son yapılan değişiklik</b> geçerli olur.<br>
    • Bir cihazda sildiğiniz kayıt diğerinde de silinir (ve geri gelmez).<br>
    • İnternet yokken uygulama normal çalışır; bağlanınca kendiliğinden eşitler.<br>
    • Bozuk/yarım bir eşitleme dosyası <b>reddedilir</b> — kayıtlarınıza dokunulmaz.</p>

    <div class="sec-title">Ne zaman eşitler?</div>
    <p class="muted">Uygulamayı açıp kilidi açtıktan kısa süre sonra, açıkken her birkaç dakikada bir,
    ve bir kayıt ekleyip değiştirdiğinizde. <b>🔄 Şimdi Eşitle</b> ile istediğiniz an elle de yapabilirsiniz.</p>

    <p class="muted"><b>Not:</b> Eşitleme yedek yerine geçmez. Günlük otomatik yedekleriniz ayrıca alınmaya devam eder.</p>
    <div class="form" style="padding:0"><button id="sync-help-close" class="primary">Anladım</button></div>
  `);
  document.getElementById('sync-help-close').addEventListener('click', closeSheet);
}
