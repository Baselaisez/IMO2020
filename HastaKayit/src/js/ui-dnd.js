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

// Sürüklenen şey GERÇEKTEN dosya mı? (Uygulama içinde seçili metni
// sürüklemek kaplamayı açmasın.) types bazı tarayıcılarda DOMStringList.
function dragHasFiles(e) {
  const t = e && e.dataTransfer && e.dataTransfer.types;
  if (!t) return false;
  for (let i = 0; i < t.length; i++) if (t[i] === 'Files') return true;
  return false;
}

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
export function initDragDrop({ onFiles } = {}) {
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
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    depth++;
    show();
  }
  function onDragOver(e) {
    if (!dragHasFiles(e)) return;
    e.preventDefault(); // ŞART: bu olmadan drop hiç tetiklenmez ve tarayıcı dosyaya gider
    try { e.dataTransfer.dropEffect = 'copy'; } catch { /* bazı ortamlar salt-okunur */ }
    if (depth === 0) { depth = 1; show(); } // dragenter kaçtıysa kurtar
  }
  function onDragLeave(e) {
    if (!dragHasFiles(e)) return;
    depth--;
    if (depth <= 0) hide();
  }
  function onDrop(e) {
    if (!dragHasFiles(e)) { hide(); return; }
    e.preventDefault(); // ŞART: navigasyonu engelle
    hide();
    const list = (e.dataTransfer && e.dataTransfer.files) || [];
    const files = Array.from(list);
    if (!files.length) return;
    if (typeof onFiles === 'function') {
      Promise.resolve()
        .then(() => onFiles(files))
        .catch(err => console.error('Sürükle-bırak işlenemedi:', err));
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
    if (!dragHasFiles(e)) return;
    depth++;
    el.classList.add('over');
  });
  el.addEventListener('dragleave', e => {
    if (!dragHasFiles(e)) return;
    depth--;
    if (depth <= 0) { depth = 0; el.classList.remove('over'); }
  });
  el.addEventListener('drop', () => { depth = 0; el.classList.remove('over'); });
}
