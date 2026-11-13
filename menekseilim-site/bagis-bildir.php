<?php
/**
 * Bağış bildirimi – Menekşe İlim Kültür Okuma Derneği
 *
 * Bağış sayfasındaki "Bağışımı bildir" düğmesi bu dosyaya bağışçının adını, telefonunu,
 * bağış alanını ve tutarını gönderir (aynı anda bağışçının telefonunda WhatsApp mesajı açılır).
 * Dernek e-postasına bir kayıt düşer; içinde bağışçıya tek dokunuşla
 * "bağışınız alınmıştır" WhatsApp mesajı gönderme bağlantısı vardır.
 * Paylaşımlı hosting'de (cPanel) PHP mail() ile çalışır.
 */

// ---------------- AYARLAR ----------------
$ALICI      = 'menekseilim@gmail.com';            // Bildirimlerin geleceği adres
$GONDEREN   = 'no-reply@menekseilim.com.tr';      // Kendi alan adınızdan bir adres (spam'e düşmesin)
$KONU_ONEKI = '[Bağış bildirimi] ';
$DERNEK     = 'Menekşe İlim Kültür Okuma Derneği';
// -----------------------------------------

date_default_timezone_set('Europe/Istanbul');
header('X-Content-Type-Options: nosniff');
header('Content-Type: application/json; charset=utf-8');

function cevap(bool $ok, string $mesaj): void {
    echo json_encode(['ok' => $ok, 'mesaj' => $mesaj], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    cevap(false, 'Geçersiz istek.');
}
if (!empty($_POST['website'])) {          // bal küpü: botlar doldurur
    cevap(true, 'Bildiriminiz alındı.');
}

$temiz = static function (string $k, int $maks): string {
    $v = isset($_POST[$k]) ? trim((string) $_POST[$k]) : '';
    $v = str_replace(["\r", "\n"], ' ', $v); // başlık enjeksiyonuna karşı
    return mb_substr($v, 0, $maks, 'UTF-8');
};

$ad       = $temiz('ad', 80);
$telefon  = $temiz('telefon', 30);
$alan     = $temiz('alan', 80);
$tutar    = $temiz('tutar', 30);
$aciklama = $temiz('aciklama', 160);
$kvkk     = !empty($_POST['kvkk']);

$rakam = preg_replace('/\D+/', '', $telefon);
if ($ad === '' || strlen($rakam) < 10) {
    cevap(false, 'Lütfen adınızı ve telefonunuzu yazın.');
}
if (!$kvkk) {
    cevap(false, 'Devam etmek için aydınlatma metnini onaylamanız gerekir.');
}

// Bağışçının numarasını WhatsApp biçimine çevir (90XXXXXXXXXX)
$wa = '';
if (strlen($rakam) === 12 && strpos($rakam, '90') === 0)      { $wa = $rakam; }
elseif (strlen($rakam) === 11 && strpos($rakam, '0') === 0)   { $wa = '9' . $rakam; }
elseif (strlen($rakam) === 10)                                { $wa = '90' . $rakam; }

$tesekkur = "Selamün aleyküm $ad, $alan için gönderdiğiniz $tutar bağışınız alınmıştır. "
          . "Allah kabul etsin, hayrınızı daim eylesin. $DERNEK";

$govde  = "Siteden yeni bir bağış bildirimi geldi.\n\n";
$govde .= "Ad soyad : $ad\n";
$govde .= "Telefon  : $telefon\n";
$govde .= "Bağış    : $alan\n";
$govde .= "Tutar    : $tutar\n";
$govde .= "Açıklama : " . ($aciklama !== '' ? $aciklama : '-') . "\n";
$govde .= "Tarih    : " . date('d.m.Y H:i') . "\n\n";
$govde .= "Önce bağışın hesaba geçtiğini kontrol edin.\n";
if ($wa !== '') {
    $govde .= "Sonra bağışçıya \"bağışınız alınmıştır\" mesajını tek dokunuşla göndermek için:\n";
    $govde .= 'https://wa.me/' . $wa . '?text=' . rawurlencode($tesekkur) . "\n";
} else {
    $govde .= "Bağışçıya gönderilecek mesaj:\n$tesekkur\n";
}

$basliklar  = "From: " . mb_encode_mimeheader('Menekşe İlim Web Sitesi', 'UTF-8') . " <$GONDEREN>\r\n";
$basliklar .= "MIME-Version: 1.0\r\n";
$basliklar .= "Content-Type: text/plain; charset=UTF-8\r\n";
$basliklar .= "Content-Transfer-Encoding: 8bit\r\n";

$konu = mb_encode_mimeheader($KONU_ONEKI . "$ad - $tutar ($alan)", 'UTF-8');

if (@mail($ALICI, $konu, $govde, $basliklar, '-f' . $GONDEREN)) {
    cevap(true, 'Bildiriminiz alındı.');
}
cevap(false, 'Bildirim e-postası gönderilemedi.');
