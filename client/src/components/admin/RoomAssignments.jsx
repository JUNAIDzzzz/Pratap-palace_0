import { useEffect, useState } from 'react';
import { api } from '../../services/bookingApi';

export default function RoomAssignments({ bookingId }) {
  const [data, setData] = useState(null);
  const [selection, setSelection] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const path = `/admin/bookings/${bookingId}/rooms`;

  function apply(result) {
    setData(result);
    setSelection(result.rooms.filter(room => room.assigned).map(room => room.id));
  }

  useEffect(() => {
    let current = true;
    api(path).then(result => { if (current) apply(result); })
      .catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [path]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      apply(await api(path, { method: 'PUT', body: { roomIds: selection } }));
      setMessage('Room assignments saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const listedRooms = data?.editable ? data.rooms : data?.rooms.filter(room => room.assigned);

  return <form onSubmit={save} className="mt-6 border-t border-brown/15 pt-5">
    <h4 className="font-display text-xl">Room assignment</h4>
    {!data && !error && <p role="status" className="mt-2 text-sm text-muted">Loading room numbers…</p>}
    {data?.editable && <p className="mt-2 text-sm text-muted">{selection.length} of {data.quantity} selected. Register room numbers in Rooms &amp; housekeeping.</p>}
    {!!listedRooms?.length && <fieldset disabled={busy} className="mt-3 grid gap-2 sm:grid-cols-2">
      <legend className="sr-only">Room numbers</legend>
      {listedRooms.map(room => {
        const selected = selection.includes(room.id);
        return <label key={room.id} className="flex items-center gap-2 rounded border border-brown/15 p-3 text-sm">
          {data.editable && <input type="checkbox" checked={selected}
            disabled={!selected && (room.unavailable || selection.length >= data.quantity)}
            onChange={() => {
              setMessage('');
              setSelection(ids => selected ? ids.filter(id => id !== room.id) : [...ids, room.id]);
            }}/>}
          <span>Room {room.number} <span className="text-xs text-muted">· {room.unavailable && !selected ? 'Unavailable for these dates' : room.housekeeping}</span></span>
        </label>;
      })}
    </fieldset>}
    {data && !listedRooms.length && <p className="mt-2 text-sm text-muted">{data.editable ? 'No room numbers are registered for this room type.' : 'No room numbers were assigned.'}</p>}
    {data?.editable && !!listedRooms.length && <button disabled={busy} className="mt-3 rounded border border-brown/25 px-4 py-2 text-sm disabled:opacity-50">Save room assignments</button>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-green-800">{message}</p>}
  </form>;
}
