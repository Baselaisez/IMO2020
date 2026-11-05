import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const plist = createRequire(import.meta.url)('plist');

// GERÇEK ÇÖKME
// Xcode 27 (iOS 27 SDK) ile derlenip telefona kurulan uygulama, açılır açılmaz
// çöküyordu. Yığın izindeki mesaj netti:
//
//   Application failed to launch: UIScene life cycle is required for apps
//   built with this SDK.
//   `UIScene` life cycle is now required when building with the latest SDKs.
//   Apps that don't adopt will fail to launch.
//
// Yalnızca AppDelegate'li (sahnesiz) eski yapı artık kabul edilmiyor.
// Capacitor 8 hazır bir SceneDelegate getirmediği için kendimiz tanımladık.
//
// Bu testler üç parçanın BİRBİRİYLE TUTARLI kalmasını zorunlu kılar; biri
// sapınca uygulama yine açılışta çöker ve sebebi Xcode'da anlaşılmaz görünür.

const INFO = plist.parse(readFileSync('ios/App/App/Info.plist', 'utf8'));
const SWIFT = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');

function sceneConfig() {
  const m = INFO.UIApplicationSceneManifest;
  assert.ok(m, 'Info.plist içinde UIApplicationSceneManifest yok — uygulama açılışta çöker');
  const list = m.UISceneConfigurations?.UIWindowSceneSessionRoleApplication;
  assert.ok(Array.isArray(list) && list.length === 1, 'tek bir pencere sahnesi yapılandırması bekleniyor');
  return list[0];
}

test('Info.plist UIScene yaşam döngüsünü ilan ediyor', () => {
  const c = sceneConfig();
  assert.equal(INFO.UIApplicationSceneManifest.UIApplicationSupportsMultipleScenes, false,
    'tek pencereli bir uygulama; çoklu sahne açılmamalı');
  assert.equal(c.UISceneStoryboardFile, 'Main',
    'pencereyi UIKit kursun diye storyboard adı verilmeli');
});

test('plist’teki delege sınıfı, Swift’te TANIMLI olan sınıfla aynı', () => {
  const c = sceneConfig();
  assert.equal(c.UISceneDelegateClassName, '$(PRODUCT_MODULE_NAME).SceneDelegate');
  assert.match(SWIFT, /class\s+SceneDelegate\s*:\s*UIResponder\s*,\s*UIWindowSceneDelegate/,
    'AppDelegate.swift içinde SceneDelegate tanımlı olmalı');
});

test('yapılandırma adı iki yerde de AYNI', () => {
  // AppDelegate.configurationForConnecting bu adı döndürüyor; plist'teki adla
  // eşleşmezse UIKit sahneyi kuramaz.
  const c = sceneConfig();
  assert.equal(c.UISceneConfigurationName, 'Default Configuration');
  assert.match(SWIFT, /UISceneConfiguration\(name:\s*"Default Configuration"/);
});

test('SceneDelegate kendi penceresini tutuyor', () => {
  // UIKit, storyboard'dan kurduğu pencereyi bu özelliğe yazar; yoksa ekran boş kalır.
  assert.match(SWIFT, /class SceneDelegate[\s\S]*?var window: UIWindow\?/);
});

test('açılış URL’si ve universal link Capacitor’a iletiliyor', () => {
  // Sahne yaşam döngüsünde bunlar AppDelegate'e DEĞİL sahneye düşer. İletilmezse
  // paylaşım/dosya açma/derin bağlantı sessizce çalışmaz.
  const body = SWIFT.slice(SWIFT.indexOf('class SceneDelegate'));
  for (const fn of ['willConnectTo', 'openURLContexts', 'continue userActivity']) {
    assert.ok(body.includes(fn), `SceneDelegate ${fn} işlemiyor`);
  }
  const forwards = (body.match(/ApplicationDelegateProxy\.shared\.application/g) || []).length;
  assert.ok(forwards >= 4, `Capacitor'a iletim eksik (${forwards} çağrı)`);
});

test('@UIApplicationMain değil @main', () => {
  // @UIApplicationMain Swift 6'da hata olacak; Xcode 27 uyarı veriyor.
  assert.match(SWIFT, /^@main$/m);
  assert.doesNotMatch(SWIFT.split('\n').filter(l => !l.trim().startsWith('//')).join('\n'),
    /@UIApplicationMain/);
});
