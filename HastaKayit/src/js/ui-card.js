import { getPatient, addPayment, updatePayment, deletePayment, completeTreatment, deletePatient, updatePatient, getMeta, setMeta, setStatus, addDelivery, updateDelivery, deleteDelivery, setApptCalId, setDeliveryCalId, noteRecentPatient } from './repo.js';
import { state, showScreen, guarded, banner, openSheet, closeSheet, todayIso, esc } from './ui.js';
import { fmtTL, fmtDate, fmtDateTime, durationMonths, sessionLabel, ageFrom } from './compute.js';
import { refreshHome } from './ui-home.js';
import { openForm } from './ui-form.js';
import { requestCalendarPermission, upsertEvent, deleteEvent } from './calendar.js';
import { parseAmountInput } from './quick-add.js';
import { fileToResizedDataUrl, fileToDataUrl, validateReceiptFile } from './ui-photo.js';
import { shareFile } from './files.js';
import { attachVoice } from './ui-voice.js';
import { afterSaveDestination } from './after-save.js';
import { iconHtml } from './icons.js';

// Best-effort device-calendar sync. Never throws — a calendar failure must
// never block a DB write or the UI refresh that follows it.
async function syncCalendar(kind, patient, delivery) {
  try {
    await requestCalendarPermission();
    if (kind === 'appt') {
      if (!patient.next_appt) {
        if (patient.appt_cal_id) { await deleteEvent(patient.appt_cal_id); await setApptCalId(state.exec, patient.id, null); }
        return;
      }
      const start = Date.parse(String(patient.next_appt).replace(' ', 'T'));
      const eid = await upsertEvent({ id: patient.appt_cal_id, title: `Randevu: ${patient.name}`, startMs: start, endMs: start + 30 * 60000, notes: patient.diagnosis || '', remindMin: patient.appt_remind_min });
      if (eid && eid !== patient.appt_cal_id) await setApptCalId(state.exec, patient.id, eid);
    } else {
      const d = delivery;
      if (!d.planned_date) return;
      const start = Date.parse(d.planned_date + 'T' + (d.planned_time || '09:00') + ':00');
      const eid = await upsertEvent({ id: d.cal_id, title: `Paket Teslimi: ${patient.name}`, startMs: start, endMs: start + 30 * 60000, notes: d.tracking_no || '', remindMin: d.remind_min });
      if (eid && eid !== d.cal_id) await setDeliveryCalId(state.exec, d.id, eid);
    }
  } catch (e) { console.error('calendar', e); }
}

export async function openCard(id) {
  state.currentId = id;
  try {
    await renderCard();
  } catch (e) {
    banner(`Hasta kartı yüklenemedi — ${e.message || e}`, 'error', 0);
    return;
  }
  // "Son açılanlar" şeridini besler (5.8). Kart AÇILDIKTAN sonra yazılıyor:
  // açılamayan bir kayıt listeye girmemeli. Hata şeridi bozsa bile kartı
  // düşürmemeli, o yüzden yutuluyor.
  noteRecentPatient(state.exec, id).catch(e => console.error('son açılanlar', e));
  showScreen('card');
}

/**
 * Yeni hasta kaydedildikten SONRA çağrılır: hasta kartını açar ve hemen
 * ödeme panelini gösterir.
 *
 * NEDEN: muayenehane akışı "hasta gelir → kaydı girilir → ödemesi alınır →
 * sıradaki". Doktor ödeme eklemek için kartı bulup "+ Ödeme"ye basmak
 * zorunda kalmasın diye panel kendiliğinden açılıyor. Panel kapanınca
 * (kaydet ya da vazgeç) ana sayfaya dönülür.
 *
 * ASLA FIRLATMAZ: ödeme panelini açamamak, az önce BAŞARIYLA kaydedilmiş
 * hastayı kaybetmek anlamına gelmemeli.
 */
export async function openCardThenPayment(id) {
  try {
    await openCard(id);
    const { patient } = await getPatient(state.exec, id);
    await paymentSheet(patient, null, { afterNewPatient: true });
  } catch (e) {
    console.error('openCardThenPayment', e);
    banner(`Ödeme ekranı açılamadı — ${e.message || e}`, 'error', 0);
  }
}

function safeMonths(p) {
  try { return durationMonths(p.start_date, p.end_date, todayIso()); }
  catch { return null; } // legacy bad dates: show nothing rather than crash the card
}

async function renderCard() {
  const { patient: p, payments, total, deliveries, sessionCount, paidTotal, pendingTotal } = await getPatient(state.exec, state.currentId);
  document.getElementById('card-name').textContent = p.name;
  const months = safeMonths(p);
  const body = document.getElementById('card-body');
  body.innerHTML = `
    ${p.status === 'blocked' ? `<div class="warn-band">${iconHtml('ban', 16)}ASLA BAKILMAYACAK</div>` : ''}
    <div class="card-hdr">
      ${p.photo ? `<img class="card-photo" src="${esc(p.photo)}" alt="Fotoğraf" style="width:72px;height:72px;border-radius:12px;object-fit:cover;float:right;margin:0 0 8px 12px;border:1px solid var(--line)">` : ''}
      <div style="display:flex;justify-content:space-between">
        <b>${esc(p.diagnosis || 'Tanı girilmemiş')}</b>
        <span class="money">Toplam ${fmtTL(paidTotal)}</span>
      </div>
      ${pendingTotal > 0 ? `<div class="pending-line">Bekleyen: ${fmtTL(pendingTotal)}</div>` : ''}
      <div class="muted">${p.referral ? 'Sevk: ' + esc(p.referral) : 'Kendi başvurusu'}</div>
      <div class="chips">
        <span class="chip">Başlangıç: ${esc(fmtDate(p.start_date))}</span>
        <span class="chip">Seans: ${esc(sessionLabel(sessionCount, p.planned_sessions))}</span>
        ${p.mother_name ? `<span class="chip">Anne: ${esc(p.mother_name)}</span>` : ''}
        ${months !== null ? `<span class="chip">${p.end_date ? `Bitiş: ${esc(fmtDate(p.end_date))} (${months} ay)` : months + '. ay'}</span>` : ''}
        ${p.next_appt ? `<span class="chip">Sonraki: ${esc(fmtDateTime(p.next_appt))}</span>` : ''}
        ${p.phone ? `<a class="chip" href="tel:${esc(p.phone)}">${iconHtml('phone', 14)}${esc(p.phone)}</a>` : ''}
        ${p.residence ? `<span class="chip">${iconHtml('pin', 14)}${esc(p.residence)}</span>` : ''}
        ${ageFrom(p.birth_date, todayIso()) != null ? `<span class="chip">${ageFrom(p.birth_date, todayIso())} yaşında</span>` : ''}
      </div>
    </div>
    <div class="actions">
      <button id="btn-pay" class="primary">+ Ödeme</button>
      <button id="btn-appt"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3.5" y="5.5" width="17" height="15" rx="2"/><path d="M3.5 10h17"/><path d="M8 3.5v4M16 3.5v4"/></svg>Randevu</button>
      ${p.status === 'active' ? '<button id="btn-done"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>Tamamla</button>' : ''}
      ${p.status !== 'blocked' ? '<button id="btn-block"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M6 18L18 6"/></svg>Bakılmayacak</button>' : '<button id="btn-unblock"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 7L4.5 11.5 9 16"/><path d="M4.5 11.5H14a5.5 5.5 0 010 11h-3"/></svg>Aktif yap</button>'}
      <button id="btn-del"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 6.5h15"/><path d="M9.5 6.5V4h5v2.5"/><path d="M6.5 6.5L7.5 21h9l1-14.5"/></svg></button>
    </div>
    <div class="sec-title">Ödeme Geçmişi</div>
    <div class="ledger">
      <div class="lrow total"><span>Toplam (${payments.length} ödeme)</span><span class="money">${fmtTL(total)}</span></div>
      ${payments.map(o => `
        <div class="lrow">
          <span class="muted">${esc(fmtDate(o.pay_date))} · ${esc(o.description || '')} <span class="pay-badge ${o.status === 'pending' ? 'pending' : 'paid'}">${o.status === 'pending' ? iconHtml('clock', 13) + 'Yapılacak' : iconHtml('check', 13) + 'Yapıldı'}</span></span>
          <span>${o.receipt ? `<button class="ghost pay-receipt" data-id="${o.id}" title="Dekont" aria-label="Dekontu görüntüle"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg></button> ` : ''}<span class="money">${fmtTL(o.amount)}</span> <button class="ghost pay-edit" data-id="${o.id}"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/></svg></button></span>
        </div>`).join('')}
    </div>
    <div class="sec-title">Paket Teslimatları</div>
    <div class="ledger">
      <div class="lrow total"><span>Teslimatlar (${deliveries.length})</span><button id="btn-del-add" class="ghost">+ Teslimat</button></div>
      ${deliveries.map(d => `
        <div class="lrow">
          <span class="muted">${d.method === 'kargo' ? iconHtml('box', 14) + 'Kargo' : iconHtml('hand', 14) + 'Elden'}${d.tracking_no ? ' · ' + esc(d.tracking_no) : ''}${d.planned_date ? ' · Planlanan: ' + esc(fmtDate(d.planned_date)) : ''}${Number(d.delivered) === 1 ? ' · ' + esc(fmtDate(d.delivered_date)) : ''}</span>
          <button class="ghost del-edit" data-id="${d.id}"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14.5 5.5l4 4"/></svg></button>
        </div>`).join('')}
    </div>
    ${p.notes ? `<div class="sec-title">Notlar</div><p style="padding:0 14px 14px;color:#666">${esc(p.notes)}</p>` : ''}
  `;
  document.getElementById('btn-pay').addEventListener('click', () => paymentSheet(p, null));
  document.getElementById('btn-appt').addEventListener('click', () => apptSheet(p));
  document.getElementById('btn-done')?.addEventListener('click', () => confirmComplete(p));
  // Başlıktaki ✅ kısayolu: sadece tedavi sürerken görünür, aynı onay akışını açar.
  const topDone = document.getElementById('btn-complete-top');
  if (topDone) {
    topDone.classList.toggle('hidden', p.status !== 'active');
    topDone.onclick = () => confirmComplete(p);
  }
  document.getElementById('btn-del').addEventListener('click', () => confirmDeletePatient(p));
  document.getElementById('btn-block')?.addEventListener('click', async () => {
    const r = await guarded(() => setStatus(state.exec, p.id, 'blocked'));
    if (r.ok) { banner('Asla Bakılmayacak olarak işaretlendi', 'ok'); await refreshAfterMutation(); }
  });
  document.getElementById('btn-unblock')?.addEventListener('click', async () => {
    const r = await guarded(() => setStatus(state.exec, p.id, 'active'));
    if (r.ok) { banner('Aktif yapıldı', 'ok'); await refreshAfterMutation(); }
  });
  document.getElementById('btn-del-add').addEventListener('click', () => deliverySheet(p, null));
  for (const b of body.querySelectorAll('.del-edit')) {
    b.addEventListener('click', () => deliverySheet(p, deliveries.find(d => d.id === Number(b.dataset.id))));
  }
  // The payment row is looked up from the fetched `payments` array (like the
  // delivery rows above) rather than rebuilt from data-* attributes: a dekont
  // data-URL is ~100-250 KB and must never be stamped into the DOM as an
  // attribute on every ledger row.
  for (const b of body.querySelectorAll('.pay-edit')) {
    b.addEventListener('click', () => paymentSheet(p, payments.find(o => o.id === Number(b.dataset.id))));
  }
  for (const b of body.querySelectorAll('.pay-receipt')) {
    b.addEventListener('click', () => receiptSheet(payments.find(o => o.id === Number(b.dataset.id))));
  }
}

// Full-screen dekont viewer. Images render inline; a PDF gets an "aç" button
// that hands the bytes to the OS share/open sheet (native) or downloads it
// (browser/desktop) via shareFile. Never throws — a bad/absent dekont is a
// no-op or a banner, never a crashed card.
function receiptSheet(o) {
  const r = o && o.receipt;
  if (!r || typeof r !== 'string') return;
  const isPdf = r.startsWith('data:application/pdf');
  openSheet(`
    <h4>Dekont${o.pay_date ? ' — ' + esc(fmtDate(o.pay_date)) : ''}</h4>
    <div class="form" style="padding:0">
      ${isPdf
        ? `<p class="muted">${iconHtml('file', 14)}PDF dekont</p><button id="rc-open" type="button" class="primary"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 15.5h6M9 19h3.5"/></svg>Dekontu Aç</button>`
        : `<img src="${esc(r)}" alt="Dekont" style="width:100%;max-height:70vh;object-fit:contain;border-radius:10px;border:1px solid var(--line)">`}
      <button id="rc-close" type="button" class="ghost">Kapat</button>
    </div>
  `);
  document.getElementById('rc-close').addEventListener('click', closeSheet);
  document.getElementById('rc-open')?.addEventListener('click', async () => {
    try {
      const b64 = r.split(',')[1] || '';
      if (!b64) throw new Error('Dekont verisi boş.');
      await shareFile('dekont.pdf', b64, 'application/pdf');
    } catch (e) {
      console.error('dekont', e);
      banner('Dekont açılamadı — ' + (e.message || e), 'error', 0);
    }
  });
}

async function refreshAfterMutation() {
  await renderCard();
  await refreshHome();
}

/**
 * Ödeme paneli.
 *
 * `afterNewPatient`: bu panel YENİ HASTA kaydının hemen ardından açıldıysa
 * true. Doktorun istediği akış şu: hasta kaydet → ödeme ekranı → bitince
 * ANA SAYFA (sıradaki hasta). O akışta "Vazgeç" de ana sayfaya döner; hasta
 * kartından elle açılan panelde ise kartta kalınır (orada çalışmaya devam
 * ediliyordur).
 */
async function paymentSheet(p, existing, { afterNewPatient = false } = {}) {
  let quick;
  try { quick = JSON.parse((await getMeta(state.exec, 'quick_amounts')) || '[1500,2000]'); } catch { quick = [1500, 2000]; }
  openSheet(`
    <h4>${existing ? 'Ödemeyi Düzenle' : 'Ödeme Ekle'} — ${esc(p.name)}</h4>
    <div class="seg">
      <button type="button" id="ps-paid" class="${(existing && existing.status === 'pending') ? '' : 'on'}">${iconHtml('check', 18)}Yapıldı</button>
      <button type="button" id="ps-pending" class="${(existing && existing.status === 'pending') ? 'on' : ''}"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.3l3.3 2"/></svg>Yapılacak</button>
    </div>
    <div class="quick-row">${quick.map(a => `<button type="button" class="q-amt" data-a="${esc(String(a))}">${fmtTL(a)}</button>`).join('')}</div>
    <div class="form" style="padding:0">
      <label>Tutar (₺) *<input id="pay-amount" type="text" inputmode="decimal" value="${existing ? esc(String(existing.amount)) : ''}"></label>
      <label>Ödeme Tarihi *<input id="pay-date" type="date" value="${existing ? esc(existing.pay_date) : todayIso()}"></label>
      <label><span class="lbl-row">Açıklama<button type="button" class="mic-btn ghost" data-voice-for="pay-desc" title="Sesli yaz (Win + H)" aria-label="Sesli yaz"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0013 0"/><path d="M12 18v3"/></svg></button></span><input id="pay-desc" value="${existing ? esc(existing.description) : 'Seans'}"></label>
      <div class="dekont-row" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:4px 0">
        <input id="pay-receipt-input" type="file" accept="image/*,application/pdf" style="display:none">
        <button id="btn-receipt-add" type="button"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>Dekont Ekle</button>
        <span id="pay-receipt-preview" class="muted"></span>
        <button id="btn-receipt-remove" type="button" class="ghost" style="display:none">Kaldır</button>
      </div>
      <button id="pay-save" class="primary">Kaydet</button>
      ${existing ? '<button id="pay-del" type="button"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 6.5h15"/><path d="M9.5 6.5V4h5v2.5"/><path d="M6.5 6.5L7.5 21h9l1-14.5"/></svg>Ödemeyi Sil</button>' : ''}
      <button id="pay-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  // Sheet her açılışta yeniden kurulduğu için 🎤 düğmesi de her seferinde bağlanır.
  attachVoice(document.getElementById('sheet'));
  let payStatus = (existing && existing.status === 'pending') ? 'pending' : 'paid';
  document.getElementById('ps-paid').addEventListener('click', () => { payStatus = 'paid'; document.getElementById('ps-paid').classList.add('on'); document.getElementById('ps-pending').classList.remove('on'); });
  document.getElementById('ps-pending').addEventListener('click', () => { payStatus = 'pending'; document.getElementById('ps-pending').classList.add('on'); document.getElementById('ps-paid').classList.remove('on'); });
  for (const b of document.querySelectorAll('.q-amt'))
    b.addEventListener('click', () => { document.getElementById('pay-amount').value = b.dataset.a; });

  // Dekont held for this sheet: preloaded from the payment being edited, so
  // leaving the row untouched saves the same value back; null means none/removed.
  let receipt = (existing && existing.receipt) || null;
  const renderReceipt = () => {
    const prev = document.getElementById('pay-receipt-preview');
    const rm = document.getElementById('btn-receipt-remove');
    const add = document.getElementById('btn-receipt-add');
    if (!prev) return;
    if (receipt) {
      prev.innerHTML = String(receipt).startsWith('data:application/pdf')
        ? iconHtml('file', 14) + 'PDF eklendi'
        : `<img src="${esc(receipt)}" alt="Dekont" style="width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--line);vertical-align:middle">`;
      rm.style.display = '';
      add.innerHTML = iconHtml('receipt', 18) + '<span>Dekontu Değiştir</span>';
    } else {
      prev.textContent = '';
      rm.style.display = 'none';
      add.innerHTML = iconHtml('receipt', 18) + '<span>Dekont Ekle</span>';
    }
  };
  renderReceipt();
  document.getElementById('btn-receipt-add').addEventListener('click', () => document.getElementById('pay-receipt-input').click());
  document.getElementById('btn-receipt-remove').addEventListener('click', () => { receipt = null; renderReceipt(); });
  document.getElementById('pay-receipt-input').addEventListener('change', async ev => {
    const file = ev.target.files[0];
    ev.target.value = ''; // allow re-picking the same file
    if (!file) return;
    const v = validateReceiptFile(file);
    if (!v.ok) { banner(v.error, 'error', 0); return; }
    try {
      // Images are resized to 1200px @ q0.7 — big enough that the amount and
      // date on the receipt stay readable (~100-250 KB); PDFs are stored as-is.
      receipt = v.kind === 'pdf' ? await fileToDataUrl(file) : await fileToResizedDataUrl(file, 1200, 0.7);
      renderReceipt();
    } catch (err) {
      banner('Dekont eklenemedi — ' + (err.message || err), 'error', 0);
    }
  });

  document.getElementById('pay-cancel').addEventListener('click', async () => {
    closeSheet();
    // Yeni hasta akışında "Vazgeç" = "ödeme yok" demek; akış yine biter.
    if (afterNewPatient) { await refreshHome(); showScreen('home'); }
  });
  document.getElementById('pay-save').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    // Turkish keyboards emit a comma decimal separator; parseAmountInput normalises
    // it. (The field is type="text" for the same reason — see the input markup.)
    const parsed = parseAmountInput(document.getElementById('pay-amount').value);
    if (!parsed.ok || parsed.amount == null) {
      btn.disabled = false;
      banner(parsed.ok ? 'Tutar girin.' : parsed.error, 'error', 3000);
      return;
    }
    const amount = parsed.amount;
    const pay_date = document.getElementById('pay-date').value;
    const description = document.getElementById('pay-desc').value;
    const r = await guarded(async () => {
      if (existing) await updatePayment(state.exec, existing.id, { pay_date, amount, description, status: payStatus, receipt });
      else await addPayment(state.exec, { patient_id: p.id, pay_date, amount, description, status: payStatus, receipt });
      const q = [...new Set([amount, ...quick])].slice(0, 2);
      await setMeta(state.exec, 'quick_amounts', JSON.stringify(q));
    });
    if (!r.ok) { btn.disabled = false; return; }
    closeSheet();
    if (afterSaveDestination(!existing) === 'home') {
      // Ödeme de girildiyse hastanın işi bitti → ana sayfa (bkz. after-save.js).
      // Kart yeniden çizilmiyor: zaten terk ediliyor, 100k kayıtta gereksiz iş.
      banner('Ödeme kaydedildi — ana sayfaya dönüldü', 'ok');
      await refreshHome();
      showScreen('home');
    } else {
      banner('Kaydedildi', 'ok');
      await refreshAfterMutation();
    }
  });
  document.getElementById('pay-del')?.addEventListener('click', async () => {
    openSheet(`
      <h4>Ödemeyi Sil</h4>
      <p class="muted">${esc(fmtDate(existing.pay_date))} tarihli ${esc(fmtTL(existing.amount))} tutarındaki ödeme silinecek. Emin misiniz?</p>
      <div class="form" style="padding:0">
        <button id="pay-del-go" class="primary" style="background:var(--red)">Evet, Sil</button>
        <button id="pay-del-cancel" type="button" class="ghost">Vazgeç</button>
      </div>
    `);
    document.getElementById('pay-del-cancel').addEventListener('click', closeSheet);
    document.getElementById('pay-del-go').addEventListener('click', async e => {
      const btn = e.currentTarget; btn.disabled = true;
      const r = await guarded(() => deletePayment(state.exec, existing.id));
      if (!r.ok) { btn.disabled = false; return; }
      closeSheet(); await refreshAfterMutation();
    });
  });
}

// Default reminder lead (minutes before start) from Ayarlar, used to pre-fill
// the "Ne zaman hatırlatılsın?" select for a brand-new appointment/delivery.
// '60' (1 saat önce) when the user has never set one.
async function defaultRemindMin() {
  const v = await getMeta(state.exec, 'default_remind_min');
  return v != null ? v : '60';
}

async function deliverySheet(p, existing) {
  const e = existing || { method: 'elden', tracking_no: '', planned_date: todayIso(), delivered: 0, delivered_date: '', planned_time: '', remind_min: 0 };
  openSheet(`
    <h4>${existing ? 'Paket Teslimini Düzenle' : 'Paket Teslimi'} — ${esc(p.name)}</h4>
    <div class="seg">
      <button type="button" id="m-elden" class="${e.method === 'elden' ? 'on' : ''}"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M8 11V5.5a1.6 1.6 0 013.2 0V11"/><path d="M11.2 10.5V4.6a1.6 1.6 0 013.2 0V11"/><path d="M14.4 11V6.8a1.6 1.6 0 013.2 0V14a6.5 6.5 0 01-6.5 6.5h-.6A6.5 6.5 0 014 14v-1.5a1.6 1.6 0 013.2 0V15"/></svg>Elden</button>
      <button type="button" id="m-kargo" class="${e.method === 'kargo' ? 'on' : ''}"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3.5 7.5L12 3.5l8.5 4v9L12 20.5 3.5 16.5z"/><path d="M3.5 7.5L12 11.5l8.5-4"/><path d="M12 11.5v9"/></svg>Kargo</button>
    </div>
    <div class="form" style="padding:0">
      <label id="track-wrap" style="${e.method === 'kargo' ? '' : 'display:none'}">Kargo Takip No<input id="d-track" value="${esc(e.tracking_no || '')}"></label>
      <label>Planlanan Teslim Tarihi<input id="d-plan" type="date" value="${esc(e.planned_date || '')}"></label>
      <label>Saat<input id="d-time" type="time" value="${e.planned_time ? esc(e.planned_time) : ''}"></label>
      <label>Ne zaman hatırlatılsın?<select id="d-remind">
        <option value="0">Saatinde</option><option value="15">15 dk önce</option><option value="30">30 dk önce</option>
        <option value="60">1 saat önce</option><option value="120">2 saat önce</option><option value="1440">1 gün önce</option>
      </select></label>
      <label><input id="d-done" type="checkbox" ${Number(e.delivered) === 1 ? 'checked' : ''}> Teslim edildi</label>
      <label id="ddate-wrap" style="${Number(e.delivered) === 1 ? '' : 'display:none'}">Teslim Tarihi<input id="d-ddate" type="date" value="${esc(e.delivered_date || todayIso())}"></label>
      <button id="d-save" class="primary">Kaydet</button>
      ${existing ? '<button id="d-del" type="button"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M4.5 6.5h15"/><path d="M9.5 6.5V4h5v2.5"/><path d="M6.5 6.5L7.5 21h9l1-14.5"/></svg>Teslimatı Sil</button>' : ''}
      <button id="d-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('d-remind').value = String(
    existing && existing.remind_min != null ? existing.remind_min : await defaultRemindMin()
  );
  let method = e.method;
  const setM = m => { method = m; document.getElementById('m-elden').classList.toggle('on', m === 'elden'); document.getElementById('m-kargo').classList.toggle('on', m === 'kargo'); document.getElementById('track-wrap').style.display = m === 'kargo' ? '' : 'none'; };
  document.getElementById('m-elden').addEventListener('click', () => setM('elden'));
  document.getElementById('m-kargo').addEventListener('click', () => setM('kargo'));
  document.getElementById('d-done').addEventListener('change', ev => { document.getElementById('ddate-wrap').style.display = ev.target.checked ? '' : 'none'; });
  document.getElementById('d-cancel').addEventListener('click', closeSheet);
  document.getElementById('d-save').addEventListener('click', async ev => {
    const btn = ev.currentTarget; btn.disabled = true;
    const delivered = document.getElementById('d-done').checked ? 1 : 0;
    const o = { patient_id: p.id, method, tracking_no: document.getElementById('d-track') ? document.getElementById('d-track').value : '',
      planned_date: document.getElementById('d-plan').value || null, delivered,
      delivered_date: delivered ? document.getElementById('d-ddate').value : null,
      planned_time: document.getElementById('d-time').value || null, remind_min: Number(document.getElementById('d-remind').value) || 0 };
    const r = await guarded(() => existing ? updateDelivery(state.exec, existing.id, o) : addDelivery(state.exec, o));
    if (!r.ok) { btn.disabled = false; return; }
    closeSheet(); banner('Kaydedildi', 'ok'); await refreshAfterMutation();
    const g = await getPatient(state.exec, p.id);
    const fd = existing ? g.deliveries.find(x => x.id === existing.id) : g.deliveries.slice().sort((a, b) => b.id - a.id)[0];
    if (fd) syncCalendar('delivery', g.patient, fd);
  });
  document.getElementById('d-del')?.addEventListener('click', () => {
    openSheet(`<h4>Teslimatı Sil</h4><p class="muted">Bu teslimat kaydı silinecek. Emin misiniz?</p>
      <div class="form" style="padding:0"><button id="d-del-go" class="primary" style="background:var(--red)">Evet, Sil</button>
      <button id="d-del-cancel" type="button" class="ghost">Vazgeç</button></div>`);
    document.getElementById('d-del-cancel').addEventListener('click', closeSheet);
    document.getElementById('d-del-go').addEventListener('click', async ev2 => {
      const btn = ev2.currentTarget; btn.disabled = true;
      if (existing.cal_id) { try { await deleteEvent(existing.cal_id); } catch (e) { console.error('calendar', e); } }
      const r = await guarded(() => deleteDelivery(state.exec, existing.id));
      if (!r.ok) { btn.disabled = false; return; }
      closeSheet(); await refreshAfterMutation();
    });
  });
}

async function apptSheet(p) {
  openSheet(`
    <h4>Sonraki Randevu — ${esc(p.name)}</h4>
    <div class="form" style="padding:0">
      <label>Tarih &amp; Saat<input id="appt-dt" type="datetime-local" value="${p.next_appt ? esc(p.next_appt.replace(' ', 'T')) : ''}"></label>
      <label>Ne zaman hatırlatılsın?<select id="appt-remind">
        <option value="0">Saatinde</option><option value="15">15 dk önce</option><option value="30">30 dk önce</option>
        <option value="60">1 saat önce</option><option value="120">2 saat önce</option><option value="1440">1 gün önce</option>
      </select></label>
      <button id="appt-save" class="primary">Kaydet</button>
      <button id="appt-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('appt-remind').value = String(p.appt_remind_min != null ? p.appt_remind_min : await defaultRemindMin());
  document.getElementById('appt-cancel').addEventListener('click', closeSheet);
  document.getElementById('appt-save').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const v = document.getElementById('appt-dt').value;
    const r = await guarded(() => updatePatient(state.exec, p.id, { ...p, next_appt: v ? v.replace('T', ' ') : null, appt_remind_min: Number(document.getElementById('appt-remind').value) || 0 }));
    if (!r.ok) { btn.disabled = false; return; }
    closeSheet(); await refreshAfterMutation();
    const { patient: fp } = await getPatient(state.exec, p.id);
    syncCalendar('appt', fp);
  });
}

function confirmComplete(p) {
  openSheet(`
    <h4>Tedaviyi Tamamla — ${esc(p.name)}</h4>
    <div class="form" style="padding:0">
      <label>Bitiş Tarihi<input id="done-date" type="date" value="${todayIso()}"></label>
      <button id="done-save" class="primary">Tamamla</button>
      <button id="done-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('done-cancel').addEventListener('click', closeSheet);
  document.getElementById('done-save').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    const r = await guarded(() => completeTreatment(state.exec, p.id, document.getElementById('done-date').value));
    if (!r.ok) { btn.disabled = false; return; }
    closeSheet(); banner('Tedavi tamamlandı', 'ok'); await refreshAfterMutation();
    if (p.appt_cal_id) { try { await deleteEvent(p.appt_cal_id); } catch (e) { console.error('calendar', e); } }
  });
}

function confirmDeletePatient(p) {
  openSheet(`
    <h4>Hastayı Sil</h4>
    <p class="muted"><b>${esc(p.name)}</b> isimli hastayı silmek istediğinizden emin misiniz?<br>Bu işlem geri alınamaz — hastanın TÜM ödeme ve teslimat kayıtları da silinir.</p>
    <div class="form" style="padding:0">
      <button id="del-go" class="primary" style="background:var(--red)">Sil</button>
      <button id="del-cancel" type="button" class="ghost">Vazgeç</button>
    </div>
  `);
  document.getElementById('del-cancel').addEventListener('click', closeSheet);
  document.getElementById('del-go').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const g = await getPatient(state.exec, p.id);
      if (g.patient.appt_cal_id) await deleteEvent(g.patient.appt_cal_id);
      for (const d of g.deliveries) if (d.cal_id) await deleteEvent(d.cal_id);
    } catch (e) { console.error('calendar', e); }
    const r = await guarded(() => deletePatient(state.exec, p.id));
    if (!r.ok) { btn.disabled = false; return; }
    closeSheet(); await refreshHome(); showScreen('home');
  });
}

export function initCard() {
  document.querySelector('#screen-card .btn-back').addEventListener('click', async () => { await refreshHome(); showScreen('home'); });
  document.getElementById('btn-edit').addEventListener('click', () => openForm(state.currentId));
  document.getElementById('sheet-overlay').addEventListener('click', e => { if (e.target.id === 'sheet-overlay') closeSheet(); });
}
