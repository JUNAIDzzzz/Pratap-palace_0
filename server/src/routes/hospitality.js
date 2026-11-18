import { Router } from 'express';
import { db } from '../services/database.js';
import { resources, diningSlots, eventAvailability, createReservation, getReservation, acceptQuote, diningStatus, recoverEventBooking } from '../services/hospitality.js';
const router=Router();
const handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(error){next(error);}};
const token=req=>(req.get('Authorization')||'').replace(/^Bearer /,'');
router.get('/resources',handle((req,res)=>res.json(resources(req.query.kind))));
router.get('/dining/availability',handle((req,res)=>res.json(diningSlots(req.query))));
router.get('/events/availability',handle((req,res)=>res.json(eventAvailability(req.query))));
function guestLookup(scope, lookup) {
  return handle((req, res) => {
    const now = Date.now(), address = `${scope}:${req.ip}`;
    db.prepare('DELETE FROM booking_limits WHERE reset_at<=?').run(now);
    const limit = db.prepare('SELECT attempts FROM booking_limits WHERE address=?').get(address);
    if (limit?.attempts >= 10) return res.status(429).json({ message: 'Too many attempts. Please try again in 15 minutes.' });
    db.prepare('INSERT INTO booking_limits VALUES(?,?,?) ON CONFLICT(address) DO UPDATE SET attempts=attempts+1').run(address, 1, now + 900000);
    res.json(lookup(req.body));
  });
}
router.post('/dining/status', guestLookup('dining-status', diningStatus));
router.post('/events/recover', guestLookup('event-recovery', recoverEventBooking));
router.post('/:kind/reservations',handle((req,res)=>{
  const now=Date.now(),address=`hospitality:${req.ip}`;
  db.prepare('DELETE FROM booking_limits WHERE reset_at<=?').run(now);
  const limit=db.prepare('SELECT attempts FROM booking_limits WHERE address=?').get(address);
  if(limit?.attempts>=20)return res.status(429).json({message:'Too many requests. Please try again in 15 minutes.'});
  db.prepare('INSERT INTO booking_limits VALUES(?,?,?) ON CONFLICT(address) DO UPDATE SET attempts=attempts+1').run(address,1,now+900000);
  res.status(201).json(createReservation(req.params.kind,req.body,req.get('Idempotency-Key')));
}));
router.get('/reservations/:id',handle((req,res)=>res.json(getReservation(req.params.id,token(req)))));
router.post('/reservations/:id/accept',handle((req,res)=>res.json(acceptQuote(req.params.id,token(req),req.body))));
export default router;
