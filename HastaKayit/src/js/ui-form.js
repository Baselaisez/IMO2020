import { addPatient, updatePatient, getPatient, deletePatient, getMeta } from './repo.js';
import { state, showScreen, guarded, banner, todayIso, esc } from './ui.js';
import { refreshHome } from './ui-home.js';
import { openCard } from './ui-card.js';
import { fileToResizedDataUrl } from './ui-photo.js';
import { attachVoice } from './ui-voice.js';
import { createAutosave, autosaveDelayMs } from './autosave.js';
import { extractDroppedImage, REMOTE_IMAGE_HELP } from './ui-dnd.js';
import { parsePatientText } from './paste-parse.js';

// Neutral person-silhouette placeholder shown when a patient has no photo.
// Inline SVG data-URL so it needs no asset file and works offline.
const PHOTO_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='#bbb'><circle cx='12' cy='8' r='4.2'/><path d='M3.5 21c0-4.4 4-6.8 8.5-6.8s8.5 2.4 8.5 6.8z'/></svg>"
);

// The photo data-URL held for the form currently open. Initialized in openForm
// to the editing patient's existing photo (so leaving it untouched saves the
// same value) or null for a new patient. Updated by the Ekle/Kaldır controls.
let formPhoto = null;

function renderPhotoPreview() {
  const img = document.getElementById('photo-preview');
  const rm = document.getElementById('btn-photo-remove');
  if (!img) return;
  if (formPhoto) {
    img.src = formPhoto;
    img.style.objectFit = 'cover';
    if (rm) rm.style.display = '';
  } else {
    img.src = PHOTO_PLACEHOLDER;
    img.style.objectFit = 'contain';
    if (rm) rm.style.display = 'none';
  }
}

// Set the open form's photo from a File — used by BOTH the 📷 file picker and
// the drag-drop handler (ui-dnd.js → ui-settings.js), so the resize path,
// preview render and formPhoto state stay owned by this module.
// Never throws: shows the error banner itself and returns false.
export async function setFormPhotoFromFile(file) {
  try {
    formPhoto = await fileToResizedDataUrl(file);
    renderPhotoPreview();
    return true;
  } catch (err) {
    banner('Fotoğraf eklenemedi — ' + (err.message || err), 'error', 0);
    return false;
  }
}

/**
 * Formun fotoğrafını bir data: URL'inden ayarlar (sürükleme/yapıştırma ile
 * gelen gömülü görsel). Dosya yolundan farkı: yeniden boyutlandırma için önce
 * Blob'a çevirir, böylece 4 MB'lık bir WhatsApp fotoğrafı veritabanına olduğu
 * gibi girmez. Asla fırlatmaz.
 */
export async function setFormPhotoFromDataUrl(dataUrl) {
  try {
    const res = await fetch(dataUrl); // data: URL — ağ isteği DEĞİL, CSP'ye takılmaz
    const blob = await res.blob();
    return await setFormPhotoFromFile(new File([blob], 'whatsapp.jpg', { type: blob.type || 'image/jpeg' }));
  } catch (err) {
    banner('Fotoğraf okunamadı — ' + (err.message || err), 'error', 0);
    return false;
  }
}

// prefill (only used for a NEW patient, i.e. patientId is falsy): plain field
// values to pre-populate, e.g. from the "Metinden Hasta Ekle" paste-parse flow
// (see ui-home.js). The doctor still reviews/edits every field before Kaydet —
// this only saves typing, it never saves on its own.
export async function openForm(patientId, prefill) {
  state.editing = !!patientId;
  state.currentId = patientId;
  // Yeni bir form: önceki formun otomatik kayıt sayacı ve "geri al" hedefi
  // devretmemeli, yoksa yanlış kaydı silme riski doğar.
  autosave.reset();
  autoCreatedId = null;
  setAutoStatus('');
  loadAutosaveSetting();
  const f = document.getElementById('patient-form');
  f.reset();
  document.getElementById('form-title').textContent = patientId ? 'Hastayı Düzenle' : 'Yeni Hasta';
  if (patientId) {
    try {
      const { patient } = await getPatient(state.exec, patientId);
      for (const k of ['name', 'mother_name', 'phone', 'diagnosis', 'referral', 'notes', 'start_date', 'residence']) f.elements[k].value = patient[k] || '';
      f.elements.birth_date.value = patient.birth_date || '';
      f.elements.next_appt.value = patient.next_appt ? patient.next_appt.replace(' ', 'T') : '';
      f.elements.planned_sessions.value = patient.planned_sessions ?? '';
      formPhoto = patient.photo || null;
    } catch (e) {
      banner('Hasta yüklenemedi — ' + (e.message || e), 'error', 0);
      return;
    }
  } else {
    formPhoto = null;
    f.elements.start_date.value = todayIso();
    if (prefill) {
      for (const k of ['name', 'mother_name', 'residence', 'birth_date', 'diagnosis', 'phone', 'notes']) {
        if (prefill[k]) f.elements[k].value = prefill[k];
      }
    }
  }
  renderPhotoPreview();
  showScreen('form');
}

// Formun o anki değerleri — hem elle kaydetme hem otomatik kayıt aynı yerden
// okur, böylece ikisi asla farklı şey kaydedemez.
function formValues() {
  const f = document.getElementById('patient-form');
  const v = Object.fromEntries(new FormData(f).entries());
  if (v.next_appt) v.next_appt = v.next_appt.replace('T', ' ');
  v.photo = formPhoto;
  return v;
}

// Otomatik kayıtla OLUŞTURULAN kaydın id'si (güncellenen değil). "Geri Al"
// yalnızca bunu siler — doktorun elle açtığı bir kaydı asla silmez.
let autoCreatedId = null;

function setAutoStatus(html) {
  const el = document.getElementById('form-autosave');
  if (!el) return;
  el.innerHTML = html;
  el.classList.toggle('hidden', !html);
}

async function saveFormValues(v) {
  if (state.editing && state.currentId) {
    await updatePatient(state.exec, state.currentId, v);
    return { id: state.currentId, created: false };
  }
  const id = await addPatient(state.exec, v);
  return { id, created: true };
}

const autosave = createAutosave({
  getValues: formValues,
  getDelayMs: () => autosaveDelay,
  isActive: () => state.screen === 'form',
  save: saveFormValues,
  onSaved: ({ id, created }) => {
    // Kritik: ilk otomatik kayıttan sonra form artık MEVCUT kaydı düzenliyor.
    // Bu satır olmasaydı her otomatik kayıt yeni bir hasta yaratırdı.
    state.currentId = id;
    state.editing = true;
    if (created) autoCreatedId = id;
    document.getElementById('form-title').textContent = 'Hastayı Düzenle';
    const t = new Date().toTimeString().slice(0, 5);
    setAutoStatus(`Otomatik kaydedildi ${esc(t)} ✓ ${autoCreatedId === id ? '<button type="button" id="autosave-undo" class="linkbtn">Geri Al</button>' : ''}`);
    document.getElementById('autosave-undo')?.addEventListener('click', undoAutosave);
  },
  onError: (e) => setAutoStatus(`Otomatik kayıt yapılamadı — ${esc(e?.message || String(e))}`),
});

let autosaveDelay = 0;

async function loadAutosaveSetting() {
  try { autosaveDelay = autosaveDelayMs((await getMeta(state.exec, 'autosave_delay')) || '8'); }
  catch { autosaveDelay = autosaveDelayMs('8'); }
}

async function undoAutosave() {
  const id = autoCreatedId;
  if (!id) return;
  autosave.cancel();
  const r = await guarded(() => deletePatient(state.exec, id));
  if (!r.ok) return;
  autoCreatedId = null;
  state.editing = false;
  state.currentId = null;
  document.getElementById('form-title').textContent = 'Yeni Hasta';
  setAutoStatus('');
  banner('Otomatik kayıt geri alındı — kayıt silindi', 'ok');
  await refreshHome();
}

/**
 * Yapıştırılan metin bir HASTA BİLGİSİ mi, yoksa sıradan bir kopyala-yapıştır mı?
 * Saf — testi var.
 *
 * Yanlış pozitif pahalıdır: doktor Tanı kutusuna tek bir kelime yapıştırdığında
 * formun yeniden doldurulması can sıkıcı olurdu. Bu yüzden ölçüt dar:
 * ya birden fazla satır, ya da tanınan bir etiket ("Adı Soyadı:", "Anne adı:").
 */
export function looksLikePatientText(text) {
  const t = String(text ?? '').trim();
  if (t.length < 8) return false;
  if (/\n/.test(t)) return true;
  return /\b(ad[ıi]\s*soyad[ıi]|anne\s*ad[ıi]|telefon|do[ğg]um\s*tarihi|[şs]ikayet)\s*:/i.test(t);
}

// Ayrıştırılan alanları forma yazar: SADECE boş olanları. Notlar'a ham metin
// eklenir (üzerine yazılmaz).
function applyParsedText(text) {
  const f = document.getElementById('patient-form');
  const p = parsePatientText(text, todayIso());
  const filled = [];
  for (const k of ['name', 'mother_name', 'residence', 'birth_date', 'phone', 'diagnosis']) {
    const el = f.elements[k];
    if (el && p[k] && !String(el.value || '').trim()) { el.value = p[k]; filled.push(k); }
  }
  const notes = f.elements.notes;
  if (notes && !String(notes.value || '').includes(text.trim())) {
    notes.value = notes.value ? `${notes.value}\n${text.trim()}` : text.trim();
  }
  banner(filled.length ? `Yapıştırılan bilgiden ${filled.length} alan dolduruldu ✓ (dolu alanlara dokunulmadı)`
                       : 'Yapıştırılan metin Notlar\'a eklendi.', 'ok', 4000);
  autosave.bump();
}

export function initForm() {
  const f = document.getElementById('patient-form');
  // Başlıktaki yeşil ✅ = KAYDET kısayolu (evin yanında). Formu normal yoldan
  // gönderir: `requestSubmit` zorunlu alan doğrulamasını çalıştırır — plain
  // `submit()` onu ATLAR ve adsız hasta kaydedilebilirdi. Yeni kayıtta da,
  // kalemle açılan mevcut kaydın düzenlemesinde de aynı submit çalışır.
  document.getElementById('btn-form-save')?.addEventListener('click', () => {
    if (typeof f.requestSubmit === 'function') f.requestSubmit();
    else f.querySelector('button[type="submit"]')?.click();
  });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    // Elle kaydetme otomatik sayacı geçersiz kılar; ikisi aynı anda yazmasın.
    autosave.cancel();
    // photo-input carries no name attr, so it is absent from FormData —
    // formValues() tuttuğumuz data-url'i ekler (kaldırıldıysa null).
    const v = formValues();
    const r = await guarded(() => saveFormValues(v));
    if (r.ok) {
      state.currentId = r.value.id;
      autoCreatedId = null; // artık doktorun bilerek kaydettiği bir kayıt
      setAutoStatus('');
      banner('Kaydedildi ✓', 'ok');
      await refreshHome();
      await openCard(state.currentId);
    }
  });

  // Her değişiklikte sayacı baştan başlat. Yazarken ASLA kesilmez; kayıt
  // yalnızca doktor durduktan sonra olur.
  for (const ev of ['input', 'change']) f.addEventListener(ev, () => autosave.bump());
  document.getElementById('btn-photo-add').addEventListener('click', () => document.getElementById('photo-input').click());
  document.getElementById('photo-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    await setFormPhotoFromFile(file);
  });
  document.getElementById('btn-photo-remove').addEventListener('click', () => { formPhoto = null; renderPhotoPreview(); });

  // ⌘V / Ctrl+V — WhatsApp'tan gelen içeriğin ASIL yolu.
  //
  // WhatsApp'ta fotoğrafa sağ tık → "Resmi Kopyala" → formda ⌘V. Sürüklemeden
  // farklı olarak bu, WhatsApp Web'de de masaüstü uygulamasında da GERÇEK bir
  // görsel taşır (panoda bitmap olarak durur), yani indirme/bağlantı sorunu hiç
  // doğmaz. Eskiden form ekranında yapıştırma hiç dinlenmiyordu.
  //
  // Metin yapıştırıldığında: BOŞ alanlar doldurulur, dolu alanlara DOKUNULMAZ
  // (doktorun yazdığının üzerine yazmak kabul edilemez) ve ham metin Notlar'a
  // eklenir — hiçbir şey sessizce kaybolmaz.
  document.getElementById('screen-form').addEventListener('paste', async e => {
    if (state.screen !== 'form') return;
    const dt = e.clipboardData;
    if (!dt) return;
    const payload = extractDroppedImage(dt);
    if (payload.kind === 'file') {
      e.preventDefault();
      if (await setFormPhotoFromFile(payload.file)) banner('Fotoğraf yapıştırıldı ✓', 'ok');
      autosave.bump();
      return;
    }
    if (payload.kind === 'dataurl') {
      e.preventDefault();
      formPhoto = payload.dataUrl;
      renderPhotoPreview();
      banner('Fotoğraf yapıştırıldı ✓', 'ok');
      autosave.bump();
      return;
    }
    if (payload.kind === 'remote') { e.preventDefault(); banner(REMOTE_IMAGE_HELP, 'error', 0); return; }
    // Metin: yalnızca ÇOK SATIRLI ya da etiketli bir yapıştırma hasta bilgisi
    // sayılır. Tek kelimeyi bir kutuya yapıştırmak normal yazma işidir, ona
    // karışılmaz.
    const text = String(dt.getData('text/plain') || '');
    if (!looksLikePatientText(text)) { autosave.bump(); return; }
    e.preventDefault();
    applyParsedText(text);
  });

  // Tanı ve Notlar için 🎤 (Win + H) düğmeleri — masaüstünde görünür,
  // Android'de gizli (klavyenin kendi mikrofonu var). Statik markup olduğu
  // için bir kez bağlamak yeterli.
  attachVoice(f);

  document.querySelector('#screen-form .btn-back').addEventListener('click', async () => {
    // Bekleyen otomatik kayıt varsa BEKLETME — "kayıt ekranında beklemek
    // istemiyoruz" isteğinin diğer yarısı bu.
    await autosave.flush();
    await refreshHome();
    if (state.editing && state.currentId) { await openCard(state.currentId); }
    else showScreen('home');
  });
}
