// Komut satırından iOS derlemesi — hataları OKUNABİLİR biçimde listeler.
//
// NEDEN
// Xcode'un sorun panelinde 38 hata görmek teşhis için işe yaramaz: aynı hatanın
// onlarca tekrarı olabilir, sıralama rastgeledir ve metin kopyalanamaz. Burada
// derleme yapılıp `error:` satırları benzersizleştirilerek yazdırılıyor; tam
// günlük de dosyaya kaydediliyor.
//
// GERÇEK CİHAZ mimarisine (arm64) derlenir ama imzalama kapatılır
// (CODE_SIGNING_ALLOWED=NO). Böylece:
//   • Apple hesabı / "development team" ayarı GEREKMEZ,
//   • iPhone simülatörünün kurulu olması GEREKMEZ — simülatör çalışma zamanı
//     ~10 GB'lık ayrı bir indirmedir ve çoğu Mac'te yoktur. Simülatör hedefi
//     seçen eski hâli, kod hiç derlenmeden "iOS ... is not installed" ile
//     patlıyordu; yani gerçek derleme hatalarını göstermiyordu.
//   • telefonun takılı olması GEREKMEZ.
//
// Çalıştırma:  npm run ios:build
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/**
 * xcodebuild çıktısından benzersiz hataları çıkarır, en çok tekrarlayan önce. Saf.
 * Aynı hata her hedef için tekrarlandığından ham liste yanıltıcıdır: 38 satırın
 * 2 farklı sebebi olabilir. Tekrar sayısı da döndürülür ki asıl sorun görünsün.
 */
export function summarizeErrors(log) {
  const counts = new Map();
  for (const line of String(log).split('\n')) {
    const m = /(?:^|\s)((?:[^\s:]+:\d+:\d+:\s*)?error:\s*.+)$/.exec(line.trim());
    if (!m) continue;
    // Dosya yolu/satır numarası farklı olsa da aynı mesajı tek grupta topla.
    const msg = m[1].replace(/^.*?error:\s*/, 'error: ').trim();
    counts.set(msg, (counts.get(msg) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([message, count]) => ({ message, count }));
}

async function main() {
  if (process.platform !== 'darwin') {
    console.log('\n  Bu betik macOS gerektirir (xcodebuild).\n');
    process.exit(1);
  }

  const args = [
    '-project', path.join(root, 'ios/App/App.xcodeproj'),
    '-scheme', 'App',
    // Cihaz mimarisi, ama imzasız: hesap da simülatör de telefon da gerekmez.
    '-destination', 'generic/platform=iOS',
    '-configuration', 'Debug',
    '-clonedSourcePackagesDirPath', path.join(root, 'ios/.spm'),
    'CODE_SIGNING_ALLOWED=NO',
    'CODE_SIGNING_REQUIRED=NO',
    'CODE_SIGN_IDENTITY=',
    'build',
  ];

  console.log('\niOS derleniyor (cihaz mimarisi, imzalama kapalı)…');
  console.log('İlk derleme birkaç dakika sürebilir.\n');
  const child = spawn('xcodebuild', args, { cwd: root });

  let log = '';
  child.stdout.on('data', d => { log += d; });
  child.stderr.on('data', d => { log += d; });

  const code = await new Promise(r => child.on('close', r));

  const logFile = path.join(root, 'ios/build.log');
  await writeFile(logFile, log);

  const errors = summarizeErrors(log);
  if (!errors.length) {
    console.log(code === 0
      ? '  ✅ Derleme başarılı.\n'
      : `  Derleme ${code} koduyla bitti ama "error:" satırı bulunamadı.\n  Tam günlük: ${path.relative(root, logFile)}\n`);
    process.exit(code);
  }

  console.log(`  ${errors.length} FARKLI hata (toplam ${errors.reduce((s, e) => s + e.count, 0)} satır):\n`);
  for (const { message, count } of errors.slice(0, 15)) {
    console.log(`  ${count > 1 ? `[${count}×] ` : ''}${message}`);
  }
  if (errors.length > 15) console.log(`  … ve ${errors.length - 15} tane daha`);
  console.log(`\n  Tam günlük: ${path.relative(root, logFile)}\n`);
  process.exit(code || 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
