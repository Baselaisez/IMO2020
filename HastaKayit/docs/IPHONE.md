# iPhone (iOS) sürümü

## Ne gerekiyor

- **macOS** ve **Xcode 15+** (iOS projesi yalnızca Mac'te derlenir)
- Ücretsiz bir Apple hesabı → yalnızca kendi cihazınıza kurmak için yeterli
  (uygulama 7 günde bir yeniden kurulmalı)
- Apple Developer Program üyeliği (yıllık) → TestFlight ve App Store için

Xcode'un komut satırı araçları kuruluysa CocoaPods'a **gerek yok**: proje
Swift Package Manager kullanıyor, bağımlılıklar Xcode açılınca kendiliğinden
çözülür.

> **Xcode'a hiç aşina değilseniz:** ekran ekran, tıklama tıklama anlatan
> [IPHONE-ADIM-ADIM.md](IPHONE-ADIM-ADIM.md) dosyasını okuyun. Bu dosya
> arka plandaki teknik ayrıntıları anlatır.

## Önce ortam denetimi

```bash
npm run ios:check
```

Xcode kaynaklı hatalar Xcode'un içinde anlaşılmaz görünür ("Command
CompileSwiftSources failed"), oysa sebep hemen her zaman şu üçünden biridir:
`xcode-select` hâlâ Command Line Tools'u gösteriyordur, Xcode lisansı kabul
edilmemiştir, ya da `npm install` çalıştırılmamıştır. Denetim bunları saniyeler
içinde bulur ve düzeltme komutunu aynen yazar. `npm run ios` bu denetimi
kendiliğinden çağırır.

## Çalıştırma

```bash
cd HastaKayit
npm install
npm run ios
```

`npm run ios` sırayla şunları yapar: ortam denetimi → `www/` derlenir →
`npx cap sync ios` ile `ios/App/App/public` altına kopyalanır → Xcode açılır.

### En hızlı yol: Simülatör

Apple Developer üyeliği, hatta iPhone bile gerekmez. Xcode açıldıktan sonra üst
ortadaki cihaz seçiciden bir **iPhone simülatörü** seçip ▶ (⌘R) demeniz yeterli;
imzalama için ekip seçmeye gerek yoktur. Simülatörde çalışmayan tek şey
Face ID'nin gerçek donanımıdır — onu da menüden **Features ▸ Face ID ▸
Enrolled** seçip **Matching Face** ile taklit edebilirsiniz.

Gerçek cihaza kurmak için aşağıdaki imzalama adımı gerekir.

Xcode'da:

1. Sol panelden **App** hedefini seçin → **Signing & Capabilities**
2. **Team**: kendi Apple hesabınızı seçin
3. **Bundle Identifier**: `com.hastakayit.app` sizde çakışırsa değiştirin
   (örn. `com.adsoyad.hastakayit`) — değiştirirseniz `capacitor.config.json`
   içindeki `appId` ile aynı olmasına gerek yoktur, yalnızca Xcode'daki değer
   geçerlidir.
4. Üstten cihazınızı seçip **Run** (⌘R)

Kodda bir değişiklik yaptıktan sonra Xcode'u kapatmanıza gerek yok; `npm run
sync` yeterlidir, ardından Xcode'da tekrar **Run**.

## Sık karşılaşılan iki hata

### Capacitor sürümü neden 8.0.0?

Uygulama Capacitor **8.0.0**'a sabitlenmiştir; en güncel 8.5.0'a değil. Sebep
eklenti ekosistemidir: `@capacitor-community/sqlite` (8.1.0 dahil, en güncel
sürüm) Capacitor'ı bir sürümle değil, bir DALLA ister —
`branch: "8.0.0"` — ve diğer tüm eklentiler `from: "8.0.0"` der. Yani hepsi
8.0.0'ı hedefliyor.

8.5.0'a zorlamak iki sorun doğuruyordu:

1. Swift Package Manager'da dal gereksinimi sürüm gereksinimlerini ezdiği için
   çözümleme öngörülemez hâle geliyordu.
2. Capacitor CLI 8.5.0'ın ürettiği `SceneDelegate.swift`, 8.0.0 çerçevesinde
   bulunmayan `SceneDelegateProxy` sınıfını kullanıyor →
   *Cannot find 'SceneDelegateProxy' in scope*.

CLI 8.0.0 `SceneDelegate.swift` üretmez (yalnızca `AppDelegate.swift`), bu
yüzden o hata yapısal olarak ortadan kalkar. `postinstall` kancası ayrıca
sqlite'ın dal sabitlemesini `from:` yapar (bkz. `scripts/patch-capacitor-spm.mjs`)
ki grafikteki tüm gereksinimler aynı türden olsun ve kökteki `exact: "8.0.0"`
net biçimde uygulansın.

Capacitor'ı yükseltmek isterseniz önce sqlite eklentisinin dal sabitlemesini
bırakmasını bekleyin.

## Sık karşılaşılan hatalar

### Derleme hatalarını metin olarak görmek

```bash
npm run ios:build
```

Simülatör hedefiyle derler (imzalama gerekmez) ve `error:` satırlarını
benzersizleştirip tekrar sayılarıyla yazar; tam günlük `ios/build.log`
dosyasına kaydedilir. Xcode'un sorun panelinde 38 satır görmek, aslında 2
farklı sebebin 38 tekrarı olabilir.

### Paket çözümlemesi takılırsa

```bash
npm run ios:reset
```

Pinleri ve bu projeye ait önbellekleri atıp yeniden çözümler, sonunda hangi
sürümün çözüldüğünü yazar.

### "Signing for 'App' requires a development team"

Xcode'a henüz Apple Kimliği eklenmemiş. **Add Account…** ile giriş yapın
(ücretsiz hesap yeterli), sonra **Team** listesinden "… (Personal Team)" seçin.
Ardından "Failed to register bundle identifier" gelirse `com.hastakayit.app`
başkasına ait demektir; **Bundle Identifier**'ı kendinize özgü bir değerle
(örn. `com.adsoyad.hastakayit`) değiştirmeniz yeterlidir.

## Cihazda ilk açılış

1. **PIN kurulumu** — 4-6 haneli PIN belirlenir (veriler bu PIN'e bağlıdır)
2. **Face ID / Touch ID** — cihazda varsa kilit ekranında otomatik sorulur.
   Düğmenin yazısı cihaza göre değişir (Face ID / Touch ID).
3. **Bildirim izni** — randevu, teslimat ve ödeme hatırlatmaları için
4. **Takvim izni** — yalnızca bir randevuyu takvime eklemeye çalıştığınızda

İzin metinlerinin tamamı `ios/App/App/Info.plist` içinde Türkçedir; iOS bu
metinleri kullanıcıya olduğu gibi gösterir.

## Yedeklere telefondan ulaşmak

`Info.plist` içinde `UIFileSharingEnabled` ve
`LSSupportsOpeningDocumentsInPlace` açık. Bu sayede uygulamanın otomatik
yedekleri **Dosyalar** uygulamasında görünür:

```
Dosyalar → iPhone'umda → Hasta Kayıt →
    HastaKayit/daily/      (günlük yedek, son 30 gün)
    HastaKayit/snapshots/  (her değişiklikten sonra, son 20 tane)
```

Buradan AirDrop ile Mac'e atabilir, e-postayla gönderebilir veya iCloud
Drive'a kopyalayabilirsiniz. Ayarlar ekranındaki **Yedek Al (JSON)** düğmesi
ise doğrudan iOS paylaşım sayfasını açar.

## Android sürümünden veri taşıma

1. Android'de: Ayarlar → **Yedek Al (JSON)** → dosyayı iPhone'a gönderin
2. iPhone'da: Ayarlar → **Yedekten Geri Yükle** → JSON dosyasını seçin

Yedek biçimi platformdan bağımsızdır (aynı `makeBackup` zarfı, aynı checksum),
bu yüzden Android ↔ iPhone ↔ Mac arasında iki yönlü çalışır.

## TestFlight / App Store

1. Xcode → **Product ▸ Archive**
2. **Distribute App ▸ App Store Connect**
3. App Store Connect'te uygulamayı oluşturun, TestFlight'a ekleyin

`ITSAppUsesNonExemptEncryption = false` anahtarı `Info.plist` içinde hazır:
uygulama yalnızca işletim sisteminin standart şifrelemesini (PIN için WebCrypto
PBKDF2) kullandığı için her yüklemede ihracat uyumluluğu sorusu sorulmaz.

Sağlık verisi işleyen bir uygulama olduğu için App Store incelemesinde bir
**gizlilik politikası bağlantısı** ve verilerin cihazdan çıkmadığının beyanı
istenecektir. Uygulama gerçekten hiçbir veri toplamadığı için App Privacy
formunda "Data Not Collected" işaretlenir.

## Bilinen platform farkları

| Konu | iPhone'daki durum |
|---|---|
| Sesli yazma (🎤 düğmesi) | Gösterilmez — iOS klavyesinin kendi mikrofon tuşu kullanılır (Android'deki karar ile aynı) |
| Bildirim sesi (sesli/sessiz) | Uygulamadan değil, **Ayarlar → Bildirimler → Hasta Kayıt** altından yönetilir; iOS'ta bildirim kanalı kavramı yoktur, bu yüzden uygulama içindeki seçenek gizlenir |
| Sürükle-bırak dosya alanı | Görünür ama iPhone'da pratik değildir; içe aktarma için **İçe Aktar** düğmesini kullanın |
| Ekran kilidi | Uygulama arka plana alındığında ekran daima kilitlenir (uygulama değiştirici önizlemesinde hasta adı görünmesin diye) |

## İsteğe bağlı sıkılaştırma

`capacitor.config.json` içindeki `ios` bölümüne
`"limitsNavigationsToAppBoundDomains": true` eklenebilir. Bu, WKWebView'in
uygulama dışına gitmesini işletim sistemi düzeyinde engeller. Ancak Apple bu
anahtarı kullanırken `Info.plist` içinde `WKAppBoundDomains` dizisinin de
bulunmasını ister; eksikse web görünümü **hiç yüklenmez**. Uygulama zaten
`index.html` içindeki Content-Security-Policy ile dışarı çıkamadığı için
varsayılan olarak kapalı bırakıldı — açacaksanız gerçek bir cihazda mutlaka
deneyin.
