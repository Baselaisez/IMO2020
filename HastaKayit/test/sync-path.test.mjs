import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { syncPath } = require('../electron/sync-path.cjs');

// Eşitleme kapısı, uygulamanın veri klasörünün DIŞINA yazan tek yoldur; bu
// yüzden ne yazabildiği tam olarak sabitlenmelidir. Aşağıdakiler "olsa iyi olur"
// değil, güvenlik sınırıdır: ele geçirilmiş bir renderer bu kapıdan doktorun
// belgelerini okuyamamalı.

test('syncPath: yalnızca eşitlemenin kendi iki dosya adına izin verir', () => {
  const dir = '/Users/dr/iCloud/HastaKayit';
  assert.equal(syncPath(dir, 'hastakayit-sync.json'), path.join(dir, 'hastakayit-sync.json'));
  assert.equal(syncPath(dir, 'hastakayit-sync.json.tmp'), path.join(dir, 'hastakayit-sync.json.tmp'));
});

test('syncPath: başka her dosya adı reddedilir', () => {
  const dir = '/Users/dr/iCloud/HastaKayit';
  for (const bad of ['notlar.docx', '.ssh/id_rsa', 'hastakayit-sync.json.bak', '', 'HASTAKAYIT-SYNC.JSON']) {
    assert.throws(() => syncPath(dir, bad), /Eşitleme dosyası değil/, `izin verilmemeliydi: ${bad}`);
  }
});

test('syncPath: yol geçişi (../) dosya adı olarak geçmez', () => {
  const dir = '/Users/dr/iCloud/HastaKayit';
  // Dosya adı izinli listede olmadığı için ilk kapıdan zaten döner; yine de
  // ismin gerçekten klasörün dışına çıkmadığını ayrıca doğruluyoruz.
  assert.throws(() => syncPath(dir, '../hastakayit-sync.json'), /Eşitleme dosyası değil/);
  assert.throws(() => syncPath(dir, '/etc/passwd'), /Eşitleme dosyası değil/);
});

test('syncPath: boş klasör ve kök dizin reddedilir', () => {
  for (const bad of ['', '   ', null, undefined]) {
    assert.throws(() => syncPath(bad, 'hastakayit-sync.json'), /Geçersiz eşitleme klasörü/);
  }
  assert.throws(() => syncPath(path.parse(process.cwd()).root, 'hastakayit-sync.json'), /Geçersiz eşitleme klasörü/);
});

test('syncPath: göreli klasör yolu mutlaklaştırılır', () => {
  const full = syncPath('Belgeler/HastaKayit', 'hastakayit-sync.json');
  assert.ok(path.isAbsolute(full));
  assert.equal(path.basename(full), 'hastakayit-sync.json');
});
