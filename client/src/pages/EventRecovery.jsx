import { useState } from 'react';
import GuestLayout from '../components/hospitality/GuestLayout';
import HotelContact from '../components/hospitality/HotelContact';
import { api } from '../services/bookingApi';

const field = 'mt-2 w-full border border-brown/25 bg-transparent px-4 py-3 text-base';

export default function EventRecovery() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function recover(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const credentials = Object.fromEntries(new FormData(event.currentTarget));
      const access = await api('/hospitality/events/recover', { method: 'POST', body: credentials });
      window.location.replace(`/manage#${new URLSearchParams(access)}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return <GuestLayout><div className="mx-auto max-w-xl">
    <h1 className="font-display text-4xl sm:text-5xl">Find your event booking</h1>
    <p className="mt-4 leading-7 text-muted">Enter the details from your original event enquiry to view your booking and any current quote.</p>
    <form method="post" onSubmit={recover} className="mt-7 space-y-5 border border-brown/20 p-6 sm:p-8">
      <label className="block text-sm">Event reference<input name="reference" required maxLength={30} autoCapitalize="characters" spellCheck={false} placeholder="PE-XXXXXXXXXXXX" className={field}/></label>
      <label className="block text-sm">Event date<input name="date" type="date" required className={field}/></label>
      <label className="block text-sm">Email address<input name="email" type="email" required autoComplete="email" maxLength={254} className={field}/></label>
      <label className="block text-sm">Phone number used to book<input name="phone" type="tel" required autoComplete="tel" maxLength={25} className={field}/></label>
      <button type="submit" disabled={busy} className="w-full bg-brown px-6 py-4 text-sm text-offwhite disabled:opacity-50">{busy ? 'Checking…' : 'Open event booking'}</button>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </form>
    <div className="mt-6"><HotelContact fallback="If you’re missing your reference or event details, ask the hotel’s events team for help."/></div>
  </div></GuestLayout>;
}
