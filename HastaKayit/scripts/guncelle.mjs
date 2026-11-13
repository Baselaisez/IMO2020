#!/usr/bin/env node
// guncelle.mjs — "npm run guncelle": tek komutla güvenli güncelleme.
//
// NEDEN VAR (gerçek bir gün)
// Doktorun Mac'i beş sürüm geride kalmıştı ve güncellemek üç saat sürdü.
// Üç ayrı tuzağa arka arkaya düşüldü, üçü de SESSİZ:
//
//   1) `git pull` "Your local changes to package-lock.json would be
//      overwritten — Aborting" deyip iptal etti. Terminal akıp gittiği için
//      kimse fark etmedi; `npm run build` eski kodu derledi ve her şey
//      çalışıyormuş gibi göründü. Sürümün hâlâ 5.9.1 olduğu ancak derleme
//      çıktısındaki "hastakayit@5.9.1" yazısından anlaşıldı.
//      (package-lock.json'ı `npm install` her seferinde değiştiriyor; bu
//      dosya ÜRETİLEN bir dosya, yerel değişikliğini atmak güvenli.)
//
//   2) Electron "failed to install correctly" dedi. Sebep `dist` klasörü
//      değil, yanındaki tek satırlık `path.txt` dosyasının eksikliğiydi.
//      Electron'un kendi onarım betiği de "dist zaten var" deyip hiçbir şey
//      yapmadan çıkıyordu.
//
//   3) Electron'un indirici betiği hiç indirmeden çıktı. Bu yüzden burada
//      yedek plan var: gerekirse dosya DOĞRUDAN GitHub'dan indirilir.
//
// Bu betiğin tek işi: bu üç tuzağı önceden kontrol etmek ve HER ADIMI
// EKRANA YAZMAK. Sessiz başarısızlık yok — bir adım tutmazsa durur ve
// nedenini söyler.
import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { electronAltYol, electronSaglam, electronZipAdi } from './guncelle-core.mjs';

const KOK = join(dirname(fileURLToPath(import.meta.url)), '..');

const yaz = (s) => process.stdout.write(s + '\n');
const calistir = (komut, args, opts = {}) =>
  execFileSync(komut, args, { cwd: KOK, encoding: 'utf8', stdio: 'pipe', ...opts });

function adim(no, baslik) { yaz(`\n=== ${no}) ${baslik} ===`); }

// --- 1) package-lock.json yerel değişikliğini at ---------------------------
adim(1, 'Guncellemenin onundeki engeli kaldir');
try {
  const kirli = calistir('git', ['status', '--porcelain', '--', 'package-lock.json']).trim();
  if (kirli) {
    calistir('git', ['checkout', '--', 'package-lock.json']);
    yaz('package-lock.json eski haline getirildi (uretilen dosya, veri degil)');
  } else {
    yaz('package-lock.json zaten temiz');
  }
} catch (e) { yaz('UYARI: ' + (e.stderr || e.message)); }

// --- 2) Güncellemeyi indir -------------------------------------------------
adim(2, 'Guncellemeyi indir');
const oncekiSurum = JSON.parse(readFileSync(join(KOK, 'package.json'), 'utf8')).version;
try {
  yaz(calistir('git', ['pull']).trim());
} catch (e) {
  yaz('HATA: git pull basarisiz oldu.');
  yaz(String(e.stdout || '') + String(e.stderr || ''));
  yaz('\nGUNCELLEME INMEDI. Yukaridaki metni gonderin; devam etmek anlamsiz,');
  yaz('cunku ESKI surum derlenir ve her sey calisiyormus gibi gorunur.');
  process.exit(1);
}
const yeniSurum = JSON.parse(readFileSync(join(KOK, 'package.json'), 'utf8')).version;
yaz(`Surum: ${oncekiSurum} -> ${yeniSurum}`);

// --- 3) Electron sağlam mı? ------------------------------------------------
adim(3, 'Electron kontrolu');
const eKok = join(KOK, 'node_modules', 'electron');
if (!existsSync(eKok)) {
  yaz('node_modules/electron yok. Once `npm install` calistirin.');
  process.exit(1);
}
const altYol = electronAltYol(process.platform);
const pathTxtYolu = join(eKok, 'path.txt');
const saglam = electronSaglam({
  pathTxt: existsSync(pathTxtYolu) ? readFileSync(pathTxtYolu, 'utf8') : null,
  altYol,
  ikiliVar: existsSync(join(eKok, 'dist', altYol)),
});

if (saglam) {
  yaz('Electron saglam');
} else {
  yaz('Electron eksik — onariliyor');
  const eSurum = JSON.parse(readFileSync(join(eKok, 'package.json'), 'utf8')).version;
  const ad = electronZipAdi(eSurum, process.platform, process.arch);
  const url = `https://github.com/electron/electron/releases/download/v${eSurum}/${ad}`;
  const zip = join(eKok, '_indirme.zip');
  yaz(`Indiriliyor: ${ad}`);
  try {
    execSync(`curl -fL --progress-bar -o "${zip}" "${url}"`, { stdio: 'inherit' });
    rmSync(join(eKok, 'dist'), { recursive: true, force: true });
    mkdirSync(join(eKok, 'dist'), { recursive: true });
    execSync(`unzip -q "${zip}" -d "${join(eKok, 'dist')}"`, { stdio: 'inherit' });
    // path.txt SATIR SONU OLMADAN yazilir: Electron icerigi dogrudan yol
    // birlestirmede kullaniyor, sondaki \n yolu bozar.
    execSync(`printf '%s' '${altYol}' > "${pathTxtYolu}"`, { stdio: 'inherit' });
    rmSync(zip, { force: true });
    yaz('Electron onarildi');
  } catch (e) {
    yaz('HATA: Electron onarilamadi — ' + (e.message || e));
    process.exit(1);
  }
}

// --- 4) Derle --------------------------------------------------------------
adim(4, 'Derle');
execSync('node build.mjs', { cwd: KOK, stdio: 'inherit' });

yaz('\n==================================================');
yaz(`  HAZIR — surum ${yeniSurum}`);
yaz('  Simdi uygulamayi acmak icin:  npm run mac');
yaz('==================================================');
