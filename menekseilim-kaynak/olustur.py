# -*- coding: utf-8 -*-
"""Menekşe Medreseleri web sitesinin sayfalarını üretir.

Kullanım (depo kökünden):
    python3 menekseilim-kaynak/olustur.py

Üretilenler (menekseilim-site/ altında):
    index.html, hakkimizda.html, egitimlerimiz.html, heyetimiz.html,
    bagis.html, iletisim.html, kvkk.html, 404.html   gerçek site sayfaları
    onizleme.html   bütün sayfaları tek dosyada toplayan önizleme (sunucuya yüklenmez)
    img/desen-altin.svg, sitemap.xml, .htaccess

Stil (css/style.css, css/fonts.css), betik (js/main.js) ve form gönderici
(iletisim-gonder.php) doğrudan düzenlenir. Logo dosyaları için logo_uret.py.
Bilgileri değiştirmek için aşağıdaki AYARLAR bölümünü düzenleyin.
"""
import base64
import json
import math
import os
import re

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(KOK, "menekseilim-site")

# ================================================================ AYARLAR
SITE = "https://menekseilim.com.tr"
DERNEK = "Menekşe İlim Kültür Okuma Derneği"
MARKA = "Menekşe Medreseleri"
TELEFON = "0551 164 74 64"
TELEFON_LINK = "+905511647464"
EPOSTA = "menekseilim@gmail.com"
FACEBOOK = "https://www.facebook.com/menekseilimkulturokumadernegi/"
INSTAGRAM = "https://www.instagram.com/menekseilim/"
KAMU_YARARI = "Cumhurbaşkanı Kararı ile kamu yararına çalışan dernek"
KAMU_YARARI_KARAR = ""   # biliniyorsa: "12.03.2024 tarihli ve 1234 sayılı Cumhurbaşkanı Kararı"

# Bağış alanları: her biri ayrı bir kart olarak gösterilir. IBAN'lar gelince doldurun,
# yeni alan için listeye bir sözlük daha ekleyin.
BAGIS_HESAPLARI = [
    {
        "id": "genel",
        "baslik": "Genel bağış",
        "ar": "صدقة",
        "aciklama": "Medreselerimizin en acil ihtiyacına harcanır: talebelerimizin eğitimi, iaşesi ve medreselerimizin giderleri.",
        "banka": "[Banka ve şube adı]",
        "iban": "TR00 0000 0000 0000 0000 0000 00",
    },
]

MEDRESELER = [  # (ad, yakında mı)
    ("Atalar Medresesi", False),
    ("Cevizli Medresesi", False),
    ("Kurfalı Medresesi", False),
    ("Topselvi Medresesi", True),
]

# Müfredat: (grup, arapça, grup açıklaması, [(ders, arapça, açıklama), ...])
MUFREDAT = [
    ("Kur'an-ı Kerim", "القرآن الكريم",
     "Harfleri tanımaktan hafızlığa: Kur'an'ı doğru, güzel ve ezberden okumak.",
     [("Elif-Ba", "ألفبا", "Arap harflerini tanıma ve Kur'an okumaya ilk adım"),
      ("Kur'an-ı Kerim", "القرآن الكريم", "Yüzünden akıcı okuma ve hafızlık"),
      ("Tecvid", "تجويد", "Kur'an'ı kurallarına uygun, doğru okuma ilmi"),
      ("Kıraat", "قراءات", "Kur'an'ın okunuş usullerini öğreten ilim"),
      ("Talim ve Makam", "تعليم ومقام", "Hocayla birebir okuyuş ve Kur'an'ı güzel sesle okuma")]),
    ("Temel İslami ilimler", "علوم دينية",
     "Her Müslümanın bilmesi gereken farz-ı ayn bilgiler ve Peygamber Efendimiz'in hayatı.",
     [("İlm-i Hal", "علم حال", "İman, ibadet ve günlük hayata dair temel dinî bilgiler"),
      ("Siyer", "سيرة", "Peygamber Efendimiz'in (s.a.v.) hayatı"),
      ("Adab", "آداب", "Güzel ahlak ve edep")]),
    ("Arapça: Sarf", "صرف",
     "Kelimelerin yapısını öğreten ilim; medrese usulüyle, klasik kitaplardan.",
     [("Emsile", "الأمثلة", "Arapça kelime kalıpları; sarfa giriş"),
      ("Binâ", "البناء", "Fiillerin yapısı ve çekimleri"),
      ("Maksûd", "المقصود", "Sarf ilminin temel kaideleri")]),
    ("Arapça: Nahiv", "نحو",
     "Cümlenin yapısını öğreten ilim; Kur'an'ı ve klasik eserleri anlamanın anahtarı.",
     [("Avâmil", "العوامل", "Kelimeye etki eden âmiller; nahve giriş"),
      ("İzhâr", "الإظهار", "Nahiv ilminin temel kaideleri")]),
]

YOLCULUK = [  # anasayfadaki dört adım: (arapça, başlık, açıklama)
    ("ألفبا", "Elif-Ba", "Harfleri tanır, Kur'an okumaya ilk adımı atar."),
    ("القرآن", "Kur'an-ı Kerim", "Tecvid ve kıraatle Kur'an'ı doğru okur, hafızlık yolunda ilerler."),
    ("علم حال", "Temel ilimler", "İlm-i Hal, Siyer ve Adab ile farz-ı ayn bilgileri öğrenir."),
    ("العربية", "Arapça", "Sarf ve nahivle Emsile'den İzhâr'a uzanan Arapça eğitimi alır."),
]

HEYET = [  # (fotoğraf img/heyet/ altında, isim, ünvan) – isim boşsa yalnız ünvan görünür
    ("heyet-1.jpg", "", "Yönetim Kurulu Üyesi"),
    ("heyet-2.jpg", "", "Yönetim Kurulu Üyesi"),
    ("heyet-3.jpg", "", "Yönetim Kurulu Üyesi"),
    ("heyet-4.jpg", "", "Yönetim Kurulu Üyesi"),
]
ONE_CIKAN_HOCA = {"isim": "Salih Gedik Hocamız", "foto": "img/hocalar/salih-gedik.jpg"}

VIDEOLAR = [  # (dosya, kapak, açıklama)
    ("merasim-1", "merasim-1-kapak", "Talebelerimizin merasim alanına girişi"),
    ("merasim-2", "merasim-2", "Hocalarımız talebelerimizi tebrik ediyor"),
    ("merasim-3", "merasim-3", "Ailelerimiz ve misafirlerimizle"),
]
# =======================================================================


def yildiz_yolu(cx=12, cy=12, R=11):
    """Sekiz köşeli yıldız (iki üst üste kare) için SVG path."""
    r = R * 0.7654
    noktalar = []
    for i in range(16):
        a = math.radians(i * 22.5 - 90)
        rr = R if i % 2 == 0 else r
        noktalar.append(f"{cx + rr * math.cos(a):.2f} {cy + rr * math.sin(a):.2f}")
    return "M" + " L".join(noktalar) + "Z"


IKON = {
    "tel": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25c1.1.37 2.3.57 3.6.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1L6.6 10.8z"/></svg>',
    "mail": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2.4V17h16V7.4l-8 5-8-5zM4.6 7l7.4 4.6L19.4 7H4.6z"/></svg>',
    "ig": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.3a4.7 4.7 0 1 1 0 9.4 4.7 4.7 0 0 1 0-9.4zm0 1.8a2.9 2.9 0 1 0 0 5.8 2.9 2.9 0 0 0 0-5.8zm5-2.1a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2zM12 3c2.5 0 2.8 0 3.8.05 2.6.12 4 1.5 4.15 4.15.05 1 .05 1.3.05 3.8s0 2.8-.05 3.8c-.12 2.65-1.5 4.03-4.15 4.15-1 .05-1.3.05-3.8.05s-2.8 0-3.8-.05c-2.65-.12-4.03-1.5-4.15-4.15C4 13.8 4 13.5 4 11s0-2.8.05-3.8C4.17 4.55 5.55 3.17 8.2 3.05 9.2 3 9.5 3 12 3z"/></svg>',
    "ok": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.2 5.3 19.9 12l-6.7 6.7-1.4-1.4 4.3-4.3H4v-2h12.1l-4.3-4.3 1.4-1.4z"/></svg>',
    "menu": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>',
    "kapat": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4 6.4 5zm12.6 1.4L6.4 19 5 17.6 17.6 5 19 6.4z"/></svg>',
    "kalkan": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3zm-1.2 14.2-3.5-3.5 1.4-1.4 2.1 2.1 4.9-4.9 1.4 1.4-6.3 6.3z"/></svg>',
    "kalp": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2 0 3.6 1.1 4.3 2.6h2c.7-1.5 2.3-2.6 4.3-2.6 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>',
    "yildiz": f'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="{yildiz_yolu()}"/></svg>',
    "medrese": '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4c.6 0 1 .4 1 1v3.1c5.7 1.2 10 6.1 10 12V22h3a1 1 0 0 1 1 1v19h3v2H6v-2h3V23a1 1 0 0 1 1-1h3v-1.9c0-5.9 4.3-10.8 10-12V5c0-.6.4-1 1-1zm0 6c-5 0-9 4-9 9v3h18v-3c0-5-4-9-9-9zm-3 22v10h6V32a3 3 0 0 0-6 0zm-8-6v4h4v-4h-4zm18 0v4h4v-4h-4z"/></svg>',
    "gunes": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8"/></svg>',
    "ay": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/><path d="m17 4 .7 1.6 1.6.7-1.6.7L17 8.6l-.7-1.6-1.6-.7 1.6-.7z"/></svg>',
    "cemaat": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7.5" r="3.5"/><path d="M2.5 20.5v-1.5a5 5 0 0 1 5-5h3a5 5 0 0 1 5 5v1.5"/><path d="M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.4a5 5 0 0 1 3 4.6v1.5"/></svg>',
}

DESEN_ALTIN = """<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <g fill="none" stroke="#DCC690" stroke-width="1.2">
    <rect x="30" y="30" width="36" height="36"/>
    <rect x="30" y="30" width="36" height="36" transform="rotate(45 48 48)"/>
    <circle cx="48" cy="48" r="7"/>
    <path d="M48 0v22.5M48 73.5V96M0 48h22.5M73.5 48H96"/>
    <path d="M0 18 18 0M78 0l18 18M0 78l18 18M78 96l18-18"/>
  </g>
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
    ("egitimlerimiz.html", "Eğitimlerimiz"),
    ("index.html#medreselerimiz", "Medreselerimiz"),
    ("heyetimiz.html", "Heyetimiz"),
    ("iletisim.html", "İletişim"),
]

ACILIS_BETIK = ('<script>(function(){var k=document.documentElement;try{if(!sessionStorage.getItem("acilis")){'
                'k.classList.add("acilis-goster");sessionStorage.setItem("acilis","1");}}catch(e){k.classList.add("acilis-goster");}})();</script>')


def acilis(kok=""):
    return f"""<div class="acilis" role="presentation">
  <div class="acilis-ic">
    <p class="acilis-besmele" lang="ar">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</p>
    <img class="acilis-muhur" src="{kok}img/muhur.svg" alt="" width="168" height="168">
    <p class="acilis-hat" lang="ota">منكشه درنكی</p>
    <p class="acilis-ad">Menekşe Derneği</p>
    <p class="acilis-alt">İlim · Kültür · Okuma</p>
  </div>
  <button class="acilis-gec" type="button">Siteye geç</button>
</div>
"""


def bas(baslik, aciklama, sayfa, kok="", ek_head="", font_css=None, spa=False):
    yol = "" if sayfa == "index.html" else sayfa
    fontlar = f'<style>{font_css}</style>' if font_css else f'<link rel="stylesheet" href="{kok}css/fonts.css">'
    return f"""<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{baslik}</title>
<meta name="description" content="{aciklama}">
<link rel="canonical" href="{SITE}/{yol}">
<meta property="og:site_name" content="{MARKA}">
<meta property="og:title" content="{baslik}">
<meta property="og:description" content="{aciklama}">
<meta property="og:type" content="website">
<meta property="og:url" content="{SITE}/{yol}">
<meta property="og:image" content="{SITE}/img/og-gorsel.png">
<meta name="theme-color" content="#123C41">
<link rel="icon" href="{kok}favicon.svg" type="image/svg+xml">
{fontlar}
<link rel="stylesheet" href="{kok}css/style.css">
{ACILIS_BETIK}
{ek_head}</head>
<body{' data-spa' if spa else ''}>
<a class="atla" href="#icerik">İçeriğe geç</a>
{acilis(kok)}<header class="ana-baslik">
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
<footer class="alt-bilgi koyu">
  <div class="kapsayici alt-izgara">
    <div>
      <img class="alt-logo" src="{kok}img/logo-acik.svg" alt="{DERNEK}" width="243" height="52">
      <p>Evlatlarımızın Kur'an-ı Kerim'le, ilimle ve güzel ahlakla yetişmesi için çalışıyoruz.</p>
      <p class="alt-statu">{IKON['kalkan']} {KAMU_YARARI}</p>
    </div>
    <div>
      <h2>Sayfalar</h2>
      <ul>
        <li><a href="{kok}hakkimizda.html">Hakkımızda</a></li>
        <li><a href="{kok}egitimlerimiz.html">Eğitimlerimiz</a></li>
        <li><a href="{kok}heyetimiz.html">Heyetimiz</a></li>
        <li><a href="{kok}bagis.html">Bağış</a></li>
        <li><a href="{kok}iletisim.html">İletişim</a></li>
      </ul>
    </div>
    <div>
      <h2>Eğitim saatleri</h2>
      <ul>
        <li>Gündüzlü: 09.00 – 20.00</li>
        <li>Yatılı: Pazar 21.00 giriş, Cumartesi 10.00 çıkış</li>
        <li>Hafta sonu ders yapılmaz</li>
      </ul>
    </div>
    <div>
      <h2>Bize ulaşın</h2>
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
<nav class="mobil-cubuk" aria-label="Hızlı erişim">
  <a class="ara" href="tel:{TELEFON_LINK}">{IKON['tel']} Bizi arayın</a>
  <a class="bagis" href="{kok}bagis.html">{IKON['kalp']} Bağış yapın</a>
</nav>
<script src="{kok}js/main.js"></script>
</body>
</html>
"""


def sus():
    return f'<div class="sus">{IKON["yildiz"]}</div>'


def bolum_basi(baslik, ar="", aciklama="", orta=False, h="h2"):
    ust = f'<span class="ar-ust" lang="ar">{ar}</span>' if ar else ""
    p = f"<p>{aciklama}</p>" if aciklama else ""
    return f'<div class="bolum-basi{" orta" if orta else ""}">{ust}<{h}>{baslik}</{h}>{sus()}{p}</div>'


def sayfa_basi(baslik, aciklama, ar=""):
    ust = f'<span class="ar-ust" lang="ar">{ar}</span>' if ar else ""
    return f"""<section class="sayfa-basi koyu">
  <div class="kapsayici">
    {ust}<h1>{baslik}</h1>
    <p>{aciklama}</p>
  </div>
</section>
"""


def video(v, kapak):
    return (f'<video class="video" controls preload="none" playsinline poster="video/{kapak}.jpg" width="540" height="960">'
            f'<source src="video/{v}.mp4" type="video/mp4">'
            f'Tarayıcınız videoyu oynatamıyor. <a href="video/{v}.mp4">Videoyu indirin</a>.</video>')


def kisi(foto, isim, unvan, yukle="lazy"):
    baslik = f"<h3>{isim}</h3><p>{unvan}</p>" if isim else f"<h3>{unvan}</h3>"
    alt = f"{isim}, {unvan}" if isim else f"{DERNEK} {unvan.lower()}"
    return (f'<div class="kisi"><div class="kisi-foto"><img src="img/heyet/{foto}" alt="{alt}" width="640" height="800" loading="{yukle}"></div>'
            f'{baslik}</div>')


HOCA_METNI = ("Medreselerimizdeki eğitim programı Salih Gedik Hocamızın riyasetinde yürütülüyor. "
              "Talebelerimiz onun rehberliğinde hem hafızlık yolunda ilerliyor hem de millî ve manevî değerlerle yetişiyor.")

HIZMET_KARTLARI = f"""
    <div class="izgara uc">
      <article class="kart">
        <div class="kart-ikon">{IKON['gunes']}</div>
        <h3>Gündüzlü eğitim</h3>
        <span class="saat">09.00 – 20.00</span>
        <p>Talebelerimiz sabah medreseye gelir, gün boyu derslerini görür, akşam ailesinin yanına döner.</p>
      </article>
      <article class="kart">
        <div class="kart-ikon">{IKON['ay']}</div>
        <h3>Yatılı eğitim</h3>
        <span class="saat">Pazar 21.00 giriş<br>Cumartesi 10.00 çıkış</span>
        <p>Talebelerimiz hafta boyunca medresede kalır; hocalarının yanında, kardeşlik içinde yetişir.</p>
      </article>
      <article class="kart">
        <div class="kart-ikon">{IKON['cemaat']}</div>
        <h3>Cemaatimiz için</h3>
        <span class="saat">Sohbet ve zikir</span>
        <p>Medreselerimizin dışında cemaatimizle sohbet ve zikir halkalarında buluşuyoruz. Gün ve saat için bizi arayın.</p>
      </article>
    </div>
    <p class="alt-not">Hafta sonu ders yapmıyoruz; eğitim haftamız Cumartesi öğlen sona erer.</p>"""


def medrese_kart(ad, yakinda):
    alt = "Çok yakında açılıyor" if yakinda else "Kayıt ve bilgi için bizi arayın"
    return (f'      <div class="medrese{" yakinda" if yakinda else ""}">{IKON["medrese"]}'
            f'<div><h3>{ad}</h3><p>{alt}</p></div></div>')


SSS = [
    ("Hangi dersleri veriyorsunuz?",
     "Elif-Ba ile başlayıp Kur'an-ı Kerim, tecvid ve kıraate; İlm-i Hal, siyer ve adaba; Arapçada da sarf (Emsile, Binâ, Maksûd) ve nahiv (Avâmil, İzhâr) derslerine uzanan bir müfredatımız var."),
    ("Gündüzlü ve yatılı eğitim arasındaki fark nedir?",
     "Gündüzlü talebelerimiz 09.00 – 20.00 arasında medresede olur, akşam evine döner. Yatılı talebelerimiz Pazar akşamı 21.00'de gelir, hafta boyunca medresede kalır ve Cumartesi sabahı 10.00'da ailesinin yanına döner."),
    ("Hafta sonu ders var mı?",
     "Hayır. Eğitim haftamız Cumartesi öğlen biter, hafta sonu ders yapmıyoruz."),
    ("Medreseleriniz nerede?",
     "Atalar, Cevizli ve Kurfalı medreselerimizde hizmet veriyoruz. Topselvi Medresemiz çok yakında açılıyor. Adres ve yol tarifi için bizi arayabilirsiniz."),
    ("Yetişkinler için bir programınız var mı?",
     "Medreselerimizin dışında cemaatimizle sohbet ve zikir halkalarında buluşuyoruz. Gün ve saatleri öğrenmek için bizi arayabilirsiniz."),
    ("Bağışım vergiden düşülür mü?",
     "Evet. Derneğimiz Cumhurbaşkanı Kararı ile kamu yararına çalışan dernek statüsündedir. Makbuz karşılığı yaptığınız bağışlar, kanunda belirtilen sınırlar içinde vergi matrahınızdan indirilebilir. Ayrıntılar Bağış sayfamızda."),
    ("Kayıt için ne yapmalıyım?",
     f"{TELEFON} numaralı telefondan bizi aramanız yeterli. Sorularınızı cevaplayalım, sizi medresemizde ağırlayalım."),
]

KURUM = {
    "@context": "https://schema.org",
    "@type": ["NGO", "EducationalOrganization"],
    "name": DERNEK,
    "alternateName": MARKA,
    "description": f"{KAMU_YARARI}. Gündüzlü ve yatılı hafızlık eğitimi; Kur'an-ı Kerim, temel İslami ilimler ve Arapça.",
    "url": SITE + "/",
    "logo": SITE + "/img/logo.svg",
    "image": SITE + "/img/og-gorsel.png",
    "telephone": "+90 " + TELEFON[1:],
    "email": EPOSTA,
    "address": {"@type": "PostalAddress", "addressLocality": "İstanbul", "addressCountry": "TR"},
    "sameAs": [INSTAGRAM, FACEBOOK],
}
KURUM_HEAD = '<script type="application/ld+json">' + json.dumps(KURUM, ensure_ascii=False) + "</script>\n"

HADIS_SADAKA = ("İnsan vefat edince ameli kesilir; ancak üç şey müstesnadır: sadaka-i câriye, "
                "kendisinden faydalanılan ilim ve kendisine dua eden hayırlı evlat.")

# ================================================================ ANASAYFA
ANASAYFA = f"""
<section class="giris koyu">
  <div class="kapsayici giris-ic">
    <div>
      <p class="hadis">
        <span class="hadis-ar" lang="ar">خيركم من تعلم القرآن وعلمه</span>
        <span class="hadis-tr">"Sizin en hayırlınız, Kur'an'ı öğrenen ve öğretendir." <cite>Buhârî, Fezâilü'l-Kur'ân, 21</cite></span>
      </p>
      <h1>Kur'an'ın nuruyla yetişen bir nesil</h1>
      <p class="aciklama">Menekşe Medreseleri'nde evlatlarımız Elif-Ba'dan hafızlığa, İlm-i Hal'den Arapçaya uzanan bir eğitimle yetişiyor. İlmi, edep ve güzel ahlakla birlikte öğretiyoruz.</p>
      <div class="butonlar">
        <a class="btn btn-altin" href="tel:{TELEFON_LINK}">{IKON['tel']} Kayıt ve bilgi</a>
        <a class="btn btn-cizgi-acik" href="egitimlerimiz.html">Eğitimlerimiz</a>
      </div>
      <p class="telefon-not">Bizi arayın: <strong>{TELEFON}</strong></p>
      <p class="rozet">{IKON['kalkan']} {KAMU_YARARI}</p>
    </div>
    <div class="giris-video">
      {video("tanitim", "tanitim")}
    </div>
  </div>
</section>

<section class="bakis" aria-label="Bir bakışta">
  <div class="kapsayici bakis-ic">
    <div><b>3 medrese</b><span>Atalar, Cevizli, Kurfalı · Topselvi yakında</span></div>
    <div><b>Elif-Ba'dan Arapçaya</b><span>Kur'an, temel ilimler ve Arapça</span></div>
    <div><b>Gündüzlü ve yatılı</b><span>Ailenize uygun eğitim</span></div>
    <div><b>Kamu yararına</b><span>Cumhurbaşkanı Kararı ile</span></div>
  </div>
</section>

<section class="bolum" id="hizmetler">
  <div class="kapsayici">
    {bolum_basi("Hizmetlerimiz", "خدماتنا", "İster gündüzlü ister yatılı; talebelerimiz hocalarının yanında, hafızlık yolunda birlikte ilerler.")}
{HIZMET_KARTLARI}
  </div>
</section>

<section class="bolum bolum-bej" id="yolculuk">
  <div class="kapsayici">
    {bolum_basi("Elif-Ba'dan Arapçaya bir eğitim yolculuğu", "دروسنا", "Temel İslami ilimleri, farz-ı ayn bilgileri ve Arapçayı medrese usulüyle, adım adım öğretiyoruz.")}
    <ol class="yolculuk">
{chr(10).join(f'      <li><span class="ar" lang="ar">{ar}</span><h3>{t}</h3><p>{a}</p></li>' for ar, t, a in YOLCULUK)}
    </ol>
    <p class="alt-not"><a class="btn btn-cizgi" href="egitimlerimiz.html">Bütün derslerimiz {IKON['ok']}</a></p>
  </div>
</section>

<section class="bolum" id="medreselerimiz">
  <div class="kapsayici">
    {bolum_basi("Medreselerimiz", "مدارسنا", "Atalar, Cevizli ve Kurfalı medreselerimizde hizmet veriyoruz. Topselvi Medresemizi de çok yakında açıyoruz inşallah.")}
    <div class="izgara dort">
{chr(10).join(medrese_kart(a, y) for a, y in MEDRESELER)}
    </div>
  </div>
</section>

<section class="bolum sadaka koyu" id="sadaka">
  <div class="kapsayici sadaka-ic">
    <div>
      <span class="ar-ust" lang="ar">صدقة جارية</span>
      <blockquote>
        <p>"{HADIS_SADAKA}"</p>
        <cite>Müslim, Vasiyyet, 14</cite>
      </blockquote>
    </div>
    <div>
      <h2>Sevabı süren bir hayra ortak olun</h2>
      <p>Bir talebenin öğrendiği her harf, okuduğu her âyet sizin için de devam eden bir hayırdır. Bağışlarınızla medreselerimiz büyüyor.</p>
      <div class="butonlar">
        <a class="btn btn-altin" href="bagis.html">{IKON['kalp']} Bağış yapın</a>
      </div>
    </div>
  </div>
</section>

<section class="bolum" id="merasim">
  <div class="kapsayici">
    {bolum_basi("Ailelerimizle birlikte", "من أنشطتنا", "Eğitim yılını talebelerimiz, aileleri ve hocalarımızla birlikte yıl sonu merasimiyle tamamlıyoruz.")}
    <div class="videolar">
{chr(10).join(f'      <figure>{video(v, k)}<figcaption>{a}</figcaption></figure>' for v, k, a in VIDEOLAR)}
    </div>
  </div>
</section>

<section class="bolum bolum-bej" id="heyet-tanitim">
  <div class="kapsayici">
    {bolum_basi("Yönetim kurulumuz", "هيئتنا", "Derneğimizi gönüllü olarak yürüten yönetim kurulu heyetimiz.")}
    <div class="heyet">
{chr(10).join('      ' + kisi(*k) for k in HEYET)}
    </div>
    <p class="alt-not"><a class="btn btn-cizgi" href="heyetimiz.html">Heyetimizi tanıyın {IKON['ok']}</a></p>
  </div>
</section>

<section class="bolum" id="sorular">
  <div class="kapsayici">
    {bolum_basi("Sık sorulanlar", "أسئلة", "Ailelerimizin en çok sorduğu sorular. Aklınıza takılan başka bir şey olursa bizi arayın.")}
    <div class="sss">
{chr(10).join(f'      <details><summary>{q}</summary><p>{c}</p></details>' for q, c in SSS)}
    </div>
  </div>
</section>

<section class="bolum cagri koyu">
  <div class="kapsayici">
    <h2>Evladınızın Kur'an'ın nuruyla yetişmesini istiyorsanız, sizi Menekşe Medreseleri'ne bekliyoruz.</h2>
    <p>{DERNEK}, Cumhurbaşkanı Kararı ile kamu yararına çalışan bir dernektir. Mahallelerimizin çocuklarına ve ailelerine hizmet ediyor, hayırseverlerimizin desteğiyle büyüyoruz.</p>
    <div class="butonlar">
      <a class="btn btn-altin" href="tel:{TELEFON_LINK}">{IKON['tel']} {TELEFON}</a>
      <a class="btn btn-cizgi-acik" href="bagis.html">Bağışla destek olun</a>
    </div>
  </div>
</section>
"""

# ================================================================ HAKKIMIZDA
DEGERLER = [
    ("علم", "İlim", "Kur'an'ı, temel dinî bilgileri ve Arapçayı ehil hocalardan, sağlam kaynaklardan öğretiriz."),
    ("أدب", "Edep", "İlmin edeple birlikte öğrenildiğine inanır; talebelerimizi güzel ahlakla yetiştiririz."),
    ("خدمة", "Hizmet", "Kapımız her aileye açık. Cemaatimize de sohbet ve zikir halkalarıyla hizmet ederiz."),
]

HAKKIMIZDA = sayfa_basi("Hakkımızda", "Mahallelerimizin çocuklarına Kur'an'ı, ilmi ve edebi öğretmek için çalışan bir sivil toplum kuruluşuyuz.", "من نحن") + f"""
<section class="bolum">
  <div class="kapsayici yan-yana">
    <div class="yazi">
      <h2>Biz kimiz?</h2>
      <p>{DERNEK}, çocuklarımızın ve gençlerimizin Kur'an-ı Kerim'le, ilimle ve güzel ahlakla yetişmesi için kuruldu. Bugün {MARKA} adıyla Atalar, Cevizli ve Kurfalı'da üç medresede hizmet veriyoruz; Topselvi Medresemizi de yakında açıyoruz inşallah.</p>
      <p>{HOCA_METNI}</p>
      <p>Talebelerimiz Elif-Ba ile başlıyor, Kur'an-ı Kerim'i tecvid ve kıraatiyle öğreniyor; İlm-i Hal, Siyer ve Arapça derslerle temel İslami ilimleri tahsil ediyor.</p>
    </div>
    <img src="img/medrese-ders.jpg" alt="Hocamız bir talebemizin okuyuşunu dinliyor" width="576" height="720" loading="lazy">
  </div>
</section>

<section class="bolum bolum-bej">
  <div class="kapsayici">
    {bolum_basi("Üç kelimeyle biz", "قيمنا", orta=True)}
    <div class="izgara uc">
{chr(10).join(f'      <article class="kart"><span class="ar-ust" lang="ar">{ar}</span><h3>{t}</h3><p>{a}</p></article>' for ar, t, a in DEGERLER)}
    </div>
  </div>
</section>

<section class="bolum">
  <div class="kapsayici izgara iki">
    <article class="kart">
      <div class="kart-ikon">{IKON['cemaat']}</div>
      <h3>Sohbet ve zikir halkalarımız</h3>
      <p>Medreselerimizin dışında cemaatimizle sohbet ve zikir halkalarında bir araya geliyoruz. Gün ve saatleri öğrenmek için bizi arayabilirsiniz.</p>
    </article>
    <article class="kart">
      <div class="kart-ikon">{IKON['kalp']}</div>
      <h3>Sosyal etkinliklerimiz</h3>
      <p>Talebelerimiz sadece derste değil, birlikte vakit geçirirken de büyür. Yıl içinde sosyal etkinlikler yapıyor, eğitim yılını ailelerimizle birlikte yıl sonu merasimiyle tamamlıyoruz.</p>
    </article>
  </div>
</section>

<section class="bolum bolum-bej" id="dernek-bilgileri">
  <div class="kapsayici dar">
    {bolum_basi("Dernek bilgileri", aciklama="Kim olduğumuzu açıkça bilmenizi isteriz.")}
    <dl class="bilgi-kutusu">
      <dt>Resmî adı</dt><dd>{DERNEK}</dd>
      <dt>Hizmet adı</dt><dd>{MARKA}</dd>
      <dt>Statüsü</dt><dd>{KAMU_YARARI}{(" (" + KAMU_YARARI_KARAR + ")") if KAMU_YARARI_KARAR else ""}</dd>
      <dt>Yapısı</dt><dd>5253 sayılı Dernekler Kanunu'na göre kurulmuş, kâr amacı gütmeyen sivil toplum kuruluşu</dd>
      <dt>Merkez</dt><dd>İstanbul</dd>
      <dt>Bağışlar</dt><dd>Her bağış için dernek makbuzu verilir; bağışlar kanuni sınırlar içinde vergiden düşülebilir</dd>
      <dt>İletişim</dt><dd><a href="tel:{TELEFON_LINK}">{TELEFON}</a> · <a href="mailto:{EPOSTA}">{EPOSTA}</a></dd>
    </dl>
  </div>
</section>
"""


# ================================================================ EĞİTİMLERİMİZ
def ders_grubu(grup, ar, aciklama, dersler):
    kartlar = "\n".join(
        f'        <li class="ders"><span class="ar" lang="ar">{dar}</span><b>{d}</b><span>{a}</span></li>'
        for d, dar, a in dersler)
    return f"""    <div class="ders-grubu">
      <div class="ders-grubu-baslik"><h3>{grup}</h3><span class="ar" lang="ar">{ar}</span><p>{aciklama}</p></div>
      <ul class="dersler">
{kartlar}
      </ul>
    </div>"""


EGITIMLER = sayfa_basi("Eğitimlerimiz", "Temel İslami ilimler, farz-ı ayn bilgiler ve Arapça: Elif-Ba'dan İzhâr'a uzanan bir müfredat.", "تعليم") + f"""
<section class="bolum" id="programlar">
  <div class="kapsayici">
    {bolum_basi("Eğitim programlarımız", "خدماتنا", "Ailenizin düzenine uygun programı birlikte seçelim.")}
{HIZMET_KARTLARI}
  </div>
</section>

<section class="bolum bolum-bej" id="mufredat">
  <div class="kapsayici">
    {bolum_basi("Derslerimiz", "دروسنا", "Kur'an-ı Kerim'den Arapçaya; medrese usulüyle, klasik kitaplardan ve ehil hocalardan.")}
{chr(10).join(ders_grubu(*g) for g in MUFREDAT)}
    <p class="alinti">"Hafızlık sadece ezber değildir. Sabrı öğrenmek, disiplini kazanmak, kardeşliği yaşamak ve Allah'ın kelamıyla büyümektir."</p>
  </div>
</section>

<section class="bolum" id="kayit">
  <div class="kapsayici">
    {bolum_basi("Kayıt nasıl yapılır?", aciklama="Üç kolay adımda evladınız aramıza katılır.")}
    <ol class="adimlar">
      <li><h3>Bizi arayın</h3><p>{TELEFON} numaralı telefondan bize ulaşın, sorularınızı cevaplayalım.</p></li>
      <li><h3>Medresemizi görün</h3><p>Size en yakın medresemize gelin, hocalarımızla tanışın.</p></li>
      <li><h3>Eğitime başlayalım</h3><p>Gündüzlü ya da yatılı eğitimden size uygun olanı birlikte belirleyelim.</p></li>
    </ol>
  </div>
</section>
"""

# ================================================================ HEYETİMİZ
HEYETIMIZ = sayfa_basi("Heyetimiz", "Derneğimizi ve medreselerimizi yürüten yönetim kurulumuz ve hocalarımız.", "هيئتنا") + f"""
<section class="bolum" id="yonetim-kurulu">
  <div class="kapsayici">
    {bolum_basi("Yönetim kurulu heyetimiz", aciklama="Derneğimizin işlerini gönüllü olarak yürüten kardeşlerimiz.")}
    <div class="heyet">
{chr(10).join('      ' + kisi(*k, yukle="eager") for k in HEYET)}
    </div>
  </div>
</section>

<section class="bolum bolum-bej" id="egitim-heyeti">
  <div class="kapsayici one-cikan">
    <div class="kisi kisi-foto"><img src="{ONE_CIKAN_HOCA['foto']}" alt="{ONE_CIKAN_HOCA['isim']}" width="400" height="500" loading="lazy"></div>
    <div class="yazi">
      <span class="ar-ust" lang="ar">المعلمون</span>
      <h2>Eğitim heyetimiz</h2>
      {sus()}
      <p>{HOCA_METNI}</p>
      <p>Hocalarımız talebelerimizle birebir ilgilenir; Kur'an'ı, ilmi ve edebi bir arada öğretir.</p>
    </div>
  </div>
</section>
"""


# ================================================================ BAĞIŞ
def bagis_kart(h):
    return f"""      <article class="bagis-kart" id="bagis-{h['id']}">
        <span class="ar" lang="ar">{h['ar']}</span>
        <h3>{h['baslik']}</h3>
        <p>{h['aciklama']}</p>
        <dl>
          <dt>Hesap adı</dt><dd>{DERNEK}</dd>
          <dt>Banka</dt><dd>{h['banka']}</dd>
          <dt>IBAN</dt><dd><code id="iban-{h['id']}">{h['iban']}</code></dd>
        </dl>
        <button class="btn btn-yesil btn-kucuk" type="button" data-kopyala="#iban-{h['id']}">IBAN'ı kopyala</button>
      </article>"""


BAGIS = sayfa_basi("Bağış", "Bir talebenin öğrendiği her harf, sizin için de devam eden bir hayırdır.", "صدقة جارية") + f"""
<section class="bolum" id="bagis-alanlari">
  <div class="kapsayici">
    {bolum_basi("Bağış alanlarımız", aciklama="Bağışınızı dilediğiniz alana yapabilirsiniz. Her alanın kendi hesabı vardır; açıklamaya adınızı ve soyadınızı yazmanız yeterli.")}
    <div class="bagis-alanlari">
{chr(10).join(bagis_kart(h) for h in BAGIS_HESAPLARI)}
    </div>
    <p class="alt-not">Bağışınız için dernek makbuzu veriyoruz. Dekontu bize telefonla ya da e-postayla iletmeniz yeterli: <a href="tel:{TELEFON_LINK}">{TELEFON}</a> · <a href="mailto:{EPOSTA}">{EPOSTA}</a></p>
  </div>
</section>

<section class="bolum sadaka koyu">
  <div class="kapsayici sadaka-ic">
    <blockquote>
      <p>"{HADIS_SADAKA}"</p>
      <cite>Müslim, Vasiyyet, 14</cite>
    </blockquote>
    <div>
      <h2>Üçüne birden vesile olun</h2>
      <p>Medreselerimize yaptığınız bağış hem sadaka-i câriyedir, hem faydalanılan bir ilme, hem de size dua edecek hayırlı evlatların yetişmesine vesiledir.</p>
    </div>
  </div>
</section>

<section class="bolum bolum-bej" id="vergi">
  <div class="kapsayici dar">
    <article class="kart">
      <h2 style="font-size:1.5rem">Bağışınız vergiden düşülebilir</h2>
      <p>Derneğimiz Cumhurbaşkanı Kararı ile kamu yararına çalışan dernek statüsündedir. Bu yüzden makbuz karşılığında yaptığınız bağışlar vergi matrahınızdan indirilebilir:</p>
      <ul>
        <li><strong>Gelir vergisi beyannamesi verenler:</strong> yıl içindeki bağışlarınızın, beyan ettiğiniz gelirin %5'ine kadar olan kısmı (kalkınmada öncelikli yörelerde %10'una kadar). <em>193 sayılı Gelir Vergisi Kanunu, madde 89/4</em></li>
        <li><strong>Şirketler:</strong> bağışların, o yılın kurum kazancının %5'ine kadar olan kısmı. <em>5520 sayılı Kurumlar Vergisi Kanunu, madde 10/1-c</em></li>
      </ul>
      <p>Bunun için bağış makbuzunuzu saklayıp mali müşavirinize iletmeniz yeterli. Kendi durumunuz için mali müşavirinize danışmanızı öneririz.</p>
    </article>
  </div>
</section>
"""

# ================================================================ İLETİŞİM
ILETISIM = sayfa_basi("İletişim", "Kayıt, bilgi ya da sadece hal hatır için bize ulaşın; kapımız da telefonumuz da açık.", "تواصل معنا") + f"""
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

# ================================================================ KVKK
KVKK = sayfa_basi("KVKK Aydınlatma Metni", "Kişisel verileriniz hakkında kısa bilgilendirme.") + f"""
<section class="bolum">
  <div class="kapsayici dar yazi">
    <p><strong>Veri sorumlusu:</strong> {DERNEK}, İstanbul. İletişim: {TELEFON}, {EPOSTA}</p>
    <h2>Hangi bilgileri, neden alıyoruz?</h2>
    <p>İletişim formunda yazdığınız adınız, telefonunuz, e-postanız ve mesajınızı yalnızca size dönüş yapmak, kayıt işlerinizi yürütmek ve bağış makbuzu hazırlamak için kullanıyoruz.</p>
    <h2>Kimlerle paylaşıyoruz?</h2>
    <p>Bilgileriniz kanunun zorunlu kıldığı durumlar dışında kimseyle paylaşılmaz. Form mesajları yalnızca dernek yetkililerinin erişebildiği e-posta hesabımıza gelir.</p>
    <h2>Fotoğraf ve videolar</h2>
    <p>Sitemizdeki fotoğraf ve videolar ilgili kişilerin ve velilerimizin izniyle yayınlanır. Kaldırılmasını istediğiniz bir görsel için bize ulaşmanız yeterlidir.</p>
    <h2>Haklarınız</h2>
    <p>6698 sayılı Kanun'un 11. maddesi gereği bilgilerinizin işlenip işlenmediğini öğrenebilir, düzeltilmesini ya da silinmesini isteyebilirsiniz. Bunun için {EPOSTA} adresine yazabilirsiniz.</p>
    <p>Sitemiz reklam veya takip çerezi kullanmaz. Yazı tipleri kendi sunucumuzdan yüklenir; ziyaret bilgileriniz üçüncü taraflara aktarılmaz.</p>
  </div>
</section>
"""

# ================================================================ SAYFALAR
SAYFALAR = [  # (dosya, önizleme kimliği, başlık, açıklama, gövde, ek head)
    ("index.html", "anasayfa", f"{MARKA} | {DERNEK}",
     f"Menekşe Medreseleri: İstanbul'da gündüzlü ve yatılı hafızlık eğitimi. Elif-Ba'dan Arapçaya; Kur'an-ı Kerim, temel İslami ilimler ve Arapça. {KAMU_YARARI}. Bilgi ve kayıt: {TELEFON}",
     ANASAYFA, KURUM_HEAD),
    ("hakkimizda.html", "hakkimizda", f"Hakkımızda | {MARKA}",
     "Menekşe İlim Kültür Okuma Derneği ve Menekşe Medreseleri hakkında: kimiz, neye inanıyoruz, sohbet ve zikir halkalarımız, dernek bilgilerimiz.",
     HAKKIMIZDA, ""),
    ("egitimlerimiz.html", "egitimlerimiz", f"Eğitimlerimiz | {MARKA}",
     "Gündüzlü ve yatılı eğitim; Elif-Ba, Kur'an-ı Kerim, Tecvid, Kıraat, İlm-i Hal, Siyer, Emsile, Binâ, Maksûd, Avâmil ve İzhâr dersleri.",
     EGITIMLER, ""),
    ("heyetimiz.html", "heyetimiz", f"Heyetimiz | {MARKA}",
     "Menekşe İlim Kültür Okuma Derneği yönetim kurulu heyeti ve eğitim heyeti.",
     HEYETIMIZ, ""),
    ("bagis.html", "bagis", f"Bağış | {MARKA}",
     "Menekşe Medreseleri'ne bağış: bağış alanlarımız, banka hesaplarımız ve kamu yararına dernek bağışlarında vergi indirimi.",
     BAGIS, ""),
    ("iletisim.html", "iletisim", f"İletişim | {MARKA}",
     f"Menekşe Medreseleri iletişim: telefon {TELEFON}, e-posta ve medreselerimiz.",
     ILETISIM, ""),
    ("kvkk.html", "kvkk", f"KVKK Aydınlatma Metni | {MARKA}",
     "Menekşe İlim Kültür Okuma Derneği kişisel verilerin korunması aydınlatma metni.",
     KVKK, ""),
]

for dosya, _id, baslik, aciklama, govde, ek in SAYFALAR:
    yaz(dosya, bas(baslik, aciklama, dosya, ek_head=ek) + govde + son())

HATA = """
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


# ================================================================ ÖNİZLEME (tek dosya)
def font_css_gomulu():
    """css/fonts.css içindeki yazı tiplerini data URI olarak gömer (önizleme için)."""
    css = open(os.path.join(OUT, "css", "fonts.css"), encoding="utf-8").read()

    def gom(m):
        yol = os.path.join(OUT, "fonts", m.group(1))
        veri = base64.b64encode(open(yol, "rb").read()).decode()
        return f"url(data:font/woff2;base64,{veri})"
    css = re.sub(r"url\(\.\./fonts/([^)]+)\)", gom, css)
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


SAYFA_IDLERI = {d: i for d, i, *_ in SAYFALAR}


def spa_baglanti(html):
    def cevir(m):
        dosya, capa = m.group(1), m.group(2)
        if dosya in SAYFA_IDLERI:
            return f'href="#{capa[1:] if capa else SAYFA_IDLERI[dosya]}"'
        return m.group(0)
    return re.sub(r'href="([a-z0-9-]+\.html)(#[a-z0-9-]+)?"', cevir, html)


ust = bas(f"{MARKA} | Önizleme", SAYFALAR[0][3], "index.html", font_css=font_css_gomulu(), spa=True)
govdeler = "\n".join(
    f'<div class="spa-sayfa" id="sayfa-{i}" data-baslik="{b}"{"" if i == "anasayfa" else " hidden"}>\n{g}\n</div>'
    for _d, i, b, _a, g, _e in SAYFALAR)
yaz("onizleme.html", spa_baglanti(ust + govdeler + son()))

# ================================================================ yardımcı dosyalar
yaz("img/desen-altin.svg", DESEN_ALTIN)

SITEMAP_SAYFALARI = [d for d, *_ in SAYFALAR]
yaz("sitemap.xml", '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{SITE}/{'' if s == 'index.html' else s}</loc></url>\n" for s in SITEMAP_SAYFALARI)
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
  RewriteRule ^faaliyetler\.html$ /egitimlerimiz.html [R=301,L]
  RewriteRule ^galeri\.html$ / [R=301,L]
  RewriteRule ^duyurular\.html$ / [R=301,L]
  RewriteRule ^(talebelerimiz|hocalarimiz)\.html$ /heyetimiz.html [R=301,L]

  # 5) Önizleme dosyası sunucuda yayınlanmaz
  RewriteRule ^onizleme\.html$ / [R=301,L]
</IfModule>

<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType text/css "access plus 7 days"
  ExpiresByType application/javascript "access plus 7 days"
  ExpiresByType image/svg+xml "access plus 30 days"
  ExpiresByType image/jpeg "access plus 30 days"
  ExpiresByType image/png "access plus 30 days"
  ExpiresByType font/woff2 "access plus 1 year"
  ExpiresByType video/mp4 "access plus 30 days"
</IfModule>

<IfModule mod_headers.c>
  Header set X-Content-Type-Options "nosniff"
  Header set X-Frame-Options "SAMEORIGIN"
  Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
""")

# Artık kullanılmayan eski dosyalar
for eski in ["duyurular.html", "faaliyetler.html", "galeri.html", "talebelerimiz.html", "hocalarimiz.html",
             "img/amblem.svg", "img/isaret.svg", "img/yer-tutucu.svg", "img/hero.svg", "img/kisi.svg",
             "img/desen.svg", "video/merasim-1.jpg"]:
    yol = os.path.join(OUT, eski)
    if os.path.exists(yol):
        os.remove(yol)
        print("silindi:", eski)
print("tamam")
