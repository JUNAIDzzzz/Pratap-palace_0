import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from './database.js';
import { fail } from './booking.js';
import { staffAccount, staffProfile } from './staffAccess.js';

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
const dummy = hashPassword(randomBytes(24).toString('hex'));
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(hash, 'hex'));
}
const tokenHash = token => createHash('sha256').update(token).digest('hex');
export function sessionToken(req) {
  const match = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith('pp_admin='));
  return match?.slice('pp_admin='.length) || '';
}
export function requireAdmin(req, _res, next) {
  const session = db.prepare('SELECT username FROM sessions WHERE token_hash=? AND expires>?').get(tokenHash(sessionToken(req)), Date.now());
  const account = session && staffAccount(session.username);
  if (!account?.enabled) return next(Object.assign(new Error('Please sign in to the admin panel.'), { status: 401 }));
  req.admin = session.username;
  req.staff = staffProfile(account);
  next();
}
export function login(req, res) {
  const address = req.ip, now = Date.now();
  const attempt = db.prepare('SELECT * FROM login_attempts WHERE address=?').get(address);
  if (attempt && attempt.reset_at > now && attempt.attempts >= 8) fail('Too many sign-in attempts. Try again in 15 minutes.', 429);
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 256) fail('Enter your username and password.');
  const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(username);
  const account = admin && staffAccount(username);
  const valid = verifyPassword(password, admin?.password_hash || dummy);
  if (!account?.enabled || !valid) {
    const count = attempt && attempt.reset_at > now ? attempt.attempts + 1 : 1;
    db.prepare('INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)').run(address, count, attempt && attempt.reset_at > now ? attempt.reset_at : now + 900000);
    fail('Incorrect username or password.', 401);
  }
  db.prepare('DELETE FROM login_attempts WHERE address=?').run(address);
  db.prepare('DELETE FROM sessions WHERE expires<=?').run(now);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token), username, now + 8 * 3600000);
  res.cookie('pp_admin', token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600000, path: '/api/admin' });
  res.json(staffProfile(account));
}
export function logout(req, res) {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash(sessionToken(req)));
  res.clearCookie('pp_admin', { path: '/api/admin', httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production' });
  res.json({ message: 'Signed out.' });
}
