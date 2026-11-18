import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api, localToday } from '../../services/bookingApi';

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const types = {
  rooms: { label: 'Rooms', color: 'bg-amber-100 text-amber-950' },
  dining: { label: 'Dining', color: 'bg-emerald-100 text-emerald-950' },
  events: { label: 'Events', color: 'bg-indigo-100 text-indigo-950' },
};
const hiddenStatuses = new Set(['cancelled', 'expired', 'declined']);
const monthLabel = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayLabel = new Intl.DateTimeFormat('en-IN', { dateStyle: 'full', timeZone: 'UTC' });
const holdLabel = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

function monthCells(month) {
  const first = new Date(month);
  const offset = (first.getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(1 + index - offset);
    return date.toISOString().slice(0, 10);
  });
}

function entryTime(entry, date) {
  if (entry.kind !== 'rooms') return `${entry.time}–${entry.endTime}`;
  if (entry.start === date) return 'Check-in';
  if (entry.end === date) return 'Check-out';
  return 'Staying';
}

export default function ReservationCalendar({ kinds }) {
  const today = localToday();
  const [selectedDay, setSelectedDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7) + '-01');
  const [type, setType] = useState('all');
  const [showClosed, setShowClosed] = useState(false);
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState(null);
  const dates = monthCells(month);
  const range = new URLSearchParams({ start: dates[0], end: dates.at(-1) }).toString();
  const requestId = `${range}:${version}`;
  const calendar = result?.requestId === requestId ? result : null;

  useEffect(() => {
    let active = true;
    api(`/admin/calendar?${range}`)
      .then(({ entries }) => { if (active) setResult({ requestId, entries }); })
      .catch(error => { if (active) setResult({ requestId, error: error.message }); });
    return () => { active = false; };
  }, [range, requestId]);

  const entries = (calendar?.entries ?? []).filter(entry =>
    (type === 'all' || entry.kind === type) && (showClosed || !hiddenStatuses.has(entry.status))
  );
  const entriesByDay = new Map(dates.map(date => [
    date,
    entries.filter(entry => entry.start <= date && entry.end >= date)
      .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || a.reference.localeCompare(b.reference)),
  ]));
  const selectedEntries = entriesByDay.get(selectedDay) ?? [];
  const visibleTypes = kinds.map(key => [key, types[key]]);

  function moveMonth(direction) {
    const target = new Date(month);
    target.setUTCMonth(target.getUTCMonth() + direction);
    const date = target.toISOString().slice(0, 10);
    setMonth(date);
    setSelectedDay(date.slice(0, 7) === today.slice(0, 7) ? today : date);
  }

  const control = 'inline-flex min-h-10 items-center justify-center rounded border border-brown/20 px-3 text-sm hover:bg-sand/40 focus-visible:outline-offset-0';

  return <section aria-label="Reservation calendar" className="mx-auto max-w-[95rem]">
    <p className="mb-5 text-sm text-muted">Reservations are shown in hotel time (IST).</p>
    <div className="overflow-hidden rounded-xl border border-brown/15 bg-offwhite">
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <button className={control} onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft size={18} aria-hidden="true"/></button>
          <h2 aria-live="polite" className="px-1 font-display text-xl sm:px-3 sm:text-2xl">{monthLabel.format(new Date(month))}</h2>
          <button className={control} onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight size={18} aria-hidden="true"/></button>
          <button className={control} onClick={() => { setMonth(today.slice(0, 7) + '-01'); setSelectedDay(today); }}>Today</button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {visibleTypes.length > 1 && <label className="flex items-center gap-2 text-sm">Type
            <select value={type} onChange={event => setType(event.target.value)} className="min-h-10 rounded border border-brown/20 bg-offwhite px-2">
              <option value="all">All reservations</option>
              {visibleTypes.map(([key, { label }]) => <option value={key} key={key}>{label}</option>)}
            </select>
          </label>}
          <button className={control} onClick={() => setVersion(value => value + 1)} aria-label="Refresh calendar"><RefreshCw size={16} aria-hidden="true"/></button>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 border-t border-brown/10 px-3 py-3 sm:px-5">
        <ul aria-label="Calendar legend" className="flex flex-wrap gap-2">
          {visibleTypes.map(([key, { label, color }]) => <li key={key} className={`rounded px-2 py-1 text-xs ${color}`}>{label}</li>)}
        </ul>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={showClosed} onChange={event => setShowClosed(event.target.checked)}/>
          Include cancelled, expired, and declined
        </label>
      </div>
      {calendar?.error && <p className="border-t border-brown/10 bg-red-50 px-5 py-3 text-sm text-red-800" role="alert">{calendar.error}</p>}
      <div className="grid grid-cols-7 text-center" aria-busy={!calendar}>
        {weekdays.map(day => <span key={day} className="border-t border-brown/15 bg-sand/35 py-2 text-xs text-muted">
          <span className="sr-only">{day}</span><span aria-hidden="true">{day.slice(0, 3)}</span>
        </span>)}
        {dates.map(date => {
          const dayEntries = entriesByDay.get(date);
          const selected = date === selectedDay;
          const count = calendar?.entries ? `, ${dayEntries.length} reservation${dayEntries.length === 1 ? '' : 's'}` : '';
          return <button type="button" key={date} onClick={() => setSelectedDay(date)}
            aria-label={dayLabel.format(new Date(date)) + count} aria-pressed={selected} aria-current={date === today ? 'date' : undefined}
            className={`min-h-13 min-w-0 border-r border-t border-brown/10 p-1 text-center last:border-r-0 hover:bg-sand/35 focus-visible:z-10 focus-visible:outline-offset-[-2px] lg:min-h-25 lg:p-2 lg:text-left ${selected ? 'bg-sand/50 ring-1 ring-inset ring-brown/50' : date.slice(0, 7) !== month.slice(0, 7) ? 'bg-sand/20' : ''}`}>
            <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${date === today ? 'bg-brown font-semibold text-offwhite' : 'text-muted'}`}>{Number(date.slice(8))}</span>
            {!!dayEntries.length && <span className="mx-auto block text-[10px] text-muted lg:hidden">{dayEntries.length}</span>}
            <span className="hidden space-y-1 lg:block" aria-hidden="true">
              {dayEntries.slice(0, 2).map(entry => <span key={entry.id} className={`block truncate rounded px-1 py-0.5 text-[10px] ${types[entry.kind].color}`}>{entryTime(entry, date)} · {entry.resource}</span>)}
              {dayEntries.length > 2 && <span className="block text-[10px] text-muted">+{dayEntries.length - 2} more</span>}
            </span>
          </button>;
        })}
      </div>
    </div>

    <section aria-label="Selected day" className="mt-5 rounded-xl border border-brown/15 bg-offwhite p-4 sm:p-6">
      <h2 aria-live="polite" className="font-display text-xl sm:text-2xl">{dayLabel.format(new Date(selectedDay))}</h2>
      {!calendar && <p className="mt-3 text-sm text-muted" role="status">Loading reservations…</p>}
      {calendar?.entries && !selectedEntries.length && <p className="mt-3 text-sm text-muted">No reservations match these filters for this day.</p>}
      <ul className="mt-2 divide-y divide-brown/10">
        {selectedEntries.map(entry => <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 py-4 text-sm">
          <div>
            <p className="font-semibold">{entry.resource} <span className="font-normal text-muted">· {entryTime(entry, selectedDay)}</span></p>
            <p className="mt-1 text-muted">{entry.guest} · {entry.guests} {entry.guests === 1 ? 'guest' : 'guests'}{entry.kind === 'rooms' && ` · ${entry.quantity} ${entry.quantity === 1 ? 'room' : 'rooms'}`}</p>
            {entry.holdUntil && <p className="mt-1 text-xs text-muted">Hold expires {holdLabel.format(entry.holdUntil)} IST</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-2 py-1 text-xs ${types[entry.kind].color}`}>{types[entry.kind].label}</span>
            <span className="rounded bg-sand/45 px-2 py-1 text-xs capitalize">{entry.status.replaceAll('_', ' ')}</span>
            <span className="text-xs text-muted">{entry.reference}</span>
          </div>
        </li>)}
      </ul>
    </section>
  </section>;
}
