import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH = ':memory:';
const { db } = await import('../src/services/database.js');
const { availability, createBooking, updateBooking, availableInventory, today } = await import('../src/services/booking.js');
const { hashPassword } = await import('../src/services/auth.js');
const { default: app } = await import('../src/app.js');
const server = app.listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}/api`;
after(() => { server.close(); db.close(); });
beforeEach(() => {
  db.exec('DELETE FROM sessions; DELETE FROM admins; DELETE FROM login_attempts; DELETE FROM booking_limits; DELETE FROM bookings; DELETE FROM offers; DELETE FROM activity_log; UPDATE rooms SET active=0,rate=0,inventory=0,settings_revision=0;');
  db.prepare("UPDATE rooms SET active=1,rate=450000,inventory=2 WHERE id='deluxe'").run();
});
const query = { checkIn: '2099-01-01', checkOut: '2099-01-04', guests: 2, quantity: 1, promoCode: '' };
function payload(overrides = {}) {
  const stay = { ...query, ...overrides };
  const nights = (Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86400000;
  return { roomId: 'deluxe', name: 'Test Guest', email: 'guest@example.com', phone: '+91 99999 99999', notes: '', expectedTotal: 450000 * nights * stay.quantity, ...stay };
}

test('availability returns configured rooms with authoritative total', () => {
  const result = availability(query);
  assert.equal(result.rooms.length, 1);
  assert.equal(result.rooms[0].quote.total, 1350000);
  assert.equal(result.rooms[0].available, 2);
});
test('unconfigured room types cannot accept reservations', () => {
  assert.throws(() => createBooking({ ...payload(), roomId: 'garden' }, randomUUID()), /no longer available/);
});
test('pending reservations reserve inventory and prevent overbooking', () => {
  createBooking(payload(), randomUUID()); createBooking(payload(), randomUUID());
  assert.throws(() => createBooking(payload(), randomUUID()), /no longer available/);
  assert.equal(availability(query).rooms.length, 0);
});
test('back-to-back stays do not overlap', () => {
  createBooking(payload({ quantity: 2 }), randomUUID());
  assert.equal(availability({ ...query, checkIn: query.checkOut, checkOut: '2099-01-05' }).rooms[0].available, 2);
});
test('peak inventory does not sum reservations on different nights', () => {
  createBooking(payload({ checkOut: '2099-01-02' }), randomUUID());
  createBooking(payload({ checkIn: '2099-01-02' }), randomUUID());
  const room = db.prepare("SELECT * FROM rooms WHERE id='deluxe'").get();
  assert.equal(availableInventory(room, query), 1);
});
test('booking retries are idempotent and changed payloads are rejected', () => {
  const key = randomUUID(), first = createBooking(payload(), key), again = createBooking(payload(), key);
  assert.equal(first.id, again.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, 1);
  assert.throws(() => createBooking(payload({ expectedTotal: first.total + 1 }), key), /different booking total/);
  assert.throws(() => createBooking({ ...payload(), name: 'Another Guest' }, key), /already used/);
});
test('cancellation releases rooms and terminal statuses cannot reopen', () => {
  const booking = createBooking(payload({ quantity: 2 }), randomUUID());
  updateBooking(booking.id, 'cancelled');
  assert.equal(availability(query).rooms[0].available, 2);
  assert.throws(() => updateBooking(booking.id, 'confirmed'), /not allowed/);
});
test('invalid dates, capacity, contacts and offer codes fail validation', () => {
  assert.throws(() => availability({ ...query, checkIn: '2099-02-31' }), /valid check/);
  assert.throws(() => availability({ ...query, checkOut: query.checkIn }), /check-out/);
  assert.throws(() => createBooking({ ...payload(), guests: 3 }, randomUUID()), /no longer available/);
  assert.throws(() => createBooking({ ...payload(), email: '' }, randomUUID()), /email/);
  assert.throws(() => createBooking(payload({ phone: '-------' }), randomUUID()), /phone/);
  assert.throws(() => availability({ ...query, promoCode: 'UNKNOWN' }), /offer code/);
});
test('discounts are calculated on server and snapshot into reservation', () => {
  db.prepare('INSERT INTO offers VALUES(?,?,?,?,?)').run('STAY10', 10, '2099-01-01', '2099-01-31', 1);
  const booking = createBooking(payload({ promoCode: 'stay10', expectedTotal: 1215000 }), randomUUID());
  assert.equal(booking.discount, 135000); assert.equal(booking.total, 1215000);
  db.prepare("UPDATE rooms SET rate=900000 WHERE id='deluxe'").run();
  assert.equal(db.prepare('SELECT total FROM bookings WHERE id=?').get(booking.id).total, 1215000);
});
test('changed prices require guest review', () => {
  assert.throws(() => createBooking(payload({ expectedTotal: undefined }), randomUUID()), /Confirm the complete stay total/);
  assert.throws(() => createBooking({ ...payload(), expectedTotal: 1 }, randomUUID()), /price has changed/);
});
test('admin API requires session, rejects cross-site writes, and supports room management', async () => {
  assert.equal((await fetch(`${base}/admin/dashboard`)).status, 401);
  db.prepare('INSERT INTO admins VALUES(?,?)').run('testadmin', hashPassword('Test-admin-password-123'));
  const auth = { username: 'testadmin', password: 'Test-admin-password-123' };
  const blocked = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify(auth) });
  assert.equal(blocked.status, 403);
  const mixedCase = base.replace(/\/api$/, '/API');
  const blockedMixedCase = await fetch(`${mixedCase}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify(auth) });
  assert.equal(blockedMixedCase.status, 403);
  assert.equal(blockedMixedCase.headers.get('cache-control'), 'no-store');
  assert.equal((await fetch(`${mixedCase}/admin/login`, { method: 'POST', body: 'invalid' })).status, 415);
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(auth) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  const headers = { Cookie: cookie, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/admin/dashboard`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/admin/bookings?status=pending&status=confirmed`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/admin/bookings?page=999999999999999999999`, { headers })).status, 400);
  const rooms = await fetch(`${base}/admin/rooms/deluxe`, { method: 'PATCH', headers, body: JSON.stringify({ rate: 500000, inventory: 4, active: true, revision: 0 }) });
  assert.equal(rooms.status, 200); assert.equal((await rooms.json()).inventory, 4);
  await fetch(`${base}/admin/logout`, { method: 'POST', headers, body: '{}' });
  assert.equal((await fetch(`${base}/admin/me`, { headers })).status, 401);
});
test('public API serializes competing bookings and rejects malformed input', async () => {
  db.prepare("UPDATE rooms SET inventory=1 WHERE id='deluxe'").run();
  const responses = await Promise.all([1, 2].map(() => fetch(`${base}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify(payload()) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const bad = await fetch(`${base}/bookings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'null' });
  assert.equal(bad.status, 400);
});
test('guest room lookup verifies both fields and returns only stay details', async () => {
  const booking = createBooking(payload({ notes: 'Private guest note' }), randomUUID());
  const check = (reference, email) => fetch(`${base}/bookings/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference, email }),
  });
  assert.equal((await check(booking.reference, '')).status, 400);
  const mismatch = await check(booking.reference, 'another@example.com');
  const unknown = await check(booking.reference.replace(/.$/, c => c === '0' ? '1' : '0'), booking.email);
  assert.equal(mismatch.status, 404);
  assert.equal(unknown.status, 404);
  assert.deepEqual(await mismatch.json(), await unknown.json());

  const response = await check(` ${booking.reference.toLowerCase()} `, ` ${booking.email.toUpperCase()} `);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    reference: booking.reference, status: 'pending', roomName: booking.roomName,
    checkIn: booking.checkIn, checkOut: booking.checkOut, quantity: booking.quantity,
    guests: booking.guests, total: booking.total,
  });
  updateBooking(booking.id, 'cancelled');
  assert.equal((await (await check(booking.reference, booking.email)).json()).status, 'cancelled');
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await check(booking.reference, 'another@example.com')).status, 404);
  }
  assert.equal((await check(booking.reference, booking.email)).status, 429);
});
test('admin login permits the explicit local Vite fallback port', async () => {
  db.prepare('INSERT INTO admins VALUES(?,?)').run('testadmin', hashPassword('Test-admin-password-123'));
  for (const origin of ['http://127.0.0.1:5174', 'http://localhost:5174']) {
    const response = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, 'Sec-Fetch-Site': 'same-origin' }, body: JSON.stringify({ username: 'testadmin', password: 'Test-admin-password-123' }) });
    assert.equal(response.status, 200);
  }
});
test('admin cannot reduce inventory below committed reservations', async () => {
  createBooking(payload({ quantity: 2 }), randomUUID());
  db.prepare('INSERT INTO admins VALUES(?,?)').run('testadmin', hashPassword('Test-admin-password-123'));
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'testadmin', password: 'Test-admin-password-123' }) });
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0], 'Content-Type': 'application/json' };
  const update = await fetch(`${base}/admin/rooms/deluxe`, { method: 'PATCH', headers, body: JSON.stringify({ rate: 450000, inventory: 1, active: true, revision: 0 }) });
  assert.equal(update.status, 409);
  const list = await fetch(`${base}/admin/bookings?search=Test&page=1`, { headers });
  assert.equal(list.status, 200); assert.equal((await list.json()).total, 1);
});

test('housekeeping assigns room numbers, blocks inventory, and marks checked-out rooms dirty', async () => {
  const route = `${base}/admin`;
  assert.equal((await fetch(`${route}/housekeeping`)).status, 401);
  db.prepare('INSERT INTO admins VALUES(?,?)').run('testadmin', hashPassword('Test-admin-password-123'));
  const json = { 'Content-Type': 'application/json' };
  const login = await fetch(`${route}/login`, { method: 'POST', headers: json, body: JSON.stringify({ username: 'testadmin', password: 'Test-admin-password-123' }) });
  const headers = { ...json, Cookie: login.headers.get('set-cookie').split(';')[0] };
  async function write(path, method, body, status = 200) {
    const result = await fetch(route + path, { method, headers, body: JSON.stringify(body) });
    const value = await result.json();
    assert.equal(result.status, status, value.message);
    return value;
  }
  assert.equal((await fetch(`${route}/manual-bookings/rooms`, { method: 'POST', headers, body: '{}' })).status, 404);
  const first = await write('/housekeeping/rooms', 'POST', { number: '101', roomType: 'deluxe' }, 201);
  const second = await write('/housekeeping/rooms', 'POST', { number: '102', roomType: 'deluxe' }, 201);
  await write('/housekeeping/rooms', 'POST', { number: '103', roomType: 'deluxe' }, 409);
  const date = today();
  const tomorrow = new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10);
  const stay = payload({ checkIn: date, checkOut: tomorrow });
  const booking = createBooking(stay, randomUUID());
  const competing = createBooking(stay, randomUUID());
  await write(`/bookings/${booking.id}/rooms`, 'PUT', { roomIds: [first.id] });
  await write(`/bookings/${competing.id}/rooms`, 'PUT', { roomIds: [first.id] }, 409);
  const maintenance = { starts: date, ends: tomorrow, reason: 'Maintenance test' };
  await write(`/housekeeping/rooms/${first.id}/maintenance`, 'POST', maintenance, 409);
  await write(`/housekeeping/rooms/${second.id}/maintenance`, 'POST', maintenance, 409);
  updateBooking(competing.id, 'cancelled');
  const block = await write(`/housekeeping/rooms/${second.id}/maintenance`, 'POST', maintenance, 201);
  assert.equal(availability(stay).rooms.length, 0);
  await write(`/bookings/${booking.id}/rooms`, 'PUT', { roomIds: [second.id] }, 409);
  await write(`/housekeeping/maintenance/${block.id}`, 'DELETE', {});
  assert.equal(availability(stay).rooms[0].available, 1);
  await write(`/housekeeping/rooms/${first.id}`, 'PATCH', { status: 'cleaning' });
  updateBooking(booking.id, 'confirmed');
  assert.throws(() => updateBooking(booking.id, 'checked_in'), /not ready/);
  await write(`/housekeeping/rooms/${first.id}`, 'PATCH', { status: 'ready' });
  updateBooking(booking.id, 'checked_in');
  updateBooking(booking.id, 'completed');
  const board = await (await fetch(`${route}/housekeeping?date=${date}`, { headers })).json();
  assert.equal(board.rooms.find(room => room.id === first.id).housekeeping, 'dirty');
  assert.equal(board.reservations.length, 0);
});

test('website content uploads and publishes atomically through authenticated admin routes', async () => {
  const publicPath = `${base}/site-content`;
  const adminPath = `${base}/admin/site-content`;
  const json = { 'Content-Type': 'application/json' };
  const postImage = (data, headers = json) => fetch(`${adminPath}/images`, { method: 'POST', headers, body: JSON.stringify({ data }) });
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/J3sAAAAASUVORK5CYII=';
  assert.equal((await fetch(adminPath)).status, 401);
  assert.equal((await postImage(png)).status, 401);
  const before = await (await fetch(publicPath)).json();
  assert.equal(before.gallery.length, 5);
  assert.equal(before.galleryPhotos.length, 14);
  assert.equal(before.revision, 0);
  db.prepare('INSERT INTO admins VALUES(?,?)').run('testadmin', hashPassword('Test-admin-password-123'));
  const login = await fetch(`${base}/admin/login`, { method: 'POST', headers: json, body: JSON.stringify({ username: 'testadmin', password: 'Test-admin-password-123' }) });
  const headers = { ...json, Cookie: login.headers.get('set-cookie').split(';')[0] };
  assert.equal((await postImage(Buffer.from('<svg/>').toString('base64'), headers)).status, 400);
  assert.equal((await postImage(png, { ...headers, Origin: 'https://untrusted.example' })).status, 403);
  const upload = await postImage(png, headers);
  assert.equal(upload.status, 201);
  const { url } = await upload.json();
  const imageResponse = await fetch(new URL(url, base));
  assert.equal(imageResponse.headers.get('content-type'), 'image/png');
  assert.equal(imageResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), Buffer.from(png, 'base64'));
  const draft = await (await fetch(adminPath, { headers })).json();
  const roomPhotos = Object.fromEntries(draft.rooms.map(room => [room.id, room.image]));
  const content = {
    ...draft,
    gallery: [{ image: url, title: 'Test gallery page', description: 'Test caption' }],
    galleryPhotos: [{ image: url, caption: 'New first gallery photo' }, before.galleryPhotos[0]],
    roomPhotos: { ...roomPhotos, deluxe: url },
    diningDescription: 'Updated dining introduction',
    contact: { address: 'Test hotel address', phone: '+91 90000 00000', email: 'hotel@example.test' },
    socials: { instagram: 'https://www.instagram.com/pratappalace/', youtube: '', facebook: '' },
  };
  const publish = body => fetch(adminPath, { method: 'PUT', headers, body: JSON.stringify(body) });
  assert.equal((await publish({ ...content, roomPhotos: { ...content.roomPhotos, suite: '/images/nonexistent.png' } })).status, 400);
  assert.equal(db.prepare("SELECT image FROM rooms WHERE id='deluxe'").get().image, roomPhotos.deluxe);
  assert.equal((await (await fetch(publicPath)).json()).revision, 0);
  assert.equal((await publish({ ...content, socials: { ...content.socials, instagram: 'https://instagram.com.example.test/profile' } })).status, 400);
  assert.equal((await publish({ ...content, galleryPhotos: [] })).status, 400);
  assert.equal((await publish(content)).status, 200);
  assert.equal((await publish(content)).status, 409);
  const after = await (await fetch(publicPath)).json();
  assert.equal(after.revision, 1);
  assert.equal(after.gallery[0].image, url);
  assert.deepEqual(after.galleryPhotos, content.galleryPhotos);
  assert.equal(after.diningDescription, content.diningDescription);
  assert.equal(after.contact.email, content.contact.email);
  assert.equal(after.socials.instagram, content.socials.instagram);
  assert.equal(availability(query).rooms[0].image, url);
});

test('activity history attributes booking, rate, and offer changes without duplicating retries or no-ops', async () => {
  const path = `${base}/admin`;
  assert.equal((await fetch(`${path}/activity`)).status, 401);
  db.prepare('INSERT INTO admins VALUES(?,?)').run('testadmin', hashPassword('Test-admin-password-123'));
  const json = { 'Content-Type': 'application/json' };
  const login = await fetch(`${path}/login`, { method: 'POST', headers: json, body: JSON.stringify({ username: 'testadmin', password: 'Test-admin-password-123' }) });
  const headers = { ...json, Cookie: login.headers.get('set-cookie').split(';')[0] };
  async function write(route, method, data, expected = 200) {
    const response = await fetch(path + route, { method, headers, body: JSON.stringify(data) });
    assert.equal(response.status, expected);
  }
  const key = randomUUID();
  const booking = createBooking(payload(), key);
  createBooking(payload(), key);
  await write(`/bookings/${booking.id}`, 'PATCH', { status: 'confirmed' });
  await write(`/bookings/${booking.id}`, 'PATCH', { status: 'confirmed' }, 409);
  await write('/rooms/deluxe', 'PATCH', { rate: 500000, inventory: 2, active: true, revision: 0 });
  await write('/rooms/deluxe', 'PATCH', { rate: 450000, inventory: 2, active: true, revision: 0 }, 409);
  await write('/rooms/deluxe', 'PATCH', { rate: 450000, inventory: 2, active: true }, 400);
  await write('/rooms/deluxe', 'PATCH', { rate: 500000, inventory: 2, active: true, revision: 1 });
  assert.deepEqual({ ...db.prepare("SELECT rate,settings_revision FROM rooms WHERE id='deluxe'").get() }, { rate: 500000, settings_revision: 1 });
  const offer = { percent: 10, starts: '2099-01-01', ends: '2099-01-10', active: true };
  await write('/offers/TEST10', 'PUT', offer, 404);
  await write('/offers', 'POST', { ...offer, code: 'TEST10' }, 201);
  await write('/offers', 'POST', { ...offer, code: 'test10', percent: 35 }, 409);
  assert.equal(db.prepare("SELECT percent FROM offers WHERE code='TEST10'").get().percent, 10);
  await write('/offers/TEST10', 'PUT', { ...offer, percent: 20, active: false });
  const response = await fetch(`${path}/activity`, { headers });
  assert.equal(response.status, 200);
  const history = await response.json();
  assert.equal(history.total, 5);
  assert.equal(history.items.find(item => item.actorType === 'guest').target, booking.reference);
  assert.deepEqual(history.items.find(item => item.action === 'Room reservation status changed').changes,
    [{ label: 'Status', from: 'pending', value: 'confirmed', format: 'status' }]);
  assert.ok(history.items.filter(item => item.actorType === 'staff').every(item => item.actor === 'testadmin'));
  assert.ok(history.items.every(item => item.createdAt.endsWith('Z')));
  assert.equal(history.items.find(item => item.category === 'rate').changes[0].from, 450000);
  const offers = await (await fetch(`${path}/activity?category=offer&search=test10&from=${today()}&to=${today()}`, { headers })).json();
  assert.equal(offers.total, 2);
  assert.ok(offers.items.every(item => item.target === 'TEST10'));
  assert.equal(offers.items.find(item => item.action === 'Offer updated').changes[0].value, 20);
  assert.equal((await fetch(`${path}/activity?from=2099-02-01&to=2099-01-01`, { headers })).status, 400);
});

test('checkout day and overdue reservations cannot be checked in', () => {
  const stay = createBooking(payload(), randomUUID());
  updateBooking(stay.id, 'confirmed');
  const day = offset => new Date(Date.parse(today()) + offset * 86400000).toISOString().slice(0, 10);
  const setDates = db.prepare('UPDATE bookings SET check_in=?,check_out=? WHERE id=?');
  for (const checkout of [day(0), day(-1)]) {
    setDates.run(day(-3), checkout, stay.id);
    assert.throws(() => updateBooking(stay.id, 'checked_in'), { status: 409 });
    assert.equal(db.prepare('SELECT status FROM bookings WHERE id=?').get(stay.id).status, 'confirmed');
  }
  setDates.run(day(-3), day(1), stay.id);
  assert.equal(updateBooking(stay.id, 'checked_in').status, 'checked_in');
});
