import React from 'react';
import { createRoot } from 'react-dom/client';
import Home from './pages/Home';
import Admin from './pages/Admin';
import Booking from './pages/Booking';
import HospitalityBooking from './pages/HospitalityBooking';
import ManageHospitality from './pages/ManageHospitality';
import Gallery from './pages/Gallery';
import DiningStatus from './pages/DiningStatus';
import RoomBookingStatus from './pages/RoomBookingStatus';
import MyBookings from './pages/MyBookings';
import RoomsPage from './pages/RoomsPage';
import EventRecovery from './pages/EventRecovery';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import GuestLayout from './components/hospitality/GuestLayout';
import { SiteContentProvider } from './services/siteContent';
import './styles.css';
const path = window.location.pathname.replace(/\/$/, '');
const pages = new Map([
  ['', <Home/>],
  ['/admin', <Admin/>],
  ['/booking', <><Header overlay={false}/><div className="h-22" aria-hidden="true"/><Booking/><Footer/></>],
  ['/dining', <HospitalityBooking kind="dining"/>],
  ['/dining/status', <DiningStatus/>],
  ['/my-booking', <MyBookings/>],
  ['/my-booking/rooms', <RoomBookingStatus/>],
  ['/rooms', <RoomsPage/>],
  ['/events', <HospitalityBooking kind="events"/>],
  ['/events/recover', <EventRecovery/>],
  ['/gallery', <Gallery/>],
  ['/manage', <ManageHospitality/>],
]);
const content = pages.get(path) ?? <GuestLayout>
  <h1 className="font-display text-5xl">Page not found.</h1>
  <p className="mt-5 text-muted">The page you requested is unavailable.</p>
  <a href="/" className="mt-7 inline-block border-b border-brown">Return to Pratap Palace</a>
</GuestLayout>;
createRoot(document.getElementById('root')).render(<React.StrictMode>
  {path === '/admin' ? content : <SiteContentProvider>{content}</SiteContentProvider>}
</React.StrictMode>);
