// Mac'te uygulamanın iCloud klasörü.
//
// iPhone tarafı bu klasöre yerli bir eklentiyle erişiyor (ubiquity container,
// bkz. plugins/icloud). macOS'ta aynı klasör DÜZ BİR DOSYA YOLUDUR:
//
//     ~/Library/Mobile Documents/iCloud~com~hastakayit~app/Documents
//
// Yani Mac'te yerli koda hiç gerek yok — mevcut eşitleme köprüsü (syncRead /
// syncWrite / syncRename) bu yolu aynen kullanır. Burada yalnızca "bu Mac'te
// o klasör var mı?" sorusu yanıtlanıyor.
//
// Klasör adındaki '~' karakterleri yazım hatası DEĞİL: macOS, uygulama
// kimliğindeki noktaları (com.hastakayit.app) klasör adında '~' ile yazar.
//
// Ayrı dosya, çünkü kararın kendi testi var (test/icloud-dir.test.mjs) ve
// testin Electron yüklemesi gerekmesin.
const os = require('os');
const path = require('path');
const fs = require('fs');

const CONTAINER_DIR = 'iCloud~com~hastakayit~app';

/**
 * Beklenen yollar. Saf: hiçbir şey okumaz, yalnızca birleştirir.
 * macOS dışında null (Windows'ta iCloud for Windows farklı bir yere kurulur ve
 * iPhone'un ubiquity container'ını açmaz — orada kullanıcı klasörü elle seçer).
 */
function icloudPaths(home, platform) {
  if (platform !== 'darwin') return null;
  const mobile = path.join(home, 'Library', 'Mobile Documents');
  const container = path.join(mobile, CONTAINER_DIR);
  return { mobile, container, documents: path.join(container, 'Documents') };
}

/**
 * Bu Mac'te iCloud klasörü kullanılabilir mi?
 * @returns {{path: string}|{path: null, reason: string}}
 *
 * Bağımlılıklar parametre: test gerçek dosya sistemine dokunmadan her dalı
 * deneyebilsin.
 *
 * ÖNEMLİ: container klasörü YOKSA oluşturmuyoruz. `Mobile Documents` altına
 * elle açılan bir klasörü iCloud sahiplenmez; sessizce hiç eşitlenmeyen bir
 * klasör, "eşitleme çalışıyor" sanılan en kötü hata olurdu. Container'ı iCloud
 * kendisi yaratır — iPhone'daki uygulama bir kez açıldığında.
 */
function findICloudDir(opts = {}) {
  const {
    home = os.homedir(),
    platform = process.platform,
    exists = (p) => fs.existsSync(p),
    mkdir = (p) => fs.mkdirSync(p, { recursive: true }),
  } = opts;

  const p = icloudPaths(home, platform);
  if (!p) return { path: null, reason: 'iCloud klasörü yalnızca Mac sürümünde kullanılabilir.' };
  if (!exists(p.mobile)) {
    return { path: null, reason: 'Bu Mac\'te iCloud Drive açık değil (Sistem Ayarları → Apple Kimliği → iCloud → iCloud Drive).' };
  }
  if (!exists(p.container)) {
    return { path: null, reason: 'iCloud klasörü henüz oluşmadı. iPhone\'da Hasta Kayıt\'ı bir kez açın; klasör birkaç dakika içinde bu Mac\'te belirir.' };
  }
  if (!exists(p.documents)) {
    try { mkdir(p.documents); }
    catch (e) { return { path: null, reason: 'iCloud klasörü oluşturulamadı: ' + (e?.message || e) }; }
  }
  return { path: p.documents };
}

module.exports = { findICloudDir, icloudPaths, CONTAINER_DIR };
