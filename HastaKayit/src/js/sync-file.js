// sync-file.js — Cihazlar arası eşitleme (paylaşılan klasör üzerinden).
//
// AMAÇ: Doktorun telefonu ile masaüstü bilgisayarı aynı hasta kayıtlarını
// görsün. Hesap yok, OAuth yok, sunucu yok: iki cihaz da kullanıcının SEÇTİĞİ
// bir klasördeki TEK bir dosyayı (hastakayit-sync.json) okur ve yazar. Klasörü
// buluta taşıma işini OneDrive / Google Drive masaüstü / Dropbox gibi zaten
// kurulu bir istemci yapar — biz sadece dosyayı doğru yazarız.
//
// TASARIM KARARLARI
// - Birleştirme motoru YENİDEN YAZILMADI: sync-merge.mergeStates (saf LWW +
//   tombstone + diriltme koruması) ve repo.applyMergedState (tek transaction,
//   uuid-upsert) olduğu gibi kullanılır. Bu dosya sadece TAŞIMA katmanıdır.
// - Yazma ATOMİK: önce `hastakayit-sync.json.tmp`, geri-okuma doğrulaması,
//   sonra rename. Diğer cihaz asla yarım yazılmış bir dosya okuyamaz.
// - Dosya, backup.js'teki ile AYNI mantıkta checksum'lı bir zarfa sarılır.
//   Bozuk/yarım/kurcalanmış bir dosya BİRLEŞTİRİLMEZ — reddedilir ve hata
//   döner. Eşitleme hiçbir koşulda yerel kaydı yok etmez.
// - Yerel tamsayı kimlikler (id / patient_id) uzak dosyaya YAZILMAZ: onlar
//   cihaza özeldir. Kayıt kimliği `uuid`, çocuk-ebeveyn bağı `patient_uuid`.
// - `syncNow` depolamayı PARAMETRE olarak alır (yol veya {read,write} adaptörü),
//   böylece dosya sistemi olmadan test edilebilir.

import { buildSyncState, applyMergedState, getMeta, setMeta, syncFingerprint } from './repo.js';
import { mergeStates } from './sync-merge.js';
import { makeSyncStore, isNative } from './files.js';
import { isDesktop } from './platform.js';
import { ICLOUD_TARGET, ICLOUD_LABEL, iCloudStatus } from './icloud.js';

export const SYNC_FILE = 'hastakayit-sync.json';
export const SYNC_TMP = 'hastakayit-sync.json.tmp';
// Küçük "başlık" dosyası: yalnızca son yazma damgası + parmak izi + sayılar.
// Tur başında bu okunur (birkaç yüz bayt); ancak değiştiyse 40 MB'lık asıl
// dosyaya dokunulur. Bkz. repo.syncFingerprint.
export const SYNC_HEAD = 'hastakayit-sync-head.json';
export const SYNC_VERSION = 1;

export const META_ENABLED = 'sync_enabled';
export const META_FOLDER = 'sync_folder';
export const META_LAST = 'sync_last_at';

const EMPTY = { patients: [], payments: [], deliveries: [], deletions: [] };

// backup.js'teki checksum ile BİLEREK aynı (djb2). backup.js'in kendi zarfı
// hasta kayıt yedeği içindir ve referans bütünlüğü (payment.patient_id ->
// patients.id) doğrular; eşitleme dosyasında tamsayı kimlik bulunmaz, bu yüzden
// o doğrulayıcı burada kullanılamaz. Ortak olan tek şey bütünlük özetidir.
function checksum(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(16);
}

// --- Zarf ------------------------------------------------------------------

function stripLocalIds(list) {
  return (list || []).map((r) => {
    const { id, patient_id, ...rest } = r || {};
    return rest;
  });
}

export function wrapSyncPayload(state, writtenAtIso = new Date().toISOString()) {
  const data = {
    patients: stripLocalIds(state.patients),
    payments: stripLocalIds(state.payments),
    deliveries: stripLocalIds(state.deliveries),
    deletions: (state.deletions || []).map((d) => ({ ...d })),
  };
  return {
    app: 'hastakayit-sync',
    version: SYNC_VERSION,
    written_at: writtenAtIso,
    counts: {
      patients: data.patients.length,
      payments: data.payments.length,
      deliveries: data.deliveries.length,
      deletions: data.deletions.length,
    },
    checksum: checksum(JSON.stringify(data)),
    data,
  };
}

// Bozuk dosya = FIRLAT. Çağıran (syncNow) bunu {error}'a çevirir ve yerel
// veriye DOKUNMAZ. Sessizce boş duruma düşmek yasak: boş bir uzak durum
// "karşı cihazda hiçbir şey yok" demektir ve bir sonraki yazmada dosyayı
// gerçekten sıfırlardık.
export function parseSyncPayload(text) {
  let env;
  try { env = JSON.parse(text); } catch { throw new Error('Eşitleme dosyası okunamadı: geçerli JSON değil (yarım yazılmış olabilir).'); }
  if (!env || env.app !== 'hastakayit-sync') throw new Error('Bu bir Hasta Kayıt eşitleme dosyası değil.');
  if (env.version > SYNC_VERSION) throw new Error(`Eşitleme dosyası daha yeni bir sürümle yazılmış (${env.version}). Önce bu cihazdaki uygulamayı güncelleyin.`);
  const d = env.data;
  if (!d || !Array.isArray(d.patients) || !Array.isArray(d.payments) || !Array.isArray(d.deliveries) || !Array.isArray(d.deletions))
    throw new Error('Eşitleme dosyasının içeriği eksik.');
  const c = env.counts || {};
  if (d.patients.length !== c.patients || d.payments.length !== c.payments ||
      d.deliveries.length !== c.deliveries || d.deletions.length !== c.deletions)
    throw new Error('Eşitleme dosyasında kayıt sayıları uyuşmuyor (dosya bozuk).');
  if (checksum(JSON.stringify(d)) !== env.checksum)
    throw new Error('Eşitleme dosyası bütünlük kontrolünden geçemedi (bozuk veya değiştirilmiş).');
  return { patients: d.patients, payments: d.payments, deliveries: d.deliveries, deletions: d.deletions };
}

// --- Depolama adaptörü -----------------------------------------------------
// Kabul edilenler:
//   - '' / null                  -> eşitleme kapalı
//   - 'C:\\Users\\...\\Klasör'   -> gerçek klasör (Electron: node fs)
//   - { read, write[, rename, remove] } -> test/özel adaptör
function isStore(v) { return !!v && typeof v.read === 'function' && typeof v.write === 'function'; }

function normalizeStore(store) {
  if (store.rename) return store;
  // rename'i olmayan adaptör için taklit: oku -> son ada yaz -> tmp'yi sil.
  return {
    ...store,
    async rename(from, to) {
      const text = await store.read(from);
      if (text == null) throw new Error('Geçici eşitleme dosyası bulunamadı.');
      await store.write(to, text);
      if (store.remove) await store.remove(from);
    },
  };
}

export function toStore(folder) {
  if (isStore(folder)) return normalizeStore(folder);
  if (typeof folder !== 'string' || !folder.trim()) return null;
  return makeSyncStore(folder.trim());
}

// --- Okuma / yazma ---------------------------------------------------------

// null = uzak dosya HENÜZ YOK (ilk eşitleme). Bozuk dosya null DEĞİL, hatadır.
export async function readRemoteState(dirHandleOrPath) {
  const store = toStore(dirHandleOrPath);
  if (!store) return null;
  const text = await store.read(SYNC_FILE);
  if (text == null || text === '') return null;
  return parseSyncPayload(text);
}

// Atomik: .tmp'ye yaz -> geri oku ve doğrula -> rename. Yarım bir dosya asla
// son ada sahip olmaz, yani karşı cihaz asla yarım dosya okumaz.
//
// `fingerprint` verilirse asıl dosyadan SONRA küçük başlık dosyası da yazılır.
// Sıra önemli: başlık en son yazılır, böylece başlık güncelse asıl dosyanın da
// güncel olduğu garanti edilir. Ters sırada, başlığı görüp asıl dosyayı eski
// okuyan bir cihaz veriyi kaçırabilirdi.
export async function writeRemoteState(dirHandleOrPath, state, fingerprint = null) {
  const store = toStore(dirHandleOrPath);
  if (!store) return { skipped: true };
  const writtenAt = new Date().toISOString();
  const text = JSON.stringify(wrapSyncPayload(state, writtenAt));
  await store.write(SYNC_TMP, text);
  const back = await store.read(SYNC_TMP);
  if (back !== text) throw new Error('Eşitleme dosyası doğrulanamadı (geri okuma).');
  await store.rename(SYNC_TMP, SYNC_FILE);
  if (fingerprint != null) {
    // Başlık yazılamazsa tur yine BAŞARILIDIR: başlık sadece bir hızlandırma.
    // Eksik/eski başlık en kötü ihtimalle karşı tarafın tam tur yapmasına yol
    // açar — veri kaybına değil.
    try { await store.write(SYNC_HEAD, JSON.stringify(headPayload(state, writtenAt, fingerprint))); }
    catch (e) { console.error('eşitleme başlığı yazılamadı', e); }
  }
  return { ok: true, bytes: text.length, written_at: writtenAt };
}

export function headPayload(state, writtenAtIso, fingerprint) {
  return {
    app: 'hastakayit-sync-head',
    version: SYNC_VERSION,
    written_at: writtenAtIso,
    fingerprint: String(fingerprint),
    counts: {
      patients: state.patients?.length || 0,
      payments: state.payments?.length || 0,
      deliveries: state.deliveries?.length || 0,
      deletions: state.deletions?.length || 0,
    },
  };
}

/**
 * Başlık dosyasını okur. ASLA fırlatmaz ve asla "değişmedi" yönünde yanılmaz:
 * okunamayan/bozuk/eski sürüm başlık `null` döner, bu da çağıranı TAM tura
 * zorlar. Yani bu hızlandırmanın hata modu daima güvenli taraftadır.
 */
export async function readRemoteHead(dirHandleOrPath) {
  const store = toStore(dirHandleOrPath);
  if (!store) return null;
  try {
    const text = await store.read(SYNC_HEAD);
    if (!text) return null;
    const h = JSON.parse(text);
    if (!h || h.app !== 'hastakayit-sync-head' || typeof h.written_at !== 'string') return null;
    return h;
  } catch { return null; }
}

// --- syncNow ---------------------------------------------------------------

function countOf(s) {
  if (!s) return 0;
  return (s.patients?.length || 0) + (s.payments?.length || 0) + (s.deliveries?.length || 0);
}

// Modül düzeyinde uçuş bayrağı: zamanlayıcı + düğme + mutasyon tetikleyicisi
// aynı anda ateşlerse ikinci çağrı hiçbir şey yapmadan döner. Aynı dosyaya iki
// kez yazmak, iki farklı birleştirme sonucunun birbirini ezmesi demektir.
let inFlight = false;
export function isSyncBusy() { return inFlight; }

// --- "Değişmedi" hafızası --------------------------------------------------
// Son TAM turdan kalan iki değer. İkisi de aynıysa ortada yeni hiçbir şey yok
// ve 40 MB'lık tur hiç başlamaz (bkz. repo.syncFingerprint ölçümü).
// Son TAM turdan sonra hem YEREL veritabanı hem UZAK dosya bu özeti anlatıyordu.
// Biri bile artık farklıysa yapılacak iş var demektir.
//
// NEDEN written_at DEĞİL: ilk tasarımda uzak tarafın kimliği olarak başlığın
// zaman damgası kullanılıyordu. Testte iki yazma AYNI MİLİSANİYEYE düştü,
// damgalar eşitlendi ve karşı cihazın yazdığı kayıt "değişmedi" sanılıp
// atlandı. Parmak izi veriyi anlatır, saati değil: aynı parmak izi zaten aynı
// veri demektir, o yüzden atlamak güvenlidir.
let lastFingerprint = null;
let skippedRounds = 0;

/**
 * Ne kadar atlarsak atlayalım, bu kadar turda bir TAM tur yapılır.
 * Güvenlik ağı: karşı cihaz asıl dosyayı yazıp başlığı yazamamışsa (disk dolu,
 * bulut istemcisi yarıda kesilmiş) başlık bayat kalır ve biz sonsuza dek
 * atlardık. 15 tur ≈ 15 dakika sonra tam tur bunu kendiliğinden düzeltir.
 */
export const FULL_SYNC_EVERY = 15;

/** Klasör/hesap değişince hafıza geçersizdir — yoksa yanlışlıkla atlanır. */
export function resetSyncMemory() {
  lastFingerprint = null;
  skippedRounds = 0;
}

export async function syncNow(x, { folder, nowMs = Date.now(), onProgress, force = false } = {}) {
  const store = toStore(folder);
  if (!store) return { skipped: true, reason: 'disabled' };
  if (inFlight) return { skipped: true, reason: 'busy' };
  inFlight = true;
  const step = (s) => { try { onProgress?.(s); } catch { /* UI hatası eşitlemeyi düşürmesin */ } };
  try {
    // --- Ucuz tur: gerçekten bir şey değişti mi? --------------------------
    // Yerel özet + uzak başlık, ikisi de son turdakiyle aynıysa yapılacak iş
    // yok. 100.722 kayıtta bu kontrol 19 ms; tam tur 5,5 sn + 40 MB yazma.
    // `force` (açılış, öne gelme, elle "Şimdi Eşitle", kayıt sonrası) bu yolu
    // atlar — kullanıcı bir şey beklediğinde kısa yol kullanılmaz.
    if (!force && lastFingerprint != null && skippedRounds < FULL_SYNC_EVERY) {
      step('check');
      const fp = await syncFingerprint(x);
      const head = await readRemoteHead(store);
      // Yerel değişmemiş VE uzaktaki dosya hâlâ bizim son yazdığımız durumu
      // anlatıyorsa yapacak iş yok. Başlık okunamazsa (null) tam tur yapılır.
      if (fp === lastFingerprint && head && head.fingerprint === lastFingerprint) {
        skippedRounds++;
        return { skipped: true, reason: 'unchanged' };
      }
    }
    skippedRounds = 0;

    step('local');
    const local = await buildSyncState(x);
    step('read');
    const remote = await readRemoteState(store);
    const merged = mergeStates(local, remote || EMPTY, nowMs);
    step('apply');
    const applied = await applyMergedState(x, merged);
    step('write');
    // Parmak izi, birleştirme UYGULANDIKTAN sonra hesaplanır: yazdığımız
    // dosyanın içeriğiyle yerel veritabanı artık aynı durumu anlatır, bu yüzden
    // bir sonraki turda ikisi de "değişmedi" diyebilir.
    const fingerprint = await syncFingerprint(x);
    await writeRemoteState(store, merged, fingerprint);
    lastFingerprint = fingerprint;
    step('done');
    return { pulled: countOf(remote), pushed: countOf(merged), applied, at: new Date(nowMs).toISOString() };
  } catch (e) {
    console.error('syncNow', e);
    // Hatadan sonra hafızaya güvenilmez: yarım kalmış bir tur, atlanmaması
    // gereken bir değişikliği "değişmedi" gibi gösterebilir.
    resetSyncMemory();
    return { error: e?.message || String(e) };
  } finally {
    inFlight = false;
  }
}

// --- Ayarlar / platform ----------------------------------------------------

// Android/iOS: Capacitor Filesystem rastgele bir bulut klasörünü göremez, bu
// yüzden SABİT bir klasör kullanılır (Documents/HastaKayit/sync). Masaüstünde
// klasörü kullanıcı seçer.
export const ANDROID_SYNC_DIR = 'HastaKayit/sync';               // Capacitor Documents altında
export const ANDROID_SYNC_LABEL = 'Documents/HastaKayit/sync';   // kullanıcıya gösterilen yol

export function syncPlatform() {
  if (isDesktop()) return 'desktop';
  if (isNative()) return 'mobile';
  return 'web';
}

/**
 * Hedef seçimi (saf — testi var). Girdiler zaten okunmuş olduğu için bu
 * fonksiyon hiçbir şey sormaz; karar kuralını tek yerde tutar.
 *
 * KURAL
 *  - iPhone: iCloud açıksa ubiquity container. Mac ile paylaşılan TEK yer
 *    orası; uygulamanın Documents kabı iCloud'a KOPYALANMAZ. iCloud kapalıysa
 *    eski sabit klasöre düşer (Android'in de kullandığı yol).
 *  - Mac: kullanıcı bir klasör SEÇTİYSE o kazanır (Dropbox/OneDrive kuranlar
 *    bozulmasın). Seçmediyse aynı iCloud klasörü — iPhone'unkiyle aynı dosya.
 *  - Tarayıcı önizlemesi: eşitleme yok.
 *
 * `auto`: hedef kullanıcı ayarı olmadan bulunduysa true. Eşitlemenin
 * VARSAYILAN OLARAK AÇIK olması buna bağlı (aşağıya bakın).
 */
export function pickSyncTarget({ platform, folder, icloud, icloudPath }) {
  if (platform === 'mobile') {
    if (icloud) return { target: ICLOUD_TARGET, targetLabel: ICLOUD_LABEL, auto: true };
    return { target: ANDROID_SYNC_DIR, targetLabel: ANDROID_SYNC_LABEL, auto: false };
  }
  if (platform === 'desktop') {
    if (folder) return { target: folder, targetLabel: folder, auto: false };
    if (icloud && icloudPath) return { target: icloudPath, targetLabel: ICLOUD_LABEL, auto: true };
  }
  return { target: '', targetLabel: '', auto: false };
}

export async function getSyncSettings(x) {
  const platform = syncPlatform();
  const raw = await getMeta(x, META_ENABLED);          // 'on' | 'off' | null
  const folder = (await getMeta(x, META_FOLDER)) || '';
  const last = (await getMeta(x, META_LAST)) || '';
  const cloud = platform === 'web' ? { available: false } : await iCloudStatus();
  const { target, targetLabel, auto } =
    pickSyncTarget({ platform, folder, icloud: cloud.available, icloudPath: cloud.path });
  // VARSAYILAN AÇIK — ama yalnızca hedef kendiliğinden bulunduysa. Doktorun
  // "aynı iCloud hesabındaki iki cihaz birbirini görsün" isteği için hiçbir
  // ayar yapması gerekmemeli. Bilerek kapatmışsa ('off') ona dokunulmaz.
  const enabled = raw == null ? auto : raw === 'on';
  return {
    platform, enabled, folder, last, target, targetLabel, auto,
    icloud: !!cloud.available, icloudReason: cloud.reason || '',
    active: enabled && !!target,
  };
}

export async function resolveSyncStore(x) {
  const s = await getSyncSettings(x);
  if (!s.active) return null;
  return toStore(s.target);
}

// Tetikleyicilerin (açılış, zamanlayıcı, mutasyon) tek giriş noktası:
// ayarlar kapalıysa sessizce çıkar, açıksa eşitler ve son eşitleme zamanını
// meta'ya yazar.
export async function syncIfConfigured(x, opts = {}) {
  const store = await resolveSyncStore(x);
  if (!store) return { skipped: true, reason: 'disabled' };
  const r = await syncNow(x, { ...opts, folder: store });
  if (!r.error && !r.skipped) {
    try { await setMeta(x, META_LAST, r.at); } catch (e) { console.error('sync_last_at', e); }
  }
  return r;
}

// --- Otomatik tetikleyiciler ----------------------------------------------
//
// ZAMANLAMA NEDEN BÖYLE (ölçümle):
// Tam bir tur, doktorun 100.722 kayıtlık veritabanında 5,5 sn CPU + 40,6 MB
// yazma demek. Bu yüzden sık tur, ancak "değişmedi" kısa yolu (19 ms) ile
// birlikte anlamlı. Kısa yol sayesinde boşta geçen dakikalar neredeyse
// bedava, gerçek bir değişiklik ise saniyeler içinde karşıya geçiyor.
//
//   açılış      → 2 sn sonra (kilit açılışını yavaşlatmasın), TAM tur
//   kayıt/silme → 3 sn sonra (debounce: yazarken değil, durunca), TAM tur
//   öne gelme   → hemen (Mac'te pencereye dönünce, iPhone'da uygulamaya
//                 dönünce) — doktor ekrana baktığı AN taze veri görsün
//   düzenli tur → her 60 sn, kısa yol açık (iki cihaz da öndeyken gecikmesin)
export const FIRST_SYNC_MS = 2000;
export const PERIOD_MS = 60 * 1000;
export const MUTATION_DEBOUNCE_MS = 3000;
/** Öne gelme tetikleyicisi için en kısa aralık — pencere odağı gidip gelirken
 *  arka arkaya tur başlatmayı engeller. */
export const RESUME_MIN_GAP_MS = 10000;

let firstTimer = null, periodTimer = null, mutationTimer = null;
let autoCtx = null; // { x, onResult }
let lastResumeAt = 0;

async function runAuto(reason, { force = false } = {}) {
  if (!autoCtx) return;
  const { x, onResult } = autoCtx;
  const r = await syncIfConfigured(x, { force }).catch(e => ({ error: e?.message || String(e) }));
  try { onResult?.(r, reason); } catch (e) { console.error('sync onResult', e); }
}

export function startAutoSync(x, { onResult } = {}) {
  stopAutoSync();
  autoCtx = { x, onResult };
  // Açılışta hafıza boş olmalı: önceki oturumdan kalan bir parmak izi, bu
  // oturumda atlanmaması gereken bir turu atlatabilirdi.
  resetSyncMemory();
  firstTimer = setTimeout(() => { firstTimer = null; runAuto('startup', { force: true }); }, FIRST_SYNC_MS);
  periodTimer = setInterval(() => runAuto('timer'), PERIOD_MS);
  return stopAutoSync;
}

export function stopAutoSync() {
  clearTimeout(firstTimer); firstTimer = null;
  clearInterval(periodTimer); periodTimer = null;
  clearTimeout(mutationTimer); mutationTimer = null;
  autoCtx = null;
}

export function scheduleSyncAfterMutation() {
  if (!autoCtx) return; // otomatik eşitleme başlamadıysa (kilit ekranı) hiçbir şey yapma
  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => { mutationTimer = null; runAuto('mutation', { force: true }); }, MUTATION_DEBOUNCE_MS);
}

/**
 * Uygulama öne geldi (Mac'te pencere odağı, iPhone'da appStateChange).
 * Doktor diğer cihazda kayıt açtıysa, bu cihaza döndüğü anda görmeli —
 * bir sonraki dakikalık turu beklemesin.
 *
 * `nowMs` dışarıdan verilebilir: kısıtlama mantığının saf testi için.
 */
export function syncOnResume(nowMs = Date.now()) {
  if (!autoCtx) return false;
  if (nowMs - lastResumeAt < RESUME_MIN_GAP_MS) return false;
  lastResumeAt = nowMs;
  runAuto('resume', { force: true });
  return true;
}

/** Testler ve klasör değişikliği için: kısıtlama sayacını sıfırla. */
export function resetResumeThrottle() { lastResumeAt = 0; }
