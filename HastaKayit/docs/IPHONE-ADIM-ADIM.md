# iPhone'a kurulum — adım adım

Xcode bilmeyenler için. Her adımı sırayla yapın, atlamayın.

Gerekenler: iPhone, telefonu Mac'e bağlayan kablo, bir Apple Kimliği
(ücretsiz olan yeterli).

---

## ADIM 1 — Terminal'de hazırlık

**Terminal**'i açın (⌘ + Boşluk → `Terminal` yazın → Enter).

Aşağıdaki satırları **tek tek** yapıştırın, her birinden sonra Enter'a basın ve
bitmesini bekleyin. Bir satır bitmeden diğerine geçmeyin.

```bash
cd ~/Desktop/IMO2020
```
```bash
git pull
```
```bash
cd HastaKayit
```
```bash
rm -rf node_modules
```
```bash
npm install
```
> Bu 2-3 dakika sürer. Sarı `warn` yazıları normaldir, hata değildir.

```bash
npm run ios:reset
```
> Bu da birkaç dakika sürer. Sonunda `✅ capacitor-swift-pm 8.0.0 çözümlendi.`
> yazmalı.

```bash
npm run ios
```
> Xcode kendiliğinden açılır. Terminal'i kapatmayın, kenara alın.

---

## ADIM 2 — Telefonu bağlayın

1. iPhone'u kabloyla Mac'e takın.
2. Telefonda **"Bu bilgisayara güvenilsin mi?"** çıkar → **Güven**'e basın.
3. Telefonun şifresini girin.

---

## ADIM 3 — Telefonda Geliştirici Modu'nu açın

Bu adım **zorunludur**. Yapılmazsa uygulama telefona kurulmaz.

Telefonda:

1. **Ayarlar**
2. **Gizlilik ve Güvenlik**
3. En alta kaydırın → **Geliştirici Modu**
4. Anahtarı **açın**
5. Telefon yeniden başlamak isteyecek → **Yeniden Başlat**
6. Telefon açılınca ekranda **"Geliştirici Modunu Aç"** çıkar → **Aç** → şifrenizi girin

> **"Geliştirici Modu" seçeneğini göremiyorsanız:** telefon Mac'e bağlıyken
> ADIM 6'yı bir kez deneyin (▶ düğmesi). Xcode bir kez denedikten sonra bu
> seçenek Ayarlar'da belirir. Sonra buraya dönüp açın.

---

## ADIM 4 — Xcode penceresini tanıyın

Xcode açıldığında ekranda şunlar var:

- **Sol üstte** ▶ (başlat) ve ■ (durdur) düğmeleri
- **Üst ortada** `App  >  iPhone` yazan bir bölüm → burası **cihaz seçici**
- **Solda** uzun bir dosya listesi
- **Sağda** kod

Şimdilik hiçbir şeye dokunmayın.

---

## ADIM 5 — Apple Kimliğinizi tanıtın (yalnızca ilk seferde)

1. **Sol panelde en üstteki mavi ikonlu `App`** yazısına tıklayın.
   (En üstte, listenin ilk satırı.)
2. Ortada bir bölüm açılır. Orada **TARGETS** başlığının altındaki **`App`**'e tıklayın.
3. Üstteki sekmelerden **`Signing & Capabilities`**'e tıklayın.
4. **`Automatically manage signing`** kutusu **işaretli** olmalı. Değilse işaretleyin.
5. **`Team`** yazan satırdaki açılır menüye tıklayın:
   - Listede adınız varsa (örn. **`Salih Gedik (Personal Team)`**) onu seçin.
   - Liste boşsa **`Add Account…`** düğmesine basın → Apple Kimliğiniz ve
     şifrenizle giriş yapın → pencereyi kapatın → tekrar **Team** menüsünden
     adınızı seçin.
6. Altta kırmızı bir hata kalmamalı.

> **`Failed to register bundle identifier` hatası çıkarsa:** hemen üstteki
> **`Bundle Identifier`** kutusundaki yazıyı silip şunu yazın:
> `com.salihgedik.hastakayit`
> (Başka bir şey değiştirmeyin.)

---

## ADIM 6 — Telefonu seçin ve çalıştırın

1. **Üst ortadaki** `App  >  iPhone` bölümünde, **sağdaki** kısma tıklayın.
2. Açılan listede **kendi telefonunuzun adını** seçin
   (genelde "iPhone" ya da "Salih'in iPhone'u" gibi).
3. Klavyeden **Shift + ⌘ + K** tuşlarına basın. (Temizlik — birkaç saniye sürer.)
4. **Sol üstteki ▶ düğmesine** basın.

Şimdi bekleyin. Üstte "Building..." yazar, **ilk derleme 5-10 dakika sürebilir.**
Bilgisayar yavaşlayabilir, normaldir. Sonunda **"Build Succeeded"** yazmalı ve
uygulama telefonda kendiliğinden açılmalı.

---

## ADIM 7 — Telefonda "güvenilmeyen geliştirici" uyarısı

Uygulama açılmayıp **"Untrusted Developer" / "Güvenilmeyen Geliştirici"**
derse:

1. Telefonda **Ayarlar**
2. **Genel**
3. **VPN ve Aygıt Yönetimi**
4. **Apple Development: (e-posta adresiniz)** satırına dokunun
5. **Güven**'e basın

Sonra uygulamayı ana ekrandan normal şekilde açın.

---

## ADIM 8 — Uygulamayı ilk açış

1. **PIN belirleyin** (4-6 rakam). Bu PIN'i unutmayın — veriler ona bağlı.
2. **Face ID** sorarsa izin verin.
3. **Bildirim izni** sorarsa **İzin Ver**'e basın (randevu hatırlatmaları için).

Hazır.

---

## ÖNEMLİ — 7 gün kuralı

Ücretsiz Apple hesabıyla kurulan uygulama **7 gün sonra açılmaz olur**. O zaman
telefonu tekrar Mac'e bağlayıp **ADIM 6**'yı (▶ düğmesi) tekrarlamanız gerekir.
Verileriniz silinmez.

Bundan kurtulmak için yılda ~99 $'lık **Apple Developer Program** üyeliği
gerekir; onunla uygulama bir yıl çalışır.

---

## Bir yerde takılırsanız

Terminal'de şunu çalıştırın:

```bash
npm run ios:build
```

Ekrana çıkan yazının tamamını kopyalayıp gönderin. Hatanın ne olduğu orada
yazar.
