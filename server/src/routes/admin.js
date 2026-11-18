import { Router } from 'express';
import { activityPermissions, permissions } from '../../../shared/staffAccess.mjs';
import { db, publicRoom, transaction } from '../services/database.js';
import { bookingView, committedInventory, fail, reservationPage, today, updateBooking, validDate } from '../services/booking.js';
import { hashPassword, login, logout, requireAdmin, verifyPassword } from '../services/auth.js';
import { reservationCalendar } from '../services/reservationCalendar.js';
import { adminSiteContent, saveSiteContent } from '../services/siteContent.js';
import { allowedBookingKinds, requirePermission } from '../services/staffAccess.js';
import { createStaffAccount, listStaffAccounts, updateStaffAccount } from '../services/staffAccounts.js';
import { activityChanges, logActivity } from '../services/activityLog.js';
import { activityHistory } from '../services/activityHistory.js';
import { notificationHistory } from '../services/notificationHistory.js';
import { reportCsv, reservationReports } from '../services/reservationReports.js';
import { addMaintenance, addPhysicalRoom, assignRooms, housekeepingBoard, releaseMaintenance, roomAssignments, setHousekeepingStatus } from '../services/housekeeping.js';
const router = Router();
const handler = fn => (req, res, next) => { try { fn(req, res); } catch (error) { next(error); } };
router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.post('/login', handler(login));
router.use(requireAdmin);
router.get('/me', (req, res) => res.json(req.staff));
router.use('/reports', requirePermission(permissions.dashboard));
router.get('/reports', handler((req, res) => res.json(reservationReports(req.query))));
router.get('/reports/:type.csv', handler((req, res) => {
  const { filename, text } = reportCsv(req.params.type, req.query);
  res.attachment(filename).type('text/csv').send(text);
}));
router.get('/notifications', requirePermission(permissions.reception, permissions.dining, permissions.events),
  handler((req, res) => res.json(notificationHistory(req.query, req.staff))));
router.get('/activity', requirePermission(...activityPermissions), handler((req, res) => res.json(activityHistory(req.query, req.staff))));
router.use('/staff', requirePermission(permissions.staff));
router.get('/staff', handler((_req, res) => res.json(listStaffAccounts())));
router.post('/staff', handler((req, res) => res.status(201).json(createStaffAccount(req.body))));
router.put('/staff/:username', handler((req, res) => res.json(updateStaffAccount(req.params.username, req.body, req.admin))));
router.use('/site-content', requirePermission(permissions.website));
router.get('/site-content', handler((_req, res) => res.json(adminSiteContent())));
router.put('/site-content', handler((req, res) => res.json(saveSiteContent(req.body))));
router.get('/calendar', requirePermission(permissions.reception, permissions.dining, permissions.events),
  handler((req, res) => res.json(reservationCalendar(req.query, allowedBookingKinds(req.staff)))));
router.use(['/housekeeping', '/bookings'], requirePermission(permissions.reception));
router.get('/housekeeping', handler((req, res) => res.json(housekeepingBoard(req.query.date))));
router.post('/housekeeping/rooms', handler((req, res) => res.status(201).json(addPhysicalRoom(req.body))));
router.patch('/housekeeping/rooms/:id', handler((req, res) => res.json(setHousekeepingStatus(req.params.id, req.body.status))));
router.post('/housekeeping/rooms/:id/maintenance', handler((req, res) => res.status(201).json(addMaintenance(req.params.id, req.body))));
router.delete('/housekeeping/maintenance/:id', handler((req, res) => res.json(releaseMaintenance(req.params.id))));
router.get('/bookings/:id/rooms', handler((req, res) => res.json(roomAssignments(req.params.id))));
router.put('/bookings/:id/rooms', handler((req, res) => res.json(assignRooms(req.params.id, req.body.roomIds, req.admin))));
router.post('/logout', handler(logout));
router.post('/password', handler((req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (typeof currentPassword !== 'string' || currentPassword.length > 256 || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 256) fail('Use a new password between 12 and 256 characters.');
  if (req.staff.mustChangePassword && currentPassword === newPassword) fail('Choose a password different from the temporary password.');
  transaction(() => {
    const admin = db.prepare('SELECT password_hash FROM admins WHERE username=?').get(req.admin);
    if (!admin || !verifyPassword(currentPassword, admin.password_hash)) fail('Current password is incorrect.', 400);
    db.prepare('UPDATE admins SET password_hash=? WHERE username=?').run(hashPassword(newPassword), req.admin);
    db.prepare('UPDATE staff_accounts SET must_change_password=0 WHERE username=?').run(req.admin);
    db.prepare('DELETE FROM sessions WHERE username=?').run(req.admin);
  });
  res.json({ message: 'Password changed. Please sign in again.' });
}));
router.get('/dashboard', requirePermission(permissions.dashboard), handler((_req, res) => {
  const day = today();
  res.json({ reservations: db.prepare('SELECT COUNT(*) AS count FROM bookings').get().count, pending: db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE status='pending'").get().count, arrivals: db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE check_in=? AND status IN ('pending','confirmed')").get(day).count, inHouse: db.prepare("SELECT COALESCE(SUM(quantity),0) AS count FROM bookings WHERE status='checked_in'").get().count, confirmedValue: db.prepare("SELECT COALESCE(SUM(total),0) AS amount FROM bookings WHERE status IN ('confirmed','checked_in','completed')").get().amount });
}));
router.get('/bookings', handler((req, res) => {
  const { status = '', search: searchInput = '' } = req.query;
  if (typeof status !== 'string' || typeof searchInput !== 'string') fail('Provide a single status and search value.');
  const search = searchInput.trim().slice(0, 100);
  const limit = 25, page = reservationPage(req.query.page, limit);
  const where = `WHERE (?='' OR status=?) AND (?='' OR reference LIKE ? ESCAPE '\\' OR name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\')`;
  const like = `%${search.replace(/[\\%_]/g, '\\$&')}%`, args = [status, status, search, like, like, like];
  const total = db.prepare(`SELECT COUNT(*) AS count FROM bookings ${where}`).get(...args).count;
  const items = db.prepare(`SELECT * FROM bookings ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...args, limit, (page - 1) * limit).map(bookingView);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));
router.patch('/bookings/:id', handler((req, res) => res.json(updateBooking(req.params.id, req.body.status, req.admin))));
router.get('/rooms', requirePermission(permissions.reception, permissions.rates), handler((_req, res) => res.json(db.prepare('SELECT * FROM rooms').all().map(publicRoom))));
router.patch('/rooms/:id', requirePermission(permissions.rates), handler((req, res) => res.json(transaction(() => {
  const { rate, inventory, active, revision } = req.body;
  if (!Number.isInteger(rate) || rate < 0 || rate > 100000000 || !Number.isInteger(inventory) || inventory < 0 || inventory > 1000 || typeof active !== 'boolean') fail('Enter a valid nightly rate, room count (0–1,000), and active setting.');
  if (active && (!rate || !inventory)) fail('Set a positive rate and inventory before enabling bookings.');
  const room = db.prepare('SELECT * FROM rooms WHERE id=?').get(req.params.id);
  if (!room) fail('Room type not found.', 404);
  if (!Number.isSafeInteger(revision) || revision < 0) fail('Reload the room settings before saving.');
  if (room.settings_revision !== revision) fail('These room settings changed while you were editing. Load the latest settings and try again.', 409);
  const registered = db.prepare('SELECT COUNT(*) AS count FROM physical_rooms WHERE room_type=?').get(room.id).count;
  if (inventory < registered) fail(`Inventory cannot be below the ${registered} registered room numbers.`, 409);
  const peak = committedInventory(room.id, today());
  if (inventory < peak) fail(`Inventory cannot be below ${peak}; existing reservations or maintenance use these rooms.`, 409);
  const changes = activityChanges(room, { rate, inventory, active: Number(active) }, [
    ['rate', 'Nightly rate', 'money'],
    ['inventory', 'Physical room count'],
    ['active', 'Online reservations', 'enabled'],
  ]);
  if (changes.length) {
    db.prepare('UPDATE rooms SET rate=?,inventory=?,active=?,settings_revision=settings_revision+1 WHERE id=?').run(rate, inventory, Number(active), room.id);
    logActivity({
      category: 'rate', department: 'rooms', actor: req.admin, target: room.name, action: 'Room rate or inventory settings changed', changes,
    });
  }
  return publicRoom(db.prepare('SELECT * FROM rooms WHERE id=?').get(room.id));
}))));
router.use('/offers', requirePermission(permissions.offers));
router.get('/offers', handler((_req, res) => res.json(db.prepare('SELECT * FROM offers ORDER BY code').all().map(offer => ({ ...offer, active: Boolean(offer.active) })))));
function saveOffer(rawCode, { percent, starts, ends, active }, actor, creating) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!/^[A-Z0-9_-]{2,30}$/.test(code) || !Number.isInteger(percent) || percent < 1 || percent > 90 || !validDate(starts) || !validDate(ends) || ends < starts || typeof active !== 'boolean') fail('Enter a valid code, discount (1–90%), and check-in date range.');
  return transaction(() => {
    const before = db.prepare('SELECT * FROM offers WHERE code=?').get(code);
    if (creating && before) fail('This offer code already exists. Select it from the list to edit it.', 409);
    if (!creating && !before) fail('Offer code not found.', 404);
    if (creating) db.prepare('INSERT INTO offers VALUES(?,?,?,?,?)').run(code, percent, starts, ends, Number(active));
    else db.prepare('UPDATE offers SET percent=?,starts=?,ends=?,active=? WHERE code=?').run(percent, starts, ends, Number(active), code);
    const changes = activityChanges(before, { percent, starts, ends, active: Number(active) }, [
      ['percent', 'Discount', 'percent'],
      ['starts', 'First eligible check-in'],
      ['ends', 'Last eligible check-in'],
      ['active', 'Offer availability', 'enabled'],
    ]);
    if (changes.length) logActivity({
      category: 'offer', department: 'rooms', actor, target: code, action: creating ? 'Offer created' : 'Offer updated', changes,
    });
    return { code, percent, starts, ends, active };
  });
}
router.post('/offers', handler((req, res) => res.status(201).json(saveOffer(req.body.code, req.body, req.admin, true))));
router.put('/offers/:code', handler((req, res) => res.json(saveOffer(req.params.code, req.body, req.admin, false))));
export default router;
