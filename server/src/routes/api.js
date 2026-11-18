import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { db, publicRoom } from '../services/database.js';
import { siteContent, siteImage } from '../services/siteContent.js';
import { notificationConfig } from '../services/notificationConfig.js';
import { validateInquiry } from '../middleware/validateInquiry.js';
const router=Router();
router.get('/health',(_req,res)=>res.json({status:'ok'}));
router.get('/notifications/options', (_req, res) => {
  const { email, whatsapp } = notificationConfig();
  res.json({ email: email.enabled, whatsapp: whatsapp.enabled });
});
router.get('/site-content',(_req,res)=>res.json(siteContent()));
router.get('/site-content/images/:id',(req,res)=>{
  const {mime,bytes}=siteImage(req.params.id);
  res.set('Cache-Control','public, max-age=31536000, immutable').type(mime).send(Buffer.from(bytes));
});
router.get('/rooms',(_req,res)=>res.json(db.prepare('SELECT * FROM rooms').all().map(publicRoom)));
router.post('/inquiries',async(req,res,next)=>{try{const error=validateInquiry(req.body);if(error)return res.status(400).json({message:error});const {name,email,checkIn,checkOut,guests,room}=req.body;const inquiry={id:randomUUID(),name:name.trim(),email:email.trim(),checkIn,checkOut,guests:Number(guests),room,createdAt:new Date().toISOString()};const directory=fileURLToPath(new URL('../../data/',import.meta.url));await mkdir(directory,{recursive:true});await appendFile(`${directory}/inquiries.jsonl`,JSON.stringify(inquiry)+'\n');res.status(201).json({id:inquiry.id,message:'Inquiry saved.'});}catch(error){next(error);}});
export default router;
