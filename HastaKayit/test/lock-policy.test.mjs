import test from 'node:test';
import assert from 'node:assert/strict';
import { blurAction } from '../src/js/lock.js';
import { shouldRequirePin } from '../src/js/compute.js';

// Şikayet: Mac'te Safari'ye her geçişte kilit ekranı bir anlığına çakıp hemen
// kayboluyordu — ayarda "2 dakika sonra" seçili olsa bile. Sebep: masaüstünde
// her blur'da koşulsuz kilitleniyor, dönüşte ayara bakılıp otomatik açılıyordu.
// Artık masaüstünde AYARA UYULUYOR; telefonda davranış değişmiyor.

test('blurAction: telefonda ayar ne olursa olsun ekran hemen kapanır', () => {
  for (const p of ['switch', 'close', '2', '5', '10', undefined]) {
    assert.equal(blurAction(p, true), 'lock', `native/${p}`);
  }
});

test('blurAction: masaüstünde "Her uygulama değişiminde" hemen kilitler', () => {
  assert.equal(blurAction('switch', false), 'lock');
});

test('blurAction: masaüstünde "Sadece uygulama kapanınca" hiç kilitlemez', () => {
  assert.equal(blurAction('close', false), 'none');
});

test('blurAction: masaüstünde süreli ayarlar sayaç başlatır, kilitlemez', () => {
  assert.equal(blurAction('2', false), 'timer');
  assert.equal(blurAction('5', false), 'timer');
  assert.equal(blurAction('10', false), 'timer');
});

test('blurAction: ayar okunamazsa varsayılan sayaçtır (kilitsiz kalmaz)', () => {
  assert.equal(blurAction(undefined, false), 'timer');
  assert.equal(blurAction('', false), 'timer');
});

// Sayaç dolduğunda gerçekten PIN sorulmalı — blurAction 'timer' dedi diye
// kilit büsbütün ortadan kalkmıyor.
test('süre dolunca PIN yine sorulur', () => {
  assert.equal(shouldRequirePin('2', 2 * 60000), true);
  assert.equal(shouldRequirePin('2', 119000), false);
  assert.equal(shouldRequirePin('10', 11 * 60000), true);
});
