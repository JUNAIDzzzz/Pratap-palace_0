import { useState } from 'react';
import { api } from '../../services/bookingApi';
export default function AdminSettings({ onPasswordChanged }) {
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  async function save(event) {
    event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); setError('');
    if (data.newPassword !== data.confirmPassword) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try { await api('/admin/password', { method: 'POST', body: data }); onPasswordChanged(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <form onSubmit={save} className="max-w-lg rounded-xl border border-brown/15 bg-offwhite p-8"><h3 className="font-display text-2xl">Change your password</h3><p className="mt-3 text-sm leading-6 text-muted">Use at least 12 characters. Changing your password signs out all admin sessions.</p>{[['currentPassword', 'Current password', 'current-password'], ['newPassword', 'New password', 'new-password'], ['confirmPassword', 'Confirm new password', 'new-password']].map(([name, label, autocomplete]) => <label key={name} className="mt-5 block text-xs">{label}<input type="password" name={name} autoComplete={autocomplete} required minLength={name === 'currentPassword' ? 1 : 12} maxLength={256} className="mt-2 w-full rounded border border-brown/20 bg-transparent p-3 text-sm"/></label>)}{error && <p role="alert" className="mt-4 text-sm text-red-800">{error}</p>}<button disabled={busy} className="mt-6 w-full rounded bg-brown px-5 py-3 text-sm text-offwhite disabled:opacity-50">{busy ? 'Updating…' : 'Change password'}</button></form>;
}
