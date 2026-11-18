import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Users } from 'lucide-react';
import BookingSearch from '../components/booking/BookingSearch';
import NotificationPreference from '../components/booking/NotificationPreference';
import { api, money, localToday, nextDate } from '../services/bookingApi';

export default function Booking() {
  const params = new URLSearchParams(window.location.search);
  const preferredRoom = params.get('roomId') || 'any';
  const initial = { checkIn: params.get('checkIn') || localToday(), checkOut: params.get('checkOut') || nextDate(localToday()), guests: params.get('guests') || '2', quantity: params.get('quantity') || '1', promoCode: params.get('promoCode') || '' };
  const [results, setResults] = useState(null), [selected, setSelected] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [confirmation, setConfirmation] = useState(null);
  const requestKey = useRef(null);
  const formRef = useRef(null);
  useEffect(() => {
    let live = true;
    api(`/availability?${new URLSearchParams(initial)}`).then(data => {
      if (!live) return;
      setResults(data);
      const preferred = data.rooms.find(room => room.id === preferredRoom);
      if (preferred) setSelected(preferred);
    }).catch(err => { if (live) setError(err.message); });
    return () => { live = false; };
  }, []);
  function choose(room) { setSelected(room); setError(''); requestKey.current = null; setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }
  async function reserve(event) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    const payload = { ...Object.fromEntries(new FormData(event.currentTarget)), ...results.query, roomId: selected.id, expectedTotal: selected.quote.total };
    const signature = JSON.stringify(payload);
    if (!requestKey.current || requestKey.current.signature !== signature) requestKey.current = { signature, key: crypto.randomUUID() };
    try { setConfirmation(await api('/bookings', { method: 'POST', body: payload, key: requestKey.current.key })); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const field = 'mt-2 w-full border border-brown/25 bg-offwhite px-4 py-3 text-sm';
  if (confirmation) return <main className="flex min-h-screen items-center justify-center bg-offwhite p-6"><div className="max-w-xl border border-brown/20 bg-sand/30 p-8 md:p-12"><CheckCircle2 className="mb-6 text-brown" size={36}/><p className="text-xs uppercase tracking-widest">Reservation request received</p><h1 className="mt-4 font-display text-4xl">Thank you, {confirmation.name}.</h1><p className="mt-5 leading-7">Your reference is <strong>{confirmation.reference}</strong>. Your reservation is pending hotel confirmation. Please save this reference; no payment has been taken.</p><dl className="mt-6 space-y-3 border-y border-brown/20 py-6 text-sm"><div>{confirmation.roomName} · {confirmation.quantity} room(s) · {confirmation.guests} guest(s)</div><div>{confirmation.checkIn} → {confirmation.checkOut} · {confirmation.nights} night(s)</div><div>Total amount: <strong>{money(confirmation.total)}</strong></div></dl><div className="mt-8 flex flex-wrap gap-x-6 gap-y-4"><a className="border-b border-brown/40 pb-1" href="/">Return to hotel</a></div></div></main>;
  return <main className="min-h-screen bg-offwhite px-6 py-10 text-brown lg:px-10"><div className="mx-auto max-w-7xl"><p className="text-xs uppercase tracking-[.25em] text-caramel">YOUR NEXT STAY</p><h1 className="mb-9 mt-4 font-display text-5xl">Find your room.</h1><BookingSearch initial={initial} preferredRoom={preferredRoom}/>{results && preferredRoom !== "any" && !results.rooms.some(room => room.id === preferredRoom) && <p role="status" className="mt-5 text-sm text-muted">The room type you selected is unavailable for this search. Try different dates or choose another available room.</p>}<div aria-live="polite">{error && <p role="alert" className="my-6 border border-red-300 bg-red-50 p-4 text-red-800">{error}</p>}</div>{!results && !error && <p className="py-12">Checking availability…</p>}{results && <><p className="my-8 text-sm text-muted">{results.rooms.length ? `${results.rooms.length} room types available. Prices are in INR for your complete stay. No online payment is required.` : 'No rooms are currently bookable for these dates and guests. Try different dates or contact the hotel.'}</p><div className="grid gap-8 lg:grid-cols-3">{results.rooms.map(room => <article key={room.id} className={`overflow-hidden border ${selected?.id === room.id ? 'border-brown' : 'border-brown/15'}`}><img src={room.image} alt={room.name} className="aspect-[4/3] w-full object-cover"/><div className="p-6"><h2 className="font-display text-2xl">{room.name}</h2><p className="mt-3 text-sm leading-6 text-muted">{room.description}</p><p className="mt-4 flex items-center gap-2 text-xs text-muted"><Users size={14}/>Up to {room.guests} guests per room · {room.available} rooms available</p><p className="mt-5 text-xl">{money(room.quote.total)} <span className="text-xs text-muted">Total amount</span></p><p className="mt-1 text-xs text-muted">{money(room.rate)} / room / night · {room.quote.nights} night(s) · {room.quote.quantity} room(s)</p>{room.quote.discount > 0 && <p className="mt-2 text-xs">Offer savings: {money(room.quote.discount)}</p>}<button onClick={() => choose(room)} className="mt-6 w-full bg-brown px-6 py-3 text-sm text-offwhite">{selected?.id === room.id ? 'Selected' : 'Choose room'}</button></div></article>)}</div>{selected && <form ref={formRef} onSubmit={reserve} className="mx-auto mt-16 max-w-3xl border border-brown/20 p-6 md:p-10"><h2 className="font-display text-3xl">Your details</h2><p className="mt-3 text-sm text-muted">{selected.name} · {money(selected.quote.total)} total · Pending hotel confirmation</p><div className="mt-8 grid gap-5 sm:grid-cols-2"><label className="text-sm">Full name<input name="name" required autoComplete="name" maxLength={100} className={field}/></label><label className="text-sm">Email<input name="email" required type="email" autoComplete="email" maxLength={254} className={field}/></label><label className="text-sm sm:col-span-2">Phone<input name="phone" required type="tel" autoComplete="tel" minLength={7} maxLength={25} className={field}/></label><label className="text-sm sm:col-span-2">Special requests (optional)<textarea name="notes" maxLength={1000} rows={3} className={field}/></label></div><label className="mt-6 flex items-start gap-3 text-xs leading-6"><input type="checkbox" required className="mt-1"/>I understand this submits a reservation request subject to hotel confirmation. No payment is collected here.</label><NotificationPreference/><button disabled={busy} className="mt-6 w-full bg-brown px-6 py-4 text-offwhite disabled:opacity-50">{busy ? 'Submitting…' : `Request reservation · ${money(selected.quote.total)}`}</button></form>}</>}</div></main>;
}
