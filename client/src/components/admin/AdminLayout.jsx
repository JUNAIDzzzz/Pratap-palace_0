import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, BedDouble, CalendarCheck, CalendarDays, Clock3, Eye, EyeOff, Hotel, LogOut, Menu, RefreshCw, X } from 'lucide-react';
import { roles } from '../../../../shared/staffAccess.mjs';
import { money } from '../../services/bookingApi';
import BrandLogo from '../ui/BrandLogo';
import './AdminLayout.css';

const hotelDate = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
});

export function AdminSignIn({ onSubmit, busy, error, message }) {
  const [showPassword, setShowPassword] = useState(false);
  const PasswordIcon = showPassword ? EyeOff : Eye;

  return <main className="admin-login">
    <div className="admin-login-image">
      <img src="/images/gallery/27-arched-corridor.jpg" alt="" fetchPriority="high"/>
      <div className="admin-login-brand">
        <BrandLogo className="h-16 w-auto"/>
        <div><p>Pratap Palace</p><span>Hotel administration</span></div>
      </div>
    </div>
    <div className="admin-login-panel">
      <a href="/" className="admin-return-link"><ArrowLeft size={16} aria-hidden="true"/> Visit website</a>
      <div className="admin-login-content">
        <div className="admin-login-mobile-brand"><BrandLogo className="h-12 w-auto"/><span>Pratap Palace</span></div>
        <h1>Welcome back.</h1>
        <p>Sign in to manage hotel operations.</p>
        <form onSubmit={onSubmit} className="admin-login-form">
          <label>Username<input name="username" autoComplete="username" required maxLength={50}/></label>
          <div>
            <label htmlFor="admin-password">Password</label>
            <div className="admin-password-field">
              <input id="admin-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required maxLength={256}/>
              <button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <PasswordIcon size={18} aria-hidden="true"/>
              </button>
            </div>
          </div>
          {error && <p role="alert" className="admin-notice admin-notice-error">{error}</p>}
          {message && <p role="status" className="admin-notice">{message}</p>}
          <button className="admin-primary admin-login-submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}<ArrowRight size={18} aria-hidden="true"/>
          </button>
        </form>
      </div>
    </div>
  </main>;
}

export function AdminShell({ sections, tab, user, onNavigate, onLogout, onRefresh, refreshing, children }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const closeButton = useRef(null);
  const title = sections.flatMap(section => section.items).find(item => item[0] === tab)?.[1];

  function hideMenu() {
    setOpen(false);
    menuButton.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const desktop = window.matchMedia('(min-width: 1024px)');
    if (desktop.matches) {
      setOpen(false);
      return;
    }
    const onResize = event => { if (event.matches) setOpen(false); };
    const onKey = event => { if (event.key === 'Escape') hideMenu(); };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    desktop.addEventListener('change', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      desktop.removeEventListener('change', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return <div className="admin-shell">
    {open && <button className="admin-drawer-scrim" aria-label="Close navigation" tabIndex={-1} onClick={hideMenu}/>}
    <aside id="admin-sidebar" className="admin-sidebar" data-open={open}>
      <div className="admin-sidebar-header">
        <a href="/" className="admin-sidebar-brand" aria-label="Pratap Palace website">
          <BrandLogo className="h-11 w-auto"/>
          <div><p>Pratap Palace</p><span>Administration</span></div>
        </a>
        <button ref={closeButton} className="admin-icon-button admin-mobile-only" onClick={hideMenu} aria-label="Close menu"><X size={20} aria-hidden="true"/></button>
      </div>
      <nav aria-label="Admin navigation" className="admin-navigation">
        {sections.map(({ label, items }) => <div key={label} className="admin-nav-group">
          <p>{label}</p>
          {items.map(([key, name, Icon]) => <button key={key} type="button" onClick={() => {
            onNavigate(key);
            if (open) hideMenu();
          }} aria-current={tab === key ? 'page' : undefined}>
            <Icon size={17} strokeWidth={1.65} aria-hidden="true"/>
            <span>{name}</span>
          </button>)}
        </div>)}
      </nav>
      <div className="admin-sidebar-footer">
        <a href="/"><ArrowUpRight size={16} aria-hidden="true"/>Visit website</a>
        <button onClick={onLogout}><LogOut size={16} aria-hidden="true"/>Sign out</button>
      </div>
    </aside>
    <div className="admin-workspace">
      <header className="admin-header">
        <div className="admin-header-title">
          <button ref={menuButton} type="button" onClick={() => setOpen(value => !value)} className="admin-icon-button admin-mobile-only"
            aria-label="Open menu" aria-expanded={open} aria-controls="admin-sidebar"><Menu size={21} aria-hidden="true"/></button>
          <h1>{title}</h1>
        </div>
        <div className="admin-header-tools">
          <span className="admin-header-date">{hotelDate.format(new Date())} · IST</span>
          {onRefresh && <button type="button" disabled={refreshing} onClick={onRefresh} aria-label="Refresh dashboard" title="Refresh dashboard" className="admin-icon-button">
            <RefreshCw size={17} className={refreshing ? 'motion-safe:animate-spin' : undefined} aria-hidden="true"/>
          </button>}
          <div className="admin-account" title={user.username + ' · ' + roles[user.role]}>
            <span className="admin-account-initial" aria-hidden="true">{user.username.slice(0, 1).toUpperCase()}</span>
            <div><p>{user.username}</p><span>{roles[user.role]}</span></div>
          </div>
        </div>
      </header>
      <main className="admin-content" inert={open}>{children}</main>
    </div>
  </div>;
}

export function AdminOverview({ dashboard, rooms, onNavigate }) {
  const stats = [
    ['Total reservations', dashboard?.reservations, CalendarDays, 'rooms'],
    ['Awaiting confirmation', dashboard?.pending, Clock3, 'pending'],
    ['Arrivals today', dashboard?.arrivals, CalendarCheck, 'arrivals'],
    ['Rooms checked in', dashboard?.inHouse, BedDouble, 'in-house'],
  ];
  const bookableCount = rooms.filter(room => room.bookable).length;

  return <div className="admin-overview">
    <section className="admin-overview-banner">
      <img src="/images/gallery/27-arched-corridor.jpg" alt=""/>
      <div>
        <h2>Reservation desk</h2>
        <p>Review arrivals, room stays, and upcoming reservations.</p>
        <button onClick={() => onNavigate('calendar')}>Open calendar <ArrowRight size={16} aria-hidden="true"/></button>
      </div>
    </section>
    <section aria-label="Reservation summary" className="admin-stat-grid">
      {stats.map(([label, value, Icon, tone]) => <article className="admin-stat-card" key={label}>
        <span className="admin-stat-icon" data-tone={tone}><Icon size={18} strokeWidth={1.7} aria-hidden="true"/></span>
        <div><p>{label}</p><strong>{value ?? '—'}</strong></div>
      </article>)}
    </section>
    <div className="admin-overview-details">
      <section className="admin-overview-panel">
        <h2>Confirmed reservation value</h2>
        <p className="admin-reservation-total">{dashboard ? money(dashboard.confirmedValue) : '—'}</p>
        <p>Value of confirmed room bookings, including checked-in and completed stays. Payments are tracked separately in Reports.</p>
        <div className="admin-overview-links">
          <button onClick={() => onNavigate('reports')}>Open reports <ArrowUpRight size={16} aria-hidden="true"/></button>
          <button onClick={() => onNavigate('reservations')}>Manage reservations <ArrowUpRight size={16} aria-hidden="true"/></button>
        </div>
      </section>
      <section className="admin-overview-panel">
        <h2>Room inventory</h2>
        {!rooms.length ? <p className="admin-stock-empty">Room settings will appear here when loaded.</p> : <>
          <p className="admin-stock-caption">{bookableCount} of {rooms.length} room types available for online booking</p>
          <ul className="admin-stock-list">
            {rooms.map(room => <li key={room.id}>
              <span><Hotel size={16} aria-hidden="true"/>{room.name}</span>
              <span className="admin-stock-status" data-bookable={room.bookable}>{room.bookable ? 'Bookable' : 'Not bookable'}</span>
            </li>)}
          </ul>
        </>}
        <div className="admin-overview-links"><button onClick={() => onNavigate('rooms')}>Manage rooms &amp; rates <ArrowUpRight size={16} aria-hidden="true"/></button></div>
      </section>
    </div>
  </div>;
}
