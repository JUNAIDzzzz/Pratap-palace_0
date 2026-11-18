import { ArrowUpRight, BedDouble, CalendarDays, Utensils } from 'lucide-react';
import GuestLayout from '../components/hospitality/GuestLayout';

const bookingTypes = [
  { name: 'Room booking', description: 'Check your reservation status and stay dates.', href: '/my-booking/rooms', icon: BedDouble },
  { name: 'Dining booking', description: 'Check your table reservation, hold expiry, and any amount due.', href: '/dining/status', icon: Utensils },
  { name: 'Event booking', description: 'Find your event enquiry and review or accept your quote.', href: '/events/recover', icon: CalendarDays },
];

export default function MyBookings() {
  return <GuestLayout>
    <h1 className="font-display text-5xl tracking-tight md:text-6xl">My bookings</h1>
    <p className="mt-4 text-muted">Choose the type of booking you’d like to look up.</p>
    <nav aria-label="Booking types" className="mt-9 grid gap-5 md:grid-cols-3">
      {bookingTypes.map(({ name, description, href, icon: Icon }) => <a key={href} href={href}
        className="group flex flex-col gap-4 rounded-sm border border-brown/20 bg-[#fbf4ea] p-6 transition hover:border-brown/50 hover:bg-sand/25">
        <Icon size={25} strokeWidth={1.5} className="text-muted" aria-hidden="true"/>
        <span className="flex items-center justify-between gap-3 font-display text-2xl">
          {name}<ArrowUpRight size={18} className="shrink-0 text-muted group-hover:text-brown" aria-hidden="true"/>
        </span>
        <span className="text-sm leading-6 text-muted">{description}</span>
      </a>)}
    </nav>
  </GuestLayout>;
}
