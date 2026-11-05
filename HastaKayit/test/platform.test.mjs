// Platform katmanının saf (DOM'suz) kısımları. Bu testler tam olarak iOS/Mac
// dönüşümünde EKLENEN karar noktalarını kilitler: hangi kabukta hangi
// veritabanı adaptörünün seçileceği, kullanıcıya hangi metnin gösterileceği ve
// yedek rotasyonunun hangi dosyaları sileceği.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectPlatform, platformLabel } from '../src/js/platform.js';
import { toDelete } from '../src/js/desktop.js';
import { biometryLabel } from '../src/js/lock.js';
import { dictationCopy } from '../src/js/ui-voice.js';
import { autoBackupNote, notifHelpText } from '../src/js/ui-settings.js';
import { exportMessage } from '../src/js/files.js';

test('detectPlatform: Electron köprüsü platformu belirler', () => {
  assert.equal(detectPlatform({ platform: 'darwin' }, {}, 'web'), 'macos');
  assert.equal(detectPlatform({ platform: 'win32' }, {}, 'web'), 'windows');
});

test('detectPlatform: köprü yoksa Capacitor platformu kullanılır', () => {
  assert.equal(detectPlatform(undefined, {}, 'ios'), 'ios');
  assert.equal(detectPlatform(undefined, {}, 'android'), 'android');
  assert.equal(detectPlatform(undefined, {}, 'web'), 'web');
});

test('detectPlatform: eski nodeIntegration kabuğu da tanınır', () => {
  const win = { process: { versions: { electron: '38.0.0' } }, navigator: { platform: 'MacIntel' } };
  assert.equal(detectPlatform(undefined, win, 'web'), 'macos');
  const winPc = { process: { versions: { electron: '38.0.0' } }, navigator: { platform: 'Win32' } };
  assert.equal(detectPlatform(undefined, winPc, 'web'), 'windows');
});

test('detectPlatform: köprü, Capacitor tespitini geçersiz kılar', () => {
  // Electron içinde Capacitor kendini 'web' sanır; köprü varsa masaüstü kazanır.
  assert.equal(detectPlatform({ platform: 'darwin' }, {}, 'web'), 'macos');
});

test('platformLabel: kullanıcıya gösterilen adlar', () => {
  assert.equal(platformLabel('ios'), 'iPhone');
  assert.equal(platformLabel('macos'), 'Mac');
  assert.equal(platformLabel('android'), 'Android');
});

test('toDelete: en yeni N dosya korunur, gerisi silinir', () => {
  const names = ['snap-2024-01-01.json', 'snap-2024-01-03.json', 'snap-2024-01-02.json'];
  assert.deepEqual(toDelete(names, 2), ['snap-2024-01-01.json']);
  assert.deepEqual(toDelete(names, 3), []);
  assert.deepEqual(toDelete(names, 10), []);
  assert.deepEqual(toDelete([], 5), []);
});

test('toDelete: girdi dizisini değiştirmez', () => {
  const names = ['b', 'a', 'c'];
  toDelete(names, 1);
  assert.deepEqual(names, ['b', 'a', 'c']);
});

test('biometryLabel: iPhone donanımına göre doğru yazı', () => {
  assert.match(biometryLabel('faceId'), /Face ID/);
  assert.match(biometryLabel('touchId'), /Touch ID/);
  assert.match(biometryLabel('fingerprintAuthentication'), /Parmak izi/);
  // Bilinmeyen tür sessizce "parmak izi" DEMEZ — nötr kalır.
  assert.doesNotMatch(biometryLabel(undefined), /Parmak izi|Face ID/);
});

test('dictationCopy: Mac ve Windows farklı kısayol ve uyarı verir', () => {
  const mac = dictationCopy('macos');
  const win = dictationCopy('windows');
  assert.equal(mac.shortcut, 'Fn Fn');
  assert.equal(win.shortcut, 'Win + H');
  assert.match(mac.warning, /Apple/);
  assert.match(win.warning, /Microsoft/);
  // Hiçbir platformda "sesiniz cihazdan çıkmaz" güvencesi verilmiyor.
  for (const c of [mac, win]) assert.match(c.warning, /kimlik bilgilerini sesle yazdırmayın/);
});

test('autoBackupNote: Android metni iPhone/Mac’e sızmaz', () => {
  assert.match(autoBackupNote('android'), /Google Drive/);
  assert.match(autoBackupNote('ios'), /iCloud/);
  assert.doesNotMatch(autoBackupNote('ios'), /Google/);
  assert.equal(autoBackupNote('macos'), '');
});

test('notifHelpText: her platform kendi ayar yolunu gösterir', () => {
  assert.match(notifHelpText('ios'), /Ayarlar → Bildirimler/);
  assert.match(notifHelpText('android'), /Telefon Ayarları/);
  assert.match(notifHelpText('macos'), /Sistem Ayarları/);
  assert.equal(notifHelpText('web'), '');
});

test('exportMessage: Mac’te iptal edilen kaydetme "hazırlandı" demez', () => {
  assert.match(exportMessage({ cancelled: true }, 'Excel').text, /iptal/i);
  assert.match(exportMessage({ path: '/Users/dr/Downloads/a.xlsx' }, 'Excel').text, /kaydedildi/);
  assert.match(exportMessage({ path: '/Users/dr/Downloads/a.xlsx' }, 'Excel').text, /a\.xlsx/);
  // iPhone paylaşım sayfası ve tarayıcı indirmesi: eski davranış korunur.
  assert.match(exportMessage({ shared: true }, 'Excel').text, /hazırlandı/);
  assert.match(exportMessage(undefined, 'Excel').text, /hazırlandı/);
});

test('hasIosSdk: iOS platformu kurulu mu ayrımı', async () => {
  const { hasIosSdk } = await import('../scripts/ios-preflight.mjs');
  // Gerçek `xcodebuild -showsdks` çıktısı biçimi
  assert.equal(hasIosSdk('iOS SDKs:\n\tiOS 18.2\t-sdk iphoneos18.2\n\nmacOS SDKs:\n\tmacOS 15.2\t-sdk macosx15.2'), true);
  // Yalnızca macOS SDK'sı varsa iPhone derlenemez — simülatör eksikliğiyle
  // karıştırılmamalı.
  assert.equal(hasIosSdk('macOS SDKs:\n\tmacOS 15.2\t-sdk macosx15.2'), false);
  assert.equal(hasIosSdk(''), false);
});

// Doktor: "sadece Touch ID kullanıyor, PIN de istiyorum." PIN alanı hep
// oradaydı; biyometri penceresi açılışta ekranı kapladığı için PIN'in de bir
// seçenek olduğu GÖRÜNMÜYORDU. Açıklama satırı artık ikisini de söylüyor.
import { lockPrompt } from '../src/js/lock.js';

test('lockPrompt: biyometri yoksa sade "PIN girin"', () => {
  assert.equal(lockPrompt({ bioAvailable: false }), 'PIN girin');
});

test('lockPrompt: biyometri varsa İKİ seçenek de yazılı', () => {
  const t = lockPrompt({ bioAvailable: true, bioLabel: 'Touch ID ile aç' });
  assert.match(t, /PIN girin/);
  assert.match(t, /Touch ID/);
  assert.doesNotMatch(t, /ile aç/, '"ile aç" cümleye gömülünce bozuk okunur');
});

test('lockPrompt: biyometri iptal edilince PIN’e yönlendirir', () => {
  const t = lockPrompt({ bioAvailable: true, bioLabel: 'Face ID ile aç', cancelled: true });
  assert.match(t, /PIN girin/);
  assert.match(t, /Face ID/);
});

test('biometryLabel: emoji YOK (simge SVG olarak geliyor)', () => {
  for (const t of ['faceId', 'touchId', 'fingerprintAuthentication', undefined]) {
    assert.doesNotMatch(biometryLabel(t), /[\u{1F000}-\u{1FAFF}\u{2300}-\u{27BF}]/u);
  }
});

// GERÇEK HATA: Touch ID başarısız olunca iOS penceresinde YAN YANA İKİ TANE
// "PIN kullan" düğmesi çıkıyordu — iptal düğmesi ile yedek düğmesine aynı
// yazıyı vermiştim. Hangisinin ne yaptığı anlaşılmıyordu.
test('biyometri penceresindeki iki düğmenin yazısı FARKLI', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/js/lock.js', 'utf8');
  const cancel = /cancelTitle:\s*'([^']+)'/.exec(src)?.[1];
  const fallback = /iosFallbackTitle:\s*'([^']+)'/.exec(src)?.[1];
  assert.ok(cancel, 'cancelTitle tanımlı olmalı (yoksa İngilizce "Cancel" çıkar)');
  assert.ok(fallback, 'iosFallbackTitle tanımlı olmalı (yoksa İngilizce "Enter Password" çıkar)');
  assert.notEqual(cancel, fallback, `iki düğme de "${cancel}" yazıyor — ayırt edilemez`);
});

// GERÇEK KİLİTLENME: iOS'ta biyometri penceresi bir SİSTEM katmanı; açılıp
// kapanması uygulamayı "arka plana gitti / öne geldi" saydırıyor. onResume de
// biyometriyi yeniden başlatıyordu. Sonuç: pencere kapanır kapanmaz yeniden
// açılıyor, kullanıcı VAZGEÇEMİYOR ve PIN ekranına hiç ulaşamıyordu.
import { shouldOpenBiometric } from '../src/js/lock.js';

test('vazgeçildikten sonra pencere KENDİLİĞİNDEN yeniden açılmaz', () => {
  assert.equal(shouldOpenBiometric({ auto: true, dismissed: true, inFlight: false }), false);
});

test('vazgeçilse bile DÜĞMEYE basınca açılır', () => {
  // Vazgeçmek biyometriyi kalıcı olarak kapatmamalı; kullanıcı isterse kullanır.
  assert.equal(shouldOpenBiometric({ auto: false, dismissed: true, inFlight: false }), true);
});

test('pencere zaten açıkken ikincisi açılmaz', () => {
  assert.equal(shouldOpenBiometric({ auto: false, dismissed: false, inFlight: true }), false);
  assert.equal(shouldOpenBiometric({ auto: true, dismissed: false, inFlight: true }), false);
});

test('normal durumda kendiliğinden açılır', () => {
  assert.equal(shouldOpenBiometric({ auto: true, dismissed: false, inFlight: false }), true);
});

test('otomatik biyometri çağrılarının hepsi auto işaretli', async () => {
  // Biri işaretsiz kalırsa vazgeçme o yoldan delinir ve döngü geri gelir.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('src/js/lock.js', 'utf8');
  const calls = [...src.matchAll(/tryBiometric\(([^)]*)\)/g)].map(m => m[1].trim());
  const bare = calls.filter(a => a === '');          // tryBiometric()
  const auto = calls.filter(a => a.includes('auto: true'));
  assert.equal(auto.length, 3, `3 otomatik çağrı bekleniyor, bulunan: ${auto.length}`);
  assert.equal(bare.length, 1, 'yalnızca düğme çağrısı argümansız olmalı');
});
