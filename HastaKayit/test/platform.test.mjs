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
