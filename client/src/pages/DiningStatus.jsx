import { useState } from 'react';
import GuestLayout from '../components/hospitality/GuestLayout';
import HotelContact from '../components/hospitality/HotelContact';
import { api, money } from '../services/bookingApi';

const explanations = {
  pending_payment: 'Your table is temporarily held. Full payment must be verified by the hotel before your reservation is confirmed.',
  confirmed: 'Your dining reservation is confirmed.',
  seated: 'The hotel has marked your party as seated.',
  completed: 'Your dining reservation has been completed.',
  no_show: 'The hotel has marked this reservation as a no-show.',
  expired: 'Your unpaid table hold has expired. Please contact the hotel before making any payment.',
  payment_review: 'Your payment needs review by the hotel. Your reservation is not yet confirmed.',
};
export default function DiningStatus() {
  const [booking, setBooking] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function check(event) {
    event.preventDefault(); setBusy(true); setError(''); setBooking(null);
    try { setBooking(await api('/hospitality/dining/status', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) })); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const field = 'mt-2 w-full border border-brown/25 bg-transparent px-4 py-3 text-sm';
  return <GuestLayout><div className="mx-auto max-w-2xl">
    <p className="text-xs uppercase tracking-[.25em] text-caramel">DINING AT PRATAP PALACE</p>
    <h1 className="mt-5 font-display text-5xl">My booking.</h1>
    <p className="mt-5 leading-7 text-muted">Enter the reference shown after your dining request, along with the same email and phone number used for that booking.</p>
    <form onSubmit={check} className="mt-8 space-y-5 border border-brown/20 p-6 md:p-8">
      <label className="block text-xs">Booking reference<input name="reference" required maxLength={30} autoCapitalize="characters" placeholder="PD-XXXXXXXXXXXX" className={field}/></label>
      <label className="block text-xs">Email address<input name="email" required type="email" autoComplete="email" maxLength={254} className={field}/></label>
      <label className="block text-xs">Phone number, including country code<input name="phone" required type="tel" autoComplete="tel" maxLength={25} className={field}/></label>
      <button disabled={busy} className="w-full bg-brown px-6 py-4 text-sm text-offwhite disabled:opacity-50">{busy ? 'Checking…' : 'Check booking status'}</button>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </form>
    <div aria-live="polite">{booking && <section className="mt-7 border border-brown/20 bg-sand/30 p-6 md:p-8" aria-label="Dining booking status">
      <p className="text-xs tracking-widest">{booking.reference}</p>
      <h2 className="mt-4 font-display text-3xl capitalize">{booking.status.replaceAll('_', ' ')}</h2>
      <p className="mt-4 text-sm leading-7">{explanations[booking.status] || 'Please contact the hotel for an update.'}</p>
      <p className="mt-5 border-t border-brown/20 pt-5 text-sm leading-7">{booking.restaurant}<br/>{booking.date} · {booking.time} – {booking.endTime} IST</p>
      {booking.holdUntil && <p className="mt-3 text-xs text-muted">Hold expires: {new Date(booking.holdUntil).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>}
      {booking.balance > 0 && <p className="mt-4 text-sm">Outstanding amount <strong>{money(booking.balance)}</strong></p>}
      {['pending_payment', 'payment_review', 'expired'].includes(booking.status) && <div className="mt-4"><HotelContact reference={booking.reference}/></div>}
    </section>}</div>
    <a href="/dining" className="mt-8 inline-block border-b border-brown text-sm">Back to dining</a>
  </div></GuestLayout>;
}
