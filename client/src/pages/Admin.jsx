import { useEffect, useState } from 'react';
import { BarChart3, BedDouble, Bell, CalendarDays, ClipboardList, GlassWater, History, LayoutDashboard, PanelsTopLeft, Settings, Sparkles, TicketPercent, Users, Utensils } from 'lucide-react';
import { activityPermissions, permissions } from '../../../shared/staffAccess.mjs';
import { api } from '../services/bookingApi';
import { AdminOverview, AdminShell, AdminSignIn } from '../components/admin/AdminLayout';
import RoomManager from '../components/admin/RoomManager';
import ReservationManager from '../components/admin/ReservationManager';
import ReservationCalendar from '../components/admin/ReservationCalendar';
import Housekeeping from '../components/admin/Housekeeping';
import WebsiteContent from '../components/admin/WebsiteContent';
import OfferManager from '../components/admin/OfferManager';
import AdminSettings from '../components/admin/AdminSettings';
import HospitalityManager from '../components/admin/HospitalityManager';
import StaffManager from '../components/admin/StaffManager';
import ActivityHistory from '../components/admin/ActivityHistory';
import GuestNotifications from '../components/admin/GuestNotifications';
import Reports from '../components/admin/Reports';

const calendarPermissions = [permissions.reception, permissions.dining, permissions.events];
const navigation = [
  {
    label: 'Operations',
    items: [
      ['overview', 'Overview', LayoutDashboard, [permissions.dashboard]],
      ['calendar', 'Calendar', CalendarDays, calendarPermissions],
      ['reservations', 'Reservations', ClipboardList, [permissions.reception]],
      ['housekeeping', 'Rooms & housekeeping', Sparkles, [permissions.reception]],
      ['dining', 'Dining bookings', Utensils, [permissions.dining]],
      ['events', 'Event bookings', GlassWater, [permissions.events]],
    ],
  },
  {
    label: 'Business',
    items: [
      ['rooms', 'Rooms & rates', BedDouble, [permissions.rates]],
      ['offers', 'Offer codes', TicketPercent, [permissions.offers]],
      ['reports', 'Reports', BarChart3, [permissions.dashboard]],
    ],
  },
  {
    label: 'Administration',
    items: [
      ['website', 'Website content', PanelsTopLeft, [permissions.website]],
      ['notifications', 'Guest notifications', Bell, calendarPermissions],
      ['activity', 'Activity history', History, activityPermissions],
      ['staff', 'Staff accounts', Users, [permissions.staff]],
      ['settings', 'Settings', Settings],
    ],
  },
];

export default function Admin() {
  const [user, setUser] = useState(undefined);
  const [requestedTab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [offers, setOffers] = useState([]);
  const [websiteEditorOwner, setWebsiteEditorOwner] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const can = permission => user?.permissions?.includes(permission);
  const sections = navigation.map(({ label, items }) => ({
    label,
    items: items.filter(([, , , access]) => !access || access.some(can)),
  })).filter(section => section.items.length);
  const visibleTabs = sections.flatMap(section => section.items);
  const tab = visibleTabs.some(([key]) => key === requestedTab) ? requestedTab : visibleTabs[0][0];
  const canRefresh = [permissions.dashboard, permissions.reception, permissions.rates, permissions.offers].some(can);
  const calendarKinds = ['rooms', 'dining', 'events'].filter(kind => can(permissions[kind === 'rooms' ? 'reception' : kind]));

  function clearWorkspace() {
    setDashboard(null);
    setRooms([]);
    setOffers([]);
    setWebsiteEditorOwner(null);
  }

  useEffect(() => {
    let current = true;
    const expired = () => {
      setUser(previous => previous === undefined ? previous : null);
      clearWorkspace();
    };
    window.addEventListener('pp-admin-session-expired', expired);
    api('/admin/me').then(value => { if (current) setUser(value); }).catch(err => {
      if (!current) return;
      setUser(null);
      if (err.status !== 401) setError(err.message);
    });
    return () => {
      current = false;
      window.removeEventListener('pp-admin-session-expired', expired);
    };
  }, []);

  async function refresh() {
    setRefreshing(true);
    setError('');
    try {
      const [stats, roomData, offerData] = await Promise.all([
        can(permissions.dashboard) ? api('/admin/dashboard') : null,
        can(permissions.reception) || can(permissions.rates) ? api('/admin/rooms') : [],
        can(permissions.offers) ? api('/admin/offers') : [],
      ]);
      setDashboard(stats);
      setRooms(roomData);
      setOffers(offerData);
    } catch (err) {
      if (err.status === 401) setUser(null);
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => { if (canRefresh) refresh(); }, [user]);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setUser(await api('/admin/login', { method: 'POST', body: Object.fromEntries(new FormData(event.currentTarget)) }));
      setTab('overview');
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api('/admin/logout', { method: 'POST', body: {} });
      setUser(null);
      clearWorkspace();
    } catch (err) {
      setError(err.message);
    }
  }

  function navigate(key) {
    if (key === 'website') setWebsiteEditorOwner(user.username);
    if (key !== tab) window.scrollTo({ top: 0, behavior: 'instant' });
    setTab(key);
  }

  if (user === undefined) return <main className="grid min-h-screen place-items-center bg-[#f5f0e8] text-brown">Opening admin panel…</main>;
  if (!user) return <AdminSignIn onSubmit={login} busy={busy} error={error} message={message}/>;

  return <AdminShell sections={sections} tab={tab} user={user} onNavigate={navigate} onLogout={logout}
    onRefresh={canRefresh ? refresh : undefined} refreshing={refreshing}>
    {error && <p role="alert" className="admin-notice admin-notice-error">{error}</p>}
    {tab === 'overview' && <AdminOverview dashboard={dashboard} rooms={rooms} onNavigate={navigate}/>}
    {tab === 'calendar' && <ReservationCalendar kinds={calendarKinds}/>}
    {tab === 'housekeeping' && <Housekeeping roomTypes={rooms} onReservations={() => navigate('reservations')}/>}
    {tab === 'reservations' && <ReservationManager onChanged={refresh}/>}
    {tab === 'rooms' && <RoomManager rooms={rooms} onSaved={refresh}/>}
    {tab === 'offers' && <OfferManager offers={offers} onSaved={refresh}/>}
    {(tab === 'dining' || tab === 'events') && <HospitalityManager key={tab} kind={tab}
      canRecordPayments={can(permissions.payments)} canConfigure={can(permissions.venues)}/>}
    {can(permissions.website) && websiteEditorOwner === user.username && <div hidden={tab !== 'website'}>
      <WebsiteContent key={user.username} onPublished={refresh}/>
    </div>}
    {tab === 'activity' && <ActivityHistory/>}
    {tab === 'notifications' && <GuestNotifications/>}
    {tab === 'reports' && <Reports/>}
    {tab === 'staff' && <StaffManager currentUsername={user.username}/>}
    {user.mustChangePassword && <p role="status" className="admin-notice">Change your temporary password to unlock your staff tools.</p>}
    {tab === 'settings' && <AdminSettings onPasswordChanged={() => {
      setUser(null);
      clearWorkspace();
      setMessage('Password updated. Sign in with your new password.');
    }}/>}
  </AdminShell>;
}
