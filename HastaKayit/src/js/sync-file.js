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

import { buildSyncState, applyMergedState, getMeta, setMeta } from './repo.js';
import { mergeStates } from './sync-merge.js';
import { makeSyncStore, isNative } from './files.js';
import { isDesktop } from './platform.js';

export const SYNC_FILE = 'hastakayit-sync.json';
export const SYNC_TMP = 'hastakayit-sync.json.tmp';
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
export async function writeRemoteState(dirHandleOrPath, state) {
  const store = toStore(dirHandleOrPath);
  if (!store) return { skipped: true };
  const text = JSON.stringify(wrapSyncPayload(state));
  await store.write(SYNC_TMP, text);
  const back = await store.read(SYNC_TMP);
  if (back !== text) throw new Error('Eşitleme dosyası doğrulanamadı (geri okuma).');
  await store.rename(SYNC_TMP, SYNC_FILE);
  return { ok: true, bytes: text.length };
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

export async function syncNow(x, { folder, nowMs = Date.now(), onProgress } = {}) {
  const store = toStore(folder);
  if (!store) return { skipped: true, reason: 'disabled' };
  if (inFlight) return { skipped: true, reason: 'busy' };
  inFlight = true;
  const step = (s) => { try { onProgress?.(s); } catch { /* UI hatası eşitlemeyi düşürmesin */ } };
  try {
    step('local');
    const local = await buildSyncState(x);
    step('read');
    const remote = await readRemoteState(store);
    const merged = mergeStates(local, remote || EMPTY, nowMs);
    step('apply');
    const applied = await applyMergedState(x, merged);
    step('write');
    await writeRemoteState(store, merged);
    step('done');
    return { pulled: countOf(remote), pushed: countOf(merged), applied, at: new Date(nowMs).toISOString() };
  } catch (e) {
    console.error('syncNow', e);
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

export async function getSyncSettings(x) {
  const platform = syncPlatform();
  const enabled = (await getMeta(x, META_ENABLED)) === 'on';
  const folder = (await getMeta(x, META_FOLDER)) || '';
  const last = (await getMeta(x, META_LAST)) || '';
  // Masaüstünde klasör seçilmemişse eşitleme yapılamaz; mobilde klasör sabittir.
  const target = platform === 'desktop' ? folder : (platform === 'mobile' ? ANDROID_SYNC_DIR : '');
  return { platform, enabled, folder, last, target, active: enabled && !!target };
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
// Açılıştan ~3 sn sonra bir kez (başlangıç hızlı kalsın), sonra her ~5 dk.
// Ayrıca her mutasyondan ~15 sn sonra (debounce — her tuş vuruşunda DEĞİL).
export const FIRST_SYNC_MS = 3000;
export const PERIOD_MS = 5 * 60 * 1000;
export const MUTATION_DEBOUNCE_MS = 15000;

let firstTimer = null, periodTimer = null, mutationTimer = null;
let autoCtx = null; // { x, onResult }

async function runAuto(reason) {
  if (!autoCtx) return;
  const { x, onResult } = autoCtx;
  const r = await syncIfConfigured(x).catch(e => ({ error: e?.message || String(e) }));
  try { onResult?.(r, reason); } catch (e) { console.error('sync onResult', e); }
}

export function startAutoSync(x, { onResult } = {}) {
  stopAutoSync();
  autoCtx = { x, onResult };
  firstTimer = setTimeout(() => { firstTimer = null; runAuto('startup'); }, FIRST_SYNC_MS);
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
  mutationTimer = setTimeout(() => { mutationTimer = null; runAuto('mutation'); }, MUTATION_DEBOUNCE_MS);
}
