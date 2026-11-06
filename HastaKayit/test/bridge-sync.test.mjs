// SAMSUNG ⇄ APPLE eşitlemesi: Mac'in köprü olduğu mimarinin uçtan uca kanıtı.
//
//     iPhone ⇄ iCloud klasörü ⇄ [MAC] ⇄ Syncthing klasörü ⇄ Samsung
//
// NEDEN BÖYLE: Android'de masaüstündeki gibi "bulut klasörünü diske indirip
// eşitleyen" bir istemci yok; Drive ve Dropbox'ın Android uygulamaları başka
// uygulamalara klasör düzeyinde yazma izni güvenilir biçimde vermez. Syncthing
// iki cihaz arasında doğrudan klasör eşitler (hesap yok, sunucu yok, veri
// muayenehaneden çıkmaz) ama iPhone onu kullanamaz, Samsung da iCloud'u.
// İkisine birden erişebilen tek cihaz Mac.
//
// Buradaki testler ÜÇ AYRI veritabanı ve İKİ AYRI klasör kurar; kaydın
// gerçekten karşı uca vardığını satır sayarak doğrular. Birleştirme motoruna
// hiç dokunulmadı — kanıtlanması gereken, turların doğru sırayla akması.
import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import { initSchema, addPatient, listPatients, countPatients } from '../src/js/repo.js';
import { syncNow, pickSyncTargets, pickSyncTarget, summarizeRounds, resetSyncMemory } from '../src/js/sync-file.js';

async function newDevice() {
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

/** Bellekte bir "klasör" — iCloud ya da Syncthing klasörünün yerine geçer. */
function folder() {
  const files = new Map();
  return {
    files,
    async read(n) { return files.has(n) ? files.get(n) : null; },
    async write(n, t) { files.set(n, t); },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); },
    async remove(n) { files.delete(n); },
  };
}

let clock = Date.parse('2026-11-06T09:00:00.000Z');
const tick = () => (clock += 60_000);

/** Bir cihazın bir klasöre karşı tam turu. */
const round = (x, store, key) =>
  syncNow(x, { folder: store, memoryKey: key, nowMs: tick(), force: true });

const names = async (x) => (await listPatients(x)).map(p => p.name).sort();

// --- Hedef seçimi ----------------------------------------------------------

test('Mac: hem seçilen klasöre hem iCloud\'a yazar (köprü)', () => {
  const t = pickSyncTargets({
    platform: 'desktop', folder: '/Users/x/Syncthing/HK', icloud: true, icloudPath: '/Users/x/iCloud/HK',
  });
  assert.deepEqual(t.map(e => e.target), ['/Users/x/Syncthing/HK', '/Users/x/iCloud/HK']);
  // Eski tek-hedefli çağrı aynı cevabı almaya devam etmeli (geriye uyum).
  assert.equal(pickSyncTarget({
    platform: 'desktop', folder: '/Users/x/Syncthing/HK', icloud: true, icloudPath: '/Users/x/iCloud/HK',
  }).target, '/Users/x/Syncthing/HK');
});

test('Mac: aynı klasör iki kez hedef olmaz', () => {
  const t = pickSyncTargets({ platform: 'desktop', folder: '/Users/x/iCloud/HK', icloud: true, icloudPath: '/Users/x/iCloud/HK' });
  assert.equal(t.length, 1);
});

test('telefon tek hedefe yazar, tarayıcı hiç yazmaz', () => {
  assert.equal(pickSyncTargets({ platform: 'mobile', folder: '', icloud: true }).length, 1);
  assert.equal(pickSyncTargets({ platform: 'mobile', folder: '', icloud: false }).length, 1);
  assert.equal(pickSyncTargets({ platform: 'web', folder: '', icloud: false }).length, 0);
});

// --- Uçtan uca: kayıt gerçekten karşı uca varıyor mu? ----------------------

test('iPhone\'da girilen hasta Mac üzerinden SAMSUNG\'a ulaşır', async () => {
  resetSyncMemory();
  const iphone = await newDevice(), mac = await newDevice(), samsung = await newDevice();
  const iCloud = folder(), syncthing = folder();

  await addPatient(iphone, { name: 'AYŞE YILMAZ', start_date: '2026-11-06' });

  await round(iphone, iCloud, 'icloud');          // iPhone -> iCloud
  await round(mac, iCloud, 'icloud');             // Mac <- iCloud
  await round(mac, syncthing, 'syncthing');       // Mac -> Syncthing
  await round(samsung, syncthing, 'syncthing');   // Samsung <- Syncthing

  assert.deepEqual(await names(mac), ['AYŞE YILMAZ'], 'Mac almalı');
  assert.deepEqual(await names(samsung), ['AYŞE YILMAZ'], 'Samsung almalı');
});

test('Samsung\'da girilen hasta Mac üzerinden iPHONE\'a ulaşır', async () => {
  resetSyncMemory();
  const iphone = await newDevice(), mac = await newDevice(), samsung = await newDevice();
  const iCloud = folder(), syncthing = folder();

  await addPatient(samsung, { name: 'MEHMET KAYA', start_date: '2026-11-06' });

  await round(samsung, syncthing, 'syncthing');
  await round(mac, syncthing, 'syncthing');
  await round(mac, iCloud, 'icloud');
  await round(iphone, iCloud, 'icloud');

  assert.deepEqual(await names(iphone), ['MEHMET KAYA'], 'iPhone almalı');
});

test('iki uçta AYNI ANDA girilen kayıtların ikisi de korunur', async () => {
  // En riskli durum: doktor telefonda, asistan Samsung'da kayıt giriyor.
  // Hiçbiri kaybolmamalı.
  resetSyncMemory();
  const iphone = await newDevice(), mac = await newDevice(), samsung = await newDevice();
  const iCloud = folder(), syncthing = folder();

  await addPatient(iphone, { name: 'IPHONE HASTASI', start_date: '2026-11-06' });
  await addPatient(samsung, { name: 'SAMSUNG HASTASI', start_date: '2026-11-06' });

  // İki tam gidiş-dönüş: veri her iki yöne de akar.
  for (let i = 0; i < 2; i++) {
    await round(iphone, iCloud, 'icloud');
    await round(samsung, syncthing, 'syncthing');
    await round(mac, iCloud, 'icloud');
    await round(mac, syncthing, 'syncthing');
    await round(iphone, iCloud, 'icloud');
    await round(samsung, syncthing, 'syncthing');
  }

  const beklenen = ['IPHONE HASTASI', 'SAMSUNG HASTASI'];
  assert.deepEqual(await names(iphone), beklenen, 'iPhone ikisini de görmeli');
  assert.deepEqual(await names(mac), beklenen, 'Mac ikisini de görmeli');
  assert.deepEqual(await names(samsung), beklenen, 'Samsung ikisini de görmeli');
  // Kopyalanma olmamalı: uuid eşleştirmesi aynı kaydı iki kez yazmamalı.
  assert.equal(await countPatients(mac), 2);
});

test('kısa yol, HENÜZ YAZILMAMIŞ hedefi atlamaz', async () => {
  // iCloud turundan hemen sonra Syncthing turu geliyor ve yerel veri bu arada
  // değişmemiş oluyor — yani "değişmedi" kısa yolunun tetiklenmeye en yakın
  // olduğu an. Atlanmamalı, çünkü Syncthing klasöründe henüz dosya YOK.
  //
  // DÜRÜSTLÜK NOTU: bu test hedef başına ayrı hafızayı KANITLAMAZ. Tek ortak
  // hafızayla da geçer, çünkü kısa yol yalnızca parmak izine değil, o hedefin
  // BAŞLIĞINA da bakıyor; boş klasörde başlık null olduğu için tur yine
  // çalışır. Hedef başına hafıza yine de doğru tasarım (aşağıda), ama onun
  // gerekçesi bu test değil.
  //
  // force KULLANILMIYOR: sınanan şey kısa yolun kendisi.
  resetSyncMemory();
  const mac = await newDevice(), samsung = await newDevice();
  const iCloud = folder(), syncthing = folder();
  await addPatient(mac, { name: 'KÖPRÜ TESTİ', start_date: '2026-11-06' });

  const once = async (store, key) =>
    syncNow(mac, { folder: store, memoryKey: key, nowMs: tick() });   // force YOK

  await once(iCloud, 'icloud');      // hafızaya iCloud için parmak izi yazar
  const r = await once(syncthing, 'syncthing');
  assert.ok(!r.skipped, 'Syncthing turu atlanmamalı — kendi hafızası boştu');

  await round(samsung, syncthing, 'syncthing');
  assert.deepEqual(await names(samsung), ['KÖPRÜ TESTİ']);
});

// --- Bir hedef bozulursa ne olur? ------------------------------------------

test('summarizeRounds: bir hedef başarısızsa SESSİZCE başarı denmez', () => {
  const r = summarizeRounds([
    { pulled: 1, pushed: 2, applied: { patientsUpserted: 1 }, at: 'T1', targetLabel: 'iCloud' },
    { error: 'klasör bulunamadı', targetLabel: 'Syncthing' },
  ]);
  assert.equal(r.at, 'T1');
  assert.equal(r.applied.patientsUpserted, 1);
  assert.match(r.partialError, /Syncthing: klasör bulunamadı/);
});

test('summarizeRounds: hepsi başarısızsa hata döner', () => {
  const r = summarizeRounds([
    { error: 'a', targetLabel: 'iCloud' }, { error: 'b', targetLabel: 'Syncthing' },
  ]);
  assert.ok(!r.at);
  assert.match(r.error, /iCloud: a · Syncthing: b/);
});

test('summarizeRounds: iki hedef de iş yaptıysa sayılar TOPLANIR', () => {
  const r = summarizeRounds([
    { pulled: 1, pushed: 2, applied: { patientsUpserted: 1, paymentsUpserted: 3 }, at: 'T1' },
    { pulled: 4, pushed: 5, applied: { patientsUpserted: 2, paymentsUpserted: 1 }, at: 'T2' },
  ]);
  assert.equal(r.pulled, 5);
  assert.equal(r.pushed, 7);
  assert.deepEqual(r.applied, { patientsUpserted: 3, paymentsUpserted: 4 });
  assert.equal(r.at, 'T2');
  assert.equal(r.targets, 2);
});

test('summarizeRounds: hiçbiri iş yapmadıysa atlandı', () => {
  const r = summarizeRounds([{ skipped: true, reason: 'unchanged' }, { skipped: true, reason: 'unchanged' }]);
  assert.equal(r.skipped, true);
});
