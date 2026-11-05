# İki iPhone'a kurulum — TestFlight (kablosuz)

Kabloyla tek telefona kurmak için [IPHONE-ADIM-ADIM.md](IPHONE-ADIM-ADIM.md).
Bu dosya **iki telefona birden, kablosuz** kurulum içindir ve ücretli Apple
Developer Program üyeliği gerektirir.

Bu bir **kayıt**tır: her adım sırayla yazılı, böylece ileride tekrar
yapabilirsiniz.

---

## ADIM 0a — Proje klasörünü bulun

Klasörün nerede olduğunu **tahmin etmeyin**; bu komut bulup içine girer ve
bulduğu yeri yazar:

```bash
cd "$(find ~ -maxdepth 6 -type d -name HastaKayit -not -path '*/node_modules/*' 2>/dev/null | head -1)" && pwd && git remote -v | head -1
```

Çıktıda klasörün tam yolu ve `origin https://github.com/Baselaisez/IMO2020`
satırı görünmeli.

**`fatal: not a git repository` yazıyorsa** klasör GitHub'dan **ZIP olarak
indirilmiş** demektir (adı `IMO2020-claude-...` gibi görünür). ZIP kopyasında
`git pull` ÇALIŞMAZ — içinde sürüm geçmişi yoktur. Bir kez düzgün kopya alın;
sonrasında her güncelleme tek komut olur:

```bash
cd ~/Desktop
git clone -b claude/iphone-mac-app-versions-9sq20o https://github.com/Baselaisez/IMO2020.git HastaKayitApp
cd ~/Desktop/HastaKayitApp/HastaKayit
```

Depo ~16 MB; birkaç saniye sürer. Herkese açık olduğu için şifre sorulmaz.
Eski ZIP klasörünü, yenisi çalıştığını gördükten **sonra** çöpe atın (içinde
hasta verisi yoktur; veriler `~/Library/Application Support/HastaKayit/`
klasöründedir ve bu işlemlerden etkilenmez).

Hiçbir şey yazmazsa klasör bu Mac'te hiç yok demektir — yukarıdaki `git clone`
komutunu çalıştırın.

**Bundan sonraki bütün komutlar bu klasörün içinde çalışır.** Terminal'i
kapatırsanız bu adımı tekrarlayın.

## ADIM 0b — Xcode'u güncellemeye gerek var mı?

Güncelleme 10+ GB indirme ve saatler sürebilir. **Önce gerekip gerekmediğine
bakın**, boşuna beklemeyin:

```bash
npm run ios:check
```

Çıktıda `Xcode 16.4` gibi bir satır görürsünüz.

| Durum | Ne yapmalı |
|---|---|
| Xcode 15 veya üstü | **Güncelleme gerekmez.** Proje bununla derlenir. |
| Xcode 15'ten eski | Güncelleyin (aşağıda). |

> Ayrıca: App Store Connect'e yükleme yaparken Apple, yapının yeterince yeni bir
> iOS SDK ile üretilmiş olmasını ister. Bu şart zamanla yükselir. Eğer yükleme
> adımında SDK yetersizliği hatası alırsanız, hata mesajı **hangi Xcode
> sürümünün gerektiğini yazar** — ancak o zaman güncelleyin.

**Güncelleme:** App Store uygulaması → arama kutusuna `Xcode` → **Güncelle**.
Bittiğinde Terminal'de bir kez:

```bash
sudo xcodebuild -license accept
```

---

## ADIM 1 — Mac'teki kodu güncelleyin

Xcode'da **Team** seçtiğinizde Xcode proje dosyasına kendi satırını yazar. Bu
yüzden düz `git pull` çakışabilir. Güvenli sıra:

ADIM 0a'daki klasörde olduğunuzdan emin olun (`pwd` ile görebilirsiniz), sonra
komutları **tek tek** çalıştırın — hepsini birden yapıştırırsanız ilki
başarısız olsa bile diğerleri yanlış klasörde çalışır:

```bash
git stash
git pull origin claude/iphone-mac-app-versions-9sq20o
npm install
npm run ios
```

- `git stash` yerel değişikliği (Team seçimi) kenara alır. Kaybolmaz; zaten
  Xcode'da iki saniyede yeniden seçilir.
- `npm install` **şarttır**: iCloud eklentisi bu adımda bağlanır.
- `npm run ios` derler, iOS'a kopyalar, ortam denetimini çalıştırır ve Xcode'u
  açar.

**Doğrulama:** Xcode açılınca sol alttaki **Package Dependencies** listesinde
**HastakayitIcloud** görünmeli. Görünmüyorsa `npm install` çalışmamıştır.

---

## ADIM 2 — Team'i yeniden seçin, iCloud'u doğrulayın

Sol panelde mavi **App** → **TARGETS ▸ App** → **Signing & Capabilities**.

1. **Team** → `Salih Gedik` (yanında *(Personal Team)* yazmayan).
2. Artık listede **iCloud** adlı yeni bir bölüm olmalı; içinde
   **iCloud Documents** işaretli ve kap adı `iCloud.com.hastakayit.app`.

Xcode bu kabı Apple hesabınıza **kendisi kaydeder**; sizin bir şey yapmanız
gerekmez. Kırmızı hata çıkarsa ekran görüntüsü alın.

> Ücretsiz hesapta (*Personal Team*) iCloud yetkisi verilmez. Sizde ücretli
> üyelik var, sorun olmamalı.

---

## ADIM 3 — App Store Connect'te uygulama kaydı

Tarayıcıda **appstoreconnect.apple.com** → **Apps** → sol üstte **+** →
**New App**:

| Alan | Değer |
|---|---|
| Platforms | ☑️ iOS |
| Name | `Hasta Kayıt` |
| Primary Language | Turkish (Türkçe) |
| Bundle ID | listeden `com.hastakayit.app` |
| SKU | `hastakayit01` |
| User Access | Full Access |

**Takılma noktaları**

- *Bundle ID listede yok* → Xcode'da Team'i seçtiğinizde kaydedilir. Team'i
  seçip sayfayı yenileyin.
- *"The name you entered is already being used"* → o ad App Store'da alınmış.
  `Hasta Kayıt Takip` gibi bir varyant yazın. Bu sadece mağaza adıdır;
  telefonda ikonun altında yine **Hasta Kayıt** yazar.

---

## ADIM 4 — Arşivleyin ve yükleyin

1. Üst ortadaki cihaz seçicide **Any iOS Device (arm64)** seçili olsun.
   *(Simulator seçiliyken Archive menüsü gri kalır — en sık yapılan hata budur.)*
2. Menü: **Product ▸ Archive** (3–8 dakika).
3. Açılan pencerede **Distribute App ▸ TestFlight & App Store ▸ Distribute**.
4. İmzalamayı Xcode halleder. **Upload** deyip bitirin.

Yükleme bitince App Store Connect → **TestFlight** sekmesinde yapı
*Processing* görünür; **10–30 dakika** sürer.

> İhracat/şifreleme sorusu sorulmaz: `ITSAppUsesNonExemptEncryption = false`
> zaten `Info.plist` içinde.

---

## ADIM 5 — İki telefonu test kullanıcısı yapın

1. App Store Connect → **Users and Access** → **+** → iki telefonun **Apple
   Kimliği e-postasını** ekleyin (Role: **Developer** yeterli).
   Her birine davet e-postası gider; **kabul etmeleri gerekir**.
2. **TestFlight** sekmesi → **Internal Testing** → **+** ile grup oluşturun →
   o iki kişiyi ekleyin → işlenmiş yapıyı gruba atayın.
3. Telefonlarda: App Store'dan **TestFlight** uygulamasını indirip **aynı Apple
   Kimliğiyle** açsınlar. **Hasta Kayıt** orada görünür → **Install**.

> **Internal Testing** seçin, External değil. Internal'da Apple incelemesi yok,
> yapı birkaç dakikada hazır. External'da bir günlük inceleme var ve gerekmiyor.

---

## ADIM 6 — Hasta kayıtları telefonlara nasıl gelir?

Kurulum **hiçbir kaydı silmez ve taşımaz**. Yeni kurulan uygulama boş başlar;
kayıtlar telefona **iCloud eşitlemesiyle** gelir.

**Önce yedek alın** (her ihtimale karşı, 1 dakika):
Mac'te uygulama → **Ayarlar & Yedekleme** → **Yedek Al (JSON)** → dosyayı
masaüstüne kaydedin.

Sonra:

1. Mac'te ve iki telefonda **aynı Apple Kimliği** ile giriş yapılmış olsun.
2. Telefonlarda **Ayarlar → (adınız) → iCloud → iCloud Drive** açık olsun.
3. Telefonda uygulamayı bir kez açıp PIN kurun. Eşitleme kendiliğinden açıktır.
4. Mac'te uygulamayı açın; birkaç saniye içinde yüklemeye başlar.

**Ne kadar sürer:** doktorun verisi 100.000'den fazla kayıt, eşitleme dosyası
yaklaşık **40 MB**. İlk tur Mac'ten yükleme + telefona indirme demek; iyi bir
Wi-Fi'da birkaç dakika. **İlk eşitlemeyi Wi-Fi'da yapın**, mobil veride değil.

Telefonda da benzer büyüklükte bir veritabanı oluşur — bu normaldir.

Ayrıntı ve sınırlar: [ICLOUD-ESITLEME.md](ICLOUD-ESITLEME.md)

### Mac'teki veriye bir şey olur mu?

Hayır. Mac'in veritabanı şurada durur ve bu adımların hiçbiri ona dokunmaz:

```
~/Library/Application Support/HastaKayit/hastakayit.sqlite
```

Eşitleme yalnızca **birleştirir**, silmez: bir cihazda olmayan kayıt diğerinden
gelir, iki cihazda da düzenlenmişse en son yazılan kazanır. Silinen bir kayıt
geri dirilmez.

---

## Sonraki güncellemeler

Aynı sürüm numarasıyla ikinci kez yükleme yapılamaz. Her yüklemeden önce:

Xcode → **App target ▸ General ▸ Build** sayısını bir artırın (1 → 2 → 3…).
Sonra yine **Product ▸ Archive ▸ Distribute**.

Kod güncellemesi için her seferinde ADIM 1'i tekrarlayın.

---

## Sık karşılaşılan hatalar ve çözümleri

### "Application failed to launch: UIScene life cycle is required"

Uygulama telefona kuruluyor ama **açılır açılmaz çöküyor**. iOS 27 SDK ile
derlenen uygulamalarda UIScene yaşam döngüsü zorunlu. Düzeltme 5.9.1'de hazır:

```bash
git pull
```

`npm run ios:check` çıktısında şunu görmelisiniz:
`✅ UIScene yaşam döngüsü tamam (iOS 27 SDK şartı)`

### iCloud ile ilgili imzalama hatası

Signing & Capabilities'te iCloud bölümünde kırmızı yazı çıkarsa (kap
oluşturulamadı, yetki verilemedi vb.), **önce uygulamayı kurun, iCloud'u sonra
açın** — eşitleme olmadan da uygulama tam çalışır, veriler cihazda durur.

1. Signing & Capabilities → **iCloud** bölümünün sağındaki **çöp kutusu**
   simgesine basın (yetkiyi geçici kaldırır).
2. **▶** ile kurun, çalıştığını görün.
3. Geri almak için Terminal'de:
   ```bash
   git checkout -- ios/App/App/App.entitlements
   ```
   ve Xcode'da **+ Capability → iCloud → iCloud Documents** ile yeniden ekleyin.

Hatanın metnini not edin; çoğu zaman Apple hesabında kap oluşturma izninin
henüz işlenmemiş olmasından kaynaklanır ve bir süre sonra kendiliğinden geçer.

### Telefon cihaz listesinde görünmüyor

Kabloyu çıkarıp takın → telefonda **"Bu bilgisayara güvenilsin mi?"** → Güven.
Sonra telefonda: Ayarlar → Gizlilik ve Güvenlik → **Geliştirici Modu** → Açık
(telefon yeniden başlar).

### "Untrusted Developer" / uygulama açılmıyor

Telefonda: Ayarlar → Genel → **VPN ve Cihaz Yönetimi** → Apple Kimliğiniz →
**Güven**.

### Sarı ⚠️ uyarılar

Normaldir, engellemez. Yalnızca **kırmızı** olanlar derlemeyi durdurur.

## Bir yerde takılırsanız

Ekran görüntüsü alın ve hangi adımda olduğunuzu yazın. En çok ADIM 2 (imzalama)
ve ADIM 4 (arşiv) sorun çıkarır; hata metni genelde tek satırda sebebi söyler.
