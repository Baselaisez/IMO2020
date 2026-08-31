import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutosave, readyToAutosave, sameValues, autosaveDelayMs, AUTOSAVE_DEFAULT_MS } from '../src/js/autosave.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

test('autosaveDelayMs: ayar değerleri', () => {
  assert.equal(autosaveDelayMs('off'), 0);
  assert.equal(autosaveDelayMs('5'), 5000);
  assert.equal(autosaveDelayMs('8'), 8000);
  assert.equal(autosaveDelayMs('15'), 15000);
  assert.equal(autosaveDelayMs(undefined), AUTOSAVE_DEFAULT_MS, 'bilinmeyen ayar varsayılana düşer');
  assert.equal(autosaveDelayMs('9999'), AUTOSAVE_DEFAULT_MS, 'saçma değer varsayılana düşer');
});

test('readyToAutosave: yarım form kaydedilmez', () => {
  const ok = { name: 'Ayşe Yılmaz', start_date: '2026-08-26' };
  assert.equal(readyToAutosave(ok), true);
  assert.equal(readyToAutosave({ ...ok, name: 'Ay' }), false, 'iki harf yetmez');
  assert.equal(readyToAutosave({ ...ok, name: '   ' }), false);
  assert.equal(readyToAutosave({ ...ok, name: '0532' }), false, 'rakam yığını ad değildir');
  assert.equal(readyToAutosave({ ...ok, start_date: '' }), false);
  assert.equal(readyToAutosave({}), false);
  assert.equal(readyToAutosave(null), false);
});

test('sameValues: aynı içerik tekrar yazılmaz', () => {
  assert.equal(sameValues({ a: '1', b: '' }, { a: '1', b: '' }), true);
  assert.equal(sameValues({ a: '1' }, { a: '2' }), false);
  assert.equal(sameValues({ a: '1' }, { a: '1', b: 'x' }), false);
  assert.equal(sameValues(null, { a: '1' }), false, 'ilk kayıttan önce "aynı" yoktur');
});

// --- Sayaç davranışı --------------------------------------------------------

function harness(values, delay = 30) {
  const saved = [];
  let current = { ...values };
  let editing = false;
  const a = createAutosave({
    getValues: () => ({ ...current }),
    getDelayMs: () => delay,
    save: async (v) => {
      saved.push({ ...v, __editing: editing });
      editing = true;               // ui-form.js'in onSaved'de yaptığı şeyin aynısı
      return { id: 7, created: saved.length === 1 };
    },
  });
  return { a, saved, set: (patch) => { current = { ...current, ...patch }; }, isEditing: () => editing };
}

test('yazmayı bırakınca kaydeder, yazarken kesmez', async () => {
  const h = harness({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }, 40);
  h.a.bump();
  await sleep(20); h.a.bump();   // hâlâ yazıyor
  await sleep(20); h.a.bump();   // hâlâ yazıyor
  assert.equal(h.saved.length, 0, 'yazarken kaydetmedi');
  await sleep(70);
  assert.equal(h.saved.length, 1, 'durunca kaydetti');
});

test('ikinci kayıt YENİ hasta oluşturmaz, aynısını günceller', async () => {
  const h = harness({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }, 20);
  h.a.bump(); await sleep(50);
  h.set({ phone: '05321112233' });
  h.a.bump(); await sleep(50);
  assert.equal(h.saved.length, 2);
  assert.equal(h.saved[0].__editing, false, 'ilki oluşturur');
  assert.equal(h.saved[1].__editing, true, 'ikincisi GÜNCELLER — mükerrer kayıt yok');
});

test('değişiklik yoksa tekrar yazmaz', async () => {
  const h = harness({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }, 20);
  h.a.bump(); await sleep(50);
  h.a.bump(); await sleep(50);
  assert.equal(h.saved.length, 1);
});

test('ad girilmemişse hiç kaydetmez', async () => {
  const h = harness({ name: '', start_date: '2026-08-26' }, 20);
  h.a.bump(); await sleep(50);
  assert.equal(h.saved.length, 0);
});

test('otomatik kayıt kapalıyken sayaç hiç kurulmaz', async () => {
  const h = harness({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }, 0);
  h.a.bump();
  assert.equal(h.a.isPending(), false);
  await sleep(40);
  assert.equal(h.saved.length, 0);
});

test('formdan çıkarken bekleyen kayıt HEMEN yazılır', async () => {
  const h = harness({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }, 5000);
  h.a.bump();
  assert.equal(h.saved.length, 0);
  await h.a.flush();
  assert.equal(h.saved.length, 1, 'çıkarken beklemeye gerek yok');
});

test('elle kaydetme sayacı iptal eder (çift yazma olmaz)', async () => {
  const h = harness({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }, 20);
  h.a.bump();
  h.a.cancel();
  await sleep(50);
  assert.equal(h.saved.length, 0);
});

test('reset: yeni form önceki formun sayacını devralmaz', async () => {
  const h = harness({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }, 20);
  h.a.bump();
  h.a.reset();
  await sleep(50);
  assert.equal(h.saved.length, 0);
});

test('form kapalıysa (isActive false) kaydetmez', async () => {
  const saved = [];
  const a = createAutosave({
    getValues: () => ({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }),
    getDelayMs: () => 20,
    isActive: () => false,
    save: async v => { saved.push(v); return { id: 1, created: true }; },
  });
  a.bump(); await sleep(50);
  assert.equal(saved.length, 0);
});

test('kaydetme hatası onError ile bildirilir, sessiz kalınmaz', async () => {
  const errors = [];
  const a = createAutosave({
    getValues: () => ({ name: 'Ayşe Yılmaz', start_date: '2026-08-26' }),
    getDelayMs: () => 10,
    save: async () => { throw new Error('disk dolu'); },
    onError: e => errors.push(e.message),
  });
  await a.runNow();
  assert.deepEqual(errors, ['disk dolu']);
});
