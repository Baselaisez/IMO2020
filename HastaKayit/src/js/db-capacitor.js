import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

export async function openNativeDb() {
  const sqlite = new SQLiteConnection(CapacitorSQLite);

  // iOS'ta eklenti açık bağlantıları native tarafta bir sözlükte tutar. WKWebView
  // yeniden yüklendiğinde (bellek baskısı sonrası restore, canlı yeniden yükleme)
  // JS tarafı sıfırlanır ama o sözlük ayakta kalır; ardından gelen
  // createConnection "Connection already exists" ile patlar ve uygulama hiç
  // açılmaz. Bu iki çağrı sözlüğü JS tarafıyla eşitler. Android'de zararsızdır.
  await sqlite.checkConnectionsConsistency().catch(() => {});
  const already = await sqlite.isConnection('hastakayit', false).catch(() => ({ result: false }));

  const db = already?.result
    ? await sqlite.retrieveConnection('hastakayit', false)
    : await sqlite.createConnection('hastakayit', false, 'no-encryption', 1, false);
  if (!(await db.isDBOpen()).result) await db.open();

  // query, not execute: this PRAGMA returns a result row and Android's execSQL rejects row-returning statements
  await db.query('PRAGMA journal_mode=WAL;');
  // Kilit varsa HEMEN hata vermek yerine 5 sn bekle. Asıl düzeltme yazmaları
  // sıraya sokmak (repo.runQueued); bu ikinci emniyet, gözden kaçan bir
  // yarışta uygulamanın kullanıcıya hata göstermek yerine beklemesini sağlar.
  await db.query('PRAGMA busy_timeout=5000;').catch(() => {});

  return {
    // transaction=false: repo.js withTx manages BEGIN/COMMIT itself
    async run(sql, params = []) {
      const r = await withBusyRetry(() => db.run(sql, params, false), sql);
      return { changes: r.changes?.changes ?? 0 };
    },
    async query(sql, params = []) {
      const r = await withBusyRetry(() => db.query(sql, params), sql);
      return r.values ?? [];
    },
  };
}

/** SQLITE_BUSY mi? Eklenti hatayı "Run: database is locked (code 5)" gibi
 *  sarmalayarak veriyor, o yüzden metne bakıyoruz. Saf. */
export function isBusyError(err) {
  const m = String(err?.message ?? err ?? '').toLowerCase();
  return m.includes('database is locked') || m.includes('code 5') || m.includes('sqlite_busy');
}

// BEGIN/COMMIT/ROLLBACK tekrar DENENMEZ: yarıda kalmış bir transaction'ı
// yeniden başlatmak veriyi bozabilir. Tekrar yalnızca tekil ifadeler için.
const NEVER_RETRY = /^\s*(BEGIN|COMMIT|ROLLBACK)\b/i;
const RETRY_DELAYS_MS = [50, 150, 400];

async function withBusyRetry(fn, sql) {
  let lastErr;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try { return await fn(); } catch (e) {
      lastErr = e;
      if (!isBusyError(e) || NEVER_RETRY.test(String(sql || ''))) throw e;
      if (i === RETRY_DELAYS_MS.length) break;
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[i]));
    }
  }
  throw lastErr;
}
