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
npm run mac:release
```

Paketler ve makinenizin mimarisine uyan `.dmg` dosyasını **Finder'da seçili
olarak açar** — çift tıklayıp Applications'a sürüklemek kalır.

`npm run mac:dist` de aynı paketleri üretir ama Finder'ı açmaz; dist-mac/
altında Apple Silicon ve Intel için ayrı `.dmg` ve `.zip` bulunur. Doğru olanı
elle seçmek gerekir: Intel dosyasında mimari eki YOKTUR
(`Hasta Kayıt-5.2.2.dmg`), Apple Silicon dosyası `-arm64.dmg` ile biter.

`dist-mac/` altında Apple Silicon ve Intel için `.dmg` ve `.zip` üretilir.
`resources/icon.icns` simgesi hazırdır (yeniden üretmek için `npm run icons`).

Uygulama paketi (`app.asar`) ~2 MB'dir; geri kalan ~250 MB Electron'un kendi
çalışma zamanıdır ve küçültülemez. `build.files` içindeki `!node_modules/**/*`
kuralı önemlidir: bütün çalışma zamanı bağımlılıkları esbuild tarafından zaten
`www/js/bundle.js` içine paketlendiği için masaüstü uygulamasının node_modules'a
İHTİYACI YOKTUR. Kural olmadan electron-builder tüm üretim bağımlılıklarını
(Capacitor eklentilerinin Android `.java` ve iOS `.swift` kaynakları dahil)
pakete kopyalar ve `app.asar` 94 MB'a çıkar.

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

## Cihazlar arası eşitleme

Ayarlar ekranındaki **🔄 Cihazlar Arası Eşitleme** bölümü Mac ile iPhone'un
aynı kayıtları görmesini sağlar: **📁 Klasör Seç** ile iCloud Drive (veya
OneDrive / Drive / Dropbox) içinde bir klasör seçilir, **💾 Klasörü Kaydet**
denir. Klasör kaydedilmeden önce yazılabilirliği denetlenir.

Klasör seçimi **gerçek macOS panelidir** — Windows sürümündeki gizli
`webkitdirectory` girdisi macOS'ta mutlak yol vermediği için burada
kullanılmaz. Ayrıntılar ve güvenlik sınırı: [ESITLEME.md](ESITLEME.md).

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

## Sağ tık menüsü

Electron bir web sayfası gösterir ve web sayfalarının kendiliğinden gelen bir
sağ tık menüsü **yoktur** — tarayıcıdaki menüyü Chrome ekler, Electron eklemez.
Bu yüzden uygulamada sağ tıklamak eskiden hiçbir şey yapmıyordu.

Artık her yerde çalışıyor:

| Nereye sağ tıkladığınıza göre | Menüde ne çıkar |
|---|---|
| Yazı kutusunda | Geri Al, Yinele, Kes, Kopyala, Yapıştır, Tümünü Seç |
| Seçili metinde | Kopyala, Tümünü Seç |
| Boş alanda | Tümünü Seç |

Öğeler duruma göre sönükleşir: pano boşsa "Yapıştır" tıklanamaz. Yazım denetimi
açık olduğunda önerilen kelimeler menünün en üstünde görünür.

## Pencere davranışı

- Başlık çubuğu gizli (`hiddenInset`); trafik ışıkları uygulamanın mavi üst
  çubuğunun üzerinde durur, üst çubuktan pencere sürüklenebilir.
- Pencere boyutu ve konumu hatırlanır.
- Pencere kapanınca uygulama çıkmaz (macOS geleneği); Dock simgesine
  tıklayınca yeniden açılır.
- **Pencere odaktan çıkınca ne olacağı Ayarlar'a bağlıdır** (Ayarlar → "PIN ne
  zaman sorulsun?"):

  | Ayar | Safari'ye/Finder'a geçince |
  |---|---|
  | Her uygulama değişiminde | hemen kilitlenir |
  | 2 / 5 / 10 dakika sonra | kilitlenmez; o süre dolarsa kendiliğinden kilitlenir |
  | Sadece uygulama kapanınca | kilitlenmez |

  Eskiden masaüstünde **her** blur'da koşulsuz kilitleniyor, geri dönüşte ayara
  bakılıp otomatik açılıyordu — yani seçilen süre işe yaramıyor ve her sekme
  değişiminde kilit ekranı bir anlığına çakıp kayboluyordu. iPhone/Android'de
  davranış değişmedi: orada uygulama değiştirici, uygulamanın son görüntüsünün
  küçük resmini gösterir ve hasta adları o küçük resimde okunur, bu yüzden ekran
  ayar ne olursa olsun anında karartılır.
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
`resolveIn` ile engellenir). Eşitleme klasörü tanımı gereği o klasörün
dışındadır; onun için `resolveIn` gevşetilmedi, ayrı ve **iki dosya adıyla
sınırlı** bir kapı açıldı (`electron/sync-path.cjs`).

`index.html` içindeki Content-Security-Policy hiçbir uzak kaynağın
yüklenmesine ve hiçbir ağ isteğine izin vermez. Dış bağlantılar (tel:, https:)
uygulama içinde açılmaz; varsayılan tarayıcıya devredilir.
