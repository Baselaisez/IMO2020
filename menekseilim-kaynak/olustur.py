# -*- coding: utf-8 -*-
"""Menekşe Medreseleri web sitesinin HTML sayfalarını üretir.

Kullanım (depo kökünden):
    python3 menekseilim-kaynak/olustur.py

Bu betik yalnızca HTML sayfalarını, kişi yer tutucu görselini, sitemap'i ve
.htaccess dosyasını yazar. Stil (css/style.css), betik (js/main.js) ve form
gönderici (iletisim-gonder.php) doğrudan düzenlenir. Logo dosyaları için
logo_uret.py çalıştırılır.

Bilgileri değiştirmek için aşağıdaki AYARLAR bölümünü düzenleyin.
"""
import os

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(KOK, "menekseilim-site")

# ---------------------------------------------------------------- AYARLAR
SITE = "https://menekseilim.com.tr"
DERNEK = "Menekşe İlim Kültür Okuma Derneği"
MARKA = "Menekşe Medreseleri"
TELEFON = "0551 164 74 64"
TELEFON_LINK = "+905511647464"
EPOSTA = "menekseilim@gmail.com"
FACEBOOK = "https://www.facebook.com/menekseilimkulturokumadernegi/"
INSTAGRAM = "https://www.instagram.com/menekseilim/"
IBAN = "TR00 0000 0000 0000 0000 0000 00"   # gerçek IBAN ile değiştirin
BANKA = "[Banka adı ve şube]"               # gerçek banka bilgisiyle değiştirin

DERSLER = [
    "Kur'an-ı Kerim", "Tecvid", "Talim", "Makam",
    "İlmihal (dinî bilgiler)", "Peygamberler Tarihi", "İbadet", "Adab",
]
MEDRESELER = [  # (ad, yakında mı)
    ("Atalar Medresesi", False),
    ("Cevizli Medresesi", False),
    ("Kurfalı Medresesi", False),
    ("Topselvi Medresesi", True),
]
KADRO = [  # (ünvan, isim, fotoğraf) – fotoğraf img/kadro/ altına konur
    ("Dernek Başkanı", "", ""),
    ("Başkan Yardımcısı", "", ""),
    ("Başkan Yardımcısı", "", ""),
    ("Finans Müdürü", "", ""),
    ("İlmî Bölüm Başkanı", "", ""),
    ("Sınıf Hocası", "", ""),
    ("Sınıf Hocası", "", ""),
    ("Sınıf Hocası", "", ""),
]
TALEBE_FOTO_SAYISI = 14
VIDEOLAR = [  # (dosya, kapak, açıklama)
    ("tanitim", "tanitim", "Menekşe Medreselerinden bir gün"),
    ("merasim-1", "merasim-1-kapak", "Yıl sonu merasimi: talebelerimizin girişi"),
    ("merasim-2", "merasim-2", "Hocalarımız talebelerimizi tebrik ediyor"),
    ("merasim-3", "merasim-3", "Merasimde ailelerimizle birlikte"),
]
# -------------------------------------------------------------------------

IKON = {
    "tel": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z"/></svg>',
    "mail": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2.4V17h16V7.4l-8 5-8-5zM4.6 7l7.4 4.6L19.4 7H4.6z"/></svg>',
    "ig": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4zm0 1.8a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8zm5-2.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zM12 3c2.5 0 2.8 0 3.8.05 2.6.12 4 1.5 4.15 4.15.05 1 .05 1.3.05 3.8s0 2.8-.05 3.8c-.12 2.65-1.5 4.03-4.15 4.15-1 .05-1.3.05-3.8.05s-2.8 0-3.8-.05c-2.65-.12-4.03-1.5-4.15-4.15C4 13.8 4 13.5 4 11s0-2.8.05-3.8C4.17 4.55 5.55 3.17 8.2 3.05 9.2 3 9.5 3 12 3z"/></svg>',
    "fb": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8h3.3z"/></svg>',
    "ok": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3 1.4-1.4z"/></svg>',
    "menu": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>',
    "kapat": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4 6.4 5zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4z"/></svg>',
    # basit medrese simgesi: kubbe ve kapı
    "medrese": '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4c.6 0 1 .4 1 1v3.1c5.7 1.2 10 6.1 10 12V22h3a1 1 0 0 1 1 1v19h3v2H6v-2h3V23a1 1 0 0 1 1-1h3v-1.9c0-5.9 4.3-10.8 10-12V5c0-.6.4-1 1-1zm0 6c-5 0-9 4-9 9v3h18v-3c0-5-4-9-9-9zm-3 22v10h6V32a3 3 0 0 0-6 0zm-8-6v4h4v-4h-4zm18 0v4h4v-4h-4z"/></svg>',
}

KISI_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img" aria-label="Fotoğraf eklenecek">
  <rect width="400" height="500" fill="#EDE4CA"/>
  <circle cx="200" cy="190" r="78" fill="#D8CBA6"/>
  <path d="M60 500c8-96 66-158 140-158s132 62 140 158z" fill="#D8CBA6"/>
  <text x="200" y="470" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#7A6130">Fotoğraf eklenecek</text>
</svg>
"""


def yaz(rel, icerik):
    yol = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(yol), exist_ok=True)
    with open(yol, "w", encoding="utf-8") as f:
        f.write(icerik.lstrip("\n"))
    print("yazıldı:", rel)


MENU = [
    ("index.html", "Anasayfa"),
    ("hakkimizda.html", "Hakkımızda"),
    ("index.html#egitimlerimiz", "Eğitimlerimiz"),
    ("index.html#medreselerimiz", "Medreselerimiz"),
    ("talebelerimiz.html", "Talebelerimiz"),
    ("iletisim.html", "İletişim"),
]


def bas(baslik, aciklama, sayfa, kok=""):
    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{baslik}</title>
<meta name="description" content="{aciklama}">
<link rel="canonical" href="{SITE}/{'' if sayfa == 'index.html' else sayfa}">
<meta property="og:site_name" content="{MARKA}">
<meta property="og:title" content="{baslik}">
<meta property="og:description" content="{aciklama}">
<meta property="og:type" content="website">
<meta property="og:url" content="{SITE}/{'' if sayfa == 'index.html' else sayfa}">
<meta property="og:image" content="{SITE}/img/og-gorsel.png">
<meta name="theme-color" content="#123C41">
<link rel="icon" href="{kok}favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;1,500&amp;family=Source+Sans+3:wght@400;600;700&amp;display=swap">
<link rel="stylesheet" href="{kok}css/style.css">
</head>
<body>
<a class="atla" href="#icerik">İçeriğe geç</a>
<header class="ana-baslik">
  <div class="kapsayici baslik-ic">
    <a class="marka" href="{kok}index.html" aria-label="{MARKA} anasayfa"><img src="{kok}img/logo.svg" alt="{DERNEK}" width="257" height="55"></a>
    <button class="menu-ac" type="button" aria-controls="ana-menu" aria-expanded="false" aria-label="Menüyü aç">{IKON['menu']}</button>
    <nav class="ana-menu" id="ana-menu" aria-label="Ana menü">
      <button class="menu-kapat" type="button" aria-label="Menüyü kapat">{IKON['kapat']}</button>
      <ul>
{chr(10).join(f'        <li><a href="{kok}{h}">{t}</a></li>' for h, t in MENU)}
        <li class="menu-cta"><a href="{kok}bagis.html">Bağış Yap</a></li>
      </ul>
    </nav>
  </div>
</header>
<div class="perde"></div>
<main id="icerik">
"""


def son(kok=""):
    return f"""</main>
<footer class="alt-bilgi">
  <div class="kapsayici alt-izgara">
    <div>
      <img class="alt-logo" src="{kok}img/logo-acik.svg" alt="{DERNEK}" width="243" height="52">
      <p>Evlatlarımızın Kur'an-ı Kerim'le, ilimle ve güzel ahlakla yetişmesi için çalışıyoruz.</p>
    </div>
    <div>
      <h2>Sayfalar</h2>
      <ul>
        <li><a href="{kok}hakkimizda.html">Hakkımızda</a></li>
        <li><a href="{kok}index.html#egitimlerimiz">Eğitimlerimiz</a></li>
        <li><a href="{kok}talebelerimiz.html">Talebelerimiz</a></li>
        <li><a href="{kok}bagis.html">Bağış</a></li>
        <li><a href="{kok}iletisim.html">İletişim</a></li>
      </ul>
    </div>
    <div>
      <h2>Eğitim Saatleri</h2>
      <ul>
        <li>Gündüzlü: 09.00 – 20.00</li>
        <li>Yatılı: Pazar 21.00 giriş, Cumartesi 10.00 çıkış</li>
        <li>Hafta sonu ders yok</li>
      </ul>
    </div>
    <div>
      <h2>Bize Ulaşın</h2>
      <ul>
        <li><a href="tel:{TELEFON_LINK}">{TELEFON}</a></li>
        <li><a href="mailto:{EPOSTA}">{EPOSTA}</a></li>
        <li><a href="{INSTAGRAM}" target="_blank" rel="noopener">Instagram</a> · <a href="{FACEBOOK}" target="_blank" rel="noopener">Facebook</a></li>
      </ul>
    </div>
  </div>
  <div class="alt-cizgi">
    <div class="kapsayici">
      <span>© <span data-yil>2026</span> {DERNEK}</span>
      <a href="{kok}kvkk.html">KVKK Aydınlatma Metni</a>
    </div>
  </div>
</footer>
<script src="{kok}js/main.js"></script>
</body>
</html>
"""


def sayfa_basi(baslik, aciklama):
    return f"""<section class="sayfa-basi">
  <div class="kapsayici">
    <h1>{baslik}</h1>
    <p>{aciklama}</p>
  </div>
</section>
"""


def sayfa(dosya, baslik, aciklama, govde):
    yaz(dosya, bas(baslik, aciklama, dosya) + govde + son())


def video(v, kapak, sinif="video"):
    return (f'<video class="{sinif}" controls preload="none" playsinline poster="video/{kapak}.jpg" width="540" height="960">'
            f'<source src="video/{v}.mp4" type="video/mp4">'
            f'Tarayıcınız videoyu oynatamıyor. <a href="video/{v}.mp4">Videoyu indirin</a>.</video>')


def talebe(i):
    return (f'<a href="img/ogrenciler/ogrenci-{i:02d}.jpg"><img src="img/ogrenciler/ogrenci-{i:02d}-k.jpg" '
            f'alt="Menekşe Medreseleri talebesi" width="450" height="600" loading="lazy">'
            f'<figcaption>Talebemiz</figcaption></a>')


ISIK_KUTUSU = f"""
<figure class="isik-kutusu" hidden>
  <button type="button" aria-label="Kapat">{IKON['kapat']}</button>
  <img src="img/ogrenciler/ogrenci-01.jpg" alt="">
  <figcaption></figcaption>
</figure>
"""

EGITIM_KARTLARI = f"""
    <div class="izgara uc">
      <article class="kart">
        <h3>Gündüzlü eğitim</h3>
        <span class="saat">09.00 – 20.00</span>
        <p>Talebelerimiz sabah medreseye gelir, akşam evine döner.</p>
      </article>
      <article class="kart">
        <h3>Yatılı eğitim</h3>
        <span class="saat">Pazar 21.00 giriş<br>Cumartesi 10.00 çıkış</span>
        <p>Talebelerimiz hafta boyunca medresede kalır, hocalarının yanında yetişir.</p>
      </article>
      <article class="kart">
        <h3>Cemaatimiz için</h3>
        <span class="saat">Sohbet ve zikir</span>
        <p>Medrese dışında, cemaatimizle sohbet ve zikir halkalarında buluşuyoruz. Gün ve saat için bizi arayın.</p>
      </article>
    </div>
    <p class="alt-not">Hafta sonu ders yapmıyoruz. Eğitim haftamız Cumartesi öğlen biter.</p>"""


def medrese_kart(ad, yakinda):
    alt = "Çok yakında açılıyor" if yakinda else "Kayıtlar için bizi arayın"
    return (f'      <div class="medrese{" yakinda" if yakinda else ""}">{IKON["medrese"]}'
            f'<div><h3>{ad}</h3><p>{alt}</p></div></div>')


# ---------------------------------------------------------------- ANASAYFA
ANASAYFA = f"""
<section class="giris">
  <div class="kapsayici giris-ic">
    <div>
      <span class="ust-yazi">{MARKA}</span>
      <h1>Evlatlarımız Kur'an'la büyüsün</h1>
      <p class="aciklama">Medreselerimizde her gün Kur'an-ı Kerim'in bereketiyle başlar; ilim, edep ve güzel ahlakla devam eder.</p>
      <div class="butonlar">
        <a class="btn btn-yesil" href="tel:{TELEFON_LINK}">{IKON['tel']} Bizi arayın</a>
        <a class="btn btn-cizgi" href="#egitimlerimiz">Eğitimlerimiz</a>
      </div>
      <p class="telefon-not">Bilgi ve kayıt: <strong>{TELEFON}</strong></p>
    </div>
    <div class="giris-video">
      {video("tanitim", "tanitim")}
    </div>
  </div>
</section>

<section class="bolum" id="egitimlerimiz">
  <div class="kapsayici">
    <div class="bolum-basi">
      <h2>Eğitimlerimiz</h2>
      <p>İster gündüzlü ister yatılı, talebelerimiz hafızlık yolunda hocalarımızla birlikte ilerler.</p>
    </div>
{EGITIM_KARTLARI}
  </div>
</section>

<section class="bolum bolum-bej" id="derslerimiz">
  <div class="kapsayici">
    <div class="bolum-basi">
      <h2>Derslerimiz</h2>
    </div>
    <ul class="dersler">
{chr(10).join(f'      <li>{d}</li>' for d in DERSLER)}
    </ul>
    <p class="alinti">"Hafızlık sadece ezber değildir. Sabrı öğrenmek, disiplini kazanmak, kardeşliği yaşamak ve Allah'ın kelamıyla büyümektir."</p>
  </div>
</section>

<section class="bolum" id="medreselerimiz">
  <div class="kapsayici">
    <div class="bolum-basi">
      <h2>Medreselerimiz</h2>
      <p>Atalar, Cevizli ve Kurfalı medreselerimizde hizmet veriyoruz. Topselvi Medresemizi de çok yakında açıyoruz inşallah.</p>
    </div>
    <div class="izgara dort">
{chr(10).join(medrese_kart(a, y) for a, y in MEDRESELER)}
    </div>
  </div>
</section>

<section class="bolum bolum-bej">
  <div class="kapsayici">
    <div class="bolum-basi">
      <h2>Talebelerimiz</h2>
      <p>Derste de, merasimde de, birlikte geçen her günde.</p>
    </div>
    <div class="galeri">
{chr(10).join('      ' + talebe(i) for i in (1, 3, 9, 12))}
    </div>
    <p class="alt-not"><a class="btn btn-cizgi" href="talebelerimiz.html">Tüm fotoğraflar ve videolar {IKON['ok']}</a></p>
  </div>
</section>

<section class="bolum cagri">
  <div class="kapsayici">
    <h2>Siz de evladınızın Kur'an'ın nuruyla yetişmesini istiyorsanız, sizi Menekşe Medreselerine bekliyoruz.</h2>
    <p>Kayıt ve her türlü sorunuz için bizi arayabilirsiniz.</p>
    <div class="butonlar">
      <a class="btn btn-acik" href="tel:{TELEFON_LINK}">{IKON['tel']} {TELEFON}</a>
      <a class="btn btn-cizgi-acik" href="bagis.html">Bağışla destek olun</a>
    </div>
  </div>
</section>
{ISIK_KUTUSU}"""

sayfa("index.html", f"{MARKA} | {DERNEK}",
      "Menekşe Medreseleri: gündüzlü ve yatılı hafızlık eğitimi, Kur'an-ı Kerim, tecvid, ilmihal ve daha fazlası. Atalar, Cevizli ve Kurfalı medreselerimiz.",
      ANASAYFA)


# ---------------------------------------------------------------- HAKKIMIZDA
def kisi(unvan, isim, foto):
    src = f"img/kadro/{foto}" if foto else "img/kisi.svg"
    ad = isim or "İsim eklenecek"
    return (f'      <div class="kisi"><img src="{src}" alt="{isim + ", " if isim else ""}{unvan}" width="400" height="500" loading="lazy">'
            f'<h3>{ad}</h3><p>{unvan}</p></div>')


HAKKIMIZDA = sayfa_basi("Hakkımızda", "Kimiz, ne yapıyoruz? Kısaca anlatalım.") + f"""
<section class="bolum">
  <div class="kapsayici yan-yana">
    <div class="yazi">
      <p>{DERNEK} olarak, çocuklarımızın Kur'an-ı Kerim'le, ilimle ve güzel ahlakla yetişmesi için çalışıyoruz. Medreselerimize "{MARKA}" diyoruz.</p>
      <p>Eğitim programımız Salih Gedik Hocamızın riyasetinde yürütülüyor. Evlatlarımız hem hafızlık yolunda ilerliyor hem de millî ve manevî değerlerle yetişiyor.</p>
      <p>Bugün Atalar, Cevizli ve Kurfalı medreselerimizde hizmet veriyoruz. Topselvi Medresemizi de çok yakında açıyoruz inşallah.</p>
    </div>
    <img src="img/medrese-ders.jpg" alt="Hocamız bir talebemizin okuyuşunu dinliyor" width="576" height="720" loading="lazy">
  </div>
</section>

<section class="bolum bolum-bej">
  <div class="kapsayici izgara iki">
    <article class="kart">
      <h3>Sohbet ve zikir halkalarımız</h3>
      <p>Medreselerimizin dışında, cemaatimizle sohbet ve zikir halkalarında bir araya geliyoruz. Gün ve saatleri öğrenmek için bizi arayabilirsiniz.</p>
    </article>
    <article class="kart">
      <h3>Sosyal etkinliklerimiz</h3>
      <p>Talebelerimiz sadece derste değil, birlikte vakit geçirirken de büyür. Yıl içinde sosyal etkinlikler yapıyor, eğitim yılını ailelerimizle birlikte yıl sonu merasimiyle tamamlıyoruz.</p>
    </article>
  </div>
</section>

<section class="bolum" id="kadromuz">
  <div class="kapsayici">
    <div class="bolum-basi">
      <h2>Kadromuz</h2>
      <p>Derneğimizi ve medreselerimizi yürüten hocalarımız ve yöneticilerimiz.</p>
    </div>
    <div class="kadro">
{chr(10).join(kisi(*k) for k in KADRO)}
    </div>
  </div>
</section>
"""
sayfa("hakkimizda.html", f"Hakkımızda | {MARKA}",
      "Menekşe İlim Kültür Okuma Derneği ve Menekşe Medreseleri hakkında: eğitim anlayışımız, sohbet ve zikir halkalarımız, sosyal etkinliklerimiz ve kadromuz.",
      HAKKIMIZDA)


# ---------------------------------------------------------------- TALEBELERİMİZ
TALEBELER = sayfa_basi("Talebelerimiz", "Evlatlarımızdan kareler: derslerimizden ve yıl sonu merasimimizden.") + f"""
<section class="bolum">
  <div class="kapsayici">
    <div class="bolum-basi"><h2>Videolar</h2></div>
    <div class="videolar">
{chr(10).join(f'      <figure>{video(v, k)}<figcaption>{a}</figcaption></figure>' for v, k, a in VIDEOLAR)}
    </div>
  </div>
</section>

<section class="bolum bolum-bej">
  <div class="kapsayici">
    <div class="bolum-basi">
      <h2>Fotoğraflar</h2>
      <p>Büyütmek için fotoğrafa dokunun.</p>
    </div>
    <div class="galeri yedili">
{chr(10).join('      ' + talebe(i) for i in range(1, TALEBE_FOTO_SAYISI + 1))}
    </div>
    <p class="alt-not">Fotoğraflar velilerimizin izniyle yayınlanmaktadır. Bir fotoğrafın kaldırılmasını isterseniz bize haber vermeniz yeterli. Daha fazlası için <a href="{INSTAGRAM}" target="_blank" rel="noopener">Instagram hesabımızı</a> takip edebilirsiniz.</p>
  </div>
</section>
{ISIK_KUTUSU}"""
sayfa("talebelerimiz.html", f"Talebelerimiz | {MARKA}",
      "Menekşe Medreseleri talebelerinden fotoğraflar ve yıl sonu merasimi videoları.", TALEBELER)


# ---------------------------------------------------------------- BAĞIŞ
BAGIS = sayfa_basi("Bağış", "Bir talebemizin eğitimine siz de ortak olun.") + f"""
<section class="bolum">
  <div class="kapsayici izgara iki">
    <div class="yazi">
      <p>Medreselerimizin bütün giderleri hayırseverlerimizin desteğiyle karşılanıyor: talebelerimizin yemeği, kitapları, medreselerimizin kirası, ısınması.</p>
      <p>Yapacağınız her bağış, bir evladımızın Kur'an'la büyümesine vesile olur. Allah razı olsun.</p>
      <p>Bağışınız için dernek makbuzu veriyoruz. Dekontu bize telefonla ya da e-postayla iletmeniz yeterli.</p>
    </div>
    <div class="iban-kart">
      <h2 style="font-size:1.4rem">Banka hesabımız</h2>
      <dl>
        <dt>Hesap adı</dt><dd>{DERNEK}</dd>
        <dt>Banka</dt><dd>{BANKA}</dd>
        <dt>IBAN</dt><dd><code id="iban">{IBAN}</code></dd>
      </dl>
      <button class="btn btn-yesil" type="button" data-kopyala="#iban">IBAN'ı kopyala</button>
    </div>
  </div>
</section>
"""
sayfa("bagis.html", f"Bağış | {MARKA}",
      "Menekşe Medreseleri'ne bağış yapın: banka hesap bilgilerimiz.", BAGIS)


# ---------------------------------------------------------------- İLETİŞİM
ILETISIM = sayfa_basi("İletişim", "Kayıt, bilgi ya da sadece hal hatır için bize ulaşın.") + f"""
<section class="bolum">
  <div class="kapsayici iletisim-izgara">
    <div>
      <ul class="bilgi">
        <li><span class="simge">{IKON['tel']}</span><div><small>Telefon</small><a href="tel:{TELEFON_LINK}">{TELEFON}</a></div></li>
        <li><span class="simge">{IKON['mail']}</span><div><small>E-posta</small><a href="mailto:{EPOSTA}">{EPOSTA}</a></div></li>
        <li><span class="simge">{IKON['ig']}</span><div><small>Instagram</small><a href="{INSTAGRAM}" target="_blank" rel="noopener">@menekseilim</a></div></li>
      </ul>
      <h2 style="font-size:1.4rem">Medreselerimiz</h2>
      <ul class="medrese-liste">
{chr(10).join(f'        <li><b>{a}</b>{" · çok yakında" if y else ""}</li>' for a, y in MEDRESELER)}
      </ul>
      <p class="alt-not">Adres ve yol tarifi için bizi arayabilirsiniz.</p>
    </div>

    <form class="form" id="iletisim-formu" action="iletisim-gonder.php" method="post" data-eposta="{EPOSTA}" novalidate>
      <h2 style="font-size:1.5rem">Bize yazın</h2>
      <div class="form-sonuc" role="status" aria-live="polite"></div>
      <div class="alan"><label for="ad">Adınız soyadınız</label><input id="ad" name="ad" type="text" autocomplete="name" required maxlength="120"></div>
      <div class="iki-alan">
        <div class="alan"><label for="telefon">Telefon</label><input id="telefon" name="telefon" type="tel" autocomplete="tel" maxlength="40" placeholder="05xx xxx xx xx"></div>
        <div class="alan"><label for="eposta">E-posta</label><input id="eposta" name="eposta" type="email" autocomplete="email" maxlength="200"></div>
      </div>
      <div class="alan"><label for="mesaj">Mesajınız</label><textarea id="mesaj" name="mesaj" required maxlength="4000"></textarea></div>
      <div class="bal-kupu" aria-hidden="true"><label for="website">Web sitesi</label><input id="website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
      <label class="onay"><input type="checkbox" name="kvkk" id="kvkk" value="1" required><span><a href="kvkk.html" target="_blank">Aydınlatma metnini</a> okudum, bilgilerimin bana dönüş yapılması için kullanılmasını kabul ediyorum.</span></label>
      <button class="btn btn-yesil" type="submit">Gönder {IKON['ok']}</button>
    </form>
  </div>
</section>
"""
sayfa("iletisim.html", f"İletişim | {MARKA}",
      f"Menekşe Medreseleri iletişim: telefon {TELEFON}, e-posta ve medreselerimiz.", ILETISIM)


# ---------------------------------------------------------------- KVKK
KVKK = sayfa_basi("KVKK Aydınlatma Metni", "Kişisel verileriniz hakkında kısa bilgilendirme.") + f"""
<section class="bolum">
  <div class="kapsayici dar">
    <p><strong>Veri sorumlusu:</strong> {DERNEK}, İstanbul. İletişim: {TELEFON}, {EPOSTA}</p>
    <h2>Hangi bilgileri, neden alıyoruz?</h2>
    <p>İletişim formunda yazdığınız adınız, telefonunuz, e-postanız ve mesajınızı yalnızca size dönüş yapmak, kayıt işlerinizi yürütmek ve bağış makbuzu hazırlamak için kullanıyoruz.</p>
    <h2>Kimlerle paylaşıyoruz?</h2>
    <p>Bilgileriniz kanunun zorunlu kıldığı durumlar dışında kimseyle paylaşılmaz. Form mesajları yalnızca dernek yetkililerinin erişebildiği e-posta hesabımıza gelir.</p>
    <h2>Fotoğraf ve videolar</h2>
    <p>Sitemizdeki talebe fotoğrafları ve videolar velilerimizin izniyle yayınlanır. Kaldırılmasını istediğiniz bir görsel için bize ulaşmanız yeterlidir.</p>
    <h2>Haklarınız</h2>
    <p>6698 sayılı Kanun'un 11. maddesi gereği bilgilerinizin işlenip işlenmediğini öğrenebilir, düzeltilmesini ya da silinmesini isteyebilirsiniz. Bunun için {EPOSTA} adresine yazabilirsiniz.</p>
    <p>Sitemiz reklam veya takip çerezi kullanmaz.</p>
  </div>
</section>
"""
sayfa("kvkk.html", f"KVKK Aydınlatma Metni | {MARKA}",
      "Menekşe İlim Kültür Okuma Derneği kişisel verilerin korunması aydınlatma metni.", KVKK)


# ---------------------------------------------------------------- 404
HATA = f"""
<section class="hata-sayfa">
  <div class="kapsayici">
    <img src="/img/muhur.svg" alt="" width="120" height="120">
    <h1>Bu sayfayı bulamadık</h1>
    <p>Sayfa taşınmış ya da kaldırılmış olabilir.</p>
    <p><a class="btn btn-yesil" href="/">Anasayfaya dön</a></p>
  </div>
</section>
"""
yaz("404.html", bas(f"Sayfa bulunamadı | {MARKA}", "Aradığınız sayfa bulunamadı.", "404.html", kok="/") + HATA + son(kok="/"))

# ---------------------------------------------------------------- yardımcı dosyalar
yaz("img/kisi.svg", KISI_SVG)

SAYFALAR = ["index.html", "hakkimizda.html", "talebelerimiz.html", "bagis.html", "iletisim.html", "kvkk.html"]
yaz("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{SITE}/{'' if s == 'index.html' else s}</loc></url>\n" for s in SAYFALAR)
    + "</urlset>\n")

yaz(".htaccess", r"""# Menekşe Medreseleri – Apache ayarları (cPanel hosting)
AddDefaultCharset UTF-8
Options -Indexes
DirectoryIndex index.html index.php
ErrorDocument 404 /404.html

<IfModule mod_rewrite.c>
  RewriteEngine On

  # 1) HTTPS'e yönlendir: SSL sertifikası KURULDUKTAN SONRA alttaki iki satırın başındaki # işaretini kaldırın.
  # RewriteCond %{HTTPS} off
  # RewriteRule ^(.*)$ https://%{HTTP_HOST}/$1 [R=301,L]

  # 2) www'suz adrese yönlendir
  RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]
  RewriteRule ^ %{REQUEST_SCHEME}://%1%{REQUEST_URI} [R=301,L]

  # 3) menekşeilim.com (xn--menekeilim-i9b.com) adresini ana adrese yönlendir
  RewriteCond %{HTTP_HOST} ^(www\.)?xn--menekeilim-i9b\.com$ [NC]
  RewriteRule ^ https://menekseilim.com.tr%{REQUEST_URI} [R=301,L]

  # 4) Eski sayfa adresleri
  RewriteRule ^faaliyetler\.html$ /#egitimlerimiz [R=301,NE,L]
  RewriteRule ^galeri\.html$ /talebelerimiz.html [R=301,L]
  RewriteRule ^duyurular\.html$ / [R=301,L]
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 7 days"
  ExpiresByType application/javascript "access plus 7 days"
  ExpiresByType image/svg+xml "access plus 30 days"
  ExpiresByType image/jpeg "access plus 30 days"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType video/mp4 "access plus 30 days"
</IfModule>

<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
""")

# Artık kullanılmayan eski dosyalar
for eski in ["duyurular.html", "faaliyetler.html", "galeri.html", "img/amblem.svg", "img/isaret.svg",
             "img/yer-tutucu.svg", "img/hero.svg", "video/merasim-1.jpg"]:
    yol = os.path.join(OUT, eski)
    if os.path.exists(yol):
        os.remove(yol)
        print("silindi:", eski)
print("tamam")
