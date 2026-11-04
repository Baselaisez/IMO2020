// iPhone derlemesi için ortam denetimi.
//
// NEDEN GEREKLİ
// Xcode ile ilgili hatalar Xcode'un KENDİSİNDE anlaşılmaz görünür: "Command
// CompileSwiftSources failed", "unable to find utility xcodebuild" gibi. Oysa
// sebep neredeyse her zaman şu üç şeyden biridir ve üçü de burada saniyeler
// içinde tespit edilip TAM olarak nasıl düzeltileceği yazılabilir:
//
//   1. `xcode-select` hâlâ Command Line Tools'u gösteriyor (Xcode'u sonradan
//      kuranların çoğunda böyledir) → Xcode'un derleyicisi hiç bulunamaz.
//   2. Xcode lisansı kabul edilmemiş → her komut lisans metni basıp çıkar.
//   3. `npm install` çalıştırılmamış → ios/App/CapApp-SPM/Package.swift
//      eklentilere `../../../node_modules/...` göreli yoluyla bağlanır; klasör
//      yoksa Xcode "Missing package product" der.
//
// Çalıştırma:  npm run ios:check   (npm run ios bunu kendiliğinden çağırır)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// --- Saf yardımcılar (test edilebilir) -------------------------------------

/**
 * `xcode-select -p` çıktısını yorumlar.
 * Command Line Tools yolu Xcode'un derleyicisini İÇERMEZ; bu durumda derleme
 * kesin başarısız olur, bu yüzden 'clt' ayrı bir durum olarak dönüyor.
 */
export function classifyDeveloperDir(out) {
  const p = String(out || '').trim();
  if (!p) return 'missing';
  if (p.includes('CommandLineTools')) return 'clt';
  if (p.includes('Xcode')) return 'xcode';
  return 'unknown';
}

/** `xcodebuild -version` ilk satırından sürümü çıkarır: "Xcode 16.2" → 16.2 */
export function parseXcodeVersion(out) {
  const m = /Xcode\s+(\d+)(?:\.(\d+))?/.exec(String(out || ''));
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2] || 0), text: `${m[1]}.${m[2] || 0}` };
}

/** `xcrun simctl list runtimes` çıktısında kullanılabilir bir iOS runtime var mı? */
export function hasIosRuntime(out) {
  return /iOS\s+\d+/.test(String(out || ''));
}

/**
 * `xcodebuild -showsdks` çıktısında iOS SDK'sı var mı? Saf.
 *
 * Xcode 16'dan beri platformlar (iOS dahil) Xcode'un kendisiyle GELMEZ, ayrıca
 * indirilir. Yalnızca Xcode kurulmuşsa iOS uygulaması HİÇ derlenemez; hata
 * "iOS x.y is not installed. Please download and install the platform from
 * Xcode > Settings > Components." biçiminde çıkar ve simülatör eksikliğiyle
 * karıştırılır. Simülatör isteğe bağlıdır; SDK zorunludur.
 */
export function hasIosSdk(out) {
  return /-sdk\s+iphoneos\d/.test(String(out || ''));
}

// --- Denetim ---------------------------------------------------------------
// Gövde yalnızca dosya DOĞRUDAN çalıştırıldığında yürür. Testler saf
// ayrıştırıcıları içe aktarıyor; koruma olmasaydı `import` bile denetimi
// başlatır ve macOS olmayan bir makinede process.exit(1) ile testi düşürürdü.

const ok = m => console.log(`  ✅ ${m}`);
const warn = m => console.log(`  ⚠️  ${m}`);
const bad = m => console.log(`  ❌ ${m}`);

/**
 * iCloud eşitlemesinin iOS tarafı eksiksiz bağlanmış mı? Saf — testi var.
 *
 * Üç parça da olmadan eşitleme SESSİZCE çalışmaz: eklenti köprüye kayıtlı
 * olmazsa `ICloudSync` çağrıları "not implemented" der; entitlements dosyası
 * imzaya girmezse `url(forUbiquityContainerIdentifier:)` nil döner. İkisi de
 * Xcode'da anlaşılmaz görünür, o yüzden burada adıyla söylüyoruz.
 *
 * @returns {string[]} boşsa her şey yerinde
 */
export function icloudWiringIssues({ classList, entitlementsExists, pbxHasEntitlements }) {
  const issues = [];
  if (!Array.isArray(classList) || !classList.includes('ICloudSyncPlugin')) {
    issues.push('iCloud eklentisi köprüye kayıtlı değil (capacitor.config.json ▸ packageClassList). Çözüm: npm install && npx cap sync ios');
  }
  if (!entitlementsExists) {
    issues.push('ios/App/App/App.entitlements bulunamadı — iCloud izinleri imzaya girmez.');
  }
  if (!pbxHasEntitlements) {
    issues.push('Xcode projesi App.entitlements dosyasını kullanmıyor (CODE_SIGN_ENTITLEMENTS ayarı eksik).');
  }
  return issues;
}

function run(cmd, args) {
  try { return { out: execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { err: e, out: `${e.stdout || ''}${e.stderr || ''}` }; }
}

function main() {
const blockers = [];

console.log('\niPhone derleme ortamı denetimi\n');

// 1) macOS?
if (process.platform !== 'darwin') {
  bad(`Bu bilgisayar ${process.platform} — iOS uygulaması YALNIZCA macOS'ta derlenebilir.`);
  console.log('\n     Mac sürümü bu makinede çalışır:  npm run mac\n');
  process.exit(1);
}
ok('macOS');

// 2) xcode-select hangi klasörü gösteriyor?
const dev = run('xcode-select', ['-p']);
const kind = classifyDeveloperDir(dev.out);
if (kind === 'xcode') {
  ok(`Xcode araçları: ${dev.out.trim()}`);
} else if (kind === 'clt') {
  bad('xcode-select Command Line Tools\'u gösteriyor, Xcode\'u değil.');
  blockers.push('sudo xcode-select -s /Applications/Xcode.app/Contents/Developer');
} else {
  bad('Xcode bulunamadı.');
  blockers.push('App Store\'dan Xcode kurun, sonra: sudo xcode-select -s /Applications/Xcode.app/Contents/Developer');
}

// 3) Lisans kabul edilmiş mi? (xcodebuild lisans kabul edilmeden hiçbir şey yapmaz)
if (kind === 'xcode') {
  const ver = run('xcodebuild', ['-version']);
  if (/license/i.test(ver.out) && /agree|accept/i.test(ver.out)) {
    bad('Xcode lisansı kabul edilmemiş.');
    blockers.push('sudo xcodebuild -license accept');
  } else {
    const v = parseXcodeVersion(ver.out);
    if (!v) warn('Xcode sürümü okunamadı.');
    else if (v.major < 15) {
      bad(`Xcode ${v.text} çok eski.`);
      // Package.swift `swift-tools-version: 5.9` ilan ediyor → Xcode 15 tabanı.
      blockers.push('Xcode 15 veya üstüne güncelleyin (App Store ▸ Xcode ▸ Güncelle).');
    } else ok(`Xcode ${v.text}`);
  }
}

// 4) iOS PLATFORMU (SDK) kurulu mu? — ZORUNLU
// Xcode 16'dan beri iOS platformu ayrı indiriliyor; yoksa ne cihaza ne
// simülatöre derleme yapılabilir. En sık atlanan adım budur.
if (kind === 'xcode') {
  const sdks = run('xcodebuild', ['-showsdks']);
  if (hasIosSdk(sdks.out)) ok('iOS platformu (SDK) kurulu');
  else {
    bad('iOS platformu Xcode\'a indirilmemiş — iPhone uygulaması derlenemez.');
    blockers.push('Xcode\'u açın ▸ menüden Xcode ▸ Settings… (⌘,) ▸ Components sekmesi\n        ▸ listedeki "iOS" satırının yanındaki GET / indirme düğmesine basın.\n        Yaklaşık 7-10 GB, internet hızınıza göre 15-60 dakika sürer.');
  }
}

// 5) Simülatör çalışma zamanı (zorunlu DEĞİL — gerçek cihaza kuracaksanız gerekmez)
const rt = run('xcrun', ['simctl', 'list', 'runtimes']);
if (hasIosRuntime(rt.out)) ok('iOS simülatörü kurulu');
else warn('iOS simülatörü kurulu değil — gerçek iPhone\'a kuracaksanız GEREKMEZ.');

// 6) Proje hazır mı?
if (existsSync(path.join(root, 'node_modules', '@capacitor', 'ios'))) ok('npm bağımlılıkları kurulu');
else {
  bad('node_modules eksik — Xcode eklentileri göreli yolla buradan bulur.');
  blockers.push('npm install');
}

if (existsSync(path.join(root, 'ios', 'App', 'App.xcodeproj'))) ok('Xcode projesi yerinde (ios/App)');
else {
  bad('ios/App/App.xcodeproj bulunamadı.');
  blockers.push('npx cap add ios');
}

// 8) iCloud eşitlemesi (iPhone ↔ Mac) bağlı mı?
{
  const cfgPath = path.join(root, 'ios', 'App', 'App', 'capacitor.config.json');
  let classList = null;
  try { classList = JSON.parse(readFileSync(cfgPath, 'utf8')).packageClassList; } catch { /* yok/bozuk */ }
  let pbx = '';
  try { pbx = readFileSync(path.join(root, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj'), 'utf8'); } catch { /* yok */ }
  const issues = icloudWiringIssues({
    classList,
    entitlementsExists: existsSync(path.join(root, 'ios', 'App', 'App', 'App.entitlements')),
    pbxHasEntitlements: /CODE_SIGN_ENTITLEMENTS\s*=\s*App\/App\.entitlements/.test(pbx),
  });
  if (!issues.length) ok('iCloud eşitlemesi bağlı (iPhone ↔ Mac)');
  else for (const i of issues) { bad(i); blockers.push('npm install && npx cap sync ios'); }
}

// --- Sonuç -----------------------------------------------------------------
if (blockers.length) {
  console.log('\n  Devam etmeden önce şunları çalıştırın:\n');
  for (const b of blockers) console.log(`      ${b}`);
  console.log('\n  Sonra tekrar:  npm run ios\n');
  process.exit(1);
}

console.log(`
  Her şey hazır. Şimdi Xcode açılacak.

  Xcode'da yapılacak TEK ayar (ilk seferde):
    1. Sol panelde mavi "App" simgesine tıklayın
    2. Üstte "Signing & Capabilities" sekmesi
    3. "Team" listesinden Apple hesabınızı seçin
       (listede yoksa: Xcode ▸ Settings ▸ Accounts ▸ + ▸ Apple ID)
    4. Üst ortadaki cihaz seçiciden iPhone'unuzu ya da bir simülatör seçin
    5. ▶ (Run) düğmesi — ya da ⌘R

  iCloud eşitlemesi (iPhone ↔ Mac) hakkında:
    Team'i seçtiğinizde Xcode, "iCloud.com.hastakayit.app" kabını Apple
    hesabınıza KENDİ kaydeder — ek bir şey yapmanız gerekmez. Ücretli Apple
    Developer Program üyeliği şarttır; ücretsiz (Personal Team) hesapta iCloud
    kullanılamaz ve Signing & Capabilities'te kırmızı hata çıkar.
    Ayrıntılar: docs/ICLOUD-ESITLEME.md
`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
