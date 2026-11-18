import { randomBytes } from 'node:crypto';
import { db } from '../src/services/database.js';
import { hashPassword } from '../src/services/auth.js';
const username = process.argv[2] || process.env.ADMIN_USERNAME || 'admin';
if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username)) throw new Error('Use a username of 3–50 letters, numbers, dots, underscores, or hyphens.');
if (db.prepare('SELECT username FROM admins WHERE username=?').get(username)) {
  console.log(`Admin "${username}" already exists. No credentials changed.`);
} else {
  const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url');
  if (password.length < 12 || password.length > 256) throw new Error('Use a password of 12–256 characters.');
  db.prepare('INSERT INTO admins VALUES(?,?)').run(username, hashPassword(password));
  if (process.env.ADMIN_PASSWORD) console.log(`Admin "${username}" created using server/.env credentials. Sign in at /admin.`);
  else console.log(`Admin created.\nUsername: ${username}\nTemporary password: ${password}\nSign in at /admin and change this password in Settings.`);
}
