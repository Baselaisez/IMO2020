# Samsung ile Apple cihazlar arasında eşitleme

Bu belge, Samsung telefondaki kayıtların iPhone ve Mac'e, oradakilerin de
Samsung'a nasıl ulaştığını anlatır. Adımları sırayla uygulayın.

## Önce: neden böyle kurmak zorundayız?

iPhone ile Mac arasındaki eşitleme **iCloud** üzerinden çalışıyor. Samsung
iCloud'u kullanamaz. Akla ilk gelen çözüm "Google Drive'ı kullanalım" oluyor
ama bu çalışmıyor; sebebi şu:

Mac'teki Google Drive ve OneDrive uygulamaları bir klasörü **gerçekten diske
indirir**, yani bilgisayardaki herhangi bir program o klasörü normal bir klasör
gibi okuyup yazabilir. Android'de böyle bir şey yok. Drive'ın Android
uygulaması dosyaları yalnızca bulutta tutar ve başka uygulamalara klasör
düzeyinde yazma iznini güvenilir biçimde vermez.

Bu yüzden Android tarafında klasörü **Syncthing** eşitliyor. Syncthing açık
kaynaklı ve ücretsizdir, hesap açmanızı istemez, bulut kullanmaz: iki cihaz
birbirine doğrudan bağlanır. **Hasta verisi muayenehaneden çıkmaz** — bu, bir
bulut hizmeti kullanmaya göre gizlilik açısından daha iyidir.

iPhone Syncthing'i kullanamaz, Samsung iCloud'u kullanamaz. İkisine birden
erişebilen tek cihaz Mac. Bu yüzden **Mac köprü** olarak çalışır:

```
  iPhone  ⇄  iCloud  ⇄  [ MAC ]  ⇄  Syncthing klasörü  ⇄  Samsung
```

Mac her eşitleme turunda **iki hedefe birden** yazar. Yani:

- iPhone'da girdiğiniz hasta → iCloud → Mac → Syncthing klasörü → Samsung
- Samsung'da girdiğiniz hasta → Syncthing klasörü → Mac → iCloud → iPhone

**Mac'in açık olması gerekir.** Mac kapalıyken Samsung ile iPhone birbirini
göremez; Mac açıldığında birikmiş kayıtlar iki yöne de akar.

## 1. Adım — ÖNCE YEDEK ALIN (bu adımı atlamayın)

> **Telefonda zaten eski bir Hasta Kayıt (v5.9) kuruluysa bu adım zorunludur.**
>
> Yeni sürüm eskisinin **üzerine kurulamaz**. Sebebi: Android, bir uygulamanın
> güncellenmesine ancak yeni dosya eskisiyle **aynı dijital anahtarla**
> imzalanmışsa izin verir. v5.9'u imzalayan anahtar kaybolmuş durumda
> (eski bir derleme ortamında üretilmiş ve orada kalmış), dolayısıyla yeniden
> üretilemiyor. Telefon yeni dosyayı reddeder:
> *"Uygulama yüklenemedi"* / `INSTALL_FAILED_UPDATE_INCOMPATIBLE`.
>
> Tek yol eski uygulamayı **kaldırmak**. Android bir uygulamayı kaldırırken
> **verisini de siler** — yani telefondaki hasta kayıtları gider. Bu yüzden
> önce yedek alacağız.

Samsung'da **eski** Hasta Kayıt uygulamasını açın:

1. **Ayarlar → Yedek Al (JSON)**
2. Çıkan dosyayı kaybolmayacak bir yere gönderin: WhatsApp'ta kendinize
   mesaj atmak en pratiği. E-posta ya da USB ile bilgisayara kopyalamak da olur.
3. Dosyanın gerçekten gittiğini **gözünüzle doğrulayın**. Bu dosya, telefondaki
   kayıtların tek kopyasıdır.

Sonra: **Ayarlar → Uygulamalar → Hasta Kayıt → Kaldır.**

Bundan sonraki sürümler sabit bir anahtarla imzalanacak; bu kaldırma-kurma
işlemi **bir kerelik**. 5.10.0'dan sonraki güncellemeler doğrudan üstüne
kurulacak ve kayıtlar yerinde kalacak.

## 2. Adım — Yeni uygulamayı kurun

Size verilen `HastaKayit-5.10.0.apk` dosyasını Samsung'a kopyalayın (USB kablo,
WhatsApp'tan kendinize gönderme ya da e-posta ile olur).

Telefonda dosyaya dokunun. "Bilinmeyen kaynaklardan uygulama yüklenemiyor"
uyarısı çıkarsa, çıkan ekrandan **bu kaynağa izin verin** ve kuruluma devam
edin. Bu, uygulama Play Store'dan değil elden kurulduğu için normaldir.

Kurulunca uygulamayı açın, PIN belirleyin, sonra:

**Ayarlar → İçe Aktar** → 1. adımda aldığınız yedek dosyasını seçin.

Hasta sayısının eskisiyle aynı olduğunu **kontrol edin**. Ana ekranda
"Toplam … hasta" yazar.

## 3. Adım — Dosya iznini verin (atlanırsa eşitleme çalışmaz)

Uygulamanın eşitleme dosyasını, Syncthing'in görebileceği ortak bir klasöre
yazması gerekiyor. Android 11'den beri bunun için ayrı bir izin isteniyor.

**Ayarlar → Uygulamalar → Hasta Kayıt → İzinler → Dosyalar ve medya →
Tüm dosyaları yönetmeye izin ver**

Bu izni vermezseniz uygulama çalışır ama eşitleme "yazma hatası" verir.
Kayıtlarınıza bir şey olmaz; sadece karşı cihaza geçmezler.

## 4. Adım — Syncthing'i kurun

**Samsung'a:** Play Store'dan "Syncthing" (geliştirici: Syncthing Foundation)
veya F-Droid'den kurun.

**Mac'e:** <https://syncthing.net/downloads/> adresinden macOS sürümünü indirin
ve kurun. Kurulunca tarayıcıda bir yönetim sayfası açılır.

## 5. Adım — İki cihazı eşleştirin

1. Samsung'da Syncthing'i açın → sağ üstteki menüden **Cihaz Kimliğini Göster**.
   Karşınıza bir QR kod ve uzun bir metin çıkar.
2. Mac'te Syncthing yönetim sayfasında **Uzak Cihaz Ekle** deyin ve Samsung'un
   kimliğini yapıştırın. Kaydedin.
3. Samsung'da "Bu cihaz sizi eklemek istiyor" bildirimi çıkar; **kabul edin**.

İki cihaz birbirini görünce Syncthing "Bağlandı" yazar.

## 6. Adım — Klasörü paylaşın

1. Samsung'da Syncthing → **Klasör Ekle**.
   - Klasör yolu olarak telefonun **Documents → HastaKayit** klasörünü seçin.
     (Uygulama kayıtları `Documents/HastaKayit/sync` altına yazar.)
   - Klasör kimliği (ID) olarak `hastakayit` yazın.
   - **Paylaşım** sekmesinden Mac'i işaretleyin.
2. Mac'te "Samsung sizinle bir klasör paylaşmak istiyor" bildirimi çıkar.
   **Kabul edin** ve Mac'te nereye ineceğini seçin, örneğin:
   `/Users/salihgedik/HastaKayit-Syncthing`

Artık bu klasör iki cihazda aynı.

## 7. Adım — Mac'e klasörü tanıtın

Mac'te Hasta Kayıt uygulamasını açın:

**Ayarlar → Eşitleme → Klasör Seç** → 6. adımda Mac'te oluşan klasörü seçin
(`/Users/salihgedik/HastaKayit-Syncthing`) → **Klasörü Kaydet**.

Ayarlar ekranındaki durum satırında **iki hedefin birden** yazdığını
görmelisiniz, şuna benzer:

```
Son eşitleme: 14:35 — /Users/salihgedik/HastaKayit-Syncthing + iCloud Drive > Hasta Kayıt
```

İki hedef birden görünüyorsa köprü kurulmuş demektir. Tek hedef görünüyorsa
6. veya 7. adımda bir şey eksiktir.

## 8. Adım — Deneyin

1. Samsung'da yeni bir hasta ekleyin (adını "DENEME" koyun).
2. Mac'te **Ayarlar → Eşitleme → Şimdi Eşitle**. Hasta Mac'te görünmeli.
3. Mac'te bir kez daha **Şimdi Eşitle** (bu tur kaydı iCloud'a yazar).
4. iPhone'da uygulamayı açıp kapatın. Hasta orada da görünmeli.
5. Tersini de deneyin: iPhone'da bir hasta ekleyip Samsung'da aradığınızda
   bulmalısınız (arada Mac'te iki kez eşitleme gerekir).

Denemeyi bitirince "DENEME" hastasını silin.

## Sık karşılaşılanlar

**"Kısmen eşitlendi" uyarısı çıkıyor.**
Hedeflerden biri yazılamadı. Genellikle Syncthing klasörü Mac'te bağlı
değildir ya da iCloud Drive kapalıdır. Uyarı hangi hedefin başarısız
olduğunu söyler. Kayıtlarınız kaybolmaz; sorun giderilince ilk turda geçer.

**Samsung'da "yazma hatası" veriyor.**
3. adımdaki "tüm dosyaları yönetme" izni verilmemiştir.

**Kayıtlar Samsung'a geç geliyor.**
Normaldir. Mac'in iki tur atması gerekir (biri iCloud, biri Syncthing) ve
100 binin üzerinde kayıtta bir tur birkaç saniye sürer. Uygulama kendini
ayarlar: büyük defterde kayıt sonrası eşitlemeyi otomatik olarak geciktirir ki
hasta girerken arayüz donmasın. Beklemek istemezseniz **Şimdi Eşitle** deyin.

**Mac kapalıyken Samsung ile iPhone birbirini görmüyor.**
Beklenen davranış. Köprü Mac'tir; açıldığında ikisi de güncellenir.

**İki cihazda aynı anda kayıt girdik.**
İkisi de korunur. Aynı hastanın aynı alanı iki cihazda farklı değiştirildiyse
en son yapılan değişiklik kazanır. Silinen kayıtlar geri gelmez.

## Elle taşıma (Syncthing kurmak istemezseniz)

Syncthing'siz de çalışabilirsiniz, ama kendiliğinden olmaz:

- Samsung'da **Ayarlar → Yedek Al (JSON)** → dosyayı WhatsApp/e-posta ile
  gönderin → Mac'te **Ayarlar → İçe Aktar**.
- Ters yön için aynısını Mac'te yapın.

Bu yöntemde aynı anda iki cihazda kayıt girmemeye dikkat edin.
