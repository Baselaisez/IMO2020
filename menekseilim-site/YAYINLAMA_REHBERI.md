# Menekşe İlim Derneği Web Sitesi – Yayınlama Rehberi

Bu klasördeki dosyalar, **menekseilim.com.tr** adresinde yayınlanmaya hazır,
tamamen statik (HTML + CSS + JS) bir dernek web sitesidir. Veritabanı,
WordPress ya da özel bir sunucu gerektirmez; en ucuz paylaşımlı hosting
paketinde bile çalışır.

Ekran görüntünüzde iki alan adınız görünüyor:

| Panelde görünen ad | Gerçek adres | Önerilen kullanım |
|---|---|---|
| `menekseilim.com.tr` | menekseilim.com.tr | **Ana adres** (site burada yayınlanır) |
| `xn--menekeilim-i9b.com` | menekşeilim.com (Türkçe karakterli alan adının teknik yazımı) | Ana adrese yönlendirilir |

## Hangi yolu seçmeliyim?

| | A) Hosting + cPanel | B) GitHub Pages | C) Netlify Drop |
|---|---|---|---|
| Ücret | Yıllık hosting ücreti | **Ücretsiz** | **Ücretsiz** |
| cPanel / sunucu bilgisi | Gerekir | Gerekmez | Gerekmez |
| Kurulum | ZIP yükle | Dosyaları GitHub'a yükle (zaten orada) | Klasörü tarayıcıya sürükle |
| SSL (https) | AutoSSL ile | Otomatik | Otomatik |
| İletişim formu | Hazır PHP betiği | Formspree (ücretsiz, 1 satır değişiklik) | Netlify Forms (ücretsiz, 2 satır değişiklik) |
| İkinci alan adı (menekşeilim.com) | `.htaccess` yönlendirir | Alan adı panelinden yönlendirme | Netlify alias olarak ekleyin, otomatik yönlenir |
| Güncelleme | Dosyayı tekrar yükle | GitHub'da düzenle → kaydet | Klasörü tekrar sürükle |

**cPanel ve hosting istemiyorsanız B veya C yolunu izleyin; ikisi de tamamen
ücretsizdir ve sitenin bütün özellikleri çalışır.** Hangisini seçerseniz seçin,
önce **0. bölümdeki** yer tutucuları doldurun.

---

## 0. Yayınlamadan önce mutlaka değiştirin

Sitede bilmediğim birkaç bilgi kaldı. Bunları bana iletirseniz ben eklerim;
isterseniz kendiniz de düzenleyebilirsiniz (aşağıda "Kendiniz düzenlemek
isterseniz" kısmına bakın).

| Eksik bilgi | Sitede nerede | Ne gerekiyor |
|---|---|---|
| Hocalarımızın fotoğrafları (isteğe bağlı) | Heyetimiz | Sınıf hocalarımızın fotoğrafı, adı ve görevi; eklenirse Heyetimiz sayfasına "Hocalarımız" bölümü açılır |
| Kız medreselerinin adı | Medreselerimiz | Sitede "Atalar Kız Medresesi" ve "Osmaniye Kız Medresesi" yazıyor; resmî adları farklıysa `MEDRESELER` listesinden düzeltin |
| Maltepe Külliyesi | Anasayfa (Müjde bandı), Medreselerimiz, Bağış | 1.000 m², en az 100 talebe, tadilat başlıyor. Rakamlar `MALTEPE_M2` ve `MALTEPE_KISI` ayarlarında |
| Yardım toplama izni (varsa) | Bağış sayfası | Valilikten izin alındıysa izin numarası (`YARDIM_TOPLAMA_IZIN`); aşağıdaki Yasal hatırlatmalar'a bakın |
| Medrese adresleri | İletişim sayfası | Atalar, Cevizli, Kurfalı (ve açılınca Topselvi) medreselerinin açık adresi |
| Sohbet ve zikir günleri | Anasayfa ve Hakkımızda | İsterseniz gün ve saatleri yazarız; şu an "bizi arayın" yazıyor |
| Yaş ve ücret bilgisi (isteğe bağlı) | Anasayfa → Sık sorulanlar | Kaç yaşında başlanabildiği ve eğitimin ücretli olup olmadığı; velilerin en çok sorduğu iki soru |
| Dernek kütük numarası (isteğe bağlı) | Hakkımızda → Dernek bilgileri | Dernekler Bilgi Sistemi'ndeki kütük numarası; güven verir |
| Kamu yararı kararının tarihi ve sayısı | Hakkımızda → Dernek bilgileri | Cumhurbaşkanı Kararı'nın tarihi ve sayısı (`olustur.py` → `KAMU_YARARI_KARAR`); statünün kendisi sitede yazıyor |

Sitede kullanılan bilgiler ve kaynakları:

* **Telefon 0551 164 74 64**, medrese adları (Atalar, Cevizli, Kurfalı,
  Topselvi) ve Salih Gedik Hocamızın adı derneğin kendi tanıtım videosundan
  alındı.
* **E-posta** (menekseilim@gmail.com) derneğin Facebook sayfasından alındı.
* **Saatler ve dersler** sizin mesajınızdan alındı: gündüzlü 09.00–20.00,
  yatılı Pazar 21.00 giriş, Cumartesi 10.00 çıkış, hafta sonu ders yok.
* **Logo** gönderdiğiniz orijinal PDF'ten birebir alındı.
* **Açılıştaki Osmanlıca yazı** (منكشه درنكی) ve iki bağış numarasındaki
  WhatsApp dernek tarafından teyit edildi.
* **Yönetim heyeti** fotoğrafları, isimleri ve görevleri derneğin gönderdiği
  bilgilerden alındı (Salih Gedik Hocamız yönetim kurulu başkanı).
* **Kitap görselleri** (tezhipli Mushaf, Mecmûatü's-Sarf, Mecmûatü'n-Nahv)
  dernek tarafından gönderildi; `GRUP_KITAPLARI` ve `EGITIM_GORSELI` ayarlarında.
  Yayınevinin ürün görseli iseler kullanım için yayınevinin onayını almanız iyi olur.
* **Ders kartlarındaki kapaklar** telifli görsel kullanmamak için klasik cilt sanatından
  (şemse, köşebent, cetvel) esinlenerek çizildi (`kitap()` fonksiyonu).
* **Talebe fotoğrafları** hukuki nedenlerle siteden kaldırıldı.

### Kendiniz düzenlemek isterseniz

Sayfalar `menekseilim-kaynak/olustur.py` betiğiyle üretiliyor. En kolayı bu
dosyanın başındaki **AYARLAR** bölümünü (telefon, bağış hesapları, dersler,
medreseler, heyet) değiştirip depo kökünden şunu çalıştırmaktır:

```bash
python3 menekseilim-kaynak/olustur.py
```

**Yönetim kurulu:** Fotoğraflar `menekseilim-site/img/heyet/` klasöründe
(dikey, 640×800 piksel). `olustur.py` içindeki `HEYET` listesinde her satır
`(fotoğraf, isim, görev)` şeklindedir, örneğin:

```python
("heyet-1.jpg", "Ahmet Yılmaz", "Dernek Başkanı"),
```

İsim boş bırakılırsa yalnızca görev yazılır.

**Bağış alanları ve IBAN'lar:** `BAGIS_ALANLARI` listesindeki her sözlük hem
anasayfadaki "Hayra ortak olun" kartı hem de Bağış sayfasındaki bir seçenek
olur. Şu an beş alan var: talebe sofrası, Maltepe medrese inşaatı, Afrika'ya
Mushaf, Gazze'ye yemek, Afrika'da kurban (IBAN'lar afişlerden alındı ve
sağlama kontrolünden geçti). Yeni alan için bir sözlük daha ekleyin:

```python
{"id": "burs", "baslik": "Talebe bursu", "kisa": "Talebe bursu", "etiket": "Medreselerimiz",
 "foto": "img/bagis/burs.jpg",          # yoksa "" bırakın, simge görünür
 "ozet": "Kartta görünen kısa cümle.",
 "aciklama": "Bağış sayfasında görünen açıklama.",
 "iban": "TR.. .... .... .... .... .... ..",
 "tur": "adet", "secenekler": [("Aylık burs", 1500)], "birim": "ay", "hizli": [1, 3, 6, 12],
 "fiyat_yazi": "Aylık 1.500 TL"},
# Serbest tutarlı alan için: "tur": "serbest", "tutarlar": [500, 1000, 2500]
```

Fiyat değişince yalnızca `secenekler` içindeki rakamı değiştirin; toplam,
açıklama ve WhatsApp mesajı kendiliğinden güncellenir.

**Bağış sayfası nasıl çalışır?** Bağışçı alanı seçer, adedi ya da tutarı
belirler. Sayfa toplamı ve havale açıklamasını hazırlar (ör. "Gazze yemek
10 öğün"). IBAN, alıcı adı ve açıklama tek dokunuşla kopyalanır; IBAN
boşluksuz kopyalanır ki her banka uygulamasına yapışsın. Bağışçının yazdığı ad
yalnızca kendi tarayıcısında kalır, hiçbir yere gönderilmez.

**Kartla online bağış (ileride):** Mümkün ve güvenli bir şekilde eklenebilir.
Bunun için derneğin lisanslı bir ödeme kuruluşuyla (ör. iyzico, PayTR) ya da
bankasıyla (Türkiye Finans sanal POS) sözleşme yapması gerekir. Kart bilgileri
bizim sunucumuza hiç uğramaz, ödeme kuruluşunun 3D Secure'lu sayfasında
alınır. Sözleşme ve API anahtarları gelince sihirbaza "Kartla öde" adımı
eklenir; anahtarlar sunucuda, herkese açık klasörün dışında saklanır.

**Dersler:** `MUFREDAT` listesi Eğitimlerimiz sayfasındaki ders kartlarını,
`YOLCULUK` listesi anasayfadaki dört adımı üretir.

**Açılış ekranı:** Siteye ilk girişte (tarayıcı oturumu başına bir kez) yaklaşık
3 saniye görünür; tıklayınca ya da bir tuşa basınca hemen kapanır. Yazılar
`olustur.py` içindeki `acilis()` fonksiyonundadır.

**Önizleme dosyası:** Betik ayrıca `onizleme.html` üretir. Bütün sayfaları tek
dosyada toplar; yalnızca önizleme içindir. Otomatik yükleme bu dosyayı sunucuya
göndermez, sunucuda açılırsa da `.htaccess` anasayfaya yönlendirir.

**Logo:** `menekseilim-kaynak/logo_uret.py` orijinal PDF'ten `img/logo.svg`,
`img/logo-acik.svg` (koyu zemin için), `img/muhur.svg` ve `favicon.svg`
dosyalarını üretir. Logo değişirse yeni PDF'i `logo-orijinal.pdf` adıyla
koyup betiği çalıştırın.

Python kullanmak istemezseniz HTML dosyalarını Not Defteri ile de
düzenleyebilirsiniz; ama betiği sonra çalıştırırsanız elle yaptığınız
değişikliklerin üzerine yazılır.

---

## A yolu – Hosting satın alıp dosyaları yüklemek (önerilen)

### Otomatik yükleme (önerilen)

Site, GitHub'daki her değişiklikten sonra sunucuya **kendiliğinden** yüklenir
(`.github/workflows/menekseilim-yukle.yml`). Bunun için bir kez şu üç adımı
yapın. Hepsi telefondan da yapılabilir. Şifrenizi e-postayla ya da sohbette
kimseye göndermeyin; yalnızca GitHub'ın şifre kasasına girin.

1. **Otomasyonları açın.** https://github.com/Baselaisez/IMO2020/actions
   sayfasını açın. "Workflows aren't being run on this forked repository"
   yazıyorsa yeşil **I understand my workflows, go ahead and enable them**
   düğmesine basın.
2. **FTP bilgilerini girin.** https://github.com/Baselaisez/IMO2020/settings/secrets/actions/new
   sayfasında **Name** ve **Secret** kutularını doldurup **Add secret**
   deyin. Bunu üç kez yapın:

   | Name | Secret |
   |---|---|
   | `FTP_SUNUCU` | `srvc77.trwww.com` (Turhost e-postasında başka bir FTP sunucusu yazıyorsa onu) |
   | `FTP_KULLANICI` | cPanel kullanıcı adınız |
   | `FTP_SIFRE` | cPanel şifreniz |

3. **Haber verin.** Bilgileri girdiğinizi yazmanız yeterli; ilk yüklemeyi
   başlatıp sitenin açıldığını kontrol ederim. Sonrasında her değişiklik
   kendiliğinden yüklenir.

Yükleme `public_html` klasörüne yapılır ve oradaki başka dosyaları silmez.
Bağlantı şifrelidir (FTPS). Yüklemelerin durumunu
https://github.com/Baselaisez/IMO2020/actions sayfasından görebilirsiniz.

### A0. Turhost'a özel notlar (05.10.2026 itibarıyla durum)

Satın alınan hizmetler (Turhost → Hizmet Yönetimi):

| Hizmet | Alan adı | Ne işe yarar |
|---|---|---|
| **cPanel Giriş Plus** (yıllık) | menekseilim.com.tr | Web sitesi burada barınır. **Site bu pakete yüklenecek.** E-posta hesabı açma özelliği de içinde gelir. |
| Kurumsal 1 Mail Hosting (aylık) | menekseilim.com.tr | Ayrı bir e-posta servisi. cPanel zaten e-posta verdiği için zorunlu değil. |
| Kurumsal 1 Mail Hosting (aylık) | xn--menekeilim-i9b.com | Yalnızca yönlendirme için kullanılacak bir alan adına e-posta servisi gerekmez. |

DNS kontrolünün sonucu:

* `menekseilim.com.tr` → isim sunucuları `cpns1.turhost.com` / `cpns2.turhost.com`,
  A kaydı `94.199.205.80` (Turhost cPanel sunucusu `srvc77.trwww.com`),
  `www` kök adrese yönlenmiş. **Web için DNS hazır; dosyalar yüklenince site
  hemen açılır, ek DNS ayarı gerekmez.**
* E-posta (MX) kaydı şu an cPanel sunucusunu gösteriyor. Yani e-postayı cPanel
  üzerinden kullanacaksanız hiçbir şey yapmanız gerekmez. Kurumsal Mail
  Hosting'i kullanmak isterseniz MX kayıtlarının Turhost'un mail sunucularına
  çevrilmesi gerekir; bunu Turhost desteğinden ((0212) 227 74 74 veya panelden
  destek talebi) isteyin. **Öneri:** cPanel e-postası yeterliyse aylık mail
  hosting paketlerini yenilemeyin.
* `xn--menekeilim-i9b.com` (menekşeilim.com) şu an hiç çözümlenmiyor. cPanel'de
  alias olarak eklenince (A6) DNS bölgesi oluşur. 2-3 saat sonra hâlâ
  açılmıyorsa Alan Adı Yönetimi → bu alan adı → Yönetim → Name Server
  bölümünde `cpns1.turhost.com` / `cpns2.turhost.com` yazdığından emin olun.

cPanel'e giriş: Hizmet Yönetimi → **cPanel Giriş Plus** satırı → **Yönetim** →
"cPanel'e Giriş" düğmesi; ya da tarayıcıdan `https://menekseilim.com.tr:2083`
(kullanıcı adı ve şifre Turhost'un gönderdiği "hosting bilgileri" e-postasında).

### A1. Hosting paketi alın (tamamlandı)

1. Alan adlarınızı aldığınız panele girin. Üst menüde **Hosting Yönetimi**
   sekmesine tıklayın ve yeni bir hosting siparişi verin.
2. Paket türü olarak **Linux Hosting (cPanel)** seçin. En küçük / en ucuz
   paket fazlasıyla yeterlidir (site 1 MB'dan küçük). PHP destekli olmasına
   dikkat edin; iletişim formu PHP ile çalışır.
3. Sipariş sırasında alan adı sorulduğunda **menekseilim.com.tr** seçin
   (zaten hesabınızda olduğu için "mevcut alan adımı kullanacağım" seçeneği).
4. Ödeme tamamlanınca e-postanıza **cPanel adresi, kullanıcı adı ve şifre**
   gelir. Aynı bilgiler panelde Hosting Yönetimi → ilgili paket → **Yönetim**
   altında da görünür.

> Alan adı ve hosting aynı firmadaysa DNS/NS ayarları genellikle otomatik
> yapılır. Farklı firmadaysa adım **A5**'e bakın.

### A2. Dosyaları hazırlayın

**Hazır paket:** Deponun kökündeki `menekseilim-site.zip` dosyası doğrudan
`public_html` içine açılmak üzere hazırlanmıştır (rehber ve README hariç tüm
site dosyaları, `index.html` ZIP'in kökünde). İndirme bağlantısı:
<https://github.com/Baselaisez/IMO2020/raw/claude/beautiful-goodall-4ej8xr/menekseilim-site.zip>

Dosyaları kendiniz düzenledikten sonra yeni ZIP yapmak isterseniz:

1. Bu klasörün (`menekseilim-site`) **içindeki** tüm dosyaları seçin
   (`index.html`, `css`, `js`, `img`, `.htaccess` vb.).
2. Sağ tık → **Sıkıştır / ZIP**. Dosya adı önemli değil (örn. `site.zip`).
   Önemli olan, ZIP'in içinde ekstra bir klasör olmaması; `index.html` ZIP'in
   kökünde olmalı.
3. Bu rehberi (`YAYINLAMA_REHBERI.md`) ve `README.md` dosyasını ZIP'e
   koymanıza gerek yok.

> `.htaccess` dosyası Windows'ta gizli görünebilir. Dosya Gezgini'nde
> **Görünüm → Gizli öğeler** kutusunu işaretleyin.

### A3. cPanel'e yükleyin

1. cPanel'e girin → **Dosya Yöneticisi (File Manager)**.
2. Sol taraftan **public_html** klasörüne girin. İçinde `default.html`,
   `cgi-bin` gibi dosyalar olabilir; `cgi-bin` dışındakileri silebilirsiniz.
3. Üstteki **Yükle (Upload)** düğmesine tıklayıp `site.zip` dosyasını seçin.
4. Yükleme bitince geri dönün, `site.zip` üzerine sağ tıklayın → **Extract
   (Çıkar)** → hedef `public_html` kalsın → Çıkar.
5. `site.zip` dosyasını silin.
6. Tarayıcıda `http://menekseilim.com.tr` adresini açın. Site görünüyorsa
   yükleme tamamdır. (DNS yeni yayılıyorsa 1-2 saat bekleyin.)

**Alternatif – FTP:** FileZilla gibi bir program kullanacaksanız cPanel'deki
**FTP Hesapları** bölümünden bilgileri alın; sunucu: `ftp.menekseilim.com.tr`,
port 21, uzak klasör `/public_html`.

### A4. SSL (kilit simgesi / https) açın

1. cPanel'de **SSL/TLS Status** (SSL/TLS Durumu) sayfasını açın.
2. `menekseilim.com.tr` ve `www.menekseilim.com.tr` satırlarını işaretleyip
   **Run AutoSSL** düğmesine basın. Birkaç dakika içinde ücretsiz Let's
   Encrypt sertifikası kurulur.
   * Bu sayfa yoksa panelinizin **SSL Yönetimi** menüsünden ücretsiz ya da
     ücretli bir sertifika alıp aynı yerden kurabilirsiniz.
3. `https://menekseilim.com.tr` çalıştığını gördükten sonra Dosya
   Yöneticisi'nde `.htaccess` dosyasını düzenleyin ve şu iki satırın başındaki
   `#` işaretlerini kaldırın:

   ```apache
   RewriteCond %{HTTPS} off
   RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]
   ```

   Böylece `http://` ile gelen herkes otomatik `https://` adresine yönlenir.

> **Dikkat:** Bu satırları SSL kurulmadan açarsanız site "güvenli değil"
> uyarısıyla açılmaz. Sıra önemli: önce SSL, sonra yönlendirme.

### A5. Alan adı başka yerdeyse: DNS ayarı

Alan adı ile hosting aynı firmadaysa bu adımı atlayın. (Turhost kurulumunda
atlayın; A0'daki kontrole göre DNS zaten doğru.)

Değilse panelde **Alan Adı Yönetimi → menekseilim.com.tr → Yönetim** sayfasını
açın ve iki yoldan birini uygulayın:

* **Name Server (NS) değiştirme (kolay):** Hosting firmasının size verdiği iki
  NS adresini (örn. `ns1.firma.com`, `ns2.firma.com`) yazın. Tüm kayıtları
  hosting firması yönetir.
* **A kaydı (ince ayar):** DNS Yönetimi bölümünde
  `@` (kök) için **A kaydı** → hosting IP adresi,
  `www` için **CNAME** → `menekseilim.com.tr`.

DNS değişiklikleri 15 dakika ile 24 saat arasında yayılır.

### A6. İkinci alan adını yönlendirin (menekşeilim.com)

1. cPanel → **Domains** (veya **Aliases / Parked Domains**) → **Create a New
   Domain**.
2. Alan adı olarak `xn--menekeilim-i9b.com` yazın, "Share document root with
   menekseilim.com.tr" kutusunu işaretli bırakın.
3. Bu alan adının DNS'ini de (A5'teki gibi) aynı hostinge yönlendirin.
4. `.htaccess` içinde hazır duran kural, bu adrese gelen herkesi
   `https://menekseilim.com.tr` adresine yönlendirir. Dilerseniz AutoSSL'i
   bu alan adı için de çalıştırın.

### A7. Kurumsal e-posta (isteğe bağlı ama tavsiye edilir)

1. cPanel → **Email Accounts** → **Create** → `info@menekseilim.com.tr`.
2. Gelen postaları Gmail'de görmek için cPanel'in verdiği IMAP bilgilerini
   Gmail → Ayarlar → Hesaplar → "Başka hesaplardan posta kontrol et" kısmına
   girin; ya da cPanel → **Forwarders** ile `info@` adresini
   `menekseilim@gmail.com` adresine yönlendirin.
3. Kullanmaya başlayınca sitedeki e-posta adresini de güncelleyin.

### A8. İletişim formunu test edin

Form, `iletisim-gonder.php` dosyasını kullanır. Dosyanın üst kısmındaki
**AYARLAR** bölümünde:

```php
$ALICI    = 'menekseilim@gmail.com';        // mesajların geleceği adres
$GONDEREN = 'no-reply@menekseilim.com.tr';  // kendi alan adınızdan bir adres
```

`$GONDEREN` adresinin kendi alan adınızda olması önemlidir; aksi hâlde Gmail
mesajı spam sayabilir. İsterseniz bu adresi A7'deki gibi cPanel'de gerçekten
oluşturun (gelen kutusunu kullanmanız gerekmez).

Siteyi açıp formu kendinize bir mesajla deneyin. Mesaj gelmiyorsa:

* Gmail'de **Spam** klasörüne bakın.
* Hosting firmanıza "PHP mail() fonksiyonu açık mı?" diye sorun.
* Hâlâ olmuyorsa aşağıdaki Formspree seçeneğine geçin (B3).

### A9. Site güncelleme

Herhangi bir sayfayı değiştirmek için: dosyayı bilgisayarınızda düzenleyin →
cPanel Dosya Yöneticisi → `public_html` → **Yükle** ile aynı adla üzerine
yazın. Ya da Dosya Yöneticisi'nde dosyaya sağ tık → **Edit** ile doğrudan
sunucuda düzenleyin.

---

## B yolu – GitHub Pages ile ücretsiz yayın (cPanel'siz, hosting'siz)

GitHub Pages, statik siteleri ücretsiz ve süresiz barındırır; kendi alan
adınızı bağlayabilir, SSL'i otomatik alır. Hosting satın aldığınız için bu yol
artık yedek seçenektir; kurulum için ayrı bir depo açılır.

### B1. Dosyaları GitHub'a koyun

**B-1 (yeni depo):**

1. [github.com](https://github.com) hesabınızla giriş yapın → sağ üstte
   **+** → **New repository**. Ad: `menekseilim`, **Public** seçin → Create.
2. Dosyaları edinin: bu deponun
   [`claude/beautiful-goodall-4ej8xr` dalını ZIP olarak indirin](https://github.com/Baselaisez/IMO2020/archive/refs/heads/claude/beautiful-goodall-4ej8xr.zip),
   açın, içindeki `menekseilim-site` klasörüne girin.
3. Yeni deponun sayfasında **uploading an existing file** bağlantısına
   tıklayın; `menekseilim-site` klasörünün **içindeki** her şeyi (`index.html`,
   `css`, `js`, `img`, `CNAME` vb.) sürükleyip bırakın → **Commit changes**.
   * `CNAME` dosyası hazırdır ve içinde `menekseilim.com.tr` yazar; GitHub bu
     dosyaya bakarak alan adını tanır.
   * `.htaccess` ve `iletisim-gonder.php` GitHub Pages'ta çalışmaz;
     yüklemeniz zarar vermez, görmezden gelinir.
4. **Settings → Pages → Source:** "Deploy from a branch", **Branch:** `main`,
   klasör `/ (root)` → Save.

### B2. Alan adını bağlayın

1. Depoda **Settings → Pages → Custom domain** kutusuna `menekseilim.com.tr`
   yazın → Save.
2. Alan adı panelinizde **Alan Adı Yönetimi → menekseilim.com.tr → Yönetim →
   DNS Yönetimi** bölümüne şu kayıtları ekleyin:

   | Tür | Ad / Host | Değer |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `KULLANICIADINIZ.github.io` |

   (Eski A kayıtları ve varsa "park sayfası" CNAME'i silin. Güncel IP'ler için
   [GitHub Pages belgelerine](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) bakın.
   `KULLANICIADINIZ` yerine GitHub kullanıcı adınızı küçük harfle yazın, örn.
   `baselaisez.github.io`.)
3. DNS yayıldıktan sonra (genellikle 1 saat içinde) Settings → Pages
   sayfasında "DNS check successful" yazar. **Enforce HTTPS** kutusunu
   işaretleyin; GitHub ücretsiz SSL sertifikasını otomatik kurar. Kutu gri
   görünüyorsa 10-15 dakika bekleyip sayfayı yenileyin; sertifika
   hazırlanıyordur.
4. `menekşeilim.com` (`xn--menekeilim-i9b.com`) için: GitHub Pages tek bir
   özel alan adı kabul ettiğinden bu adresi alan adı panelinizin
   **Yönlendirme / URL Forwarding** özelliğiyle `https://menekseilim.com.tr`
   adresine (301, kalıcı) yönlendirin. Çoğu Türk sağlayıcıda bu özellik
   ücretsizdir ve Alan Adı Yönetimi → Yönetim altındadır.

### B3. İletişim formu (Formspree)

GitHub Pages PHP çalıştırmadığı için formun gideceği yeri değiştirmeniz gerekir.
(Sitenin JavaScript'i Formspree'nin JSON yanıtını tanır; başka değişiklik gerekmez.)

1. [formspree.io](https://formspree.io) adresinde ücretsiz hesap açın
   (ayda 50 mesaj ücretsiz) → **New form** → e-posta olarak
   `menekseilim@gmail.com` → size `https://formspree.io/f/xxxxxxx` gibi bir
   adres verir.
2. `iletisim.html` içinde şu satırı bulun:

   ```html
   <form class="form" id="iletisim-formu" action="iletisim-gonder.php" method="post" ...>
   ```

   `action="iletisim-gonder.php"` yerine `action="https://formspree.io/f/xxxxxxx"`
   yazın. Formun geri kalanı (JS ile gönderim, başarı mesajı) Formspree ile
   uyumludur.

### B4. Güncelleme

GitHub'da ilgili dosyayı açın → kalem simgesi (**Edit**) → değişikliği yapın
→ **Commit changes**. 1-2 dakika içinde site güncellenir. Fotoğraf eklemek
için `img` klasörüne girip **Add file → Upload files** kullanın.

---

## C yolu – Netlify Drop (en az adımlı ücretsiz yol)

GitHub ile uğraşmak istemeyenler için; kayıt dâhil 10 dakika sürer.

1. [app.netlify.com/drop](https://app.netlify.com/drop) adresini açın,
   ücretsiz hesap oluşturun (e-posta ile).
2. Bilgisayarınızdaki `menekseilim-site` klasörünü sayfadaki kutuya
   sürükleyip bırakın. Site hemen `rastgele-ad.netlify.app` gibi bir adreste
   yayına girer.
3. **Site configuration → Domain management → Add a domain** →
   `menekseilim.com.tr` → Netlify size DNS kayıtlarını gösterir. Genellikle:

   | Tür | Ad / Host | Değer |
   |---|---|---|
   | A | `@` | `75.2.60.5` (Netlify'ın gösterdiği değeri esas alın) |
   | CNAME | `www` | `rastgele-ad.netlify.app` |

   Bu kayıtları alan adı panelinizde **Alan Adı Yönetimi → Yönetim → DNS
   Yönetimi** bölümüne girin.
4. Aynı ekrandan `xn--menekeilim-i9b.com` adresini de **domain alias** olarak
   ekleyin ve ona da aynı DNS kayıtlarını verin; Netlify tüm alias'ları ana
   alan adına otomatik yönlendirir.
5. DNS yayılınca Netlify **HTTPS** bölümünde "Let's Encrypt certificate"
   otomatik kurulur (gerekirse **Verify DNS configuration** düğmesine basın).
6. **İletişim formu:** `iletisim.html` içinde form etiketini şöyle değiştirin:

   ```html
   <form class="form" id="iletisim-formu" name="iletisim" method="post"
         action="/iletisim.html?durum=ok" data-netlify="true"
         netlify-honeypot="website" data-eposta="menekseilim@gmail.com" novalidate>
     <input type="hidden" name="form-name" value="iletisim">
   ```

   Gelen mesajlar Netlify panelinde **Forms** altında görünür; **Form
   notifications** ile e-postanıza iletilmesini ayarlayın. Aylık 100 mesaj
   ücretsizdir.
7. **Güncelleme:** Netlify'da sitenizin **Deploys** sayfasına girip klasörü
   tekrar sürükleyin.

**Cloudflare Pages** de benzer şekilde ücretsizdir (Direct Upload), ancak
alan adının isim sunucularını (NS) Cloudflare'a taşımanız gerekir; karşılığında
ücretsiz SSL, hızlandırma ve her iki alan adı için kolay yönlendirme kuralları
gelir. Teknik bir yakınınız varsa iyi bir seçenektir.

---

## Yayın sonrası kontrol listesi

- [ ] `https://menekseilim.com.tr` kilit simgesiyle açılıyor
- [ ] `http://` ve `www.` adresleri ana adrese yönleniyor
- [ ] `menekşeilim.com` ana adrese yönleniyor
- [ ] Telefonda menü (☰) açılıp kapanıyor
- [ ] İletişim formundan gönderilen deneme mesajı e-postaya düştü
- [ ] Bağış alanlarındaki IBAN ve banka bilgileri gerçek bilgilerle değiştirildi
- [ ] [Google Search Console](https://search.google.com/search-console)'a site eklendi ve `https://menekseilim.com.tr/sitemap.xml` gönderildi
- [ ] Facebook sayfasının "Web sitesi" alanına adres yazıldı

## Sık karşılaşılan sorunlar

| Belirti | Sebep / çözüm |
|---|---|
| Sayfa yerine dosya listesi görünüyor | `index.html` `public_html` kökünde değil, bir alt klasörde kaldı. Dosyaları bir üst klasöre taşıyın. |
| Türkçe karakterler bozuk (Ã§, Ä± gibi) | Dosya UTF-8 dışında kaydedilmiş. Not Defteri'nde "Farklı Kaydet → Kodlama: UTF-8" seçin. |
| CSS yüklenmiyor, sayfa çıplak görünüyor | `css` klasörü yüklenmemiş ya da büyük/küçük harf farklı (`CSS/Style.css`). Linux sunucular harfe duyarlıdır. |
| "Çok fazla yönlendirme" hatası | `.htaccess` HTTPS satırlarını SSL kurulmadan açtınız veya Cloudflare'de SSL modu "Flexible". Satırları tekrar `#` ile kapatın ya da Cloudflare'de "Full" seçin. |
| Form "Mesaj şu an gönderilemiyor" diyor | PHP yok (GitHub Pages / Netlify) ya da `mail()` kapalı → B3 Formspree veya C-6 Netlify Forms. |
| GitHub Pages: "DNS check unsuccessful" | A kayıtları henüz yayılmadı ya da eski bir A/CNAME kaydı duruyor. Alan adı panelinde yalnızca 4 GitHub A kaydı ve `www` CNAME kalsın; 1 saat sonra tekrar deneyin. |
| GitHub Pages: site `github.io` adresinde açılıyor ama alan adında açılmıyor | Custom domain kutusu boş kalmış ya da `CNAME` dosyası silinmiş. Settings → Pages'ta alan adını tekrar yazın. |
| Netlify: "Domain already registered to another site" | Alan adı başka bir Netlify hesabına bağlı; Netlify destekten alan adı doğrulaması isteyin (TXT kaydı). |
| Site güncelledim ama eski hâli görünüyor | Tarayıcı önbelleği. Ctrl+F5 ile yenileyin. |
| 403 Forbidden | Dosya izinleri: dosyalar 644, klasörler 755 olmalı (Dosya Yöneticisi → sağ tık → Permissions). |

## Yasal hatırlatmalar

* **KVKK:** `kvkk.html` sayfası genel bir aydınlatma metnidir; adres ve iletişim
  bilgilerini doldurun.
* **Çocukların görüntüleri:** Talebe fotoğrafları siteden ve GitHub geçmişinden
  kaldırıldı. Tanıtım ve yıl sonu merasimi videoları dernek kararıyla sitede
  kalıyor. Videolarda talebelerin yüzleri göründüğü için velilerin yazılı
  izinlerini dernek dosyasında saklayın; bir veli isterse ilgili video kaldırılır.
* **Bağış ve dekont:** Bağış banka aracılığıyla alındığında banka dekontu
  alındı belgesi (makbuz) yerine geçer (Dernekler Yönetmeliği m.38).
* **Yardım toplama izni:** Derneğe tüzüğündeki amaçlar için yapılan bağışlar
  Yardım Toplama Kanunu'nun kapsamı dışındadır (2860 sayılı Kanun m.2). Tüzükte
  yer almayan amaçlar için ya da geniş çaplı kampanyayla yardım toplamak valilik
  izni gerektirir (m.6). İzinsiz internet kampanyası 24 saat içinde kaldırılabilir
  ve erişime engellenebilir. İzin alınırsa izin numarasının sitede ve afişlerde
  yazılması zorunludur (Yardım Toplama Esas ve Usulleri Hakkında Yönetmelik
  m.7). Cumhurbaşkanınca izinsiz yardım toplayabileceği kararlaştırılan
  dernekler ise kararın yılını ve sayısını yazar. **Gazze ve Afrika
  çalışmalarının tüzüğünüzde yer aldığını kontrol edin**; emin değilseniz il
  sivil toplumla ilişkiler müdürlüğüne danışın.
* **Alan adı yenileme:** Her iki alan adının bitiş tarihi **05.10.2027**.
  Panelde otomatik yenilemeyi açın; süresi dolan `.com.tr` alan adını geri
  almak zordur.

## Dosya yapısı

```
menekseilim-site/          ← sunucuya (public_html) yüklenen klasör
├── index.html             Anasayfa: açılış, hizmetler, eğitim yolculuğu, medreseler, sadaka-i câriye, merasim, heyet, sorular
├── hakkimizda.html        Biz kimiz, değerlerimiz, sohbet/zikir, sosyal etkinlikler, dernek bilgileri
├── egitimlerimiz.html     Gündüzlü/yatılı programlar, bütün dersler (Elif-Ba'dan İzhâr'a), kayıt
├── heyetimiz.html         Yönetim kurulu heyeti ve eğitim heyeti
├── bagis.html             Bağış sihirbazı: alan seç, tutar belirle, IBAN/açıklama kopyala, dekont ilet
├── iletisim.html          Telefon, e-posta, medreseler ve iletişim formu
├── kvkk.html              KVKK aydınlatma metni
├── 404.html               Bulunamayan sayfa
├── onizleme.html          Tek dosyalık önizleme (sunucuya YÜKLENMEZ)
├── iletisim-gonder.php    Form gönderici (PHP)
├── .htaccess              Yönlendirmeler, önbellek, güvenlik ayarları
├── CNAME, robots.txt, sitemap.xml, favicon.svg
├── css/style.css          Tüm görünüm
├── css/fonts.css          Yazı tipleri (kendi sunucumuzdan; Google'a bağlanmaz)
├── fonts/                 Lora, Source Sans 3, Aref Ruqaa (hat), Amiri (Arapça) ve lisansları
├── js/main.js             Açılış ekranı, menü, form, IBAN kopyalama
├── img/                   logo.svg, logo-acik.svg, muhur.svg, desen-altin.svg, medrese-ders.jpg, og-gorsel.png
│   ├── bagis/             Bağış alanı fotoğrafları (afişlerden kırpıldı)
│   ├── heyet/             Yönetim heyeti fotoğrafları
│   └── kitaplar/          Mushaf ve Mecmûa kitap görselleri (Eğitimlerimiz sayfası)
└── video/                 Tanıtım ve yıl sonu merasimi videoları (.mp4) ve kapakları (.jpg)

menekseilim-kaynak/        ← sunucuya YÜKLENMEZ; siteyi üreten dosyalar
├── olustur.py             Sayfaları üretir (AYARLAR bölümü burada)
├── logo_uret.py           Logo SVG dosyalarını PDF'ten üretir
├── logo-orijinal.pdf      Derneğin orijinal logosu
└── og-gorsel.html         Paylaşım görseli şablonu
```

Renkler logodan alındı: koyu yeşil, bej ve beyaz. Değiştirmek isterseniz
`css/style.css` dosyasının en üstündeki `:root { --yesil: ...; --bej: ...; }`
değerlerini düzenlemeniz yeterli.
