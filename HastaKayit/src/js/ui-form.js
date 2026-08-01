import { addPatient, updatePatient, getPatient } from './repo.js';
import { state, showScreen, guarded, banner, todayIso } from './ui.js';
import { refreshHome } from './ui-home.js';
import { openCard } from './ui-card.js';
import { fileToResizedDataUrl } from './ui-photo.js';
import { attachVoice } from './ui-voice.js';

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

// prefill (only used for a NEW patient, i.e. patientId is falsy): plain field
// values to pre-populate, e.g. from the "Metinden Hasta Ekle" paste-parse flow
// (see ui-home.js). The doctor still reviews/edits every field before Kaydet —
// this only saves typing, it never saves on its own.
export async function openForm(patientId, prefill) {
  state.editing = !!patientId;
  state.currentId = patientId;
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

export function initForm() {
  const f = document.getElementById('patient-form');
  f.addEventListener('submit', async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());
    if (v.next_appt) v.next_appt = v.next_appt.replace('T', ' ');
    // photo-input carries no name attr, so it is absent from FormData — set the
    // held data-url explicitly (null when removed/none; unchanged if untouched).
    v.photo = formPhoto;
    const r = await guarded(async () => {
      if (state.editing) { await updatePatient(state.exec, state.currentId, v); return state.currentId; }
      return addPatient(state.exec, v);
    });
    if (r.ok) {
      state.currentId = r.value;
      banner('Kaydedildi ✓', 'ok');
      await refreshHome();
      await openCard(state.currentId);
    }
  });
  document.getElementById('btn-photo-add').addEventListener('click', () => document.getElementById('photo-input').click());
  document.getElementById('photo-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    await setFormPhotoFromFile(file);
  });
  document.getElementById('btn-photo-remove').addEventListener('click', () => { formPhoto = null; renderPhotoPreview(); });

  // Tanı ve Notlar için 🎤 (Win + H) düğmeleri — masaüstünde görünür,
  // Android'de gizli (klavyenin kendi mikrofonu var). Statik markup olduğu
  // için bir kez bağlamak yeterli.
  attachVoice(f);

  document.querySelector('#screen-form .btn-back').addEventListener('click', async () => {
    await refreshHome();
    if (state.editing && state.currentId) { await openCard(state.currentId); }
    else showScreen('home');
  });
}
