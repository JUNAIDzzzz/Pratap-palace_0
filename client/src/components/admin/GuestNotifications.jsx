import { useEffect, useState } from 'react';
import { api } from '../../services/bookingApi';

const eventLabels = { confirmation: 'Booking confirmation', quote: 'Event quote', reminder: 'Hold expiry reminder' };
const departmentLabels = { rooms: 'Rooms', dining: 'Dining', events: 'Events' };
const channelLabels = { email: 'Email', whatsapp: 'WhatsApp' };
const statusLabels = {
  queued: 'Queued', sending: 'Sending', accepted: 'Accepted by provider', sent: 'Sent', delayed: 'Delivery delayed',
  delivered: 'Delivered', read: 'Read', failed: 'Failed', bounced: 'Bounced', complained: 'Complaint',
  suppressed: 'Suppressed', unknown: 'Delivery unknown', skipped: 'Skipped', disabled: 'Not configured',
};
const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const field = 'mt-1 block w-full rounded border border-brown/25 bg-offwhite px-3 py-2.5 text-sm';
const button = 'rounded border border-brown/25 px-4 py-2 text-sm disabled:opacity-50';
const good = new Set(['delivered', 'read']);
const issue = new Set(['failed', 'bounced', 'complained', 'suppressed', 'unknown']);

export default function GuestNotifications() {
  const [search, setSearch] = useState('');
  const [channel, setChannel] = useState('');
  const [department, setDepartment] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState(null);
  const [setup, setSetup] = useState(null);
  const query = new URLSearchParams({ search, channel, department, page }).toString();
  const key = `${query}:${refresh}`;
  const current = result?.key === key ? result : null;
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      api(`/admin/notifications?${query}`).then(data => {
        if (active) { setResult({ key, data }); setSetup({ channels: data.channels, departments: data.departments }); }
      }).catch(error => { if (active) setResult({ key, error: error.message }); });
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [query, key]);

  return <section aria-label="Guest notification delivery" className="mx-auto max-w-6xl space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">Track booking confirmations, event quotes, and hold reminders. Times are shown in IST.</p>
      <button className={button} onClick={() => setRefresh(value => value + 1)}>Refresh delivery status</button>
    </div>
    {setup && <div className="flex flex-wrap gap-2 text-xs">
      {Object.entries(setup.channels).map(([type, enabled]) => <span key={type} className={`rounded px-3 py-1.5 ${enabled ? 'bg-green-100 text-green-950' : 'bg-sand/60'}`}>
        {channelLabels[type]} · {enabled ? 'Configured' : 'Not configured'}
      </span>)}
    </div>}
    <div className="rounded-xl border border-brown/15 bg-offwhite">
      <div className="grid gap-3 border-b border-brown/15 p-4 text-sm sm:grid-cols-3">
        <label>Booking reference<input className={field} value={search} maxLength={100} onChange={event => { setSearch(event.target.value); setPage(1); }}/></label>
        <label>Channel<select className={field} value={channel} onChange={event => { setChannel(event.target.value); setPage(1); }}>
          <option value="">All channels</option><option value="email">Email</option><option value="whatsapp">WhatsApp</option>
        </select></label>
        <label>Department<select className={field} value={department} onChange={event => { setDepartment(event.target.value); setPage(1); }}>
          <option value="">All departments</option>
          {setup?.departments.map(kind => <option key={kind} value={kind}>{departmentLabels[kind]}</option>)}
        </select></label>
      </div>
      {!current && <p role="status" className="p-5 text-sm">Loading notifications…</p>}
      {current?.error && <p role="alert" className="p-5 text-sm text-red-900">{current.error}</p>}
      {current?.data?.items.length === 0 && <p className="p-8 text-center text-sm text-muted">No notifications match these filters.</p>}
      <ul className="divide-y divide-brown/10">
        {current?.data?.items.map(item => <li key={item.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 p-4">
          <div>
            <p className="font-medium">{eventLabels[item.event]}</p>
            <p className="mt-1 text-sm text-muted">{item.reference} · {departmentLabels[item.department]} · {channelLabels[item.channel]}</p>
            {item.reason && <p className="mt-1 text-xs text-muted">{item.reason}</p>}
            {item.status === 'queued' && <p className="mt-1 text-xs text-muted">Scheduled for {dateFormat.format(item.dueAt)} IST</p>}
          </div>
          <div className="flex flex-col items-start gap-2">
            <span className={`rounded px-2 py-1 text-xs ${good.has(item.status) ? 'bg-green-100 text-green-950' : issue.has(item.status) ? 'bg-red-100 text-red-950' : 'bg-sand/50'}`}>
              {statusLabels[item.status] ?? item.status}
            </span>
            <time className="text-xs text-muted" dateTime={new Date(item.updatedAt).toISOString()}>{dateFormat.format(item.updatedAt)} IST</time>
          </div>
        </li>)}
      </ul>
    </div>
    {current?.data && <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <p>{current.data.total} notification{current.data.total === 1 ? '' : 's'}</p>
      <div className="flex items-center gap-2">
        <button className={button} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
        <span>Page {page} of {Math.max(1, current.data.pages)}</span>
        <button className={button} disabled={page >= current.data.pages} onClick={() => setPage(value => value + 1)}>Next</button>
      </div>
    </div>}
  </section>;
}
