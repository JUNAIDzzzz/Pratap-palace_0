import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { db, publicRoom, transaction } from './database.js';
import { logActivity } from './activityLog.js';
import { enqueueNotification, rememberWhatsapp, whatsappPreference } from './guestNotifications.js';

export function fail(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
export function validPhone(value) {
  return /^[+\d ()-]{7,25}$/.test(value) && /^\d{7,20}$/.test(value.replace(/\D/g, ''));
}
export function reservationPage(value, limit) {
  if (value === undefined || value === '') return 1;
  const page = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (page < 1 || !Number.isSafeInteger((page - 1) * limit)) fail('Enter a valid page number.');
  return page;
}
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function searchInput(input) {
  const { checkIn, checkOut } = input;
  if (!validDate(checkIn) || !validDate(checkOut)) fail('Choose valid check-in and check-out dates.');
  if (checkIn < today() || checkOut <= checkIn) fail('Check-in must be today or later; check-out must be after check-in.');
  const nights = Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000);
  if (nights > 365) fail('Please select a stay of 365 nights or fewer.');
  const guests = Number(input.guests), quantity = Number(input.quantity);
  if (!Number.isInteger(guests) || guests < 1 || guests > 80) fail('Choose between 1 and 80 guests.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) fail('Choose between 1 and 20 rooms.');
  if (guests < quantity) fail('Please allow at least one guest per room.');
  const promoCode = typeof input.promoCode === 'string' ? input.promoCode.trim().toUpperCase() : '';
  if (promoCode.length > 30) fail('Offer code is too long.');
  return { checkIn, checkOut, guests, quantity, nights, promoCode };
}

// Peak occupancy across the requested interval, rather than the sum of
// non-overlapping reservations, determines the remaining room inventory.
export function committedInventory(roomId, checkIn, checkOut = '9999-12-31') {
  const rows = db.prepare(`
    SELECT check_in, check_out, quantity FROM bookings
    WHERE room_id=? AND status IN ('pending','confirmed','checked_in') AND check_in<? AND check_out>?
    UNION ALL
    SELECT m.starts, m.ends, 1 FROM room_maintenance m
    JOIN physical_rooms p ON p.id=m.physical_room_id
    WHERE p.room_type=? AND m.starts<? AND m.ends>?
  `).all(roomId, checkOut, checkIn, roomId, checkOut, checkIn);
  const events = [];
  for (const row of rows) {
    events.push([row.check_in < checkIn ? checkIn : row.check_in, row.quantity]);
    events.push([row.check_out > checkOut ? checkOut : row.check_out, -row.quantity]);
  }
  events.sort((a, b) => a[0].localeCompare(b[0]) || a[1] - b[1]);
  let occupied = 0, peak = 0;
  for (const [, change] of events) { occupied += change; peak = Math.max(peak, occupied); }
  return peak;
}

export function availableInventory(room, query) {
  return Math.max(0, room.inventory - committedInventory(room.id, query.checkIn, query.checkOut));
}

export function offerFor(query) {
  if (!query.promoCode) return null;
  const offer = db.prepare('SELECT * FROM offers WHERE code=?').get(query.promoCode);
  if (!offer || !offer.active || query.checkIn < offer.starts || query.checkIn > offer.ends) fail('This offer code is invalid or does not apply to your check-in date.');
  return offer;
}
export function quote(room, query, offer) {
  const subtotal = room.rate * query.nights * query.quantity;
  const discount = offer ? Math.round(subtotal * offer.percent / 100) : 0;
  return { nights: query.nights, quantity: query.quantity, rate: room.rate, subtotal, discount, total: subtotal - discount, currency: 'INR' };
}
export function availability(input) {
  const query = searchInput(input), offer = offerFor(query);
  const rooms = db.prepare('SELECT * FROM rooms WHERE active=1 AND rate>0 AND inventory>0').all()
    .filter(room => query.guests <= room.guests * query.quantity)
    .map(room => ({ ...publicRoom(room), available: availableInventory(room, query), quote: quote(room, query, offer) }))
    .filter(room => room.available >= query.quantity);
  return { query, rooms };
}
export function bookingView(row) {
  return { id: row.id, reference: row.reference, roomId: row.room_id, roomName: row.room_name, name: row.name, email: row.email, phone: row.phone, checkIn: row.check_in, checkOut: row.check_out, guests: row.guests, quantity: row.quantity, nights: row.nights, rate: row.rate, subtotal: row.subtotal, discount: row.discount, total: row.total, currency: 'INR', promoCode: row.promo_code, status: row.status, notes: row.notes, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function roomBookingStatus(input) {
  const reference = typeof input.reference === 'string' ? input.reference.trim().toUpperCase() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^PP-[A-F0-9]{12}$/.test(reference)) fail('Enter a valid Pratap Palace room booking reference.');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');

  const booking = db.prepare(`
    SELECT reference, status, room_name AS roomName, check_in AS checkIn, check_out AS checkOut,
           quantity, guests, total
    FROM bookings
    WHERE reference = ? AND LOWER(TRIM(email)) = ?
  `).get(reference, email);
  if (!booking) fail('No room booking matches that reference and email address.', 404);
  return booking;
}
export function createBooking(input, key) {
  if (typeof key !== 'string' || !/^[\w-]{16,100}$/.test(key)) fail('A valid Idempotency-Key header is required.');
  const query = searchInput(input);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (!name || name.length > 100) fail('Enter your name (up to 100 characters).');
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
  if (!validPhone(phone)) fail('Enter a valid phone number.');
  if (notes.length > 1000) fail('Special requests must be 1,000 characters or fewer.');
  if (typeof input.roomId !== 'string') fail('Choose a room.');
  if (!Number.isSafeInteger(input.expectedTotal) || input.expectedTotal < 0) fail('Confirm the complete stay total before requesting a reservation.');
  const wantsWhatsapp = input.whatsappUpdates === true || input.whatsappUpdates === 'true';
  const canonical = { ...query, name, email, phone, notes, roomId: input.roomId, ...(wantsWhatsapp && { whatsappUpdates: true }) };
  const hash = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return transaction(() => {
    const existing = db.prepare('SELECT * FROM bookings WHERE request_key=?').get(key);
    if (existing) {
      if (existing.request_hash !== hash) fail('This request key was already used for another booking.', 409);
      if (existing.total !== input.expectedTotal) fail('This request key was already used for a different booking total.', 409);
      return bookingView(existing);
    }
    const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(input.roomId);
    if (!room || !room.active || room.rate <= 0 || query.guests > room.guests * query.quantity || availableInventory(room, query) < query.quantity) fail('This room is no longer available for your stay. Please search again.', 409);
    const offer = offerFor(query), pricing = quote(room, query, offer);
    if (input.expectedTotal !== pricing.total) fail('The price has changed. Please search again to review the updated total.', 409);
    const now = new Date().toISOString(), id = randomUUID(), reference = `PP-${randomBytes(6).toString('hex').toUpperCase()}`;
    const whatsapp = whatsappPreference(wantsWhatsapp, phone);
    db.prepare(`INSERT INTO bookings(id,reference,room_id,room_name,name,email,phone,check_in,check_out,guests,quantity,nights,rate,subtotal,discount,total,promo_code,notes,created_at,updated_at,request_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, reference, room.id, room.name, name, email, phone, query.checkIn, query.checkOut, query.guests, query.quantity, query.nights, pricing.rate, pricing.subtotal, pricing.discount, pricing.total, query.promoCode, notes, now, now, key, hash);
    rememberWhatsapp(id, whatsapp);
    logActivity({ category: 'booking', department: 'rooms', actorType: 'guest', target: reference, action: 'Room reservation requested' });
    return bookingView(db.prepare('SELECT * FROM bookings WHERE id=?').get(id));
  });
}

const transitions = { pending: ['confirmed', 'cancelled'], confirmed: ['checked_in', 'cancelled'], checked_in: ['completed'], completed: [], cancelled: [] };
export function updateBooking(id, status, actor) {
  return transaction(() => {
    const booking = db.prepare('SELECT * FROM bookings WHERE id=?').get(id);
    if (!booking) fail('Reservation not found.', 404);
    if (!transitions[booking.status]?.includes(status)) fail('That reservation status change is not allowed.', 409);
    if (status === 'checked_in') {
      const date = today();
      if (booking.check_in > date) fail('Check-in cannot be recorded before the arrival date.');
      if (booking.check_out <= date) fail('Check-in is unavailable on or after the scheduled checkout date.', 409);
      const unavailable = db.prepare(`
        SELECT p.number FROM physical_rooms p JOIN room_assignments a ON a.physical_room_id=p.id
        WHERE a.booking_id=? AND (p.housekeeping<>'ready' OR EXISTS (
          SELECT 1 FROM room_assignments other JOIN bookings b ON b.id=other.booking_id
          WHERE other.physical_room_id=p.id AND b.id<>? AND b.status='checked_in'
        ) OR EXISTS (
          SELECT 1 FROM room_maintenance m WHERE m.physical_room_id=p.id AND m.starts<=? AND m.ends>?
        ))
      `).get(id, id, date, date);
      if (unavailable) fail(`Room ${unavailable.number} is not ready or is unavailable for check-in.`, 409);
    }
    db.prepare('UPDATE bookings SET status=?,updated_at=? WHERE id=?').run(status, new Date().toISOString(), id);
    if (status === 'confirmed') enqueueNotification({
      bookingId: id, reference: booking.reference, department: 'rooms', event: 'confirmation', email: booking.email,
      when: `${booking.check_in} to ${booking.check_out}`, total: booking.total,
    });
    if (status === 'completed') {
      db.prepare("UPDATE physical_rooms SET housekeeping='dirty' WHERE id IN (SELECT physical_room_id FROM room_assignments WHERE booking_id=?)").run(id);
    }
    logActivity({
      category: 'booking', department: 'rooms', actor, target: booking.reference, action: 'Room reservation status changed',
      changes: [{ label: 'Status', from: booking.status, value: status, format: 'status' }],
    });
    return bookingView(db.prepare('SELECT * FROM bookings WHERE id=?').get(id));
  });
}
