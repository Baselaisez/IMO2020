// Ön denetimin saf ayrıştırıcıları. Denetimin kendisi macOS gerektiriyor ama
// asıl kırılgan kısım bu üç ayrıştırma; yanlış sınıflandırma kullanıcıyı yanlış
// komuta yönlendirir (örn. Xcode kuruluyken "Xcode kurun" demek).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDeveloperDir, parseXcodeVersion, hasIosRuntime } from '../scripts/ios-preflight.mjs';

test('classifyDeveloperDir: Command Line Tools yolu Xcode sanılmaz', () => {
  assert.equal(classifyDeveloperDir('/Library/Developer/CommandLineTools\n'), 'clt');
  assert.equal(classifyDeveloperDir('/Applications/Xcode.app/Contents/Developer\n'), 'xcode');
  // Xcode-beta ve elle taşınmış kurulumlar da Xcode sayılır.
  assert.equal(classifyDeveloperDir('/Applications/Xcode-beta.app/Contents/Developer'), 'xcode');
  assert.equal(classifyDeveloperDir(''), 'missing');
  assert.equal(classifyDeveloperDir(undefined), 'missing');
});

test('parseXcodeVersion: sürüm satırını okur', () => {
  assert.deepEqual(parseXcodeVersion('Xcode 16.2\nBuild version 16C5032a'), { major: 16, minor: 2, text: '16.2' });
  // Ara sürüm numarası olmayan biçim de kabul edilir.
  assert.deepEqual(parseXcodeVersion('Xcode 15\nBuild version 15A240d'), { major: 15, minor: 0, text: '15.0' });
  // Lisans metni sürüm gibi okunmamalı.
  assert.equal(parseXcodeVersion('You have not agreed to the Xcode license agreements.'), null);
  assert.equal(parseXcodeVersion(''), null);
});

test('hasIosRuntime: yalnızca gerçek bir iOS çalışma zamanı sayılır', () => {
  assert.equal(hasIosRuntime('== Runtimes ==\niOS 18.2 (18.2 - 22C150) - com.apple.CoreSimulator.SimRuntime.iOS-18-2'), true);
  // Sadece watchOS/tvOS kuruluysa iPhone simülatörü yok demektir.
  assert.equal(hasIosRuntime('== Runtimes ==\nwatchOS 11.2 (...)\ntvOS 18.2 (...)'), false);
  assert.equal(hasIosRuntime(''), false);
});

// --- iCloud eşitlemesinin iOS tarafı --------------------------------------
// Üç parçadan biri eksikse eşitleme SESSİZCE çalışmaz; bu yüzden ön denetim
// bunu adıyla söylemeli.
import { icloudWiringIssues } from '../scripts/ios-preflight.mjs';
import { readFileSync, existsSync } from 'node:fs';

test('icloudWiringIssues: her şey yerindeyse sorun yok', () => {
  assert.deepEqual(icloudWiringIssues({
    classList: ['FilesystemPlugin', 'ICloudSyncPlugin'],
    entitlementsExists: true,
    pbxHasEntitlements: true,
  }), []);
});

test('icloudWiringIssues: eklenti köprüye kayıtlı değilse söylenir', () => {
  const r = icloudWiringIssues({ classList: ['FilesystemPlugin'], entitlementsExists: true, pbxHasEntitlements: true });
  assert.equal(r.length, 1);
  assert.match(r[0], /cap sync ios/);
});

test('icloudWiringIssues: entitlements eksikse söylenir', () => {
  const r = icloudWiringIssues({ classList: ['ICloudSyncPlugin'], entitlementsExists: false, pbxHasEntitlements: true });
  assert.match(r[0], /App\.entitlements/);
});

test('icloudWiringIssues: Xcode projesi entitlements kullanmıyorsa söylenir', () => {
  const r = icloudWiringIssues({ classList: ['ICloudSyncPlugin'], entitlementsExists: true, pbxHasEntitlements: false });
  assert.match(r[0], /CODE_SIGN_ENTITLEMENTS/);
});

// Asıl koruma: DEPODAKİ kaynaklar, `cap sync` çalıştığında doğru sonucu
// üretecek durumda mı? Burada yalnızca GİT'TE DURAN dosyalara bakılıyor —
// ios/App/App/capacitor.config.json üretilmiş bir dosyadır ve .gitignore'dadır,
// yani temiz bir klonda henüz yoktur.
const SWIFT = 'plugins/icloud/ios/Sources/ICloudSyncPlugin/ICloudSyncPlugin.swift';

test('iCloud eklentisi Capacitor CLI tarafından bulunabilir durumda', () => {
  const root = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(root.dependencies['@hastakayit/icloud'], 'file:plugins/icloud',
    'CLI eklentileri package.json bağımlılıklarından tarar');
  const plug = JSON.parse(readFileSync('plugins/icloud/package.json', 'utf8'));
  assert.equal(plug.capacitor?.ios?.src, 'ios',
    '"capacitor" anahtarı olmadan paket bir eklenti sayılmaz');
  // packageClassList bu desenden üretilir (@capacitor/cli → iosplugin.js).
  assert.match(readFileSync(SWIFT, 'utf8'), /@objc\(ICloudSyncPlugin\)/,
    'sınıf adı @objc(...) içinde olmalı, yoksa köprüye kaydedilmez');
});

test('Package.swift adı, CLI’nin paket adından türettiğiyle AYNI', () => {
  // @capacitor/cli → plugin.js fixName: "/" ve "-" → "_", "@" silinir,
  // alt çizgiden sonraki harf büyür, ilk harf büyür.
  //   @hastakayit/icloud → HastakayitIcloud
  // Sapma, Xcode'da "missing package product" olarak görünür ve teşhisi zordur.
  const fixName = (name) => {
    const n = name.replace(/\//g, '_').replace(/-/g, '_').replace(/@/g, '')
      .replace(/_\w/g, (m) => m[1].toUpperCase());
    return n.charAt(0).toUpperCase() + n.slice(1);
  };
  const expected = fixName('@hastakayit/icloud');
  const pkg = readFileSync('plugins/icloud/Package.swift', 'utf8');
  assert.match(pkg, new RegExp(`name:\\s*"${expected}"[\\s\\S]*library[\\s\\S]*name:\\s*"${expected}"`),
    `Package.swift paket ve ürün adı "${expected}" olmalı`);
});

test('iCloud izinleri Xcode projesine bağlı', () => {
  const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  assert.deepEqual(icloudWiringIssues({
    classList: ['ICloudSyncPlugin'],   // üretilen dosya ayrıca aşağıda denetleniyor
    entitlementsExists: existsSync('ios/App/App/App.entitlements'),
    pbxHasEntitlements: /CODE_SIGN_ENTITLEMENTS\s*=\s*App\/App\.entitlements/.test(pbx),
  }), []);
  // Hem Debug hem Release: yalnızca birine konursa TestFlight yapısı iCloud'suz
  // çıkar ve hata ancak gerçek cihazda görülür.
  assert.equal((pbx.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g) || []).length, 2,
    'Debug ve Release yapılandırmalarının İKİSİNDE de olmalı');
});

test('iCloud kap kimliği üç dosyada da aynı', () => {
  // Biri saparsa eşitleme sessizce durur: entitlements imzayı belirler,
  // Info.plist klasörü görünür kılar, Swift onu açar.
  const ID = 'iCloud.com.hastakayit.app';
  assert.ok(readFileSync('ios/App/App/App.entitlements', 'utf8').includes(ID), 'entitlements');
  assert.ok(readFileSync('ios/App/App/Info.plist', 'utf8').includes(ID), 'Info.plist');
  assert.ok(readFileSync(SWIFT, 'utf8').includes(ID), 'Swift');
});

test('cap sync çalıştırılmışsa üretilen yapılandırma da doğru', (t) => {
  // Üretilmiş dosya .gitignore'da; temiz klonda yoktur, o zaman denetlenecek
  // bir şey de yoktur. Varsa YANLIŞ olmamalı.
  if (!existsSync('ios/App/App/capacitor.config.json')) {
    t.skip('ios/App/App/capacitor.config.json henüz üretilmemiş (npm run sync)');
    return;
  }
  const cfg = JSON.parse(readFileSync('ios/App/App/capacitor.config.json', 'utf8'));
  assert.ok(cfg.packageClassList?.includes('ICloudSyncPlugin'),
    `eklenti köprüye kayıtlı değil: ${JSON.stringify(cfg.packageClassList)}`);
});

// KISIR DÖNGÜ: capacitor.config.json ÜRETİLEN bir dosya (.gitignore'da) ve onu
// `cap sync` yazar. `npm run ios` sırası: ios:check → sync → cap open. Taze bir
// klonda dosya yoktur; bunu engelleyici saymak, dosyayı yaratacak adımın hiç
// çalışmamasına yol açıyordu — kullanıcı aynı hatayı sonsuza kadar görüyordu.
import { icloudSeverity } from '../scripts/ios-preflight.mjs';

test('taze klon: üretilmemiş eklenti listesi ENGELLEMEZ, uyarır', () => {
  assert.equal(icloudSeverity({ classList: null, entitlementsExists: true, pbxHasEntitlements: true }), 'warn');
});

test('her şey yerindeyse ok', () => {
  assert.equal(icloudSeverity({ classList: ['ICloudSyncPlugin'], entitlementsExists: true, pbxHasEntitlements: true }), 'ok');
});

test('imzalama tarafı eksikse ENGELLER (sync bunu düzeltemez)', () => {
  assert.equal(icloudSeverity({ classList: null, entitlementsExists: false, pbxHasEntitlements: true }), 'block');
  assert.equal(icloudSeverity({ classList: null, entitlementsExists: true, pbxHasEntitlements: false }), 'block');
});

test('sync ÇALIŞMIŞ ama eklenti listede yoksa ENGELLER (gerçek arıza)', () => {
  assert.equal(icloudSeverity({ classList: ['FilesystemPlugin'], entitlementsExists: true, pbxHasEntitlements: true }), 'block');
});
