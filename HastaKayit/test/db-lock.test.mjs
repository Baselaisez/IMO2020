import test from 'node:test';
import assert from 'node:assert/strict';
import { withTx, runQueued, checkpointWal, setMeta, getMeta, initSchema } from '../src/js/repo.js';
import { isBusyError } from '../src/js/db-capacitor.js';

// Samsung'da görülen hata:
//     PIN doğrulama hatası — Run: database is locked (code 5)
//
// Sebep: withTx yalnızca TRANSACTION'ları sıraya sokuyordu. Transaction'ın
// dışında kalan çıplak bir yazma (setMeta) kuyruğu görmüyordu ve açık bir
// transaction varken çalıştığında SQLITE_BUSY alıyordu.
//
// Masaüstündeki sql.js senkron olduğu için bu yarış orada OLUŞMAZ; bu yüzden
// hatayı yakalayan test, YERLİ köprünün davranışını taklit etmek zorunda:
// her çağrı gerçek bir async sınırı ve transaction açıkken gelen yabancı
// ifade reddediliyor.

function nativeLikeDb({ strict = true } = {}) {
  let inTx = false;
  const log = [];
  const tick = () => new Promise(r => setTimeout(r, 0)); // gerçek async sınır
  const exec = async (sql) => {
    await tick();
    const head = String(sql).trim().split(/\s+/)[0].toUpperCase();
    if (head === 'BEGIN') {
      if (inTx) throw new Error('Run: cannot start a transaction within a transaction (code 1)');
      inTx = true; log.push('BEGIN'); return;
    }
    if (head === 'COMMIT' || head === 'ROLLBACK') { inTx = false; log.push(head); return; }
    // Transaction açıkken gelen ifade: gerçek cihazda SQLITE_BUSY.
    if (inTx && strict) throw new Error('Run: database is locked (code 5)');
    log.push(head);
  };
  return {
    log,
    isInTx: () => inTx,
    async run(sql) { await exec(sql); return { changes: 0 }; },
    async query(sql) { await exec(sql); return []; },
  };
}

test('isBusyError: eklentinin sarmaladığı mesajı tanır', () => {
  assert.equal(isBusyError(new Error('Run: database is locked (code 5)')), true);
  assert.equal(isBusyError(new Error('SQLITE_BUSY')), true);
  assert.equal(isBusyError(new Error('no such table: patients')), false);
  assert.equal(isBusyError(null), false);
});

test('HATA ÜRETİMİ: çıplak yazma, açık transaction varken patlıyordu', async () => {
  const x = nativeLikeDb();
  // Transaction'ı başlat ama bitirme; bu arada çıplak bir yazma dene.
  const tx = withTx(x, async () => { await new Promise(r => setTimeout(r, 20)); });
  await new Promise(r => setTimeout(r, 5)); // BEGIN çalışsın
  await assert.rejects(
    () => x.run("INSERT INTO meta (key,value) VALUES ('a','b')"),
    /database is locked/,
    'eski davranış: transaction açıkken çıplak yazma SQLITE_BUSY alır'
  );
  await tx;
});

test('DÜZELTME: runQueued transaction bitene kadar bekler', async () => {
  const x = nativeLikeDb();
  const tx = withTx(x, async () => { await new Promise(r => setTimeout(r, 20)); });
  await new Promise(r => setTimeout(r, 5));
  await runQueued(x, "INSERT INTO meta (key,value) VALUES ('a','b')"); // patlamamalı
  await tx;
  assert.deepEqual(x.log, ['BEGIN', 'COMMIT', 'INSERT'], 'yazma COMMIT sonrasına alındı');
});

test('DÜZELTME: setMeta artık transaction ortasında patlamıyor', async () => {
  const x = nativeLikeDb();
  const tx = withTx(x, async () => { await new Promise(r => setTimeout(r, 20)); });
  await new Promise(r => setTimeout(r, 5));
  await setMeta(x, 'fail_count', '1'); // PIN sayacının yazdığı yol
  await tx;
  assert.equal(x.isInTx(), false);
});

test('DÜZELTME: WAL katlama da kuyruğa giriyor', async () => {
  const x = nativeLikeDb();
  const tx = withTx(x, async () => { await new Promise(r => setTimeout(r, 20)); });
  await new Promise(r => setTimeout(r, 5));
  await checkpointWal(x); // lock.js'in arka plana geçerken çağırdığı yol
  await tx;
  assert.deepEqual(x.log, ['BEGIN', 'COMMIT', 'PRAGMA']);
});

test('PIN sayacı + eşitleme transaction’ı aynı anda: ikisi de tamamlanır', async () => {
  const x = nativeLikeDb();
  // Gerçek senaryo: doktor yanlış PIN giriyor, tam o sırada arka planda
  // eşitleme/otomatik kayıt transaction'ı açık.
  const results = await Promise.allSettled([
    withTx(x, async () => { await new Promise(r => setTimeout(r, 15)); }),
    setMeta(x, 'fail_count', '1'),
    setMeta(x, 'locked_until', '0'),
    checkpointWal(x),
  ]);
  assert.deepEqual(results.map(r => r.status), ['fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
});

test('sıralama korunuyor: aynı anahtara arka arkaya yazma', async () => {
  const x = nativeLikeDb();
  await Promise.all([setMeta(x, 'k', '1'), setMeta(x, 'k', '2'), setMeta(x, 'k', '3')]);
  assert.deepEqual(x.log, ['INSERT', 'INSERT', 'INSERT']);
});

test('transaction içindeki yazmalar kuyruğa GİRMEZ (kilitlenme olmaz)', async () => {
  // strict=false: burada ölçtüğümüz şey BUSY değil, KİLİTLENME. withTx geri
  // çağrısı içinde runQueued kullanılsaydı kuyruk zaten o transaction'da
  // olduğu için bu test süresiz asılı kalırdı.
  const x = nativeLikeDb({ strict: false });
  const r = await withDeadline(
    withTx(x, async () => { await x.run('UPDATE patients SET name=?'); return 'bitti'; }),
    'transaction içi yazma');
  assert.equal(r, 'bitti');
  assert.deepEqual(x.log, ['BEGIN', 'UPDATE', 'COMMIT']);
});

// Kilitlenmeyi başarısızlığa çevirir: aksi hâlde test süresiz asılı kalır ve
// "kilitlendi" ile "yavaş" birbirine karışır.
function withDeadline(p, what, ms = 2000) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`KİLİTLENDİ: ${what}`)), ms)),
  ]);
}

test('KURTARMA AKIŞLARI KİLİTLENMİYOR: setMeta transaction içinde kuyruğa girmemeli', async () => {
  // setMeta'yı kuyruğa alırken bu üç akış gözden kaçsaydı doktor PIN'ini
  // unuttuğunda kurtarma ekranı sonsuza kadar donardı.
  const { setSecurityQuestions, setRecoveryCode, resetPinAfterRecovery } =
    await import('../src/js/pin-recovery.js');
  const mk = () => {
    const store = new Map();
    return {
      async run(sql, p = []) {
        await new Promise(r => setTimeout(r, 0));
        if (/INSERT INTO meta/.test(sql)) store.set(p[0], p[1]);
        return { changes: 1 };
      },
      async query(sql, p = []) {
        await new Promise(r => setTimeout(r, 0));
        if (/SELECT value FROM meta/.test(sql)) return store.has(p[0]) ? [{ value: store.get(p[0]) }] : [];
        return [];
      },
      store,
    };
  };

  const a = mk();
  await withDeadline(setSecurityQuestions(a, [
    { q: 'İlk okulunuz?', a: 'Atatürk' }, { q: 'İlk eviniz?', a: 'Kartal' },
  ]), 'setSecurityQuestions');
  assert.ok(a.store.has('sq1_hash'));

  const b = mk();
  const code = await withDeadline(setRecoveryCode(b), 'setRecoveryCode');
  assert.ok(String(code).length > 0);
  assert.ok(b.store.has('rc_hash'));

  const c = mk();
  await withDeadline(resetPinAfterRecovery(c, '1234'), 'resetPinAfterRecovery');
  assert.ok(c.store.has('pin_hash'));
  assert.equal(c.store.get('fail_count'), '0');
});

test('KAYNAK DENETİMİ: withTx içinde kuyruğa giren setMeta/runQueued kullanılmamalı', async () => {
  // Bu kuralı yoruma yazmak yetmez; kuralı bozan bir satır testte düşsün.
  const { readdirSync, readFileSync } = await import('node:fs');
  const files = readdirSync('src/js').filter(f => f.endsWith('.js'));
  const suçlular = [];
  for (const f of files) {
    const src = readFileSync(`src/js/${f}`, 'utf8').split('\n');
    const inside = new Array(src.length).fill(null);
    let i = 0;
    while (i < src.length) {
      if (src[i].includes('withTx(')) {
        let depth = 0, started = false, j = i;
        const start = i;
        while (j < src.length) {
          depth += (src[j].match(/\(/g) || []).length - (src[j].match(/\)/g) || []).length;
          inside[j] = start + 1;
          if (started && depth <= 0) break;
          if (depth > 0) started = true;
          j++;
        }
        i = j;
      }
      i++;
    }
    src.forEach((line, n) => {
      if (inside[n] && /\b(await\s+setMeta|runQueued)\s*\(/.test(line) && !/setMetaIn/.test(line)) {
        suçlular.push(`${f}:${n + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(suçlular, [],
    'withTx içinde kuyruğa giren çağrı kilitlenme demektir — setMetaIn kullanın');
});

test('gerçek şema bu köprüde de kurulabiliyor (regresyon)', async () => {
  // strict=false: şema kurulumu transaction kullanmıyor, burada yalnızca
  // setMeta'nın kuyruk değişikliğinin açılışı bozmadığını doğruluyoruz.
  const x = nativeLikeDb({ strict: false });
  x.query = async (sql) => {
    const s = String(sql);
    if (/schema_version/.test(s)) return [];
    if (/SELECT value FROM meta/.test(s)) return [];
    return [];
  };
  await initSchema(x);
  assert.ok(x.log.includes('CREATE'), 'tablolar oluşturuldu');
});

test('setMeta/getMeta çifti normal (sql.js benzeri) köprüde çalışmaya devam ediyor', async () => {
  const store = new Map();
  const x = {
    async run(sql, p = []) {
      if (/INSERT INTO meta/.test(sql)) store.set(p[0], p[1]);
      return { changes: 1 };
    },
    async query(sql, p = []) {
      if (/SELECT value FROM meta/.test(sql)) {
        return store.has(p[0]) ? [{ value: store.get(p[0]) }] : [];
      }
      return [];
    },
  };
  await setMeta(x, 'lock_policy', '5');
  assert.equal(await getMeta(x, 'lock_policy'), '5');
});
