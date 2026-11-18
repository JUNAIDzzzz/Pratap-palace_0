import express from 'express';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import api from './routes/api.js';
import booking from './routes/booking.js';
import admin from './routes/admin.js';
import hospitality from './routes/hospitality.js';
import hospitalityAdmin from './routes/hospitalityAdmin.js';
import { requireAdmin } from './services/auth.js';
import { requirePermission } from './services/staffAccess.js';
import { permissions } from '../../shared/staffAccess.mjs';
import notificationWebhooks from './routes/notificationWebhooks.js';
import { saveSiteImage } from './services/siteContent.js';
const app=express();
app.disable('x-powered-by');
const trustedProxies = (process.env.TRUSTED_PROXY_ADDRESSES || '').split(',').map(value => value.trim()).filter(Boolean);
if (trustedProxies.some(address => !isIP(address))) {
  throw new Error('TRUSTED_PROXY_ADDRESSES must contain comma-separated proxy IP addresses.');
}
if (trustedProxies.length) app.set('trust proxy', trustedProxies);

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'same-origin');
  res.set('X-Frame-Options', 'DENY');
  next();
});
const isWrite = req => !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
app.use('/api/webhooks/notifications', notificationWebhooks);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (isWrite(req)) {
    const origin = req.get('Origin');
    const permitted = new Set([`${req.protocol}://${req.get('host')}`, ...(process.env.PUBLIC_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean)]);
    // Vite uses 5174 when another local instance already occupies 5173.
    if (process.env.NODE_ENV !== 'production') ['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:5174', 'http://localhost:5174'].forEach(value => permitted.add(value));
    if (req.get('Sec-Fetch-Site') === 'cross-site' || (origin && !permitted.has(origin))) return res.status(403).json({ message: 'Cross-site requests are not permitted.' });
    if (!req.is('application/json')) return res.status(415).json({ message: 'Send requests as application/json.' });
  }
  next();
});
app.post('/api/admin/site-content/images', requireAdmin, requirePermission(permissions.website), express.json({ limit: '5mb' }), (req, res, next) => {
  try { res.status(201).json(saveSiteImage(req.body)); } catch (error) { next(error); }
});
app.put('/api/admin/site-content', requireAdmin, requirePermission(permissions.website), express.json({limit:'64kb'}));
app.use('/api', express.json({limit:'32kb'}), (req, res, next) => {
  if (isWrite(req) && (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))) return res.status(400).json({ message: 'Send a JSON object as the request body.' });
  next();
});
app.use('/api/admin/hospitality',hospitalityAdmin);
app.use('/api/hospitality',hospitality);
app.use('/api/admin',admin);
app.use('/api',booking);
app.use('/api',api);
app.use('/api',(_req,res)=>res.status(404).json({message:'API route not found.'}));
const dist=fileURLToPath(new URL('../../client/dist/',import.meta.url));
app.use(express.static(dist));
app.get(/^\/(?:(?:admin|booking|my-booking(?:\/rooms)?|rooms|dining(?:\/status)?|events(?:\/recover)?|gallery|manage)\/?)?$/, (_req,res)=>res.sendFile(`${dist}/index.html`));
app.get('*', (req, res, next) => {
  const isAsset = /\.[^/]+$/.test(req.path) && !req.get('Accept')?.includes('text/html');
  if (!req.accepts('html') || isAsset) return res.status(404).json({ message: 'Page not found.' });
  res.status(404).sendFile(`${dist}/index.html`, error => { if (error) next(error); });
});
app.use((error,_req,res,_next)=>{const status=error.status||500;if(status>=500)console.error(error);res.status(status).json({message:status>=500?'Unable to process your request. Please try again.':error.type==='entity.parse.failed'?'Invalid JSON request body.':error.message});});
export default app;
