import { roles } from '../../../shared/staffAccess.mjs';
import { hashPassword } from './auth.js';
import { db, transaction } from './database.js';
import { fail } from './booking.js';
import { staffAccount } from './staffAccess.js';

export function listStaffAccounts() {
  return db.prepare('SELECT username FROM admins ORDER BY username COLLATE NOCASE').all().map(row => staffAccount(row.username));
}

function accountSettings(input) {
  const { role, enabled, changeRates, publishContent, recordPayments } = input;
  if (typeof role !== 'string' || !Object.hasOwn(roles, role) || [enabled, changeRates, publishContent, recordPayments].some(value => typeof value !== 'boolean')) {
    fail('Choose a valid role, account status, and permissions.');
  }
  if (role === 'manager') return { role, enabled, changeRates: true, publishContent: true, recordPayments: true };
  return { role, enabled, changeRates, publishContent, recordPayments: ['dining', 'events'].includes(role) && recordPayments };
}

function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) fail('Use a temporary password of 12 to 256 characters.');
  return hashPassword(password);
}

function saveSettings(username, settings, mustChangePassword) {
  const { role, enabled, changeRates, publishContent, recordPayments } = settings;
  db.prepare(`
    INSERT INTO staff_accounts VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(username) DO UPDATE SET role=excluded.role, enabled=excluded.enabled,
      change_rates=excluded.change_rates, publish_content=excluded.publish_content,
      record_payments=excluded.record_payments, must_change_password=excluded.must_change_password
  `).run(username, role, Number(enabled), Number(changeRates), Number(publishContent), Number(recordPayments), Number(mustChangePassword));
}

export function createStaffAccount(input) {
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) fail('Use a username of 3 to 50 letters, numbers, dots, underscores, or hyphens.');
  const settings = accountSettings(input);
  const hash = passwordHash(input.password);
  return transaction(() => {
    if (db.prepare('SELECT 1 FROM admins WHERE username=? COLLATE NOCASE').get(username)) fail('This username is already in use.', 409);
    db.prepare('INSERT INTO admins(username,password_hash) VALUES (?,?)').run(username, hash);
    saveSettings(username, settings, true);
    return staffAccount(username);
  });
}

export function updateStaffAccount(username, input, actor) {
  if (username === actor) fail('Manage your own password in Settings. Another manager can change your access.', 403);
  const settings = accountSettings(input);
  const reset = input.password !== undefined;
  const hash = reset ? passwordHash(input.password) : null;
  return transaction(() => {
    const previous = staffAccount(username);
    if (!previous) fail('Staff account not found.', 404);
    saveSettings(username, settings, reset || previous.mustChangePassword);
    if (reset) db.prepare('UPDATE admins SET password_hash=? WHERE username=?').run(hash, username);
    const accessChanged = Object.entries(settings).some(([key, value]) => (previous[key] ?? previous.grants[key]) !== value);
    if (reset || accessChanged) db.prepare('DELETE FROM sessions WHERE username=?').run(username);
    return staffAccount(username);
  });
}
