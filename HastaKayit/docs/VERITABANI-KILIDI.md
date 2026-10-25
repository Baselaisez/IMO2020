# "database is locked (code 5)" — PIN ekranındaki hata

Samsung'da ekrana şu düşüyordu:

```
PIN doğrulama hatası — Run: database is locked (code 5)
```

`code 5` = **SQLITE_BUSY**. Bir yazma, başka bir yazma kilidi tutarken geldi.

## Neden oluyordu

`withTx` yalnızca **transaction'ları** sıraya sokuyordu (her veritabanı için bir
söz kuyruğu). Transaction'ın **dışında** kalan çıplak bir `x.run(...)` bu kuyruğu
hiç görmüyordu.

PIN ekranındaki yol tam olarak böyle bir yazmaydı:

```
submitPin → (yanlış PIN) → setFailState → setMeta → çıplak x.run
```

O sırada arka planda bir transaction açıksa — otomatik kayıt, eşitleme turu,
yedek anlık görüntüsü, toplu içe aktarma — yazma SQLITE_BUSY alıyor, hata
`submitPin`'in `catch`'ine düşüyor ve kullanıcıya veritabanı hatası olarak
gösteriliyordu. Asıl söylenmesi gereken şey ("PIN yanlış") ise kayboluyordu.

**Neden Mac'te görülmüyordu:** masaüstünde sql.js senkron çalışır; bir
transaction'ın ortasına başka bir iş araya giremez. Yerli köprüde (Android/iOS)
her çağrı gerçek bir async sınırıdır, yani araya girme kaçınılmazdır. Hata
platforma değil, **zamanlamaya** bağlıydı — bu yüzden ara sıra çıkıyordu.

## Düzeltme — üç katman

**1. Tekil yazmalar da kuyruğa girer** (`runQueued`). `setMeta` artık transaction
kuyruğunu kullanıyor: açık bir transaction varsa yazma onun bitmesini bekliyor.
Aynısı WAL katlama için de geçerli (`checkpointWal`) — o da bir yazmadır ve
uygulama arka plana geçerken, yani tam da otomatik kayıt/eşitleme anında
çalışıyordu.

**2. Yerli köprüde emniyet payı** (`db-capacitor.js`): `PRAGMA busy_timeout=5000`
ve SQLITE_BUSY için sınırlı tekrar (50/150/400 ms). `BEGIN`/`COMMIT`/`ROLLBACK`
**tekrar denenmez** — yarıda kalmış bir transaction'ı yeniden başlatmak veriyi
bozabilir.

**3. PIN ekranı doğru şeyi söyler.** Deneme sayacını yazmak bir defter işidir;
kullanıcıya söylenecek şey "Yanlış PIN"dir. Sayaç yazılamazsa artık korkutucu
bir veritabanı hatası değil, `Yanlış PIN. (deneme sayacı kaydedilemedi)`
çıkıyor. Sessizce yutulmuyor: konsola da düşüyor, çünkü sayacın yazılamaması
kilitlenme gecikmesi demektir.

## Düzeltirken az kalsın açılan tuzak

`setMeta`'yı kuyruğa almak **kurtarma akışlarını kilitleyecekti**:
`setSecurityQuestions`, `setRecoveryCode` ve `resetPinAfterRecovery`, `setMeta`'yı
bir `withTx` geri çağrısının **içinden** çağırıyor. Kuyruk zaten o
transaction'da olduğu için içerideki çağrı sonsuza kadar beklerdi — yani doktor
PIN'ini unuttuğunda kurtarma ekranı donardı.

Bu yüzden iki ayrı işlev var:

| İşlev | Nerede kullanılır |
|---|---|
| `setMeta` | transaction **dışında** — kuyruğa girer |
| `setMetaIn` | transaction **içinde** — kuyruğa girmez, yazma o transaction'ın parçası olur |

Kuralı yoruma yazmak yetmez: `test/db-lock.test.mjs` içindeki **kaynak
denetimi** testi, `withTx` bloğu içinde kuyruğa giren bir çağrı bulursa düşer.
(Testin gerçekten yakaladığı, kasıtlı bir ihlal eklenerek doğrulandı.)

## Doğrulama

Hata masaüstünde kendiliğinden oluşmadığı için testler **yerli köprüyü taklit
eden** bir sahte veritabanı kullanıyor: her çağrı gerçek bir async sınırı ve
transaction açıkken gelen yabancı ifade reddediliyor.

- Eski davranış testle **üretildi** (çıplak yazma SQLITE_BUSY alıyor).
- Yeni yolda `setMeta`, `checkpointWal` ve eşzamanlı bir transaction birlikte
  çalıştırıldı; dördü de tamamlandı.
- Kurtarma akışlarının üçü de zaman aşımı gözetimi altında çalıştırıldı
  (kilitlenme = test düşer).
- Gerçek Electron kabuğunda: yanlış PIN "Yanlış PIN" diyor (veritabanı hatası
  yok), doğru PIN açıyor, kurtarma kodu üretimi kilitlenmiyor.

131 test geçiyor.

## Android (APK) tarafı

Düzeltmenin tamamı **ortak kaynakta** (`src/js/`) — yani Android derlemesi bu
kaynaktan yapıldığı anda hata gider. Bu depoda `android/` platformu yoktur
(burada iOS ve Electron kabukları var), dolayısıyla APK buradan üretilemez;
`src/js/repo.js`, `src/js/lock.js`, `src/js/pin-recovery.js` ve
`src/js/db-capacitor.js` değişiklikleri Android projesine alınmalıdır.
