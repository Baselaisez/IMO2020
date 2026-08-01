// `branch:` → `from:` dönüşümü. Yanlış bir dönüşüm ya sorunu çözmez (Capacitor
// 8.0.0 dalında kalır, SceneDelegateProxy hatası sürer) ya da eklentinin başka
// bağımlılıklarını bozar — ikisi de sessiz ve teşhisi zor sonuçlar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { patchBranchPin } from '../scripts/patch-capacitor-spm.mjs';

const SQLITE = `    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", branch: "8.0.0"),
        .package(url: "https://github.com/sqlcipher/SQLCipher.swift.git", from: "4.14.0"),
        .package(url: "https://github.com/weichsel/ZIPFoundation.git", from: "0.9.0")
    ],`;

test('capacitor-swift-pm dal sabitlemesi sürüm aralığına çevrilir', () => {
  const { text, changed } = patchBranchPin(SQLITE);
  assert.equal(changed, true);
  assert.match(text, /capacitor-swift-pm\.git", from: "8\.0\.0"/);
  assert.doesNotMatch(text, /capacitor-swift-pm\.git", branch:/);
});

test('eklentinin DİĞER bağımlılıkları değişmez', () => {
  const { text } = patchBranchPin(SQLITE);
  assert.match(text, /SQLCipher\.swift\.git", from: "4\.14\.0"/);
  assert.match(text, /ZIPFoundation\.git", from: "0\.9\.0"/);
});

test('başka bir paketin dal sabitlemesine dokunulmaz', () => {
  const other = '.package(url: "https://github.com/x/other.git", branch: "main")';
  assert.equal(patchBranchPin(other).changed, false);
});

test('zaten from: ise değişiklik yok (idempotent, yukarı akış düzeltince no-op)', () => {
  const fixed = '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")';
  assert.equal(patchBranchPin(fixed).changed, false);
  assert.equal(patchBranchPin(patchBranchPin(SQLITE).text).changed, false);
});

test('boşluk değişimlerine dayanıklı', () => {
  const spaced = '.package(url: "…/capacitor-swift-pm.git" ,  branch : "8.0.0")';
  assert.match(patchBranchPin(spaced).text, /from\s*:\s*"8\.0\.0"/);
});
