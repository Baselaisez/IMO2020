# Hız ve hasta kaydı

İki şikayet vardı: uygulama yavaştı, ve hasta kaydederken beklemek gerekiyordu.
Nereye bakılacağı tahmin edilmedi — 44.929 kayıtlık gerçek defterle **ölçüldü**.

## Ölçüm: zaman nereye gidiyordu

| Yol | Ne zaman çalışıyor | Önce | Sonra |
|---|---|---:|---:|
| `listPatients()` → "Bugün" şeridi | **her** `refreshHome()`: her kayıt, her kilit açılışı, her eşitleme | 1.474 ms | **0 ms** |
| `allData()` → bildirim zamanlaması | kilit açılışı + her yedek anlık görüntüsü | 962 ms | **17 ms** |
| Yedek anlık görüntüsü | **her kayıttan 5 sn sonra** | ~1,5 sn donma + 19,1 MB yazma | en fazla 10 dakikada bir |
| Bütünlük kontrolü (`allData`) | her açılış | 814 ms | 2 sayım sorgusu |
| Liste sayfası (100 kayıt) | her liste tazeleme | 13 ms | 3 ms |
| Arama ("ayşe") | her tuş (250 ms geciktirmeli) | 58 ms | 28 ms |

Yani bir hasta kaydetmek şunun bedelini ödüyordu: ~1,5 sn (liste tazeleme)
+ 5 sn sonra ~1,5 sn daha donma + 19 MB disk yazımı. "Kayıt yavaş" şikayeti
buydu.

## Ne yapıldı

**"Bugün" şeridi dar sorguya geçti.** Eskiden tüm hastaları ve tüm ödemeleri
belleğe alıp JavaScript'te süzüyordu. Artık `listTodayAppointments()` yalnızca
bugün randevusu olan aktif hastaları çekiyor (`idx_patients_next_appt`).

**Bildirimler dar sorguya geçti.** `buildSchedule` zaten yalnızca gelecekteki
işleri planlıyordu; girdisini hazırlamak için 45.000 kaydı taşımanın anlamı
yoktu. `listUpcoming()` yalnızca gelecek randevu/teslimat/bekleyen ödemeyi ve
yalnızca gereken hastaların adını getiriyor.

**Yedek anlık görüntüsü seyrekleşti** (en fazla 10 dakikada bir). Bu veri
güvenliğini düşürmez: asıl kayıt zaten **her mutasyonda** SQLite dosyasına
yazılıyor. Anlık görüntü bir emniyet kopyasıdır, işlem günlüğü değil. Ayrıca
uygulama arka plana alınırken ve günlük yedekte her hâlükârda alınıyor.

**Liste sorgusu fotoğrafları taşımayı bıraktı.** `SELECT *` her sayfada 100
hastanın base64 fotoğrafını da belleğe getiriyordu; liste satırı fotoğraf
göstermiyor.

**Üç indeks eklendi:** `patients(next_appt)`, `patients(name COLLATE NOCASE)`,
`deliveries(planned_date)`.

## Otomatik kayıt

> "En gerekli alanları girdiklerinde, ✅ düğmesine basmasalar bile uygulama
> 7-10 saniye içinde kaydetsin."

Yeni hasta formunda **ad yazıldıktan sonra 8 saniye** (ayarlanabilir) hiçbir
şey yazılmazsa kayıt kendiliğinden yapılır.

Tasarım kararları — hepsi bilerek:

| Karar | Neden |
|---|---|
| Sayaç her tuş vuruşunda sıfırlanır | Yazarken kesilmemek için. Kayıt yalnızca doktor durduğunda olur. |
| İlk otomatik kayıt **oluşturur**, sonrakiler **günceller** | Mükerrer hasta imkânsız. Kaydedildiği anda form düzenleme kipine geçer ve ✅ de aynı kaydı günceller. |
| Formda görünür satır: "Otomatik kaydedildi 20:41 ✓ Geri Al" | Sessiz kayıt, doktorun bilmediği bir hasta kaydı demektir; kabul edilemez. |
| **Geri Al** yalnızca otomatik OLUŞTURULAN kaydı siler | Elle açılmış bir kaydı asla silmez. |
| Ekran, odak, kaydırma değişmez | Doktor yazmaya devam eder; kayıt arka planda olur. |
| Formdan çıkarken bekleyen kayıt **hemen** yazılır | "Beklemek istemiyoruz" isteğinin diğer yarısı. |
| Şart yalnızca **ad** (en az 3 harf) | Başlangıç tarihi zaten dolu gelir. Ad yoksa hiçbir şey olmaz. |
| Kapatılabilir | Ayarlar → Otomatik kayıt → Kapalı / 5 / 8 / 15 sn. |

## WhatsApp'tan fotoğraf ve metin

**Yapıştırma (⌘V) artık formda çalışıyor** — eskiden hiç dinlenmiyordu. Asıl
yol budur: WhatsApp'ta fotoğrafa sağ tık → *Resmi Kopyala* → formda ⌘V. Bu, hem
WhatsApp masaüstünde hem WhatsApp Web'de gerçek bir görsel taşır.

**Sürükleme iki farklı şey gönderiyor** ve eskiden yalnızca biri işleniyordu:

| Kaynak | Gelen | Önce | Sonra |
|---|---|---|---|
| WhatsApp masaüstü | gerçek dosya | çalışıyordu | çalışıyor |
| WhatsApp Web (tarayıcı) | dosya yok; `text/uri-list` / `text/html` | **hiçbir şey olmuyordu** (kaplama bile açılmıyordu) | gömülü `data:` görseli eklenir; bağlantıysa ne yapılacağı söylenir |

`http(s):`/`blob:` bağlantısını indiremeyiz: uygulama hiçbir yere bağlanmaz
(CSP `connect-src 'self'`) ve bu söz hasta verisi için kasıtlıdır. O durumda
sessiz kalmak yerine yönlendiriyoruz: *"WhatsApp'ta fotoğrafa sağ tıklayıp
'Resmi Kopyala' deyin, sonra formda ⌘V yapın."*

**Metin yapıştırma düzeltildi.** Sohbetten kopyalanan metnin her satırı şöyle
başlar:

```
[26.08.2026 20:41] Salih Gedik: Adı Soyadı: Ayşe Yılmaz
```

Ayrıştırıcı bunu temizlemeden çalıştığında iki somut hata yapıyordu:
damgadaki tarihi **doğum tarihi** sanıyor, **gönderenin adını** hastanın adı
olarak alıyordu — yani WhatsApp'tan yapıştırılan her hasta yanlış isimle
açılıyordu. `stripChatDecoration()` üç damga biçimini de (köşeli parantezli,
tireli, şablonun talimat satırı) ve görünmez yön işaretlerini temizliyor.

Forma yapıştırılan metin yalnızca **boş** alanları doldurur — doktorun
yazdığının üzerine asla yazmaz — ve ham metin Notlar'a eklenir, hiçbir şey
kaybolmaz. Tek kelimelik sıradan yapıştırmalara karışılmaz
(`looksLikePatientText`: ya çok satırlı ya etiketli olmalı).

## Doğrulama

Gerçek Electron kabuğunda uçtan uca çalıştırıldı: ✅ düğmesine basılmadan kayıt
oluştu, form kapanmadı, ikinci otomatik kayıt mükerrer hasta yaratmadı
(*Toplam 1 hasta*), WhatsApp damgalı metin doğru adı buldu, dolu alanın üzerine
yazılmadı, gömülü görsel fotoğraf olarak eklendi, indirilemeyen bağlantıda
kullanıcıya ne yapacağı söylendi.
