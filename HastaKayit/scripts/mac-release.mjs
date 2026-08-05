// Mac paketini üretir ve DOĞRU .dmg dosyasını Finder'da açar.
//
// NEDEN AYRI BİR BETİK
// `npm run mac:dist` dist-mac/ altına DÖRT dosya bırakır: Apple Silicon ve
// Intel için ayrı .dmg ve .zip. Kullanıcının hangisini açacağını bilmesi
// gerekiyordu ("çipiniz M serisiyse şu, değilse bu") — yanlışını açarsa
// uygulama ya hiç çalışmaz ya da Rosetta altında yavaş çalışır.
//
// Burada makinenin mimarisi okunur, doğru dosya seçilir ve Finder'da
// işaretlenerek açılır. Kullanıcı sadece çift tıklar.
//
// Çalıştırma:  npm run mac:release
import { execFileSync, spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.join(root, 'dist-mac');

/**
 * Bu makineye uyan .dmg dosyasını seçer. Saf.
 *
 * electron-builder Apple Silicon dosyasını "-arm64.dmg" ile biter, Intel
 * dosyasına ise mimari eklemez ("Hasta Kayıt-5.0.1.dmg"). Bu yüzden Intel
 * seçimi "arm64 İÇERMEYEN" diye tanımlanmak zorunda — sadece ".dmg ile biter"
 * demek her iki dosyayı da eşler ve yanlış olanı açma ihtimali doğar.
 */
export function pickDmg(files, arch) {
  const dmgs = files.filter(f => f.toLowerCase().endsWith('.dmg'));
  const arm = dmgs.find(f => /-arm64\.dmg$/i.test(f));
  const intel = dmgs.find(f => !/-arm64\.dmg$/i.test(f));
  if (arch === 'arm64') return arm ?? intel ?? null;
  return intel ?? arm ?? null;
}

/** Kullanıcıya gösterilecek mimari adı. Saf. */
export function archLabel(arch) {
  return arch === 'arm64' ? 'Apple Silicon (M serisi)' : 'Intel';
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('\n  Bu betik macOS gerektirir.\n');
    process.exit(1);
  }

  console.log('\nMac uygulaması paketleniyor — birkaç dakika sürebilir…\n');
  const build = spawnSync('npx', ['electron-builder', '--mac', '--arm64', '--x64'], {
    cwd: root, stdio: 'inherit',
  });
  if (build.status !== 0) {
    console.log('\n  ❌ Paketleme başarısız. Yukarıdaki hatayı gönderin.\n');
    process.exit(build.status || 1);
  }

  if (!existsSync(DIST)) {
    console.log(`\n  ❌ ${path.relative(root, DIST)} klasörü oluşmadı.\n`);
    process.exit(1);
  }

  const files = await readdir(DIST);
  const dmg = pickDmg(files, process.arch);
  if (!dmg) {
    console.log('\n  ❌ .dmg dosyası bulunamadı. dist-mac içeriği:\n   ', files.join('\n    '), '\n');
    process.exit(1);
  }

  const full = path.join(DIST, dmg);
  const { version } = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  console.log(`
  ✅ Hazır — sürüm ${version}, ${archLabel(process.arch)}

     ${dmg}

  Finder açılıyor. Şimdi:
    1. Açılan pencerede "${dmg}" dosyasına ÇİFT TIKLAYIN
    2. Çıkan pencerede "Hasta Kayıt" simgesini Applications klasörüne sürükleyin
    3. Eskisinin üzerine yazmayı onaylayın (verileriniz silinmez)
`);

  // -R: dosyayı Finder'da SEÇEREK gösterir; klasörü açıp aratmaktan iyidir.
  execFileSync('open', ['-R', full]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
