// Tek derleme betiği — hem iPhone (Capacitor/WKWebView) hem Mac (Electron)
// sürümü AYNI www/ çıktısını kullanır. Platform farkları çalışma anında
// src/js/platform.js ile ayrılır, derleme anında değil: böylece iki hedef
// arasında kod sapması olmaz.
import * as esbuild from 'esbuild';
import { cp, mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');
const out = 'www';

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'assets'), { recursive: true });

// sql.js'in WASM ikilisi.
//
// ADI 'sql-wasm.wasm' DEĞİL 'sql-wasm-browser.wasm' OLMAK ZORUNDA. esbuild
// 'sql.js'i paketlerken paketin "browser" alanını izler ve dist/sql-wasm-
// browser.js'i gömer; o JS parçası da ikiliyi KENDİ adıyla, yani
// assets/sql-wasm-browser.wasm olarak ister. Eskiden sql-wasm.wasm kopyalanıyordu
// ve tarayıcı önizlemesi (npm run serve) 404 alıp şu bannerla ölüyordu:
// "UYGULAMA BAŞLATILAMADI — both async and sync fetching of the wasm failed".
// iPhone'da fark edilmiyordu çünkü orada yerli SQLite eklentisi kullanılıyor.
//
// TEK .wasm bırakmak da şart: electron/main.cjs (hk:wasm-read) assets/ altındaki
// İLK .wasm dosyasını okur. İki dosya olsaydı Mac sürümü yanlış ikiliyi, yani
// tarayıcı JS parçasıyla eşleşmeyen sql-wasm.wasm'ı seçebilirdi.
const sqlWasm = require.resolve('sql.js/dist/sql-wasm-browser.wasm');
await cp(sqlWasm, path.join(out, 'assets', path.basename(sqlWasm)));

await mkdir(path.join(out, 'css'), { recursive: true });
await cp('src/css/app.css', path.join(out, 'css', 'app.css'));
await cp('src/index.html', path.join(out, 'index.html'));

// Sürüm numarasını tek kaynaktan (package.json) HTML'e enjekte et.
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const html = await readFile(path.join(out, 'index.html'), 'utf8');
await writeFile(path.join(out, 'index.html'), html.replace(/__APP_VERSION__/g, pkg.version));

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/js/app.js'],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15'],
  outfile: path.join(out, 'js', 'bundle.js'),
  sourcemap: dev ? 'linked' : false,
  minify: !dev,
  legalComments: 'eof',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // WASM ikilisi paketin içine gömülmez: www/assets/ altına ayrı kopyalanır
  // (yukarıda) ve çalışma anında okunur — iOS'ta locateFile ile, Mac'te ana
  // süreçten fs ile.
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('esbuild: izleme modunda (www/)');
} else {
  await esbuild.build(options);
  console.log(`esbuild: www/ hazır (${dev ? 'dev' : 'release'})`);
}
