import { randomUUID } from 'node:crypto';
import { db, transaction } from './database.js';
import { committedInventory, fail, today, validDate } from './booking.js';
import { logActivity } from './activityLog.js';

const assignable = ['pending', 'confirmed'];

function physicalRoom(id) {
  const room = db.prepare('SELECT * FROM physical_rooms WHERE id=?').get(id);
  if (!room) fail('Room number not found.', 404);
  return room;
}

export function housekeepingBoard(date = today()) {
  if (!validDate(date)) fail('Choose a valid board date.');
  const rooms = db.prepare('SELECT * FROM physical_rooms ORDER BY room_type, number COLLATE NOCASE').all();
  const reservations = db.prepare(`
    SELECT a.physical_room_id AS roomId, b.reference, b.name, b.status, b.check_in AS checkIn, b.check_out AS checkOut
    FROM room_assignments a JOIN bookings b ON b.id=a.booking_id
    WHERE (b.status IN ('pending','confirmed','checked_in') AND b.check_in<=? AND b.check_out>?)
      OR (b.status='checked_in' AND ?=?)
    ORDER BY b.check_in, b.reference
  `).all(date, date, date, today());
  const blocks = db.prepare('SELECT * FROM room_maintenance WHERE ends>? ORDER BY starts, ends').all(date < today() ? date : today());
  return { rooms, reservations, blocks };
}

export function addPhysicalRoom({ number, roomType }) {
  const label = typeof number === 'string' ? number.trim() : '';
  if (!/^[a-z0-9][a-z0-9 -]{0,19}$/i.test(label)) fail('Enter a room number of up to 20 letters, digits, spaces, or hyphens.');
  if (typeof roomType !== 'string') fail('Select a room type.');
  return transaction(() => {
    const type = db.prepare('SELECT inventory FROM rooms WHERE id=?').get(roomType);
    if (!type) fail('Select a valid room type.');
    const count = db.prepare('SELECT COUNT(*) AS count FROM physical_rooms WHERE room_type=?').get(roomType).count;
    if (count >= type.inventory) fail('Increase the physical room count under Rooms & rates before adding another room number.', 409);
    if (db.prepare('SELECT 1 FROM physical_rooms WHERE number=?').get(label)) fail('This room number is already registered.', 409);
    const id = randomUUID();
    db.prepare('INSERT INTO physical_rooms(id,room_type,number) VALUES(?,?,?)').run(id, roomType, label);
    return physicalRoom(id);
  });
}

export function setHousekeepingStatus(id, status) {
  if (!['ready', 'dirty', 'cleaning'].includes(status)) fail('Choose a valid housekeeping status.');
  if (!db.prepare('UPDATE physical_rooms SET housekeeping=? WHERE id=?').run(status, id).changes) fail('Room number not found.', 404);
  return physicalRoom(id);
}

export function addMaintenance(id, { starts, ends, reason }) {
  if (!validDate(starts) || !validDate(ends) || starts < today() || ends <= starts) fail('Choose a start date of today or later and an end date after it.');
  if (typeof reason !== 'string' || !reason.trim() || reason.length > 200) fail('Enter a maintenance reason of up to 200 characters.');
  return transaction(() => {
    const room = physicalRoom(id);
    const conflict = db.prepare(`
      SELECT 1 FROM room_assignments a JOIN bookings b ON b.id=a.booking_id
      WHERE a.physical_room_id=? AND (
        (b.status IN ('pending','confirmed','checked_in') AND b.check_in<? AND b.check_out>?)
        OR (b.status='checked_in' AND ?=?)
      )
    `).get(id, ends, starts, starts, today());
    if (conflict) fail('This room has a reservation during the maintenance block.', 409);
    if (db.prepare('SELECT 1 FROM room_maintenance WHERE physical_room_id=? AND starts<? AND ends>?').get(id, ends, starts)) {
      fail('This room already has a maintenance block during those dates.', 409);
    }
    const type = db.prepare('SELECT inventory FROM rooms WHERE id=?').get(room.room_type);
    if (committedInventory(room.room_type, starts, ends) >= type.inventory) {
      fail('Existing reservations and maintenance already use all rooms of this type on at least one of those nights.', 409);
    }
    const block = { id: randomUUID(), physical_room_id: id, starts, ends, reason: reason.trim() };
    db.prepare('INSERT INTO room_maintenance VALUES(?,?,?,?,?)').run(block.id, id, starts, ends, block.reason);
    return block;
  });
}

export function releaseMaintenance(id) {
  return transaction(() => {
    const date = today();
    const block = db.prepare('SELECT starts FROM room_maintenance WHERE id=? AND ends>?').get(id, date);
    if (!block) fail('Active or upcoming maintenance block not found.', 404);
    if (block.starts < date) db.prepare('UPDATE room_maintenance SET ends=? WHERE id=?').run(date, id);
    else db.prepare('DELETE FROM room_maintenance WHERE id=?').run(id);
    return { message: 'Maintenance block released.' };
  });
}

export function roomAssignments(id) {
  const booking = db.prepare('SELECT room_id, quantity, status, check_in, check_out FROM bookings WHERE id=?').get(id);
  if (!booking) fail('Reservation not found.', 404);
  const rooms = db.prepare(`
    SELECT p.id, p.number, p.housekeeping,
      EXISTS(SELECT 1 FROM room_assignments a WHERE a.physical_room_id=p.id AND a.booking_id=?) AS assigned,
      EXISTS(
        SELECT 1 FROM room_assignments a JOIN bookings b ON b.id=a.booking_id
        WHERE a.physical_room_id=p.id AND b.id<>? AND b.status IN ('pending','confirmed','checked_in')
          AND b.check_in<? AND b.check_out>?
      ) OR EXISTS(
        SELECT 1 FROM room_maintenance m WHERE m.physical_room_id=p.id AND m.starts<? AND m.ends>?
      ) AS unavailable
    FROM physical_rooms p WHERE p.room_type=? ORDER BY p.number COLLATE NOCASE
  `).all(id, id, booking.check_out, booking.check_in, booking.check_out, booking.check_in, booking.room_id);
  return { quantity: booking.quantity, editable: assignable.includes(booking.status) && booking.check_out > today(), rooms };
}

export function assignRooms(id, roomIds, actor) {
  if (!Array.isArray(roomIds) || roomIds.some(roomId => typeof roomId !== 'string') || new Set(roomIds).size !== roomIds.length) {
    fail('Select distinct room numbers.');
  }
  return transaction(() => {
    const { quantity, editable, rooms } = roomAssignments(id);
    if (!editable) fail('Room assignments can only change before check-in for current or upcoming stays.', 409);
    if (roomIds.length > quantity) fail(`Select up to ${quantity} room numbers.`);
    if (roomIds.some(roomId => !rooms.some(room => room.id === roomId && !room.unavailable))) {
      fail('A selected room is unavailable or belongs to a different room type.', 409);
    }
    const before = rooms.filter(room => room.assigned).map(room => room.number);
    const after = rooms.filter(room => roomIds.includes(room.id)).map(room => room.number);
    if (before.join(', ') === after.join(', ')) return { quantity, editable, rooms };
    db.prepare('DELETE FROM room_assignments WHERE booking_id=?').run(id);
    const insert = db.prepare('INSERT INTO room_assignments VALUES(?,?)');
    for (const roomId of roomIds) insert.run(id, roomId);
    const { reference } = db.prepare('SELECT reference FROM bookings WHERE id=?').get(id);
    logActivity({
      category: 'booking', department: 'rooms', actor, target: reference, action: 'Room assignment changed',
      changes: [{ label: 'Room numbers', from: before.join(', ') || 'Unassigned', value: after.join(', ') || 'Unassigned' }],
    });
    return roomAssignments(id);
  });
}
