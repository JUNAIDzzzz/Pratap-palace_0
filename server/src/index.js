import app from './app.js';
import { db } from './services/database.js';
import { hashPassword } from './services/auth.js';
import { startGuestNotifications } from './services/guestNotifications.js';

// Environment credentials initialize a missing account; they never reset an
// existing password changed through the admin panel.
const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;
if (username && password && !db.prepare('SELECT username FROM admins WHERE username=?').get(username)) {
  if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(username) || password.length < 12 || password.length > 256) {
    throw new Error('Set a valid ADMIN_USERNAME and an ADMIN_PASSWORD of 12–256 characters.');
  }
  db.prepare('INSERT INTO admins VALUES(?,?)').run(username, hashPassword(password));
}
const port=process.env.PORT||5000;
app.listen(port,'127.0.0.1',()=>{
  console.log(`Pratap Palace API: http://localhost:${port}`);
  startGuestNotifications();
});
