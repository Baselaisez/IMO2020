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

  return {
    // transaction=false: repo.js withTx manages BEGIN/COMMIT itself
    async run(sql, params = []) {
      const r = await db.run(sql, params, false);
      return { changes: r.changes?.changes ?? 0 };
    },
    async query(sql, params = []) {
      const r = await db.query(sql, params);
      return r.values ?? [];
    },
  };
}
