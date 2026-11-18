import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
process.env.DATABASE_PATH=':memory:';
const {db}=await import('../src/services/database.js');
const h=await import('../src/services/hospitality.js');
const {createBooking}=await import('../src/services/booking.js');
const {hashPassword}=await import('../src/services/auth.js');
const {default:app}=await import('../src/app.js');
const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const base=`http://127.0.0.1:${server.address().port}/api`;
after(()=>{server.close();db.close();});
let restaurant,venue;
beforeEach(()=>{
  db.exec('DELETE FROM hospitality_payments; DELETE FROM hospitality_audit; DELETE FROM hospitality_reservations; DELETE FROM hospitality_resources; DELETE FROM sessions; DELETE FROM admins; DELETE FROM booking_limits; DELETE FROM login_attempts; DELETE FROM activity_log;');
  restaurant=h.saveResource(null,{kind:'dining',name:'Test Restaurant',enabled:true,config:{...h.defaultConfig('dining'),leadHours:0,hours:[{name:'Dinner',start:'18:00',end:'23:00'}],tables:[{id:'T1',seats:2},{id:'T2',seats:4}],pricePerGuest:150000,inclusions:'Test package with all charges included',rules:'Synthetic test policies'}});
  venue=h.saveResource(null,{kind:'events',name:'Test Venue',enabled:true,config:{...h.defaultConfig('events'),leadHours:0,layouts:[{name:'Banquet',capacity:100},{name:'Theatre',capacity:150}],rules:'Synthetic event policies',setupMinutes:60,teardownMinutes:30}});
});
const guest={name:'Test Guest',email:'test@example.com',phone:'+91 99999 99999',notes:'Vegetarian; accessibility requested',acceptPolicies:true};
const dining=(overrides={})=>({...guest,resourceId:restaurant.id,revision:restaurant.revision,date:'2099-01-01',time:'18:00',guests:2,partyType:'Couple',expectedTotal:300000,...overrides});
const event=(overrides={})=>({...guest,resourceId:venue.id,revision:venue.revision,date:'2099-01-01',time:'18:00',endTime:'20:00',guests:50,layout:'Banquet',eventType:'Family celebration',...overrides});
const reserveDining=input=>h.createReservation('dining',input||dining(),randomUUID());
const reserveEvent=input=>h.createReservation('events',input||event(),randomUUID());

test('dining shows valid slots with full server-calculated package pricing',()=>{
  const result=h.diningSlots({resourceId:restaurant.id,date:'2099-01-01',guests:2});
  assert.equal(result.slots[0].time,'18:00');assert.equal(result.slots.at(-1).time,'21:30');assert.equal(result.slots[0].total,300000);
});
test('best-fit table allocation reserves physical tables and prevents overlap',()=>{
  const a=reserveDining(),b=reserveDining();
  const rows=db.prepare('SELECT allocations FROM hospitality_reservations ORDER BY created_at').all().map(row=>JSON.parse(row.allocations));
  assert.deepEqual(rows[0],['T1']);assert.deepEqual(rows[1],['T2']);
  assert.throws(()=>reserveDining(),/No suitable table/);
  assert.notEqual(a.id,b.id);
});
test('back-to-back dining and family table combinations use correct inventory',()=>{
  reserveDining();reserveDining();
  assert.doesNotThrow(()=>reserveDining(dining({time:'19:30'})));
  assert.throws(()=>reserveDining(dining({guests:6,expectedTotal:900000})),/No suitable table/);
  const config={...restaurant.config,combineTables:true};
  restaurant=h.saveResource(restaurant.id,{name:restaurant.name,enabled:true,config});
  const family=reserveDining(dining({time:'21:00',guests:6,partyType:'Family',expectedTotal:900000}));
  assert.equal(family.total,900000);
});
test('closed days, closures, off-grid times and seating duration are enforced',()=>{
  assert.throws(()=>reserveDining(dining({time:'18:10'})),/available seating/);
  assert.throws(()=>reserveDining(dining({time:'22:00'})),/complete reservation/);
  restaurant=h.saveResource(restaurant.id,{name:restaurant.name,enabled:true,config:{...restaurant.config,closures:['2099-01-01']}});
  assert.equal(h.diningSlots({resourceId:restaurant.id,date:'2099-01-01',guests:2}).slots.length,0);
  assert.throws(()=>reserveDining(),/closed/);
});
test('stale policy versions, invalid contacts and altered prices are rejected',()=>{
  assert.throws(()=>reserveDining(dining({revision:0})),/settings have changed/);
  assert.throws(()=>reserveDining(dining({expectedTotal:1})),/price has changed/);
  assert.throws(()=>reserveDining(dining({email:'wrong'})),/email/);
  assert.throws(()=>reserveDining(dining({phone:'-------'})),/phone/);
  assert.throws(()=>reserveDining(dining({acceptPolicies:false})),/acknowledge/);
});
test('dining idempotent retries keep one reservation and a private manage token',()=>{
  const key=randomUUID(),a=h.createReservation('dining',dining(),key),b=h.createReservation('dining',dining(),key);
  assert.equal(a.id,b.id);assert.equal(a.manageToken,b.manageToken);
  assert.throws(()=>h.createReservation('dining',dining({name:'Other guest'}),key),/already in use/);
  assert.throws(()=>h.getReservation(a.id,'invalid'),/private booking link/);
  assert.equal(h.getReservation(a.reference,a.manageToken).reference,a.reference);
  assert.equal(h.getReservation(a.reference,a.manageToken).manageToken,undefined);
});
test('unpaid holds expire and release tables; late payment is rejected',()=>{
  const a=reserveDining();db.prepare('UPDATE hospitality_reservations SET hold_until=? WHERE id=?').run(Date.now()-1000,a.id);
  assert.equal(h.getReservation(a.id,a.manageToken).status,'expired');
  assert.throws(()=>h.recordPayment(a.id,{amount:300000,receipt:'late'},'admin'),/hold has expired/);
  reserveDining();assert.doesNotThrow(()=>reserveDining());
});
test('only full verified payment confirms dining; receipts cannot be reused',()=>{
  const a=reserveDining();assert.equal(a.status,'pending_payment');
  assert.throws(()=>h.changeStatus(a.id,'confirmed','admin'),/not allowed/);
  const partial=h.recordPayment(a.id,{amount:100000,receipt:'RCPT-1'},'admin');assert.equal(partial.status,'pending_payment');
  assert.throws(()=>h.recordPayment(a.id,{amount:200000,receipt:'RCPT-1'},'admin'),/already been recorded/);
  assert.throws(()=>h.recordPayment(a.id,{amount:300000,receipt:'RCPT-2'},'admin'),/exceeds/);
  const full=h.recordPayment(a.id,{amount:200000,receipt:'RCPT-2'},'admin');assert.equal(full.status,'confirmed');assert.equal(full.paid,300000);
  assert.equal(full.payments.length,2);assert.ok(full.history.length>=3);
  assert.throws(()=>h.changeStatus(a.id,'seated','admin'),/reservation time/);
});
test('partial payments retain inventory for staff review after hold expiry',()=>{
  const a=reserveDining();h.recordPayment(a.id,{amount:100000,receipt:'PARTIAL'},'admin');
  db.prepare('UPDATE hospitality_reservations SET hold_until=? WHERE id=?').run(Date.now()-1000,a.id);
  assert.equal(h.getReservation(a.id,a.manageToken).status,'payment_review');reserveDining();assert.throws(()=>reserveDining(),/No suitable table/);
  const listed=h.listReservations({kind:'dining'}).items.find(item=>item.id===a.id);assert.equal(listed.status,'payment_review');
  assert.equal(h.recordPayment(a.id,{amount:200000,receipt:'BALANCE'},'admin').status,'confirmed');
});
test('event enquiries do not hold venues; competing quotes are serialized',()=>{
  const a=reserveEvent(),b=reserveEvent();assert.equal(a.status,'requested');
  h.quoteEvent(a.id,{total:5000000,terms:'Test full package with inclusions'},'admin');
  assert.throws(()=>h.quoteEvent(b.id,{total:5000000,terms:'Competing quote'},'admin'),/unavailable/);
});
test('event layout capacities and setup/teardown buffers are enforced',()=>{
  assert.throws(()=>reserveEvent(event({guests:101})),/capacity/);
  const a=reserveEvent();h.quoteEvent(a.id,{total:5000000,terms:'Test event quote'},'admin');
  assert.throws(()=>h.eventAvailability({resourceId:venue.id,date:'2099-01-01',time:'21:00',endTime:'22:00',guests:50,layout:'Banquet'}),/setup and teardown/);
  assert.equal(h.eventAvailability({resourceId:venue.id,date:'2099-01-01',time:'21:30',endTime:'22:30',guests:50,layout:'Banquet'}).available,true);
});
test('events require private quote acceptance and full verified payment',()=>{
  const a=reserveEvent(),quote=h.quoteEvent(a.id,{total:5000000,terms:'Test event package, all charges included'},'admin');
  assert.throws(()=>h.recordPayment(a.id,{amount:5000000,receipt:'EARLY'},'admin'),/cannot receive payments/);
  assert.throws(()=>h.acceptQuote(a.id,a.manageToken,{acceptQuote:true,expectedTotal:1,issuedAt:quote.data.quote.issuedAt}),/current quote/);
  const accepted=h.acceptQuote(a.id,a.manageToken,{acceptQuote:true,expectedTotal:quote.total,issuedAt:quote.data.quote.issuedAt});assert.equal(accepted.status,'pending_payment');
  assert.equal(h.recordPayment(a.id,{amount:5000000,receipt:'EVENT-1'},'admin').status,'confirmed');
});
test('event setup and teardown conflict across adjacent calendar dates',()=>{
  venue=h.saveResource(venue.id,{name:venue.name,enabled:true,config:{...venue.config,hours:[{name:'Events',start:'00:00',end:'23:59'}],setupMinutes:60,teardownMinutes:60}});
  const evening=reserveEvent(event({time:'22:30',endTime:'23:30'}));
  const morning=reserveEvent(event({date:'2099-01-02',time:'00:30',endTime:'01:30'}));
  h.quoteEvent(evening.id,{total:5000000,terms:'Evening quote'},'admin');
  assert.throws(()=>h.quoteEvent(morning.id,{total:5000000,terms:'Morning quote'},'admin'),/unavailable/);
  assert.equal(h.eventAvailability(event({date:'2099-01-02',time:'01:30',endTime:'02:30'})).available,true);
});
test('expired event quotes cannot be accepted and may be reissued if available',()=>{
  const a=reserveEvent(),quote=h.quoteEvent(a.id,{total:5000000,terms:'Test event quote'},'admin');
  h.acceptQuote(a.id,a.manageToken,{acceptQuote:true,expectedTotal:quote.total,issuedAt:quote.data.quote.issuedAt});
  db.prepare('UPDATE hospitality_reservations SET hold_until=? WHERE id=?').run(Date.now()-1000,a.id);
  assert.throws(()=>h.acceptQuote(a.id,a.manageToken,{acceptQuote:true,expectedTotal:quote.total,issuedAt:quote.data.quote.issuedAt}),/expired/);
  assert.equal(h.quoteEvent(a.id,{total:4500000,terms:'Replacement test quote'},'admin').status,'quoted');
});
test('resource edits cannot remove reserved tables or shrink reserved venue layouts',()=>{
  reserveDining();assert.throws(()=>h.saveResource(restaurant.id,{name:restaurant.name,enabled:true,config:{...restaurant.config,tables:[{id:'T2',seats:4}]}}),/Existing reservations/);
  const a=reserveEvent();h.quoteEvent(a.id,{total:5000000,terms:'Test event quote'},'admin');
  assert.throws(()=>h.saveResource(venue.id,{name:venue.name,enabled:true,config:{...venue.config,layouts:[{name:'Banquet',capacity:20}]}}),/Existing events/);
});
test('HTTP routes protect admin operations and guest details, and omit cancellation',async()=>{
  assert.equal((await fetch(`${base}/admin/hospitality/resources`)).status,401);
  const a=reserveDining();assert.equal((await fetch(`${base}/hospitality/reservations/${a.reference}`)).status,401);
  assert.equal((await fetch(`${base}/hospitality/reservations/${a.reference}`,{headers:{Authorization:`Bearer ${a.manageToken}`}})).status,200);
  const cancel=await fetch(`${base}/hospitality/reservations/${a.id}/cancel`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${a.manageToken}`},body:'{}'});assert.equal(cancel.status,404);
  db.prepare('INSERT INTO admins VALUES(?,?)').run('hospitalityadmin',hashPassword('Hospitality-test-password'));
  const login=await fetch(`${base}/admin/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'hospitalityadmin',password:'Hospitality-test-password'})});
  const headers={Cookie:login.headers.get('set-cookie').split(';')[0],'Content-Type':'application/json'};
  const invalid=await fetch(`${base}/admin/hospitality/resources`,{method:'POST',headers,body:JSON.stringify({kind:'dining',name:'Invalid',enabled:false,config:{hours:[null]}})});
  assert.equal(invalid.status,400);
  const record=await fetch(`${base}/admin/hospitality/reservations/${a.id}/payments`,{method:'POST',headers,body:JSON.stringify({amount:300000,receipt:'API-RECEIPT'})});
  assert.equal(record.status,200);assert.equal((await record.json()).status,'confirmed');
});
test('dining status requires matching reference, email and phone and exposes only a summary',()=>{
  const booking=reserveDining();
  const details={reference:booking.reference.toLowerCase(),email:'TEST@example.com',phone:'+91-99999-99999'};
  const result=h.diningStatus(details);
  assert.equal(result.status,'pending_payment');assert.equal(result.reference,booking.reference);
  assert.equal(result.balance,300000);
  for(const field of ['data','email','phone','name','notes','manageToken','token_hash','payments'])assert.equal(result[field],undefined);
  assert.throws(()=>h.diningStatus({...details,email:'other@example.com'}),/No dining booking matches/);
  assert.throws(()=>h.diningStatus({...details,phone:'1234567890'}),/No dining booking matches/);
  const event=reserveEvent();assert.throws(()=>h.diningStatus({...details,reference:event.reference}),/No dining booking matches/);
  h.recordPayment(booking.id,{amount:300000,receipt:'STATUS-PAYMENT'},'admin');
  assert.equal(h.diningStatus(details).status,'confirmed');
  assert.equal(h.diningStatus(details).balance,null);
});
test('event recovery grants expiring access to the matching quote without a notification provider',async()=>{
  const booking=reserveEvent();
  const another=reserveEvent(event({date:'2099-01-02'}));
  const quote=h.quoteEvent(booking.id,{total:1250000,terms:'Synthetic event terms'},'manager');
  const details={reference:booking.reference.toLowerCase(),email:'TEST@example.com',phone:'+91-99999-99999',date:'2099-01-01'};
  const recover=body=>fetch(`${base}/hospitality/events/recover`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  for(const invalid of [{phone:'1234567890'},{date:'2099-01-03'},{email:'wrong@example.com'}]){
    assert.equal((await recover({...details,...invalid})).status,404);
  }
  const response=await recover(details);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  const {reference,token}=await response.json();
  assert.equal(reference,booking.reference);
  assert.notEqual(token,booking.manageToken);
  assert.throws(()=>h.getReservation(another.reference,token),/invalid or has expired/);
  const recovered=h.getReservation(reference,token);
  assert.equal(recovered.data.quote.terms,'Synthetic event terms');
  assert.equal(recovered.data.email,undefined);
  assert.equal(recovered.data.phone,undefined);
  assert.equal(recovered.data.notes,undefined);
  const accepted=await fetch(`${base}/hospitality/reservations/${reference}/accept`,{
    method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({acceptQuote:true,expectedTotal:quote.total,issuedAt:quote.data.quote.issuedAt}),
  });
  assert.equal(accepted.status,200);
  assert.equal((await accepted.json()).status,'pending_payment');
  assert.equal(h.getReservation(reference,booking.manageToken).status,'pending_payment');
  const now=Date.now;
  try {
    Date.now=()=>Number(token.split('.')[1]);
    assert.throws(()=>h.getReservation(reference,token),/invalid or has expired/);
  } finally { Date.now=now; }
  for(let index=0;index<6;index++)assert.equal((await recover({...details,email:'wrong@example.com'})).status,404);
  assert.equal((await recover(details)).status,429);
});
test('dining status endpoint rate limits repeated lookup attempts',async()=>{
  const booking=reserveDining(),body=JSON.stringify({reference:booking.reference,email:'test@example.com',phone:'+91 99999 99999'});
  for(let index=0;index<10;index++){
    const result=await fetch(`${base}/hospitality/dining/status`,{method:'POST',headers:{'Content-Type':'application/json'},body});
    assert.equal(result.status,200);
  }
  const blocked=await fetch(`${base}/hospitality/dining/status`,{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'198.51.100.10'},body});
  assert.equal(blocked.status,429);
});

test('admin calendar combines room departures, dining holds, and event enquiries', async () => {
  const range = 'start=2099-01-01&end=2099-01-01';
  assert.equal((await fetch(`${base}/admin/calendar?${range}`)).status, 401);
  db.prepare("UPDATE rooms SET active=1,rate=450000,inventory=2 WHERE id='deluxe'").run();
  const room = createBooking({
    ...guest, roomId: 'deluxe', checkIn: '2098-12-31', checkOut: '2099-01-01',
    guests: 2, quantity: 1, expectedTotal: 450000,
  }, randomUUID());
  const table = reserveDining();
  const expired = reserveDining(dining({ time: '19:30' }));
  db.prepare('UPDATE hospitality_reservations SET hold_until=? WHERE id=?').run(Date.now() - 1000, expired.id);
  const enquiry = reserveEvent();
  const outside = reserveEvent(event({ date: '2099-01-02' }));
  db.prepare('INSERT INTO admins VALUES(?,?)').run('calendar-admin',hashPassword('Calendar-test-password'));
  const login = await fetch(`${base}/admin/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'calendar-admin', password: 'Calendar-test-password' }),
  });
  const headers = { Cookie: login.headers.get('set-cookie').split(';')[0] };
  const response = await fetch(`${base}/admin/calendar?${range}`, { headers });
  assert.equal(response.status, 200);
  const { entries } = await response.json();
  const byReference = new Map(entries.map(entry => [entry.reference, entry]));
  assert.equal(entries.length, 4);
  assert.equal(byReference.get(room.reference).end, '2099-01-01');
  assert.equal(byReference.get(room.reference).kind, 'rooms');
  assert.equal(byReference.get(table.reference).holdUntil, table.holdUntil);
  assert.equal(byReference.get(expired.reference).status, 'expired');
  assert.equal(byReference.get(expired.reference).holdUntil, null);
  assert.equal(byReference.get(enquiry.reference).status, 'requested');
  assert.equal(byReference.has(outside.reference), false);
  assert.ok(entries.every(entry => !('email' in entry) && !('phone' in entry) && !('manageToken' in entry)));
  assert.equal((await fetch(`${base}/admin/calendar?start=2099-01-01&end=2099-03-01`, { headers })).status, 400);
  db.prepare('DELETE FROM bookings WHERE id=?').run(room.id);
});

test('staff roles scope reservation data and sensitive actions, and changes revoke sessions', async () => {
  const table = reserveDining();
  const enquiry = reserveEvent();
  db.prepare('INSERT INTO admins VALUES(?,?)').run('manager', hashPassword('Existing-manager-password'));
  const temporary = 'Staff-temporary-password';
  const permanent = 'Staff-personal-password';
  async function call(path, { cookie, body, method = 'GET' } = {}, expected = 200) {
    const response = await fetch(`${base}/admin${path}`, {
      method,
      headers: { ...(cookie && { Cookie: cookie }), ...(body && { 'Content-Type': 'application/json' }) },
      ...(body && { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    assert.equal(response.status, expected, `${path}: ${data.message ?? ''}`);
    return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const login = (username, password, expected = 200) => call('/login', { method: 'POST', body: { username, password } }, expected);
  const manager = (await login('manager', 'Existing-manager-password')).cookie;
  const settings = role => ({ role, enabled: true, changeRates: false, publishContent: false, recordPayments: false });
  const create = (username, role, expected = 201) => call('/staff', {
    method: 'POST', cookie: manager, body: { username, password: temporary, ...settings(role) },
  }, expected);
  const change = (username, body, expected = 200) => call(`/staff/${username}`, { method: 'PUT', cookie: manager, body }, expected);
  async function activate(username) {
    const session = await login(username, temporary);
    assert.equal(session.data.mustChangePassword, true);
    assert.deepEqual(session.data.permissions, []);
    await call('/calendar?start=2099-01-01&end=2099-01-01', { cookie: session.cookie }, 403);
    await call('/password', { method: 'POST', cookie: session.cookie, body: { currentPassword: temporary, newPassword: temporary } }, 400);
    await call('/password', { method: 'POST', cookie: session.cookie, body: { currentPassword: temporary, newPassword: permanent } });
    await call('/me', { cookie: session.cookie }, 401);
    return login(username, permanent);
  }
  await create('desk', 'reception');
  await create('tables', 'dining');
  await create('venues', 'events');
  await create('TABLES', 'manager', 409);
  await change('manager', { ...settings('reception'), enabled: false }, 403);
  const desk = (await activate('desk')).cookie;
  const diningStaff = (await activate('tables')).cookie;
  const eventsStaff = (await activate('venues')).cookie;

  await call('/bookings', { cookie: desk });
  await call('/hospitality/reservations', { cookie: desk }, 403);
  await call('/staff', { cookie: desk }, 403);
  await call('/staff', { cookie: desk, method: 'POST', body: { username: 'intruder', password: temporary, ...settings('manager') } }, 403);
  const roomPatch = { method: 'PATCH', body: { rate: 250000, inventory: 2, active: true, revision: 0 } };
  await call('/rooms/deluxe', { ...roomPatch, cookie: desk }, 403);
  const { data: calendar } = await call('/calendar?start=2099-01-01&end=2099-01-01', { cookie: diningStaff });
  assert.deepEqual(calendar.entries.map(entry => entry.reference), [table.reference]);
  await call('/bookings', { cookie: diningStaff }, 403);
  const { data: list } = await call('/hospitality/reservations', { cookie: eventsStaff });
  assert.deepEqual(list.items.map(item => item.reference), [enquiry.reference]);
  await call('/hospitality/reservations?kind=events', { cookie: diningStaff }, 403);
  await call(`/hospitality/reservations/${enquiry.id}`, { cookie: diningStaff, method: 'PATCH', body: { status: 'declined' } }, 403);
  await call('/hospitality/resources', { cookie: diningStaff, method: 'POST', body: { kind: 'dining' } }, 403);
  await call(`/hospitality/reservations/${enquiry.id}/quote`, {
    cookie: eventsStaff, method: 'POST', body: { total: 600000, terms: 'Staff event quote' },
  });
  const receipt = { method: 'POST', body: { amount: table.total, receipt: 'STAFF-RECEIPT' } };
  await call(`/hospitality/reservations/${table.id}/payments`, { ...receipt, cookie: diningStaff }, 403);
  await call('/site-content', { cookie: diningStaff }, 403);
  await call('/site-content/images', { cookie: diningStaff, method: 'POST', body: { data: 'untrusted' } }, 403);

  await change('tables', { ...settings('dining'), changeRates: true, publishContent: true, recordPayments: true });
  await call('/me', { cookie: diningStaff }, 401);
  const supervisor = (await login('tables', permanent)).cookie;
  await call('/rooms/deluxe', { ...roomPatch, cookie: supervisor });
  await call('/bookings', { cookie: supervisor }, 403);
  await call('/site-content', { cookie: supervisor });
  await call('/site-content/images', { cookie: supervisor, method: 'POST', body: { data: 'invalid-image' } }, 400);
  await call(`/hospitality/reservations/${enquiry.id}/payments`, { ...receipt, cookie: supervisor }, 403);
  const { data: paid } = await call(`/hospitality/reservations/${table.id}/payments`, { ...receipt, cookie: supervisor });
  assert.equal(paid.status, 'confirmed');
  assert.equal(paid.payments[0].recorded_by, 'tables');
  const { data: activity } = await call('/activity?category=payment', { cookie: supervisor });
  assert.equal(activity.total, 1);
  assert.equal(activity.items[0].actor, 'tables');
  assert.equal(activity.items[0].target, table.reference);
  assert.equal(activity.items[0].changes[0].value, table.total);
  assert.equal(JSON.stringify(activity).includes('STAFF-RECEIPT'), false);
  const { data: inaccessible } = await call('/activity?category=payment', { cookie: eventsStaff });
  assert.equal(inaccessible.total, 0);
  const { data: deskHistory } = await call('/activity?department=dining', { cookie: desk });
  assert.equal(deskHistory.total, 0);
  const { data: eventHistory } = await call('/activity?category=booking', { cookie: eventsStaff });
  assert.ok(eventHistory.items.length > 0 && eventHistory.items.every(item => item.target === enquiry.reference));

  await change('tables', { ...settings('dining'), enabled: false });
  await call('/me', { cookie: supervisor }, 401);
  await login('tables', permanent, 401);
  await change('desk', { ...settings('reception'), password: temporary });
  await call('/me', { cookie: desk }, 401);
  assert.equal((await login('desk', temporary)).data.mustChangePassword, true);
});
