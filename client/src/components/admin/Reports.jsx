import { useEffect, useState } from 'react';
import { ArrowDownToLine, Banknote, BedDouble, CalendarCheck, Wallet } from 'lucide-react';
import { departmentLabels, reportDefinitions } from '../../../../shared/reservationReports.mjs';
import { api, localToday, money } from '../../services/bookingApi';

const dayMs = 86400000;
const pageSize = 12;
const keys = Object.keys(reportDefinitions);
const field = 'mt-1.5 block min-h-10 w-full rounded border border-brown/25 bg-offwhite px-3 py-2 text-sm';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded border border-brown/25 px-3 text-sm disabled:opacity-40';
const panel = 'rounded-xl border border-brown/15 bg-offwhite';
const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const percent = value => value === null ? '—' : `${value.toFixed(1)}%`;

function thisMonth() {
  const from = localToday().slice(0, 7) + '-01';
  const last = new Date(from);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { from, to: last.toISOString().slice(0, 10) };
}

function cell(value, format) {
  if (format === 'money') return money(value);
  if (format === 'percent') return percent(value);
  if (format === 'timestamp') return dateTime.format(new Date(value));
  if (format === 'department') return departmentLabels[value];
  if (format === 'status') return value.replaceAll('_', ' ');
  return value;
}

function SummaryCard({ title, icon: Icon, value, children }) {
  return <article className={`${panel} min-w-0 p-4 sm:p-5`}>
    <div className="flex items-start justify-between gap-2">
      <h2 className="text-sm font-medium text-muted">{title}</h2>
      <Icon size={19} strokeWidth={1.5} className="shrink-0 text-brown" aria-hidden="true"/>
    </div>
    <p className="mt-3 break-words font-display text-2xl leading-tight sm:text-3xl">{value}</p>
    <div className="mt-3 text-xs leading-relaxed text-muted">{children}</div>
  </article>;
}

export default function Reports() {
  const [draft, setDraft] = useState(thisMonth);
  const [range, setRange] = useState(draft);
  const [selected, setSelected] = useState('arrivals');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const query = new URLSearchParams(range).toString();
  const requestId = `${query}:${revision}`;
  const current = result?.requestId === requestId ? result : null;
  const data = current?.data;
  const definition = reportDefinitions[selected];
  const rows = data?.reports[selected] ?? [];
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const visibleRows = rows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    let active = true;
    api(`/admin/reports?${query}`).then(value => {
      if (active) setResult({ requestId, data: value });
    }).catch(err => {
      if (active) setResult({ requestId, error: err.message });
    });
    return () => { active = false; };
  }, [query, requestId]);

  function apply(value) {
    setDraft(value);
    setRange(value);
    setPage(1);
    setRevision(count => count + 1);
  }

  function quickRange(days) {
    const from = localToday();
    const to = new Date(Date.parse(from) + (days - 1) * dayMs).toISOString().slice(0, 10);
    apply({ from, to });
  }

  return <section aria-label="Reservation reports" className="mx-auto max-w-7xl space-y-5">
    <div className={`${panel} p-4 sm:p-5`}>
      <form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); apply(draft); }}>
        <label className="text-sm">From date<input type="date" className={field} value={draft.from} max={draft.to || undefined}
          onChange={event => setDraft({ ...draft, from: event.target.value })} required/></label>
        <label className="text-sm">To date<input type="date" className={field} value={draft.to} min={draft.from || undefined}
          onChange={event => setDraft({ ...draft, to: event.target.value })} required/></label>
        <button className="min-h-10 rounded bg-brown px-4 text-sm font-medium text-offwhite">Apply dates</button>
      </form>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className={button} onClick={() => quickRange(1)}>Today</button>
        <button className={button} onClick={() => quickRange(7)}>Next 7 days</button>
        <button className={button} onClick={() => apply(thisMonth())}>This month</button>
        <span className="text-xs text-muted sm:ml-auto">Date range in IST · up to 366 days</span>
      </div>
    </div>
    {!current && <p role="status" className="text-sm text-muted">Loading reports…</p>}
    {current?.error && <p role="alert" className="rounded bg-red-50 p-4 text-sm text-red-900">{current.error}</p>}
    {data && <>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Reservation value" value={money(data.totals.reservationValue.total)} icon={CalendarCheck}>
          <p>Full value of confirmed reservations by check-in or service date.</p>
          <p className="mt-1">Rooms {money(data.totals.reservationValue.rooms)} · Dining {money(data.totals.reservationValue.dining)} · Events {money(data.totals.reservationValue.events)}</p>
        </SummaryCard>
        <SummaryCard title="Verified payments" value={money(data.totals.verifiedPayments.total)} icon={Banknote}>
          <p>Dining and event receipts by the date staff recorded them.</p>
          <p className="mt-1">Dining {money(data.totals.verifiedPayments.dining)} · Events {money(data.totals.verifiedPayments.events)}</p>
        </SummaryCard>
        <SummaryCard title="Outstanding payments" value={money(data.totals.outstanding)} icon={Wallet}>
          <p>Current unpaid balances for {data.reports.outstanding.length} eligible dining or event {data.reports.outstanding.length === 1 ? 'booking' : 'bookings'} in this period.</p>
          <p className="mt-1">Room payments aren’t tracked here.</p>
        </SummaryCard>
        <SummaryCard title="Booked room occupancy" value={percent(data.totals.occupancy.percent)} icon={BedDouble}>
          <p>{data.totals.occupancy.booked} booked of {data.totals.occupancy.sellable} sellable room nights.</p>
          <p className="mt-1">{data.totals.occupancy.pending} pending room nights.</p>
        </SummaryCard>
      </div>
      <div className={panel}>
        <div className="flex flex-wrap gap-2 border-b border-brown/15 p-3 sm:p-4" aria-label="Report type" role="group">
          {keys.map(key => <button key={key} aria-pressed={selected === key} onClick={() => {
            setSelected(key); setPage(1);
          }} className={`${button} ${selected === key ? 'bg-brown text-offwhite' : ''}`}>{reportDefinitions[key].title}</button>)}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl">{definition.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{definition.description}</p>
          </div>
          <a className={button} href={`/api/admin/reports/${selected}.csv?${query}`} download>
            <ArrowDownToLine size={16} aria-hidden="true"/>Download CSV
          </a>
        </div>
        {visibleRows.length ? <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{definition.title} from {data.from} to {data.to}</caption>
            <thead className="bg-sand/45 text-xs text-brown"><tr>
              {definition.columns.map(([key, label]) => <th key={key} scope="col" className="whitespace-nowrap px-4 py-3">{label}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-brown/10">
              {visibleRows.map(row => <tr key={row.reference ?? row.date}>
                {definition.columns.map(([key, , format]) => <td key={key} className={`whitespace-nowrap px-4 py-3 ${format === 'status' ? 'capitalize' : ''}`}>{cell(row[key], format)}</td>)}
              </tr>)}
            </tbody>
          </table>
        </div> : <p className="border-t border-brown/10 p-6 text-center text-sm text-muted">No records for the selected dates.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brown/15 p-4 text-sm text-muted">
          <p>{rows.length} {rows.length === 1 ? 'row' : 'rows'} · All rows included in the CSV</p>
          {pages > 1 && <div className="flex items-center gap-2">
            <button className={button} disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button className={button} disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next</button>
          </div>}
        </div>
      </div>
      <p className="text-xs text-muted">Generated {dateTime.format(new Date(data.generatedAt))} IST.</p>
    </>}
  </section>;
}
