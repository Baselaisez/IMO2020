// Tek komutluk guncelleyicinin karar mantigi.
//
// Bu testler gercek bir gunden dogdu: doktorun Mac'i bes surum geride kaldi ve
// guncellemek ucuncu denemede tuttu. Uc tuzagin ucu de SESSIZDI — hicbiri
// "hata" diye bagirmadi, hepsi "oldu" gorunup eski surumu calistirdi.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { electronAltYol, electronSaglam, electronZipAdi } from '../scripts/guncelle-core.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MAC = 'Electron.app/Contents/MacOS/Electron';

test('electronAltYol: her platformda dogru ic yol', () => {
  assert.equal(electronAltYol('darwin'), MAC);
  assert.equal(electronAltYol('mas'), MAC);
  assert.equal(electronAltYol('win32'), 'electron.exe');
  assert.equal(electronAltYol('linux'), 'electron');
});

test('electronSaglam: "dist klasoru var" KURULU demek degil', () => {
  // Doktorun Mac'indeki tam durum: dist vardi, ikili vardi, path.txt YOKTU.
  // Electron bu halde "failed to install correctly" diyordu; onarim betigi de
  // "dist zaten var" deyip hicbir sey yapmadan cikiyordu. Iste o cikmaz.
  assert.equal(electronSaglam({ pathTxt: null, altYol: MAC, ikiliVar: true }), false,
    'path.txt yoksa saglam SAYILMAMALI');
  assert.equal(electronSaglam({ pathTxt: MAC, altYol: MAC, ikiliVar: false }), false,
    'path.txt dogru ama gosterdigi dosya yoksa saglam sayilmamali');
  assert.equal(electronSaglam({ pathTxt: 'electron', altYol: MAC, ikiliVar: true }), false,
    'baska platformun yolu kalmissa saglam sayilmamali');
  assert.equal(electronSaglam({ pathTxt: MAC, altYol: MAC, ikiliVar: true }), true,
    'ucu de tamamsa saglam');
});

test('electronSaglam: sondaki satir sonu kurulumu bozuk saydirmaz', () => {
  // path.txt'yi elle yazarken sona \n kacmasi cok kolay. Electron icerigi
  // DOGRUDAN yol birlestirmede kullandigi icin bu yolu bozar; ama bizim
  // saglamlik kontrolumuz bu yuzden "bozuk" deyip 100 MB'i yeniden
  // indirmemeli.
  assert.equal(electronSaglam({ pathTxt: MAC + '\n', altYol: MAC, ikiliVar: true }), true);
});

test('electronZipAdi: GitHub dosya adi', () => {
  assert.equal(electronZipAdi('38.8.6', 'darwin', 'arm64'), 'electron-v38.8.6-darwin-arm64.zip');
  assert.equal(electronZipAdi('38.8.6', 'darwin', 'x64'), 'electron-v38.8.6-darwin-x64.zip');
  // Bilinmeyen mimari x64'e duser (Rosetta altindaki eski Mac'ler).
  assert.equal(electronZipAdi('38.8.6', 'darwin', 'ia32'), 'electron-v38.8.6-darwin-x64.zip');
});

test('guncelle.mjs: git pull BASARISIZ olursa DURUR', () => {
  // Butun ciledeki en pahali hata buydu: pull iptal oldu, betik devam etti,
  // ESKI surum derlendi ve her sey calisiyormus gibi gorundu. Sessiz
  // basarisizlik, gurultulu basarisizliktan beterdir.
  const src = readFileSync(join(ROOT, 'scripts/guncelle.mjs'), 'utf8');
  const i = src.indexOf("yaz(calistir('git', ['pull'])");
  assert.ok(i > 0, 'git pull cagrisi bulunamadi');
  const yakala = src.slice(i, i + 700);
  assert.match(yakala, /catch/, 'git pull bir try/catch icinde olmali');
  assert.match(yakala, /process\.exit\(1\)/, 'pull basarisizsa betik DURMALI');
});

test('guncelle.mjs: path.txt satir sonu OLMADAN yazilir', () => {
  const src = readFileSync(join(ROOT, 'scripts/guncelle.mjs'), 'utf8');
  assert.match(src, /printf '%s'/, "path.txt printf '%s' ile (satir sonsuz) yazilmali");
  assert.doesNotMatch(src, /echo ['"]?\$\{altYol\}/, 'echo sona \\n ekler, yolu bozar');
});

test('package.json: guncelle komutu tanimli', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.guncelle, 'node scripts/guncelle.mjs');
});
