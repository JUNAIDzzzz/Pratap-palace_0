import { Router } from 'express';
import { permissions } from '../../../shared/staffAccess.mjs';
import { requireAdmin } from '../services/auth.js';
import { assertPermission, requirePermission } from '../services/staffAccess.js';
import { fail } from '../services/booking.js';
import { resources, saveResource, listReservations, quoteEvent, recordPayment, changeStatus, reservationKind } from '../services/hospitality.js';
const router=Router();
const handle=fn=>(req,res,next)=>{try{fn(req,res);}catch(error){next(error);}};
router.use(requireAdmin);
router.use(requirePermission(permissions.dining, permissions.events));

function scopedKind(req) {
  const kind = req.query.kind;
  if (kind === undefined || kind === '') {
    if (req.staff.role === 'manager') return '';
    return req.staff.role;
  }
  if (kind !== 'dining' && kind !== 'events') fail('Choose dining or events.');
  assertPermission(req, permissions[kind]);
  return kind;
}

function requireReservationDepartment(req, _res, next) {
  assertPermission(req, permissions[reservationKind(req.params.id)]);
  next();
}

router.get('/resources',handle((req,res)=>res.json(resources(scopedKind(req),true))));
router.post('/resources',requirePermission(permissions.venues),handle((req,res)=>res.status(201).json(saveResource(null,req.body,req.admin))));
router.put('/resources/:id',requirePermission(permissions.venues),handle((req,res)=>res.json(saveResource(req.params.id,req.body,req.admin))));
router.get('/reservations',handle((req,res)=>res.json(listReservations({...req.query,kind:scopedKind(req)}))));
router.post('/reservations/:id/quote',requirePermission(permissions.events),handle((req,res)=>res.json(quoteEvent(req.params.id,req.body,req.admin))));
router.post('/reservations/:id/payments',requirePermission(permissions.payments),requireReservationDepartment,handle((req,res)=>res.json(recordPayment(req.params.id,req.body,req.admin))));
router.patch('/reservations/:id',requireReservationDepartment,handle((req,res)=>res.json(changeStatus(req.params.id,req.body.status,req.admin))));
export default router;
