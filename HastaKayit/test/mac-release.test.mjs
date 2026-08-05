// .dmg seçimi. Yanlış seçim sessizce yanlış uygulamayı kurdurur: Intel makinede
// arm64 paketi hiç açılmaz, Apple Silicon'da Intel paketi Rosetta altında yavaş
// çalışır. electron-builder Intel dosyasına mimari EKLEMEDİĞİ için "Intel"
// ancak "arm64 içermeyen" diye tanımlanabilir.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDmg, archLabel } from '../scripts/mac-release.mjs';

const FILES = [
  'Hasta Kayıt-5.0.1-arm64-mac.zip',
  'Hasta Kayıt-5.0.1-arm64.dmg',
  'Hasta Kayıt-5.0.1-mac.zip',
  'Hasta Kayıt-5.0.1.dmg',
  'builder-debug.yml',
  'Hasta Kayıt-5.0.1.dmg.blockmap',
];

test('Apple Silicon arm64 paketini alır', () => {
  assert.equal(pickDmg(FILES, 'arm64'), 'Hasta Kayıt-5.0.1-arm64.dmg');
});

test('Intel, mimari eki OLMAYAN paketi alır', () => {
  assert.equal(pickDmg(FILES, 'x64'), 'Hasta Kayıt-5.0.1.dmg');
});

test('.zip ve .blockmap dosyaları .dmg sanılmaz', () => {
  for (const arch of ['arm64', 'x64']) {
    assert.match(pickDmg(FILES, arch), /\.dmg$/);
    assert.doesNotMatch(pickDmg(FILES, arch), /blockmap|\.zip/);
  }
});

test('tek mimari üretildiyse eldekine düşer', () => {
  assert.equal(pickDmg(['Hasta Kayıt-5.0.1-arm64.dmg'], 'x64'), 'Hasta Kayıt-5.0.1-arm64.dmg');
  assert.equal(pickDmg(['Hasta Kayıt-5.0.1.dmg'], 'arm64'), 'Hasta Kayıt-5.0.1.dmg');
});

test('hiç .dmg yoksa null', () => {
  assert.equal(pickDmg(['builder-debug.yml', 'x.zip'], 'arm64'), null);
  assert.equal(pickDmg([], 'arm64'), null);
});

test('mimari adı kullanıcının anlayacağı dilde', () => {
  assert.match(archLabel('arm64'), /Apple Silicon/);
  assert.match(archLabel('x64'), /Intel/);
});
