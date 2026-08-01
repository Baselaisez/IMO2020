// Pure helpers for calendar.js, kept in their own module so tests can import
// them without pulling in @capacitor/core (which calendar.js imports at top
// level and which breaks under plain `node --test`).

// Converts an in-app reminder lead (minutes before the event, as stored in
// appt_remind_min / remind_min) into the `alerts` array shape expected by
// @ebarooni/capacitor-calendar's createEvent/modifyEvent: minutes RELATIVE TO
// EVENT START, negative = before start.
//   null/undefined/'' -> [] (no native alert)
//   0                 -> [0]  ("Saatinde" — at start)
//   n                 -> [-Math.abs(n)]
export function leadToAlerts(remindMin) {
  if (remindMin === null || remindMin === undefined || remindMin === '') return [];
  const n = Number(remindMin);
  if (!Number.isFinite(n)) return [];
  if (n === 0) return [0];
  return [-Math.abs(n)];
}
