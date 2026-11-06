# -*- coding: utf-8 -*-
"""Orijinal logo PDF'inden (CorelDRAW çıktısı) site için SVG dosyaları üretir.

Kullanım (depo kökünden):
    python3 menekseilim-kaynak/logo_uret.py

Gerekenler: poppler-utils (pdftocairo).
Üretilen dosyalar (menekseilim-site/ altında):
    img/logo.svg       yatay logo (mühür + MENEKŞE yazısı), açık zemin için
    img/logo-acik.svg  aynı logo, yazılar beyaz; koyu yeşil zemin için
    img/muhur.svg      yalnız yuvarlak mühür
    favicon.svg        tarayıcı sekmesi simgesi (mühür)
"""
import os
import re
import subprocess
import tempfile

KOK = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PDF = os.path.join(KOK, "menekseilim-kaynak", "logo-orijinal.pdf")
SITE = os.path.join(KOK, "menekseilim-site")

RENKLER = {
    "rgb(53.056335%, 3.28064%, 15.155029%)": "#870826",  # bordo
    "rgb(100%, 98.719788%, 74.900818%)": "#FFFCBF",      # krem
    "rgb(100%, 100%, 100%)": "#FFFFFF",                  # beyaz
    "rgb(7.03125%, 23.48938%, 25.613403%)": "#123C41",   # koyu yeşil
}
BASLIK = "Menekşe İlim Kültür Okuma Derneği"


def pdf_den_pathler():
    with tempfile.TemporaryDirectory() as td:
        svg = os.path.join(td, "logo.svg")
        subprocess.run(["pdftocairo", "-svg", PDF, svg], check=True)
        s = open(svg, encoding="utf-8").read()
    pathler = []
    for p in re.findall(r"<path\b[^>]*?/>", s, re.S):
        fill = re.search(r'fill="([^"]+)"', p).group(1)
        kural = re.search(r'fill-rule="([^"]+)"', p).group(1)
        d = re.search(r'\sd="([^"]+)"', p).group(1)
        d = re.sub(r"-?\d+\.\d+", lambda m: f"{float(m.group()):.2f}".rstrip("0").rstrip("."), d)
        d = re.sub(r"\s+", " ", d).strip()
        pathler.append({"renk": RENKLER.get(fill, fill), "kural": kural, "d": d})
    if len(pathler) != 8:
        raise SystemExit(f"Beklenmeyen logo yapısı: {len(pathler)} parça")
    return pathler


def svg(pathler, viewbox, genislik, yukseklik, yazi_rengi=None):
    parcalar = []
    for i, p in enumerate(pathler):
        renk = yazi_rengi if (yazi_rengi and i in (0, 1)) else p["renk"]
        parcalar.append(f'<path fill="{renk}" fill-rule="{p["kural"]}" d="{p["d"]}"/>')
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="{genislik}" height="{yukseklik}" '
        f'role="img" aria-label="{BASLIK}"><title>{BASLIK}</title>' + "".join(parcalar) + "</svg>\n"
    )


def yaz(rel, icerik):
    yol = os.path.join(SITE, rel)
    with open(yol, "w", encoding="utf-8") as f:
        f.write(icerik)
    print(f"yazıldı: {rel} ({len(icerik.encode())//1024} KB)")


def main():
    p = pdf_den_pathler()
    # Yatay logo: x 52.3–570.5, y 380.3–489.2 (pt)
    yaz("img/logo.svg", svg(p, "50.8 378.8 521.2 112", 521, 112))
    yaz("img/logo-acik.svg", svg(p, "50.8 378.8 521.2 112", 521, 112, yazi_rengi="#FFFFFF"))
    # Mühür: parça 2–7, x 52.3–161.2, y 380.3–489.2
    muhur = svg(p[2:], "51.3 379.3 110.9 110.9", 111, 111)
    yaz("img/muhur.svg", muhur)
    yaz("favicon.svg", muhur)


if __name__ == "__main__":
    main()
