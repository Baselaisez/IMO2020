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

# ---- Bağış
BANKA = "Türkiye Finans Katılım Bankası"
# TELEFON yukarıda: eğitim, kayıt ve ilmî konular için (sitenin ana numarası)
DERNEK_TELEFON = "0543 663 91 55"  # dernek işleri ve bağış bildirimleri (WhatsApp)
BAGIS_TELEFON = "0536 976 99 78"   # yardım kampanyaları: Gazze, Afrika, kurban (afişlerdeki numara)
BAGIS_WHATSAPP = True              # "Bağışımı bildir" düğmesi WhatsApp'tan DERNEK_TELEFON'a gitsin mi
YARDIM_TOPLAMA_IZIN = ""           # izin alınırsa: "İstanbul Valiliği, izin no 2026/123" gibi; bağış sayfasında yazılır

# Bağış alanları: her biri bağış sayfasında ayrı bir seçenek olur ve kendi hesabıyla görünür.
#   tur "adet":    secenekler [(ad, birim fiyat TL)], birim, hizli (hazır adetler)
#   tur "serbest": tutarlar (hazır tutarlar); bağışçı dilediği tutarı da yazabilir
# Yeni alan eklemek için listeye bir sözlük daha ekleyin; foto yoksa simge gösterilir.
BAGIS_ALANLARI = [
    {"id": "talebe", "baslik": "Talebelerimizin sofrası", "kisa": "Talebe sofrası", "etiket": "Medreselerimiz",
     "foto": "img/bagis/kahvalti.jpg",
     "ozet": "Talebelerimizin aylık kahvaltı ve yemek bedeline ortak olun.",
     "aciklama": "Atalar ve Kurfalı medreselerimizde okuyan talebelerimizin kahvaltı ve yemek giderlerini hayırseverlerimizin desteğiyle karşılıyoruz. Dilediğiniz tutarla, ister bir kez ister her ay destek olabilirsiniz.",
     "iban": "TR15 0020 6001 4004 5144 1300 01", "irtibat": "0543 663 91 55",
     "tur": "serbest", "tutarlar": [500, 1000, 2500, 5000], "fiyat_yazi": "Dilediğiniz tutar"},
    {"id": "maltepe", "baslik": "Maltepe yeni külliyemiz", "kisa": "Maltepe külliye", "etiket": "Yeni külliye",
     "foto": "",
     "ozet": "1.000 m²'lik yeni külliyemizin tadilatına bir metrekare hayırla ortak olun.",
     "aciklama": "Maltepe'de 1.000 m²'lik yeni külliyemizin sözleşmesi yapıldı. En az 100 talebenin aynı anda eğitim alabileceği bu medresenin tadilatına başlıyoruz inşallah: dershaneleri, mescidi ve yemekhanesiyle. Her metrekaresi, orada okuyacak talebelerle birlikte sizin için de devam eden bir hayır olsun.",
     "iban": "TR63 0020 6001 4004 5144 1300 10",
     "tur": "adet", "secenekler": [("Metrekare", 2500)], "birim": "m²", "hizli": [1, 2, 5, 10], "fiyat_yazi": "1 m² 2.500 TL"},
    {"id": "mushaf", "baslik": "Afrika'ya Mushaf-ı Şerif", "kisa": "Afrika Mushaf", "etiket": "Afrika",
     "foto": "img/bagis/mushaf.jpg",
     "ozet": "Bir Kur'ân nice gönülleri aydınlatır.",
     "aciklama": "Afrika'da Kur'an okumayı öğrenen kardeşlerimize Mushaf-ı Şerif hediye ediyoruz. Hediye ettiğiniz her Mushaf, okundukça sevabı size de ulaşan bir hayırdır.",
     "iban": "TR90 0020 6001 4004 5144 1300 09",
     "tur": "adet", "secenekler": [("Mushaf-ı Şerif", 200)], "birim": "adet", "hizli": [1, 5, 10, 20], "fiyat_yazi": "1 Mushaf 200 TL"},
    {"id": "gazze", "baslik": "Gazze'ye bir sofra", "kisa": "Gazze yemek", "etiket": "Gazze",
     "foto": "img/bagis/gazze.jpg",
     "ozet": "Bir öğün, bir kardeşlik. Gazze'deki kardeşlerimize sıcak yemek.",
     "aciklama": "Gazze'deki kardeşlerimize sıcak yemek ulaştırıyoruz. Bir öğünlük bağışınız, savaşın ortasındaki bir aileye hem karın tokluğu hem de yalnız olmadıklarını gösteren bir selamdır.",
     "iban": "TR20 0020 6001 4004 5144 1300 08",
     "tur": "adet", "secenekler": [("Öğün", 200)], "birim": "öğün", "hizli": [1, 5, 10, 25], "fiyat_yazi": "1 öğün 200 TL"},
    {"id": "kurban", "baslik": "Afrika'da kurban", "kisa": "Afrika kurban", "etiket": "Afrika",
     "foto": "img/bagis/kurban.jpg",
     "ozet": "Kurban paylaşmaktır, kurban kardeşliktir.",
     "aciklama": "Kurban Bayramı'nda kurbanlarınızı Afrika'daki ihtiyaç sahibi ailelerle buluşturuyoruz. Vekâletiniz için açıklamaya adınızı ve soyadınızı yazmayı unutmayın.",
     "iban": "TR47 0020 6001 4004 5144 1300 07",
     "tur": "adet", "secenekler": [("Koyun", 5000), ("Keçi", 4000)], "birim": "adet", "hizli": [1, 2, 3], "fiyat_yazi": "Koyun 5.000 · Keçi 4.000 TL",
     "vekalet": True},
]

MEDRESELER = [  # (ad, durum: "" açık, "kiz" kız medresesi, "yakinda", "yeni" yeni külliye)
    ("Atalar Medresesi", ""),
    ("Cevizli Medresesi", ""),
    ("Kurfalı Medresesi", ""),
    ("Atalar Kız Medresesi", "kiz"),
    ("Osmaniye Kız Medresesi", "kiz"),
    ("Topselvi Medresesi", "yakinda"),
    ("Maltepe Külliyesi", "yeni"),
]
MALTEPE_M2 = "1.000"       # yeni külliyenin büyüklüğü
MALTEPE_KISI = "100"       # aynı anda eğitim alabilecek talebe sayısı (en az)

# Müfredat: (grup, arapça, grup açıklaması, [(ders, arapça, açıklama), ...])
# Müfredat: (grup, arapça, grup açıklaması, kapak rengi, [(ders, arapça, açıklama), ...])
# Kapak renkleri: yesil, kahve, lacivert, bordo, kirmizi (css/style.css içinde .kitap-*)
MUFREDAT = [
    ("Kur'an-ı Kerim", "القرآن الكريم",
     "Harfleri tanımaktan hafızlığa: Kur'an'ı doğru, güzel ve ezberden okumak.", "yesil",
     [("Elif-Ba", "ألفبا", "Arap harflerini, harekeleri ve harflerin birleşmesini öğrenir; Kur'an okumaya ilk adımı atar."),
      ("Kur'an-ı Kerim", "القرآن الكريم", "Elif-Ba'nın ardından Kur'an-ı Kerim'i yüzünden akıcı ve doğru okumaya geçer."),
      ("Tecvid", "التجويد", "Harflerin çıkış yerlerini (mahreç), med, idğam ve ihfâ gibi kuralları öğrenerek Kur'an'ı hatasız okur."),
      ("Kıraat", "القراءات", "Kur'an-ı Kerim'in Peygamber Efendimiz'den (s.a.v.) bize ulaşan okunuş usullerini tanır."),
      ("Talim ve Makam", "تعليم", "Hocasıyla birebir okuyarak okuyuşunu düzeltir; Kur'an'ı güzel sesle, makamıyla okumayı öğrenir.")]),
    ("Temel İslami ilimler", "علوم دينية",
     "Her Müslümanın bilmesi gereken farz-ı ayn bilgiler ve Peygamber Efendimiz'in hayatı.", "kahve",
     [("İlm-i Hal", "علم حال", "İman esaslarını; abdest, namaz ve oruç gibi ibadetleri; helal ve haramı, yani her Müslümanın bilmesi farz olan bilgileri öğrenir."),
      ("Siyer", "السيرة", "Peygamber Efendimiz'in (s.a.v.) doğumundan vefatına hayatını, ahlakını ve örnek alınacak hâllerini okur."),
      ("Adab", "الآداب", "Anne-babaya, hocaya, büyüğe ve arkadaşa karşı edebi; sofrada, mescitte ve sohbette güzel ahlakı öğrenir.")]),
    ("Arapça: Sarf", "صرف",
     "Kelimelerin yapısını öğreten ilim. Asırlardır medreselerde okutulan klasik kitaplardan, aynı sırayla.", "lacivert",
     [("Emsile", "الأمثلة", "Medresede okunan ilk kitap. Arapça fiil ve isim kalıplarını tablolar hâlinde ezberletir; sarfın kapısıdır."),
      ("Binâ", "البناء", "Binâü'l-Ef'âl. Fiillerin bablarını ve çekimlerini kaideleriyle anlatır."),
      ("Maksûd", "المقصود", "İmam-ı Âzam Ebû Hanîfe'ye nispet edilen, sarf ilminin temel kaidelerini toplayan kitap.")]),
    ("Arapça: Nahiv", "نحو",
     "Cümlenin yapısını öğreten ilim; Kur'an'ı ve klasik eserleri anlamanın anahtarı.", "bordo",
     [("Avâmil", "العوامل", "Birgivî Mehmed Efendi'nin (ö. 1573) eseri. Kelimelerin sonunu değiştiren âmilleri öğretir; nahve giriş kitabıdır."),
      ("İzhâr", "الإظهار", "Yine Birgivî'nin, Avâmil'in ardından okunan İzhârü'l-Esrâr'ı. Nahiv kaidelerini örnekleriyle işler.")]),
]

# Ders gruplarının yanında gösterilen kitap fotoğrafları: grup adı -> (dosya, kitap adı, açıklama)
GRUP_KITAPLARI = {
    "Arapça: Sarf": ("img/kitaplar/mecmuatus-sarf.jpg", "Mecmûatü's-Sarf", "Emsile, Binâ ve Maksûd bu mecmuadan okunur"),
    "Arapça: Nahiv": ("img/kitaplar/mecmuatun-nahv.jpg", "Mecmûatü'n-Nahv", "Avâmil ve İzhâr bu mecmuadan okunur"),
}
EGITIM_GORSELI = ("img/kitaplar/mushaf.jpg", "Tezhipli bir Mushaf-ı Şerif'in Fâtiha ve Bakara sayfaları")
HAKKIMIZDA_GORSELI = ("img/dernek/kursu.jpg", "Medresemizdeki kürsü; arkasında Osmanlı arması, yanında Allah lafzı yazılı levha", "dikey")

YOLCULUK = [  # anasayfadaki dört adım: (kapak yazısı, kapak rengi, başlık, açıklama)
    ("ألفبا", "yesil", "Elif-Ba", "Harfleri tanır, Kur'an okumaya ilk adımı atar."),
    ("القرآن الكريم", "kirmizi", "Kur'an-ı Kerim", "Tecvid ve kıraatle Kur'an'ı doğru okur, hafızlık yolunda ilerler."),
    ("علم حال", "kahve", "Temel ilimler", "İlm-i Hal, Siyer ve Adab ile farz-ı ayn bilgileri öğrenir."),
    ("الأمثلة", "lacivert", "Arapça", "Sarf ve nahivle Emsile'den İzhâr'a uzanan Arapça eğitimi alır."),
]

HEYET = [  # (fotoğraf img/heyet/ altında, isim, görev) – ilk sıradaki Heyetimiz sayfasında öne çıkar
    ("heyet-1.jpg", "Salih Gedik", "Yönetim Kurulu Başkanı"),
    ("heyet-4.jpg", "Salih Özbey", "Muhasebe ve Finans Müdürü"),
    ("heyet-2.jpg", "Musa Yıldız", "Yönetim Kurulu Üyesi"),
    ("heyet-3.jpg", "Ercan Kul", "Yönetim Kurulu Üyesi"),
]

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
    "ig": '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zM8.4 4.8h7.2a3.6 3.6 0 0 1 3.6 3.6v7.2a3.6 3.6 0 0 1-3.6 3.6H8.4a3.6 3.6 0 0 1-3.6-3.6V8.4a3.6 3.6 0 0 1 3.6-3.6zM12 7.7a4.3 4.3 0 1 1 0 8.6 4.3 4.3 0 0 1 0-8.6zM12 9.4a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2zM17.2 5.7a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2z"/></svg>',
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
    "kopya": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h11a2 2 0 0 1 2 2v11h-2V5H8V3zM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm0 2v10h10V9H5z"/></svg>',
    "whatsapp": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 2a8 8 0 1 1-4.1 14.9l-.4-.2-2.9.8.8-2.8-.2-.4A8 8 0 0 1 12 4zM8.9 7.6c-.2 0-.5 0-.8.4-.3.3-1 1-1 2.3s1 2.6 1.1 2.8c.1.2 2 3.1 4.9 4.3 2.4 1 2.9.8 3.4.7.5 0 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4l-.6-.3-1.9-.9c-.3-.1-.4-.1-.6.1l-.9 1.1c-.2.2-.3.2-.6.1a7.3 7.3 0 0 1-3.6-3.2c-.3-.5.3-.4.8-1.4.1-.2 0-.3 0-.5l-.9-2.1c-.2-.5-.4-.5-.6-.5h-.8z"/></svg>',
    "tabak": '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="6.5"/><circle cx="12" cy="13" r="3.5"/><path d="M3 4v5a2 2 0 0 0 2 2M5 4v18M21 4c-1.5 1-2.2 3-2.2 5.5S19.5 13 21 13v9"/></svg>',
}


def tl(n):
    """5000 -> '5.000 TL'"""
    return f"{n:,}".replace(",", ".") + " TL"


def tel_link(t):
    return "+90" + re.sub(r"\D", "", t)[1:]


def wa_link(t, mesaj=""):
    from urllib.parse import quote
    return "https://wa.me/90" + re.sub(r"\D", "", t)[1:] + (("?text=" + quote(mesaj)) if mesaj else "")

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


def gorsel_boyut(rel):
    from PIL import Image
    with Image.open(os.path.join(OUT, rel)) as im:
        return im.size


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
        <li>Eğitim ve kayıt: <a href="tel:{TELEFON_LINK}">{TELEFON}</a></li>
        <li>Dernek ve bağış: <a href="tel:{tel_link(DERNEK_TELEFON)}">{DERNEK_TELEFON}</a> · <a href="{wa_link(DERNEK_TELEFON)}" target="_blank" rel="noopener">WhatsApp</a></li>
        <li>Yardım kampanyaları: <a href="tel:{tel_link(BAGIS_TELEFON)}">{BAGIS_TELEFON}</a></li>
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


def sayfa_basi(baslik, aciklama, ar="", gorsel=None):
    ust = f'<span class="ar-ust" lang="ar">{ar}</span>' if ar else ""
    if gorsel:
        g, b = gorsel_boyut(gorsel[0])
        return f"""<section class="sayfa-basi koyu gorselli">
  <div class="kapsayici sayfa-basi-ic">
    <div>{ust}<h1>{baslik}</h1>
    <p>{aciklama}</p></div>
    <figure class="sayfa-basi-gorsel{(" " + gorsel[2]) if len(gorsel) > 2 else ""}"><img src="{gorsel[0]}" alt="{gorsel[1]}" width="{g}" height="{b}"></figure>
  </div>
</section>
"""
    return f"""<section class="sayfa-basi koyu">
  <div class="kapsayici">
    {ust}<h1>{baslik}</h1>
    <p>{aciklama}</p>
  </div>
</section>
"""


def video(v, kapak, on_yukle="none"):
    return (f'<video class="video" controls preload="{on_yukle}" playsinline poster="video/{kapak}.jpg" width="540" height="960">'
            f'<source src="video/{v}.mp4" type="video/mp4">'
            f'Tarayıcınız videoyu oynatamıyor. <a href="video/{v}.mp4">Videoyu indirin</a>.</video>')


KAPAK_SVG = ('<svg viewBox="0 0 120 168" aria-hidden="true" focusable="false">'
             '<rect width="120" height="168" fill="currentColor"/>'
             '<g fill="none" stroke="#D9BE7C"><rect x="7" y="7" width="106" height="154" stroke-width="1.6"/>'
             '<rect x="11.5" y="11.5" width="97" height="145" stroke-width=".7"/></g>'
             '<g fill="#D9BE7C" opacity=".9"><path d="M12 12h20a20 20 0 0 1-20 20z"/><path d="M108 12h-20a20 20 0 0 0 20 20z"/>'
             '<path d="M12 156h20a20 20 0 0 0-20-20z"/><path d="M108 156h-20a20 20 0 0 1 20-20z"/>'
             '<path d="M60 22l5 7-5 7-5-7z"/><path d="M60 146l5-7-5-7-5 7z"/></g>'
             '<ellipse cx="60" cy="84" rx="37" ry="47" fill="rgba(0,0,0,.22)" stroke="#D9BE7C" stroke-width="1.4"/>'
             '<ellipse cx="60" cy="84" rx="32.5" ry="42.5" fill="none" stroke="#D9BE7C" stroke-width=".6"/></svg>')


def kitap(yazi, renk, boy=""):
    """Klasik cilt (şemse, köşebent, cetvel) görünümlü kitap kapağı; yazı sayfanın hat fontuyla."""
    uzun = " uzun" if len(yazi) > 8 else ""
    return (f'<span class="kitap kitap-{renk}{(" " + boy) if boy else ""}" aria-hidden="true">{KAPAK_SVG}'
            f'<span class="kapak-yazi{uzun}" lang="ar">{yazi}</span></span>')


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


def medrese_kart(ad, durum):
    if durum == "yeni":
        return (f'      <a class="medrese yeni" href="bagis.html#bagis-maltepe">{IKON["medrese"]}'
                f'<div><span class="etiket">Yeni külliyemiz</span><h3>{ad}</h3>'
                f'<p>{MALTEPE_M2} m²\'lik yeni külliyemizde en az {MALTEPE_KISI} talebe aynı anda eğitim alacak. '
                f'Sözleşmesi yapıldı, tadilatına başlıyoruz inşallah.</p></div>'
                f'<span class="medrese-git">Ortak olun {IKON["ok"]}</span></a>')
    if durum == "kiz":
        return (f'      <div class="medrese kiz">{IKON["medrese"]}'
                f'<div><h3>{ad}</h3><p>Kız talebelerimiz için</p></div></div>')
    if durum == "yakinda":
        return (f'      <div class="medrese yakinda">{IKON["medrese"]}'
                f'<div><h3>{ad}</h3><p>Yakında açılıyor inşallah.</p></div></div>')
    return (f'      <div class="medrese">{IKON["medrese"]}'
            f'<div><h3>{ad}</h3><p>Erkek talebelerimiz için</p></div></div>')


def bagis_gorsel(a, yukle="lazy"):
    if a["foto"]:
        return f'<img src="{a["foto"]}" alt="" width="600" height="450" loading="{yukle}">'
    return f'<span class="gorsel-simge">{IKON["medrese"]}</span>'


def hayir_kart(a):
    return f"""      <article class="hayir-kart">
        <div class="hayir-foto">{bagis_gorsel(a)}<span class="etiket">{a['etiket']}</span></div>
        <div class="hayir-ic">
          <h3><a class="kart-link" href="bagis.html#bagis-{a['id']}">{a['baslik']}</a></h3>
          <p>{a['ozet']}</p>
          <p class="hayir-fiyat"><span>{a['fiyat_yazi']}</span><span class="git" aria-hidden="true">{IKON['ok']}</span></p>
        </div>
      </article>"""


MALTEPE = next(a for a in BAGIS_ALANLARI if a["id"] == "maltepe")
HAYIR_VITRIN = f"""    <article class="hayir-vitrin koyu">
      <div class="vitrin-metin">
        <span class="etiket">Maltepe'de yeni külliyemiz</span>
        <h3>Bir metrekare hayırla yeni ilim yuvamıza ortak olun</h3>
        <p>{MALTEPE['aciklama']}</p>
        <a class="btn btn-altin" href="bagis.html#bagis-maltepe">Metrekare bağışla {IKON['ok']}</a>
      </div>
      <div class="vitrin-fiyat"><span class="ar" lang="ar">صدقة جارية</span><b>1 m²</b><span>{tl(MALTEPE['secenekler'][0][1])}</span></div>
    </article>"""
HAYIR_KARTLARI = "\n".join(hayir_kart(a) for a in BAGIS_ALANLARI if a["id"] != "maltepe")


SSS = [
    ("Hangi dersleri veriyorsunuz?",
     "Elif-Ba ile başlayıp Kur'an-ı Kerim, tecvid ve kıraate; İlm-i Hal, siyer ve adaba; Arapçada da sarf (Emsile, Binâ, Maksûd) ve nahiv (Avâmil, İzhâr) derslerine uzanan bir müfredatımız var."),
    ("Gündüzlü ve yatılı eğitim arasındaki fark nedir?",
     "Gündüzlü talebelerimiz 09.00 – 20.00 arasında medresede olur, akşam evine döner. Yatılı talebelerimiz Pazar akşamı 21.00'de gelir, hafta boyunca medresede kalır ve Cumartesi sabahı 10.00'da ailesinin yanına döner."),
    ("Hafta sonu ders var mı?",
     "Hayır. Eğitim haftamız Cumartesi öğlen biter, hafta sonu ders yapmıyoruz."),
    ("Medreseleriniz nerede?",
     "Atalar, Cevizli ve Kurfalı medreselerimizde, Osmaniye ve Atalar'daki kız medreselerimizde hizmet veriyoruz. Topselvi Medresemiz ise yakında açılıyor. Maltepe'de de en az 100 talebenin aynı anda okuyabileceği 1.000 m²'lik yeni külliyemizin tadilatına başlıyoruz. Adres ve yol tarifi için bizi arayabilirsiniz."),
    ("Kız talebeler için medreseniz var mı?",
     "Evet. Osmaniye ve Atalar'da kız medreselerimiz var. Kayıt ve bilgi için bizi arayabilirsiniz."),
    ("Yetişkinler için bir programınız var mı?",
     "Medreselerimizin dışında cemaatimizle sohbet ve zikir halkalarında buluşuyoruz. Gün ve saatleri öğrenmek için bizi arayabilirsiniz."),
    ("Nasıl bağış yapabilirim?",
     "Bağış sayfamızda bağış alanını seçin ve tutarı belirleyin. IBAN'ı kopyalayıp banka uygulamanızdan havale ya da EFT ile göndermeniz yeterli. Banka dekontunuz bağış makbuzu yerine geçer."),
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
      {video("tanitim", "tanitim", "metadata")}
    </div>
  </div>
</section>

<section class="bakis" aria-label="Bir bakışta">
  <div class="kapsayici bakis-ic">
    <div><b>5 medrese</b><span>Kız ve erkek talebelerimiz için</span></div>
    <div><b>Elif-Ba'dan Arapçaya</b><span>Kur'an, temel ilimler ve Arapça</span></div>
    <div><b>Gündüzlü ve yatılı</b><span>Ailenize uygun eğitim</span></div>
    <div><b>Kamu yararına</b><span>Cumhurbaşkanı Kararı ile</span></div>
  </div>
</section>

<section class="mujde" aria-labelledby="mujde-baslik">
  <div class="kapsayici mujde-ic">
    <div class="mujde-rozet"><span class="ar" lang="ar">بشرى</span><b>Müjde</b></div>
    <div class="mujde-metin">
      <h2 id="mujde-baslik">Maltepe'de {MALTEPE_M2} m²'lik yeni külliyemiz geliyor</h2>
      <p>Sözleşmesi yapıldı. En az {MALTEPE_KISI} talebenin aynı anda eğitim alabileceği medresemizin tadilatına başlıyoruz inşallah.</p>
    </div>
    <ul class="mujde-sayilar">
      <li><b>{MALTEPE_M2} m²</b><span>yeni külliye</span></li>
      <li><b>{MALTEPE_KISI}+</b><span>talebe aynı anda</span></li>
    </ul>
    <a class="btn btn-yesil" href="bagis.html#bagis-maltepe">Ortak olun {IKON['ok']}</a>
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
{chr(10).join(f'      <li>{kitap(ar, r)}<h3>{t}</h3><p>{a}</p></li>' for ar, r, t, a in YOLCULUK)}
    </ol>
    <p class="alt-not"><a class="btn btn-cizgi" href="egitimlerimiz.html">Bütün derslerimiz {IKON['ok']}</a></p>
  </div>
</section>

<section class="bolum" id="medreselerimiz">
  <div class="kapsayici">
    {bolum_basi("Medreselerimiz", "مدارسنا", "Atalar, Cevizli ve Kurfalı medreselerimizde, Osmaniye ve Atalar'daki kız medreselerimizde hizmet veriyoruz. Topselvi Medresemiz ise yakında açılıyor. Maltepe'de de büyük yeni külliyemizin tadilatına başlıyoruz inşallah.")}
    <div class="medreseler">
{chr(10).join(medrese_kart(a, d) for a, d in MEDRESELER)}
    </div>
  </div>
</section>

<section class="bolum bolum-bej" id="hayir">
  <div class="kapsayici">
    {bolum_basi("Hayra ortak olun", "أبواب الخير", "Medreselerimizden Gazze'ye ve Afrika'ya uzanan hayır kapılarımız. Her birinin ayrı bir hesabı var; bağışınızı dilediğiniz işe yönlendirebilirsiniz.")}
{HAYIR_VITRIN}
    <div class="hayir-izgara">
{HAYIR_KARTLARI}
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
    {bolum_basi("Yönetim heyetimiz", "هيئتنا", "Derneğimizi gönüllü olarak yürüten kardeşlerimiz; başkanımız Salih Gedik Hocamızla birlikte.")}
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

HAKKIMIZDA = sayfa_basi("Hakkımızda", "Mahallelerimizin çocuklarına Kur'an'ı, ilmi ve edebi öğretmek için çalışan bir sivil toplum kuruluşuyuz. Kürsümüz ilme, kapımız herkese açık.", "من نحن", HAKKIMIZDA_GORSELI) + f"""
<section class="bolum">
  <div class="kapsayici yan-yana">
    <div class="yazi">
      <h2>Biz kimiz?</h2>
      <p>{DERNEK}, çocuklarımızın ve gençlerimizin Kur'an-ı Kerim'le, ilimle ve güzel ahlakla yetişmesi için kuruldu. Bugün {MARKA} adıyla Atalar, Cevizli ve Kurfalı medreselerimizde, Osmaniye ve Atalar'daki kız medreselerimizde hizmet veriyoruz. Topselvi Medresemiz ise yakında açılıyor. Maltepe'de de en az 100 talebenin aynı anda okuyabileceği 1.000 m²'lik yeni külliyemizin tadilatına başlıyoruz inşallah.</p>
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

<section class="bolum" id="cemaat">
  <div class="kapsayici">
    {bolum_basi("Medresenin dışında da birlikteyiz", "مجالسنا", "Cemaatimizle sohbet ve zikir halkalarında buluşuyor, sofralarımızı paylaşıyoruz.")}
    <div class="cemaat-izgara">
    <figure class="cemaat-foto"><img src="img/dernek/cemaat.jpg" alt="Cemaatimiz derneğimizde bir arada, sofra başında" width="960" height="816" loading="lazy"><figcaption>Cemaatimizle bir arada</figcaption></figure>
    <div class="cemaat-kartlar">
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
    <article class="kart">
      <div class="kart-ikon">{IKON['tabak']}</div>
      <h3>Hayır çalışmalarımız</h3>
      <p>Medreselerimizin yanında Gazze'deki kardeşlerimize sıcak yemek, Afrika'ya Mushaf-ı Şerif ve kurban ulaştırıyoruz.</p>
      <p><a href="bagis.html">Hayra ortak olun</a></p>
    </article>
    </div>
    </div>
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
def ders_karti(d, dar, a, renk, sinif=""):
    return (f'        <li class="ders{(" " + sinif) if sinif else ""}">{kitap(dar, renk)}'
            f'<span class="ders-metin"><b>{d}</b><span>{a}</span></span></li>')


def ders_grubu(grup, ar, aciklama, renk, dersler):
    kartlar = "\n".join(ders_karti(d, dar, a, renk) for d, dar, a in dersler)
    liste = f"""      <ul class="dersler">
{kartlar}
      </ul>"""
    if grup in GRUP_KITAPLARI:
        foto, ad, alt = GRUP_KITAPLARI[grup]
        g, b = gorsel_boyut(foto)
        liste = f"""      <div class="grup-govde">
        <figure class="grup-kitap"><img src="{foto}" alt="{ad} kitabı" width="{g}" height="{b}" loading="lazy"><figcaption><b>{ad}</b><span>{alt}</span></figcaption></figure>
{liste}
      </div>"""
    return f"""    <div class="ders-grubu">
      <div class="ders-grubu-baslik"><h3>{grup}</h3><span class="ar" lang="ar">{ar}</span><p>{aciklama}</p></div>
{liste}
    </div>"""


EGITIMLER = sayfa_basi("Eğitimlerimiz", "Temel İslami ilimler, farz-ı ayn bilgiler ve Arapça: Elif-Ba'dan İzhâr'a uzanan bir müfredat. Hepsinin başında ve merkezinde Kur'an-ı Kerim.", "تعليم", EGITIM_GORSELI) + f"""
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
    <div class="ders-grubu">
      <div class="ders-grubu-baslik"><h3>Hafızlık</h3><span class="ar" lang="ar">حفظ القرآن الكريم</span><p>Talebelerimiz bütün bu derslerin yanında Kur'an-ı Kerim'i ezberler.</p></div>
      <ul class="dersler">
{ders_karti("Hafızlık", "مصحف شريف", "Kur'an-ı Kerim'in tamamını, hocasının yanında sayfa sayfa ezberler ve tekrarlarla kalıcı hâle getirir.", "kirmizi", "hafizlik")}
      </ul>
      <p class="alinti">"Hafızlık sadece ezber değildir. Sabrı öğrenmek, disiplini kazanmak, kardeşliği yaşamak ve Allah'ın kelamıyla büyümektir."</p>
    </div>
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
BASKAN = HEYET[0]
HEYETIMIZ = sayfa_basi("Heyetimiz", "Derneğimizi ve medreselerimizi gönüllü olarak yürüten kardeşlerimiz.", "هيئتنا") + f"""
<section class="bolum" id="baskan">
  <div class="kapsayici one-cikan">
    <div class="kisi kisi-foto"><img src="img/heyet/{BASKAN[0]}" alt="{BASKAN[1]}, {BASKAN[2].lower()}" width="640" height="800"></div>
    <div class="yazi">
      <span class="ar-ust" lang="ar">رئيسنا</span>
      <h2>{BASKAN[1]} Hocamız</h2>
      <p class="unvan">{BASKAN[2]}</p>
      {sus()}
      <p>Derneğimizin yönetim kurulu başkanı {BASKAN[1]} Hocamız, medreselerimizdeki eğitimi de bizzat yönetiyor. Talebelerimiz onun rehberliğinde hem hafızlık yolunda ilerliyor hem de millî ve manevî değerlerle yetişiyor.</p>
      <p>Hocalarımız talebelerimizle birebir ilgilenir; Kur'an'ı, ilmi ve edebi bir arada öğretir.</p>
    </div>
  </div>
</section>

<section class="bolum bolum-bej" id="yonetim-kurulu">
  <div class="kapsayici">
    {bolum_basi("Yönetim heyetimiz", "هيئة الإدارة", "Derneğimizin işlerini başkanımızla birlikte gönüllü olarak yürüten kardeşlerimiz.")}
    <div class="heyet heyet-uc">
{chr(10).join('      ' + kisi(*k, yukle="eager") for k in HEYET[1:])}
    </div>
  </div>
</section>
"""


# ================================================================ BAĞIŞ
def bagis_secim(a, i):
    return f"""        <label class="alan-secim">
          <input type="radio" name="bagis-alani" id="alan-{a['id']}" value="{a['id']}"{" checked" if i == 0 else ""}>
          <span class="secim-gorsel">{bagis_gorsel(a, "eager")}</span>
          <span class="secim-metin"><b>{a['baslik']}</b><small>{a['fiyat_yazi']}</small></span>
          <span class="secim-isaret" aria-hidden="true"></span>
        </label>"""


def kopya_btn(hedef, etiket, bosluksuz=False):
    return (f'<button class="kopya" type="button" data-kopyala="#{hedef}"{" data-bosluksuz" if bosluksuz else ""} '
            f'aria-label="{etiket}">{IKON["kopya"]}<span>Kopyala</span></button>')


def bagis_panel(a):
    k = a["id"]
    tel = a.get("irtibat", BAGIS_TELEFON)
    if a["tur"] == "adet":
        coklu = len(a["secenekler"]) > 1
        ad0, fiyat0 = a["secenekler"][0]
        toplam0 = fiyat0
        aciklama0 = f"{a['kisa']} 1 {ad0.lower() if coklu else a['birim']}"
        secenekler = ""
        if coklu:
            secenekler = '\n          <div class="secenekler">' + "".join(
                f'<label class="secenek"><input type="radio" name="tur-{k}" value="{ad}" data-fiyat="{f}"{" checked" if j == 0 else ""}>'
                f'<span><b>{ad}</b>{tl(f)}</span></label>' for j, (ad, f) in enumerate(a["secenekler"])) + "</div>"
        birim_not = "" if coklu else f' <small>(1 {a["birim"]} {tl(fiyat0)})</small>'
        hizli = "".join(f'<button type="button" class="hizli-btn" data-adet="{n}" aria-pressed="{"true" if n == 1 else "false"}">{n} {a["birim"]}</button>' for n in a["hizli"])
        miktar = f"""{secenekler}
          <div class="adet-satir">
            <div class="adet-sec">
              <button type="button" class="adet-btn" data-adim="-1" aria-label="Azalt">−</button>
              <input type="number" class="adet" value="1" min="1" max="999" inputmode="numeric" aria-label="Adet">
              <button type="button" class="adet-btn" data-adim="1" aria-label="Artır">+</button>
            </div>
            <span class="birim">{a['birim']}{birim_not}</span>
          </div>
          <div class="hizli">{hizli}</div>"""
        veri = f' data-fiyat="{fiyat0}" data-birim="{a["birim"]}"'
        ipucu = ""
    else:
        toplam0 = a["tutarlar"][0]
        aciklama0 = a["kisa"]
        tutarlar = "".join(f'<button type="button" class="tutar-btn{" secili" if j == 0 else ""}" data-tutar="{n}" aria-pressed="{"true" if j == 0 else "false"}">{tl(n)}</button>'
                           for j, n in enumerate(a["tutarlar"]))
        miktar = f"""
          <div class="tutarlar">{tutarlar}</div>
          <label class="diger-tutar"><span>Başka bir tutar</span><span class="tl-giris"><input type="number" class="tutar-gir" min="1" max="10000000" inputmode="numeric" placeholder="Örn. 750"><span>TL</span></span></label>"""
        veri = ""
        ipucu = '\n          <p class="ipucu">Her ay düzenli destek olmak isterseniz banka uygulamanızdan <b>düzenli transfer talimatı</b> verebilirsiniz.</p>'
    if a.get("vekalet"):
        aciklama0 += " (vekâlet)"
    wa = ""
    if BAGIS_WHATSAPP:
        wa = (f'<a class="btn btn-yesil whatsapp bildir-btn" href="{wa_link(DERNEK_TELEFON, "Selamün aleyküm, bağışımı bildirmek istiyorum. Bağış: " + a["baslik"] + ", tutar: " + tl(toplam0) + ".")}" '
              f'target="_blank" rel="noopener">{IKON["whatsapp"]} Bağışımı bildir</a>\n            ')
    return f"""      <div class="bagis-panel" id="bagis-{k}" data-tur="{a['tur']}" data-kisa="{a['kisa']}" data-baslik="{a['baslik']}"{veri}{" data-vekalet" if a.get("vekalet") else ""}>
        <div class="panel-bas">
          <div class="panel-gorsel">{bagis_gorsel(a)}</div>
          <div class="panel-yazi">
            <span class="etiket">{a['etiket']}</span>
            <h3>{a['baslik']}</h3>
            <p>{a['aciklama']}</p>
          </div>
        </div>
        <div class="panel-adim">
          <h4><span class="adim-no">2</span> Ne kadar bağışlamak istersiniz?</h4>{miktar}
          <p class="toplam">Toplam bağışınız <output class="toplam-tutar">{tl(toplam0)}</output></p>
        </div>
        <div class="panel-adim">
          <h4><span class="adim-no">3</span> Banka uygulamanızdan gönderin</h4>
          <p class="ipucu">Uygulamanızda <b>Para gönder → IBAN'a</b> adımını açın; bu bilgileri kopyalayıp yapıştırmanız yeterli.</p>
          <dl class="hesap">
            <div class="hesap-satir hesap-iban"><dt>IBAN</dt><dd><code id="iban-{k}">{a['iban']}</code>{kopya_btn(f"iban-{k}", "IBAN'ı kopyala", True)}</dd></div>
            <div class="hesap-satir"><dt>Alıcı adı</dt><dd><span id="alici-{k}">{DERNEK}</span>{kopya_btn(f"alici-{k}", "Alıcı adını kopyala")}</dd></div>
            <div class="hesap-satir"><dt>Tutar</dt><dd><b class="toplam-tutar">{tl(toplam0)}</b></dd></div>
            <div class="hesap-satir"><dt>Açıklama</dt><dd><span id="aciklama-{k}" class="aciklama-yaz">{aciklama0}</span>{kopya_btn(f"aciklama-{k}", "Açıklamayı kopyala")}</dd></div>
            <div class="hesap-satir"><dt>Banka</dt><dd>{BANKA}</dd></div>
          </dl>
          <label class="ad-gir"><span>Adınız soyadınız <small>(açıklamaya eklenir)</small></span><input type="text" class="ad" autocomplete="name" maxlength="60"></label>{ipucu}
        </div>
        <div class="panel-adim">
          <h4><span class="adim-no">4</span> Bağışınızı bize bildirin</h4>
          <p>Havalenizi yaptıktan sonra telefonunuzu yazıp bildirin. Bağışınız hesabımıza geçince size <b>"bağışınız alınmıştır"</b> mesajı gönderelim.</p>
          <label class="ad-gir"><span>Telefonunuz</span><input type="tel" class="tel" autocomplete="tel" inputmode="tel" maxlength="20" placeholder="05xx xxx xx xx"></label>
          <label class="onay bildir-onay"><input type="checkbox"><span><a href="kvkk.html" target="_blank">Aydınlatma metnini</a> okudum; adımın, telefonumun ve bağış bilgilerimin bağışımın kaydı ve bana dönüş için derneğe iletilmesini kabul ediyorum.</span></label>
          <p class="bildir-hata" role="alert" hidden></p>
          <div class="butonlar">
            {wa}<a class="btn btn-cizgi" href="tel:{tel_link(tel)}">{IKON['tel']} {tel}</a>
          </div>
          <p class="bildir-sonuc" role="status" hidden></p>
          <p class="ipucu">Dekontunuzu da aynı WhatsApp yazışmasına ekleyebilirsiniz; banka dekontu bağış makbuzu yerine geçer. İsterseniz adınıza makbuz da düzenleriz.</p>
        </div>
      </div>"""


IZIN_SATIRI = (f'\n    <p class="alt-not">Yardım toplama izni: {YARDIM_TOPLAMA_IZIN}</p>' if YARDIM_TOPLAMA_IZIN else "")

BAGIS = sayfa_basi("Bağış", "Bir talebenin sofrasından Gazze'deki bir çocuğun tabağına; hayrınızı dilediğiniz kapıdan ulaştırın.", "صدقة جارية") + f"""
<section class="bolum" id="bagis-yap">
  <div class="kapsayici">
    {bolum_basi("Bağışınızı birkaç dokunuşla yapın", aciklama="Bağış alanını seçin, tutarı belirleyin, bilgileri kopyalayıp banka uygulamanızdan gönderin. Hepsi bu kadar.")}
    <div class="bagis-kutu" data-bagis>
      <fieldset class="alan-listesi">
        <legend><span class="adim-no">1</span> Bağış alanını seçin</legend>
{chr(10).join(bagis_secim(a, i) for i, a in enumerate(BAGIS_ALANLARI))}
      </fieldset>
      <div class="bagis-paneller">
{chr(10).join(bagis_panel(a) for a in BAGIS_ALANLARI)}
      </div>
    </div>
    <ul class="guven">
      <li>{IKON['kalkan']}<span><b>Kamu yararına dernek</b>Cumhurbaşkanı Kararı ile</span></li>
      <li>{IKON['yildiz']}<span><b>Her hayrın ayrı hesabı</b>Bağışınızı dilediğiniz işe yönlendirin</span></li>
      <li>{IKON['kalp']}<span><b>Dekontunuz makbuzdur</b>Banka dekontu alındı belgesi yerine geçer</span></li>
      <li>{IKON['yildiz']}<span><b>Vergiden düşülebilir</b>Kanuni sınırlar içinde</span></li>
    </ul>{IZIN_SATIRI}
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
      <p>Derneğimiz Cumhurbaşkanı Kararı ile kamu yararına çalışan dernek statüsündedir. Bu yüzden belgeli bağışlarınız (banka dekontu ya da dernek makbuzu) vergi matrahınızdan indirilebilir:</p>
      <ul>
        <li><strong>Gelir vergisi beyannamesi verenler:</strong> yıl içindeki bağışlarınızın, beyan ettiğiniz gelirin %5'ine kadar olan kısmı (kalkınmada öncelikli yörelerde %10'una kadar). <em>193 sayılı Gelir Vergisi Kanunu, madde 89/4</em></li>
        <li><strong>Şirketler:</strong> bağışların, o yılın kurum kazancının %5'ine kadar olan kısmı. <em>5520 sayılı Kurumlar Vergisi Kanunu, madde 10/1-c</em></li>
      </ul>
      <p>Bunun için dekontunuzu ya da makbuzunuzu saklayıp mali müşavirinize iletmeniz yeterli. Kendi durumunuz için mali müşavirinize danışmanızı öneririz.</p>
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
        <li><span class="simge">{IKON['tel']}</span><div><small>Eğitim, kayıt ve ilmî konular</small><a href="tel:{TELEFON_LINK}">{TELEFON}</a></div></li>
        <li><span class="simge">{IKON['whatsapp']}</span><div><small>Dernek ve bağış bildirimi · WhatsApp</small><a href="tel:{tel_link(DERNEK_TELEFON)}">{DERNEK_TELEFON}</a> · <a href="{wa_link(DERNEK_TELEFON, "Selamün aleyküm, derneğiniz hakkında bilgi almak istiyorum.")}" target="_blank" rel="noopener">WhatsApp</a></div></li>
        <li><span class="simge">{IKON['mail']}</span><div><small>E-posta</small><a href="mailto:{EPOSTA}">{EPOSTA}</a></div></li>
        <li><span class="simge">{IKON['kalp']}</span><div><small>Yardım kampanyaları (Gazze, Afrika, kurban)</small><a href="tel:{tel_link(BAGIS_TELEFON)}">{BAGIS_TELEFON}</a> · <a href="{wa_link(BAGIS_TELEFON, "Selamün aleyküm, yardım kampanyalarınız hakkında bilgi almak istiyorum.")}" target="_blank" rel="noopener">WhatsApp</a></div></li>
        <li><span class="simge">{IKON['ig']}</span><div><small>Instagram</small><a href="{INSTAGRAM}" target="_blank" rel="noopener">@menekseilim</a></div></li>
      </ul>
      <h2 style="font-size:1.4rem">Medreselerimiz</h2>
      <ul class="medrese-liste">
{chr(10).join(f'        <li><b>{a}</b>{ {"yakinda": " · yakında açılıyor", "yeni": " · yeni külliye, tadilatı başlıyor"}.get(d, "") }</li>' for a, d in MEDRESELER)}
      </ul>
      <p class="alt-not">Adres ve yol tarifi için bizi arayabilirsiniz.</p>
    </div>

    <div class="iletisim-sag">
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
      <figure class="kapi-foto"><img src="img/dernek/kapi.jpg" alt="Menekşe İlim Kültür Okuma Derneği'nin girişi, kapıda Türk bayrağı" width="600" height="800" loading="lazy"><figcaption>Derneğimizin kapısı. Buyurun, bekleriz.</figcaption></figure>
    </div>
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
    <h2>Bağış bildirimi</h2>
    <p>Bağış sayfasında "Bağışımı bildir" düğmesine bastığınızda adınız, telefonunuz, bağış alanı ve tutarı derneğimize iletilir: dernek e-postamıza bir kayıt düşer ve WhatsApp'ta size hazır bir mesaj açılır. Bu bilgileri yalnızca bağışınızı kayda geçirmek, size "bağışınız alınmıştır" mesajı göndermek ve isterseniz makbuz düzenlemek için kullanırız. WhatsApp üzerinden gönderdiğiniz mesajlar WhatsApp'ın kendi gizlilik koşullarına da tabidir. Düğmeye basmadığınız sürece sayfaya yazdığınız bilgiler hiçbir yere gönderilmez.</p>
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
     "Gündüzlü ve yatılı eğitim; Elif-Ba, Kur'an-ı Kerim, Tecvid, Kıraat, İlm-i Hal, Siyer, Emsile, Binâ, Maksûd, Avâmil, İzhâr ve hafızlık.",
     EGITIMLER, ""),
    ("heyetimiz.html", "heyetimiz", f"Heyetimiz | {MARKA}",
     "Menekşe İlim Kültür Okuma Derneği yönetim heyeti: Yönetim Kurulu Başkanı Salih Gedik Hocamız, Salih Özbey, Musa Yıldız ve Ercan Kul.",
     HEYETIMIZ, ""),
    ("bagis.html", "bagis", f"Bağış | {MARKA}",
     "Menekşe Medreseleri'ne bağış: talebe sofrası, Maltepe medrese inşaatı, Afrika'ya Mushaf ve kurban, Gazze'ye yemek. Her hayrın ayrı IBAN'ı; kolay havale ve EFT.",
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
             "img/desen.svg", "video/merasim-1.jpg",
             "img/hocalar/salih-gedik.jpg"]:  # videodan alınan kare Salih Gedik Hocamız değilmiş
    yol = os.path.join(OUT, eski)
    if os.path.exists(yol):
        os.remove(yol)
        print("silindi:", eski)
if os.path.isdir(os.path.join(OUT, "img/hocalar")) and not os.listdir(os.path.join(OUT, "img/hocalar")):
    os.rmdir(os.path.join(OUT, "img/hocalar"))
print("tamam")
