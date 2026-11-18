import { db } from './database.js';
import { fail, reservationPage } from './booking.js';
import { allowedBookingKinds } from './staffAccess.js';
import { notificationConfig } from './notificationConfig.js';

export function notificationHistory(query, staff) {
  const { search = '', channel = '', department = '' } = query;
  if (typeof search !== 'string' || search.length > 100 || !['','email','whatsapp'].includes(channel)
    || !['','rooms','dining','events'].includes(department)) fail('Choose a valid notification filter.');
  const kinds = allowedBookingKinds(staff);
  const limit = 25, page = reservationPage(query.page, limit);
  const where = `WHERE j.department IN (${kinds.map(() => '?').join(',')})
    AND (?='' OR j.department=?) AND (?='' OR j.channel=?) AND (?='' OR instr(lower(j.reference),?)>0)`;
  const needle = search.trim().toLowerCase();
  const fields = [...kinds, department, department, channel, channel, needle, needle];
  const total = db.prepare(`SELECT COUNT(*) AS count FROM guest_notifications j ${where}`).get(...fields).count;
  const items = db.prepare(`
    SELECT j.id, j.reference, j.department, j.event, j.channel, coalesce(r.status, j.status) AS status,
      j.reason, j.due_at AS dueAt, j.created_at AS createdAt, coalesce(r.occurred_at,j.updated_at) AS updatedAt, j.attempts
    FROM guest_notifications j LEFT JOIN notification_receipts r ON r.channel=j.channel AND r.provider_id=j.provider_id
    ${where} ORDER BY j.created_at DESC, j.rowid DESC LIMIT ? OFFSET ?
  `).all(...fields, limit, (page - 1) * limit);
  const config = notificationConfig();
  return { items, total, pages: Math.ceil(total / limit), departments: kinds,
    channels: { email: config.email.enabled, whatsapp: config.whatsapp.enabled } };
}
