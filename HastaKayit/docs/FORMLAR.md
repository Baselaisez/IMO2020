# Hasta formları (PDF ve Word)

Ayarlar ekranındaki **📄 Boş Form (PDF)** ve **📝 Boş Form (Word)** düğmeleri,
hastaya gönderilecek "Danışan Kayıt Formu"nu üretir. Hasta doldurup geri
gönderir; **📥 İçe Aktar** ile dosya okunup hasta kaydına dönüşür.

Alanlar: İsim Soyisim, Anne Adı, Doğum Tarihi, İkametgah, Telefon,
Şikayet / Hastalık + vesikalık fotoğraf alanı.

## Punto

Danışanlar yaşlı olduğu için formda hiçbir şey küçük değil. İki dosya da aynı
puntoları kullanır ki tek belge gibi dursun:

| | PDF | Word |
|---|---|---|
| Başlık | 24 pt | 24 pt |
| Alan etiketi | 16 pt | 16 pt |
| Hastanın yazdığı metin | 16 pt | 16 pt |
| Açıklama satırı | 14 pt | 14 pt |

Word sürümünde satır yükseklikleri de büyütüldü (~1,8 cm; şikayet alanı
~3,7 cm) — elle doldurulduğunda yazacak yer kalsın diye.

## PDF neden kendi yazı tipini taşıyor

pdf-lib'in yerleşik yazı tipi (Helvetica/WinAnsi) **ş, ğ, ı, İ harflerini
kodlayamaz**. Eskiden bu yüzden etiketler ASCII'ye katlanıyordu: hastanın eline
"Danisan Kayit Formu", "Isim Soyisim", "Sikayet" yazan bir form gidiyordu.
Daha kötüsü, alanların varsayılan görünümü de Helvetica'yı gösterdiği için
hasta "Ayşe" yazdığında harf çizilemiyordu.

Artık forma indirgenmiş bir Unicode yazı tipi gömülü: **Liberation Sans**,
SIL OFL 1.1, yalnızca gereken harflerle **~17 KB** (tam hâli 401 KB).
Yeniden üretmek için: `python3 resources/make-pdf-font.py`.

İki incelik, ikisi de sessiz bozulma kaynağıydı:

- **NeedAppearances açık.** Bu bayrak olmadan Önizleme (Preview) ve bazı telefon
  okuyucularında hasta yazar ama ekranda hiçbir şey görünmez.
- **`save({ updateFieldAppearances: false })`.** pdf-lib'in varsayılan kaydı,
  alan görünümlerini yeniden üretirken yazı tipini Helvetica'ya geri yazıyor ve
  yukarıdaki düzeltmeyi ezip geçiyordu.

## Doğrulama

`npm test` içindeki `test/forms.test.mjs` dosyası **üretilen dosyanın kendisini**
sınar, kodu değil:

- altı alan da var, hiçbiri salt-okunur değil, şikayet alanı çok satırlı
- NeedAppearances açık
- her alanın yazı tipi LiberationSans (Helvetica değil) — bu, yukarıdaki
  `save()` hatasının regresyon testidir
- her alan A4 sayfasının içinde kalıyor (punto büyütülünce test önce kırılır)
- "Ayşe Işıl Yılmaz", "İstanbul, Şişli" gibi Türkçe değerler yazılıp geri
  okunuyor; doğum tarihi veritabanı biçimine çevriliyor
- Word formu da doldurulup geri okunuyor
- bozuk/PDF olmayan dosya çökertmiyor, boş sonuç veriyor
