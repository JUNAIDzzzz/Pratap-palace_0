import './environment.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rooms } from '../data/rooms.js';

const filename = process.env.DATABASE_PATH || fileURLToPath(new URL('../../data/hotel.sqlite', import.meta.url));
if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true });
export const db = new DatabaseSync(filename);
db.exec(`
  PRAGMA journal_mode=WAL;
  PRAGMA foreign_keys=ON;
  PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
    tag TEXT NOT NULL, image TEXT NOT NULL, guests INTEGER NOT NULL, size INTEGER NOT NULL,
    rate INTEGER NOT NULL DEFAULT 0, inventory INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 0,
    settings_revision INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS offers (
    code TEXT PRIMARY KEY, percent INTEGER NOT NULL, starts TEXT NOT NULL, ends TEXT NOT NULL, active INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY, reference TEXT UNIQUE NOT NULL, room_id TEXT NOT NULL REFERENCES rooms(id),
    room_name TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
    check_in TEXT NOT NULL, check_out TEXT NOT NULL, guests INTEGER NOT NULL, quantity INTEGER NOT NULL,
    nights INTEGER NOT NULL, rate INTEGER NOT NULL, subtotal INTEGER NOT NULL, discount INTEGER NOT NULL,
    total INTEGER NOT NULL, promo_code TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
    request_key TEXT UNIQUE NOT NULL, request_hash TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bookings_availability ON bookings(room_id, check_in, check_out, status);
  CREATE TABLE IF NOT EXISTS physical_rooms (
    id TEXT PRIMARY KEY, room_type TEXT NOT NULL REFERENCES rooms(id),
    number TEXT NOT NULL COLLATE NOCASE UNIQUE, housekeeping TEXT NOT NULL DEFAULT 'ready'
      CHECK(housekeeping IN ('ready','dirty','cleaning'))
  );
  CREATE TABLE IF NOT EXISTS room_assignments (
    booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    physical_room_id TEXT NOT NULL REFERENCES physical_rooms(id),
    PRIMARY KEY(booking_id, physical_room_id)
  );
  CREATE INDEX IF NOT EXISTS room_assignments_room ON room_assignments(physical_room_id);
  CREATE TABLE IF NOT EXISTS room_maintenance (
    id TEXT PRIMARY KEY, physical_room_id TEXT NOT NULL REFERENCES physical_rooms(id),
    starts TEXT NOT NULL, ends TEXT NOT NULL, reason TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS room_maintenance_room ON room_maintenance(physical_room_id, starts, ends);
  CREATE TABLE IF NOT EXISTS admins (username TEXT PRIMARY KEY, password_hash TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS staff_accounts (
    username TEXT PRIMARY KEY REFERENCES admins(username) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('manager','reception','dining','events')),
    enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
    change_rates INTEGER NOT NULL CHECK(change_rates IN (0,1)),
    publish_content INTEGER NOT NULL CHECK(publish_content IN (0,1)),
    record_payments INTEGER NOT NULL CHECK(record_payments IN (0,1)),
    must_change_password INTEGER NOT NULL CHECK(must_change_password IN (0,1))
  );
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL REFERENCES admins(username), expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS login_attempts (address TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS booking_limits (address TEXT PRIMARY KEY, attempts INTEGER NOT NULL, reset_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY, category TEXT NOT NULL, department TEXT NOT NULL,
    actor TEXT, actor_type TEXT NOT NULL, target TEXT NOT NULL, action TEXT NOT NULL,
    changes TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS activity_log_date ON activity_log(created_at, id);
  CREATE TABLE IF NOT EXISTS notification_preferences (
    booking_id TEXT PRIMARY KEY, whatsapp_number TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notification_whatsapp_number ON notification_preferences(whatsapp_number);
  CREATE TABLE IF NOT EXISTS notification_opt_outs (
    booking_id TEXT PRIMARY KEY REFERENCES notification_preferences(booking_id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS guest_notifications (
    id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, reference TEXT NOT NULL, department TEXT NOT NULL,
    event TEXT NOT NULL, revision TEXT NOT NULL, channel TEXT NOT NULL, recipient TEXT NOT NULL,
    payload TEXT NOT NULL, status TEXT NOT NULL, reason TEXT NOT NULL DEFAULT '',
    due_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    provider_id TEXT, lease_until INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    UNIQUE (booking_id, event, revision)
  );
  CREATE INDEX IF NOT EXISTS notifications_queue ON guest_notifications(status, due_at);
  CREATE TABLE IF NOT EXISTS notification_receipts (
    channel TEXT NOT NULL, provider_id TEXT NOT NULL, status TEXT NOT NULL, occurred_at INTEGER NOT NULL,
    PRIMARY KEY(channel, provider_id)
  );
`);
transaction(() => {
  if (!db.prepare('PRAGMA table_info(rooms)').all().some(column => column.name === 'settings_revision')) {
    db.exec('ALTER TABLE rooms ADD COLUMN settings_revision INTEGER NOT NULL DEFAULT 0');
  }
});
const seed = db.prepare('INSERT OR IGNORE INTO rooms(id,name,description,tag,image,guests,size) VALUES(?,?,?,?,?,?,?)');
for (const room of rooms) seed.run(room.id, room.name, room.description, room.tag, room.image, room.guests, room.size);

export function transaction(operation) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = operation(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function publicRoom(room) {
  return { ...room, active: Boolean(room.active), currency: 'INR', bookable: Boolean(room.active && room.rate > 0 && room.inventory > 0) };
}
