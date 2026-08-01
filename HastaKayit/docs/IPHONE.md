# iPhone (iOS) sürümü

## Ne gerekiyor

- **macOS** ve **Xcode 15+** (iOS projesi yalnızca Mac'te derlenir)
- Ücretsiz bir Apple hesabı → yalnızca kendi cihazınıza kurmak için yeterli
  (uygulama 7 günde bir yeniden kurulmalı)
- Apple Developer Program üyeliği (yıllık) → TestFlight ve App Store için

Xcode'un komut satırı araçları kuruluysa CocoaPods'a **gerek yok**: proje
Swift Package Manager kullanıyor, bağımlılıklar Xcode açılınca kendiliğinden
çözülür.

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

### "Cannot find 'SceneDelegateProxy' in scope"

`SceneDelegate.swift` içinde üç hata olarak görünür. Kod doğrudur; hata Xcode'un
YANLIŞ Capacitor sürümünü derlemesinden kaynaklanır.

`ios/App/CapApp-SPM/Package.swift` Capacitor'ı `exact: "8.5.0"` ile ister, ama
Xcode bir kez daha eski bir sürüm çözümlediyse o pini kendiliğinden bırakmaz.
Sol paneldeki **capacitor-swift-pm** satırında sürümü görebilirsiniz — 8.5.0
değilse sorun budur. (`SceneDelegateProxy` sınıfı Capacitor 8.5.0'ın ikili
çerçevesinde vardır, 8.0.0'da yoktur; ikisi de indirilip doğrulandı.)

Çözüm:

```bash
npm run ios:reset
```

Betik pinleri siler, çözümlemeyi `xcodebuild` ile KENDİSİ yapar ve sonunda
hangi sürümün çözüldüğünü yazar — "menüden şunu tıklayın" deyip sonucu
görmemek yerine doğrulanmış bir çıktı verir:

```
  ✅ capacitor-swift-pm 8.5.0 çözümlendi.
```

Yalnızca bu projeye ait pinler ve türetilmiş veri silinir; diğer Xcode
projeleriniz etkilenmez. Ardından Xcode'da ⇧⌘K (Clean Build Folder) ve ⌘R.

Betik 8.5.0 dışında bir sürüm bulursa Swift'in genel önbelleği de takılmış
demektir; ekrana yazdığı `rm -rf ~/Library/Caches/org.swift.swiftpm` komutunu
çalıştırıp tekrar deneyin.

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
