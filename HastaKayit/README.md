# Hasta Kayıt — iPhone ve Mac sürümleri

Hasta kayıt, ödeme, paket teslimatı ve randevu takibi. Veriler **yalnızca
cihazda** durur; uygulama hiçbir sunucuya bağlanmaz.

Bu klasör, daha önce yalnızca Android (`HastaKayitv5.0.apk`) ve Windows
masaüstü olarak çalışan uygulamanın **iPhone (iOS)** ve **Mac (macOS)**
sürümlerini içerir. Uygulama mantığı tek bir yerde (`src/`) durur; her platform
aynı arayüzü ve aynı veritabanı şemasını çalıştırır.

```
src/                 uygulama (tek kaynak — üç platform da bunu çalıştırır)
  index.html         tüm ekranlar
  css/app.css        ortak stiller + iOS/macOS'a özgü katman (dosya sonunda)
  js/platform.js     hangi kabukta olduğumuzu söyleyen TEK yer
  js/db-capacitor.js iPhone / Android  → yerel SQLite eklentisi
  js/db-desktop.js   Mac / Windows     → sql.js + kalıcı dosya
  js/db-web.js       tarayıcı önizleme → bellek içi (kalıcı DEĞİL)
  js/desktop.js      Electron köprüsü (dosya işlemleri IPC üzerinden)
ios/                 Xcode projesi (iPhone + iPad)
electron/            Mac uygulama kabuğu: pencere, menü, IPC, izinler
resources/           uygulama simgesi üreteci + üretilmiş simgeler
test/                saf mantık testleri (node --test)
build.mjs            esbuild derlemesi → www/
```

## Kurulum

```bash
cd HastaKayit
npm install
```

## Mac uygulamasını çalıştırmak

```bash
npm run mac          # geliştirme: doğrudan çalıştırır
npm run mac:dist     # dağıtım: dist-mac/ içine .dmg ve .zip (arm64 + x64)
```

Ayrıntılar, imzalama ve noterleme: [docs/MAC.md](docs/MAC.md)

## iPhone uygulamasını çalıştırmak

```bash
npm run ios          # www/ derlenir, iOS'a kopyalanır ve Xcode açılır
```

Xcode'da hedef cihazı seçip **Run**. İlk çalıştırmada
*Signing & Capabilities* altında kendi geliştirici ekibinizi seçmeniz gerekir.

Ayrıntılar, TestFlight ve App Store: [docs/IPHONE.md](docs/IPHONE.md)

## Geliştirme (tarayıcıda hızlı önizleme)

```bash
npm run serve        # http://localhost:5173
```

Tarayıcı önizlemesinde veriler **kalıcı değildir** (bellek içi SQLite); yalnızca
arayüz denemesi içindir.

## Testler

```bash
npm test
```

## Verinin nerede durduğu

| Platform | Veritabanı | Yedekler |
|---|---|---|
| iPhone | uygulama kabı (`Library/CapacitorDatabase`), iCloud yedeğine dahil | Dosyalar → iPhone'umda → Hasta Kayıt → `HastaKayit/daily`, `HastaKayit/snapshots` |
| Mac | `~/Library/Application Support/HastaKayit/hastakayit.sqlite` | aynı klasörde `daily/` ve `backups/` |
| Windows | `%USERPROFILE%\HastaKayit\hastakayit.sqlite` | aynı klasörde `daily\` ve `backups\` |
| Android | uygulama kabı, Google yedeğine dahil | Belgeler → `HastaKayit/daily`, `HastaKayit/snapshots` |

Her iki platformda da Ayarlar ekranının altında gerçek konum yazar; Mac'te
"📂 Finder'da Göster" düğmesi klasörü doğrudan açar.
