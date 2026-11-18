import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';

process.env.DATABASE_PATH = ':memory:';
const { db } = await import('../src/services/database.js');
const { createBooking, updateBooking } = await import('../src/services/booking.js');
const { hashPassword } = await import('../src/services/auth.js');
const { processGuestNotifications } = await import('../src/services/guestNotifications.js');
const h = await import('../src/services/hospitality.js');
const { default: app } = await import('../src/app.js');

test('booking notifications queue once, skip stale holds, respect opt-out, and verify delivery webhooks', async t => {
  const secret = Buffer.from('notification-test-secret');
  const settings = {
    NOTIFICATION_PUBLIC_ORIGIN: 'https://hotel.example.test',
    NOTIFICATION_FROM: 'Pratap Palace <staff@example.test>',
    RESEND_API_KEY: 'test-only', RESEND_WEBHOOK_SECRET: 'whsec_' + secret.toString('base64'),
    WHATSAPP_ACCESS_TOKEN: 'test-only', WHATSAPP_PHONE_NUMBER_ID: '123',
    WHATSAPP_API_VERSION: 'v27.0', WHATSAPP_APP_SECRET: 'meta-test-secret',
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
    WHATSAPP_CONFIRMATION_TEMPLATE: 'booking_confirmed', WHATSAPP_QUOTE_TEMPLATE: 'event_quote',
    WHATSAPP_REMINDER_TEMPLATE: 'hold_reminder',
  };
  const originals = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  Object.assign(process.env, settings);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.close();
    db.close();
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const json = { 'Content-Type': 'application/json' };
  const guest = { name: 'Test Guest', email: 'guest@example.test', phone: '+91 90000 00000', guests: 2, acceptPolicies: true };
  const date = '2099-01-02';
  const key = randomUUID();
  db.exec("UPDATE rooms SET active=1,rate=450000,inventory=4 WHERE id='deluxe'");
  const stay = { ...guest, roomId: 'deluxe', quantity: 1, expectedTotal: 450000, checkIn: date, checkOut: '2099-01-03' };
  const room = createBooking(stay, key);
  assert.equal(createBooking(stay, key).id, room.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM guest_notifications').get().count, 0);
  updateBooking(room.id, 'confirmed', 'manager');
  const restaurant = h.saveResource('palace-dining', { name: 'Test Restaurant', enabled: true, config: {
    ...h.defaultConfig('dining'), leadHours: 0, tables: [{ id: 'T1', seats: 2 }, { id: 'T2', seats: 2 }], rules: 'Test policy', inclusions: 'Test package', pricePerGuest: 150000,
  } });
  const dining = { ...guest, resourceId: restaurant.id, revision: restaurant.revision, date, time: '19:00', partyType: 'Couple', expectedTotal: 300000 };
  assert.throws(() => h.createReservation('dining', { ...dining, whatsappUpdates: true, phone: '9000000000' }, randomUUID()), /country code/);
  const table = h.createReservation('dining', { ...dining, whatsappUpdates: true }, randomUUID());
  h.recordPayment(table.id, { amount: 300000, receipt: 'TEST-PAYMENT' }, 'manager');
  const optedOut = h.createReservation('dining', { ...dining, whatsappUpdates: true, phone: '+91 90000 00001' }, randomUUID());
  const venue = h.saveResource('palace-events', { name: 'Test Venue', enabled: true, config: {
    ...h.defaultConfig('events'), leadHours: 0, layouts: [{ name: 'Banquet', capacity: 10 }], rules: 'Test policy',
  } });
  const event = h.createReservation('events', { ...guest, resourceId: venue.id, revision: venue.revision, date, time: '18:00', endTime: '20:00', layout: 'Banquet', eventType: 'Test event' }, randomUUID());
  h.quoteEvent(event.id, { total: 350000, terms: 'Original test quote' }, 'manager');
  h.quoteEvent(event.id, { total: 450000, terms: 'Updated test quote' }, 'manager');

  const meta = async value => {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, ...value } }] }] });
    const signature = createHmac('sha256', settings.WHATSAPP_APP_SECRET).update(body).digest('hex');
    return fetch(base + '/webhooks/notifications/whatsapp', { method: 'POST', headers: { ...json, 'X-Hub-Signature-256': 'sha256=' + signature }, body });
  };
  assert.equal((await meta({ messages: [{ type: 'text', from: '919000000001', text: { body: 'STOP' } }] })).status, 200);
  h.recordPayment(optedOut.id, { amount: 300000, receipt: 'TEST-STOPPED' }, 'manager');
  assert.deepEqual(db.prepare('SELECT DISTINCT status FROM guest_notifications WHERE booking_id=?').all(optedOut.id).map(row => row.status), ['skipped']);
  db.prepare("UPDATE guest_notifications SET due_at=? WHERE event='reminder' AND booking_id=?").run(Date.now() - 1, table.id);

  const sent = [];
  const transport = async (url, options) => {
    sent.push({ url, headers: options.headers, body: JSON.parse(options.body) });
    return Response.json(url.includes('resend.com') ? { id: 'email-' + sent.length } : { messages: [{ id: 'whatsapp-' + sent.length }] });
  };
  await processGuestNotifications(transport);
  await processGuestNotifications(transport);
  assert.equal(sent.length, 3);
  assert.equal(sent.filter(item => item.url.includes('resend.com')).length, 2);
  const wa = sent.find(item => item.url.includes('graph.facebook.com'));
  assert.equal(wa.body.to, '919000000000');
  assert.equal(wa.body.template.name, 'booking_confirmed');
  assert.match(wa.body.template.components[0].parameters[2].text, /^https:\/\/hotel\.example\.test\/manage#/);
  assert.equal(sent.filter(item => item.body.text?.includes('₹4,500.00')).length, 2);
  assert.ok(sent.filter(item => item.url.includes('resend.com')).every(item => item.headers['Idempotency-Key']));
  assert.equal(db.prepare("SELECT status FROM guest_notifications WHERE booking_id=? AND event='reminder'").get(table.id).status, 'skipped');

  const roomMessage = db.prepare('SELECT provider_id, recipient, payload FROM guest_notifications WHERE booking_id=?').get(room.id);
  assert.equal(roomMessage.recipient, '');
  assert.equal(roomMessage.payload, '{}');
  const tableMessage = db.prepare("SELECT provider_id FROM guest_notifications WHERE booking_id=? AND event='confirmation'").get(table.id);
  assert.equal((await meta({ statuses: [{ id: tableMessage.provider_id, status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)) }] })).status, 200);
  const time = String(Math.floor(Date.now() / 1000));
  const emailWebhook = async (type, signed) => {
    const body = JSON.stringify({ type, created_at: new Date().toISOString(), data: { email_id: roomMessage.provider_id } });
    const id = 'test-' + type;
    const signature = createHmac('sha256', secret).update(`${id}.${time}.${body}`).digest('base64');
    return fetch(base + '/webhooks/notifications/email', { method: 'POST', body, headers: {
      ...json, 'svix-id': id, 'svix-timestamp': time, 'svix-signature': 'v1,' + (signed ? signature : 'invalid'),
    } });
  };
  assert.equal((await emailWebhook('email.delivered', false)).status, 401);
  assert.equal((await emailWebhook('email.delivered', true)).status, 200);
  assert.equal((await emailWebhook('email.sent', true)).status, 200);
  db.prepare('INSERT INTO admins VALUES(?,?)').run('manager', hashPassword('Notification-test-password'));
  assert.equal((await fetch(base + '/admin/notifications')).status, 401);
  const auth = await fetch(base + '/admin/login', { method: 'POST', headers: json, body: JSON.stringify({ username: 'manager', password: 'Notification-test-password' }) });
  const rows = await (await fetch(base + '/admin/notifications', { headers: { Cookie: auth.headers.get('set-cookie').split(';')[0] } })).json();
  assert.equal(rows.items.find(item => item.reference === room.reference).status, 'delivered');
  assert.equal(rows.items.find(item => item.reference === table.reference && item.event === 'confirmation').status, 'delivered');
  assert.ok(rows.items.every(item => !('recipient' in item) && !('payload' in item)));

  db.prepare("UPDATE guest_notifications SET due_at=? WHERE event='reminder' AND booking_id=?").run(Date.now() - 1, event.id);
  const reminder = () => db.prepare("SELECT * FROM guest_notifications WHERE booking_id=? AND event='reminder' AND status<>'skipped'").get(event.id);
  let retryKey;
  await processGuestNotifications(async (_url, options) => {
    retryKey = options.headers['Idempotency-Key'];
    return new Response('', { status: 429 });
  });
  assert.equal(reminder().status, 'queued');
  assert.ok(reminder().due_at > Date.now());
  db.prepare('UPDATE guest_notifications SET due_at=? WHERE id=?').run(Date.now() - 1, reminder().id);
  await processGuestNotifications(async (_url, options) => {
    assert.equal(options.headers['Idempotency-Key'], retryKey);
    assert.match(JSON.parse(options.body).subject, /expires soon/);
    return Response.json({ id: 'reminder-retried' });
  });
  assert.equal(reminder().status, 'accepted');
  assert.equal(reminder().attempts, 2);

  const ambiguous = createBooking({ ...stay, whatsappUpdates: true }, randomUUID());
  updateBooking(ambiguous.id, 'confirmed', 'manager');
  let ambiguousAttempts = 0;
  const lost = async () => { ambiguousAttempts++; throw new Error('simulated network timeout'); };
  await processGuestNotifications(lost);
  await processGuestNotifications(lost);
  assert.equal(ambiguousAttempts, 1);
  assert.equal(db.prepare('SELECT status FROM guest_notifications WHERE booking_id=?').get(ambiguous.id).status, 'unknown');
});
