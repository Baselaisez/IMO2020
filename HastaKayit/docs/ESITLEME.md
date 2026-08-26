# Cihazlar arası eşitleme (5.2.2)

Doktorun Mac'i ile iPhone'u **aynı hasta kayıtlarını** görsün diye eklendi.
Hesap yok, sunucu yok, OAuth yok: iki cihaz da kullanıcının seçtiği **bir
klasördeki tek bir dosyayı** okur ve yazar. O klasörü buluta taşıma işini
zaten kurulu olan bir istemci (iCloud Drive, OneDrive, Google Drive, Dropbox)
yapar.

Bu sürümde eklenen şey **taşıma katmanının macOS karşılığıdır**; birleştirme
motoru (`sync-merge.js`) yukarı akıştan olduğu gibi alındı.

## Kullanıcı adımları (Mac)

1. **Ayarlar & Yedekleme** → *🔄 Cihazlar Arası Eşitleme* → **Açık**.
2. **📁 Klasör Seç** — gerçek macOS klasör paneli açılır. iCloud Drive içinde
   bir `HastaKayit` klasörü seçmek (ya da panelde oluşturmak) yeterlidir.
3. **💾 Klasörü Kaydet** — klasör önce denetlenir (var mı, klasör mü,
   **yazılabilir mi**), sonra kaydedilir. Salt-okunur bir klasör seçilirse
   eşitleme sessizce hiç çalışmaz yerine, burada hata verir.
4. **🔄 Şimdi Eşitle** — ilk eşitleme.

Sonrası kendiliğinden: kilit açıldıktan ~3 sn sonra bir kez, uygulama açıkken
her ~5 dakikada bir, ve bir kayıt değiştikten ~15 sn sonra.

iPhone tarafında klasör **seçilmez**; Capacitor Filesystem rastgele bir bulut
klasörünü göremediği için sabit bir yol kullanılır
(`Belgeler/HastaKayit/sync`) ve ekranda bu yol yazar.

## Neden klasör paneli, neden `<input webkitdirectory>` değil

Yukarı akış (Windows) sürümü klasörü gizli bir `<input type="file"
webkitdirectory>` ile seçtiriyor, sonra seçilen ilk dosyanın mutlak yolundan
klasörü geri hesaplıyordu. Bu yol macOS'ta **çalışmaz**:

- Pencere `sandbox: true` + `contextIsolation: true` ile açılıyor, yani
  renderer'da ne `File.path` (Electron 32'de kaldırıldı) ne de
  `webUtils.getPathForFile` var.
- Mutlak yol olmayınca kullanıcıya "klasör yolu okunamadı, elle yapıştırın"
  demek gerekirdi — 78 yaşındaki bir hastanın değil, doktorun bile yapmak
  isteyeceği bir şey değil.

Bunun yerine ana süreçte `dialog.showOpenDialog({ properties:
['openDirectory', 'createDirectory'] })` çalışır. Yan faydası: macOS'ta
kullanıcı klasörü panelden seçtiğinde uygulamaya o klasör için erişim izni de
verilmiş olur.

`webkitdirectory` girdisi markup'ta **tarayıcı önizlemesi** için duruyor;
masaüstünde o koda hiç girilmez.

## Güvenlik: neden ayrı ve dar bir IPC kapısı

Uygulamanın bütün dosya işleri `resolveIn(kind, name)` ile kendi veri
klasörüne hapsedilmiştir. Eşitleme klasörü tanımı gereği **o klasörün
dışındadır**, yani `resolveIn`'i gevşetmek gerekirdi — gevşetilmedi.

Bunun yerine `electron/sync-path.cjs` içinde ayrı bir kapı var:

- Renderer bir klasör **yolu** verir, ama yalnızca **iki dosya adına**
  erişebilir: `hastakayit-sync.json` ve `hastakayit-sync.json.tmp`.
- Başka her ad (`notlar.docx`, `.ssh/id_rsa`, `../hastakayit-sync.json`)
  reddedilir.
- Boş yol ve kök dizin reddedilir.

Yani ele geçirilmiş bir renderer bile bu kapıyı doktorun belgelerini okumak
için kullanamaz. Sınır `test/sync-path.test.mjs` ile sabitlenmiştir ve gerçek
Electron kabuğunda da doğrulanmıştır (`window.hkDesktop.syncRead(dir,
'gizli.txt')` → *"Eşitleme dosyası değil"*).

## Yazma neden atomik

`writeRemoteState` önce `.tmp`'ye yazar, **geri okuyup doğrular**, sonra
`rename` eder. Bulut istemcisi yarım yazılmış bir dosyayı asla göremez, çünkü
yarım dosya hiçbir zaman son ada sahip olmaz.

Okuma tarafında dosya bir checksum'lı zarftır: kayıt sayıları ve djb2 özeti
tutmazsa dosya **birleştirilmez**, hata döner. Eşitleme hiçbir koşulda yerel
kaydı yok etmez.

## Hata gürültüsü kuralı

Otomatik eşitleme doktorun işini kesmemeli. Bu yüzden arka plandaki hatalar
**en fazla bir kez** banner gösterir (`app.js` → `syncWarned`); klasör bir
süre erişilemezse (bulut istemcisi kapalı, disk çıkarılmış) her 5 dakikada bir
uyarı basılmaz. Elle **🔄 Şimdi Eşitle** denildiğinde hata **her zaman**
gösterilir — orada kullanıcı bir cevap bekliyordur.

## Dosya haritası

| Dosya | İş |
|---|---|
| `src/js/sync-merge.js` | Saf birleştirme (LWW + tombstone). Yukarı akıştan, değişmedi. |
| `src/js/sync-file.js` | Zarf, atomik yazma, zamanlayıcılar. `isElectron` → `isDesktop`. |
| `src/js/files.js` | `makeSyncStore` / `validateSyncFolder` / `pickSyncFolder` — platform seçimi. |
| `src/js/desktop.js` | Köprü sarmalayıcı: `syncRead/Write/Rename/Remove/Validate/Pick`. |
| `electron/sync-path.cjs` | Dar kapı: izinli iki dosya adı. |
| `electron/main.cjs` | `hk:sync-*` IPC işleyicileri + klasör paneli. |
| `electron/preload.cjs` | Köprüde açılan yüzey. |

## Eşitleme yedek yerine geçmez

Günlük otomatik yedekler (`daily/`) ve anlık görüntüler (`backups/`) aynen
alınmaya devam eder. Eşitleme bir kayıt sildiğinizde onu **diğer cihazda da
siler** — yedek bunu yapmaz, yedeğin işi de budur.
