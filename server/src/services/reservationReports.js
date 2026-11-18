import { departmentLabels, reportDefinitions } from '../../../shared/reservationReports.mjs';
import { db } from './database.js';
import { fail, validDate } from './booking.js';
import { currentStatus } from './hospitality.js';

const dayMs = 86400000;
const bookedRoomStates = new Set(['confirmed', 'checked_in', 'completed']);
const bookedHospitalityStates = new Set(['confirmed', 'seated', 'in_progress', 'completed', 'no_show']);
const istTimestamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
});

function reportRange({ from, to }) {
  if (!validDate(from) || !validDate(to) || to < from || Date.parse(to) - Date.parse(from) > 365 * dayMs) {
    fail('Choose a valid report period of 1 to 366 days.');
  }
  return {
    from,
    to,
    first: new Date(`${from}T00:00:00+05:30`).toISOString(),
    last: new Date(`${to}T23:59:59.999+05:30`).toISOString(),
  };
}

function roomOccupancy(roomRows, { from, to }) {
  const inventory = db.prepare('SELECT COALESCE(SUM(inventory),0) AS count FROM rooms').get().count;
  const maintenance = db.prepare('SELECT starts, ends FROM room_maintenance WHERE starts<=? AND ends>?').all(to, from);
  const changes = new Map();
  function add(start, end, field, count) {
    const first = start < from ? from : start;
    if (!changes.has(first)) changes.set(first, {});
    if (!changes.has(end)) changes.set(end, {});
    changes.get(first)[field] = (changes.get(first)[field] || 0) + count;
    changes.get(end)[field] = (changes.get(end)[field] || 0) - count;
  }
  for (const row of roomRows) {
    if (bookedRoomStates.has(row.status)) add(row.check_in, row.check_out, 'booked', row.quantity);
    if (row.status === 'pending') add(row.check_in, row.check_out, 'pending', row.quantity);
  }
  for (const block of maintenance) add(block.starts, block.ends, 'blocked', 1);
  const counts = { booked: 0, pending: 0, blocked: 0 };
  const days = [];
  for (let day = Date.parse(from); day <= Date.parse(to); day += dayMs) {
    const date = new Date(day).toISOString().slice(0, 10);
    for (const [key, delta] of Object.entries(changes.get(date) ?? {})) counts[key] += delta;
    const sellable = Math.max(0, inventory - counts.blocked);
    days.push({ date, inventory, sellable, ...counts, percent: sellable ? counts.booked * 100 / sellable : null });
  }
  return days;
}

export function reservationReports(query) {
  const range = reportRange(query);
  const { from, to, first, last } = range;
  db.exec('BEGIN');
  try {
    const asOf = Date.now();
    const roomRows = db.prepare(`
      SELECT reference, room_name, name, check_in, check_out, quantity, guests, status, total FROM bookings
      WHERE status IN ('pending','confirmed','checked_in','completed') AND check_in<=? AND check_out>?
      ORDER BY check_in, reference
    `).all(to, from);
    const arrivals = roomRows.filter(row => row.check_in >= from).map(row => ({
      checkIn: row.check_in, checkOut: row.check_out, reference: row.reference, guest: row.name,
      room: row.room_name, quantity: row.quantity, guests: row.guests, status: row.status,
    }));
    const occupancy = roomOccupancy(roomRows, range);

    const hospitality = db.prepare(`
      SELECT r.reference, r.kind, r.status, r.hold_until, r.total, r.paid, r.data,
        COALESCE((SELECT SUM(p.amount) FROM hospitality_payments p WHERE p.reservation_id=r.id),0) AS verified
      FROM hospitality_reservations r WHERE json_extract(r.data,'$.date') BETWEEN ? AND ?
      ORDER BY json_extract(r.data,'$.date'), json_extract(r.data,'$.time'), r.reference
    `).all(from, to);
    const reservationValue = {
      rooms: roomRows.filter(row => row.check_in >= from && bookedRoomStates.has(row.status)).reduce((total, row) => total + row.total, 0),
      dining: 0,
      events: 0,
    };
    const outstanding = [];
    for (const row of hospitality) {
      const status = currentStatus(row, asOf);
      if (bookedHospitalityStates.has(status)) reservationValue[row.kind] += row.total;
      const balance = Math.max(0, row.total - row.verified);
      if (!balance || !['pending_payment', 'payment_review'].includes(status)) continue;
      const { date, name, resourceName } = JSON.parse(row.data);
      outstanding.push({ serviceDate: date, reference: row.reference, department: row.kind, guest: name,
        resource: resourceName, status, total: row.total, verified: row.verified, balance });
    }

    const verifiedPayments = { dining: 0, events: 0 };
    for (const row of db.prepare(`
      SELECT r.kind, SUM(p.amount) AS amount FROM hospitality_payments p
      JOIN hospitality_reservations r ON r.id=p.reservation_id
      WHERE p.created_at BETWEEN ? AND ? GROUP BY r.kind
    `).all(first, last)) verifiedPayments[row.kind] = row.amount;

    const roomCancellations = db.prepare(`
      SELECT updated_at AS changedAt,check_in AS serviceDate,reference,'rooms' AS department,
        name AS guest,room_name AS resource,status,total
      FROM bookings WHERE status='cancelled' AND updated_at BETWEEN ? AND ?
    `).all(first, last);
    const eventDeclines = db.prepare(`
      SELECT updated_at AS changedAt,json_extract(data,'$.date') AS serviceDate,reference,kind AS department,
        json_extract(data,'$.name') AS guest,json_extract(data,'$.resourceName') AS resource,status,total
      FROM hospitality_reservations WHERE kind='events' AND status='declined' AND updated_at BETWEEN ? AND ?
    `).all(first, last);
    const cancellations = [...roomCancellations, ...eventDeclines]
      .sort((a, b) => b.changedAt.localeCompare(a.changedAt) || a.reference.localeCompare(b.reference));
    const nights = occupancy.reduce((total, day) => ({
      booked: total.booked + day.booked, sellable: total.sellable + day.sellable, pending: total.pending + day.pending,
    }), { booked: 0, sellable: 0, pending: 0 });

    const result = {
      from, to, generatedAt: new Date(asOf).toISOString(),
      totals: {
        reservationValue: { ...reservationValue, total: reservationValue.rooms + reservationValue.dining + reservationValue.events },
        verifiedPayments: { ...verifiedPayments, total: verifiedPayments.dining + verifiedPayments.events },
        outstanding: outstanding.reduce((sum, row) => sum + row.balance, 0),
        occupancy: { ...nights, percent: nights.sellable ? nights.booked * 100 / nights.sellable : null },
      },
      reports: { arrivals, occupancy, cancellations, outstanding },
    };
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function csvCell(value, format) {
  if (value === null || value === undefined) return '';
  if (format === 'money') return (value / 100).toFixed(2);
  if (format === 'percent') return value.toFixed(1);
  if (typeof value === 'number') return String(value);
  let text = format === 'timestamp' ? istTimestamp.format(new Date(value)) + ' IST'
    : format === 'department' ? departmentLabels[value]
      : format === 'status' ? value.replaceAll('_', ' ') : String(value);
  if (/^[\s\uFEFF]*[=+@\-＝＋＠－]/u.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}

export function reportCsv(type, query) {
  if (!Object.hasOwn(reportDefinitions, type)) fail('Report not found.', 404);
  const { columns } = reportDefinitions[type];
  const { from, to, reports } = reservationReports(query);
  const rows = [
    columns.map(([, label]) => csvCell(label)).join(','),
    ...reports[type].map(row => columns.map(([key, , format]) => csvCell(row[key], format)).join(',')),
  ];
  return { filename: `pratap-palace-${type}-${from}-to-${to}.csv`, text: '\uFEFF' + rows.join('\r\n') + '\r\n' };
}
