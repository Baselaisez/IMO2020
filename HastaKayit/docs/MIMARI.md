# Mimari — tek kod tabanı, üç kabuk

Android sürümü zaten Capacitor (web + yerel köprü) üzerine kuruluydu ve
veritabanı erişimi bir adaptör arkasındaydı. iPhone ve Mac sürümleri bu yüzden
uygulamanın **yeniden yazılmasını gerektirmedi**: yeni kabuklar eklendi, ortak
mantık olduğu gibi kaldı.

```
                    src/  (tek uygulama: ekranlar, iş kuralları, SQL)
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
  db-capacitor.js      db-desktop.js         db-web.js
  iPhone / Android      Mac / Windows        tarayıcı önizleme
  yerel SQLite          sql.js + dosya       sql.js (bellek)
        │                    │
   Capacitor köprüsü    Electron IPC köprüsü
   (ios/ Xcode projesi)  (electron/main.cjs)
```

## Platform tespiti tek yerde

Dönüşümden önce `window.process.versions.electron` kontrolü **üç ayrı dosyada**
tekrarlanıyordu (`app.js`, `files.js`, `ui-voice.js`). Bu kontrol iki şeyi
yapamıyordu:

- `contextIsolation` açık bir Electron penceresinde çalışmıyordu (renderer'da
  `process` yoktur) — Mac sürümü tam olarak öyle açılıyor,
- Mac ile Windows'u ayıramıyordu; oysa yedek klasörü, dikte kısayolu ve menü
  bunlara göre değişiyor.

Artık tek kaynak `src/js/platform.js` var: `'ios' | 'android' | 'macos' |
'windows' | 'linux' | 'web'`. Sonuç `<html data-platform="…">` olarak da
yazılır, böylece CSS aynı bilgiyi kullanabilir.

## Ne değişti, ne değişmedi

**Değişmedi:** veritabanı şeması, yedek dosya biçimi (checksum'lı zarf), PIN
türetme (PBKDF2, 100.000 tur), kurtarma akışı, Excel/PDF/Word aktarımları,
ekran akışı ve arayüzün tamamı. Android'de alınmış bir yedek iPhone'da ve
Mac'te aynen geri yüklenir.

**Değişti:**

| Alan | Önce | Sonra |
|---|---|---|
| Platform tespiti | 3 dosyada `window.process` | `platform.js` |
| Masaüstü dosya erişimi | renderer'da `window.require('fs')` (`nodeIntegration: true`) | preload köprüsü + ana süreçte IPC (`sandbox: true`) |
| Masaüstü veri klasörü | her yerde `~/HastaKayit` | Mac'te `~/Library/Application Support/HastaKayit`, Windows'ta eskisi gibi |
| Kapanışta kayıt | `beforeunload` (asenkron yazma yetişmeyebilirdi) | ana süreçle el sıkışma: yazma bitmeden pencere kapanmaz |
| Biyometri düğmesi | sabit "Parmak izi ile aç" | cihaza göre Face ID / Touch ID / parmak izi |
| Dışa aktarma | Android paylaşım sayfası; masaüstünde tarayıcı indirmesi | iPhone/Android paylaşım sayfası, Mac'te "Farklı Kaydet…" paneli |
| Dışa aktarma mesajı | daima "hazırlandı ✓" | iptal edilirse iptal, kaydedilirse dosya yolu |
| Bildirim kanalları | her yerde çağrılıyordu | yalnızca Android; iOS'ta kanal kavramı yok, ilgili ayar gizlenir |
| Sesli yazma | yalnızca Windows (Win + H) | Mac'te Fn Fn; iPhone'da düğme gizli (klavyenin kendi mikrofonu) |
| Yedek/otomatik yedek metinleri | "Google Drive" (Android) | platforma göre iCloud / Google / yerel klasör |
| İçerik güvenliği | — | `index.html` içinde CSP; dış bağlantılar sistem tarayıcısına |

## SQLite: iOS'a özgü tek düzeltme

`@capacitor-community/sqlite` açık bağlantıları native tarafta bir sözlükte
tutar. WKWebView yeniden yüklendiğinde JS tarafı sıfırlanır ama o sözlük ayakta
kalır; ardından gelen `createConnection` "Connection already exists" ile
patlar ve uygulama **hiç açılmaz**. `db-capacitor.js` artık önce
`checkConnectionsConsistency()` + `isConnection()` çağırıp varsa mevcut
bağlantıyı geri alıyor. Android'de bu çağrılar zararsızdır.

## Doğrulama durumu

Bu ortamda (Linux) doğrulanabilenler:

- `npm run build` — esbuild paketi üretiliyor
- `npm test` — 12 saf mantık testi geçiyor
- **Electron kabuğu uçtan uca çalıştırıldı**: pencere açıldı, preload köprüsü
  kuruldu, sql.js WASM ana süreçten okundu, şema kuruldu, PIN belirlendi,
  hasta eklendi, liste ve ayarlar ekranı doğru göründü, veritabanı diske
  yazıldı ve **ikinci açılışta geri okundu**. Hata banner'ı çıkmadı.
- `npx cap sync ios` — 7 eklenti bulundu, `www/` iOS projesine kopyalandı,
  `Info.plist` geçerli bir plist olarak ayrıştırılıyor.
- `electron-builder` paketlemesi: macOS `.app` ağacı üretildi, paketlenmiş
  `Info.plist` beklenen anahtarları (kategori, izin metinleri, sürüm) taşıyor;
  `app.asar` yalnızca `www/`, `electron/` ve `package.json` içeriyor.
  **Paketlenmiş ikili çalıştırıldı** ve veritabanını oluşturdu — yani asar
  içinden açılış, preload köprüsü ve WASM okuma paketlenmiş hâlde de çalışıyor.

Doğrulanamayanlar (macOS ve Xcode gerektirir):

- iOS projesinin derlenmesi ve cihazda çalışması
- `.dmg` kabının üretimi (macOS'un `sips` aracını gerektirir), imzalama ve
  noterleme — Linux'ta paketleme `.dmg` adımına kadar sorunsuz ilerliyor
- Face ID / Touch ID, takvim ve bildirim izin akışları
- macOS penceresinin trafik ışığı hizası (CSS'te 78px sol boşluk verildi,
  gerçek pencerede gözle kontrol edilmeli)
