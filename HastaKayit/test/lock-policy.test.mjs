import test from 'node:test';
import assert from 'node:assert/strict';
import { blurAction } from '../src/js/lock.js';
import { shouldRequirePin, coldStartGrace } from '../src/js/compute.js';
import { readFileSync } from 'node:fs';
import { lockPolicyHelp } from '../src/js/ui-settings.js';

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

// ---------------------------------------------------------------------------
// SOĞUK BAŞLANGIÇ AFFI
//
// Şikâyet: "PIN'i 10 dakikaya aldım ama 2-3 dakikada yine soruyor."
// Ayar doğru kaydediliyordu; sorun iPhone'un arka plandaki uygulamayı bellek
// için SONLANDIRMASIYDI. Öldürülen uygulamaya dönmek "arka plandan geri gelme"
// değil, SIFIRDAN açılıştır: bellekteki sayaç yok olur ve kilit ekranı ayardan
// bağımsız PIN ister. 100.000 kayıtlık bir uygulamanın birkaç dakikada
// öldürülmesi olağan — bu yüzden kullanıcı ayarın hiç çalışmadığını sanıyordu.
// Düzeltme: arka plana geçiş anı diske yazılır, açılışta okunur.
// ---------------------------------------------------------------------------

const DK = 60000;

test('coldStartGrace: süre dolmadıysa PIN sorulmaz, dolduysa sorulur', () => {
  assert.equal(coldStartGrace('10', 1_000_000, 1_000_000 + 3 * DK), true, '10 dk ayarında 3. dakikada sormamalı');
  assert.equal(coldStartGrace('10', 1_000_000, 1_000_000 + 9.9 * DK), true, 'sınırın hemen altı');
  assert.equal(coldStartGrace('10', 1_000_000, 1_000_000 + 10 * DK), false, 'tam sınırda sormalı');
  assert.equal(coldStartGrace('10', 1_000_000, 1_000_000 + 30 * DK), false, 'süre aşıldıysa sormalı');
  assert.equal(coldStartGrace('2', 1_000_000, 1_000_000 + 3 * DK), false, '2 dk ayarında 3. dakikada sormalı');
  assert.equal(coldStartGrace('5', 1_000_000, 1_000_000 + 4 * DK), true);
});

test('coldStartGrace: süre temelli OLMAYAN ayarlarda af yok', () => {
  // 'switch' = her uygulama değişiminde sor. 'close' = sadece uygulama
  // kapanınca sor — süreç öldüyse uygulama GERÇEKTEN kapanmıştır.
  assert.equal(coldStartGrace('switch', Date.now(), Date.now()), false);
  assert.equal(coldStartGrace('close', Date.now(), Date.now()), false);
});

test('coldStartGrace: şüphede kalınca PIN sorar (emniyetli taraf)', () => {
  const now = 1_000_000;
  assert.equal(coldStartGrace('10', null, now), false, 'damga yoksa');
  assert.equal(coldStartGrace('10', 0, now), false, 'damga sıfırsa');
  assert.equal(coldStartGrace('10', NaN, now), false, 'damga bozuksa');
  assert.equal(coldStartGrace('10', 'abc', now), false, 'damga metinse');
  assert.equal(coldStartGrace('10', now + 5 * DK, now), false, 'saat geri alınmışsa');
  assert.equal(coldStartGrace(undefined, now - DK, now), true, 'ayar yoksa varsayılan 2 dk içinde af');
  assert.equal(coldStartGrace(undefined, now - 5 * DK, now), false, 'varsayılan 2 dk dışında sorar');
});

test('lock.js: arka plana geçişte damga DİSKE yazılır, açılışta okunur, açılınca silinir', () => {
  const src = readFileSync('src/js/lock.js', 'utf8');
  // Yazma, native dalından ÖNCE olmalı: iPhone'da lockNow() hemen return ediyor.
  const writeIdx = src.indexOf(`setMeta(state.exec, LOCK_BG_AT, String(bgAt))`);
  const nativeIdx = src.indexOf('if (isNative()) { lockNow(); return; }', src.indexOf('bgAt = Date.now();'));
  assert.ok(writeIdx > 0, 'arka plana geçişte damga yazılmalı');
  assert.ok(nativeIdx > writeIdx, 'damga, telefon dalı return etmeden ÖNCE yazılmalı');
  // Açılışta okunup karar verilmeli.
  assert.match(src, /coldStartGrace\(policy, bgAt, Date\.now\(\)\)/, 'açılışta af kontrol edilmeli');
  // Af, biyometri penceresinden ÖNCE gelmeli: süre dolmadıysa hiçbir şey sorulmamalı.
  assert.ok(src.indexOf('coldStartGrace(policy, bgAt') < src.indexOf('bioAvailable = await biometricAvailable()'),
    'af kontrolü biyometri kurulumundan önce olmalı');
  // Açılınca damga tüketilmeli, yoksa ön planda çöken uygulama eski damgayla açılırdı.
  assert.match(src, /setMeta\(state\.exec, LOCK_BG_AT, ''\)/, 'unlock damgayı silmeli');
});

// Ayarın ne yaptığı EKRANDA yazmalı. Şikâyetin yarısı görünürlüktü: doktor
// 10 dakikayı seçti, erken PIN gördü ve "ayar bozuk" sandı — ayarın ne anlama
// geldiği hiçbir yerde yazmadığı için kendi başına ayırt edemezdi.
test('lockPolicyHelp: her seçeneğin karşılığını düz Türkçe yazar', () => {
  assert.match(lockPolicyHelp('10', 'mobile'), /10 dakika/);
  assert.match(lockPolicyHelp('10', 'mobile'), /bellek için kapatsa bile/,
    'telefonda, uygulamanın sistem tarafından kapatılması durumu anlatılmalı');
  assert.doesNotMatch(lockPolicyHelp('10', 'desktop'), /bellek için kapatsa bile/,
    'Mac uygulamayı kapatmıyor, orada bu cümle yanıltıcı olur');
  assert.match(lockPolicyHelp('2', 'desktop'), /2 dakika/);
  assert.match(lockPolicyHelp('switch', 'mobile'), /her çıkışta/i);
  assert.match(lockPolicyHelp('close', 'mobile'), /kapat/i);
  // Ayar okunamazsa varsayılan 2 dakikadır; metin de onu söylemeli.
  assert.match(lockPolicyHelp(undefined, 'mobile'), /2 dakika/);
});
