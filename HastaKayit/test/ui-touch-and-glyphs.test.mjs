// Arayüzün iki "sessiz" hata sınıfına karşı nöbetçi testler.
//
// Her ikisi de GERÇEK şikâyetten doğdu ve ikisinin de ortak yanı şu: hata
// kendini bir istisnayla DUYURMUYOR. Program çalışır, test geçer, doktor
// kullanamaz. Bu yüzden kuralı burada yazıya döküyoruz.
//
// 1) GÖRÜNMEYEN SİMGE. Doktorun Mac'inde emoji yazı tipi çizilmiyor. Arayüzdeki
//    her emoji (⚙️ 🏠 ✅ 🔍 ⛔ 💾 🔄 ...) ve hatta ok işaretleri (→ ←) boş
//    kutu ya da hiçlik olarak göründü; düğmeler görünmez oldu. Çözüm: görünür
//    metinde ASCII dışı sembol YOK — simgeler gömülü SVG (src/js/icons.js),
//    menü yolları ASCII '>' ile yazılır. Bu test kuralın geri kaymasını önler;
//    emoji'yi geri ekleyen bir satır yazılır yazılmaz test kırılır.
//
// 2) ISKALANAN DOKUNUŞ. "Simgelere basmak için birkaç kez tıklamak gerekiyor,
//    uygulama yavaş." Yavaşlık değildi: dokunma alanı 36 × 28 piksel'di, Apple
//    asgarî 44 × 44 pt ister. Fareyle fark edilmiyordu (piksel hassasiyeti),
//    telefonda her dokunuş kumardı. Ayrıca alt panelde kaydırma yoktu: ödeme
//    paneli klavye açılınca ekranın altına taşıyor ve Kaydet'e ULAŞILAMIYORDU.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// fileURLToPath ŞART: proje yolunda boşluk varsa (doktorun Mac'inde klasör adı
// "... 9sq20o 2" idi) .pathname içinde %20 kalır ve okuma sessizce başarısız
// olur. Bu hatayı bu projede bir kez yaşadık.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/** Yorumları çıkar: geriye yalnızca ÇALIŞAN kod (ve içindeki görünür metin) kalır. */
export function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')   // /* ... */ ve /** ... */ blokları
    .replace(/<!--[\s\S]*?-->/g, ' ')    // HTML yorumları
    .split('\n')
    .map(line => line.replace(/(^|[^:])\/\/.*$/, '$1')) // satır sonu // yorumu ("https://" korunur)
    .join('\n');
}

// Emoji ve süs sembolleri. Ok işaretleri (→ ← ▸) de burada: doktorun Mac'inde
// onlar da çizilmedi. Türkçe harfler (ç ğ ı ö ş ü İ) ve tipografik tırnaklar
// (“ ” ’) KASTEN hariç — onlar metnin kendisi, yazı tipinde her zaman var.
const BAD_GLYPH = /[\u2190-\u21FF\u2460-\u27BF\u2B00-\u2BFF\u25A0-\u25FF\uFE0F\u2699\u26A0]|[\u{1F000}-\u{1FAFF}]/u;

function uiSourceFiles() {
  const files = [join(SRC, 'index.html')];
  for (const name of readdirSync(join(SRC, 'js'))) {
    // icons.js simge TANIMIDIR (saf SVG yolu verisi), görünür metin üretmez.
    if (name.endsWith('.js') && name !== 'icons.js') files.push(join(SRC, 'js', name));
  }
  return files;
}

test('görünür arayüz metninde emoji / ok işareti yok (Mac yazı tipi onları çizmiyor)', () => {
  const offenders = [];
  for (const file of uiSourceFiles()) {
    const code = stripComments(readFileSync(file, 'utf8'));
    code.split('\n').forEach((line, i) => {
      const m = line.match(BAD_GLYPH);
      if (m) offenders.push(`${file.slice(ROOT.length + 1)}:${i + 1}  ${JSON.stringify(m[0])}  ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [],
    `Görünür metinde ASCII dışı sembol bulundu. Simge gerekiyorsa iconHtml() kullanın,\n`
    + `menü yolu için ASCII '>' yazın:\n  ` + offenders.join('\n  '));
});

test('stripComments: yorumu atar, kodu ve URL\'yi korur', () => {
  // Testin kendisinin doğru çalıştığını kanıtlar — yoksa "hiç ihlal yok"
  // sonucu, her satırı yorum sayan bozuk bir ayıklayıcıdan da gelebilirdi.
  assert.equal(stripComments('const a = 1; // ⚙️ yorum').trim(), 'const a = 1;');
  assert.match(stripComments('/** ⚙️ blok */\nconst b = 2;'), /const b = 2;/);
  assert.doesNotMatch(stripComments('/** ⚙️ blok */\nconst b = 2;'), /⚙/);
  assert.match(stripComments('<!-- ⚙️ --><p>x</p>'), /<p>x<\/p>/);
  assert.match(stripComments("const u = 'https://a.example/b'; // not"), /https:\/\/a\.example\/b/);
  // Ve ihlali GERÇEKTEN yakaladığını göster:
  assert.ok(BAD_GLYPH.test(stripComments("banner('Kaydedildi ✓')")));
});

const CSS = readFileSync(join(SRC, 'css', 'app.css'), 'utf8');

test('simge düğmelerinin dokunma alanı en az 44px (Apple asgarîsi)', () => {
  const rule = CSS.match(/\.iconbtn \{[^}]*\}/s);
  assert.ok(rule, '.iconbtn kuralı bulunamadı');
  assert.match(rule[0], /min-width:\s*44px/, '.iconbtn min-width 44px olmalı');
  assert.match(rule[0], /min-height:\s*44px/, '.iconbtn min-height 44px olmalı');
  // Yazılı düğmeler de parmakla vurulabilsin.
  assert.match(CSS, /\.chip-filter,[^{]*\{[^}]*min-height:\s*44px/s);
});

test('simge SVG\'si dokunuşu yutmaz (pointer-events: none)', () => {
  // WKWebView'de dokunuş SVG'ye düşerse tıklama düğmeye ulaşmayabiliyor:
  // kullanıcı tam simgeye basar, hiçbir şey olmaz.
  const rule = CSS.match(/^\.ic \{[^}]*\}/ms);
  assert.ok(rule, '.ic kuralı bulunamadı');
  assert.match(rule[0], /pointer-events:\s*none/);
});

test('alt panel kaydırılabilir (ödeme panelinde Kaydet ekran altında kalmasın)', () => {
  const rule = CSS.match(/\.sheet \{[^}]*\}/s);
  assert.ok(rule, '.sheet kuralı bulunamadı');
  assert.match(rule[0], /max-height:/, '.sheet yüksekliği sınırlanmalı');
  assert.match(rule[0], /overflow-y:\s*auto/, '.sheet kaydırılabilir olmalı');
  // iOS'ta 100vh yalan söyler; gerçek görünür alan dvh ile ölçülür.
  assert.match(CSS, /html\[data-platform="ios"\] \.sheet \{[^}]*100dvh/s);
});

// ---------------------------------------------------------------------------
// "Bugün" ve "Son açılanlar" şeritleri
//
// İki şerit yan yana duruyordu ama farklı çalışıyordu: "Son açılanlar"
// tıklanabilir çiplerdi, "Bugün" düz yazıydı. Doktor bugünkü randevuyu ekranda
// görüyor ama hastayı açmak için adını arama kutusuna yazmak zorundaydı —
// 100.000 kayıtlık bir listede en çok ihtiyaç duyulan kayıtlar tam da bunlar.
// Ayrıca iki şeridin çipleri 24px yüksekliğindeydi; dokunma alanı düzeltmesi
// bu ikisini atlamıştı.
// ---------------------------------------------------------------------------

test('"Bugün" şeridindeki hastalar TIKLANABİLİR', () => {
  const src = readFileSync(join(ROOT, 'src/js/ui-home.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function renderToday'), src.indexOf('async function resetAndLoadFirstPage'));
  assert.match(fn, /class="today-chip" data-id="\$\{p\.id\}"/, 'her randevu bir düğme olmalı');
  assert.match(fn, /querySelectorAll\('\.today-chip'\)/, 'çiplere tıklama bağlanmalı');
  assert.match(fn, /openCard\(Number\(b\.dataset\.id\)\)/, 'tıklayınca hasta kartı açılmalı');
});

test('şerit çipleri parmakla vurulabilir ve şerit ekranı kaplamaz', () => {
  // Masaüstünde fare piksel hassasiyetinde; 44px yalnızca dokunmatikte.
  const cips = CSS.match(/\.recent-chip, \.today-chip \{[^}]*\}/s);
  assert.ok(cips, '.recent-chip/.today-chip kuralı bulunamadı');
  assert.match(cips[0], /min-height:\s*32px/, 'masaüstünde bile 24px çok küçüktü');
  assert.match(CSS, /html\[data-platform="ios"\] \.recent-chip[^{]*\{[^}]*min-height:\s*44px/s,
    'dokunmatik platformda 44px olmalı');
  assert.match(CSS, /html\[data-platform="android"\] \.today-chip/,
    'Android da dokunmatik — aynı kural geçerli');
  // Çipler büyüdüğü için yoğun bir günde şerit ekranı kaplayabilirdi.
  const serit = CSS.match(/\.today \{[^}]*\}/s);
  assert.ok(serit, '.today kuralı bulunamadı');
  assert.match(serit[0], /max-height:/, 'şeridin yüksekliği sınırlı olmalı');
  assert.match(serit[0], /overflow-y:\s*auto/, 'sınırı aşan randevulara kaydırarak ulaşılmalı');
});
