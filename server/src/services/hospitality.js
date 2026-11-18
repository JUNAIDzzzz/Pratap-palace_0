import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { db, transaction } from './database.js';
import { fail, reservationPage, validDate, validPhone } from './booking.js';
import { logActivity } from './activityLog.js';
import { enqueueNotification, rememberWhatsapp, whatsappPreference } from './guestNotifications.js';

db.exec(`
 CREATE TABLE IF NOT EXISTS hospitality_resources(id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,config TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS hospitality_reservations(id TEXT PRIMARY KEY,reference TEXT UNIQUE NOT NULL,resource_id TEXT NOT NULL REFERENCES hospitality_resources(id),kind TEXT NOT NULL,status TEXT NOT NULL,data TEXT NOT NULL,allocations TEXT NOT NULL,total INTEGER NOT NULL DEFAULT 0,paid INTEGER NOT NULL DEFAULT 0,hold_until INTEGER,token_hash TEXT NOT NULL,request_key TEXT UNIQUE NOT NULL,request_hash TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS hospitality_payments(id TEXT PRIMARY KEY,reservation_id TEXT NOT NULL REFERENCES hospitality_reservations(id),receipt TEXT UNIQUE NOT NULL,amount INTEGER NOT NULL,recorded_by TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS hospitality_audit(id INTEGER PRIMARY KEY AUTOINCREMENT,reservation_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS hospitality_secrets(name TEXT PRIMARY KEY,value TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS hospitality_resource_bookings ON hospitality_reservations(resource_id,status);
 CREATE INDEX IF NOT EXISTS hospitality_audit_reservation ON hospitality_audit(reservation_id, id);
 CREATE INDEX IF NOT EXISTS hospitality_payments_reservation ON hospitality_payments(reservation_id);
 CREATE INDEX IF NOT EXISTS hospitality_payments_date ON hospitality_payments(created_at);
`);
db.prepare('INSERT OR IGNORE INTO hospitality_secrets VALUES(?,?)').run('guest_tokens', randomBytes(32).toString('hex'));
export const defaultConfig = kind => ({
  description: '', image: '', rules: '', days: [0,1,2,3,4,5,6], closures: [], leadHours: kind === 'dining' ? 2 : 24,
  hours: kind === 'dining' ? [{name:'Breakfast',start:'07:00',end:'10:30'},{name:'Lunch',start:'12:00',end:'15:00'},{name:'Dinner',start:'19:00',end:'23:00'}] : [{name:'Events',start:'08:00',end:'23:00'}],
  tables: [], combineTables: false, duration: 90, interval: 30, maxParty: 12,
  pricePerGuest: 0, inclusions: '', dressCode: '', holdMinutes: kind === 'dining' ? 30 : 1440,
  layouts: [{name:'Banquet',capacity:0},{name:'Theatre',capacity:0}], setupMinutes:60, teardownMinutes:60,
});
for (const [id,kind,name] of [['palace-dining','dining','Pratap Palace Dining'],['palace-events','events','Pratap Palace Events']]) {
  db.prepare('INSERT OR IGNORE INTO hospitality_resources(id,kind,name,config) VALUES(?,?,?,?)').run(id,kind,name,JSON.stringify(defaultConfig(kind)));
}
const sha = value => createHash('sha256').update(value).digest('hex');
const isoNow = () => new Date().toISOString();
function audit(id, actor, action) { db.prepare('INSERT INTO hospitality_audit(reservation_id,actor,action,created_at) VALUES(?,?,?,?)').run(id,actor,action,isoNow()); }
export function resources(kind, admin = false) {
  if (kind !== undefined && !['', 'dining', 'events'].includes(kind)) fail('Choose dining or events.');
  return db.prepare(`SELECT * FROM hospitality_resources ${kind ? 'WHERE kind=?' : ''}`).all(...(kind ? [kind] : [])).map(resource => ({...resource,enabled:Boolean(resource.enabled),config:JSON.parse(resource.config)})).filter(resource => admin || resource.enabled);
}
function resourceById(id, enabled = true) {
  const row = db.prepare('SELECT * FROM hospitality_resources WHERE id=?').get(id);
  if (!row || (enabled && !row.enabled)) fail('This restaurant or venue is not available for online requests.',404);
  return {...row,config:JSON.parse(row.config)};
}
const integer = (value,min,max,label) => { if (!Number.isInteger(value)||value<min||value>max) fail(`Enter a valid ${label} (${min}–${max}).`); return value; };
const text = (value,max,label,required=false) => { if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(`Enter a valid ${label}.`);return value.trim(); };
export function minutes(value) {
  if(typeof value!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('Enter a valid time in HH:MM format.');
  return Number(value.slice(0,2))*60+Number(value.slice(3));
}
const timeAt = value => `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
const instant = (date,time) => Date.parse(`${date}T${time}:00+05:30`);
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function validateConfig(kind, config, enabled) {
  if(!config || typeof config!=='object' || Array.isArray(config)) fail('Supply resource settings.');
  const c={...defaultConfig(kind),...config};
  for(const [key,max] of [['description',2000],['rules',5000],['inclusions',2000],['dressCode',200]])c[key]=text(c[key],max,key);
  if(typeof c.image!=='string'||c.image.length>2000||(c.image&&!/^\/images\/|^https:\/\//.test(c.image)))fail('Use an HTTPS image URL or a local /images/ path.');
  if(!Array.isArray(c.days)||!c.days.length||c.days.some(day=>!Number.isInteger(day)||day<0||day>6))fail('Choose valid opening days.');
  if(!Array.isArray(c.closures)||c.closures.length>366||c.closures.some(date=>!validDate(date)))fail('Enter valid closure dates.');
  if(!Array.isArray(c.hours)||!c.hours.length||c.hours.length>8||!c.hours.every(isRecord))fail('Add one or more valid service periods.');
  c.hours=c.hours.map(period=>({name:text(period.name,80,'service name',true),start:period.start,end:period.end}));
  const sorted=[...c.hours].sort((a,b)=>minutes(a.start)-minutes(b.start));
  for(let i=0;i<sorted.length;i++){if(minutes(sorted[i].end)<=minutes(sorted[i].start)||(i&&minutes(sorted[i].start)<minutes(sorted[i-1].end)))fail('Service periods must not overlap or run overnight.');}
  integer(c.leadHours,0,8760,'advance notice hours');integer(c.holdMinutes,5,10080,'hold minutes');
  if(kind==='dining') {
    integer(c.duration,15,360,'seating duration');integer(c.interval,15,120,'slot interval');integer(c.maxParty,1,100,'maximum party size');integer(c.pricePerGuest,0,100000000,'per-guest price in paise');
    if(typeof c.combineTables!=='boolean'||!Array.isArray(c.tables)||c.tables.length>100||!c.tables.every(isRecord))fail('Supply a valid table inventory.');
    const ids=new Set();
    c.tables=c.tables.map(table=>{const id=text(table.id,40,'table identifier',true);if(ids.has(id))fail('Table identifiers must be unique.');ids.add(id);return {id,seats:integer(table.seats,1,100,'table seats')};});
    if(enabled&&(!c.tables.length||!c.pricePerGuest||!c.inclusions||!c.rules))fail('Before enabling dining, add tables, a positive package price, inclusions, and guest policies.');
  } else {
    integer(c.setupMinutes,0,720,'setup buffer');integer(c.teardownMinutes,0,720,'teardown buffer');
    if(!Array.isArray(c.layouts)||!c.layouts.length||c.layouts.length>15||!c.layouts.every(isRecord))fail('Supply venue layouts and capacities.');
    const names=new Set();c.layouts=c.layouts.map(layout=>{const name=text(layout.name,80,'layout name',true);if(names.has(name))fail('Layout names must be unique.');names.add(name);return{name,capacity:integer(layout.capacity,0,10000,'layout capacity')};});
    if(enabled&&(!c.layouts.some(layout=>layout.capacity>0)||!c.rules))fail('Before enabling events, enter capacity and guest policies.');
  }
  return c;
}
function occupiedRows(id, exclude='') {
  return db.prepare(`SELECT * FROM hospitality_reservations WHERE resource_id=? AND id<>? AND (status IN ('confirmed','seated','in_progress','payment_review') OR (status='pending_payment' AND paid>0) OR (status IN ('pending_payment','quoted') AND hold_until>?))`).all(id,exclude,Date.now());
}
export function saveResource(id, input, actor) {
  return transaction(()=>{
    const existing=id?resourceById(id,false):null;
    const kind=existing?.kind||input.kind;
    if(!['dining','events'].includes(kind))fail('Choose dining or events.');
    const name=text(input.name,120,'restaurant or venue name',true);
    if(typeof input.enabled!=='boolean')fail('Choose whether to enable this resource.');
    const config=validateConfig(kind,input.config,input.enabled);
    if(existing)for(const row of occupiedRows(id)){
      const data=JSON.parse(row.data);if(data.date<new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}))continue;
      if(kind==='dining'){
        const allocation=JSON.parse(row.allocations);
        if(allocation.some(tableId=>!config.tables.find(table=>table.id===tableId))||allocation.reduce((count,tableId)=>count+(config.tables.find(table=>table.id===tableId)?.seats||0),0)<data.guests)fail('Existing reservations use these tables. Keep their identifiers and enough seats.',409);
      }else if(!config.layouts.some(layout=>layout.name===data.layout&&layout.capacity>=data.guests))fail('Existing events require this layout and capacity.',409);
    }
    const key=existing?.id||randomUUID();
    if(existing)db.prepare('UPDATE hospitality_resources SET name=?,enabled=?,config=?,revision=revision+1 WHERE id=?').run(name,Number(input.enabled),JSON.stringify(config),key);
    else db.prepare('INSERT INTO hospitality_resources(id,kind,name,enabled,config) VALUES(?,?,?,?,?)').run(key,kind,name,Number(input.enabled),JSON.stringify(config));
    if(kind==='dining' && (existing?.config.pricePerGuest ?? 0) !== config.pricePerGuest) {
      logActivity({
        category:'rate', department:'dining', actor, target:name, action:'Dining package rate changed',
        changes:[{label:'Price per guest',from:existing?.config.pricePerGuest ?? 0,value:config.pricePerGuest,format:'money'}],
      });
    }
    return resources('',true).find(resource=>resource.id===key);
  });
}
function queryFor(resource, input) {
  if(!validDate(input.date))fail('Choose a valid date.');
  const c=resource.config,guests=Number(input.guests);
  integer(guests,1,resource.kind==='dining'?c.maxParty:10000,'guest count');
  if(!c.days.includes(new Date(`${input.date}T12:00:00+05:30`).getUTCDay())||c.closures.includes(input.date))fail('This date is closed for reservations.');
  const start=minutes(input.time),end=resource.kind==='dining'?start+c.duration:minutes(input.endTime);
  if(end<=start||end>1439)fail('Choose a valid same-day end time.');
  if(instant(input.date,input.time)<Date.now()+c.leadHours*3600000)fail(`Bookings require at least ${c.leadHours} hours of notice.`);
  const period=c.hours.find(period=>start>=minutes(period.start)&&end<=minutes(period.end));
  if(!period)fail('The complete reservation must fit within a service period.');
  if(resource.kind==='dining'&&(start-minutes(period.start))%c.interval!==0)fail('Choose one of the available seating times.');
  const layout=resource.kind==='events'?c.layouts.find(layout=>layout.name===input.layout):null;
  if(resource.kind==='events'&&(!layout||guests>layout.capacity))fail('The guest count exceeds this layout’s capacity.');
  return {date:input.date,time:input.time,endTime:timeAt(end),guests,layout:layout?.name||'',period:period.name};
}
function allocationsFor(resource, query, exclude='') {
  const start=instant(query.date,query.time),end=instant(query.date,query.endTime),c=resource.config;
  const buffers=query.config||c;
  const overlap=occupiedRows(resource.id,exclude).filter(row=>{
    const data=JSON.parse(row.data);
    const otherStart=instant(data.date,data.time),otherEnd=instant(data.date,data.endTime);
    if(resource.kind==='dining')return otherStart<end&&otherEnd>start;
    return otherStart-data.config.setupMinutes*60000<end+buffers.teardownMinutes*60000
      && otherEnd+data.config.teardownMinutes*60000>start-buffers.setupMinutes*60000;
  });
  if(resource.kind==='events'){if(overlap.length)fail('This venue is unavailable for the selected time, including setup and teardown.',409);return[resource.id];}
  const used=new Set(overlap.flatMap(row=>JSON.parse(row.allocations)));
  const available=c.tables.filter(table=>!used.has(table.id)).sort((a,b)=>a.seats-b.seats);
  const single=available.find(table=>table.seats>=query.guests);if(single)return[single.id];
  if(c.combineTables){const choices=new Map([[0,[]]]),ceiling=query.guests+Math.max(0,...available.map(table=>table.seats));for(const table of available)for(const [seats,ids] of [...choices]){const total=seats+table.seats;if(total<=ceiling&&!choices.has(total))choices.set(total,[...ids,table.id]);}const fits=[...choices].filter(([seats])=>seats>=query.guests).sort((a,b)=>a[0]-b[0]||a[1].length-b[1].length);if(fits.length)return fits[0][1];}
  fail('No suitable table is available for this party and time.',409);
}
export function diningSlots(input) {
  const resource=resourceById(input.resourceId);if(resource.kind!=='dining')fail('Choose a restaurant.');
  if(!validDate(input.date))fail('Choose a valid date.');
  integer(Number(input.guests),1,resource.config.maxParty,'guest count');
  const slots=[];
  for(const period of resource.config.hours)for(let minute=minutes(period.start);minute+resource.config.duration<=minutes(period.end);minute+=resource.config.interval){
    const time=timeAt(minute);try{const query=queryFor(resource,{...input,time});allocationsFor(resource,query);slots.push({time,endTime:query.endTime,period:period.name,total:resource.config.pricePerGuest*query.guests});}catch(error){if(error.status!==400&&error.status!==409)throw error;}
  }
  return {resourceId:resource.id,revision:resource.revision,resourceName:resource.name,config:resource.config,currency:'INR',slots};
}
export function eventAvailability(input){const resource=resourceById(input.resourceId);if(resource.kind!=='events')fail('Choose an event venue.');const query=queryFor(resource,input);allocationsFor(resource,query);return{available:true,resourceId:resource.id,revision:resource.revision,resourceName:resource.name,config:resource.config,query};}
function guestToken(row){const secret=db.prepare("SELECT value FROM hospitality_secrets WHERE name='guest_tokens'").get().value;return createHmac('sha256',secret).update(`${row.id}:${row.request_key}`).digest('hex');}
function notifyHospitality(row, event) {
  const data = JSON.parse(row.data);
  enqueueNotification({
    bookingId: row.id, reference: row.reference, department: row.kind, event,
    email: data.email, privateToken: guestToken(row),
    when: `${data.date}, ${data.time}–${data.endTime} IST`, total: row.total,
    ...(event !== 'confirmation' && { holdUntil: row.hold_until, revision: data.quote?.issuedAt ?? '' }),
  });
}
export function currentStatus(row, now = Date.now()) {
  const expired = ['pending_payment','quoted'].includes(row.status) && row.hold_until <= now;
  return expired ? (row.paid > 0 ? 'payment_review' : 'expired') : row.status;
}
function reservationView(row, admin=false){
  const data=JSON.parse(row.data);
  return {id:row.id,reference:row.reference,resourceId:row.resource_id,kind:row.kind,status:currentStatus(row),data,total:row.total,paid:row.paid,balance:Math.max(0,row.total-row.paid),holdUntil:row.hold_until,currency:'INR',createdAt:row.created_at,...(admin?{allocations:JSON.parse(row.allocations),payments:db.prepare('SELECT * FROM hospitality_payments WHERE reservation_id=? ORDER BY created_at').all(row.id),history:db.prepare('SELECT actor,action,created_at FROM hospitality_audit WHERE reservation_id=? ORDER BY id').all(row.id)}:{})};
}
function rowFor(id){const row=db.prepare('SELECT * FROM hospitality_reservations WHERE id=? OR reference=?').get(id,id);if(!row)fail('Reservation not found.',404);return row;}
export function reservationKind(id) {
  return rowFor(id).kind;
}
function recoverySignature(row, expires) {
  return createHmac('sha256', guestToken(row)).update(`event-recovery:${expires}`).digest('hex');
}

export function authorizeGuest(id, token) {
  const row = rowFor(id);
  const value = typeof token === 'string' ? token : '';
  const match = /^recovery\.(\d{13})\.([a-f0-9]{64})$/.exec(value);
  if (row.kind === 'events' && match && Number(match[1]) > Date.now()
      && timingSafeEqual(Buffer.from(match[2], 'hex'), Buffer.from(recoverySignature(row, match[1]), 'hex'))) return row;
  if (!timingSafeEqual(Buffer.from(row.token_hash, 'hex'), Buffer.from(sha(value), 'hex'))) {
    fail('This private booking link is invalid or has expired.', 401);
  }
  return row;
}

export function recoverEventBooking(input) {
  const reference = typeof input.reference === 'string' ? input.reference.trim().toUpperCase() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' && validPhone(input.phone.trim()) ? input.phone.replace(/\D/g, '') : '';
  const mismatch = () => fail('No event booking matches these details. Check your reference, event date, email, and phone number.', 404);
  if (!/^PE-[A-F0-9]{12}$/.test(reference) || !email || email.length > 254 || !phone || !validDate(input.date)) mismatch();
  const row = db.prepare("SELECT * FROM hospitality_reservations WHERE reference=? AND kind='events'").get(reference);
  if (!row) mismatch();
  const data = JSON.parse(row.data);
  const expected = [data.email.trim().toLowerCase(), data.phone.replace(/\D/g, ''), data.date];
  if (!timingSafeEqual(
    Buffer.from(sha(JSON.stringify(expected)), 'hex'),
    Buffer.from(sha(JSON.stringify([email, phone, input.date])), 'hex'),
  )) mismatch();
  const expires = Date.now() + 30 * 60 * 1000;
  return { reference, token: `recovery.${expires}.${recoverySignature(row, expires)}` };
}
function guestReservationView(row, token) {
  const booking = reservationView(row);
  if (token.startsWith('recovery.')) {
    delete booking.data.email;
    delete booking.data.phone;
    delete booking.data.notes;
  }
  return booking;
}

export function getReservation(id,token){return guestReservationView(authorizeGuest(id,token),token);}
export function diningStatus(input) {
  const reference = typeof input.reference === 'string' ? input.reference.trim().toUpperCase() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.replace(/\D/g, '') : '';
  const mismatch = () => fail('No dining booking matches these details. Check your reference, email, and phone number.', 404);
  if (!/^PD-[A-F0-9]{12}$/.test(reference) || !email || email.length > 254 || phone.length < 7 || phone.length > 20) mismatch();
  const row = db.prepare("SELECT * FROM hospitality_reservations WHERE reference=? AND kind='dining'").get(reference);
  if (!row) mismatch();
  const data = JSON.parse(row.data);
  if (data.email.trim().toLowerCase() !== email || data.phone.replace(/\D/g, '') !== phone) mismatch();
  const booking = reservationView(row);
  // Return status only, without guest contact data, notes or private access tokens.
  return { reference: booking.reference, status: booking.status, restaurant: data.resourceName, date: data.date, time: data.time, endTime: data.endTime, holdUntil: booking.status === 'pending_payment' ? booking.holdUntil : null,
    balance: ['pending_payment', 'payment_review'].includes(booking.status) ? booking.balance : null };
}
function contact(input){return {name:text(input.name,100,'name',true),email:(()=>{const email=text(input.email,254,'email',true);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))fail('Enter a valid email.');return email;})(),phone:(()=>{const phone=text(input.phone,25,'phone',true);if(!validPhone(phone))fail('Enter a valid phone number.');return phone;})(),notes:text(input.notes||'',2000,'special requests')};}
export function createReservation(kind,input,key){
  if(!['dining','events'].includes(kind))fail('Choose dining or events.');
  if(typeof key!=='string'||!/^[\w-]{16,100}$/.test(key))fail('Send a valid Idempotency-Key.');
  if(input.acceptPolicies!==true)fail('Please acknowledge the displayed policies.');
  const hash=sha(JSON.stringify(input));
  return transaction(()=>{
    const existing=db.prepare('SELECT * FROM hospitality_reservations WHERE request_key=?').get(key);
    if(existing){if(existing.request_hash!==hash||existing.kind!==kind)fail('This request key is already in use.',409);return {...reservationView(existing),manageToken:guestToken(existing)};}
    const resource=resourceById(input.resourceId);if(resource.kind!==kind)fail('Choose a matching restaurant or venue.');
    if(input.revision!==resource.revision)fail('The booking settings have changed. Review the latest details and try again.',409);
    const query=queryFor(resource,input),allocations=allocationsFor(resource,query),guest=contact(input);
    const whatsapp=whatsappPreference(input.whatsappUpdates,guest.phone);
    const partyType=kind==='dining'?text(input.partyType,40,'party type',true):'';
    if(kind==='dining'&&!['Couple','Family','Group'].includes(partyType))fail('Select couple, family, or group.');
    const eventType=kind==='events'?text(input.eventType,80,'event type',true):'';
    const total=kind==='dining'?resource.config.pricePerGuest*query.guests:0;
    if(kind==='dining'&&input.expectedTotal!==total)fail('The price has changed. Review the new total.',409);
    const data={...query,...guest,partyType,eventType,resourceName:resource.name,config:resource.config,policyAcceptedAt:isoNow(),quote:null};
    const id=randomUUID(),reference=`${kind==='dining'?'PD':'PE'}-${randomBytes(6).toString('hex').toUpperCase()}`,now=isoNow();
    const row={id,request_key:key};const token=guestToken(row);
    db.prepare('INSERT INTO hospitality_reservations(id,reference,resource_id,kind,status,data,allocations,total,hold_until,token_hash,request_key,request_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,reference,resource.id,kind,kind==='dining'?'pending_payment':'requested',JSON.stringify(data),JSON.stringify(kind==='dining'?allocations:[]),total,kind==='dining'?Math.min(Date.now()+resource.config.holdMinutes*60000,instant(query.date,query.time)):null,sha(token),key,hash,now,now);
    audit(id,'guest',kind==='dining'?'Dining request created; full payment required':'Event enquiry created; venue not yet held');
    rememberWhatsapp(id,whatsapp);
    const reservation=rowFor(id);
    if(kind==='dining') notifyHospitality(reservation,'reminder');
    return {...reservationView(reservation),manageToken:token};
  });
}
export function quoteEvent(id,input,actor){return transaction(()=>{
  const row=rowFor(id);if(row.kind!=='events'||!['requested','quoted','expired'].includes(currentStatus(row)))fail('Only open or expired event enquiries can receive quotes.',409);
  if(row.paid>0)fail('A paid booking cannot be requoted.',409);
  const total=integer(input.total,1,1000000000,'total in paise'),terms=text(input.terms,5000,'quote terms and inclusions',true);
  const data=JSON.parse(row.data),resource=resourceById(row.resource_id);
  const query=queryFor(resource,data);allocationsFor(resource,query,row.id);
  const issuedAt = new Date(Math.max(Date.now(), data.quote ? Date.parse(data.quote.issuedAt) + 1 : 0)).toISOString();
  data.quote={total,terms,issuedAt,acceptedAt:null};
  // Snapshot the operational rules used when the venue is actually held.
  data.config=resource.config;
  db.prepare("UPDATE hospitality_reservations SET status='quoted',total=?,data=?,allocations=?,hold_until=?,updated_at=? WHERE id=?").run(total,JSON.stringify(data),JSON.stringify([resource.id]),Math.min(Date.now()+resource.config.holdMinutes*60000,instant(data.date,data.time)),isoNow(),row.id);
  const quote = new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(total/100);
  audit(row.id,actor,`Event quote issued for ${quote}; venue held`);
  const quoted=rowFor(id);
  notifyHospitality(quoted,'quote');
  notifyHospitality(quoted,'reminder');
  return reservationView(quoted,true);
});}
export function acceptQuote(id,token,input){return transaction(()=>{
  const row=authorizeGuest(id,token),data=JSON.parse(row.data);
  if(row.kind!=='events'||row.status!=='quoted'||row.hold_until<=Date.now())fail('This quote is unavailable or expired. Please ask the hotel for a new quote.',409);
  if(input.acceptQuote!==true||input.expectedTotal!==row.total||input.issuedAt!==data.quote.issuedAt)fail('Review and accept the current quote before continuing.',409);
  data.quote.acceptedAt=isoNow();db.prepare("UPDATE hospitality_reservations SET status='pending_payment',data=?,updated_at=? WHERE id=?").run(JSON.stringify(data),isoNow(),row.id);audit(row.id,'guest','Event quote accepted; full payment required');return guestReservationView(rowFor(id),token);
});}
export function recordPayment(id,input,actor){return transaction(()=>{
  const row=rowFor(id),data=JSON.parse(row.data);
  if(!['pending_payment','payment_review'].includes(row.status)||(row.hold_until<=Date.now()&&row.paid===0))fail('The payment hold has expired or this booking cannot receive payments. Issue a new request/quote before collecting money.',409);
  if(row.kind==='events'&&!data.quote?.acceptedAt)fail('The guest must accept the event quote first.',409);
  const amount=integer(input.amount,1,1000000000,'received amount in paise'),receipt=text(input.receipt,120,'external payment receipt/reference',true);
  if(amount>row.total-row.paid)fail('The amount exceeds the outstanding balance.');
  if(db.prepare('SELECT id FROM hospitality_payments WHERE receipt=?').get(receipt))fail('This payment reference has already been recorded.',409);
  // Staff must verify actual receipt outside this system; there is no gateway.
  const resource=resourceById(row.resource_id,false);allocationsFor(resource,data,row.id);
  db.prepare('INSERT INTO hospitality_payments VALUES(?,?,?,?,?,?)').run(randomUUID(),row.id,receipt,amount,actor,isoNow());
  const paid=row.paid+amount,status=paid===row.total?'confirmed':'pending_payment';
  db.prepare('UPDATE hospitality_reservations SET paid=?,status=?,updated_at=? WHERE id=?').run(paid,status,isoNow(),row.id);
  audit(row.id,actor,`Verified external payment recorded: ${amount} paise; ${status}`);
  const updated=rowFor(id);
  if(status==='confirmed') notifyHospitality(updated,'confirmation');
  return reservationView(updated,true);
});}
export function changeStatus(id,status,actor){return transaction(()=>{
  const row=rowFor(id),data=JSON.parse(row.data);
  const transitions=row.kind==='dining'?{confirmed:['seated','no_show'],seated:['completed']}:{requested:['declined'],quoted:['declined'],confirmed:['in_progress'],in_progress:['completed']};
  if(!transitions[row.status]?.includes(status))fail('This status change is not allowed. Payment confirmation is automatic after the full verified amount is recorded.',409);
  if(['seated','in_progress','no_show'].includes(status)&&instant(data.date,data.time)>Date.now())fail('This action is only available at or after the reservation time.');
  db.prepare('UPDATE hospitality_reservations SET status=?,updated_at=? WHERE id=?').run(status,isoNow(),row.id);audit(row.id,actor,`Status changed from ${row.status.replaceAll('_',' ')} to ${status.replaceAll('_',' ')}`);return reservationView(rowFor(id),true);
});}
export function listReservations(query){
  const {kind='',status:statusInput='',search:searchInput=''}=query;
  if (!['','dining','events'].includes(kind) || typeof statusInput !== 'string' || typeof searchInput !== 'string') fail('Provide a valid reservation type, status, and search value.');
  const status=statusInput.slice(0,40),search=searchInput.slice(0,100).toLowerCase();
  const limit=25,page=reservationPage(query.page,limit);
  // Expiry is persisted lazily when listing; inventory checks independently use hold_until.
  db.prepare("UPDATE hospitality_reservations SET status=CASE WHEN paid>0 THEN 'payment_review' ELSE 'expired' END,updated_at=? WHERE status IN ('pending_payment','quoted') AND hold_until<=?").run(isoNow(),Date.now());
  const where="WHERE (?='' OR kind=?) AND (?='' OR status=?) AND (?='' OR instr(lower(reference || data),?)>0)";
  const args=[kind,kind,status,status,search,search];
  return{items:db.prepare(`SELECT * FROM hospitality_reservations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args,limit,(page-1)*limit).map(row=>reservationView(row,true)),total:db.prepare(`SELECT count(*) AS total FROM hospitality_reservations ${where}`).get(...args).total,page,limit};
}
