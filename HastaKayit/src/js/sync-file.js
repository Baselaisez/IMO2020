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

/**
 * Zarfı doğrudan METİN olarak üretir.
 *
 * NEDEN NESNE DEĞİL METİN: eski yol önce zarf nesnesini kuruyor, sağlama
 * toplamı için `JSON.stringify(data)` çağırıyor, sonra çağıran dosyaya yazmak
 * için zarfın TAMAMINI bir kez DAHA stringify ediyordu. Yani 76 MB'lık metin
 * iki kez üretiliyordu. Doktorun 100.000 kayıtlık defterinde ölçüldü:
 *     kopyalama + stringify #1 : 3001 ms
 *     stringify #2 (dosya için): 1557 ms
 * Veriyi bir kez metne çevirip zarfı metin birleştirmesiyle kurunca ikinci
 * geçiş tamamen kalkıyor. Zarf alanları (sabit metin, sürüm numarası, ISO
 * damga, sayılar, onaltılık sağlama) hepsi güvenli; yine de her biri
 * JSON.stringify ile kaçışlanarak ekleniyor, elle tırnak konmuyor.
 *
 * ALAN SIRASI KORUNUYOR (app, version, written_at, counts, checksum, data) ve
 * `data` EN SONDA: parseSyncPayload'ın hızlı yolu buna dayanıyor, ayrıca eski
 * sürümlerin yazdığı dosyalarla bayt bayt aynı biçim.
 *
 * Yerel kimlikler burada ayıklanmıyor; buildSyncState zaten `id`/`patient_id`
 * seçmiyor (bkz. repo.js). Eskiden buradaki stripLocalIds her kaydı bir kez
 * daha kopyalıyordu.
 */
export function serializeSyncPayload(state, writtenAtIso = new Date().toISOString()) {
  const data = {
    patients: state.patients || [],
    payments: state.payments || [],
    deliveries: state.deliveries || [],
    deletions: state.deletions || [],
  };
  const dataStr = JSON.stringify(data);
  const counts = {
    patients: data.patients.length,
    payments: data.payments.length,
    deliveries: data.deliveries.length,
    deletions: data.deletions.length,
  };
  return '{"app":"hastakayit-sync"'
    + `,"version":${SYNC_VERSION}`
    + `,"written_at":${JSON.stringify(writtenAtIso)}`
    + `,"counts":${JSON.stringify(counts)}`
    + `,"checksum":${JSON.stringify(checksum(dataStr))}`
    + `,"data":${dataStr}}`;
}

/** Nesne biçimi — testler ve dışarıdan inceleme için. Yazma yolu metin üretir. */
export function wrapSyncPayload(state, writtenAtIso = new Date().toISOString()) {
  return JSON.parse(serializeSyncPayload(state, writtenAtIso));
}

/**
 * Sağlama doğrulaması: ÖNCE ucuz yol, tutmazsa pahalı yol.
 *
 * Pahalı yol, çözümlenmiş veriyi yeniden metne çevirmektir — doktorun
 * defterinde 1891 ms. Oysa sağlama zaten `data`nın metin hâli üzerinden
 * hesaplanmıştı ve o metin elimizde: dosyanın kendisi. `"data":`den zarfın
 * kapanış süslü parantezine kadar olan dilim tam olarak o metindir (zarfta
 * `data` her zaman EN SON alan, bkz. serializeSyncPayload).
 *
 * NEDEN YİNE DE GERİ DÜŞÜŞ VAR: bu bir TIBBİ KAYIT bütünlük kontrolü. Dilim
 * mantığı bir gün (başka bir yazıcı, farklı alan sırası, boşluklu biçim)
 * tutmazsa sonuç "dosya bozuk" hatası olur ve doktorun eşitlemesi DURUR.
 * Bu yüzden ucuz yol tutmazsa sessizce eski, kesin yönteme düşülür: hız
 * kazanılır, doğruluktan hiçbir şey ödünç verilmez. Gerçekten bozuk bir
 * dosya her iki yoldan da geçemez.
 */
export function checksumMatches(text, data, expected) {
  const i = text.indexOf('"data":');
  const end = text.lastIndexOf('}');
  if (i !== -1 && end > i + 7 && checksum(text.slice(i + 7, end)) === expected) return true;
  return checksum(JSON.stringify(data)) === expected;
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
  if (!checksumMatches(text, d, env.checksum))
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
  const text = serializeSyncPayload(state, writtenAt);
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
//
// HEDEF BAŞINA AYRI: Mac artık İKİ hedefe birden eşitleniyor (iPhone için
// iCloud, Samsung için Syncthing klasörü) ve "en son bu hedefe ne yazdım"
// sorusunun cevabı hedefe göre değişir.
//
// Dürüst olmak gerekirse tek ortak hafıza da çoğu durumda doğru çalışırdı,
// çünkü kısa yol parmak izinin yanında HEDEFİN BAŞLIĞINA da bakıyor: başka
// bir klasörün başlığı tutmazsa tur zaten çalışır. Ayırmanın iki somut
// kazancı var:
//   - FULL_SYNC_EVERY güvenlik ağı her hedef için AYRI sayılır; ortak sayaçta
//     iki hedef aynı 15'liği paylaşır ve bayat başlık düzeltmesi her hedefte
//     yarı sıklıkta çalışırdı.
//   - Atlama kararı, okunamayan/eksik bir başlığa bağlı kalmaz; her hedefin
//     durumu kendi başına doğrudur.
// Tıbbi kayıtta "çoğu durumda doğru" yeterli bir gerekçe değil.
const lastFingerprint = new Map();   // hedef anahtarı -> parmak izi
const skippedRounds = new Map();     // hedef anahtarı -> atlanan tur sayısı

/**
 * Ne kadar atlarsak atlayalım, bu kadar turda bir TAM tur yapılır.
 * Güvenlik ağı: karşı cihaz asıl dosyayı yazıp başlığı yazamamışsa (disk dolu,
 * bulut istemcisi yarıda kesilmiş) başlık bayat kalır ve biz sonsuza dek
 * atlardık. 15 tur ≈ 15 dakika sonra tam tur bunu kendiliğinden düzeltir.
 */
export const FULL_SYNC_EVERY = 15;

/** Klasör/hesap değişince hafıza geçersizdir — yoksa yanlışlıkla atlanır. */
export function resetSyncMemory() {
  lastFingerprint.clear();
  skippedRounds.clear();
}

/** Hedefin hafıza anahtarı. Metin yol kendisi; test adaptörleri tek kova. */
export function memoryKeyFor(folder) {
  return typeof folder === 'string' && folder ? folder : 'adapter';
}

export async function syncNow(x, { folder, nowMs = Date.now(), onProgress, force = false, memoryKey } = {}) {
  const store = toStore(folder);
  if (!store) return { skipped: true, reason: 'disabled' };
  if (inFlight) return { skipped: true, reason: 'busy' };
  inFlight = true;
  const key = memoryKey || memoryKeyFor(folder);
  const step = (s) => { try { onProgress?.(s); } catch { /* UI hatası eşitlemeyi düşürmesin */ } };
  try {
    // --- Ucuz tur: gerçekten bir şey değişti mi? --------------------------
    // Yerel özet + uzak başlık, ikisi de son turdakiyle aynıysa yapılacak iş
    // yok. 100.722 kayıtta bu kontrol 19 ms; tam tur 5,5 sn + 40 MB yazma.
    // `force` (açılış, öne gelme, elle "Şimdi Eşitle", kayıt sonrası) bu yolu
    // atlar — kullanıcı bir şey beklediğinde kısa yol kullanılmaz.
    const known = lastFingerprint.get(key) ?? null;
    if (!force && known != null && (skippedRounds.get(key) || 0) < FULL_SYNC_EVERY) {
      step('check');
      const fp = await syncFingerprint(x);
      const head = await readRemoteHead(store);
      // Yerel değişmemiş VE uzaktaki dosya hâlâ bizim son yazdığımız durumu
      // anlatıyorsa yapacak iş yok. Başlık okunamazsa (null) tam tur yapılır.
      if (fp === known && head && head.fingerprint === known) {
        skippedRounds.set(key, (skippedRounds.get(key) || 0) + 1);
        return { skipped: true, reason: 'unchanged' };
      }
    }
    skippedRounds.set(key, 0);

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
    lastFingerprint.set(key, fingerprint);
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
  const list = pickSyncTargets({ platform, folder, icloud, icloudPath });
  return list[0] || { target: '', targetLabel: '', auto: false };
}

/**
 * Bu turda yazılacak TÜM hedefler (saf — testi var).
 *
 * NEDEN BİRDEN FAZLA: Samsung ile Apple cihazları birbirine bağlamanın yolu
 * Mac'i KÖPRÜ yapmaktan geçiyor.
 *
 *     iPhone ⇄ iCloud ⇄ [MAC] ⇄ Syncthing klasörü ⇄ Samsung
 *
 * Android'de masaüstündeki gibi "klasörü diske indirip eşitleyen" bir bulut
 * istemcisi yok (Drive ve Dropbox'ın Android uygulamaları başka uygulamalara
 * klasör düzeyinde yazma izni güvenilir biçimde vermez). Syncthing ise iki
 * cihaz arasında doğrudan klasör eşitler — hesap da sunucu da gerekmez, veri
 * muayenehaneden çıkmaz. Ama iPhone Syncthing'i kullanamaz, Samsung da
 * iCloud'u. Ortak nokta Mac: ikisine de erişebilen tek cihaz o.
 *
 * DÜZELTİLEN TUZAK: eskiden Mac'te kullanıcının seçtiği klasör iCloud'u
 * EZİYORDU. Yani doktor Syncthing klasörünü seçtiği anda iPhone eşitlemesi
 * sessizce duracaktı — istediğimizin tam tersi. Artık ikisi de hedef.
 * Tek hedef soran eski çağrılar (pickSyncTarget) aynı cevabı almaya devam
 * ediyor: seçilen klasör hâlâ listenin başında.
 *
 * Birleştirme motorunda hiçbir değişiklik gerekmiyor: tur sırayla her hedefe
 * karşı çalışır, her turda yerel durumla birleşir ve geri yazar. İki tur
 * sonunda veri iki yöne de akmış olur.
 */
export function pickSyncTargets({ platform, folder, icloud, icloudPath }) {
  if (platform === 'mobile') {
    if (icloud) return [{ target: ICLOUD_TARGET, targetLabel: ICLOUD_LABEL, auto: true }];
    return [{ target: ANDROID_SYNC_DIR, targetLabel: ANDROID_SYNC_LABEL, auto: false }];
  }
  if (platform === 'desktop') {
    const out = [];
    if (folder) out.push({ target: folder, targetLabel: folder, auto: false });
    if (icloud && icloudPath && icloudPath !== folder) {
      out.push({ target: icloudPath, targetLabel: ICLOUD_LABEL, auto: true });
    }
    return out;
  }
  return [];
}

export async function getSyncSettings(x) {
  const platform = syncPlatform();
  const raw = await getMeta(x, META_ENABLED);          // 'on' | 'off' | null
  const folder = (await getMeta(x, META_FOLDER)) || '';
  const last = (await getMeta(x, META_LAST)) || '';
  const cloud = platform === 'web' ? { available: false } : await iCloudStatus();
  const targets = pickSyncTargets({ platform, folder, icloud: cloud.available, icloudPath: cloud.path });
  const { target, targetLabel, auto } = targets[0] || { target: '', targetLabel: '', auto: false };
  // Birden fazla hedefte "kendiliğinden bulundu" sayılmak için BİRİNİN
  // kendiliğinden bulunmuş olması yeter: doktor Syncthing klasörünü elle
  // seçmiş olsa bile iCloud hedefi kendiliğinden eklenir ve eşitleme açık kalır.
  const anyAuto = targets.some(t => t.auto);
  // VARSAYILAN AÇIK — ama yalnızca hedef kendiliğinden bulunduysa. Doktorun
  // "aynı iCloud hesabındaki iki cihaz birbirini görsün" isteği için hiçbir
  // ayar yapması gerekmemeli. Bilerek kapatmışsa ('off') ona dokunulmaz.
  const enabled = raw == null ? anyAuto : raw === 'on';
  return {
    platform, enabled, folder, last, target, targetLabel, auto, targets,
    icloud: !!cloud.available, icloudReason: cloud.reason || '',
    active: enabled && targets.length > 0,
  };
}

export async function resolveSyncStore(x) {
  const s = await getSyncSettings(x);
  if (!s.active) return null;
  return toStore(s.target);
}

/** Bu turda yazılacak hedeflerin depoları (etiketleriyle birlikte). */
export async function resolveSyncStores(x) {
  const s = await getSyncSettings(x);
  if (!s.active) return [];
  return s.targets
    .map(t => ({ ...t, store: toStore(t.target) }))
    .filter(t => t.store);
}

// Tetikleyicilerin (açılış, zamanlayıcı, mutasyon) tek giriş noktası:
// ayarlar kapalıysa sessizce çıkar, açıksa eşitler ve son eşitleme zamanını
// meta'ya yazar.
export async function syncIfConfigured(x, opts = {}) {
  const targets = await resolveSyncStores(x);
  if (!targets.length) return { skipped: true, reason: 'disabled' };

  // Hedefler SIRAYLA işlenir. Bir hedefin hatası (bulut istemcisi kapalı,
  // klasör bağlı değil) diğerini DURDURMAZ: Syncthing kapalıyken iPhone
  // eşitlemesinin de ölmesi kabul edilemez. Hatalar toplanıp birlikte dönülür.
  const results = [];
  for (const t of targets) {
    const r = await syncNow(x, { ...opts, folder: t.target, memoryKey: memoryKeyFor(t.target) });
    results.push({ ...r, targetLabel: t.targetLabel });
  }

  const real = results.filter(r => !r.error && !r.skipped);
  const errors = results.filter(r => r.error);
  if (real.length) {
    try { await setMeta(x, META_LAST, real[real.length - 1].at); } catch (e) { console.error('sync_last_at', e); }
  }
  return summarizeRounds(results, real, errors);
}

/**
 * Birden çok hedefin sonucunu TEK bir sonuç nesnesine indirger (saf — testi var).
 * Arayüz ve tetikleyiciler tek hedef varmış gibi çalışmaya devam eder.
 *
 * Kural: bir hedef bile iş yaptıysa tur "yapıldı" sayılır ve sayılar toplanır.
 * Hiçbiri iş yapmadıysa ve hata varsa hata dönülür — hatayı yutmak, doktorun
 * "eşitlendi" sanıp aslında eşitlenmemiş olması demek olurdu.
 */
export function summarizeRounds(results, real = null, errors = null) {
  const done = real || results.filter(r => !r.error && !r.skipped);
  const errs = errors || results.filter(r => r.error);
  if (!done.length) {
    if (errs.length) {
      return { error: errs.map(e => (e.targetLabel ? `${e.targetLabel}: ${e.error}` : e.error)).join(' · ') };
    }
    return { skipped: true, reason: results[0]?.reason || 'unchanged' };
  }
  const sum = (k) => done.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const applied = done.reduce((a, r) => {
    for (const [k, v] of Object.entries(r.applied || {})) a[k] = (a[k] || 0) + (Number(v) || 0);
    return a;
  }, {});
  const out = {
    pulled: sum('pulled'), pushed: sum('pushed'), applied,
    at: done[done.length - 1].at, targets: done.length,
  };
  // Bir hedef başarılı, biri hatalıysa BUNU SÖYLE. Sessizce başarı demek,
  // Samsung'a hiç ulaşmamış bir kaydı ulaşmış göstermek olurdu.
  if (errs.length) {
    out.partialError = errs.map(e => (e.targetLabel ? `${e.targetLabel}: ${e.error}` : e.error)).join(' · ');
  }
  return out;
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
/** Kayıt sonrası turun en geç ne kadar ertelenebileceği. */
export const MUTATION_MAX_DELAY_MS = 60 * 1000;
/** Eşitleme, geçen zamanın en çok 1/ROUND_BUDGET'ini kullanabilir. */
export const ROUND_BUDGET = 4;

/**
 * Kayıttan sonraki turu ne kadar bekleteceğiz?
 *
 * GERÇEK SORUN: sabit 3 saniyeydi ve tur, doktorun 100.000 kayıtlık
 * defterinde ÖLÇÜLDÜĞÜNDE yazma tarafı 3,7 sn + okuma tarafı 1,4 sn sürüyor
 * (eski hâlinde 7,0 + 3,1 sn). Doktor arka arkaya hasta girerken her kayıttan
 * 3 saniye sonra 5 saniyelik bir tur başlıyordu: uygulama zamanının yarısından
 * fazlasını eşitlemede geçiriyor, arayüz donuyordu. "Yavaş çalışıyor"
 * şikâyetinin sebebi buydu.
 *
 * ÇÖZÜM kendi kendini ayarlasın: bekleme süresi son turun ÖLÇÜLEN süresine
 * bağlanır. Küçük bir defterde tur ~20 ms sürer, bekleme 3 saniyede kalır
 * (davranış aynı). Doktorun defterinde tur ~5 sn sürer, bekleme 20 saniyeye
 * çıkar — yani eşitleme zamanın en çok dörtte birini kullanır, gerisi
 * doktorundur. Sabit bir sayı seçmek yerine ölçüye bağlamak, cihaz hızı ve
 * defter büyüklüğü ne olursa olsun doğru davranışı verir.
 *
 * Üst sınır 60 sn: eşitleme hiçbir koşulda bir dakikadan fazla gecikmesin.
 * Saf fonksiyon — testi var.
 */
export function mutationDelayMs(lastRoundMs, base = MUTATION_DEBOUNCE_MS, max = MUTATION_MAX_DELAY_MS) {
  if (!Number.isFinite(lastRoundMs) || lastRoundMs <= 0) return base;
  return Math.min(max, Math.max(base, Math.round(lastRoundMs * ROUND_BUDGET)));
}
/** Öne gelme tetikleyicisi için en kısa aralık — pencere odağı gidip gelirken
 *  arka arkaya tur başlatmayı engeller. */
export const RESUME_MIN_GAP_MS = 10000;

let firstTimer = null, periodTimer = null, mutationTimer = null;
let autoCtx = null; // { x, onResult }
let lastResumeAt = 0;
let lastRoundMs = 0;

async function runAuto(reason, { force = false } = {}) {
  if (!autoCtx) return;
  const { x, onResult } = autoCtx;
  const t0 = Date.now();
  const r = await syncIfConfigured(x, { force }).catch(e => ({ error: e?.message || String(e) }));
  // Yalnızca GERÇEKTEN çalışan turun süresi sayılır. Parmak izi kısa yolundan
  // dönen tur 35 ms sürer; onu ölçüye katsaydık bekleme süresi her boş turda
  // 3 saniyeye düşer ve geri çekilme mantığı hiç devreye girmezdi.
  if (r && !r.skipped) lastRoundMs = Date.now() - t0;
  try { onResult?.(r, reason); } catch (e) { console.error('sync onResult', e); }
}

/** Testler için: son tur süresini oku / sıfırla. */
export function getLastRoundMs() { return lastRoundMs; }
export function resetRoundTiming() { lastRoundMs = 0; }

export function startAutoSync(x, { onResult } = {}) {
  stopAutoSync();
  autoCtx = { x, onResult };
  // Açılışta hafıza boş olmalı: önceki oturumdan kalan bir parmak izi, bu
  // oturumda atlanmaması gereken bir turu atlatabilirdi.
  resetSyncMemory();
  // Tur süresi ölçümü de sıfırlanır: klasör değişmiş ya da cihaz başka
  // olabilir, eski süreye göre geri çekilmek yanlış olurdu.
  resetRoundTiming();
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
  // Sabit 3 sn DEĞİL: son turun ölçülen süresine göre geri çekiliyoruz
  // (bkz. mutationDelayMs). Doktor arka arkaya hasta girerken uygulama
  // eşitlemede boğulmasın.
  mutationTimer = setTimeout(() => { mutationTimer = null; runAuto('mutation', { force: true }); },
    mutationDelayMs(lastRoundMs));
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
