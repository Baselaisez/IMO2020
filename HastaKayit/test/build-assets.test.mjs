// WASM ikilisinin ADI doğru mu?
//
// GERÇEK HATA: build.mjs `sql-wasm.wasm` kopyalıyordu, ama esbuild sql.js'in
// "browser" alanını izleyip dist/sql-wasm-browser.js'i gömüyor ve o JS parçası
// ikiliyi KENDİ adıyla (assets/sql-wasm-browser.wasm) istiyor. Sonuç: tarayıcı
// önizlemesi 404 alıp şu bannerla ölüyordu —
//   "UYGULAMA BAŞLATILAMADI — both async and sync fetching of the wasm failed"
// Fark edilmemişti çünkü iPhone yerli SQLite eklentisini kullanıyor; hata
// yalnızca `npm run serve` yolunu ve Mac'te ikili eşleşmesini etkiliyordu.
//
// Bu dosya adı ÜÇ yerin birbirine bağlı olduğu tek nokta:
//   build.mjs  -> kopyalar
//   sql.js     -> hangi adı ister (paketin browser alanı belirler)
//   main.cjs   -> assets/ altındaki İLK .wasm'ı okur (Mac)
// Üçünden biri değişirse uygulama sessizce açılmaz. Bu yüzden testi var.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('build.mjs, sql.js paketinin İSTEDİĞİ wasm adını kopyalar', () => {
  // package.json'u require.resolve ile ALAMIYORUZ: sql.js'in "exports" haritası
  // './package.json' alt yolunu dışa açmıyor. Bu yüzden dist içindeki bilinen
  // bir dosyadan paket köküne çıkıyoruz.
  const pkgDir = dirname(dirname(require.resolve('sql.js/dist/sql-wasm.js')));
  const sqlPkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  // Paketleyicinin (esbuild) seçtiği giriş: "exports" içindeki browser koşulu
  // (sql.js 1.14'te orada), eski paketlerde ise düz "browser" alanı.
  const browserEntry = sqlPkg.exports?.['.']?.browser
    || (typeof sqlPkg.browser === 'string' ? sqlPkg.browser : sqlPkg.browser?.[sqlPkg.main]);
  assert.ok(browserEntry, 'sql.js paketinde browser girişi bulunamadı');
  // O JS parçası aynı adlı .wasm'ı ister: sql-wasm-browser.js -> sql-wasm-browser.wasm
  const wanted = basename(browserEntry).replace(/\.js$/, '.wasm');

  const build = readFileSync(join(ROOT, 'build.mjs'), 'utf8');
  assert.match(build, new RegExp(`sql\\.js/dist/${wanted.replace('.', '\\.')}`),
    `build.mjs '${wanted}' kopyalamalı (sql.js'in browser yapısının istediği ad)`);
  assert.ok(existsSync(require.resolve(`sql.js/dist/${wanted}`)),
    `sql.js paketinde ${wanted} yok`);
});

test('www/assets altında TEK bir .wasm var (Mac doğru ikiliyi seçsin)', (t) => {
  // electron/main.cjs assets/ içindeki İLK .wasm'ı okur; iki dosya olsa Mac
  // sürümü tarayıcı JS parçasıyla eşleşmeyen ikiliyi seçebilirdi.
  const dir = join(ROOT, 'www', 'assets');
  if (!existsSync(dir)) return t.skip('www/ henüz derlenmemiş (npm run build)');
  const wasms = readdirSync(dir).filter(f => f.endsWith('.wasm'));
  assert.equal(wasms.length, 1, `www/assets içinde tam 1 .wasm olmalı, bulunan: ${wasms.join(', ')}`);
  assert.equal(wasms[0], 'sql-wasm-browser.wasm');
});
