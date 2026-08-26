# Eski defterin (HTS Excel) içe aktarılması

Doktorun 53.096 satırlık `HTS.xlsx` defteri içe aktarıldığında uygulamaya
yalnızca **15.727** kayıt girdi. Kayıp sessizdi: ekranda hiçbir uyarı çıkmadı.
Bu belge nedenini ve düzeltmeyi anlatır.

## Ne olmuştu

Beş ayrı sebep üst üste binmişti.

**1. Dosya "HTS defteri" olarak tanınmadı.**
Tanıma kuralı üç sütunun hepsini arıyordu: bir isim sütunu **+ `DURUM` + `TL`
veya `MISIR`**. 2026 dosyası bu alanları başka adlarla tutuyor:

```
ADI SOYADI | ANNE ADI | DOĞUM TARİHİ | İKAMET | TANI | FİYAT | TARİH | TELEFON
```

`TANI` ve `FİYAT` tanınmadığı için dosya HTS sayılmadı ve **genel** Excel
içe aktarıcısına düştü.

**2. Genel içe aktarıcı `TARİH` ve `FİYAT` sütunlarını attı.**
"Eşleşmeyen sütunlar" diye geçiştirdi. Yani her hastanın gerçek başlangıç
tarihi ve her ödeme kayboldu; 53.096 satırın tamamı "bugün başlamış" oldu.

**3. `İSİM SOYİSİM` gerçek bir ad sanıldı.**
Defterin 2006–2016 arası **28.965 satırında** ad hiç yazılmamış; ad sütununda
yer tutucu olarak `İSİM SOYİSİM` yazıyor. Genel içe aktarıcı bunu bir kişi adı
kabul edip **hepsini tek hastada** birleştirdi — 28.965 ziyaret kaydı bir tek
satıra indi.

**4. Kalan 17.199 isimli satır ad+anne adına göre teklendi** → 15.726 kişi.
15.726 + 1 (yer tutucu) = **15.727**. Kullanıcının gördüğü sayı buydu.

**5. Tarihler zaten okunamıyordu.**
Uygulama defterleri `XLSX.read(buf, { type: 'array' })` ile okuyordu —
`cellDates` kapalı. O modda her tarih hücresi ham bir **sayı** olarak gelir
(`45524`), `instanceof Date` kontrolünden geçemez. Yani dosya HTS olarak
tanınsaydı bile tek bir tarih okunamayacaktı.

## Düzeltme

| Konu | Önce | Sonra |
|---|---|---|
| Tanıma | isim + `DURUM` + `TL/MISIR` (hepsi şart) | `ÖN KAYIT` sayfası + isim + yardımcı sütunlardan biri |
| Sütun adları | tek şema | `TANI`/`DURUM`, `FİYAT`/`TL`/`MISIR`/`ÜCRET`, `TELEFON`/`İLETİŞİM`, `İKAMET`, `DOĞUM TARİHİ` |
| Tarih hücresi | yalnız `Date` | `Date` **veya** Excel gün sayısı; `cellDates: true` de eklendi |
| Okunamayan tarih | bugüne yazılıyordu (13.937 satır) | defter kronolojik olduğu için bir önceki tarih devralınır |
| Saçma yıllar | kabul ediliyordu (4725, 7113 — 588 satır) | reddedilir, önceki tarih devralınır |
| `İSİM SOYİSİM` | gerçek ad sanılıyordu | yer tutucu; her satır kendi anonim kaydı olur |
| İkametgah / telefon / yaş | hiç yazılmıyordu | yazılıyor (`bulkImport`'a `residence`, `birth_date`, `notes` eklendi) |
| Yaş sütunu | doğum tarihi sanılıyordu | yaş ayrı tanınır, nota yazılır (`Yaş: 37`) |
| Aynı kişiyi birleştirme | yalnız ad + anne adı | ad + anne adı **veya** ad + telefon |
| Boş satır | "İsimsiz — …" hastası oluyordu | atlanır |
| Kullanıcıya bilgi | yalnız toplam sayı | ne okundu, ne atlandı, ne tahmin edildi — önizlemede |

## Sonuç (aynı dosya, ölçülmüş)

| | Önce | Sonra |
|---|---|---|
| Hasta kaydı | 15.727 | **44.929** |
| Gerçek tarihli | 0 | 32.321 satır (kalanı komşu tarihi devralır) |
| Başlangıç yılı aralığı | hepsi bugün | 2006 → 2026 |
| Telefonu kaydedilen | 0 | 5.009 |
| İkametgahı kaydedilen | 0 | 90 |
| Yaşı kaydedilen | 0 | 228 |
| Ödeme | 0 | 15 |
| Teslimat | 482 | 482 |
| Atlanan boş satır | — | 6.833 (bildiriliyor) |

## Tasarım kararları

**Anonim satırlar neden ayrı kayıt?** 2006–2016 satırlarının her biri gerçek
bir ziyarettir: kendi tarihi ve kendi şikayeti var. Hepsini tek kayıtta
toplamak 28.965 ziyareti yok etmek olurdu. Her biri `İsimsiz — 27.11.2013`
gibi, tarihiyle adlandırılmış ayrı bir kayıt olur.

**Aynı ad neden otomatik birleşmiyor?** "AYŞE YILMAZ" defterde birden fazla
kişi olabilir. Birleştirme için ikinci bir kanıt aranır: **anne adı** ya da
**telefon**. İkisi de yoksa satırlar ayrı durur — yanlış birleştirmek, ayrı
durmaktan daha kötüdür (iki hastanın geçmişi birbirine karışır).

**Okunamayan tarih neden komşudan devralınıyor?** Defter kronolojik: satırlar
en eskiden en yeniye sıralı ve bu dosyada 2006'dan 2026'ya kesintisiz artıyor.
Bir satırın tarihi okunamıyorsa (Excel'in 1899 "sadece saat" hücreleri, elle
yazılmış metinler) komşusunun tarihi doğruya en yakın tahmindir. Tahmin
gizlenmiyor: hücrenin ham metni tanıya `[tarih: perşembe]` olarak ekleniyor ve
kaç satırda böyle yapıldığı önizlemede yazıyor.

**Yaş neden doğum tarihine yazılmıyor?** `DOĞUM TARİHİ` sütununda çoğunlukla
`13`, `37`, `52"` gibi **yaşlar** var. Yaşı doğum tarihi diye kaydetmek veriyi
bozar; yaş nota (`Yaş: 37 (26.08.2026)`) yazılır, gerçek bir tarih varsa
`birth_date`'e gider.

## Önizleme artık ne diyor

İçe aktarmadan önce açılan onay ekranında "Dosya nasıl okundu?" başlığı altında
kaç satır okunduğu, kaç boş satırın atlandığı, kaç satırın birleştirildiği, kaç
tarihin tahmin edildiği ve **okunmayan sütun kaldıysa hangileri** yazıyor.
Sessiz kayıp bir daha olmasın diye.
