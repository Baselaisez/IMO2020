// "Yavaş ve geç tepki veriyor" şikâyetinin arkasındaki üç şeyi sabitleyen testler.
//
// Ölçülen asıl sorun ŞUYDU: 100.000 kayıtlık defterde tam bir eşitleme turunun
// yazma tarafı 3911 ms boyunca ana iş parçacığını KESİNTİSİZ kilitliyordu —
// arka planda 5 ms'de bir atması gereken sayaç o süre içinde BİR KEZ bile
// çalışamadı. O süre boyunca uygulama hiçbir dokunuşu işleyemez. Üstelik bu tur
// uygulama her AÇILDIĞINDA ve her ÖNE GELDİĞİNDE zorla çalıştırılıyordu.
//
// Üç düzeltme:
//   1. Hafıza diskte yaşıyor; açılış/öne gelme artık kısa yolu kullanabiliyor.
//   2. Büyük tablolar sayfa sayfa okunuyor (iPhone'da köprüden geçen tek dev
//      mesaj yerine küçük mesajlar), aralarda arayüze sıra veriliyor.
//   3. Yük parça parça metne çevriliyor ve sağlama toplamı yol boyunca
//      hesaplanıyor — 75 milyon karakterlik ayrı geçiş kalktı.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import initSqlJs from 'sql.js';
import { initSchema, addPatient, addPayment, buildSyncState, readPaged } from '../src/js/repo.js';
import {
  serializeSyncPayload, serializeSyncPayloadAsync, parseSyncPayload,
  usableMemory, memorySnapshot, MEMORY_MAX_AGE_MS,
  syncNow, resetSyncMemory, loadSyncMemory,
} from '../src/js/sync-file.js';

async function db() {
  const SQL = await initSqlJs({ locateFile: f => `node_modules/sql.js/dist/${f}` });
  const d = new SQL.Database();
  const x = {
    async run(sql, p = []) { d.run(sql, p); return { changes: d.getRowsModified() }; },
    async query(sql, p = []) {
      const st = d.prepare(sql); st.bind(p);
      const rows = []; while (st.step()) rows.push(st.getAsObject()); st.free(); return rows;
    },
  };
  await initSchema(x);
  return x;
}
function folder() {
  const files = new Map();
  return { files,
    async read(n) { return files.has(n) ? files.get(n) : null; },
    async write(n, t) { files.set(n, t); },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); },
    async remove(n) { files.delete(n); } };
}

// --- 1. Açılışta hafıza diskten geliyor -----------------------------------

test('usableMemory: taze girdileri alır, şüpheli olanları ELER', () => {
  const now = 1_000_000_000;
  const taze = { a: { fp: 'x|1', at: now - 60_000 } };
  assert.deepEqual([...usableMemory(taze, now)], [['a', 'x|1']]);

  // Eskiyen hafıza kullanılmaz: karşı cihaz başlığı yazamadan kapanmış olabilir.
  assert.equal(usableMemory({ a: { fp: 'x', at: now - MEMORY_MAX_AGE_MS - 1 } }, now).size, 0);
  // Saat ileri alınmışsa (gelecekten damga) güvenme.
  assert.equal(usableMemory({ a: { fp: 'x', at: now + 60_000 } }, now).size, 0);
  // Bozuk girdiler.
  assert.equal(usableMemory({ a: { fp: '', at: now } }, now).size, 0);
  assert.equal(usableMemory({ a: { fp: 'x' } }, now).size, 0);
  assert.equal(usableMemory({ a: null }, now).size, 0);
  assert.equal(usableMemory(null, now).size, 0);
  assert.equal(usableMemory('bozuk', now).size, 0);
});

test('memorySnapshot ile usableMemory gidip gelebiliyor', () => {
  const now = 1_700_000_000_000;
  const m = new Map([['icloud', 'fp-1'], ['syncthing', 'fp-2']]);
  const geri = usableMemory(JSON.parse(JSON.stringify(memorySnapshot(m, now))), now + 1000);
  assert.deepEqual([...geri].sort(), [...m].sort());
});

test('yeniden açılışta tur ATLANIYOR (hafıza diskten okunuyor)', async () => {
  const x = await db();
  await addPatient(x, { name: 'ALİ VELİ', start_date: '2026-11-12' });
  const store = folder();

  resetSyncMemory();
  const ilk = await syncNow(x, { folder: store, memoryKey: 'k', nowMs: Date.now() });
  assert.ok(!ilk.skipped, 'ilk tur çalışmalı');

  // Uygulama kapandı: bellekteki hafıza gitti.
  resetSyncMemory();
  // Yeniden açılış: hafıza DİSKTEN okunur.
  await loadSyncMemory(x);
  const ikinci = await syncNow(x, { folder: store, memoryKey: 'k', nowMs: Date.now() });
  assert.deepEqual({ skipped: ikinci.skipped, reason: ikinci.reason },
    { skipped: true, reason: 'unchanged' },
    'hiçbir şey değişmediyse açılış turu hiç başlamamalı');
});

test('yeniden açılışta veri DEĞİŞTİYSE tur yine çalışır', async () => {
  const x = await db();
  await addPatient(x, { name: 'ALİ VELİ', start_date: '2026-11-12' });
  const store = folder();
  resetSyncMemory();
  await syncNow(x, { folder: store, memoryKey: 'k', nowMs: Date.now() });

  resetSyncMemory();
  await loadSyncMemory(x);
  await addPatient(x, { name: 'YENİ HASTA', start_date: '2026-11-12' });   // arada kayıt girildi
  const r = await syncNow(x, { folder: store, memoryKey: 'k', nowMs: Date.now() });
  assert.ok(!r.skipped, 'yerel veri değiştiyse atlanmamalı');
});

test('açılış ve öne gelme artık tam turu ZORLAMIYOR', () => {
  const src = readFileSync('src/js/sync-file.js', 'utf8');
  assert.match(src, /await loadSyncMemory\(x\);\s*\n\s*runAuto\('startup'\);/,
    'açılışta önce hafıza okunmalı, sonra force OLMADAN tur denenmeli');
  assert.doesNotMatch(src, /runAuto\('startup', \{ force: true \}\)/);
  assert.doesNotMatch(src, /runAuto\('resume', \{ force: true \}\)/);
  // Elle "Şimdi Eşitle" hâlâ zorlamalı — kullanıcı sonuç bekliyor.
  assert.match(readFileSync('src/js/ui-settings.js', 'utf8'), /syncIfConfigured\(state\.exec, \{ force: true/);
});

// --- 2. Sayfalı okuma -------------------------------------------------------

test('readPaged: sayfa boyutu neye bölünürse bölünsün AYNI satırları verir', async () => {
  const x = await db();
  for (let i = 0; i < 25; i++) await addPatient(x, { name: `HASTA ${i}`, start_date: '2026-11-12' });
  const hepsi = await x.query('SELECT c.uuid FROM patients c ORDER BY c.id');
  for (const pageSize of [1, 2, 7, 24, 25, 26, 1000]) {
    const r = await readPaged(x, { table: 'patients', select: 'c.uuid', pageSize, onYield: null });
    assert.deepEqual(r, hepsi, `pageSize=${pageSize} için satırlar aynı olmalı`);
  }
});

test('buildSyncState: sayfalı okuma yükü değiştirmiyor', async () => {
  const x = await db();
  for (let i = 0; i < 12; i++) {
    const id = await addPatient(x, { name: `HASTA ${i}`, start_date: '2026-11-12' });
    await addPayment(x, { patient_id: id, amount: 100 + i, pay_date: '2026-11-12', status: 'paid' });
  }
  const buyuk = await buildSyncState(x, { pageSize: 1000, onYield: null });
  const kucuk = await buildSyncState(x, { pageSize: 5, onYield: null });
  assert.deepEqual(kucuk, buyuk);
  assert.equal(buyuk.patients.length, 12);
});

// --- 3. Parça parça metin üretimi -------------------------------------------

const STATE = {
  patients: Array.from({ length: 37 }, (_, i) => ({ uuid: `p${i}`, name: `ALİ "tırnak" ${i}`, notes: i % 3 ? '' : '"data": tuzak' })),
  payments: Array.from({ length: 11 }, (_, i) => ({ uuid: `o${i}`, patient_uuid: `p${i}`, amount: 1500 + i })),
  deliveries: [],
  deletions: [{ uuid: 'z', entity: 'patient', deleted_at: '2026-01-01T00:00:00.000Z' }],
};

test('parçalı üretim, tek seferlik üretimle BAYT BAYT aynı', async () => {
  const ISO = '2026-11-12T09:00:00.000Z';
  const beklenen = serializeSyncPayload(STATE, ISO);
  for (const chunk of [1, 2, 5, 36, 37, 38, 10_000]) {
    const alinan = await serializeSyncPayloadAsync(STATE, ISO, { chunk, onYield: null });
    assert.equal(alinan, beklenen, `chunk=${chunk} aynı metni vermeli`);
  }
});

test('parçalı üretimin sağlaması doğrulamadan GEÇİYOR', async () => {
  // Sağlama artık yol boyunca hesaplanıyor; yanlış hesaplansaydı okuma tarafı
  // dosyayı "bozuk" diye reddeder ve eşitleme tamamen dururdu.
  const text = await serializeSyncPayloadAsync(STATE, '2026-11-12T09:00:00.000Z', { chunk: 3, onYield: null });
  const geri = parseSyncPayload(text);
  assert.equal(geri.patients.length, 37);
  assert.equal(geri.payments[0].patient_uuid, 'p0');
  // Kurcalanmış dosya hâlâ reddedilmeli.
  assert.throws(() => parseSyncPayload(text.replace('1500', '9999')), /bütünlük/);
});

test('boş durum da geçerli metin üretir', async () => {
  const bos = { patients: [], payments: [], deliveries: [], deletions: [] };
  const text = await serializeSyncPayloadAsync(bos, '2026-11-12T09:00:00.000Z', { onYield: null });
  assert.equal(text, serializeSyncPayload(bos, '2026-11-12T09:00:00.000Z'));
  assert.deepEqual(parseSyncPayload(text).patients, []);
});

test('sıra verme gerçekten çalışıyor (arayüz nefes alıyor)', async () => {
  // onYield çağrılmazsa iş parçacığı hiç bırakılmaz; şikâyetin özü buydu.
  let kez = 0;
  await serializeSyncPayloadAsync(STATE, '2026-11-12T09:00:00.000Z',
    { chunk: 5, onYield: async () => { kez++; } });
  assert.ok(kez >= 7, `37 kaydı 5'erli üretirken en az 7 kez sıra verilmeli, verilen: ${kez}`);
});
