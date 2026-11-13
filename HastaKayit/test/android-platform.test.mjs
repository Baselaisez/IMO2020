// Samsung (Android) uygulamasının SESSİZCE bozulabilecek yerleri.
//
// Buradaki her testin karşılığı, kullanıcıya hata göstermeden işi bozan bir
// yanlış ayar: yanlış klasöre yazmak, izni unutmak, Capacitor'ın genel
// simgesiyle çıkmak. Android'i burada derleyemiyoruz (dl.google.com bu
// ortamda kapalı) ve gerçek cihazda deneyemiyoruz; bu yüzden statik olarak
// doğrulanabilen her şey doğrulanıyor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ANDROID_SYNC_DIR, ANDROID_SYNC_LABEL } from '../src/js/sync-file.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const AND = join(ROOT, 'android');
const read = (p) => readFileSync(join(AND, p), 'utf8');

test('Android projesi depoda var', () => {
  assert.ok(existsSync(AND), 'android/ klasörü olmalı (npx cap add android)');
  assert.ok(existsSync(join(AND, 'app/src/main/AndroidManifest.xml')));
});

test('uygulama kimliği ve adı iPhone/Mac ile AYNI', () => {
  // appId üç platformda aynı olmalı: eşitleme dosyası ve yedekler ortak.
  const cfg = JSON.parse(readFileSync(join(ROOT, 'capacitor.config.json'), 'utf8'));
  assert.equal(cfg.appId, 'com.hastakayit.app');
  assert.equal(cfg.appName, 'Hasta Kayıt');
  const strings = read('app/src/main/res/values/strings.xml');
  assert.match(strings, /<string name="package_name">com\.hastakayit\.app<\/string>/);
  assert.match(strings, /<string name="app_name">Hasta Kayıt<\/string>/);
});

test('eşitleme klasörü HERKESE AÇIK Documents altında', () => {
  // Uygulamanın kendi kabına (Android/data/...) yazsaydık Syncthing onu
  // Android 11'den beri OKUYAMAZDI ve Samsung eşitlemesi hiç çalışmazdı —
  // üstelik hata vermeden, çünkü yazma başarılı olurdu.
  assert.equal(ANDROID_SYNC_DIR, 'HastaKayit/sync');
  assert.match(ANDROID_SYNC_LABEL, /^Documents\//);
});

test('manifest: Documents klasörüne yazmak için gereken izinler var', () => {
  const m = read('app/src/main/AndroidManifest.xml');
  // Android 11+ (Samsung'ların hepsi): bu izin olmadan herkese açık
  // Documents'a yazma engellenir ve eşitleme çalışmaz.
  assert.match(m, /android\.permission\.MANAGE_EXTERNAL_STORAGE/,
    'Android 11+ için tüm dosyalara erişim izni gerekli');
  assert.match(m, /android\.permission\.READ_EXTERNAL_STORAGE/);
  assert.match(m, /android\.permission\.WRITE_EXTERNAL_STORAGE/);
  // Randevu hatırlatmaları Android 13+ bu izni ister.
  assert.match(m, /android\.permission\.POST_NOTIFICATIONS/);
  assert.match(m, /android\.permission\.INTERNET/);
});

test('başlatıcı simgesi Capacitor\'ın genel simgesi DEĞİL', () => {
  // Capacitor hazır projeye kendi logosunu koyar. Üretilen simgeler hem her
  // yoğunlukta bulunmalı hem de yoğunlukla birlikte BÜYÜMELİ — hepsi aynı
  // boyutta olsaydı şablondan kalma dosyalar demekti.
  const sizes = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'].map((d) => {
    for (const f of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      assert.ok(existsSync(join(AND, `app/src/main/res/mipmap-${d}/${f}`)), `${d}/${f} eksik`);
    }
    return statSync(join(AND, `app/src/main/res/mipmap-${d}/ic_launcher.png`)).size;
  });
  for (let i = 1; i < sizes.length; i++) {
    assert.ok(sizes[i] > sizes[i - 1],
      `simge yoğunlukla büyümeli, bulunan: ${sizes.join(' < ')} değil`);
  }
  // Uyarlanabilir simgenin arka planı markanın mavisi olmalı (beyaz = şablon).
  assert.match(read('app/src/main/res/values/ic_launcher_background.xml'), /#24528f/i);
});

test('iOS\'a özel iCloud eklentisi Android derlemesine KARIŞMAZ', () => {
  // plugins/icloud yalnızca Swift içerir. Android tarafına sızsaydı derleme
  // hiç başlamazdı.
  assert.ok(!existsSync(join(ROOT, 'plugins/icloud/android')), 'iCloud eklentisinin android/ klasörü olmamalı');
  const settings = read('capacitor.settings.gradle');
  assert.ok(!/icloud/i.test(settings), 'iCloud eklentisi Android ayarlarında görünmemeli');
  // Ama gerçekten gereken eklentiler orada olmalı.
  for (const p of ['sqlite', 'filesystem', 'local-notifications', 'share', 'app']) {
    assert.match(settings.toLowerCase(), new RegExp(p), `${p} eklentisi Android'e bağlanmalı`);
  }
});

// ---------------------------------------------------------------------------
// versionCode: Android'in güncellemeyi KABUL etmesinin tek şartı
// ---------------------------------------------------------------------------

test('Android versionCode elle yazılmaz, sürümden türetilir', () => {
  // Eskiden "versionCode 51000" elle yazılıydı — 5.10.0'ın karşılığı. Sürüm
  // 5.16.0'a çıktığında bu sayı 51000'de kalıyordu ve Android, versionCode
  // ARTMADIĞI için güncellemeyi REDDEDER. Bu, bir sonraki Samsung
  // güncellemesini sessizce engelleyecek bir mayındı: derleme başarılı
  // görünür, APK üretilir, telefon kurmaz.
  const g = readFileSync(join(ROOT, 'android/app/build.gradle'), 'utf8');
  assert.match(g, /versionCode appVersionCode/, 'versionCode türetilen değişkenden gelmeli');
  assert.doesNotMatch(g, /versionCode\s+\d/, 'versionCode sabit sayı OLMAMALI');
  assert.match(g, /appVersionName\.toString\(\)\.tokenize\('\.'\)/,
    'sürüm numarası package.json\'dan parçalanmalı');
  // Formülün kendisi: sürüm yükseldikçe sayı ARTMALI. Azalan ya da eşit kalan
  // bir formül, hatayı aynen geri getirir.
  const kod = (v) => { const p = v.split('.').map(Number); return p[0]*10000 + p[1]*100 + p[2]; };
  assert.equal(kod('5.10.0'), 51000, 'geçmişteki değerle uyumlu olmalı');
  assert.ok(kod('5.16.0') > kod('5.15.0'));
  assert.ok(kod('5.15.0') > kod('5.9.1'));
  assert.ok(kod('6.0.0') > kod('5.99.99'));
  // build.gradle'daki formül ile buradaki formül AYNI olmalı:
  assert.match(g, /vp\[0\]\.toInteger\(\) \* 10000 \+ vp\[1\]\.toInteger\(\) \* 100 \+ vp\[2\]\.toInteger\(\)/);
});

test('release APK imzasız kalırsa bu BİLİNEREK olur', () => {
  // Android imzasız APK'yı kurmaz. build.gradle, keystore.properties yoksa
  // imzalamayı atlıyor — bu kasıtlı (anahtarı olmayan kopyada da derlensin
  // diye), ama sessiz: derleme başarılı görünür, APK kurulamaz. Kuralın
  // kasıtlı olduğunu yazıya döküyoruz ki yanlışlıkla "düzeltilmesin".
  const g = readFileSync(join(ROOT, 'android/app/build.gradle'), 'utf8');
  assert.match(g, /def hasReleaseKeystore = keystorePropsFile\.exists\(\)/);
  assert.match(g, /if \(hasReleaseKeystore\) \{\s*signingConfig signingConfigs\.release/s);
  // Parolalar ASLA gradle dosyasına gömülmemeli.
  assert.doesNotMatch(g, /storePassword\s+["']/, 'parola build.gradle\'a gömülmemeli');
  assert.doesNotMatch(g, /keyPassword\s+["']/, 'parola build.gradle\'a gömülmemeli');
});
