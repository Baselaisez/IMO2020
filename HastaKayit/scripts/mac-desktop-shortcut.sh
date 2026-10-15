#!/bin/bash
# Hasta Kayıt'ı Masaüstü'ne (ve istenirse Dock'a) koyar.
#
# NEDEN AYRI BİR BETİK: kurulum komutundaki tek satırlık `ln -s` bir SEMBOLİK
# BAĞ yaratıyor. Çalışıyor ama Finder onu çoğu zaman düz beyaz bir belge
# simgesiyle gösteriyor — kullanıcı "uygulama bozuk mu?" diye düşünüyor.
# Finder'ın kendi "diğer ad" (alias) dosyası doğru simgeyi ve doğru adı
# gösterir. Alias'ı yalnızca Finder üretebildiği için AppleScript gerekiyor;
# o da ilk çalıştırmada bir izin sorusu çıkarabiliyor (Terminal → Finder).
# İzin verilmezse sembolik bağa düşüyoruz: çirkin simge, çalışan kısayol.
#
# Kullanım:
#   bash scripts/mac-desktop-shortcut.sh          # Masaüstü kısayolu
#   bash scripts/mac-desktop-shortcut.sh --dock   # Masaüstü + Dock'a sabitle
set -u

APP_NAME="Hasta Kayıt"
APP_PATH="/Applications/${APP_NAME}.app"
DESKTOP="$HOME/Desktop"

if [ ! -d "$APP_PATH" ]; then
  echo "❌ Uygulama bulunamadı: $APP_PATH"
  echo "   Önce kurulum adımını yapın (uygulamayı Uygulamalar klasörüne koyun)."
  exit 1
fi

# Eskisini temizle: hem alias hem sembolik bağ olabilir, ikisi de aynı adı
# kullanır. -e sembolik bağ kırıksa false döner, o yüzden -L de bakıyoruz.
for old in "$DESKTOP/$APP_NAME" "$DESKTOP/${APP_NAME}.app" "$DESKTOP/${APP_NAME} alias"; do
  [ -e "$old" ] || [ -L "$old" ] && rm -rf "$old"
done

made=""

# 1) Finder alias (doğru simge). Hedef zaten varsa Finder hata verir, o yüzden
#    yukarıda temizledik.
if osascript -e "tell application \"Finder\" to make alias file to POSIX file \"$APP_PATH\" at POSIX file \"$DESKTOP\"" >/dev/null 2>&1; then
  made="alias"
  # Finder alias'a "Hasta Kayıt alias" adını verir; sadeleştir.
  [ -e "$DESKTOP/${APP_NAME} alias" ] && mv -f "$DESKTOP/${APP_NAME} alias" "$DESKTOP/$APP_NAME"
fi

# 2) Olmadıysa sembolik bağ.
if [ -z "$made" ]; then
  if ln -sfn "$APP_PATH" "$DESKTOP/$APP_NAME"; then
    made="symlink"
  else
    echo "❌ Masaüstü kısayolu oluşturulamadı."
    exit 1
  fi
fi

if [ "$made" = "alias" ]; then
  echo "✅ Masaüstüne kısayol kondu (Finder diğer adı — simge doğru görünür)."
else
  echo "✅ Masaüstüne kısayol kondu (sembolik bağ)."
  echo "   Simge düz beyaz görünürse: Terminal'e Finder'ı yönetme izni verilmemiş."
  echo "   Sistem Ayarları → Gizlilik ve Güvenlik → Otomasyon → Terminal → Finder'ı açın,"
  echo "   sonra bu komutu tekrar çalıştırın. (Kısayol şimdi de çalışıyor.)"
fi

# Dock'a sabitleme — yalnızca --dock verilirse. Dock'un listesini yazıp Dock'u
# yeniden başlatıyoruz; bu, Dock'u bir anlığına kapatıp açar, başka bir etkisi
# yoktur. Zaten ekliyse ikinci kez eklemiyoruz.
if [ "${1:-}" = "--dock" ]; then
  if defaults read com.apple.dock persistent-apps 2>/dev/null | grep -qF "$APP_PATH"; then
    echo "ℹ️  Zaten Dock'ta."
  else
    defaults write com.apple.dock persistent-apps -array-add \
      "<dict><key>tile-data</key><dict><key>file-data</key><dict><key>_CFURLString</key><string>${APP_PATH}</string><key>_CFURLStringType</key><integer>0</integer></dict></dict></dict>" \
      && killall Dock 2>/dev/null \
      && echo "✅ Dock'a sabitlendi."
  fi
fi
