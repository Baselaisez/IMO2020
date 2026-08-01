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
 * Bir paketin çözülmüş sürümünü okur. Saf.
 *
 * İKİ AYRI DOSYA BİÇİMİ var ve ikisine de bakmak gerekiyor:
 *  • Package.resolved — v1 (object.pins, "package" adı), v2/v3 (pins, "identity")
 *  • workspace-state.json — xcodebuild'in çekilmiş paket durumu
 *    (object.dependencies[].state.checkoutState.version)
 * Tek biçime bakmak, doğrulamanın "okunamadı" deyip sessizce pes etmesine yol
 * açıyordu; o zaman da kullanıcı hangi sürümün derlendiğini öğrenemiyor.
 */
export function resolvedVersion(json, identity) {
  let data;
  try { data = typeof json === 'string' ? JSON.parse(json) : json; } catch { return null; }
  const want = String(identity).toLowerCase();
  const matches = (...names) => names.some(n => {
    const s = String(n ?? '').toLowerCase();
    return s === want || s.includes(want);
  });

  for (const p of data?.pins ?? data?.object?.pins ?? []) {
    if (matches(p.identity, p.package, p.location, p.repositoryURL)) return p.state?.version ?? null;
  }
  for (const d of data?.object?.dependencies ?? data?.dependencies ?? []) {
    if (matches(d.packageRef?.identity, d.packageRef?.name, d.packageRef?.location)) {
      return d.state?.checkoutState?.version ?? d.state?.version ?? null;
    }
  }
  return null;
}

/**
 * Çözümleme sonucunun yazılabileceği TÜM yerler. Xcode sürümüne ve projenin
 * yerel paket (CapApp-SPM) kullanmasına göre değişiyor; tek yola güvenmek
 * doğrulamayı kırıyordu.
 */
async function candidateStateFiles() {
  const out = [
    path.join(root, 'ios/App/App.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved'),
    path.join(root, 'ios/App/CapApp-SPM/Package.resolved'),
    path.join(root, 'ios/App/CapApp-SPM/.swiftpm/xcode/package.xcworkspace/xcshareddata/swiftpm/Package.resolved'),
    path.join(root, 'ios/.spm/workspace-state.json'),
  ];
  const dd = path.join(os.homedir(), 'Library/Developer/Xcode/DerivedData');
  if (existsSync(dd)) {
    for (const name of await readdir(dd).catch(() => [])) {
      if (!/^App-[a-z]+$/i.test(name)) continue;
      out.push(path.join(dd, name, 'SourcePackages/Package.resolved'));
      out.push(path.join(dd, name, 'SourcePackages/workspace-state.json'));
    }
  }
  return out;
}

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

  // İkili çerçeve (xcframework) önbelleği de sürüm taşır: doğru pini alıp ESKİ
  // ikiliyi derlemek mümkündür. Bu yüzden Capacitor'a ait çekilmiş paket ve
  // artefakt kalıntıları da temizleniyor. Genel önbelleğin TAMAMI silinmiyor —
  // diğer projelerin paketleri korunuyor.
  const spmCache = path.join(os.homedir(), 'Library/Caches/org.swift.swiftpm');
  for (const sub of ['artifacts', 'repositories', 'manifests']) {
    const dir = path.join(spmCache, sub);
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir).catch(() => [])) {
      if (!/capacitor/i.test(name)) continue;
      await rm(path.join(dir, name), { recursive: true, force: true });
      console.log(`  silindi: Caches/org.swift.swiftpm/${sub}/${name}`);
    }
  }

  console.log('\n  Paketler yeniden çözümleniyor (birkaç dakika sürebilir)…');
  let output = '';
  try {
    output = execFileSync('xcodebuild', [
      '-resolvePackageDependencies',
      '-project', path.join(root, 'ios/App/App.xcodeproj'),
      '-scheme', 'App',
      '-clonedSourcePackagesDirPath', path.join(root, 'ios/.spm'),
    ], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (e) {
    console.log(`\n  ❌ Çözümleme başarısız:\n${String(e.stdout || e.stderr || e.message).trim().slice(-1500)}\n`);
    process.exit(1);
  }

  // Doğrula: menüden tıklattırıp sonucu görmemek yerine gerçekten ne çözüldü?
  let got = null;
  const looked = [];
  for (const f of await candidateStateFiles()) {
    if (!existsSync(f)) continue;
    looked.push(path.relative(root, f));
    const v = resolvedVersion(await readFile(f, 'utf8').catch(() => ''), 'capacitor-swift-pm');
    if (v) { got = v; break; }
  }

  if (got === REQUIRED_CAPACITOR) {
    console.log(`\n  ✅ capacitor-swift-pm ${got} çözümlendi.\n
  Sırada:  npm run ios   →  Xcode'da ⇧⌘K (Clean Build Folder), sonra ⌘R\n`);
    return;
  }

  console.log(`\n  ❌ Beklenen ${REQUIRED_CAPACITOR}, çözümlenen: ${got ?? 'okunamadı'}`);
  console.log(`  Bakılan dosyalar: ${looked.length ? looked.join(', ') : '(hiçbiri bulunamadı)'}`);
  if (output.trim()) console.log(`\n  xcodebuild çıktısı:\n${output.trim().split('\n').slice(-12).map(l => '    ' + l).join('\n')}`);

  console.log(`
  Son çare — Swift Package genel önbelleğinin TAMAMINI silin. Yalnızca bir
  önbellektir, silinmesi güvenlidir; diğer Xcode projeleriniz paketlerini
  yeniden indirir:

      rm -rf ~/Library/Caches/org.swift.swiftpm
      npm run ios:reset

  Bu da işe yaramazsa Xcode'u açıp (npm run ios) sol panelde
  "capacitor-swift-pm" sürümüne bakın ve File ▸ Packages ▸ Reset Package
  Caches → Resolve Package Versions deneyin.
`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
