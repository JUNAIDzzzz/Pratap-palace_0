import { permissions } from '../../../shared/staffAccess.mjs';
import { db } from './database.js';
import { fail, reservationPage, validDate } from './booking.js';
import { allowedBookingKinds } from './staffAccess.js';

function scopeFor(profile) {
  const bookings = allowedBookingKinds(profile);
  const can = permission => profile.permissions.includes(permission);
  return {
    booking: bookings,
    rate: [...(can(permissions.rates) ? ['rooms'] : []), ...(can(permissions.venues) ? ['dining'] : [])],
    offer: can(permissions.offers) ? ['rooms'] : [],
    payment: can(permissions.payments) ? bookings.filter(kind => kind !== 'rooms') : [],
  };
}

export function activityHistory(query, profile) {
  const { category = '', department = '', search = '', from = '', to = '' } = query;
  const scope = scopeFor(profile);
  if (typeof category !== 'string' || (category && !Object.hasOwn(scope, category))) fail('Choose a valid activity type.');
  if (typeof department !== 'string' || (department && !['rooms', 'dining', 'events'].includes(department))) fail('Choose a valid department.');
  if (typeof search !== 'string' || search.length > 100) fail('Search using up to 100 characters.');
  if ((from !== '' && !validDate(from)) || (to !== '' && !validDate(to)) || (from && to && from > to)) fail('Choose a valid date range.');
  const limit = 25, page = reservationPage(query.page, limit);
  const groups = Object.entries(scope).filter(([, departments]) => departments.length);
  const access = groups.map(([, departments]) => `(category=? AND department IN (${departments.map(() => '?').join(',')}))`).join(' OR ');
  const args = groups.flatMap(([type, departments]) => [type, ...departments]);
  const first = from ? new Date(`${from}T00:00:00+05:30`).toISOString() : '';
  const last = to ? new Date(`${to}T23:59:59.999+05:30`).toISOString() : '';
  const needle = search.trim().toLowerCase();
  const filters = `
    WHERE (${access || '0'}) AND (?='' OR category=?) AND (?='' OR department=?)
      AND (?='' OR created_at>=?) AND (?='' OR created_at<=?)
      AND (?='' OR instr(lower(coalesce(actor,'') || ' ' || actor_type || ' ' || target || ' ' || action),?)>0)
  `;
  args.push(category, category, department, department, first, first, last, last, needle, needle);
  const rows = `
    WITH history AS (
      SELECT 0 AS source, id, category, department, actor, actor_type, target, action, changes, created_at FROM activity_log
      UNION ALL
      SELECT 1, a.id,
        CASE WHEN a.action LIKE 'Verified external payment recorded:%' THEN 'payment' ELSE 'booking' END,
        r.kind, a.actor,
        CASE WHEN a.actor='guest' AND (a.action LIKE 'Dining request created%' OR a.action LIKE 'Event enquiry created%' OR a.action LIKE 'Event quote accepted%')
          THEN 'guest' ELSE 'staff' END,
        r.reference, a.action, '[]', a.created_at
      FROM hospitality_audit a JOIN hospitality_reservations r ON r.id=a.reservation_id
    )
  `;
  const total = db.prepare(`${rows} SELECT COUNT(*) AS count FROM history ${filters}`).get(...args).count;
  const items = db.prepare(`
    ${rows} SELECT * FROM history ${filters} ORDER BY created_at DESC, source DESC, id DESC LIMIT ? OFFSET ?
  `).all(...args, limit, (page - 1) * limit).map(row => {
    const payment = row.category === 'payment' && /^Verified external payment recorded: (\d+) paise; (\w+)$/.exec(row.action);
    return {
      id: `${row.source}-${row.id}`,
      category: row.category,
      department: row.department,
      actor: row.actor,
      actorType: row.actor_type,
      target: row.target,
      action: payment ? 'Verified payment recorded' : row.action,
      changes: payment ? [
        { label: 'Amount recorded', value: Number(payment[1]), format: 'money' },
        { label: 'Booking status', value: payment[2], format: 'status' },
      ] : JSON.parse(row.changes),
      createdAt: row.created_at,
    };
  });
  return { items, total, pages: Math.ceil(total / limit), scope };
}
