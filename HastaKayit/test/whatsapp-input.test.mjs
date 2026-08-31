import test from 'node:test';
import assert from 'node:assert/strict';
import { extractDroppedImage, dragIsInteresting, REMOTE_IMAGE_HELP } from '../src/js/ui-dnd.js';
import { parsePatientText, stripChatDecoration } from '../src/js/paste-parse.js';
import { looksLikePatientText } from '../src/js/ui-form.js';
import { snapshotDue, SNAPSHOT_MIN_INTERVAL_MS } from '../src/js/snapshot.js';

// DataTransfer taklidi: gerçek olayın taşıdığı yüzeyin aynısı.
function dt({ files = [], data = {} } = {}) {
  return { files, types: Object.keys(data), getData: (t) => data[t] ?? '' };
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

// --- Sürükleme / yapıştırma yükü -------------------------------------------

test('dragIsInteresting: dosya ve tarayıcı görseli evet, metin seçimi hayır', () => {
  assert.equal(dragIsInteresting(['Files']), true);
  assert.equal(dragIsInteresting(['text/uri-list', 'text/html']), true, 'WhatsApp Web sürüklemesi');
  assert.equal(dragIsInteresting(['text/plain']), false, 'uygulama içi metin seçimi kaplamayı açmasın');
  assert.equal(dragIsInteresting([]), false);
});

test('extractDroppedImage: WhatsApp masaüstü → gerçek dosya', () => {
  const file = { name: 'WhatsApp Image 2026-08-26.jpeg', type: 'image/jpeg' };
  assert.deepEqual(extractDroppedImage(dt({ files: [file] })), { kind: 'file', file });
});

test('extractDroppedImage: gömülü data: görseli çözülür', () => {
  const r = extractDroppedImage(dt({ data: { 'text/html': `<img src="${PNG}">` } }));
  assert.deepEqual(r, { kind: 'dataurl', dataUrl: PNG });
  const r2 = extractDroppedImage(dt({ data: { 'text/uri-list': PNG } }));
  assert.deepEqual(r2, { kind: 'dataurl', dataUrl: PNG });
});

test('extractDroppedImage: WhatsApp Web bağlantısı "remote" olarak bildirilir', () => {
  // Eskiden bu durumda hiçbir şey olmuyordu — kullanıcı bırakıyor, ekran susuyordu.
  const r = extractDroppedImage(dt({ data: {
    'text/uri-list': 'https://web.whatsapp.com/media/abc.jpeg',
    'text/html': '<img src="https://web.whatsapp.com/media/abc.jpeg">',
  } }));
  assert.equal(r.kind, 'remote');
  assert.match(r.url, /whatsapp/);
  assert.match(REMOTE_IMAGE_HELP, /Resmi Kopyala/, 'kullanıcıya ne yapacağı söylenir');
});

test('extractDroppedImage: blob: bağlantısı da indirilemez olarak işaretlenir', () => {
  const r = extractDroppedImage(dt({ data: { 'text/uri-list': 'blob:https://web.whatsapp.com/9f8c' } }));
  assert.equal(r.kind, 'remote');
});

test('extractDroppedImage: görsel yoksa "none"', () => {
  assert.deepEqual(extractDroppedImage(dt({ data: { 'text/plain': 'merhaba' } })), { kind: 'none' });
  assert.deepEqual(extractDroppedImage(null), { kind: 'none' });
  // Belge sürüklemesi görsel değildir (o yol classifyFiles'a gider).
  assert.equal(extractDroppedImage(dt({ files: [{ name: 'form.pdf', type: 'application/pdf' }] })).kind, 'none');
});

// --- WhatsApp metni ---------------------------------------------------------

test('stripChatDecoration: köşeli parantezli damga ve gönderen adı atılır', () => {
  const t = '[26.08.2026 20:41] Salih Gedik: Ayşe Yılmaz\n[26.08.2026 20:42] Salih Gedik: Fatma';
  assert.equal(stripChatDecoration(t), 'Ayşe Yılmaz\nFatma');
});

test('stripChatDecoration: tireli damga biçimi de atılır', () => {
  const t = '26/08/2026, 20:41 - Salih Gedik: Ayşe Yılmaz\n26/08/2026, 20:42 - Salih Gedik: 0532 111 22 33';
  assert.equal(stripChatDecoration(t), 'Ayşe Yılmaz\n0532 111 22 33');
});

test('stripChatDecoration: şablonun talimat satırı ve görünmez işaretler temizlenir', () => {
  const t = 'KİŞİNİN ESKİ OLMAYAN BİR RESMİNİ\n‎Ayşe Yılmaz‏';
  assert.equal(stripChatDecoration(t), 'Ayşe Yılmaz');
});

test('stripChatDecoration: süslemesiz metne dokunmaz', () => {
  const t = 'Adı Soyadı: Ayşe Yılmaz\nAnne adı: Fatma';
  assert.equal(stripChatDecoration(t), t);
});

test('WhatsApp damgalı yapıştırma artık DOĞRU adı buluyor', () => {
  // Damga temizlenmeden gönderenin adı ("Salih Gedik") hastanın adı sanılıyor,
  // damgadaki tarih de doğum tarihi diye okunuyordu.
  const t = [
    '[26.08.2026 20:41] Salih Gedik: Adı Soyadı: Ayşe Yılmaz',
    '[26.08.2026 20:41] Salih Gedik: Anne adı: Fatma',
    '[26.08.2026 20:41] Salih Gedik: Telefon No: 0532 111 22 33',
    '[26.08.2026 20:41] Salih Gedik: Nerede oturuyor: İstanbul - Kartal',
  ].join('\n');
  const p = parsePatientText(t, '2026-08-26');
  assert.equal(p.name, 'Ayşe Yılmaz');
  assert.equal(p.mother_name, 'Fatma');
  assert.equal(p.phone, '05321112233');
  assert.match(p.residence, /Kartal/);
  assert.equal(p.birth_date, '', 'damgadaki tarih doğum tarihi DEĞİLDİR');
});

test('etiketsiz WhatsApp cevabı da damgadan arındırılıp okunur', () => {
  const t = [
    '26/08/2026, 20:41 - Ayşe Yılmaz: Ayşe Yılmaz',
    '26/08/2026, 20:41 - Ayşe Yılmaz: 04.03.1988',
    '26/08/2026, 20:41 - Ayşe Yılmaz: İstanbul - Kartal',
    '26/08/2026, 20:41 - Ayşe Yılmaz: 0532 111 22 33',
    '26/08/2026, 20:41 - Ayşe Yılmaz: Fatma',
  ].join('\n');
  const p = parsePatientText(t, '2026-08-26');
  assert.equal(p.name, 'Ayşe Yılmaz');
  assert.equal(p.birth_date, '1988-03-04');
  assert.equal(p.phone, '05321112233');
});

test('looksLikePatientText: tek kelime yapıştırmaya karışılmaz', () => {
  assert.equal(looksLikePatientText('nazar'), false);
  assert.equal(looksLikePatientText(''), false);
  assert.equal(looksLikePatientText('Ayşe Yılmaz\n0532 111 22 33'), true, 'çok satırlı');
  assert.equal(looksLikePatientText('Adı Soyadı: Ayşe Yılmaz'), true, 'etiketli');
  assert.equal(looksLikePatientText('bu uzunca bir tanı cümlesi ama tek satır'), false);
});

// --- Yedek anlık görüntüsünün sıklığı --------------------------------------

test('snapshotDue: her kayıtta değil, aralıklı', () => {
  const now = 1_000_000_000;
  assert.equal(snapshotDue(0, now), true, 'oturumda ilk kez');
  assert.equal(snapshotDue(now - 1000, now), false, 'az önce alındı');
  assert.equal(snapshotDue(now - SNAPSHOT_MIN_INTERVAL_MS, now), true);
  assert.equal(snapshotDue(now + 60000, now), true, 'saat geri alınmışsa emniyetli taraf');
});
