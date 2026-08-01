import { Capacitor } from '@capacitor/core';
import { leadToAlerts } from './calendar-util.js';

// Device calendar integration (native only). Uses @ebarooni/capacitor-calendar.
// Every export is safe to call on web (no-op) and never throws — a calendar
// failure must never block a DB write.

export { leadToAlerts };

function isNative() { return Capacitor.isNativePlatform(); }

export async function requestCalendarPermission() {
  if (!isNative()) return false;
  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    const r = await CapacitorCalendar.requestFullCalendarAccess();
    return r.result === 'granted';
  } catch { return false; }
}

// Create (id falsy) or update (id given) an event. Returns the event id string, or null on any failure.
// remindMin: the in-app reminder lead (minutes before start; 0 = at start; null/undefined = no reminder).
// Converted to the plugin's `alerts` shape via leadToAlerts(); omitted entirely when empty, since some
// platforms may not like being handed an empty alerts array.
export async function upsertEvent({ id, title, startMs, endMs, notes, remindMin }) {
  if (!isNative()) return null;
  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    const perm = await CapacitorCalendar.requestFullCalendarAccess();
    if (perm.result !== 'granted') return null;

    const alerts = leadToAlerts(remindMin);

    if (id) {
      await CapacitorCalendar.modifyEvent({
        id: String(id),
        title,
        startDate: startMs,
        endDate: endMs,
        description: notes,
        ...(alerts.length ? { alerts } : {}),
      });
      return String(id);
    }

    let calendarId;
    try {
      const def = await CapacitorCalendar.getDefaultCalendar();
      calendarId = def.result ? def.result.id : undefined;
    } catch { /* fall through without calendarId */ }

    const created = await CapacitorCalendar.createEvent({
      title,
      startDate: startMs,
      endDate: endMs,
      description: notes,
      calendarId,
      ...(alerts.length ? { alerts } : {}),
    });
    return created.id || null;
  } catch { return null; }
}

export async function deleteEvent(id) {
  if (!isNative() || !id) return;
  try {
    const { CapacitorCalendar } = await import('@ebarooni/capacitor-calendar');
    await CapacitorCalendar.deleteEvent({ id: String(id) });
  } catch {}
}
