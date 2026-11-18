import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

process.env.DATABASE_PATH = ':memory:';
const { db } = await import('../src/services/database.js');
const { hashPassword } = await import('../src/services/auth.js');
const { createBooking, updateBooking } = await import('../src/services/booking.js');
const { addPhysicalRoom, addMaintenance } = await import('../src/services/housekeeping.js');
const h = await import('../src/services/hospitality.js');
const { default: app } = await import('../src/app.js');

test('reports separate confirmed value, verified receipts, and open balances and export the same date range', async t => {
  db.exec("UPDATE rooms SET inventory=5,active=1,rate=450000 WHERE id='deluxe'");
  const guest = { name: 'Test Guest', email: 'guest@example.test', phone: '+91 90000 00000', guests: 2, acceptPolicies: true };
  const reserveRoom = (checkIn, checkOut, overrides = {}) => createBooking({
    ...guest, roomId: 'deluxe', quantity: 1, expectedTotal: 450000 * (Date.parse(checkOut) - Date.parse(checkIn)) / 86400000,
    checkIn, checkOut, ...overrides,
  }, randomUUID());
  const arrival = reserveRoom('2099-01-02', '2099-01-04', { name: '=2+2, "test"', quantity: 2, expectedTotal: 1800000 });
  updateBooking(arrival.id, 'confirmed');
  const carryIn = reserveRoom('2099-01-01', '2099-01-03');
  updateBooking(carryIn.id, 'confirmed');
  const pending = reserveRoom('2099-01-03', '2099-01-05');
  const cancellation = reserveRoom('2099-01-06', '2099-01-07');
  updateBooking(cancellation.id, 'cancelled');
  const beforePeriod = reserveRoom('2099-01-07', '2099-01-08');
  updateBooking(beforePeriod.id, 'cancelled');
  db.prepare('UPDATE bookings SET updated_at=? WHERE id=?').run('2099-01-01T18:30:00.000Z', cancellation.id);
  db.prepare('UPDATE bookings SET updated_at=? WHERE id=?').run('2099-01-01T18:29:59.999Z', beforePeriod.id);
  const physical = addPhysicalRoom({ number: '101', roomType: 'deluxe' });
  addMaintenance(physical.id, { starts: '2099-01-03', ends: '2099-01-04', reason: 'Test maintenance' });
  const restaurant = h.saveResource('palace-dining', { name: 'Test Restaurant', enabled: true, config: {
    ...h.defaultConfig('dining'), leadHours: 0, tables: [{ id: 'T1', seats: 4 }], rules: 'Test rules', inclusions: 'Test package', pricePerGuest: 150000,
  } });
  const venue = h.saveResource('palace-events', { name: 'Test Venue', enabled: true, config: {
    ...h.defaultConfig('events'), leadHours: 0, layouts: [{ name: 'Banquet', capacity: 10 }], rules: 'Test rules',
  } });
  const reserveDining = date => h.createReservation('dining', {
    ...guest, resourceId: restaurant.id, revision: restaurant.revision, date, time: '19:00', partyType: 'Couple', expectedTotal: 300000,
  }, randomUUID());
  const reserveEvent = date => h.createReservation('events', {
    ...guest, resourceId: venue.id, revision: venue.revision, date, time: '18:00', endTime: '20:00', eventType: 'Test event', layout: 'Banquet',
  }, randomUUID());
  const quote = (event, total) => h.quoteEvent(event.id, { total, terms: 'Test quote' }, 'manager');
  const accept = (event, result) => h.acceptQuote(event.id, event.manageToken, {
    acceptQuote: true, expectedTotal: result.total, issuedAt: result.data.quote.issuedAt,
  });
  const paidTable = reserveDining('2099-01-02');
  h.recordPayment(paidTable.id, { amount: 300000, receipt: 'REPORT-DINING' }, 'manager');
  const partial = reserveDining('2099-01-03');
  h.recordPayment(partial.id, { amount: 100000, receipt: 'REPORT-PARTIAL' }, 'manager');
  const expired = reserveDining('2099-01-04');
  db.prepare('UPDATE hospitality_reservations SET hold_until=? WHERE id IN (?,?)').run(Date.now() - 1, partial.id, expired.id);
  const openEvent = reserveEvent('2099-01-04');
  accept(openEvent, quote(openEvent, 500000));
  const unaccepted = reserveEvent('2099-01-03');
  quote(unaccepted, 600000);
  const paidEvent = reserveEvent('2099-01-05');
  accept(paidEvent, quote(paidEvent, 400000));
  h.recordPayment(paidEvent.id, { amount: 400000, receipt: 'REPORT-EVENT' }, 'manager');
  const declined = reserveEvent('2099-01-06');
  h.changeStatus(declined.id, 'declined', 'manager');
  db.prepare('UPDATE hospitality_reservations SET updated_at=? WHERE id=?').run('2099-01-04T18:29:59.999Z', declined.id);
  const dateReceipt = db.prepare('UPDATE hospitality_payments SET created_at=? WHERE receipt=?');
  dateReceipt.run('2099-01-01T18:30:00.000Z', 'REPORT-DINING');
  dateReceipt.run('2099-01-01T18:29:59.999Z', 'REPORT-PARTIAL');
  dateReceipt.run('2099-01-04T18:29:59.999Z', 'REPORT-EVENT');
  db.prepare('INSERT INTO admins VALUES(?,?)').run('manager', hashPassword('Reports-test-password'));
  db.prepare('INSERT INTO admins VALUES(?,?)').run('desk', hashPassword('Reports-test-password'));
  db.prepare("INSERT INTO staff_accounts VALUES ('desk','reception',1,0,0,0,0)").run();

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.close(); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}/api/admin`;
  const query = 'from=2099-01-02&to=2099-01-04';
  const login = async username => {
    const response = await fetch(base + '/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password: 'Reports-test-password' }) });
    assert.equal(response.status, 200);
    return { Cookie: response.headers.get('set-cookie').split(';')[0] };
  };
  assert.equal((await fetch(`${base}/reports?${query}`)).status, 401);
  const desk = await login('desk');
  assert.equal((await fetch(`${base}/reports?${query}`, { headers: desk })).status, 403);
  assert.equal((await fetch(`${base}/reports/outstanding.csv?${query}`, { headers: desk })).status, 403);
  const headers = await login('manager');
  const response = await fetch(`${base}/reports?${query}`, { headers });
  assert.equal(response.status, 200);
  const model = await response.json();
  assert.deepEqual(model.totals.reservationValue, { rooms: 1800000, dining: 300000, events: 0, total: 2100000 });
  assert.deepEqual(model.totals.verifiedPayments, { dining: 300000, events: 400000, total: 700000 });
  assert.equal(model.totals.outstanding, 700000);
  assert.deepEqual(model.totals.occupancy, { booked: 5, sellable: 14, pending: 2, percent: 500 / 14 });
  assert.deepEqual(model.reports.arrivals.map(row => row.reference), [arrival.reference, pending.reference]);
  assert.deepEqual(model.reports.occupancy.map(({ booked, blocked, pending }) => [booked, blocked, pending]), [[3, 0, 0], [2, 1, 1], [0, 0, 1]]);
  assert.deepEqual(model.reports.cancellations.map(row => row.reference), [declined.reference, cancellation.reference]);
  assert.deepEqual(model.reports.outstanding.map(row => [row.reference, row.status, row.balance]), [
    [partial.reference, 'payment_review', 200000], [openEvent.reference, 'pending_payment', 500000],
  ]);
  assert.equal((await fetch(base + '/reports?from=2099-02-01&to=2099-01-01', { headers })).status, 400);
  for (const type of ['arrivals', 'occupancy', 'cancellations', 'outstanding']) {
    const csv = await fetch(`${base}/reports/${type}.csv?${query}`, { headers });
    assert.equal(csv.status, 200);
    assert.match(csv.headers.get('content-type'), /^text\/csv/);
    assert.match(csv.headers.get('content-disposition'), new RegExp(`attachment.*${type}-2099-01-02-to-2099-01-04\\.csv`));
    const body = await csv.text();
    assert.equal(body.trimEnd().split('\r\n').length, model.reports[type].length + 1);
    assert.ok(!body.includes(guest.email));
    if (type === 'arrivals') assert.match(body, /"'=2\+2, ""test"""/);
    if (type === 'outstanding') assert.match(body, /5000\.00/);
  }
});
