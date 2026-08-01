// ui-photo.js — client-side patient photo resize.
//
// fileToResizedDataUrl(file) loads a picked image File, scales it so its
// longest side is <= maxPx, and returns a JPEG data-URL. Keeping the longest
// side ~400px at quality 0.7 yields ~20–40 KB photos, so the SQLite `photo`
// column (and every backup/sync payload it rides in) stays light.
//
// Needs a DOM/canvas, so it is not node-testable — kept intentionally tiny.
// Never throws: any failure rejects with a Turkish message the caller shows
// as a banner.
export function fileToResizedDataUrl(file, maxPx = 400, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Dosya seçilmedi.')); return; }
    let url;
    try {
      url = URL.createObjectURL(file);
    } catch {
      reject(new Error('Görsel okunamadı.'));
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const longest = Math.max(img.width, img.height) || 1;
        const scale = Math.min(1, maxPx / longest);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas desteklenmiyor.');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        URL.revokeObjectURL(url);
        if (!dataUrl || !dataUrl.startsWith('data:image/')) {
          reject(new Error('Görsel dönüştürülemedi.'));
          return;
        }
        resolve(dataUrl);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(new Error('Görsel işlenemedi — ' + (e.message || e)));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Görsel yüklenemedi — desteklenmeyen dosya olabilir.'));
    };
    img.src = url;
  });
}

// --- Dekont (payment receipt) ------------------------------------------------

// A PDF dekont is stored verbatim as base64, so it lands in the SQLite row AND
// in every JSON backup/snapshot the app writes. 3 MB is the hard cap: base64
// inflates by ~33%, so 3 MB of PDF is already ~4 MB of text per payment. Bigger
// than that, the doctor is told to photograph the receipt instead (images go
// through fileToResizedDataUrl and end up ~100-250 KB).
export const MAX_RECEIPT_PDF_BYTES = 3 * 1024 * 1024;

// validateReceiptFile({ type, size }) -> { ok: true, kind: 'image'|'pdf' }
//                                     | { ok: false, error: '<turkish>' }
// Pure (no DOM, no I/O) so the accept/reject policy is unit-testable. Never
// throws — garbage input is just a rejection.
export function validateReceiptFile(file) {
  const type = String(file?.type ?? '');
  if (type.startsWith('image/')) return { ok: true, kind: 'image' };
  if (type === 'application/pdf') {
    const size = file?.size;
    // An unknown size cannot be checked against the cap; refusing is the safe
    // side of the trade (better a re-pick than an unbounded blob in the DB).
    if (!Number.isFinite(size) || size > MAX_RECEIPT_PDF_BYTES)
      return { ok: false, error: 'Dekont çok büyük (en fazla 3 MB). Lütfen fotoğrafını çekin.' };
    return { ok: true, kind: 'pdf' };
  }
  return { ok: false, error: 'Sadece resim veya PDF dekont eklenebilir.' };
}

// Read a File verbatim into a base64 data-URL — used for PDF dekonts, which
// (unlike images) must not be re-encoded. Needs a DOM FileReader, so it is not
// node-testable; kept intentionally tiny. Rejects with a Turkish message.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('Dosya seçilmedi.')); return; }
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result || '');
      if (!s.startsWith('data:')) { reject(new Error('Dosya okunamadı.')); return; }
      resolve(s);
    };
    fr.onerror = () => reject(new Error('Dosya okunamadı.'));
    fr.readAsDataURL(file);
  });
}
