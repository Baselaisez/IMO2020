#!/usr/bin/env python3
"""src/js/pdf-font.js üretici.

PDF formundaki Türkçe harfler (ş, ğ, ı, İ) pdf-lib'in yerleşik Helvetica'sıyla
KODLANAMAZ. Bu betik Liberation Sans'ı yalnızca formun ihtiyaç duyduğu harflere
indirip base64 olarak bir JS modülüne gömer: 401 KB yerine ~17 KB.

Gereken:  pip install fonttools
Çalıştır: python3 resources/make-pdf-font.py
"""
import base64, os, subprocess

# ASCII + Latin-1 + Türkçe harfler + tipografik noktalama + ₺
RANGES = ("U+0020-007E,U+00A0-00FF,U+011E-011F,U+0130-0131,U+015E-015F,"
          "U+2013-2014,U+2018-201A,U+201C-201E,U+2026,U+2022,U+00B7,U+20BA,U+FEFF")

SRC = '/usr/share/fonts/truetype/liberation/LiberationSans-%s.ttf'
os.makedirs('resources/fonts', exist_ok=True)
b64 = {}
for name, style in (('regular', 'Regular'), ('bold', 'Bold')):
    dst = f'resources/fonts/LiberationSans-{name}.subset.ttf'
    subprocess.run(['pyftsubset', SRC % style, f'--unicodes={RANGES}',
                    f'--output-file={dst}', '--layout-features=*', '--no-hinting',
                    '--desubroutinize', '--drop-tables+=DSIG', '--recalc-bounds'], check=True)
    b64[name] = base64.b64encode(open(dst, 'rb').read()).decode()
    print(f'{name}: {os.path.getsize(dst)//1024} KB')
print('src/js/pdf-font.js elle güncellenmeli değil — bu betik yazar.')
