import { Router } from 'express';
import { availability, createBooking, roomBookingStatus } from '../services/booking.js';
import { db } from '../services/database.js';
const router = Router();
router.get('/availability', (req, res, next) => { try { res.json(availability(req.query)); } catch (error) { next(error); } });
router.post('/bookings/status', (req, res, next) => {
  try {
    const now = Date.now();
    const address = `room-status:${req.ip}`;
    db.prepare('DELETE FROM booking_limits WHERE reset_at<=?').run(now);
    const limit = db.prepare('SELECT attempts FROM booking_limits WHERE address=?').get(address);
    if (limit?.attempts >= 10) return res.status(429).json({ message: 'Too many status checks. Please try again in 15 minutes.' });
    db.prepare('INSERT INTO booking_limits VALUES(?,?,?) ON CONFLICT(address) DO UPDATE SET attempts=attempts+1').run(address, 1, now + 900000);
    res.json(roomBookingStatus(req.body));
  } catch (error) { next(error); }
});
router.post('/bookings', (req, res, next) => {
  try {
    const now = Date.now();
    db.prepare('DELETE FROM booking_limits WHERE reset_at<=?').run(now);
    const limit = db.prepare('SELECT * FROM booking_limits WHERE address=?').get(req.ip);
    if (limit && limit.attempts >= 20) return res.status(429).json({ message: 'Too many reservation attempts. Please try again in 15 minutes.' });
    db.prepare('INSERT INTO booking_limits VALUES(?,?,?) ON CONFLICT(address) DO UPDATE SET attempts=attempts+1').run(req.ip, 1, now + 900000);
    res.status(201).json(createBooking(req.body, req.get('Idempotency-Key')));
  } catch (error) { next(error); }
});
export default router;
