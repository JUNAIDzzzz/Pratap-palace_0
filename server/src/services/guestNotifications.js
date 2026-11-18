import { randomUUID } from 'node:crypto';
import { db, transaction } from './database.js';
import { notificationConfig } from './notificationConfig.js';

const labels = { rooms: 'Room', dining: 'Dining', events: 'Event' };
const htmlFreeLine = value => String(value).replace(/\s+/g, ' ').trim();
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });
const hotelTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

export function whatsappPreference(value, phone) {
  if (value !== true && value !== 'true') return null;
  const number = phone.replace(/[^\d+]/g, '');
  if (!notificationConfig().whatsapp.enabled || !/^\+[1-9]\d{6,14}$/.test(number)) {
    const message = notificationConfig().whatsapp.enabled ? 'Enter a WhatsApp number starting with + and your country code.' : 'WhatsApp updates are currently unavailable. Continue with email updates.';
    throw Object.assign(new Error(message), { status: 400 });
  }
  return number;
}

export function rememberWhatsapp(bookingId, number) {
  if (number) db.prepare('INSERT INTO notification_preferences VALUES(?,?)').run(bookingId, number);
}

export function stopWhatsapp(number) {
  if (typeof number !== 'string' || !/^[1-9]\d{6,14}$/.test(number)) return;
  transaction(() => {
    const phone = '+' + number;
    db.prepare('INSERT OR IGNORE INTO notification_opt_outs SELECT booking_id FROM notification_preferences WHERE whatsapp_number=?').run(phone);
    db.prepare(`
      UPDATE guest_notifications SET status='skipped',reason='The guest opted out of WhatsApp updates.',recipient='',payload='{}',updated_at=?
      WHERE channel='whatsapp' AND recipient=? AND status='queued'
    `).run(Date.now(), phone);
  });
}

export function enqueueNotification({ bookingId, reference, department, event, email, privateToken, when, total, holdUntil, revision = '' }) {
  const now = Date.now();
  const config = notificationConfig();
  const contact = db.prepare('SELECT whatsapp_number FROM notification_preferences WHERE booking_id=?').get(bookingId);
  const channel = contact ? 'whatsapp' : 'email';
  const optedOut = contact && db.prepare('SELECT 1 FROM notification_opt_outs WHERE booking_id=?').get(bookingId);
  const canSend = config[channel].enabled && !optedOut;
  const status = optedOut ? 'skipped' : canSend ? 'queued' : 'disabled';
  const reason = optedOut ? 'The guest opted out of WhatsApp updates.'
    : canSend ? '' : 'This channel was not configured when the notification was created.';
  const url = config.origin && (privateToken
    ? `${config.origin}/manage#${new URLSearchParams({ reference, token: privateToken })}`
    : config.origin);
  const expiry = holdUntil && hotelTime.format(new Date(holdUntil)) + ' IST';
  const amount = total > 0 ? money.format(total / 100) : '';
  const subject = {
    confirmation: `${labels[department]} reservation confirmed`,
    quote: 'Your Pratap Palace event quote is ready',
    reminder: 'Your Pratap Palace reservation hold expires soon',
  }[event];
  const details = htmlFreeLine({
    confirmation: `Your reservation is confirmed for ${when}${amount ? `, total ${amount}` : ''}.`,
    quote: `Your event quote is ${amount} for ${when}. Review and accept it by ${expiry}.`,
    reminder: `Your current hold for ${when} expires at ${expiry}. Open your private booking link to review the next step.`,
  }[event]);
  const dueAt = event === 'reminder' ? Math.max(now, holdUntil - Math.min(30 * 60000, Math.max(60000, (holdUntil - now) / 3))) : now;
  const expiresAt = holdUntil || now + 6 * 3600000;
  db.prepare(`
    INSERT OR IGNORE INTO guest_notifications
      (id, booking_id, reference, department, event, revision, channel, recipient, payload, status, reason, due_at, expires_at, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(randomUUID(), bookingId, reference, department, event, revision, channel, canSend ? (contact?.whatsapp_number || email) : '',
    canSend ? JSON.stringify({ subject, details, url }) : '{}', status, reason,
    Math.round(dueAt), expiresAt, now, now);
}

const rank = { accepted: 1, sent: 2, delayed: 3, delivered: 4, read: 5, failed: 3, bounced: 5, complained: 6, suppressed: 5 };

export function storeReceipt(channel, id, status, occurredAt) {
  if (typeof id !== 'string' || !id || id.length > 300 || !Object.hasOwn(rank, status)
    || !Number.isSafeInteger(occurredAt) || occurredAt <= 0 || occurredAt > Date.now() + 3600000) return;
  return transaction(() => {
    const before = db.prepare('SELECT status, occurred_at FROM notification_receipts WHERE channel=? AND provider_id=?').get(channel, id);
    if (before && (occurredAt < before.occurred_at || rank[status] < rank[before.status])) return;
    db.prepare(`
      INSERT INTO notification_receipts VALUES(?,?,?,?)
      ON CONFLICT(channel,provider_id) DO UPDATE SET status=excluded.status,occurred_at=excluded.occurred_at
    `).run(channel, id, status, occurredAt);
  });
}

function stillRelevant(job) {
  if (job.department === 'rooms') {
    const current = db.prepare('SELECT status FROM bookings WHERE id=?').get(job.booking_id);
    return ['confirmed', 'checked_in', 'completed'].includes(current?.status);
  }
  const current = db.prepare('SELECT status,hold_until,data FROM hospitality_reservations WHERE id=?').get(job.booking_id);
  if (!current) return false;
  if (job.event === 'confirmation') return ['confirmed', 'seated', 'in_progress', 'completed'].includes(current.status);
  if (current.hold_until !== job.expires_at) return false;
  if (job.department === 'events' && JSON.parse(current.data).quote?.issuedAt !== job.revision) return false;
  return job.event === 'quote' ? current.status === 'quoted' : ['quoted', 'pending_payment'].includes(current.status);
}

async function send(job, config, transport) {
  const { subject, details, url } = JSON.parse(job.payload);
  const email = job.channel === 'email';
  const endpoint = email ? 'https://api.resend.com/emails'
    : `https://graph.facebook.com/${config.version}/${config.numberId}/messages`;
  const body = email ? {
    from: config.from, to: [job.recipient], subject: `${subject} · ${job.reference}`,
    text: `Pratap Palace\n\nReference: ${job.reference}\n${details}\n\n${url}\n`,
  } : {
    messaging_product: 'whatsapp', to: job.recipient.slice(1), type: 'template',
    template: {
      name: config.templates[job.event], language: { code: config.language },
      components: [{ type: 'body', parameters: [job.reference, details, url].map(text => ({ type: 'text', text })) }],
    },
  };
  const response = await transport(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json',
      ...(email && { 'Idempotency-Key': `pratap-palace-${job.id}` }),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return { code: response.status };
  const result = await response.json();
  const id = email ? result.id : result.messages?.[0]?.id;
  if (typeof id !== 'string' || !id || id.length > 300) throw new Error('Missing provider message ID');
  return { id };
}

export async function processGuestNotifications(transport = fetch) {
  const config = notificationConfig();
  const now = Date.now();
  db.prepare(`
    UPDATE guest_notifications SET status=CASE WHEN channel='email' THEN 'queued' ELSE 'unknown' END,
      reason=CASE WHEN channel='email' THEN '' ELSE 'Interrupted after starting a send. Delivery could not be verified.' END,
      recipient=CASE WHEN channel='email' THEN recipient ELSE '' END,
      payload=CASE WHEN channel='email' THEN payload ELSE '{}' END,
      lease_until=NULL,updated_at=?
    WHERE status='sending' AND lease_until<=?
  `).run(now, now);
  db.prepare("UPDATE guest_notifications SET status='skipped',reason='The notification window ended.',recipient='',payload='{}',updated_at=? WHERE status='queued' AND expires_at<=?").run(now, now);
  const pending = db.prepare("SELECT * FROM guest_notifications WHERE status='queued' AND due_at<=? ORDER BY due_at LIMIT 10").all(now);
  for (const job of pending) {
    const started = Date.now();
    if (!db.prepare("UPDATE guest_notifications SET status='sending', attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND status='queued'")
      .run(started + 30000, started, job.id).changes) continue;

    function finish(status, reason = '', providerId = null, dueAt = job.due_at) {
      db.prepare(`
        UPDATE guest_notifications SET status=?,reason=?,provider_id=?,due_at=?,updated_at=?,lease_until=NULL,
          recipient=CASE WHEN ?='queued' THEN recipient ELSE '' END,payload=CASE WHEN ?='queued' THEN payload ELSE '{}' END
        WHERE id=? AND status='sending' AND attempts=?
      `).run(status, reason, providerId, dueAt, Date.now(), status, status, job.id, job.attempts + 1);
    }
    if (!config[job.channel].enabled) { finish('disabled', 'This channel is not currently configured.'); continue; }
    if (job.channel === 'whatsapp' && db.prepare('SELECT 1 FROM notification_opt_outs WHERE booking_id=?').get(job.booking_id)) {
      finish('skipped', 'The guest opted out of WhatsApp updates.');
      continue;
    }
    if (job.expires_at <= started || !stillRelevant(job)) { finish('skipped', 'The reservation or hold changed before this message could be sent.'); continue; }
    let result;
    try { result = await send(job, config[job.channel], transport); } catch {}
    if (result?.id) { finish('accepted', '', result.id); continue; }
    const uncertain = !result || result.code >= 500;
    const retryable = result?.code === 429 || (job.channel === 'email' && uncertain);
    const next = Date.now() + 30000 * 2 ** job.attempts;
    if (retryable && job.attempts < 3 && next < job.expires_at) {
      finish('queued', 'Temporary provider issue. A retry is scheduled.', null, next);
    } else if (uncertain) {
      finish('unknown', 'The provider did not confirm acceptance. Delivery could not be verified.');
    } else {
      finish('failed', `The provider rejected the request (HTTP ${result.code}).`);
    }
  }
}

export function startGuestNotifications() {
  let busy = false;
  const run = async () => {
    if (busy) return;
    busy = true;
    try { await processGuestNotifications(); } catch (error) {
      console.error('Guest notification queue failed:', error.code || error.name);
    } finally { busy = false; }
  };
  void run();
  setInterval(run, 10000).unref();
}
