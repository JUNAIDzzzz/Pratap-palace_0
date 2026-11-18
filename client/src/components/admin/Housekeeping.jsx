import { useEffect, useState } from 'react';
import { api, localToday, nextDate } from '../../services/bookingApi';

const statuses = { ready: 'Ready', dirty: 'Dirty', cleaning: 'Cleaning' };
const colors = { ready: 'bg-green-100 text-green-900', dirty: 'bg-amber-100 text-amber-900', cleaning: 'bg-blue-100 text-blue-900' };
const panel = 'rounded-xl border border-brown/15 bg-offwhite p-4 sm:p-6';
const field = 'mt-1 block w-full rounded border border-brown/25 bg-offwhite px-3 py-2';
const button = 'rounded border border-brown/25 px-4 py-2 text-sm disabled:opacity-50';

export default function Housekeeping({ roomTypes, onReservations }) {
  const today = localToday();
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState('');
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const board = result?.date === date && result.revision === revision ? result.data : null;
  const roomTypeNames = new Map(roomTypes.map(type => [type.id, type.name]));

  useEffect(() => {
    if (!date) return;
    let current = true;
    api(`/admin/housekeeping?${new URLSearchParams({ date })}`)
      .then(data => { if (current) setResult({ date, revision, data }); })
      .catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [date, revision]);

  async function change(path, method, body, message, form) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await api(path, { method, body });
      form?.reset();
      setNotice(message);
      setRevision(value => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function submit(event, path, message) {
    event.preventDefault();
    const form = event.currentTarget;
    change(path, 'POST', Object.fromEntries(new FormData(form)), message, form);
  }

  const visibleRooms = board?.rooms.filter(room => !filter || room.room_type === filter);

  return <section aria-label="Housekeeping board" className="mx-auto max-w-6xl space-y-5">
    <div className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">Room numbers</h2>
          <p className="mt-2 text-sm text-muted">Register rooms from your existing inventory. Assign them from the reservation’s Manage panel.</p>
        </div>
        <button className={button} onClick={onReservations}>Open reservations</button>
      </div>
      <form onSubmit={event => submit(event, '/admin/housekeeping/rooms', 'Room number added.')} className="mt-4 grid items-end gap-3 text-sm sm:grid-cols-[1fr_1fr_auto]">
        <label>Room number<input className={field} name="number" placeholder="e.g. 101" required maxLength={20}/></label>
        <label>Room type<select className={field} name="roomType" required>
          <option value="">Choose a room type</option>
          {roomTypes.map(type => <option key={type.id} value={type.id}>{type.name} · {type.inventory} total</option>)}
        </select></label>
        <button disabled={busy} className="rounded bg-brown px-4 py-2.5 text-offwhite disabled:opacity-50">Add room number</button>
      </form>
    </div>
    {error && <p role="alert" className="rounded bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    <div className="flex flex-wrap items-end gap-3 text-sm">
      <label>Occupancy date (IST)<input className={field} type="date" value={date} onChange={event => {
        setError('');
        setDate(event.target.value || today);
      }}/></label>
      <label>Room type<select className={field} value={filter} onChange={event => setFilter(event.target.value)}>
        <option value="">All room types</option>
        {roomTypes.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
      </select></label>
      <button className={button} disabled={busy} onClick={() => { setError(''); setRevision(value => value + 1); }}>Refresh board</button>
    </div>
    {!board && !error && <p role="status" className="text-sm text-muted">Loading housekeeping…</p>}
    {board && !visibleRooms.length && <p className={`${panel} text-sm text-muted`}>No room numbers match this room type.</p>}
    <div className="grid gap-4 lg:grid-cols-2">
      {visibleRooms?.map(room => {
        const reservations = board.reservations.filter(item => item.roomId === room.id);
        const blocks = board.blocks.filter(item => item.physical_room_id === room.id);
        const blocked = blocks.some(block => block.starts <= date && block.ends > date);
        return <article className={panel} key={room.id}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><h3 className="font-display text-xl">Room {room.number}</h3><p className="text-sm text-muted">{roomTypeNames.get(room.room_type) ?? room.room_type}</p></div>
            <div className="flex flex-wrap gap-1.5">
              <span className={`rounded-full px-2.5 py-1 text-xs ${colors[room.housekeeping]}`}>{statuses[room.housekeeping]}</span>
              {blocked && <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs text-red-900">Maintenance</span>}
            </div>
          </div>
          <div className="mt-3 text-sm">
            {reservations.length ? <ul className="space-y-1">{reservations.map(item => <li key={item.reference}>{item.name} · {item.reference} · {item.status.replaceAll('_', ' ')}</li>)}</ul>
              : <p className="text-muted">No assigned stay on this date.</p>}
          </div>
          <label className="mt-4 block max-w-xs text-sm">Housekeeping status
            <select className={field} aria-label={`Housekeeping status for room ${room.number}`} disabled={busy} value={room.housekeeping}
              onChange={event => change(`/admin/housekeeping/rooms/${room.id}`, 'PATCH', { status: event.target.value }, `Room ${room.number} status updated.`)}>
              {Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <details className="mt-4 border-t border-brown/15 pt-3">
            <summary className="cursor-pointer text-sm">Maintenance blocks{blocks.length ? ` (${blocks.length})` : ''}</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {blocks.map(block => <li key={block.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-sand/30 p-2">
                <div><p>{block.starts} to {block.ends}</p><p className="text-muted">{block.reason}</p></div>
                {block.ends > today && <button className={button} disabled={busy}
                  onClick={() => change(`/admin/housekeeping/maintenance/${block.id}`, 'DELETE', {}, 'Room returned to available inventory.')}>Release block</button>}
              </li>)}
            </ul>
            <form className="mt-3 grid gap-2 text-sm sm:grid-cols-2" onSubmit={event => submit(event, `/admin/housekeeping/rooms/${room.id}/maintenance`, 'Maintenance block saved.')}>
              <label>First blocked night<input className={field} type="date" name="starts" min={today} defaultValue={date >= today ? date : today} required/></label>
              <label>Available again<input className={field} type="date" name="ends" min={nextDate(today)} required/></label>
              <label className="sm:col-span-2">Reason<input className={field} name="reason" required maxLength={200}/></label>
              <div className="sm:col-span-2"><button className={button} disabled={busy}>Block room</button></div>
            </form>
          </details>
        </article>;
      })}
    </div>
  </section>;
}
