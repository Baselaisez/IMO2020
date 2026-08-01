// Xcode'un takılı kalmış Swift Package çözümlemesini sıfırlar VE yeniden çözer.
//
// NEDEN GEREKLİ
// ios/App/CapApp-SPM/Package.swift, Capacitor'ı `exact: "8.5.0"` ile ister.
// Buna rağmen Xcode bir kez ESKİ bir sürümü çözümlemişse o pini kendiliğinden
// bırakmaz ve derleme şu hatayı verir:
//
//     Cannot find 'SceneDelegateProxy' in scope     (SceneDelegate.swift)
//
// Sebep tam olarak budur: `SceneDelegateProxy` Capacitor 8.5.0'ın ikili
// çerçevesinde VARDIR, 8.0.0'da YOKTUR (ikisi de indirilip doğrulandı). Yani
// kod doğru, Xcode yanlış sürümü derliyor.
//
// Bu betik pinleri siler, çözümlemeyi KENDİSİ yapar (xcodebuild) ve sonucu
// okuyup ekrana yazar — "menüden şunu tıklayın" deyip sonucu görmemek yerine
// hangi sürümün çözüldüğü doğrulanır.
//
// Çalıştırma:  npm run ios:reset
import { execFileSync } from 'node:child_process';
import { rm, readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/** Package.swift'in dayattığı sürüm. Uyuşmazlığı bununla ölçüyoruz. */
export const REQUIRED_CAPACITOR = '8.5.0';

/**
 * Package.resolved içinden bir paketin çözülmüş sürümünü okur. Saf.
 * Xcode'un üç biçimi de destekleniyor: v1 (object.pins, "package" adı),
 * v2 ve v3 (üstte "pins", "identity" adı). Biçim ayrımı yapılmazsa doğrulama
 * eski Xcode'larda sessizce "bilinmiyor" der ve uyarı kaçar.
 */
export function resolvedVersion(json, identity) {
  let data;
  try { data = typeof json === 'string' ? JSON.parse(json) : json; } catch { return null; }
  const pins = data?.pins ?? data?.object?.pins ?? [];
  const want = String(identity).toLowerCase();
  for (const p of pins) {
    const name = String(p.identity ?? p.package ?? '').toLowerCase();
    // v1'de ad "Capacitor" gibi paket adıdır, v2+'da "capacitor-swift-pm" kimliğidir.
    if (name === want || (p.location ?? p.repositoryURL ?? '').toLowerCase().includes(want)) {
      return p.state?.version ?? null;
    }
  }
  return null;
}

const resolvedPath = () =>
  path.join(root, 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved');

async function main() {
  if (process.platform !== 'darwin') {
    console.log('\n  Bu betik macOS gerektirir (xcodebuild).\n');
    process.exit(1);
  }

  console.log('\nSwift Package çözümlemesi sıfırlanıyor\n');

  // Yalnızca BU projeye ait durum silinir. Kullanıcının diğer Xcode
  // projelerini etkileyen genel önbelleğe (~/Library/Caches/org.swift.swiftpm)
  // bilerek dokunulmuyor; gerekirse komutu aşağıda yazıyoruz ki karar
  // kullanıcının olsun.
  const targets = [
    path.join(root, 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm'),
    path.join(root, 'ios/App/CapApp-SPM/.build'),
    path.join(root, 'ios/App/build'),
  ];
  for (const t of targets) {
    if (!existsSync(t)) continue;
    await rm(t, { recursive: true, force: true });
    console.log(`  silindi: ${path.relative(root, t)}`);
  }

  // Bu projenin türetilmiş verisi (App-xxxxx). Diğer projelerinki korunur.
  const dd = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData');
  if (existsSync(dd)) {
    for (const name of await readdir(dd)) {
      if (!/^App-[a-z]+$/i.test(name)) continue;
      await rm(path.join(dd, name), { recursive: true, force: true });
      console.log(`  silindi: DerivedData/${name}`);
    }
  }

  console.log('\n  Paketler yeniden çözümleniyor (birkaç dakika sürebilir)…');
  try {
    execFileSync('xcodebuild', [
      '-resolvePackageDependencies',
      '-project', path.join(root, 'ios/App/App.xcodeproj'),
      '-scheme', 'App',
    ], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (e) {
    console.log(`\n  ❌ Çözümleme başarısız:\n${String(e.stdout || e.stderr || e.message).trim().slice(-1200)}\n`);
    process.exit(1);
  }

  // Doğrula: menüden tıklattırıp sonucu görmemek yerine gerçekten ne çözüldü?
  let got = null;
  try { got = resolvedVersion(await readFile(resolvedPath(), 'utf8'), 'capacitor-swift-pm'); } catch {}

  if (got === REQUIRED_CAPACITOR) {
    console.log(`\n  ✅ capacitor-swift-pm ${got} çözümlendi.\n
  Sırada:  npm run ios   →  Xcode'da ⇧⌘K (Clean Build Folder), sonra ⌘R\n`);
    return;
  }

  console.log(`\n  ❌ Beklenen ${REQUIRED_CAPACITOR}, çözümlenen: ${got ?? 'okunamadı'}

  Swift Package genel önbelleği de takılmış demektir. Şunu çalıştırıp bu betiği
  tekrar deneyin (o klasör yalnızca bir önbellektir, silinmesi güvenlidir —
  ama diğer Xcode projeleriniz de paketlerini yeniden indirir):

      rm -rf ~/Library/Caches/org.swift.swiftpm
      npm run ios:reset
`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
