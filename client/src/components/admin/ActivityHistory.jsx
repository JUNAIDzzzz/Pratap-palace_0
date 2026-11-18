import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api, money } from '../../services/bookingApi';

const categories = {
  booking: { label: 'Booking', color: 'bg-indigo-100 text-indigo-950' },
  rate: { label: 'Rate', color: 'bg-amber-100 text-amber-950' },
  offer: { label: 'Offer', color: 'bg-violet-100 text-violet-950' },
  payment: { label: 'Payment', color: 'bg-emerald-100 text-emerald-950' },
};
const departments = { rooms: 'Rooms', dining: 'Dining', events: 'Events' };
const actorNames = { guest: 'Guest', system: 'System' };
const initialFilters = { category: '', department: '', search: '', from: '', to: '' };
const timestamp = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Asia/Kolkata' });
const field = 'mt-1 block min-h-10 w-full rounded border border-brown/25 bg-offwhite px-3 py-2 text-sm';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded border border-brown/25 px-3 text-sm disabled:opacity-40';

function displayValue(value, format) {
  if (format === 'money') return money(value);
  if (format === 'percent') return `${value}%`;
  if (format === 'enabled') return value ? 'Enabled' : 'Disabled';
  if (format === 'status') return value.replaceAll('_', ' ');
  return String(value);
}

function ActivityItem({ item }) {
  const { label, color } = categories[item.category];
  return <li className="px-4 py-4 sm:px-6" aria-label={item.action}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded px-2 py-0.5 font-medium ${color}`}>{label}</span>
          <span className="text-muted">{departments[item.department]}</span>
        </div>
        <h3 className="break-words font-semibold">{item.action}</h3>
        <p className="mt-1 break-words text-sm text-muted">{item.target} · {actorNames[item.actorType] ?? item.actor}</p>
      </div>
      <time dateTime={item.createdAt} className="text-xs text-muted">{timestamp.format(new Date(item.createdAt))} IST</time>
    </div>
    {item.changes.length > 0 && <dl className="mt-3 grid gap-2 rounded bg-sand/25 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
      {item.changes.map(change => <div key={change.label}>
        <dt className="text-xs text-muted">{change.label}</dt>
        <dd className="mt-1 break-words">
          {change.from !== undefined && <>
            <span className="sr-only">From </span>{displayValue(change.from, change.format)}
            <span className="mx-1 text-muted" aria-hidden="true">→</span><span className="sr-only"> to </span>
          </>}
          <span className="font-medium">{displayValue(change.value, change.format)}</span>
        </dd>
      </div>)}
    </dl>}
  </li>;
}

export default function ActivityHistory() {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState(null);
  const [scope, setScope] = useState(null);
  const query = new URLSearchParams({ ...filters, page }).toString();
  const requestId = `${query}:${version}`;
  const current = result?.requestId === requestId ? result : null;

  useEffect(() => {
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/admin/activity?${query}`);
        if (active) {
          setScope(data.scope);
          setResult({ requestId, data });
        }
      } catch (error) {
        if (active) setResult({ requestId, error: error.message });
      }
    }, 180);
    return () => { active = false; clearTimeout(timer); };
  }, [query, requestId]);

  function filter(key, value) {
    setFilters(previous => ({ ...previous, [key]: value }));
    setPage(1);
  }

  const visibleCategories = Object.entries(scope ?? {}).filter(([, kinds]) => kinds.length);
  const visibleDepartments = [...new Set(visibleCategories.flatMap(([, kinds]) => kinds))];
  const data = current?.data;

  return <section aria-label="Activity history" className="mx-auto max-w-6xl">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">Review changes made by staff and guests. Times are shown in IST.</p>
      <button className={button} onClick={() => setVersion(value => value + 1)} aria-label="Refresh activity history">
        <RefreshCw size={15} aria-hidden="true"/> Refresh
      </button>
    </div>
    <div className="rounded-xl border border-brown/15 bg-offwhite">
      <div className="grid gap-3 border-b border-brown/15 p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <label className="text-xs">Search history
          <input className={field} value={filters.search} maxLength={100} placeholder="Staff username, reference or action" onChange={event => filter('search', event.target.value)}/>
        </label>
        <label className="text-xs">Activity type
          <select className={field} value={filters.category} onChange={event => filter('category', event.target.value)}>
            <option value="">All types</option>
            {visibleCategories.map(([key]) => <option key={key} value={key}>{categories[key].label}</option>)}
          </select>
        </label>
        <label className="text-xs">Department
          <select className={field} value={filters.department} onChange={event => filter('department', event.target.value)}>
            <option value="">All departments</option>
            {visibleDepartments.map(key => <option key={key} value={key}>{departments[key]}</option>)}
          </select>
        </label>
        <label className="text-xs">From date<input type="date" className={field} value={filters.from} max={filters.to || undefined} onChange={event => filter('from', event.target.value)}/></label>
        <label className="text-xs">To date<input type="date" className={field} value={filters.to} min={filters.from || undefined} onChange={event => filter('to', event.target.value)}/></label>
      </div>
      {!current && <p role="status" className="p-5 text-sm text-muted">Loading activity…</p>}
      {current?.error && <p role="alert" className="bg-red-50 p-5 text-sm text-red-900">{current.error}</p>}
      {data && !data.items.length && <p className="p-8 text-center text-sm text-muted">No activity matches these filters.</p>}
      {!!data?.items.length && <ol aria-label="Change log" className="divide-y divide-brown/10">
        {data.items.map(item => <ActivityItem key={item.id} item={item}/>)}
      </ol>}
    </div>
    {data && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <p>{data.total} {data.total === 1 ? 'entry' : 'entries'}</p>
      <div className="flex items-center gap-2">
        <button className={button} disabled={page <= 1} aria-label="Previous page" onClick={() => setPage(value => value - 1)}><ChevronLeft size={16} aria-hidden="true"/></button>
        <span>Page {page} of {Math.max(1, data.pages)}</span>
        <button className={button} disabled={page >= data.pages} aria-label="Next page" onClick={() => setPage(value => value + 1)}><ChevronRight size={16} aria-hidden="true"/></button>
      </div>
    </div>}
  </section>;
}
