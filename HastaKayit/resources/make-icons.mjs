// Uygulama simgesi ve açılış ekranı üreticisi.
//
// Tek bir SVG kaynaktan iki farklı biçim çıkar, çünkü iki platform simgeyi
// farklı ele alır:
//   • iOS  → kenardan kenara kare; köşeleri sistem kendisi yuvarlar (maskeler).
//            Simgenin kendisi yuvarlatılırsa köşelerde beyaz üçgenler kalır.
//   • macOS→ tuval saydam kalır, çizim ortada ~%82'lik yuvarlak kareye sığar.
//            Bu, Big Sur'dan beri Apple'ın kendi simgelerinin ölçüsüdür; tam
//            kare bir Mac simgesi Dock'ta komşularından iri görünür.
//
// Çalıştırma:  node resources/make-icons.mjs
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BLUE_DARK = '#24528f';
const BLUE = '#2b5ea7';
const GREEN = '#1a7f37';

/** Simgenin çizimi. 1024x1024 kutuya göre tanımlı. */
function artwork({ bleed }) {
  // bleed=true → arka plan tüm tuvali doldurur (iOS). false → ortada yuvarlak kare (macOS).
  const bg = bleed
    ? '<rect x="0" y="0" width="1024" height="1024" fill="url(#g)"/>'
    : '<rect x="96" y="96" width="832" height="832" rx="186" fill="url(#g)"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3f79cb"/>
      <stop offset="1" stop-color="${BLUE_DARK}"/>
    </linearGradient>
  </defs>
  ${bg}
  <!-- hasta dosyası: beyaz kart + üstünde klips -->
  <rect x="286" y="268" width="452" height="516" rx="52" fill="#ffffff"/>
  <rect x="286" y="268" width="452" height="516" rx="52" fill="none" stroke="${BLUE}" stroke-opacity=".15" stroke-width="6"/>
  <rect x="424" y="222" width="176" height="92" rx="30" fill="#eaf1fb" stroke="${BLUE}" stroke-width="12"/>
  <!-- kayıt satırları -->
  <rect x="352" y="392" width="248" height="30" rx="15" fill="#c9d9ef"/>
  <rect x="352" y="456" width="180" height="30" rx="15" fill="#dbe6f5"/>
  <!-- nabız çizgisi: uygulamanın "takip" fikri -->
  <polyline points="342,614 414,614 448,540 500,690 552,596 596,614 682,614"
            fill="none" stroke="${GREEN}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

/** Açılış ekranı: düz mavi zemin, ortada küçültülmüş simge. */
function splash(size) {
  const icon = 0.28 * size;
  const off = (size - icon) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BLUE}"/>
  <g transform="translate(${off} ${off}) scale(${icon / 1024})">
    <rect x="0" y="0" width="1024" height="1024" rx="230" fill="#ffffff" fill-opacity=".07"/>
    <rect x="286" y="268" width="452" height="516" rx="52" fill="#ffffff"/>
    <rect x="424" y="222" width="176" height="92" rx="30" fill="#eaf1fb" stroke="${BLUE}" stroke-width="12"/>
    <rect x="352" y="392" width="248" height="30" rx="15" fill="#c9d9ef"/>
    <rect x="352" y="456" width="180" height="30" rx="15" fill="#dbe6f5"/>
    <polyline points="342,614 414,614 448,540 500,690 552,596 596,614 682,614"
              fill="none" stroke="${GREEN}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/**
 * .icns kabı: 'icns' imzası + toplam uzunluk, ardından her biri
 * [4 bayt tür][4 bayt uzunluk][PNG verisi] olan bloklar. macOS, ic07..ic14
 * türlerinde doğrudan PNG kabul eder — ayrı bir dönüştürücüye gerek yok
 * (iconutil yalnızca macOS'ta var; bu betik her yerde çalışsın diye kabı
 * kendimiz yazıyoruz).
 */
function icns(entries) {
  const blocks = entries.map(([type, data]) => {
    const head = Buffer.alloc(8);
    head.write(type, 0, 'ascii');
    head.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([head, data]);
  });
  const body = Buffer.concat(blocks);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 'ascii');
  header.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([header, body]);
}

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.join(here, '..');

await mkdir(path.join(root, 'resources'), { recursive: true });

// --- iOS ------------------------------------------------------------------
const iosSvg = artwork({ bleed: true });
const iosIconDir = path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset');
await mkdir(iosIconDir, { recursive: true });
// iOS 1024'lük tek simgeyi ister; alfa kanalı KABUL EDİLMEZ (App Store reddeder),
// bu yüzden düz beyaz zemine düzleştiriyoruz — çizim zaten kenardan kenara.
await writeFile(
  path.join(iosIconDir, 'AppIcon-512@2x.png'),
  await sharp(Buffer.from(iosSvg)).resize(1024, 1024).flatten({ background: BLUE_DARK }).png().toBuffer(),
);

const splashDir = path.join(root, 'ios/App/App/Assets.xcassets/Splash.imageset');
await mkdir(splashDir, { recursive: true });
const splashPng = await sharp(Buffer.from(splash(2732))).png({ compressionLevel: 9 }).toBuffer();
for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
  await writeFile(path.join(splashDir, f), splashPng);
}

// --- macOS ----------------------------------------------------------------
const macSvg = artwork({ bleed: false });
await writeFile(path.join(root, 'resources/icon.png'), await png(macSvg, 1024));
await writeFile(path.join(root, 'resources/icon.icns'), icns([
  ['ic07', await png(macSvg, 128)],
  ['ic08', await png(macSvg, 256)],
  ['ic09', await png(macSvg, 512)],
  ['ic10', await png(macSvg, 1024)],
  ['ic11', await png(macSvg, 32)],
  ['ic12', await png(macSvg, 64)],
  ['ic13', await png(macSvg, 256)],
  ['ic14', await png(macSvg, 512)],
]));

console.log('Simgeler üretildi: ios AppIcon + Splash, resources/icon.png, resources/icon.icns');
