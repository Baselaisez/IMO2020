# Yukarı akış 5.8'in birleştirilmesi

Android tarafı 5.8'e geldi. Bu sürüm, Mac/iPhone dalında 5.3.0 ile yapılanların
bir kısmını **bağımsız olarak** çözmüş (otomatik kayıt, WhatsApp damgası
temizleme, anlık görüntü seyreltme, dar bildirim sorgusu) ve üstüne üç yeni
özellik getirmiş.

## Neden "5.8'i olduğu gibi almadık"

Önce bunu denetledim. 5.8'in HTS içe aktarıcısında **benim düzeltmelerim yok**:

| Kontrol | 5.8'de |
|---|---|
| `TANI` sütununu tanıma | yok |
| `FİYAT` sütununu tanıma | yok |
| `TELEFON` sütununu tanıma | yok |
| `cellDates: true` ile okuma | yok |
| Excel ham gün sayısını tarihe çevirme | yok |
| Okunamayan tarihi komşudan devralma | yok |

5.8 olduğu gibi alınsaydı doktorun 53.096 satırlık defteri yine **15.727 kayda**
inerdi ve bütün tarihler kaybolurdu — yani az önce düzelttiğimiz hata geri
gelirdi. Bu yüzden yön tersine çevrildi: **bu depo taban kaldı, 5.8'in yeni
özellikleri buraya taşındı.**

## 5.8'den alınanlar

**1. Mükerrer hasta koruması** (`findDuplicatePatient` + "Bu hasta zaten
kayıtlı" paneli). Aynı ad TEK BAŞINA yeterli sayılmaz — ikinci bir kanıt aranır
(anne adı ya da doğum tarihi); telefon tek başına yeterlidir, çünkü aynı numara
aynı kişidir. Türkçe büyük/küçük harf farkı engel değil: SQLite'ın
`COLLATE NOCASE`'i "ALİ ŞAHİN" ile "Ali Şahin"i eşleştirmez, bu yüzden iki taraf
da aynı katlamadan geçiriliyor.

Uygulama kendi başına birleştirme ya da üzerine yazma **yapmaz**; doktora üç
seçenek sunar (mevcut kaydı aç / bu bilgilerle güncelle / yine de yeni kayıt).
İki farklı hastayı birleştirmek, mükerrer bir kayıttan çok daha kötü ve geri
dönüşü zor bir hatadır.

Otomatik kayıt da artık sessizce mükerrer kayıt açmıyor: aynı kişiyi bulursa
kayıt yapmıyor, mevcut kaydı da ezmiyor (form yarım yazılmış olabilir), sadece
formda sarı bir satırla haber veriyor.

**2. Çöp kayıt temizleme** (`🧹 Çöp Kayıtları Temizle`). Eski Excel aktarımından
kalan, **adında tek bir harf bile olmayan** (tırnak, virgül…) ve **hiç ödemesi
ya da teslimatı bulunmayan** kayıtları siler. Parayla ilişkili hiçbir kayda
dokunmaz. `İsimsiz — 12.03.2024` kayıtları bu kapsamda **değildir**: adlarında
harf var ve tarihi/tanısı olan gerçek ziyaretlerden geliyorlar.

**3. Son açılanlar şeridi.** 45.000 kayıtlık listede doktorun gün içinde döndüğü
birkaç hastaya tek dokunuşla ulaşması için. Yalnızca id listesi saklanıyor
(en çok 8); isimler her açılışta tazeleniyor, böylece adı değişen hasta eski
adıyla görünmüyor ve silinen hasta listede kalmıyor.

**4. Aylık özetin SQL tarafına taşınması** (`monthlyAggregates` +
`monthlySummaryFrom`). Ayarlar ekranı bunun için `allData()` çağırıyordu —
45.000 kayıtta 814 ms, üstelik her açılışta. Yeni yolun eskisiyle birebir aynı
sonucu verdiği testle sabitlendi.

## 5.8'de olup ALINMAYANLAR

5.8'in otomatik kaydı, WhatsApp damgası temizleme, anlık görüntü seyreltme ve
dar bildirim sorgusu bu depoda zaten vardı (5.3.0). İkinci bir uygulama
eklemek yerine mevcutları korundu; 5.8'in bunlara eklediği tek şey mükerrer
koruması idi, o da alındı.

5.8'in `db-electron.js`'i (eski Windows kabuğu, `nodeIntegration: true`)
alınmadı: bu depoda yerine `db-desktop.js` var ve pencere Electron'un güvenli
varsayılanlarıyla açılıyor.

## Doğrulama

119 test geçiyor (16'sı bu birleştirme için yeni). Gerçek Electron kabuğunda
11 kontrol: mükerrer paneli açıldı, vazgeçilince ikinci kayıt oluşmadı, farklı
hasta engellenmedi, son açılanlar şeridi doldu ve şeritten hastaya atlandı, çöp
temizleme sayıyı söyleyip onay istedi ve yalnızca çöpü sildi (gerçek hastalar
duruyor).
