// Browser-preview adapter: in-memory sql.js, NOT persistent.
// Used only when Capacitor reports a non-native platform (dev preview).
import initSqlJs from 'sql.js';

export async function openWebDb() {
  const SQL = await initSqlJs({ locateFile: f => `assets/${f}` });
  const db = new SQL.Database();
  return {
    async run(sql, params = []) { db.run(sql, params); return { changes: db.getRowsModified() }; },
    async query(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
  };
}
