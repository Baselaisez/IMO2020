<?php
/**
 * İletişim formu gönderici – Menekşe İlim Kültür ve Okuma Derneği
 *
 * Paylaşımlı Linux hosting'lerde (cPanel/Plesk) PHP'nin mail() fonksiyonu ile çalışır.
 * AYARLAR bölümünü düzenleyin. Sitenizi GitHub Pages / Netlify gibi statik bir
 * serviste yayınlıyorsanız bu dosya çalışmaz; rehberdeki Formspree seçeneğine bakın.
 */

// ---------------- AYARLAR ----------------
$ALICI        = 'menekseilim@gmail.com';            // Mesajların geleceği adres
$GONDEREN     = 'no-reply@menekseilim.com.tr';      // Kendi alan adınızdan bir adres olmalı (spam'e düşmemesi için)
$KONU_ONEKI   = '[menekseilim.com.tr] ';
$GERI_DON     = 'iletisim.html';                    // JS kapalıyken yönlendirilecek sayfa
// -----------------------------------------

header('X-Content-Type-Options: nosniff');
$jsonIstendi = isset($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false;

function cevap(bool $ok, string $mesaj): void {
    global $jsonIstendi, $GERI_DON;
    if ($jsonIstendi) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => $ok, 'mesaj' => $mesaj], JSON_UNESCAPED_UNICODE);
    } else {
        header('Location: ' . $GERI_DON . '?durum=' . ($ok ? 'ok' : 'hata') . '#iletisim-formu');
    }
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    cevap(false, 'Geçersiz istek.');
}

// Bal küpü (botlar doldurur, insanlar görmez)
if (!empty($_POST['website'])) {
    cevap(true, 'Mesajınız alındı.');
}

$temiz = static function (string $k, int $maks = 500): string {
    $v = isset($_POST[$k]) ? trim((string) $_POST[$k]) : '';
    $v = str_replace(["\r", "\n"], ' ', $v); // başlık enjeksiyonuna karşı
    return mb_substr($v, 0, $maks, 'UTF-8');
};

$ad      = $temiz('ad', 120);
$eposta  = $temiz('eposta', 200);
$telefon = $temiz('telefon', 40);
$konu    = $temiz('konu', 120);
$mesaj   = isset($_POST['mesaj']) ? mb_substr(trim((string) $_POST['mesaj']), 0, 4000, 'UTF-8') : '';
$kvkk    = !empty($_POST['kvkk']);

if ($ad === '' || $mesaj === '' || !filter_var($eposta, FILTER_VALIDATE_EMAIL)) {
    cevap(false, 'Lütfen ad, geçerli bir e-posta ve mesaj alanlarını doldurun.');
}
if (!$kvkk) {
    cevap(false, 'Devam etmek için aydınlatma metnini onaylamanız gerekir.');
}

$govde  = "Ad Soyad : $ad\n";
$govde .= "E-posta  : $eposta\n";
$govde .= "Telefon  : " . ($telefon !== '' ? $telefon : '-') . "\n";
$govde .= "Konu     : " . ($konu !== '' ? $konu : '-') . "\n";
$govde .= "Tarih    : " . date('d.m.Y H:i') . "\n";
$govde .= "IP       : " . ($_SERVER['REMOTE_ADDR'] ?? '-') . "\n\n";
$govde .= "Mesaj:\n$mesaj\n";

$basliklar  = "From: " . mb_encode_mimeheader('Menekşe İlim Web Sitesi', 'UTF-8') . " <$GONDEREN>\r\n";
$basliklar .= "Reply-To: " . mb_encode_mimeheader($ad, 'UTF-8') . " <$eposta>\r\n";
$basliklar .= "MIME-Version: 1.0\r\n";
$basliklar .= "Content-Type: text/plain; charset=UTF-8\r\n";
$basliklar .= "Content-Transfer-Encoding: 8bit\r\n";

$konuSatiri = mb_encode_mimeheader($KONU_ONEKI . ($konu !== '' ? $konu : 'Yeni mesaj') . ' - ' . $ad, 'UTF-8');

$gonderildi = @mail($ALICI, $konuSatiri, $govde, $basliklar, '-f' . $GONDEREN);

if ($gonderildi) {
    cevap(true, 'Mesajınız alındı. En kısa sürede size dönüş yapacağız.');
}
cevap(false, 'Mesaj gönderilemedi. Lütfen daha sonra tekrar deneyin veya e-posta ile ulaşın.');
