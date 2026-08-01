import { Capacitor } from '@capacitor/core';
import { humanizeLead } from './compute.js';

// Pure: given data + current time, produce the notifications to schedule.
// ids: appointment = patientId*10+1, delivery = deliveryId*10+2, payment = paymentId*10+3 (disjoint id spaces).
export function buildSchedule(patients, deliveries, payments, nowMs) {
  const nameById = Object.fromEntries(patients.map(p => [p.id, p.name]));
  const out = [];
  for (const p of patients) {
    if (p.status !== 'active' || !p.next_appt) continue;
    const lead = Number(p.appt_remind_min) || 0;
    const ev = Date.parse(String(p.next_appt).replace(' ', 'T'));
    const at = ev - lead * 60000;
    if (Number.isFinite(at) && at > nowMs) {
      const h = humanizeLead(lead);
      const body = h ? `${h} ${p.name} isimli hastanızın randevusu var`
                     : `Bugün ${String(p.next_appt).slice(11, 16)} — ${p.name} randevusu`;
      out.push({ id: p.id * 10 + 1, atMs: at, title: 'Randevu', body });
    }
  }
  for (const d of deliveries) {
    if (Number(d.delivered) === 1 || !d.planned_date) continue;
    const t = d.planned_time || '09:00';
    const ev = Date.parse(d.planned_date + 'T' + t + ':00');
    const lead = Number(d.remind_min) || 0;
    const at = ev - lead * 60000;
    if (Number.isFinite(at) && at > nowMs) {
      const h = humanizeLead(lead);
      const name = nameById[d.patient_id] || '';
      const verb = d.method === 'elden' ? 'paket teslim almaya gelecek' : 'paket teslimi';
      const body = h ? `${h} ${name} ${verb}` : `Bugün ${name} ${verb}`;
      out.push({ id: d.id * 10 + 2, atMs: at, title: 'Paket Teslimi', body });
    }
  }
  for (const o of payments || []) {
    if ((o.status || 'paid') !== 'pending' || !o.pay_date) continue;
    const at = Date.parse(o.pay_date + 'T09:00:00');
    if (Number.isFinite(at) && at > nowMs) {
      out.push({ id: o.id * 10 + 3, atMs: at, title: 'Ödeme', body: `Bugün ${nameById[o.patient_id] || ''} ödeme günü` });
    }
  }
  return out;
}

function isNative() { return Capacitor.isNativePlatform(); }

export async function requestNotifyPermission() {
  if (!isNative()) return false;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const r = await LocalNotifications.requestPermissions();
    return r.display === 'granted';
  } catch { return false; }
}

// Android 8+ ses/görünürlük kanal başına ayarlanır. İki kanal önceden oluşturulur:
// biri sesli+heads-up (importance 4), biri sessiz-sadece-yazı (importance 2).
// Best-effort: web/preview'da ve zaten var olan kanallarda no-op, asla fırlatmaz.
//
// iOS'ta bildirim kanalı DİYE BİR ŞEY YOKTUR: ses, önizleme ve rahatsız etmeme
// davranışı uygulama başına iOS Ayarlar → Bildirimler → Hasta Kayıt altından
// yönetilir. Bu yüzden çağrı iOS'ta hiç yapılmaz ve uygulama içindeki
// "sesli/sessiz" seçeneği iPhone'da gizlenir (bkz. ui-settings.js) — çalışmayan
// bir düğme göstermek, yanlış bir söz vermektir.
export async function ensureChannels() {
  if (!isNative() || Capacitor.getPlatform() !== 'android') return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    await LocalNotifications.createChannel({ id: 'rem_loud', name: 'Hatırlatmalar (sesli)', importance: 4, visibility: 1, vibration: true });
    await LocalNotifications.createChannel({ id: 'rem_silent', name: 'Hatırlatmalar (sessiz)', importance: 2, visibility: 1, vibration: false });
  } catch (e) { console.error('ensureChannels', e); }
}

// Module-level pref: which channel newly scheduled notifications use.
// Default sesli (true) — matches "meta unset → on" behavior in app startup.
let soundOn = true;
export function setNotifSound(on) { soundOn = on !== false && on !== 'off'; }

// Cancel all app-owned notifications and reschedule from current data.
// Idempotent: safe after every mutation. Silent if permission denied.
export async function rescheduleNotifications(patients, deliveries, payments) {
  if (!isNative()) return;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications && pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    }
    const channelId = soundOn ? 'rem_loud' : 'rem_silent';
    const items = buildSchedule(patients, deliveries, payments, Date.now()).map(s => ({
      id: s.id, title: s.title, body: s.body, channelId, schedule: { at: new Date(s.atMs), allowWhileIdle: true },
    }));
    if (items.length) await LocalNotifications.schedule({ notifications: items });
  } catch (e) { console.error('reschedule', e); }
}
