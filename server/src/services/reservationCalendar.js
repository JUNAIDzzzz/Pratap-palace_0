import { db } from './database.js';
import { fail, validDate } from './booking.js';
import { currentStatus } from './hospitality.js';

export function reservationCalendar({ start, end }, kinds) {
  if (!validDate(start) || !validDate(end) || end < start || Date.parse(end) - Date.parse(start) > 41 * 86400000) {
    fail('Choose a calendar range of 1 to 42 days.');
  }

  const rooms = kinds.includes('rooms') ? db.prepare(`
    SELECT id, reference, room_name, name, check_in, check_out, guests, quantity, status
    FROM bookings WHERE check_in <= ? AND check_out >= ?
    ORDER BY check_in, reference
  `).all(end, start).map(row => ({
    id: row.id,
    kind: 'rooms',
    reference: row.reference,
    resource: row.room_name,
    guest: row.name,
    start: row.check_in,
    end: row.check_out,
    guests: row.guests,
    quantity: row.quantity,
    status: row.status,
  })) : [];

  const hospitalityKinds = kinds.filter(kind => kind !== 'rooms');
  if (!hospitalityKinds.length) return { entries: rooms };
  const hospitality = db.prepare(`
    SELECT id, reference, kind, status, data, paid, hold_until FROM hospitality_reservations
    WHERE kind IN (${hospitalityKinds.map(() => '?').join(', ')}) AND json_extract(data, '$.date') BETWEEN ? AND ?
    ORDER BY json_extract(data, '$.date'), json_extract(data, '$.time'), reference
  `).all(...hospitalityKinds, start, end).map(row => {
    const { date, time, endTime, resourceName, name, guests } = JSON.parse(row.data);
    const status = currentStatus(row);
    return {
      id: row.id,
      kind: row.kind,
      reference: row.reference,
      resource: resourceName,
      guest: name,
      start: date,
      end: date,
      time,
      endTime,
      guests,
      status,
      holdUntil: ['quoted', 'pending_payment'].includes(status) ? row.hold_until : null,
    };
  });

  return { entries: [...rooms, ...hospitality] };
}
