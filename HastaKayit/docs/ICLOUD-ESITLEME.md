# iPhone ↔ Mac eşitlemesi (iCloud)

Aynı Apple Kimliğiyle giriş yapılmış iPhone ve Mac aynı hasta kayıtlarını
görür. iPhone'da girilen hasta Mac'te, Mac'te girilen hasta iPhone'da belirir.
Hesap açmak, sunucu kurmak, klasör seçmek gerekmez.

## Neden 5.8'e kadar çalışmıyordu

Eşitleme "iki cihazın da gördüğü bir klasör" varsayıyordu. Masaüstünde bu
doğruydu (kullanıcı Dropbox/OneDrive klasörü seçiyordu), ama **iPhone'da
yanlıştı**: dosya uygulamanın kendi kabındaki `Documents/HastaKayit/sync`
klasörüne yazılıyordu ve o klasör iCloud'a kopyalanmaz. Mac onu hiçbir zaman
göremezdi. Yani ayar "açık" görünürken iPhone ile Mac arasında hiçbir şey
taşınmıyordu.

İşletim sisteminin iCloud ile paylaştığı tek yer uygulamanın **ubiquity
container**'ıdır. 5.9 iki tarafı da oraya yöneltir.

## Nasıl çalışıyor

| | Klasör |
|---|---|
| iPhone | `FileManager.url(forUbiquityContainerIdentifier:)` → `/Documents` — yerli eklenti ([plugins/icloud](../plugins/icloud)) |
| Mac | `~/Library/Mobile Documents/iCloud~com~hastakayit~app/Documents` — düz dosya yolu ([electron/icloud.cjs](../electron/icloud.cjs)) |

İkisi de **aynı** `hastakayit-sync.json` dosyasını okur ve yazar. Birleştirme
motoru (`sync-merge.js`, son-yazan-kazanır + silme kayıtları) ve taşıma katmanı
(`sync-file.js`) değişmedi; yalnızca "hangi klasör" sorusunun yanıtı değişti.

Mac'te yerli iCloud koduna gerek olmamasının sebebi `NSUbiquitousContainerIsDocumentScopePublic`:
bu anahtar klasörü iCloud Drive'da görünür kılar, böylece macOS'ta sıradan bir
dosya yolu hâline gelir.

Kap kimliği (`iCloud.com.hastakayit.app`) **üç yerde aynı** olmalıdır —
`App.entitlements`, `Info.plist` → `NSUbiquitousContainers`, ve
`ICloudSyncPlugin.swift`. Biri saparsa eşitleme sessizce durur; bunu
`test/ios-preflight.test.mjs` içindeki bir test kilitliyor.

## Ne zaman eşitlenir

| Tetikleyici | Gecikme |
|---|---|
| Kayıt/silme sonrası | ~3 sn (yazarken değil, durunca) |
| Uygulama öne gelince | hemen (Mac'te pencereye dönünce, iPhone'da uygulamaya dönünce) |
| Düzenli tur | 60 sn |
| Açılış | 2 sn |

Buna iCloud'un kendi yükleme/indirme süresi eklenir (iyi bağlantıda birkaç
saniye).

### "Değişmedi" kısa yolu — neden var

Eşitleme dosyası **tüm veritabanını** taşır. Doktorun gerçek verisinde ölçüldü
(100.722 hasta):

| İşlem | Süre / boyut |
|---|---|
| Tam tur (`buildSyncState` + `JSON.stringify`) | **5,5 sn / 40,6 MB** |
| Parmak izi sorgusu (`repo.syncFingerprint`) | **19 ms** |

Dakikada bir 40 MB'ı yeniden kurup buluta yazmak pili ve iCloud kotasını boşa
harcardı. Bu yüzden her tur önce küçük bir **başlık dosyası**
(`hastakayit-sync-head.json`, birkaç yüz bayt) okur. Yereldeki özet ve
başlıktaki özet, son turdakiyle aynıysa tur hiç başlamaz.

Hata modu bilerek güvenli tarafta: başlık okunamazsa, bozuksa ya da eksikse
**tam tur** yapılır. Ayrıca ne olursa olsun 15 turda bir tam tur çalışır — karşı
cihaz asıl dosyayı yazıp başlığı yazamamışsa bu onu kendiliğinden düzeltir.

Kimlik olarak zaman damgası değil **parmak izi** kullanılır: ilk tasarımda
başlığın `written_at` değeri kullanılıyordu ve iki yazma aynı milisaniyeye
düştüğünde karşı cihazın kaydı "değişmedi" sanılıp atlanıyordu (testte
yakalandı). Aynı parmak izi zaten aynı veri demektir.

## Kurulum

### iPhone

Ek bir şey yapmanız gerekmez. Yalnızca Xcode'da **Team** seçili olmalı; Xcode
`iCloud.com.hastakayit.app` kabını Apple hesabınıza kendisi kaydeder.

> **Ücretli Apple Developer Program üyeliği şarttır.** Ücretsiz hesapta
> (*Personal Team*) iCloud yetkisi verilmez ve Signing & Capabilities'te
> kırmızı hata çıkar.

Telefonda **Ayarlar → (adınız) → iCloud → iCloud Drive** açık olmalı.

### Mac

Ek bir şey yapmanız gerekmez — ama klasörün Mac'te belirmesi için **iPhone'daki
uygulamanın bir kez açılmış olması** gerekir. iCloud kabı ilk o zaman oluşur.

Uygulama `Mobile Documents` altına kendiliğinden klasör **açmaz**: elle açılan
bir klasörü iCloud sahiplenmez ve sessizce hiç eşitlenmeyen bir klasör,
"eşitleme çalışıyor" sanılan en kötü hata olurdu.

Dropbox/OneDrive gibi başka bir klasör seçtiyseniz **o seçim geçerli kalır**;
iCloud onu ezmez.

## Eşitleme kendiliğinden açık

Hedef kullanıcı ayarı olmadan bulunabiliyorsa (iPhone'da iCloud açık, ya da
Mac'te kap mevcut) eşitleme **varsayılan olarak açıktır**. Ayarlar'dan bilerek
kapattıysanız o seçime dokunulmaz.

## Sınırlar — dürüst liste

- **Android bundan yararlanmaz.** iCloud yalnızca Apple cihazlarında vardır;
  Android eskisi gibi `Documents/HastaKayit/sync` klasörünü kullanır.
- **Windows bundan yararlanmaz.** iCloud for Windows, uygulamanın kabını
  açmaz; orada klasör elle seçilir.
- **Dosya tüm veritabanını taşır.** Tek bir hasta değişse de 40 MB'lık dosya
  baştan yazılır. Kısa yol *boştaki* turları bedava yapar, ama bir kayıttan
  sonraki turu ucuzlatmaz. Değişiklik-bazlı (delta) bir protokol bunu
  çözerdi; bu, birleştirme motorunun yeniden yazılması demek ve yapılmadı.
- **Aynı anda iki cihazda aynı hastayı düzenlerseniz** son yazan kazanır
  (alan alan birleştirme yok). Silme kayıtları asla budanmaz, bu yüzden
  silinmiş bir hasta geri dirilmez.
- **iCloud yavaşsa eşitleme de yavaştır.** Uygulama dosyayı yazar; buluta
  taşımak iCloud'un işidir.

## Bir şey çalışmazsa

Ayarlar ekranındaki eşitleme bölümü durumu açıkça yazar — iCloud kapalıysa
sebebini de söyler. "Şimdi Eşitle" düğmesi kısa yolu atlar ve sonucu gösterir.

`npm run ios` çalıştırıldığında ön denetim (`scripts/ios-preflight.mjs`) iCloud
bağlantısının üç parçasını da denetler ve eksik olanı adıyla söyler.
