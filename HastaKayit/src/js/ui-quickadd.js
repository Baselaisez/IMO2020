// ui-quickadd.js — "⚡ Hızlı Ekle": a walk-in goes from door to database in
// about two seconds, without ever opening the full patient form.
//
// Keyboard-first by design: Ad Soyad is focused on open, Enter anywhere saves
// and immediately re-arms the sheet for the next person, and a running counter
// tells the doctor how many they have banged through this session. The full form
// (ui-form.js) is still the place for anything richer — this sheet deliberately
// asks for three things only.
//
// Entry point: the ⚡ button in the home appbar (ui-home.injectHomeControls).

import { addPatient, addPayment, listPatients } from './repo.js';
import { state, guarded, banner, openSheet, closeSheet, todayIso } from './ui.js';
import { refreshHome } from './ui-home.js';
import { buildNameIndex, isDuplicateName, nameKey, parseAmountInput } from './quick-add.js';

export function openQuickAdd() {
  let added = 0;                 // saved during THIS sheet session (header counter)
  let nameIndex = new Set();     // normalized existing names, cached once on open
  let ackKey = '';               // name the doctor already confirmed past the dup warning

  openSheet(`
    <h4>⚡ Hızlı Ekle</h4>
    <p class="muted" id="qa-count">Bu oturumda eklenen: 0</p>
    <p class="muted" id="qa-note"></p>
    <div class="form" style="padding:0">
      <label>Ad Soyad *<input id="qa-name" autocomplete="off"></label>
      <!-- type="text" (NOT number) on purpose: the Turkish keyboard's decimal key is
           a COMMA, and a number input reports value="" for "1500,50" — the amount is
           optional here, so that would silently drop the payment. Keeping it text lets
           the raw string reach parseAmountInput(), which normalises "," to ".". -->
      <label>Tutar (₺)<input id="qa-amount" type="text" inputmode="decimal" autocomplete="off"></label>
      <label>Telefon<input id="qa-phone" inputmode="tel" autocomplete="off"></label>
      <div id="qa-dup"></div>
      <button id="qa-save-next" type="button" class="primary">Kaydet ve Yenisi</button>
      <button id="qa-save-close" type="button">Kaydet ve Kapat</button>
      <button id="qa-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);

  const nameEl = document.getElementById('qa-name');
  const amountEl = document.getElementById('qa-amount');
  const phoneEl = document.getElementById('qa-phone');
  const dupEl = document.getElementById('qa-dup');
  const countEl = document.getElementById('qa-count');
  nameEl.focus();

  // Cached ONCE, off the critical path: the sheet is usable the instant it opens
  // and the name list lands shortly after. Never re-queried per keystroke.
  // MERGED into the live set rather than replacing it — this read can resolve
  // late (the DB is busy right after unlock), and a plain reassignment would
  // silently wipe the names added by saves that happened in the meantime.
  listPatients(state.exec)
    .then(rows => { for (const k of buildNameIndex(rows)) nameIndex.add(k); })
    .catch(() => {
      // Degrade loudly but harmlessly: entry still works, the soft warning does not.
      const note = document.getElementById('qa-note');
      if (note) note.textContent = 'Kopya kontrolü yapılamadı — kayıt yine de eklenebilir.';
    });

  function clearDup() { dupEl.innerHTML = ''; }

  // One extra tap, never a hard block: a clinic really can have two people with
  // the same name.
  function showDupConfirm(closeAfter) {
    dupEl.innerHTML = `
      <div style="display:flex;gap:8px;align-items:center;background:#fff4e5;border-radius:8px;padding:8px 10px">
        <span style="flex:1;color:var(--orange);font-size:13px">Bu isimde bir hasta zaten var. Yine de ekle?</span>
        <button type="button" id="qa-dup-ok" class="ghost">Ekle</button>
      </div>`;
    document.getElementById('qa-dup-ok').addEventListener('click', () => {
      ackKey = nameKey(nameEl.value);
      // NOT cleared here: doSave clears the warning only once the fields
      // validate, so a rejected amount leaves the "Ekle" button on screen
      // instead of making the doctor re-trigger the warning to get it back.
      doSave(closeAfter);
    });
  }

  // Single source of truth for "what is in the sheet right now, and is it
  // saveable?". Both the normal save and the duplicate-confirm "Ekle" path go
  // through it, so "Ekle" waives the duplicate warning ONLY — an invalid amount
  // is still rejected loudly instead of being silently dropped from the payload.
  function readForm() {
    const name = nameEl.value.trim();
    if (!name) return { ok: false, error: 'Ad Soyad zorunlu.', focus: nameEl };
    const amt = parseAmountInput(amountEl.value);
    if (!amt.ok) return { ok: false, error: amt.error, focus: amountEl };
    return { ok: true, name, phone: phoneEl.value.trim(), amount: amt.amount };
  }

  function requestSave(closeAfter) {
    const v = readForm();
    if (!v.ok) { banner(v.error, 'error', 0); v.focus.focus(); return; }
    if (isDuplicateName(v.name, nameIndex) && ackKey !== nameKey(v.name)) { showDupConfirm(closeAfter); return; }
    doSave(closeAfter);
  }

  async function doSave(closeAfter) {
    // Re-read rather than trusting values captured before the duplicate warning:
    // the doctor may have corrected a field while the warning was on screen.
    const v = readForm();
    if (!v.ok) { banner(v.error, 'error', 0); v.focus.focus(); return; }
    clearDup();
    const { name, phone, amount } = v;
    const btns = [document.getElementById('qa-save-next'), document.getElementById('qa-save-close')];
    for (const b of btns) if (b) b.disabled = true;

    // The patient is the record that matters, so it is written first and on its
    // own. If it fails, nothing was saved: guarded() shows the standard Turkish
    // error and the sheet stays open with everything typed still there.
    const r = await guarded(() => addPatient(state.exec, { name, phone, start_date: todayIso(), status: 'active' }));
    if (!r.ok) { for (const b of btns) if (b) b.disabled = false; return; }

    // addPatient and addPayment are SEPARATE transactions (repo has no combined
    // call), so a payment failure here leaves a patient that really does exist.
    // Saying "kayıt başarısız" would be a lie and would tempt a re-save into a
    // duplicate patient — so it is reported as exactly what it is, and the sheet
    // still moves on to the next person.
    if (amount != null) {
      const p = await guarded(() => addPayment(state.exec, {
        patient_id: r.value, pay_date: todayIso(), amount, status: 'paid', description: 'Seans',
      }));
      if (!p.ok) banner('Hasta kaydedildi ama ödeme eklenemedi — ödemeyi hasta kartından ekleyin.', 'error', 0);
    }
    for (const b of btns) if (b) b.disabled = false;

    added++;
    nameIndex.add(nameKey(name)); // a repeat within this same session warns too
    ackKey = '';

    if (closeAfter) {
      closeSheet();
      banner(`${added} hasta eklendi ✓`, 'ok');
      await refreshHome();
      return;
    }
    // Re-arm for the next person in the queue.
    nameEl.value = '';
    amountEl.value = '';
    phoneEl.value = '';
    countEl.textContent = `Bu oturumda eklenen: ${added}`;
    banner('Kaydedildi ✓', 'ok');
    nameEl.focus();
    // NOTE: the home list is deliberately NOT refreshed between rapid saves
    // (refreshHome re-reads and re-renders the whole list) — it is refreshed once
    // when the sheet closes, which is the first moment the list is visible again.
  }

  for (const el of [nameEl, amountEl, phoneEl]) {
    el.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      requestSave(false);
    });
    // Typing a different name invalidates a previous "yine de ekle" confirmation.
    if (el === nameEl) el.addEventListener('input', clearDup);
  }

  document.getElementById('qa-save-next').addEventListener('click', () => requestSave(false));
  document.getElementById('qa-save-close').addEventListener('click', () => requestSave(true));
  document.getElementById('qa-cancel').addEventListener('click', async () => {
    closeSheet();
    if (added) await refreshHome(); // list is stale only if something was saved
  });
}
