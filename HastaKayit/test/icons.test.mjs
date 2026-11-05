import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ICON_PATHS, iconHtml, iconLabelHtml } from '../src/js/icons.js';

// GERÇEK ARIZA: doktorun Mac'inde arayüzdeki BÜTÜN emoji simgeler çizilmedi.
// ⚙️ 🏠 ← ✅ ✏️ ⚡ ☑️ 🔍 ⛔ hepsi kayboldu; "Ayarlar", "Geri", "Kaydet",
// "Düzenle", "Hızlı Ekle", "Seç" düğmeleri ekranda görünmez oldu (tıklanıyor
// ama görünmüyorlardı). Emoji bir YAZI TİPİNE bağlı olduğu için bu her an
// tekrar olabilir. Bu testler simgelerin SVG kalmasını zorunlu kılar.

const HTML = readFileSync('src/index.html', 'utf8');

// DÜĞME içinde: oklar da simgedir (← "Geri" düğmesiydi), bu yüzden Oklar
// bloğu da yasak.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
// DÜZ METİN içinde: "Dosyalar → iPhone'umda" gibi cümlelerdeki ok sıradan bir
// noktalama işaretidir ve normal yazı tipiyle çizilir. Yasaklanan şey, yazı
// tipi çizmediğinde KAYBOLAN resimsi simgelerdir (🔍 ⛔ ⚡ ☑️ ⚙️ ✅ …).
const PICTO = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{27BF}\u{2B00}-\u{2BFF}]/u;

/** index.html'deki her <button> için {attrs, inner}. */
function buttons(src) {
  const out = [];
  for (const m of src.matchAll(/<button([^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)) {
    out.push({ attrs: m[1], inner: m[2] });
  }
  return out;
}

const stripSvg = (s) => s.replace(/<svg[\s\S]*?<\/svg>/g, '');
const visibleText = (s) => stripSvg(s).replace(/<[^>]+>/g, '').trim();

test('index.html: hiçbir düğmede emoji yok', () => {
  const guilty = buttons(HTML).filter(b => EMOJI.test(b.inner))
    .map(b => `${b.attrs.trim()} → ${b.inner.replace(/\s+/g, ' ').slice(0, 60)}`);
  assert.deepEqual(guilty, [],
    'düğme simgesi emoji olamaz — yazı tipi çizmezse düğme GÖRÜNMEZ olur, icons.js kullanın');
});

test('index.html: yalnızca-simge düğmelerin hepsinde aria-label var', () => {
  // Yazısı olmayan bir düğmede etiket yoksa, simge çizilse bile ekran
  // okuyucu kullanan biri düğmenin ne yaptığını bilemez.
  const guilty = buttons(HTML)
    .filter(b => visibleText(b.inner) === '' && !/aria-label/.test(b.attrs))
    .map(b => b.attrs.trim());
  assert.deepEqual(guilty, []);
});

test('index.html: etiketli düğmelerin YAZISI duruyor (simge sadece destek)', () => {
  // Simgeye geçerken yazıyı düşürmek, emoji sorununu çözerken yeni bir
  // görünmezlik yaratırdı.
  for (const id of ['btn-export-xlsx', 'btn-export-json', 'btn-sync-now', 'btn-photo-add', 'btn-clip-paste']) {
    const b = buttons(HTML).find(x => x.attrs.includes(`id="${id}"`));
    assert.ok(b, `${id} bulunamadı`);
    assert.notEqual(visibleText(b.inner), '', `${id} yazısını kaybetmiş`);
  }
});

test('index.html içindeki SVG çizimleri icons.js ile AYNI (tek kaynak)', () => {
  // Statik HTML'e gömülüler ki JavaScript hiç çalışmasa bile görünsünler.
  // Bu da iki kopya demek; kopyaların ayrışmasını bu test engelliyor.
  const known = new Set(Object.values(ICON_PATHS).map(v => v.replace(/\s+/g, ' ').trim()));
  const unknown = [];
  for (const m of HTML.matchAll(/<svg class="ic"[^>]*>([\s\S]*?)<\/svg>/g)) {
    const body = m[1].replace(/\s+/g, ' ').trim();
    if (!known.has(body)) unknown.push(body.slice(0, 70));
  }
  assert.deepEqual(unknown, [], 'icons.js’te karşılığı olmayan SVG — ikisi ayrışmış');
});

test('arama kutusunun büyüteci emoji DEĞİL (placeholder’a SVG konamaz)', () => {
  assert.ok(/placeholder="Hasta ara…"/.test(HTML), 'placeholder sade metin olmalı');
  const css = readFileSync('src/css/app.css', 'utf8');
  assert.match(css, /#search\s*\{[^}]*background-image:\s*url\("data:image\/svg\+xml/,
    'büyüteç CSS arka planından gelmeli');
});

test('JS ile kurulan düğme simgeleri de emoji değil', () => {
  // ui-home.js ⚡/☑️, ui-card.js 🗑️/🧾/✏️/🎤 … hepsi koşarken ekleniyordu.
  const guilty = [];
  for (const f of readdirSync('src/js').filter(n => n.endsWith('.js'))) {
    const src = readFileSync(`src/js/${f}`, 'utf8');
    for (const m of src.matchAll(/<button([^>]*)>((?:(?!<\/button>)[\s\S])*)<\/button>/g)) {
      // ✓ (U+2713) sıradan bir yazı karakteridir ve etiketin yanında süstür.
      const inner = m[2].replace(/✓/g, '');
      if (EMOJI.test(inner)) guilty.push(`${f}: ${inner.replace(/\s+/g, ' ').slice(0, 50)}`);
    }
    for (const m of src.matchAll(/\.(textContent|innerHTML)\s*=\s*(['"`])([^'"`]*)\2/g)) {
      if (PICTO.test(m[3])) guilty.push(`${f}: ${m[0].slice(0, 60)}`);
    }
  }
  assert.deepEqual(guilty, []);
});

test('iconHtml: bilinmeyen simge sessizce boş döndürmez', () => {
  // Sessiz boşluk tam da düzeltmeye çalıştığımız hata: görünmez düğme.
  assert.throws(() => iconHtml('olmayan-simge'), /Bilinmeyen simge/);
});

test('iconHtml: rengi düğmeden alır ve ekran okuyucuda tekrarlanmaz', () => {
  const svg = iconHtml('home');
  assert.match(svg, /stroke="currentColor"/, 'üst çubukta beyaz, Kaydet’te yeşil olabilsin');
  assert.match(svg, /aria-hidden="true"/, 'etiket düğmenin kendisinde');
  assert.match(svg, /viewBox="0 0 24 24"/);
});

test('iconLabelHtml: yazı her zaman kalır', () => {
  const h = iconLabelHtml('save', 'Yedek Al');
  assert.match(h, /<span>Yedek Al<\/span>/);
});

test('her simgenin bir çizimi var ve boş değil', () => {
  for (const [name, d] of Object.entries(ICON_PATHS)) {
    assert.ok(d && d.length > 10, `${name} çizimi boş`);
    assert.match(d, /^<(path|circle|rect)/, `${name} beklenen biçimde değil`);
  }
});
