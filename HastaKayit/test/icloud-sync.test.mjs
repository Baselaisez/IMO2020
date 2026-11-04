import test from 'node:test';
import assert from 'node:assert/strict';
import initSqlJs from 'sql.js';
import {
  pickSyncTarget, readRemoteHead, writeRemoteState, readRemoteState,
  syncNow, resetSyncMemory, SYNC_FILE, SYNC_HEAD, SYNC_TMP, ANDROID_SYNC_DIR,
} from '../src/js/sync-file.js';
import { ICLOUD_TARGET, ICLOUD_LABEL, iCloudErrorText } from '../src/js/icloud.js';
import { findICloudDir } from '../electron/icloud.cjs';
import { SYNC_NAMES, syncPath } from '../electron/sync-path.cjs';
import { initSchema, addPatient, syncFingerprint } from '../src/js/repo.js';

// iPhone ↔ Mac eşitlemesinin ÇALIŞMAMA sebebi mimariydi: iPhone, eşitleme
// dosyasını uygulamanın kendi kabındaki Documents klasörüne yazıyordu ve o
// klasör iCloud'a kopyalanmaz — Mac onu hiçbir zaman göremezdi. Düzeltme,
// iki tarafı da AYNI iCloud klasörüne (ubiquity container) yöneltmek.

// --- Hedef seçimi ----------------------------------------------------------

test('iPhone: iCloud açıkken hedef ubiquity container olur', () => {
  const r = pickSyncTarget({ platform: 'mobile', folder: '', icloud: true });
  assert.equal(r.target, ICLOUD_TARGET);
  assert.equal(r.targetLabel, ICLOUD_LABEL);
  assert.equal(r.auto, true, 'kullanıcı ayarı olmadan bulundu → varsayılan açık');
});

test('iPhone: iCloud kapalıyken eski yerel klasöre düşer ve KENDİLİĞİNDEN açılmaz', () => {
  const r = pickSyncTarget({ platform: 'mobile', folder: '', icloud: false });
  assert.equal(r.target, ANDROID_SYNC_DIR);
  assert.equal(r.auto, false,
    'Mac’in göremeyeceği bir klasör için eşitlemeyi kendiliğinden açmak yanıltıcı olurdu');
});

test('Mac: kullanıcının seçtiği klasör iCloud’u EZER (mevcut Dropbox kurulumları bozulmasın)', () => {
  const r = pickSyncTarget({
    platform: 'desktop', folder: '/Users/x/Dropbox/HK', icloud: true, icloudPath: '/Users/x/iCloud',
  });
  assert.equal(r.target, '/Users/x/Dropbox/HK');
  assert.equal(r.auto, false);
});

test('Mac: klasör seçilmemişse iPhone ile AYNI iCloud klasörü kullanılır', () => {
  const r = pickSyncTarget({ platform: 'desktop', folder: '', icloud: true, icloudPath: '/Users/x/iCloud/Docs' });
  assert.equal(r.target, '/Users/x/iCloud/Docs');
  assert.equal(r.auto, true);
});

test('tarayıcı önizlemesi: hedef yok', () => {
  assert.equal(pickSyncTarget({ platform: 'web', folder: '', icloud: false }).target, '');
});

// --- Mac tarafındaki klasör çözümlemesi -----------------------------------

const MAC = { home: '/Users/doktor', platform: 'darwin' };

test('Mac: container varsa Documents yolu döner', () => {
  const made = [];
  const r = findICloudDir({
    ...MAC,
    exists: (p) => !p.endsWith('/Documents'),   // Documents hariç her şey var
    mkdir: (p) => made.push(p),
  });
  assert.equal(r.path, '/Users/doktor/Library/Mobile Documents/iCloud~com~hastakayit~app/Documents');
  assert.deepEqual(made, [r.path], 'eksik Documents alt klasörü oluşturulur');
});

test('Mac: container YOKSA klasör UYDURULMAZ — sessizce eşitlenmeyen klasör en kötü hata', () => {
  const made = [];
  const r = findICloudDir({
    ...MAC,
    exists: (p) => p.endsWith('Mobile Documents'),  // yalnızca iCloud kökü var
    mkdir: (p) => made.push(p),
  });
  assert.equal(r.path, null);
  assert.deepEqual(made, [], 'Mobile Documents altına elle klasör açılmaz — iCloud onu sahiplenmez');
  assert.match(r.reason, /iPhone/, 'kullanıcıya ne yapacağı söylenir');
});

test('Mac: iCloud Drive kapalıysa sebep söylenir', () => {
  const r = findICloudDir({ ...MAC, exists: () => false });
  assert.equal(r.path, null);
  assert.match(r.reason, /iCloud Drive/);
});

test('Windows: iCloud klasörü yok', () => {
  const r = findICloudDir({ home: 'C:\\Users\\x', platform: 'win32' });
  assert.equal(r.path, null);
});

// --- Başlık dosyası güvenlik kapısından geçiyor mu? ------------------------

test('başlık dosyası izinli adlar listesinde (yoksa Mac’te yazılamazdı)', () => {
  assert.ok(SYNC_NAMES.has(SYNC_HEAD));
  assert.equal(syncPath('/tmp/k', SYNC_HEAD), '/tmp/k/' + SYNC_HEAD);
});

test('izinsiz ad hâlâ reddediliyor', () => {
  assert.throws(() => syncPath('/tmp/k', 'hastalar.json'), /Eşitleme dosyası değil/);
});

// --- "Değişmedi" kısa yolu -------------------------------------------------
// Bu kısa yolun VAR OLMA SEBEBİ ölçüm: doktorun 100.722 kayıtlık
// veritabanında tam tur 5,5 sn CPU + 40,6 MB yazma, parmak izi sorgusu 19 ms.
// Dakikada bir tam tur, pili ve iCloud kotasını boşa yakardı.
//
// GERÇEK sql.js veritabanı kullanılıyor: applyMergedState her yazmayı geri
// okuyup doğruluyor, bu yüzden sahte bir yürütücü bu yolu hiç sınayamaz.

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

function memStore() {
  const files = new Map();
  return {
    files,
    reads: [],
    async read(n) { this.reads.push(n); return files.has(n) ? files.get(n) : null; },
    async write(n, t) { files.set(n, String(t)); },
    async rename(a, b) { files.set(b, files.get(a)); files.delete(a); },
    async remove(n) { files.delete(n); },
  };
}

const BASE = { start_date: '2026-08-01' };

test('parmak izi: aynı veri aynı özeti, değişen veri farklı özeti verir', async () => {
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ali' });
  const first = await syncFingerprint(x);
  assert.equal(await syncFingerprint(x), first, 'saf: değişmeden iki kez aynı');
  await addPatient(x, { ...BASE, name: 'Veli' });
  assert.notEqual(await syncFingerprint(x), first, 'yeni kayıt özeti değiştirir');
});

test('başlık yazılır ve asıl dosyayla AYNI damgayı taşır', async () => {
  const store = memStore();
  const state = {
    patients: [{ uuid: 'u1', name: 'Ali', start_date: '2026-01-01', updated_at: '2026-01-01T00:00:00Z' }],
    payments: [], deliveries: [], deletions: [],
  };
  const w = await writeRemoteState(store, state, 'fp-1');
  const head = await readRemoteHead(store);
  assert.equal(head.written_at, w.written_at);
  assert.equal(head.fingerprint, 'fp-1');
  assert.equal(head.counts.patients, 1);
  assert.ok(!store.files.has(SYNC_TMP), 'geçici dosya rename ile tüketildi');
  assert.ok(store.files.has(SYNC_FILE));
});

test('bozuk/eksik başlık TAM tura zorlar (hata modu güvenli tarafta)', async () => {
  const store = memStore();
  assert.equal(await readRemoteHead(store), null, 'dosya yok');
  await store.write(SYNC_HEAD, '{yarım');
  assert.equal(await readRemoteHead(store), null, 'bozuk JSON');
  await store.write(SYNC_HEAD, JSON.stringify({ app: 'başka-uygulama', written_at: 'x' }));
  assert.equal(await readRemoteHead(store), null, 'yabancı dosya');
});

test('hiçbir şey değişmemişse ikinci tur 40 MB’a DOKUNMADAN atlanır', async () => {
  resetSyncMemory();
  const store = memStore();
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ali' });

  const first = await syncNow(x, { folder: store });
  assert.ok(!first.skipped && !first.error, `ilk tur tam olmalı: ${JSON.stringify(first)}`);

  store.reads.length = 0;
  const second = await syncNow(x, { folder: store });
  assert.equal(second.skipped, true);
  assert.equal(second.reason, 'unchanged');
  assert.deepEqual(store.reads, [SYNC_HEAD],
    'yalnızca küçük başlık okundu; asıl eşitleme dosyasına hiç dokunulmadı');
});

test('yerelde değişiklik varsa kısa yol DEVREYE GİRMEZ', async () => {
  resetSyncMemory();
  const store = memStore();
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ali' });
  await syncNow(x, { folder: store });

  await addPatient(x, { ...BASE, name: 'Veli' });
  store.reads.length = 0;
  const r = await syncNow(x, { folder: store });
  assert.ok(!r.skipped, `yeni hasta karşıya gitmeli: ${JSON.stringify(r)}`);
  assert.ok(store.reads.includes(SYNC_FILE), 'tam tur asıl dosyayı okur');
  const remote = await readRemoteState(store);
  assert.deepEqual(remote.patients.map(p => p.name).sort(), ['Ali', 'Veli']);
});

test('karşı cihaz yazdıysa kısa yol DEVREYE GİRMEZ ve kayıt BU cihaza iner', async () => {
  resetSyncMemory();
  const store = memStore();
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ali' });
  await syncNow(x, { folder: store });

  // Diğer cihaz kendi turunu yaptı: asıl dosya ve başlık yenilendi.
  const remoteNow = await readRemoteState(store);
  await writeRemoteState(store, {
    ...remoteNow,
    patients: [
      ...remoteNow.patients,
      { uuid: 'u-diger', name: 'Zeynep', start_date: '2026-03-03', status: 'active', updated_at: '2026-03-03T00:00:00Z' },
    ],
  }, 'diger-cihaz-parmak-izi');

  const r = await syncNow(x, { folder: store });
  assert.ok(!r.skipped, `karşıdan gelen kayıt atlanamaz: ${JSON.stringify(r)}`);
  const local = await x.query('SELECT name FROM patients ORDER BY name');
  assert.deepEqual(local.map(p => p.name), ['Ali', 'Zeynep'],
    'iPhone’da girilen hasta Mac’te belirir (ve tersi)');
});

test('force: elle "Şimdi Eşitle" kısa yolu daima atlar', async () => {
  resetSyncMemory();
  const store = memStore();
  const x = await db();
  await addPatient(x, { ...BASE, name: 'Ali' });
  await syncNow(x, { folder: store });
  const r = await syncNow(x, { folder: store, force: true });
  assert.ok(!r.skipped, 'kullanıcı bir sonuç bekliyor');
});

// --- Hata metni ------------------------------------------------------------

test('eski yapıda eklenti yoksa "güncelleyin" denir, ham hata değil', () => {
  assert.match(iCloudErrorText(new Error('ICloudSync does not have an implementation')), /güncelleyin/);
  assert.match(iCloudErrorText(new Error('not implemented on ios')), /güncelleyin/);
});

test('bilinmeyen hata olduğu gibi aktarılır (yutulmaz)', () => {
  assert.equal(iCloudErrorText(new Error('disk dolu')), 'disk dolu');
});
