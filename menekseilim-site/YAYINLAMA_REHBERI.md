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

Aşağıda iki yol anlatılıyor. Teknik bilginiz azsa **A yolu** (hosting satın alıp
dosyaları yüklemek) en sorunsuzudur. Hiç para harcamak istemiyorsanız **B yolu**
(GitHub Pages) ücretsizdir ama iletişim formu için ek bir ayar gerekir.

---

## 0. Yayınlamadan önce mutlaka değiştirin

Dosyalarda emin olamadığım bilgileri köşeli parantezle `[...]` işaretledim.
Herhangi bir metin editörüyle (Windows'ta **Not Defteri**, daha rahatı
ücretsiz **Visual Studio Code**) şu dosyaları açıp güncelleyin:

| Ne | Nerede | Not |
|---|---|---|
| Telefon numarası | Tüm `.html` dosyaları: `+90 (5xx) xxx xx xx` ve `tel:+905000000000` | Düzenle → Tümünü Değiştir ile tek seferde yapabilirsiniz |
| Adres | Tüm `.html` dosyaları: `[Mahalle] Mah. ...` | Alt bilgi, iletişim sayfası ve KVKK metninde geçer |
| E-posta | `menekseilim@gmail.com` olarak yazıldı | Doğruysa bırakın; farklıysa tüm dosyalarda değiştirin |
| IBAN ve banka | `index.html` ve `bagis.html` | `TR00 0000 ...` ve `[Banka Adı]` |
| Dernek kütük numarası | Tüm sayfaların en altında `[000-000-000]` | Dernekler Bilgi Sistemi'ndeki numaranız |
| Yönetim kurulu isimleri | `hakkimizda.html` | `[Ad Soyad]` ve baş harfler (`AS`) |
| Instagram / YouTube | Tüm sayfalarda `href="#"` | Hesabınız yoksa o satırı silin |
| Haftalık program | `index.html` → "Ders ve etkinlik takvimi" tablosu | Örnek saatler yazdım |
| Duyurular | `index.html` ve `duyurular.html` | Örnek 4 duyuru var; birini kopyalayıp çoğaltın |
| Faaliyet metinleri | `faaliyetler.html` | Yapmadığınız bir faaliyet varsa o bölümü silin |
| Fotoğraflar | `img/yer-tutucu.svg` yazan her yer | Aşağıya bakın |
| Google Haritası | `iletisim.html` içindeki `HARİTA:` açıklaması | Google Haritalar → Paylaş → Harita yerleştir → kodu yapıştır |
| Tüzük PDF | `hakkimizda.html` → "buraya tıklayın (PDF)" | PDF'i `belgeler/tuzuk.pdf` gibi yükleyip bağlantıyı verin |

**Fotoğraf eklemek:** Fotoğrafları `img/` klasörüne kopyalayın (örn.
`img/kurs-1.jpg`). Boyutları 1600 px genişliği geçmesin; telefon fotoğraflarını
[squoosh.app](https://squoosh.app) ile küçültebilirsiniz. Sonra HTML'de
`img/yer-tutucu.svg` yazan yeri `img/kurs-1.jpg` ile değiştirin. Galeri
sayfasında her fotoğraf için bir satır var:

```html
<a href="img/kurs-1.jpg"><img src="img/kurs-1.jpg" alt="Kur'an dersi" loading="lazy"><figcaption>Kur'an-ı Kerim dersimizden</figcaption></a>
```

**Logo:** `img/logo.svg` ve `favicon.svg` dosyalarını kendi logonuzla
değiştirebilirsiniz (aynı dosya adıyla kaydedin, PNG kullanacaksanız HTML'deki
`logo.svg` yazan yerleri `logo.png` yapın).

---

## A yolu – Hosting satın alıp dosyaları yüklemek (önerilen)

### A1. Hosting paketi alın

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

Alan adı ile hosting aynı firmadaysa bu adımı atlayın.

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

## B yolu – GitHub Pages ile ücretsiz yayın

Hosting ücreti ödemeden, yalnızca alan adıyla yayın yapmak isterseniz:

### B1. Depo oluşturun ve dosyaları yükleyin

1. [github.com](https://github.com) hesabınızla giriş yapın → sağ üstte
   **+** → **New repository**. Ad: `menekseilim`, **Public** seçin → Create.
2. Açılan sayfada **uploading an existing file** bağlantısına tıklayın.
3. Bu klasörün içindeki tüm dosyaları (`index.html`, `css`, `js`, `img`,
   `CNAME` vb.) sürükleyip bırakın → **Commit changes**.
   * `CNAME` dosyası hazırdır ve içinde `menekseilim.com.tr` yazar; GitHub bu
     dosyaya bakarak alan adını tanır.
   * `.htaccess` ve `iletisim-gonder.php` GitHub Pages'ta çalışmaz;
     yüklemeniz zarar vermez, görmezden gelinir.

### B2. Pages'ı açın ve alan adını bağlayın

1. Depoda **Settings → Pages**.
2. **Source:** "Deploy from a branch", **Branch:** `main`, klasör `/ (root)`
   → Save.
3. **Custom domain** kutusuna `menekseilim.com.tr` yazın → Save.
4. Alan adı panelinizde **Alan Adı Yönetimi → menekseilim.com.tr → Yönetim →
   DNS Yönetimi** bölümüne şu kayıtları ekleyin:

   | Tür | Ad / Host | Değer |
   |---|---|---|
   | A | `@` | `185.199.108.153` |
   | A | `@` | `185.199.109.153` |
   | A | `@` | `185.199.110.153` |
   | A | `@` | `185.199.111.153` |
   | CNAME | `www` | `KULLANICIADINIZ.github.io` |

   (Eski A kayıtları varsa silin. Güncel IP'ler için
   [GitHub Pages belgelerine](https://docs.github.com/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site) bakın.)
5. DNS yayıldıktan sonra (genellikle 1 saat içinde) Settings → Pages
   sayfasında "DNS check successful" yazar. **Enforce HTTPS** kutusunu
   işaretleyin; GitHub ücretsiz SSL sertifikasını otomatik kurar.
6. `menekşeilim.com` için de aynı DNS kayıtlarını girin; GitHub Pages tek bir
   özel alan adı kabul ettiği için bu adresi alan adı panelinizin
   **Yönlendirme (URL Forwarding)** özelliğiyle `https://menekseilim.com.tr`
   adresine yönlendirin.

### B3. İletişim formu (Formspree)

GitHub Pages PHP çalıştırmadığı için formun gideceği yeri değiştirmeniz gerekir:

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
→ **Commit changes**. 1-2 dakika içinde site güncellenir.

---

## C yolu – Diğer ücretsiz seçenekler (kısaca)

* **Netlify Drop** ([app.netlify.com/drop](https://app.netlify.com/drop)):
  Klasörü tarayıcıya sürükleyin, site anında yayında. Site settings → Domain
  management → Add custom domain → ekranda gösterilen DNS kayıtlarını alan
  adı panelinize girin. Netlify'ın kendi ücretsiz form servisi vardır: form
  etiketine `data-netlify="true"` ekleyip `action` özniteliğini silmeniz
  yeterli.
* **Cloudflare Pages:** Benzer şekilde ücretsizdir; alan adının NS kayıtlarını
  Cloudflare'a taşımanız gerekir, karşılığında ücretsiz SSL ve hızlandırma
  gelir.

---

## Yayın sonrası kontrol listesi

- [ ] `https://menekseilim.com.tr` kilit simgesiyle açılıyor
- [ ] `http://` ve `www.` adresleri ana adrese yönleniyor
- [ ] `menekşeilim.com` ana adrese yönleniyor
- [ ] Telefonda menü (☰) açılıp kapanıyor
- [ ] İletişim formundan gönderilen deneme mesajı e-postaya düştü
- [ ] IBAN, telefon, adres ve kütük numarası gerçek bilgilerle değiştirildi
- [ ] Yer tutucu görseller gerçek fotoğraflarla değiştirildi
- [ ] [Google Search Console](https://search.google.com/search-console)'a site eklendi ve `https://menekseilim.com.tr/sitemap.xml` gönderildi
- [ ] Facebook sayfasının "Web sitesi" alanına adres yazıldı

## Sık karşılaşılan sorunlar

| Belirti | Sebep / çözüm |
|---|---|
| Sayfa yerine dosya listesi görünüyor | `index.html` `public_html` kökünde değil, bir alt klasörde kaldı. Dosyaları bir üst klasöre taşıyın. |
| Türkçe karakterler bozuk (Ã§, Ä± gibi) | Dosya UTF-8 dışında kaydedilmiş. Not Defteri'nde "Farklı Kaydet → Kodlama: UTF-8" seçin. |
| CSS yüklenmiyor, sayfa çıplak görünüyor | `css` klasörü yüklenmemiş ya da büyük/küçük harf farklı (`CSS/Style.css`). Linux sunucular harfe duyarlıdır. |
| "Çok fazla yönlendirme" hatası | `.htaccess` HTTPS satırlarını SSL kurulmadan açtınız veya Cloudflare'de SSL modu "Flexible". Satırları tekrar `#` ile kapatın ya da Cloudflare'de "Full" seçin. |
| Form "Mesaj şu an gönderilemiyor" diyor | PHP yok (GitHub Pages) ya da `mail()` kapalı → B3 Formspree. |
| Site güncelledim ama eski hâli görünüyor | Tarayıcı önbelleği. Ctrl+F5 ile yenileyin. |
| 403 Forbidden | Dosya izinleri: dosyalar 644, klasörler 755 olmalı (Dosya Yöneticisi → sağ tık → Permissions). |

## Yasal hatırlatmalar

* **KVKK:** `kvkk.html` sayfası genel bir aydınlatma metnidir; adres ve iletişim
  bilgilerini doldurun. Fotoğraflarda çocuklar varsa velilerden yazılı izin alın.
* **Bağış:** Dernekler, bağışları alındı belgesi (makbuz) karşılığında kabul
  eder. Kamuya açık yardım kampanyası (SMS, kumbara, geniş çaplı çağrı) 2860
  sayılı Yardım Toplama Kanunu kapsamında valilik izni gerektirebilir; web
  sitesinde yalnızca hesap numarası duyurmak genel uygulamada izin
  gerektirmez, ancak kampanya başlatmadan önce il sivil toplumla ilişkiler
  müdürlüğüne danışmanızı öneririm.
* **Alan adı yenileme:** Her iki alan adının bitiş tarihi **05.10.2027**.
  Panelde otomatik yenilemeyi açın; süresi dolan `.com.tr` alan adını geri
  almak zordur.

## Dosya yapısı

```
menekseilim-site/
├── index.html            Anasayfa
├── hakkimizda.html       Hakkımızda, misyon-vizyon, yönetim kurulu
├── faaliyetler.html      Faaliyet detayları
├── duyurular.html        Duyurular
├── galeri.html           Fotoğraf galerisi
├── bagis.html            Bağış bilgileri ve SSS
├── iletisim.html         İletişim bilgileri ve form
├── kvkk.html             KVKK aydınlatma metni
├── 404.html              Bulunamayan sayfa
├── iletisim-gonder.php   Form gönderici (PHP)
├── .htaccess             Yönlendirme, önbellek, güvenlik başlıkları (Apache)
├── CNAME                 GitHub Pages için alan adı
├── robots.txt, sitemap.xml
├── favicon.svg
├── css/style.css         Tüm stil
├── js/main.js            Menü, galeri, form, IBAN kopyalama
└── img/                  logo.svg, hero.svg, desen.svg, yer-tutucu.svg (+ fotoğraflarınız)
```

Renkleri değiştirmek isterseniz `css/style.css` dosyasının en üstündeki
`:root { --mor: ...; --altin: ...; }` değerlerini düzenlemeniz yeterlidir;
tüm site bu değişkenleri kullanır.
