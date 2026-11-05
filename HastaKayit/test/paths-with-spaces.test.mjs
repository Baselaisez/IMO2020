import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// GERÇEK ARIZA
// Doktorun Mac'inde proje klasörünün adında BOŞLUK vardı:
//   /Users/.../IMO2020-claude-iphone-mac-app-versions-9sq20o 2/HastaKayit/...
//
// Betikler kök klasörü şöyle buluyordu:
//     new URL(import.meta.url).pathname
// Bu, yolu YÜZDE KODLU bırakır: boşluk "%20" olarak kalır. Sonuç: hiçbir dosya
// bulunamaz. Ortaya çıkan davranış:
//   • `npm run ios` ön denetimi "node_modules eksik", "App.xcodeproj
//     bulunamadı", "iCloud eklentisi kayıtlı değil" dedi — hepsi YANLIŞ,
//     dosyaların tamamı yerindeydi.
//   • patch-capacitor-spm.mjs postinstall'da ÇIKIŞ KODU 0 ile bitti ama
//     hiçbir şey yamalamadı (sessiz başarısızlık — en kötü tür).
//
// Doğrusu `fileURLToPath(import.meta.url)`.

const ROOT = path.resolve('.');

function mjsFiles() {
  const out = [];
  for (const dir of ['scripts', 'resources', '.']) {
    for (const f of readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith('.mjs')) out.push(path.join(dir, f.name));
    }
  }
  return out;
}

/** Yorum satırlarını atar: yanlış kalıp, betiklerde AÇIKLAMA olarak geçiyor. */
function codeOnly(src) {
  return src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
}

test('hiçbir betik yolu yüzde kodlu bırakan .pathname kullanmıyor', () => {
  const guilty = mjsFiles().filter(f =>
    /new URL\(import\.meta\.url\)\.pathname/.test(codeOnly(readFileSync(path.join(ROOT, f), 'utf8'))));
  assert.deepEqual(guilty, [],
    'fileURLToPath(import.meta.url) kullanın — aksi hâlde boşluklu klasörde yol %20 içerir');
});

test('kök klasörü hesaplayan her betik fileURLToPath içe aktarmış', () => {
  const missing = [];
  for (const f of mjsFiles()) {
    const src = readFileSync(path.join(ROOT, f), 'utf8');
    if (!src.includes('fileURLToPath(import.meta.url)')) continue;
    if (!/import\s*\{[^}]*fileURLToPath[^}]*\}\s*from\s*'node:url'/.test(src)) missing.push(f);
  }
  assert.deepEqual(missing, []);
});

// Statik tarama yetmez: asıl soru betiğin BOŞLUKLU bir yolda İŞİNİ YAPIP
// yapmadığı. Bu test onu gerçekten çalıştırır.
test('patch-capacitor-spm boşluklu klasörde gerçekten yamalıyor', () => {
  const base = mkdtempSync(path.join(tmpdir(), 'hk-space-'));
  const proj = path.join(base, 'IMO2020 2');          // ← ADINDA BOŞLUK
  const pkgDir = path.join(proj, 'node_modules', '@capacitor-community', 'sqlite');
  mkdirSync(path.join(proj, 'scripts'), { recursive: true });
  mkdirSync(pkgDir, { recursive: true });
  copyFileSync(path.join(ROOT, 'scripts/patch-capacitor-spm.mjs'),
               path.join(proj, 'scripts', 'patch-capacitor-spm.mjs'));
  const swift = path.join(pkgDir, 'Package.swift');
  writeFileSync(swift,
    '.package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", branch: "8.0.0")\n');

  try {
    execFileSync(process.execPath, [path.join(proj, 'scripts', 'patch-capacitor-spm.mjs')],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.match(readFileSync(swift, 'utf8'), /from: "8\.0\.0"/,
      'boşluklu yolda yama uygulanmadı — betik kökü bulamıyor');
    assert.doesNotMatch(readFileSync(swift, 'utf8'), /branch:/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('ön denetim boşluklu klasörde node_modules’ı GÖRÜYOR', () => {
  // Ön denetimin kendisi macOS istiyor ve Linux'ta erken çıkıyor; burada
  // sınanan şey o değil, betiğin kökü doğru çözmesi.
  const base = mkdtempSync(path.join(tmpdir(), 'hk-space-'));
  const proj = path.join(base, 'bir klasör 2');
  mkdirSync(path.join(proj, 'scripts'), { recursive: true });
  mkdirSync(path.join(proj, 'node_modules', '@capacitor', 'ios'), { recursive: true });
  copyFileSync(path.join(ROOT, 'scripts/ios-preflight.mjs'),
               path.join(proj, 'scripts', 'ios-preflight.mjs'));
  const probe = path.join(proj, 'scripts', 'probe.mjs');
  // Betiğin kök hesabını birebir taklit et ve node_modules'ı arat.
  writeFileSync(probe, [
    "import path from 'node:path';",
    "import { existsSync } from 'node:fs';",
    "import { fileURLToPath } from 'node:url';",
    "const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');",
    "console.log(JSON.stringify({ root, var: existsSync(path.join(root,'node_modules','@capacitor','ios')) }));",
  ].join('\n'));
  try {
    const out = JSON.parse(execFileSync(process.execPath, [probe], { encoding: 'utf8' }));
    assert.equal(out.var, true, 'boşluklu yolda node_modules bulunamadı');
    assert.doesNotMatch(out.root, /%20/, 'yol yüzde kodlu kalmış');
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
