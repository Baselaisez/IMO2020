export const state = {
  exec: null,          // DB executor, set by app.js
  screen: 'lock',
  patients: [],        // list rows incl. total
  filter: 'active',
  search: '',
  currentId: null,     // open patient id
  editing: false,
  onMutate: null,      // set by snapshot.js → debounced snapshot hook
  flushForm: null,     // set by ui-form.js → arka plana geçerken bekleyen otomatik kaydı yazar
};

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function showScreen(name) {
  state.screen = name;
  for (const s of document.querySelectorAll('.screen')) s.classList.add('hidden');
  document.getElementById(`screen-${name}`).classList.remove('hidden');
}

// 🏠 "Ana menü": form/kart/ayarlar üst çubuklarında ←'nin hemen yanında durur.
// Üç .btn-back üç AYRI modülde bağlanıyor (ui-form/ui-card/ui-settings) ve
// form'daki geri okunun davranışı ekrana göre değişiyor (düzenlemedeyse karta
// döner). 🏠 ise her ekranda AYNI şeyi yapmalı: listeyi tazele, sonra 'home'.
// Bu yüzden tek bir delege edilmiş dinleyici — üç yerde tekrar edilmiş kod da
// olmuyor, ui.js'in o modüllere (döngüsel) import bağımlılığı da.
// `goHome` app.js'ten enjekte edilir (refreshHome + showScreen('home')).
export function initHomeButtons(goHome) {
  document.addEventListener('click', (e) => {
    if (!e.target?.closest?.('.btn-home')) return;
    // Bir hata banner'ı zaten guarded/refreshHome içinde gösteriliyor; buradaki
    // catch sadece dinleyicide yakalanmamış reddi susturur.
    Promise.resolve(goHome()).catch(err => console.error(err));
  });
}

let bannerTimer = null;
export function banner(msg, kind = 'error', ms = kind === 'error' ? 0 : 2500) {
  const el = document.getElementById('banner');
  el.textContent = msg;
  el.className = `banner ${kind}`;
  clearTimeout(bannerTimer);
  if (ms) bannerTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

export async function guarded(fn) {
  // every mutation goes through here: run, snapshot hook, or persistent error banner
  try {
    const r = await fn();
    if (state.onMutate) state.onMutate();
    return { ok: true, value: r };
  } catch (e) {
    console.error(e);
    banner(`KAYIT BAŞARISIZ — ${e.message || e}`, 'error', 0);
    return { ok: false };
  }
}

export function openSheet(html) {
  document.getElementById('sheet').innerHTML = html;
  document.getElementById('sheet-overlay').classList.remove('hidden');
}
export function closeSheet() {
  document.getElementById('sheet-overlay').classList.add('hidden');
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Pure, DOM-free selection-set helpers for multi-select list UIs (ui-home.js's
// "Seç" mode). Never mutate the input set — callers reassign their local
// variable to the returned set, so a stale closure never sees a half-updated
// selection.
export function toggleSelected(set, id) {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

export function selectAllInto(set, ids) {
  const next = new Set(set);
  for (const id of ids) next.add(id);
  return next;
}
