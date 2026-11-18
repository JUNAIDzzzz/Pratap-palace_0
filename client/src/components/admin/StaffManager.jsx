import { useEffect, useState } from 'react';
import { roles } from '../../../../shared/staffAccess.mjs';
import { api } from '../../services/bookingApi';

const panel = 'rounded-xl border border-brown/15 bg-offwhite p-4 sm:p-6';
const field = 'mt-2 block w-full rounded border border-brown/25 bg-offwhite px-3 py-2.5 text-sm';
const secondary = 'rounded border border-brown/25 px-4 py-2 text-sm disabled:opacity-50';
const defaultGrants = { changeRates: false, publishContent: false, recordPayments: false };
const roleDescription = {
  manager: 'Full access, including staff accounts and all departments.',
  reception: 'Room reservations, room assignments, housekeeping and the rooms calendar.',
  dining: 'Dining reservations and the dining calendar.',
  events: 'Event reservations, quotes and the events calendar.',
};

function StaffEditor({ account, close, onSaved }) {
  const [role, setRole] = useState(account?.role ?? 'reception');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const manager = role === 'manager';
  const paymentRole = role === 'dining' || role === 'events';
  const grants = account?.role === 'manager' ? defaultGrants : account?.grants ?? defaultGrants;

  async function save(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const data = {
      role,
      enabled: form.has('enabled'),
      changeRates: manager || form.has('changeRates'),
      publishContent: manager || form.has('publishContent'),
      recordPayments: manager || (paymentRole && form.has('recordPayments')),
    };
    if (!account) data.username = form.get('username');
    if (form.get('password')) data.password = form.get('password');
    setError('');
    setSaving(true);
    try {
      const response = await api(account ? `/admin/staff/${encodeURIComponent(account.username)}` : '/admin/staff', {
        method: account ? 'PUT' : 'POST',
        body: data,
      });
      onSaved(response);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return <form className={panel} onSubmit={save}>
    <h2 className="font-display text-2xl">{account ? `Edit ${account.username}` : 'Add staff account'}</h2>
    <fieldset disabled={saving} className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
      {!account && <label>Username<input name="username" className={field} autoComplete="off" required minLength={3}
        maxLength={50} pattern="[A-Za-z0-9_.\-]{3,50}"/></label>}
      <label>Role<select className={field} value={role} onChange={event => setRole(event.target.value)}>
        {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>{account ? 'New temporary password (optional)' : 'Temporary password'}
        <input name="password" type="password" autoComplete="new-password" className={field} required={!account}
          minLength={12} maxLength={256} placeholder={account ? 'Leave blank to keep the current password' : 'At least 12 characters'}/>
      </label>
      <p className="text-muted sm:col-span-2">{roleDescription[role]} A temporary password must be changed on the next sign-in.</p>
      <div className="space-y-3 rounded-lg border border-brown/15 p-4 sm:col-span-2">
        <h3 className="font-semibold">Permissions</h3>
        {manager ? <p className="text-muted">Managers have all permissions.</p> : <>
          <label className="flex items-start gap-2"><input name="changeRates" type="checkbox" className="mt-1" defaultChecked={grants.changeRates}/> Change room rates and inventory</label>
          <label className="flex items-start gap-2"><input name="publishContent" type="checkbox" className="mt-1" defaultChecked={grants.publishContent}/> Publish website content</label>
          {paymentRole && <label className="flex items-start gap-2"><input name="recordPayments" type="checkbox" className="mt-1" defaultChecked={grants.recordPayments}/> Record verified payments for this department</label>}
        </>}
      </div>
      <label className="flex items-start gap-2 sm:col-span-2"><input name="enabled" type="checkbox" className="mt-1" defaultChecked={account?.enabled ?? true}/> Allow sign-in</label>
    </fieldset>
    {error && <p role="alert" className="mt-4 rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    <div className="mt-5 flex flex-wrap gap-3">
      <button disabled={saving} className="rounded bg-brown px-5 py-2.5 text-sm font-medium text-offwhite disabled:opacity-50">{saving ? 'Saving…' : 'Save staff account'}</button>
      <button type="button" className={secondary} disabled={saving} onClick={close}>Cancel</button>
    </div>
  </form>;
}

export default function StaffManager({ currentUsername }) {
  const [accounts, setAccounts] = useState(null);
  const [editor, setEditor] = useState(undefined);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let current = true;
    api('/admin/staff').then(data => { if (current) setAccounts(data); })
      .catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, []);

  function saved(account) {
    setAccounts(current => [...current.filter(item => item.username !== account.username), account]
      .sort((a, b) => a.username.localeCompare(b.username)));
    setNotice(`Saved ${account.username}.`);
    setEditor(undefined);
  }

  return <section className="mx-auto max-w-5xl space-y-5" aria-label="Staff accounts">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">Give each staff member a personal login and the permissions they need.</p>
      <button className={secondary} disabled={!accounts} onClick={() => { setNotice(''); setEditor(null); }}>Add staff account</button>
    </div>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    {notice && <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
    {editor !== undefined && <StaffEditor key={editor?.username ?? 'new'} account={editor} close={() => setEditor(undefined)} onSaved={saved}/>}
    <div className={panel}>
      <h2 className="font-display text-2xl">Logins and access</h2>
      {!accounts && !error && <p role="status" className="mt-3 text-sm text-muted">Loading staff accounts…</p>}
      <ul className="mt-3 divide-y divide-brown/10">
        {accounts?.map(account => <li key={account.username} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div>
            <p className="font-semibold">{account.username} {account.username === currentUsername && <span className="text-xs font-normal text-muted">· Your account</span>}</p>
            <p className="mt-1 text-xs text-muted">{roles[account.role]} · {account.enabled ? 'Active' : 'Disabled'}{account.mustChangePassword ? ' · Password change required' : ''}</p>
          </div>
          {account.username !== currentUsername && <button className={secondary} aria-label={`Manage ${account.username}`}
            onClick={() => { setNotice(''); setEditor(account); }}>Manage</button>}
        </li>)}
      </ul>
    </div>
  </section>;
}
