# Mac (macOS) sürümü

Mac sürümü Electron kabuğunda çalışır ve iPhone sürümüyle **birebir aynı**
`www/` paketini yükler. Fark yalnızca kabukta: pencere, menü çubuğu, dosya
sistemi ve "Farklı Kaydet…" paneli.

## Çalıştırma

```bash
cd HastaKayit
npm install
npm run mac
```

## Dağıtım paketi

```bash
npm run mac:dist
```

`dist-mac/` altında Apple Silicon ve Intel için `.dmg` ve `.zip` üretilir.
`resources/icon.icns` simgesi hazırdır (yeniden üretmek için `npm run icons`).

### İmzalama ve noterleme

İmzasız bir `.dmg` başka bir Mac'te "geliştirici doğrulanamadı" uyarısı verir.
Apple Developer Program üyeliğiniz varsa:

```bash
export APPLE_ID="apple-kimliginiz@ornek.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"   # appleid.apple.com
export APPLE_TEAM_ID="XXXXXXXXXX"
export CSC_NAME="Developer ID Application: Ad Soyad (XXXXXXXXXX)"
npm run mac:dist
```

`package.json` içindeki `build.mac` bölümünde hardened runtime açık ve
`electron/entitlements.mac.plist` bağlı; noterleme için gereken izinler
(JIT, imzasız çalıştırılabilir bellek, mikrofon, kullanıcı seçimli dosya
yazma) o dosyada tanımlı.

Kendi bilgisayarınızda kullanacaksanız imzalamaya gerek yok: `.app`'i ilk
açışta sağ tık → **Aç** deyip onaylamak yeterlidir.

## Verinin konumu

```
~/Library/Application Support/HastaKayit/
    hastakayit.sqlite     veritabanı
    daily/                günlük yedek (son 30 gün)
    backups/              her değişiklikten sonra anlık görüntü (son 20)
```

Ayarlar ekranının altında bu yol yazar ve **📂 Finder'da Göster** düğmesi
klasörü açar; menüden **Dosya ▸ Veri Klasörünü Göster** de aynı işi yapar.

Windows sürümünün konumu değişmedi (`%USERPROFILE%\HastaKayit`), böylece
mevcut Windows kurulumları etkilenmez.

## Menü çubuğu

| Menü | Öğe | Kısayol |
|---|---|---|
| Hasta Kayıt | Ayarlar & Yedekleme | ⌘, |
| Dosya | Yeni Hasta | ⌘N |
| Dosya | Excel'e Aktar… | ⌘E |
| Dosya | Yedek Al (JSON)… | ⌘S |
| Dosya | İçe Aktar… | ⌘O |
| Dosya | Veri Klasörünü Göster | — |
| Dosya | Ekranı Kilitle | ⌘L |
| Düzen | Kes / Kopyala / Yapıştır / Geri Al | standart |

Menü öğeleri ekrandaki düğmelerin aynısını çalıştırır — ikinci bir kod yolu
yoktur, dolayısıyla onay soruları ve hata mesajları aynı kalır. Kilit
ekranındayken veri açan menü öğeleri çalışmaz.

## Pencere davranışı

- Başlık çubuğu gizli (`hiddenInset`); trafik ışıkları uygulamanın mavi üst
  çubuğunun üzerinde durur, üst çubuktan pencere sürüklenebilir.
- Pencere boyutu ve konumu hatırlanır.
- Pencere kapanınca uygulama çıkmaz (macOS geleneği); Dock simgesine
  tıklayınca yeniden açılır.
- **Pencere odaktan çıkınca ekran kilitlenir.** iPhone'da uygulama arka plana
  alındığında olan şeyin Mac karşılığıdır; PIN'in ne kadar sonra sorulacağı
  Ayarlar → "PIN ne zaman sorulsun?" ile belirlenir.
- Kapatırken bekleyen veritabanı yazması diske inmeden pencere kapanmaz.
  Renderer 3 saniye içinde yanıt vermezse yine de kapanır (kilitlenmiş bir
  pencere uygulamayı rehin alamaz).

## Sesli yazma

Mac'te 🎤 düğmesi görünür. Düğme **kayıt yapmaz**: imleci doğru kutuya alır ve
macOS diktesinin kısayolunu (varsayılan: **Fn** tuşuna iki kez basmak)
hatırlatır.

Uyarı metni bilerek temkinlidir: macOS diktesi bazı dil ve modellerde cihaz
üstünde çalışır, bazılarında sesi Apple sunucularına gönderir ve Apple bunu
kullanıcıya doğrudan göstermez. Türkçe için garanti veremediğimizden hasta adı,
telefon, adres gibi kimlik bilgilerinin sesle yazdırılmaması önerilir. (Aynı
tutum Windows sürümündeki Win + H uyarısında da vardı.)

## Güvenlik

Pencere Electron'un güvenli varsayılanlarıyla açılır: `contextIsolation: true`,
`nodeIntegration: false`, `sandbox: true`. Renderer'da Node API'si **yoktur**;
tüm dosya işlemleri `electron/preload.cjs` köprüsünden ana sürece gider ve
orada yalnızca uygulamanın kendi veri klasörüne izin verilir (yol geçişi
`resolveIn` ile engellenir).

`index.html` içindeki Content-Security-Policy hiçbir uzak kaynağın
yüklenmesine ve hiçbir ağ isteğine izin vermez. Dış bağlantılar (tel:, https:)
uygulama içinde açılmaz; varsayılan tarayıcıya devredilir.
