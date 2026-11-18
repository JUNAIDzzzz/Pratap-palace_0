import { useState } from 'react';
import { localToday, nextDate } from '../../services/bookingApi';

function DateInput({ emptyPlaceholder = false, ...props }) {
  const [focused, setFocused] = useState(false);
  return <input {...props} type={emptyPlaceholder && !props.value && !focused ? 'text' : 'date'} placeholder="Select date" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}/>;
}

export default function BookingSearch({ initial = {}, preferredRoom = 'any', compact = false }) {
  const today = localToday();
  const [checkIn, setCheckIn] = useState(initial.checkIn || (compact ? '' : today));
  const [checkOut, setCheckOut] = useState(initial.checkOut || (compact ? '' : nextDate(today)));
  const [guests, setGuests] = useState(initial.guests || (compact ? '' : 2));
  const [quantity, setQuantity] = useState(initial.quantity || (compact ? '' : 1));
  const [error, setError] = useState('');
  const label = `flex min-w-0 flex-col justify-center gap-1 px-4 py-3 text-[10px] uppercase tracking-widest ${compact ? 'text-offwhite/75' : 'text-muted'}`;
  const divider = compact ? 'border-offwhite/30' : 'border-brown/15';
  const input = `min-w-0 w-full bg-transparent text-sm normal-case tracking-normal outline-none ${compact ? 'text-offwhite placeholder:text-offwhite/60 [color-scheme:dark]' : 'text-brown'}`;
  function search(event) {
    event.preventDefault();
    if (Number(guests) < Number(quantity)) { setError('Please select at least one guest per room.'); return; }
    const values = Object.fromEntries(new FormData(event.currentTarget));
    window.location.assign(`/booking?${new URLSearchParams(values)}`);
  }
  return <form onSubmit={search} className={`w-full ${compact ? 'text-offwhite' : 'text-brown'}`}>
    <div className={`grid border ${compact ? 'border-offwhite/30 bg-transparent backdrop-blur-sm' : 'border-brown/15 bg-offwhite shadow-lg'} ${compact ? 'grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_.65fr_.65fr_1fr_auto]' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-[1.3fr_1fr_1fr_.65fr_.65fr_1fr_auto]'}`}>
      <div className={`${label} col-span-2 border-b ${divider} md:col-span-1 lg:border-b-0 lg:border-r`}><span>Hotel</span><span className={`font-display text-lg normal-case tracking-normal ${compact ? 'text-offwhite' : 'text-brown'}`}>Pratap Palace</span></div>
      <label className={`${label} lg:border-r ${divider}`}>Check-in<DateInput emptyPlaceholder={compact} aria-label="Check-in" name="checkIn" value={checkIn} min={today} required className={input} onChange={e => { const value=e.target.value; setCheckIn(value); if (value && value >= checkOut) setCheckOut(compact ? '' : nextDate(value)); }}/></label>
      <label className={`${label} lg:border-r ${divider}`}>Check-out<DateInput emptyPlaceholder={compact} aria-label="Check-out" name="checkOut" value={checkOut} min={nextDate(checkIn || today)} required className={input} onChange={e => setCheckOut(e.target.value)}/></label>
      <label className={`${label} lg:border-r ${divider}`}>Guests<input className={input} name="guests" type="number" placeholder="Guests" min={1} max={80} required value={guests} onChange={e => setGuests(e.target.value)}/></label>
      <label className={`${label} lg:border-r ${divider}`}>Rooms<input className={input} name="quantity" type="number" placeholder="Rooms" min={1} max={20} required value={quantity} onChange={e => setQuantity(e.target.value)}/></label>
      <label className={label}>Special code<input className={input} name="promoCode" placeholder="Optional code" maxLength={30} defaultValue={initial.promoCode || ''}/></label>
      <input name="roomId" type="hidden" value={preferredRoom}/>
      <button className={`col-span-2 px-7 py-5 text-sm font-semibold uppercase tracking-wide text-offwhite md:col-span-1 ${compact ? 'border-l border-offwhite/30 bg-transparent hover:bg-offwhite/10' : 'bg-caramel'}`}>Book now</button>
    </div>
    {error && <p role="alert" className="mt-2 bg-offwhite p-2 text-sm text-red-800">{error}</p>}
  </form>;
}
