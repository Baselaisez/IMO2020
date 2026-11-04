// icloud.js — Aynı iCloud hesabındaki iPhone ve Mac'in AYNI klasörü görmesi.
//
// SORUN (5.8'e kadar)
// Eşitleme "paylaşılan bir klasör" varsayıyordu ve iPhone'da o klasör
// uygulamanın kendi kabındaki `Documents/HastaKayit/sync` idi. O klasör iCloud'a
// KOPYALANMAZ; Mac onu asla göremez. Yani iPhone ile Mac arasında eşitleme
// pratikte hiç çalışmıyordu — ancak iki masaüstü arasında (Dropbox/OneDrive
// klasörü seçilerek) çalışıyordu.
//
// ÇÖZÜM
// Uygulamanın iCloud "ubiquity container"ı. Aynı Apple Kimliğiyle giriş yapmış
// HER cihazda aynı klasördür:
//
//   iPhone → FileManager.url(forUbiquityContainerIdentifier:) + "/Documents"
//            (yerli eklenti: plugins/icloud → ICloudSyncPlugin.swift)
//   Mac    → ~/Library/Mobile Documents/iCloud~com~hastakayit~app/Documents
//            (düz bir dosya yolu; yerli kod gerekmez — electron/icloud.cjs)
//
// İki taraf da aynı `hastakayit-sync.json` dosyasını okur/yazar; birleştirme
// motoru (sync-merge.js) ve taşıma katmanı (sync-file.js) hiç değişmez.
//
// BU DOSYA eklenti paketini İÇE AKTARMAZ: `registerPlugin` doğrudan
// @capacitor/core'dan gelir. Böylece web paketi @hastakayit/icloud kurulu
// olmasa da derlenir; eklenti yalnızca iPhone'da, köprüde kayıtlıysa yanıt
// verir.
import { registerPlugin } from '@capacitor/core';
import { isNative, isDesktop } from './platform.js';
import { desktop } from './desktop.js';

/**
 * `sync_folder` meta'sında ve makeSyncStore'da kullanılan hedef adı.
 * Gerçek bir yol DEĞİL: "bu platformun iCloud klasörünü kullan" demek.
 * Mutlak bir yolla karışmaması için ':' içerir.
 */
export const ICLOUD_TARGET = 'icloud:';

export const ICLOUD_LABEL = 'iCloud Drive → Hasta Kayıt';

const ICloudSync = registerPlugin('ICloudSync');

// --- Durum -----------------------------------------------------------------

// Durum sorgusu iPhone'da BLOKLAYICI bir yerli çağrıya iner (ilk çağrıda
// saniyeler sürebilir). Her eşitleme turunda tekrarlanmaması için sonuç
// önbelleğe alınır; kullanıcı Ayarlar'da "Yeniden Dene" derse temizlenir.
let statusCache = null;

export function resetICloudStatus() { statusCache = null; }

/**
 * Bu cihazda iCloud eşitlemesi kullanılabilir mi?
 * @returns {Promise<{available: boolean, path?: string, reason?: string}>}
 * ASLA fırlatmaz: eşitlemenin kullanılamaması bir hata değil, bir durumdur.
 */
export function iCloudStatus() {
  if (!statusCache) statusCache = probe();
  return statusCache;
}

async function probe() {
  try {
    if (isDesktop()) {
      const r = await desktop.icloudDir();
      return r?.path
        ? { available: true, path: r.path }
        : { available: false, reason: r?.reason || 'iCloud klasörü bulunamadı.' };
    }
    if (isNative()) {
      // Eklenti köprüde yoksa (eski bir yapı, ya da Android) çağrı hata verir.
      const r = await ICloudSync.status();
      return r?.available
        ? { available: true, path: r.path }
        : { available: false, reason: r?.reason || 'iCloud kullanılamıyor.' };
    }
    return { available: false, reason: 'Tarayıcı önizlemesinde iCloud yok.' };
  } catch (e) {
    return { available: false, reason: iCloudErrorText(e) };
  }
}

/**
 * Yerli hatayı kullanıcının anlayacağı bir cümleye çevirir. Saf — testi var.
 *
 * En sık görülen iki durum: (1) eklenti o yapıda yok (kullanıcı uygulamayı
 * güncellemeden önceki sürümü çalıştırıyor), (2) iCloud Drive kapalı. İkisi de
 * "bir şeyler ters gitti" demekten çok daha yararlı bir mesaj hak ediyor.
 */
export function iCloudErrorText(e) {
  const msg = String(e?.message || e || '');
  if (/not implemented|unimplemented|does not have an implementation|Plugin.*not/i.test(msg)) {
    return 'Bu uygulama sürümünde iCloud desteği yok — güncelleyin.';
  }
  return msg || 'iCloud kullanılamıyor.';
}

// --- Depo (sync-file.js'in beklediği {read,write,rename,remove}) ------------

/**
 * iPhone/iPad için iCloud deposu. Yerli eklentiye iner.
 * Mac'te KULLANILMAZ: orada iCloud klasörü düz bir yoldur ve mevcut
 * masaüstü köprüsü (desktop.syncRead/Write/…) aynen çalışır.
 */
export function makeICloudStore() {
  return {
    async read(name) {
      const r = await ICloudSync.read({ name });
      // null = dosya yok (ilk eşitleme) ya da henüz inmedi. sync-file.js bunu
      // "karşı cihazda kayıt yok" sayar ve yerel veriye DOKUNMAZ.
      return r?.data ?? null;
    },
    async write(name, text) { await ICloudSync.write({ name, data: String(text) }); },
    async rename(from, to) { await ICloudSync.rename({ from, to }); },
    async remove(name) { await ICloudSync.remove({ name }); },
  };
}
