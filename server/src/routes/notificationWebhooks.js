import express from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { notificationConfig } from '../services/notificationConfig.js';
import { stopWhatsapp, storeReceipt } from '../services/guestNotifications.js';

const router = express.Router();
const raw = express.raw({ type: 'application/json', limit: '1mb', inflate: false });
const same = (left, right) => left.length === right.length && timingSafeEqual(left, right);
const resendStates = {
  'email.sent': 'sent', 'email.delivered': 'delivered', 'email.delivery_delayed': 'delayed',
  'email.bounced': 'bounced', 'email.complained': 'complained', 'email.failed': 'failed', 'email.suppressed': 'suppressed',
};

router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

router.post('/email', raw, (req, res) => {
  const { webhookSecret } = notificationConfig().email;
  const id = req.get('svix-id'), time = req.get('svix-timestamp'), signature = req.get('svix-signature');
  if (!webhookSecret.startsWith('whsec_')) return res.sendStatus(404);
  if (!Buffer.isBuffer(req.body) || !id || !/^\d+$/.test(time ?? '') || Math.abs(Date.now() / 1000 - Number(time)) > 300 || !signature) {
    return res.sendStatus(401);
  }
  const key = Buffer.from(webhookSecret.slice(6), 'base64');
  if (!key.length) return res.sendStatus(401);
  const expected = createHmac('sha256', key).update(`${id}.${time}.`).update(req.body).digest();
  const verified = signature.split(' ').some(entry => entry.startsWith('v1,')
    && same(expected, Buffer.from(entry.slice(3), 'base64')));
  if (!verified) return res.sendStatus(401);
  let event;
  try { event = JSON.parse(req.body); } catch { return res.sendStatus(400); }
  if (event && Object.hasOwn(resendStates, event.type)) {
    storeReceipt('email', event.data?.email_id, resendStates[event.type], Date.parse(event.created_at));
  }
  return res.sendStatus(200);
});

router.get('/whatsapp', (req, res) => {
  const { verifyToken } = notificationConfig().whatsapp;
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (!verifyToken || typeof token !== 'string' || req.query['hub.mode'] !== 'subscribe'
    || typeof challenge !== 'string' || !/^\d{1,30}$/.test(challenge)
    || !same(Buffer.from(token), Buffer.from(verifyToken))) return res.sendStatus(403);
  return res.type('text/plain').send(challenge);
});

router.post('/whatsapp', raw, (req, res) => {
  const { appSecret, numberId } = notificationConfig().whatsapp;
  const signature = req.get('X-Hub-Signature-256');
  if (!appSecret) return res.sendStatus(404);
  if (!Buffer.isBuffer(req.body) || !/^sha256=[0-9a-f]{64}$/.test(signature ?? '')
    || !same(createHmac('sha256', appSecret).update(req.body).digest(), Buffer.from(signature.slice(7), 'hex'))) return res.sendStatus(401);
  let event;
  try { event = JSON.parse(req.body); } catch { return res.sendStatus(400); }
  if (event?.object === 'whatsapp_business_account' && Array.isArray(event.entry)) {
    for (const entry of event.entry) {
      if (!Array.isArray(entry?.changes)) continue;
      for (const change of entry.changes) {
        const value = change?.value;
        if (!numberId || value?.metadata?.phone_number_id !== numberId) continue;
        for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
          if (['sent', 'delivered', 'read', 'failed'].includes(status?.status)) {
            storeReceipt('whatsapp', status.id, status.status, Number(status.timestamp) * 1000);
          }
        }
        for (const message of Array.isArray(value.messages) ? value.messages : []) {
          if (message?.type === 'text' && typeof message.text?.body === 'string' && /^(stop|unsubscribe)$/i.test(message.text.body.trim())) {
            stopWhatsapp(message.from);
          }
        }
      }
    }
  }
  return res.sendStatus(200);
});

export default router;
