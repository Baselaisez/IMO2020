# Simgeler neden emoji değil

## Arıza

Doktorun Mac'inde üst çubuk bomboş göründü. Ekran görüntüsünde:

- **⚙️ Ayarlar**, **⚡ Hızlı Ekle**, **☑️ Seç** düğmeleri yok
- arama kutusunda **🔍** yok
- "Asla Bakılmayacak" çipinde **⛔** yok

Düğmeler siliniyor sanıldı. Silinmemişlerdi: **oradaydılar ve tıklanıyorlardı,
ama görünmüyorlardı.** Hayatta kalan tek simge, zaten SVG olarak çizilen yeşil
"Metinden Hasta Ekle" düğmesiydi — teşhisi de o verdi.

Sebep: arayüzdeki bütün simgeler **emoji karakteriydi**. Emoji bir YAZI TİPİNE
bağlıdır (macOS'ta Apple Color Emoji). O yazı tipi bozulur, devre dışı kalır ya
da yazı tipi önbelleği bozulursa karakterin yerine hiçbir şey çizilmez. Geriye
sıfır genişlikte, görünmez ama tıklanabilir bir düğme kalır.

Bir tıbbi kayıt uygulamasında **"Kaydet" düğmesinin görünmemesi** kabul
edilemez. Üstelik bazı simgeler bilginin TEK taşıyıcısıydı:

| Yer | Eski | Kaybolunca |
|---|---|---|
| Hasta listesi | ` ✅` / ` ⛔` | "tamamlandı" ile "bakılmayacak" ayırt edilemiyordu |
| Ödeme satırı | `⏳` / `✓` | ödemenin yapılıp yapılmadığı belirsizdi |
| Toplu aktarım | `❌` / `⚠️` | hatalı satır ile kopya satır aynı görünüyordu |

## Çözüm

Bütün simgeler **gömülü SVG** oldu ([`src/js/icons.js`](../src/js/icons.js)).
SVG hiçbir yazı tipine bağlı değildir: aynı çizim her Mac'te, her iPhone'da ve
her Android'de birebir aynı görünür.

İki ek kural:

1. **Renk `currentColor`.** Simge, düğmenin rengini alır — üst çubukta beyaz,
   "Kaydet"te yeşil, "Sil"de kırmızı. Ayrı bir renk tanımı gerekmez.
2. **Simge asla tek başına bilgi taşımaz.** Durum rozetleri artık simge *ve*
   yazı içeriyor (`✓ Tamamlandı`, `⃠ Bakılmayacak`, `🕐 Yapılacak`). Simge bir
   gün yine çizilmezse anlam kaybolmaz.

Statik düğmelerin SVG'si doğrudan `index.html` içine gömülüdür — JavaScript hiç
çalışmasa bile görünsünler diye. Bu iki kopya demek; kopyaların ayrışmasını
`test/icons.test.mjs` içindeki bir test engelliyor (HTML'deki her çizim
`icons.js`'te birebir bulunmalı).

## Nelerin emoji kalmasına izin verildi

- **`✓`** (U+2713): sıradan bir yazı karakteri, renkli emoji değil. Normal yazı
  tipleriyle çizilir ve yanındaki yazı zaten anlamı taşır ("Kaydet ✓").
- **`→`** cümle içinde ayraç olarak ("Dosyalar → iPhone'umda"). Simge değil,
  noktalama.

## Regresyon koruması

`test/icons.test.mjs` şunları düşürür:

- `index.html` içinde bir düğmede emoji varsa
- yalnızca-simge bir düğmenin `aria-label`'ı yoksa
- etiketli bir düğme yazısını kaybetmişse
- HTML'deki bir SVG `icons.js`'teki çizimlerle eşleşmiyorsa
- JS'te üretilen bir düğmede ya da `textContent`/`innerHTML` atamasında resimsi
  bir emoji varsa
- `iconHtml` bilinmeyen bir ada sessizce boş döndürüyorsa (sessiz boşluk, tam da
  düzeltilen hatadır)

## Simge eklemek

`src/js/icons.js` → `ICON_PATHS` içine 24×24 kutuda, çizgi tabanlı bir çizim
ekleyin. Kullanım:

```js
import { iconHtml } from './icons.js';
el.innerHTML = iconHtml('home');              // yalnızca simge
el.innerHTML = iconHtml('save', 18) + '<span>Yedek Al</span>';  // simge + yazı
```

Yalnızca-simge düğmelere mutlaka `title` ve `aria-label` verin.
