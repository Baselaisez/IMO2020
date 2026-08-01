import { listPatients, listPatientsPage, countPatients, bulkDeletePatients } from './repo.js';
import { state, showScreen, guarded, banner, openSheet, closeSheet, todayIso, esc, toggleSelected, selectAllInto } from './ui.js';
import { fmtTL, todaysAppointments } from './compute.js';
import { openCard } from './ui-card.js';
import { openForm } from './ui-form.js';
import { openSettings } from './ui-settings.js';
import { parsePatientText } from './paste-parse.js';
import { openQuickAdd } from './ui-quickadd.js';

// ---------------------------------------------------------------------------
// Paginated list state (F110-scale: list must never render all ~77k rows at
// once — DB search + LIMIT/OFFSET paging instead). Module-local, not on the
// shared `state` object, since none of it is needed outside this screen.
// ---------------------------------------------------------------------------
const PAGE_SIZE = 100;
let pageOffset = 0;   // raw rows fetched so far via listPatientsPage (pre status-filter)
let pageTotal = 0;    // countPatients(search) — NOT status-scoped, see note below
let pageSearch = '';
let pageLoading = false;

// id -> row, for every row currently rendered in #patient-list (i.e. after the
// client-side status filter). Backs "Tümünü Seç" and the single-delete
// name-confirm (needs the patient's name).
const renderedRows = new Map();

let selectMode = false;
let selected = new Set();

export async function refreshHome() {
  await renderToday();
  await resetAndLoadFirstPage();
}

// Renders the "Bugün" strip. Deliberately still uses listPatients (full scan)
// rather than the paginated query: today's appointments can be on ANY page,
// and repo.js has no lightweight "active patients with an appt today" query
// to page against (repo.js is out of scope for this feature). This is a
// pre-existing cost (refreshHome always did a full listPatients scan before
// this change) — unchanged by pagination, and it only affects a DB read, not
// DOM node count, so it does not reproduce the freeze this feature fixes.
async function renderToday() {
  const all = await listPatients(state.exec);
  const el = document.getElementById('today-strip');
  const appts = todaysAppointments(all.filter(p => p.status === 'active'), todayIso());
  if (!appts.length) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  el.innerHTML = '<b>Bugün:</b> ' + appts
    .map(p => `${esc(p.name)} ${esc((p.next_appt || '').split(' ')[1] || '')}`)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

async function resetAndLoadFirstPage() {
  pageOffset = 0;
  pageSearch = state.search.trim();
  renderedRows.clear();
  document.getElementById('patient-list').innerHTML = '';
  pageTotal = await countPatients(state.exec, pageSearch);
  updateListTotalLabel();
  await loadNextPage();
}

async function loadNextPage() {
  if (pageLoading) return;
  pageLoading = true;
  try {
    const rows = await listPatientsPage(state.exec, { limit: PAGE_SIZE, offset: pageOffset, search: pageSearch });
    pageOffset += rows.length;
    // listPatientsPage/countPatients have no status parameter (repo.js is out
    // of scope for this feature), so a non-"all" filter is applied client-side
    // per page. SCALE LIMITATION: pageTotal/the "Daha fazla yükle" counter are
    // search-scoped only, not status-scoped — with a sparse status (e.g. a
    // handful of "blocked" patients among 77k), the user may need to tap
    // "Daha fazla yükle" many times before any matching row appears. "Tümü"
    // has no such limitation (no client filtering applied at all).
    const filtered = state.filter === 'all' ? rows : rows.filter(p => p.status === state.filter);
    appendRows(filtered);
  } finally {
    pageLoading = false;
    refreshListFooter();
  }
}

function appendRows(rows) {
  const el = document.getElementById('patient-list');
  const badge = { done: ' ✅', blocked: ' ⛔' };
  for (const p of rows) {
    renderedRows.set(p.id, p);
    const div = document.createElement('div');
    div.className = `prow ${p.status === 'done' ? 'done' : p.status === 'blocked' ? 'blocked' : ''}`.trim();
    div.dataset.id = String(p.id);
    div.innerHTML = `<div><span class="name-line">${esc(p.name)}${badge[p.status] || ''}</span>
      <div class="sub">${esc(p.diagnosis || '—')}${p.referral ? ' · ' + esc(p.referral) : ''}</div></div>
      <div class="money">${fmtTL(p.total)}</div>`;
    attachRowHandlers(div, p);
    if (selectMode) updateRowSelectUI(div);
    el.appendChild(div);
  }
}

function removeLoadMoreButton() {
  document.getElementById('load-more-btn')?.remove();
}

function removeEmptyMsg() {
  document.querySelectorAll('#patient-list .empty-msg').forEach(e => e.remove());
}

function addLoadMoreButton() {
  removeLoadMoreButton();
  const btn = document.createElement('button');
  btn.id = 'load-more-btn';
  btn.className = 'ghost';
  btn.type = 'button';
  btn.style.cssText = 'display:block;width:100%;text-align:center;margin:4px 0 16px;';
  btn.textContent = `Daha fazla yükle (${renderedRows.size}/${pageTotal})`;
  btn.addEventListener('click', () => loadNextPage());
  document.getElementById('patient-list').appendChild(btn);
}

function refreshListFooter() {
  removeLoadMoreButton();
  removeEmptyMsg();
  const el = document.getElementById('patient-list');
  const hasMore = pageOffset < pageTotal;
  if (renderedRows.size === 0) {
    const msg = document.createElement('p');
    msg.className = 'empty-msg muted';
    msg.style.cssText = 'padding:20px;text-align:center';
    msg.textContent = hasMore
      ? 'Bu sayfada eşleşen kayıt yok — daha fazla yüklemeyi deneyin.'
      : 'Kayıt yok. Sağ alttaki + ile hasta ekleyin.';
    el.appendChild(msg);
  }
  if (hasMore) addLoadMoreButton();
}

function updateListTotalLabel() {
  const el = document.getElementById('list-total');
  if (el) el.textContent = `Toplam ${pageTotal} hasta`;
}

// ---------------------------------------------------------------------------
// Row click / long-press (open card, or toggle selection in select mode)
// ---------------------------------------------------------------------------

const LONG_PRESS_MS = 550;

function attachRowHandlers(div, p) {
  let pressTimer = null;
  let suppressClick = false;
  const start = () => {
    suppressClick = false;
    pressTimer = setTimeout(() => {
      pressTimer = null;
      suppressClick = true;
      if (!selectMode) setSelectMode(true);
      if (!selected.has(p.id)) {
        selected = toggleSelected(selected, p.id);
        updateRowSelectUI(div);
        updateSelHeader();
      }
    }, LONG_PRESS_MS);
  };
  const cancel = () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } };
  div.addEventListener('pointerdown', start);
  div.addEventListener('pointerup', cancel);
  div.addEventListener('pointerleave', cancel);
  div.addEventListener('pointercancel', cancel);
  div.addEventListener('click', () => {
    if (suppressClick) { suppressClick = false; return; }
    if (selectMode) toggleSelect(p.id);
    else openCard(p.id);
  });
}

function toggleSelect(id) {
  selected = toggleSelected(selected, id);
  const row = document.querySelector(`#patient-list .prow[data-id="${id}"]`);
  if (row) updateRowSelectUI(row);
  updateSelHeader();
}

function updateRowSelectUI(row) {
  const id = Number(row.dataset.id);
  let cb = row.querySelector('.prow-check');
  if (selectMode) {
    if (!cb) {
      cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'prow-check';
      cb.style.marginRight = '10px';
      row.prepend(cb);
    }
    cb.checked = selected.has(id);
  } else if (cb) {
    cb.remove();
  }
}

// ---------------------------------------------------------------------------
// Selection mode (Seç / Tümünü Seç / Sil / Vazgeç)
// ---------------------------------------------------------------------------

function setSelectMode(on) {
  selectMode = on;
  if (!on) selected = new Set();
  document.getElementById('btn-select').style.display = on ? 'none' : '';
  document.getElementById('sel-toolbar').style.display = on ? 'flex' : 'none';
  for (const row of document.querySelectorAll('#patient-list .prow')) updateRowSelectUI(row);
  updateSelHeader();
}

function updateSelHeader() {
  const el = document.getElementById('sel-count');
  if (el) el.textContent = `${selected.size} seçildi`;
}

function selectAllLoaded() {
  selected = selectAllInto(selected, renderedRows.keys());
  for (const row of document.querySelectorAll('#patient-list .prow')) updateRowSelectUI(row);
  updateSelHeader();
}

async function exitSelectModeAndReload() {
  setSelectMode(false);
  await resetAndLoadFirstPage();
}

function onDeleteSelected() {
  const ids = [...selected];
  if (!ids.length) return;
  if (ids.length === 1) {
    const row = renderedRows.get(ids[0]);
    if (row) singleDeleteConfirm(row);
  } else {
    multiDeleteConfirm(ids);
  }
}

// Mirrors ui-card.js's confirmDeletePatient (type-the-name gate) — that
// function is local/unexported there and ui-card.js is out of scope for this
// feature, so the same copy/markup is reproduced here rather than imported.
function singleDeleteConfirm(row) {
  openSheet(`
    <h4>Hastayı Sil</h4>
    <p class="muted"><b>${esc(row.name)}</b> isimli hastayı silmek istediğinizden emin misiniz?<br>Bu işlem geri alınamaz — hastanın TÜM ödeme ve teslimat kayıtları da silinir.</p>
    <div class="form" style="padding:0">
      <button id="sd-go" class="primary" style="background:var(--red)">Sil</button>
      <button id="sd-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('sd-cancel').addEventListener('click', closeSheet);
  document.getElementById('sd-go').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await guarded(() => bulkDeletePatients(state.exec, [row.id]));
    if (!r.ok) { btn.disabled = false; return; }
    closeSheet();
    banner(`${r.value.deleted} hasta silindi`, 'ok');
    await exitSelectModeAndReload();
  });
}

function multiDeleteConfirm(ids) {
  openSheet(`
    <h4>Toplu Silme</h4>
    <p class="muted">Seçtiğiniz ${ids.length} kayıtlı hastayı silmek istediğinize emin misiniz?</p>
    <div class="form" style="padding:0">
      <button id="md-go" class="primary" style="background:var(--red)">Sil</button>
      <button id="md-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('md-cancel').addEventListener('click', closeSheet);
  document.getElementById('md-go').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await guarded(() => bulkDeletePatients(state.exec, ids));
    if (!r.ok) { btn.disabled = false; return; }
    closeSheet();
    banner(`${r.value.deleted} hasta silindi`, 'ok');
    await exitSelectModeAndReload();
  });
}

// ---------------------------------------------------------------------------
// Paste-to-add ("Metinden Hasta Ekle")
// ---------------------------------------------------------------------------

function openPasteModal() {
  openSheet(`
    <h4>Metinden Hasta Ekle</h4>
    <div class="form" style="padding:0">
      <textarea id="paste-text" rows="6" placeholder="Hasta bilgisini buraya yapıştırın..."></textarea>
      <button id="paste-go" type="button" class="primary">Ayrıştır</button>
      <button id="paste-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('paste-cancel').addEventListener('click', closeSheet);
  document.getElementById('paste-go').addEventListener('click', () => {
    const text = document.getElementById('paste-text').value;
    const p = parsePatientText(text, todayIso());
    closeSheet();
    // CRITICAL zero-loss: the full original pasted text always goes into
    // Notlar too, regardless of what the heuristic parser managed to pull
    // out — the doctor reviews/edits everything on the normal form before
    // anything is saved; nothing pasted is ever silently dropped.
    openForm(null, { name: p.name, mother_name: p.mother_name, residence: p.residence, birth_date: p.birth_date, diagnosis: p.diagnosis, notes: text });
  });
}

// ---------------------------------------------------------------------------
// Init: wires the static screen-home DOM (from www/index.html) and injects
// the small set of new controls this feature needs (Seç button, selection
// toolbar, paste FAB, total label) purely via JS — index.html/app.css are out
// of scope for this feature, so these reuse existing classes/CSS vars
// (.iconbtn, .ghost, .fab-like sizing, var(--green)/var(--red)/var(--blue))
// rather than adding new stylesheet rules.
// ---------------------------------------------------------------------------

function injectHomeControls() {
  const chipsRow = document.querySelector('#screen-home .chips-row');
  chipsRow.insertAdjacentHTML('afterend', `
    <div id="list-total" class="muted"></div>
    <div id="sel-toolbar" style="display:none;align-items:center;gap:8px;margin:0 8px 8px;padding:8px 10px;background:#eaf1fb;border-radius:10px;">
      <span id="sel-count" class="muted" style="flex:1">0 seçildi</span>
      <button id="sel-all" type="button" class="ghost">Tümünü Seç</button>
      <button id="sel-delete" type="button" style="background:var(--red);color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:600;">Sil</button>
      <button id="sel-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);

  // "Seç" button: wrap the existing ⚙️ button so the appbar keeps its
  // original 2-slot (title | controls) space-between layout.
  const settingsBtn = document.getElementById('btn-settings');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:6px;align-items:center';
  settingsBtn.parentNode.insertBefore(wrap, settingsBtn);
  // "⚡ Hızlı Ekle": chosen as an appbar icon button next to "Seç" rather than a
  // third FAB — the bottom-right corner already stacks two (+ and 📋) and a third
  // would reach halfway up the screen on a phone. Sits in the same wrap, so the
  // appbar keeps its 2-slot layout.
  const quickBtn = document.createElement('button');
  quickBtn.id = 'btn-quick-add';
  quickBtn.className = 'iconbtn';
  quickBtn.type = 'button';
  quickBtn.textContent = '⚡';
  quickBtn.title = 'Hızlı Ekle';
  quickBtn.setAttribute('aria-label', 'Hızlı Ekle');
  wrap.appendChild(quickBtn);
  const selectBtn = document.createElement('button');
  selectBtn.id = 'btn-select';
  selectBtn.className = 'iconbtn';
  selectBtn.type = 'button';
  selectBtn.textContent = '☑️';
  selectBtn.title = 'Seç';
  wrap.appendChild(selectBtn);
  wrap.appendChild(settingsBtn);

  // Green clipboard-paste FAB, stacked just above the blue "+" FAB.
  const pasteBtn = document.createElement('button');
  pasteBtn.id = 'btn-paste';
  pasteBtn.type = 'button';
  pasteBtn.title = 'Metinden Hasta Ekle';
  // Konum/görünüm CSS'te (.fab-mini): Mac'te içerik sütunu ortalandığı için
  // düğmenin sağ kenarı da o sütuna hizalanmalı; satır-içi stil bunu CSS ile
  // düzeltilemez hâle getiriyordu.
  pasteBtn.className = 'fab-mini';
  pasteBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="7" y="4" width="10" height="4" rx="1" fill="#fff"/>
    <rect x="6" y="6" width="12" height="16" rx="2" stroke="#fff" stroke-width="1.6"/>
    <path d="M9 12h6M9 15.5h6M9 19h3.5" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>
  </svg>`;
  document.getElementById('screen-home').appendChild(pasteBtn);
}

export function initHome() {
  injectHomeControls();

  let searchDebounce = null;
  document.getElementById('search').addEventListener('input', e => {
    state.search = e.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => { resetAndLoadFirstPage(); }, 250);
  });

  for (const b of document.querySelectorAll('.chip-filter')) {
    b.addEventListener('click', () => {
      document.querySelector('.chip-filter.active')?.classList.remove('active');
      b.classList.add('active');
      state.filter = b.dataset.f;
      resetAndLoadFirstPage();
    });
  }

  document.getElementById('btn-new').addEventListener('click', () => openForm(null));
  document.getElementById('btn-settings').addEventListener('click', () => openSettings());
  document.getElementById('btn-paste').addEventListener('click', () => openPasteModal());
  document.getElementById('btn-quick-add').addEventListener('click', () => openQuickAdd());

  document.getElementById('btn-select').addEventListener('click', () => setSelectMode(true));
  document.getElementById('sel-cancel').addEventListener('click', () => setSelectMode(false));
  document.getElementById('sel-all').addEventListener('click', () => selectAllLoaded());
  document.getElementById('sel-delete').addEventListener('click', () => onDeleteSelected());
}
