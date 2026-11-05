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

// Yalnızca bu makinenin mimarisi derlenir: pickDmg zaten host mimarisine uyan
// .dmg'yi seçiyordu, diğeri hiç kullanılmadan üretilip süreyi iki katına
// çıkarıyordu.
import { builderArchFlag } from '../scripts/mac-release.mjs';

test('builderArchFlag: Apple Silicon → --arm64', () => {
  assert.equal(builderArchFlag('arm64'), '--arm64');
});

test('builderArchFlag: Intel → --x64', () => {
  assert.equal(builderArchFlag('x64'), '--x64');
});

test('builderArchFlag: bilinmeyen mimaride Intel’e düşer (Rosetta ile çalışır)', () => {
  // arm64'e düşmek Intel Mac'te HİÇ çalışmayan bir uygulama verirdi.
  assert.equal(builderArchFlag('ia32'), '--x64');
  assert.equal(builderArchFlag(undefined), '--x64');
});

test('derleme komutu tek mimari kullanıyor', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync('scripts/mac-release.mjs', 'utf8');
  assert.doesNotMatch(src, /'--arm64',\s*'--x64'/, 'iki mimari birden derlenmemeli');
  assert.match(src, /'electron-builder',\s*'--mac',\s*flag/);
});

// package.json'daki sabit mimari listesi, komut satırındaki --arm64 bayrağını
// EZİYORDU: mac:release "Apple Silicon (M serisi)" yazıp yine iki mimariyi de
// derliyor, süre iki katına çıkıyordu. Mimariyi artık yalnızca çağıran seçer.
test('mac hedeflerinde sabit mimari listesi YOK', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  for (const t of pkg.build.mac.target) {
    assert.equal(typeof t, 'string',
      `hedefe gömülü arch listesi --arm64 bayrağını ezer: ${JSON.stringify(t)}`);
  }
});
