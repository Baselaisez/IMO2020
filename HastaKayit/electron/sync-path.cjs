// Eşitleme klasörü için DAR kapı — main.cjs'ten ayrı bir dosyada, çünkü bu
// güvenlik kararının kendi testi var (test/sync-path.test.mjs) ve testin
// Electron'u yüklemesi gerekmesin.
//
// 5.2.2 ile gelen cihazlar arası eşitleme, uygulamanın kendi veri klasörünün
// DIŞINA yazar: kullanıcının seçtiği bulut klasörü (iCloud Drive, Dropbox…).
// resolveIn oraya izin vermez ve VERMEMELİ. Bu yüzden ayrı bir kapı: renderer
// bir klasör YOLU verir, ama yalnızca eşitlemenin kendi iki dosya adına
// erişebilir. Rastgele bir ad ya da yol geçişi (../) reddedilir — ele geçirilmiş
// bir renderer bile bu kapıyı kullanıcının belgelerini okumak için kullanamaz.
const path = require('path');

const SYNC_NAMES = new Set(['hastakayit-sync.json', 'hastakayit-sync.json.tmp']);

/**
 * Eşitleme klasöründeki izinli bir dosyanın mutlak yolu.
 * @throws dosya adı izinli listede değilse ya da klasör yolu geçersizse.
 */
function syncPath(dir, name) {
  const n = String(name);
  if (!SYNC_NAMES.has(n)) throw new Error(`Eşitleme dosyası değil: ${n}`);
  const raw = String(dir || '').trim();
  if (!raw) throw new Error('Geçersiz eşitleme klasörü.');
  const base = path.resolve(raw);
  // Kök dizin ("/" veya "C:\") bir eşitleme klasörü olamaz; yanlışlıkla seçilmesi
  // uygulamanın kökte dosya yaratmasına yol açardı.
  if (base === path.parse(base).root) throw new Error('Geçersiz eşitleme klasörü.');
  const full = path.join(base, n);
  if (path.dirname(full) !== base) throw new Error('Geçersiz dosya adı.');
  return full;
}

module.exports = { syncPath, SYNC_NAMES };
