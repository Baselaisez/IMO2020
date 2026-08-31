// ui-dnd.js — sürükle-bırak (drag & drop) dosya girişi.
//
// Doktor masaüstünde (Electron) hasta formlarını ve fotoğrafları dosya
// seçiciden geçmeden doğrudan pencereye bırakabilsin diye. Tarayıcı
// önizlemede de çalışır; Android'de sürükleme diye bir şey olmadığı için
// dinleyiciler hiç tetiklenmez (zararsız no-op).
//
// KRİTİK: dragover ve drop üzerinde preventDefault ŞART. Aksi halde tarayıcı
// (ve Electron'un WebView'i) bırakılan dosyaya "navigasyon" yapar — uygulama
// ekrandan kaybolur, sadece dosya görünür.

export const DND_OVERLAY_TEXT =
  '📂 Dosyaları buraya bırakın (Form: PDF/Word · Veri: JSON/Excel · Fotoğraf: JPG/PNG)';

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const DOC_EXT = /\.(pdf|docx|json|xlsx)$/i;

// Saf (DOM'suz) yardımcılar — { name, type } taşıyan herhangi bir nesne ile
// çağrılabilir, bu yüzden node ile test edilebilirler.

export function isImageFile(file) {
  if (!file) return false;
  if (String(file.type || '').toLowerCase().startsWith('image/')) return true;
  return IMAGE_EXT.test(String(file.name || ''));
}

export function isDocFile(file) {
  if (!file) return false;
  return DOC_EXT.test(String(file.name || ''));
}

// docs = .pdf .docx .json .xlsx (büyük/küçük harf duyarsız). Uzantı önce
// bakılır: bir .pdf'in MIME'ı boş gelse bile belge sayılır, bir "image/*"
// MIME'lı .xlsx (olmaz ama) yine belge kalır.
export function classifyFiles(files) {
  const images = [];
  const docs = [];
  const unknown = [];
  for (const f of files || []) {
    if (!f) continue;
    if (isDocFile(f)) docs.push(f);
    else if (isImageFile(f)) images.push(f);
    else unknown.push(f);
  }
  return { images, docs, unknown };
}

/**
 * Bu sürüklemeyle ilgileniyor muyuz? Saf — testi var.
 *
 * 'Files' → dosya sürükleniyor. 'text/uri-list' → tarayıcıdan bir görsel/bağlantı
 * sürükleniyor (WhatsApp Web bu yolu kullanır). Uygulama içinde SEÇİLİ METİN
 * sürüklemek yalnızca 'text/plain' üretir, o yüzden kaplama açılmaz.
 */
export function dragIsInteresting(types) {
  const list = Array.from(types || []);
  return list.includes('Files') || list.includes('text/uri-list');
}

function dragWanted(e) {
  return dragIsInteresting((e && e.dataTransfer && e.dataTransfer.types) || []);
}

function typeList(dt) {
  const t = (dt && dt.types) || [];
  const out = [];
  for (let i = 0; i < t.length; i++) out.push(t[i]);
  return out;
}

const DATA_IMG_RE = /(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+)/i;
const IMG_URL_RE = /^(https?:|blob:)\S+/i;

/**
 * Bir sürükleme/yapıştırma yükünde ne var? Saf — testi var.
 *
 * NEDEN GEREKLİ: WhatsApp'tan görsel taşımanın iki yolu var ve ikisi taban
 * tabana zıt veri gönderiyor.
 *   • WhatsApp masaüstü uygulaması → gerçek bir DOSYA (dataTransfer.files).
 *   • WhatsApp Web (Safari/Chrome) → dosya YOK; yalnızca `text/uri-list` ya da
 *     içinde <img src> geçen `text/html`.
 * Eski kod yalnızca ilkine bakıyordu; ikinci durumda sürükleme kaplaması bile
 * açılmıyor, bırakma HİÇBİR ŞEY yapmıyordu — kullanıcıya "olmadı" bile
 * denmiyordu.
 *
 * `data:` ile gelen görseli yerel olarak çözebiliyoruz (CSP `img-src data:`
 * izinli). `http(s):`/`blob:` bağlantısını İNDİREMEYİZ: uygulama hiçbir yere
 * bağlanmaz (CSP `connect-src 'self'`) ve bu söz hasta verisi için kasıtlıdır.
 * O durumda kullanıcıya ne yapacağını söylüyoruz — sessiz kalmıyoruz.
 *
 * @returns {{kind:'file',file:File}|{kind:'dataurl',dataUrl:string}|{kind:'remote',url:string}|{kind:'none'}}
 */
export function extractDroppedImage(dt) {
  if (!dt) return { kind: 'none' };
  const files = Array.from(dt.files || []);
  const img = files.find(f => isImageFile(f));
  if (img) return { kind: 'file', file: img };

  const types = typeList(dt);
  const read = (t) => { try { return types.includes(t) ? String(dt.getData(t) || '') : ''; } catch { return ''; } };

  const html = read('text/html');
  const inHtml = html.match(DATA_IMG_RE);
  if (inHtml) return { kind: 'dataurl', dataUrl: inHtml[1] };

  const uri = (read('text/uri-list') || read('text/plain')).split(/[\r\n]+/).find(Boolean) || '';
  const inUri = uri.match(DATA_IMG_RE);
  if (inUri) return { kind: 'dataurl', dataUrl: inUri[1] };

  const htmlSrc = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  const candidate = htmlSrc ? htmlSrc[1] : uri;
  if (candidate && IMG_URL_RE.test(candidate)) return { kind: 'remote', url: candidate };
  return { kind: 'none' };
}

// Bağlantı olarak gelen görsel için kullanıcıya söylenecek şey. Saf.
// Suçlayıcı değil, YAPILACAK İŞİ söylüyor.
export const REMOTE_IMAGE_HELP =
  'Bu fotoğraf bir bağlantı olarak geldi (WhatsApp Web / tarayıcı). Uygulama '
  + 'hiçbir yere bağlanmadığı için bağlantıyı indiremez. Şunu yapın: WhatsApp\'ta '
  + 'fotoğrafa sağ tıklayıp “Resmi Kopyala” deyin, sonra bu formda ⌘V ile '
  + 'yapıştırın. (Ya da fotoğrafı bilgisayara indirip buraya sürükleyin.)';

function buildOverlay() {
  const el = document.createElement('div');
  el.id = 'dnd-overlay';
  el.className = 'dnd-overlay hidden';
  const box = document.createElement('div');
  box.className = 'dnd-box';
  box.textContent = DND_OVERLAY_TEXT;
  el.appendChild(box);
  document.body.appendChild(el);
  return el;
}

/**
 * Pencere seviyesinde sürükle-bırak dinleyicilerini kurar.
 * @param {{ onFiles: (files: File[]) => any }} opts
 * @returns {() => void} dinleyicileri kaldıran fonksiyon
 */
export function initDragDrop({ onFiles, onImage } = {}) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let overlay = null;
  // dragenter/dragleave HER alt eleman için ayrı ayrı tetiklenir; düz bir
  // boolean bayrak fareyi gezdirirken kaplamayı titretir. Sayaç ile
  // enter/leave çiftlerini eşleştiriyoruz: sadece 0'a düşünce gizle.
  let depth = 0;

  function show() {
    if (!overlay) overlay = buildOverlay();
    overlay.classList.remove('hidden');
  }
  function hide() {
    depth = 0;
    if (overlay) overlay.classList.add('hidden');
  }

  function onDragEnter(e) {
    if (!dragWanted(e)) return;
    e.preventDefault();
    depth++;
    show();
  }
  function onDragOver(e) {
    if (!dragWanted(e)) return;
    e.preventDefault(); // ŞART: bu olmadan drop hiç tetiklenmez ve tarayıcı dosyaya gider
    try { e.dataTransfer.dropEffect = 'copy'; } catch { /* bazı ortamlar salt-okunur */ }
    if (depth === 0) { depth = 1; show(); } // dragenter kaçtıysa kurtar
  }
  function onDragLeave(e) {
    if (!dragWanted(e)) return;
    depth--;
    if (depth <= 0) hide();
  }
  function onDrop(e) {
    if (!dragWanted(e)) { hide(); return; }
    e.preventDefault(); // ŞART: navigasyonu engelle
    hide();
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length) {
      if (typeof onFiles === 'function') {
        Promise.resolve()
          .then(() => onFiles(files))
          .catch(err => console.error('Sürükle-bırak işlenemedi:', err));
      }
      return;
    }
    // Dosya yok ama görsel olabilir: WhatsApp Web / tarayıcı sürüklemesi.
    // Eskiden buradan sessizce çıkılıyordu.
    const payload = extractDroppedImage(e.dataTransfer);
    if (payload.kind === 'none') return;
    if (typeof onImage === 'function') {
      Promise.resolve()
        .then(() => onImage(payload))
        .catch(err => console.error('Sürüklenen görsel işlenemedi:', err));
    }
  }
  // Sürükleme pencere dışında biterse (ESC, iptal) kaplama takılı kalmasın.
  function onDragEnd() { hide(); }

  window.addEventListener('dragenter', onDragEnter);
  window.addEventListener('dragover', onDragOver);
  window.addEventListener('dragleave', onDragLeave);
  window.addEventListener('drop', onDrop);
  window.addEventListener('dragend', onDragEnd);

  return () => {
    window.removeEventListener('dragenter', onDragEnter);
    window.removeEventListener('dragover', onDragOver);
    window.removeEventListener('dragleave', onDragLeave);
    window.removeEventListener('drop', onDrop);
    window.removeEventListener('dragend', onDragEnd);
    hide();
  };
}

// Görünür bir bırakma alanına sadece vurgu (.over) ekler — bırakmanın kendisi
// yukarıdaki pencere seviyesindeki dinleyici tarafından işlenir, yani mantık
// tek yerde kalır.
export function attachDropZone(el) {
  if (!el) return;
  let depth = 0;
  el.addEventListener('dragenter', e => {
    if (!dragWanted(e)) return;
    depth++;
    el.classList.add('over');
  });
  el.addEventListener('dragleave', e => {
    if (!dragWanted(e)) return;
    depth--;
    if (depth <= 0) { depth = 0; el.classList.remove('over'); }
  });
  el.addEventListener('drop', () => { depth = 0; el.classList.remove('over'); });
}
