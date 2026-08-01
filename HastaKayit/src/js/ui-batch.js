// ui-batch.js — "📚 Toplu Form Aktarımı": drop/pick many filled intake forms,
// review what was read, save the confirmed ones in ONE transaction.
//
// This is the UI shell only. The engine (parseFormFiles / markDuplicates) lives
// in batch-forms.js, the write in repo.addPatientsBatch, and every count/select
// rule in batch-review.js — so this file is just bytes → sheet → save.
//
// Entry points: the Ayarlar button (#btn-batch-forms) and a multi-file drag-drop
// (ui-settings.handleImportFiles).

import { parseFormFiles, markDuplicates } from './batch-forms.js';
import { addPatientsBatch, listPatients } from './repo.js';
import { state, guarded, banner, openSheet, closeSheet, todayIso, esc } from './ui.js';
import { refreshHome } from './ui-home.js';
import { openSettings } from './ui-settings.js';
import {
  summarizeBatch, initialChecks, countChecked, pickChecked,
  allChecked, setAllChecks, detailLine,
} from './batch-review.js';

// Read every File to bytes up front. A file whose bytes cannot be read must not
// kill the batch: we hand parseFormFiles a `bytes` GETTER that re-throws the
// read error, so that one file is reported as its own "Dosya okunamadı: …" row
// (parseFormFiles reads `.bytes` inside its per-file try/catch) while the other
// 19 forms parse normally.
async function toEntries(files) {
  const entries = [];
  for (const f of files) {
    const name = String(f?.name ?? '');
    try {
      entries.push({ name, bytes: new Uint8Array(await f.arrayBuffer()) });
    } catch (err) {
      entries.push({ name, get bytes() { throw err; } });
    }
  }
  return entries;
}

/**
 * openBatchImport(files) — files: File[] (or anything with .name/.arrayBuffer()).
 * Never throws: every failure path ends in a Turkish banner.
 */
export async function openBatchImport(files) {
  const list = Array.from(files || []).filter(Boolean);
  if (!list.length) return;

  openSheet(`
    <h4>📚 Toplu Form Aktarımı</h4>
    <p class="muted">${list.length} dosya okunuyor…</p>
  `);

  const parsed = await parseFormFiles(await toEntries(list));

  // Existing patients power the duplicate flags. This is a READ, so it is not
  // wrapped in guarded() — guarded() fires the snapshot hook, and merely opening
  // a review sheet the doctor may cancel must not trigger a backup. The try/catch
  // gives the same "nothing throws across the DB boundary" guarantee.
  let existing = [];
  try {
    existing = await listPatients(state.exec);
  } catch (e) {
    closeSheet();
    banner(`Mevcut hastalar okunamadı — ${e.message || e}`, 'error', 0);
    return;
  }

  const marked = markDuplicates(parsed, existing);
  const sum = summarizeBatch(marked);
  if (sum.ok === 0) {
    closeSheet();
    banner('Hiçbir formdan veri okunamadı.', 'error', 0);
    return;
  }
  renderReview(marked, sum);
}

function badgeHtml(e) {
  if (!e.ok) {
    return `<span class="chip" style="background:#fdecea;color:var(--red)">❌ ${esc(e.error || 'Okunamadı')}</span>`;
  }
  if (e.duplicate) {
    return '<span class="chip" style="background:#fff4e5;color:var(--orange)">⚠️ Kopya</span>';
  }
  return '';
}

function rowHtml(e, i, checked) {
  const name = String(e.fields?.name || '').trim();
  return `
    <label style="display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-bottom:1px solid #f0f0f0">
      <input type="checkbox" class="bi-check" data-i="${i}" style="width:20px;height:20px;flex:none;margin-top:3px"
        ${checked ? 'checked' : ''}${e.ok ? '' : ' disabled'}>
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <b>${esc(name || '(isim okunamadı)')}</b>${badgeHtml(e)}
        </div>
        <div class="muted">${esc(detailLine(e.fields))}</div>
        <div class="muted" style="font-size:11px">${esc(e.file || '')}</div>
      </div>
    </label>`;
}

function renderReview(marked, sum) {
  let checks = initialChecks(marked);

  openSheet(`
    <h4>📚 Toplu Form Aktarımı</h4>
    <p class="muted">${sum.ok} form okundu · ${sum.dup} olası kopya · ${sum.err} okunamadı</p>
    <button id="bi-toggle-all" type="button" class="ghost" style="padding:6px 0">Tümünü Seç / Hiçbirini Seçme</button>
    <div id="bi-rows" style="max-height:46vh;overflow-y:auto;border:1px solid var(--line);border-radius:10px;background:#fff">
      ${marked.map((e, i) => rowHtml(e, i, checks[i])).join('')}
    </div>
    <div class="form" style="padding:0;margin-top:10px">
      <button id="bi-save" class="primary">Seçilenleri Kaydet (${countChecked(marked, checks)})</button>
      <button id="bi-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);

  const saveBtn = document.getElementById('bi-save');
  const refreshSaveLabel = () => {
    const n = countChecked(marked, checks);
    saveBtn.textContent = `Seçilenleri Kaydet (${n})`;
  };
  const repaintChecks = () => {
    for (const cb of document.querySelectorAll('#bi-rows .bi-check')) cb.checked = !!checks[Number(cb.dataset.i)];
    refreshSaveLabel();
  };

  document.getElementById('bi-rows').addEventListener('change', ev => {
    const cb = ev.target;
    if (!cb.classList?.contains('bi-check')) return;
    checks[Number(cb.dataset.i)] = cb.checked;
    refreshSaveLabel();
  });

  document.getElementById('bi-toggle-all').addEventListener('click', () => {
    checks = setAllChecks(marked, !allChecked(marked, checks));
    repaintChecks();
  });

  document.getElementById('bi-cancel').addEventListener('click', closeSheet);

  saveBtn.addEventListener('click', async ev => {
    const btn = ev.currentTarget;
    const picked = pickChecked(marked, checks).map(f => ({ ...f, start_date: todayIso() }));
    if (!picked.length) { banner('Kaydedilecek form seçilmedi.', 'error', 0); return; }
    btn.disabled = true;
    const res = await guarded(() => addPatientsBatch(state.exec, picked));
    if (!res.ok) { btn.disabled = false; return; } // sheet stays open, error banner shown
    closeSheet();
    const { added, skipped } = res.value;
    banner(`${added} hasta eklendi${skipped ? ', ' + skipped + ' atlandı' : ''}`, 'ok', 4000);
    await refreshHome();
    // Only re-render Ayarlar when that is where the doctor actually is — a
    // drag-drop from the home screen must not yank them into Settings.
    if (state.screen === 'settings') await openSettings();
  });
}
