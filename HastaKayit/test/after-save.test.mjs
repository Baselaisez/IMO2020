import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterSaveDestination } from '../src/js/after-save.js';
import { syncNoteText, syncStatusText } from '../src/js/ui-settings.js';

// İSTEK: "Yeni hastanın ve ödemenin kaydı bitince uygulama bizi hemen ana
// sayfaya götürsün."

test('yeni kayıt tamamlanınca ana sayfaya dönülür', () => {
  assert.equal(afterSaveDestination(true), 'home');
});

test('mevcut kayıt düzenlenince bulunulan yerde kalınır', () => {
  // Doktor kartta bir alanı düzeltirken ana sayfaya fırlatılırsa baktığı kaydı
  // yeniden bulmak zorunda kalır — düzenleme akışın sonu değil, ortasıdır.
  assert.equal(afterSaveDestination(false), 'stay');
});

// Kuralı iki ekran da AYNI yerden okumalı. Biri kendi `if`ini yazarsa
// davranış sessizce ikiye ayrılır; bu test onu düşürür.
test('hasta formu ve ödeme paneli kuralı ortak yerden okuyor', () => {
  for (const f of ['src/js/ui-form.js', 'src/js/ui-card.js']) {
    const src = readFileSync(f, 'utf8');
    assert.match(src, /afterSaveDestination/, `${f} ortak kuralı kullanmalı`);
  }
});

// Otomatik kayıt, ilk yazmadan sonra state.editing'i true yapıyor. Yönlendirme
// ona bakarsa, 8 saniye beklemiş YENİ bir hasta "düzenleme" sanılır ve ana
// sayfaya dönülmez. Bayrak form açılışında konmalı.
test('yönlendirme otomatik kaydın değiştirdiği state.editing’e DEĞİL, form açılışına bakar', () => {
  const src = readFileSync('src/js/ui-form.js', 'utf8');
  assert.match(src, /formWasNew\s*=\s*!patientId/, 'bayrak form açılışında konur');
  assert.match(src, /afterSaveDestination\(formWasNew\)/, 'karar o bayrakla verilir');
  assert.doesNotMatch(src, /afterSaveDestination\(\s*!?state\.editing\s*\)/,
    'state.editing otomatik kayıtla değiştiği için güvenilmez');
});

test('ödeme: yeni ödeme için home, düzenleme için stay', () => {
  const src = readFileSync('src/js/ui-card.js', 'utf8');
  assert.match(src, /afterSaveDestination\(!existing\)/,
    '`existing` yoksa yeni ödemedir → ana sayfa');
});

// --- Ayarlar ekranındaki eşitleme metinleri (saf) -------------------------

test('iPhone + iCloud açık: "klasör seçmeniz gerekmez" denir', () => {
  const t = syncNoteText({ platform: 'mobile', icloud: true });
  assert.match(t, /iCloud/);
  assert.match(t, /gerek yok/);
});

test('iPhone + iCloud kapalı: sebep gizlenmez', () => {
  const t = syncNoteText({ platform: 'mobile', icloud: false, icloudReason: 'iCloud Drive kapalı.' });
  assert.match(t, /iCloud Drive kapalı\./);
});

test('durum satırı nerede eşitlendiğini söyler', () => {
  const t = syncStatusText({ active: true, targetLabel: 'iCloud Drive → Hasta Kayıt' }, '2026-11-04 10:00');
  assert.match(t, /iCloud Drive → Hasta Kayıt/);
  assert.match(t, /2026-11-04 10:00/);
});

test('kapalıyken son eşitleme zamanı yine gösterilir', () => {
  const t = syncStatusText({ active: false, enabled: false }, '2026-11-04 10:00');
  assert.match(t, /kapalı/);
  assert.match(t, /2026-11-04 10:00/);
});
