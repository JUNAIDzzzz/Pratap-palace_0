import { useState } from 'react';
import { api, money } from '../../services/bookingApi';

function settings(room) {
  return { rate: String(room.rate / 100), inventory: String(room.inventory), active: room.active, revision: room.settings_revision };
}

function RoomEditor({ room, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [draft, setDraft] = useState(null);
  const values = draft ?? settings(room);
  const stale = draft && draft.revision !== room.settings_revision;

  function edit(field, value) {
    setDraft(current => ({ ...(current ?? settings(room)), [field]: value }));
    setMessage('');
    setError('');
  }

  async function save(event) {
    event.preventDefault();
    if (busy || stale || !draft) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await api(`/admin/rooms/${room.id}`, {
        method: 'PATCH',
        body: { rate: Math.round(Number(values.rate) * 100), inventory: Number(values.inventory), active: values.active, revision: values.revision },
      });
      await onSaved();
      setDraft(null);
      setMessage('Room settings saved.');
    } catch (err) {
      setError(err.message);
      if (err.status === 409) await onSaved();
    } finally {
      setBusy(false);
    }
  }

  const field = 'mt-2 w-full rounded border border-brown/20 bg-transparent p-3';
  return <form onSubmit={save} className="overflow-hidden rounded-xl border border-brown/15 bg-offwhite">
    <img src={room.image} alt={room.name} className="aspect-[16/8] w-full object-cover"/>
    <div className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-display text-2xl">{room.name}</h3>
        <span className="rounded-full bg-sand/50 px-3 py-1 text-xs">{room.bookable ? 'Bookable' : 'Not bookable'}</span>
      </div>
      <p className="mt-3 text-xs text-muted">Up to {room.guests} guests per room · {room.size} m²</p>
      <fieldset disabled={busy || Boolean(stale)}>
        <div className="mt-6 grid grid-cols-2 gap-4">
          <label className="text-xs">Nightly rate (INR)<input name="rate" type="number" min="0" max="1000000" step="0.01" required
            value={values.rate} onChange={event => edit('rate', event.target.value)} className={field}/></label>
          <label className="text-xs">Total rooms of this type<input name="inventory" type="number" min="0" max="1000" required
            value={values.inventory} onChange={event => edit('inventory', event.target.value)} className={field}/></label>
        </div>
        <label className="mt-5 flex items-center gap-3 text-sm">
          <input type="checkbox" name="active" checked={values.active} onChange={event => edit('active', event.target.checked)}/>Accept new reservations
        </label>
      </fieldset>
      <p className="mt-4 text-xs leading-6 text-muted">Current saved rate: {money(room.rate)} per room per night. Existing reservation totals stay unchanged.</p>
      {stale ? <div className="mt-4 rounded bg-amber-50 p-3 text-sm text-amber-950">
        <p role="alert">These settings changed while you were editing. Load the latest settings before saving.</p>
        <button type="button" className="mt-2 underline underline-offset-2" onClick={() => { setDraft(null); setError(''); }}>Load latest room settings</button>
      </div> : error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-green-800">{message}</p>}
      <button disabled={busy || Boolean(stale) || !draft} className="mt-5 w-full rounded bg-brown px-5 py-3 text-sm text-offwhite disabled:opacity-50">
        {busy ? 'Saving…' : 'Save room settings'}
      </button>
    </div>
  </form>;
}

export default function RoomManager({ rooms, onSaved }) {
  return <>
    <p className="mb-6 max-w-3xl text-sm leading-7 text-muted">Set your actual rates and room counts before enabling reservations. Inventory represents the total physical rooms of each type. Pending and confirmed reservations both reserve inventory.</p>
    <div className="grid gap-6 xl:grid-cols-3">{rooms.map(room => <RoomEditor key={room.id} room={room} onSaved={onSaved}/>)}</div>
  </>;
}
