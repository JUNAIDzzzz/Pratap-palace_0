import { useState } from 'react';
import { api, localToday } from '../../services/bookingApi';
export default function OfferManager({ offers, onSaved }) {
  const [editing, setEditing] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); setBusy(true); setError(''); setMessage(''); const data = new FormData(event.currentTarget);
    try {
      const details = { percent: Number(data.get('percent')), starts: data.get('starts'), ends: data.get('ends'), active: data.get('active') === 'on' };
      await api(editing ? `/admin/offers/${encodeURIComponent(editing.code)}` : '/admin/offers', {
        method: editing ? 'PUT' : 'POST',
        body: editing ? details : { ...details, code: data.get('code') },
      });
      onSaved(); setMessage('Offer saved.');
    }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const field = 'mt-2 w-full rounded border border-brown/20 bg-transparent p-3 text-sm';
  return <div className="grid gap-8 lg:grid-cols-2"><div><p className="mb-6 text-sm leading-7 text-muted">Offer codes apply a percentage discount to the complete room amount. Eligibility uses the guest’s check-in date. There are no offers until you create them.</p><div className="space-y-3">{offers.map(offer => <button key={offer.code} onClick={() => { setEditing(offer); setMessage(''); setError(''); }} className="flex w-full items-center justify-between rounded-xl border border-brown/15 bg-offwhite p-5 text-left"><span><strong>{offer.code}</strong><span className="mt-2 block text-xs text-muted">{offer.starts} → {offer.ends}</span></span><span className="text-sm">{offer.percent}% off · {offer.active ? 'Active' : 'Disabled'}</span></button>)}{!offers.length && <p className="rounded-xl border border-brown/15 p-6 text-sm">No offer codes yet.</p>}</div></div><form key={editing?.code || 'new'} onSubmit={save} className="self-start rounded-xl border border-brown/15 bg-offwhite p-6"><div className="flex justify-between gap-4"><h3 className="font-display text-2xl">{editing ? 'Edit offer' : 'Create an offer'}</h3>{editing && <button type="button" onClick={() => { setEditing(null); setMessage(''); }} className="text-xs underline">New offer</button>}</div><div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="text-xs">Code<input name="code" required pattern="[A-Za-z0-9_\-]{2,30}" maxLength={30} readOnly={Boolean(editing)} defaultValue={editing?.code || ''} className={field}/></label><label className="text-xs">Discount (%)<input name="percent" type="number" min={1} max={90} required defaultValue={editing?.percent || ''} className={field}/></label><label className="text-xs">Valid check-in from<input name="starts" type="date" required defaultValue={editing?.starts || localToday()} className={field}/></label><label className="text-xs">Valid check-in through<input name="ends" type="date" required defaultValue={editing?.ends || ''} className={field}/></label></div><label className="mt-6 flex items-center gap-3 text-sm"><input name="active" type="checkbox" defaultChecked={editing ? editing.active : true}/>Enable this offer</label>{error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}{message && <p role="status" className="mt-4 text-sm text-green-800">{message}</p>}<button disabled={busy} className="mt-6 w-full rounded bg-brown px-5 py-3 text-sm text-offwhite disabled:opacity-50">{busy ? 'Saving…' : 'Save offer'}</button></form></div>;
}
