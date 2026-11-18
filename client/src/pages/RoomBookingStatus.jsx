import { useState } from 'react';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import GuestLayout from '../components/hospitality/GuestLayout';
import { api, money } from '../services/bookingApi';
import { useSiteContent } from '../services/siteContent';

const statuses = {
  pending: ['Pending confirmation', 'The hotel has received your request and will review it before confirming your stay.', 'bg-amber-100 text-amber-950'],
  confirmed: ['Confirmed', 'Your reservation is confirmed. We look forward to welcoming you.', 'bg-emerald-100 text-emerald-950'],
  checked_in: ['Checked in', 'The hotel has recorded your arrival.', 'bg-emerald-100 text-emerald-950'],
  completed: ['Completed', 'The hotel has marked your stay as completed.', 'bg-sand text-brown'],
  cancelled: ['Cancelled', 'This reservation has been cancelled. Contact reception if you have questions.', 'bg-red-100 text-red-950'],
};
const formatDate = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
const field = 'mt-2 w-full rounded-sm border border-brown/30 bg-white/50 px-4 py-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown';

function StayDetails({ booking }) {
  const [label, message, color] = statuses[booking.status] ?? ['Status unavailable', 'Contact reception for an update.', 'bg-sand text-brown'];
  const details = [
    ['Check-in', formatDate.format(new Date(booking.checkIn))],
    ['Checkout', formatDate.format(new Date(booking.checkOut))],
    ['Room type', booking.roomName],
    ['Party size', `${booking.quantity} ${booking.quantity === 1 ? 'room' : 'rooms'} · ${booking.guests} ${booking.guests === 1 ? 'guest' : 'guests'}`],
  ];
  return <section aria-labelledby="stay-details-title" className="mt-7 rounded-sm border border-brown/20 bg-sand/30 p-6 sm:p-8">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs font-semibold tracking-widest">{booking.reference}</p>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{label}</span>
    </div>
    <h2 id="stay-details-title" className="mt-4 font-display text-3xl">Your stay</h2>
    <p className="mt-3 text-sm leading-6 text-muted">{message}</p>
    <dl className="mt-5 grid grid-cols-2 gap-5 border-y border-brown/20 py-5 text-sm">
      {details.map(([name, value]) => <div key={name}>
        <dt className="text-xs text-muted">{name}</dt>
        <dd className="mt-1 font-medium">{value}</dd>
      </div>)}
    </dl>
    <dl className="mt-5 flex items-baseline justify-between gap-3">
      <dt className="text-sm">Total at booking</dt>
      <dd className="font-display text-xl">{money(booking.total)}</dd>
    </dl>
    {booking.status !== 'cancelled' && <p className="mt-2 text-xs leading-5 text-muted">Contact reception to confirm any remaining balance.</p>}
  </section>;
}

export default function RoomBookingStatus() {
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const { contact } = useSiteContent();

  async function check(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setBooking(null);
    setError('');
    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      setBooking(await api('/bookings/status', { method: 'POST', body }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return <GuestLayout>
    <div className="mx-auto max-w-xl">
      <CalendarDays size={25} strokeWidth={1.5} aria-hidden="true"/>
      <h1 className="mt-4 font-display text-4xl sm:text-5xl">My room booking</h1>
      <p className="mt-4 leading-7 text-muted">Enter your booking reference and the email address you used to reserve your room.</p>
      <form onSubmit={check} className="mt-7 space-y-5 rounded-sm border border-brown/20 p-6 sm:p-8">
        <label className="block text-sm font-medium">Booking reference
          <input name="reference" required maxLength={30} autoCapitalize="characters" spellCheck={false} placeholder="PP-XXXXXXXXXXXX" className={field}/>
        </label>
        <label className="block text-sm font-medium">Email address
          <input name="email" required type="email" autoComplete="email" maxLength={254} className={field}/>
        </label>
        <button type="submit" disabled={busy} className="w-full rounded-sm bg-brown px-6 py-4 text-sm font-medium text-offwhite transition hover:bg-brown/90 disabled:opacity-60">{busy ? 'Checking…' : 'Check booking status'}</button>
        {error && <p role="alert" className="text-sm leading-6 text-red-800">{error}</p>}
      </form>
      <div aria-live="polite">{booking && <StayDetails booking={booking}/>}</div>
      <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <span className="text-muted">Need help finding your booking?</span>
        {(contact.phone || contact.email) ?
          <a href={contact.phone ? `tel:${contact.phone.replace(/[^\d+]/g, '')}` : `mailto:${contact.email}`} className="inline-flex items-center gap-1.5 border-b border-brown pb-0.5">Contact reception <ArrowUpRight size={14} aria-hidden="true"/></a>
          : <span className="text-muted">Ask the hotel reception for help.</span>}
      </div>
    </div>
  </GuestLayout>;
}
