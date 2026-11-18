import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Users, Maximize } from 'lucide-react';
import { getRooms } from '../../services/api';
import { money } from '../../services/bookingApi';
import './Rooms.css';

const availabilityClass = 'mt-5 flex w-full items-center justify-between gap-3 border-t border-brown/15 pt-4 text-left text-sm font-medium hover:text-muted';

export default function Rooms({ onSelect, standalone = false }) {
  const [rooms, setRooms] = useState(null);
  const [error, setError] = useState('');
  const [activeRoom, setActiveRoom] = useState(0);
  const sliderRef = useRef(null);

  function showRoom(index) {
    const slider = sliderRef.current;
    const card = slider?.children[index];
    if (!card) return;
    const offset = card.getBoundingClientRect().left - slider.getBoundingClientRect().left;
    slider.scrollTo({
      left: slider.scrollLeft + offset,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  }

  function syncActiveRoom() {
    const slider = sliderRef.current;
    const left = slider.getBoundingClientRect().left;
    let closest = 0;
    let distance = Infinity;
    Array.from(slider.children).forEach((card, index) => {
      const gap = Math.abs(card.getBoundingClientRect().left - left);
      if (gap < distance) {
        closest = index;
        distance = gap;
      }
    });
    setActiveRoom(closest);
  }

  useEffect(() => {
    let active = true;
    getRooms().then(data => { if (active) setRooms(data); })
      .catch(() => { if (active) setError('Rooms could not be loaded. Please try again shortly.'); });
    return () => { active = false; };
  }, []);

  const Heading = standalone ? 'h1' : 'h2';
  const RoomHeading = standalone ? 'h2' : 'h3';
  return <section id="rooms" className={standalone ? '' : 'palace-home-rooms mx-auto max-w-7xl px-6 py-16 md:py-24 lg:px-10'} aria-labelledby="rooms-title">
    <div className="palace-rooms-heading mb-9 flex flex-col justify-between gap-4 border-b border-brown/20 pb-7 md:flex-row md:items-end">
      <Heading id="rooms-title" className={standalone ? 'font-display text-5xl tracking-tight md:text-7xl' : 'font-display text-4xl tracking-tight md:text-5xl'}>Rooms & suites</Heading>
      <p className="max-w-xs leading-7 text-muted">A quiet retreat, a garden hideaway, or a suite for a special stay.</p>
    </div>
    {error && <p role="alert">{error}</p>}
    {!rooms && !error && <p role="status" className="text-sm text-muted">Loading rooms…</p>}
    {rooms?.length === 0 && <p role="status" className="text-sm text-muted">There are no rooms to display at the moment.</p>}
    <div ref={sliderRef} className="palace-room-slider grid gap-5 md:grid-cols-3 lg:gap-7" onScroll={syncActiveRoom}>
      {rooms?.map(room => <article key={room.id} className="group flex flex-col overflow-hidden rounded-sm border border-brown/15 bg-[#fbf4ea]">
        <div className="relative aspect-[4/3] overflow-hidden bg-sand">
          <img src={room.image} alt={room.name} loading="lazy" className="h-full w-full object-cover transition duration-700 motion-safe:group-hover:scale-105"/>
          {room.tag && <p className="absolute bottom-3 left-3 bg-offwhite px-3 py-2 text-[10px] font-medium uppercase tracking-wider">{room.tag}</p>}
        </div>
        <div className="flex flex-1 flex-col p-5 lg:p-6">
          <RoomHeading className="font-display text-2xl">{room.name}</RoomHeading>
          <p className="mb-5 mt-3 flex-1 text-sm leading-6 text-muted">{room.description}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
            <span className="flex items-center gap-2"><Users size={14} aria-hidden="true"/>{room.guests} guests</span>
            <span className="flex items-center gap-2"><Maximize size={14} aria-hidden="true"/>{room.size} m²</span>
          </div>
          {standalone && room.bookable && <p className="mt-5 text-sm"><strong>{money(room.rate)}</strong> <span className="text-muted">per room, per night</span></p>}
          {standalone ? room.bookable
            ? <a href={`/booking?${new URLSearchParams({ roomId: room.id })}`} aria-label={`Check availability for ${room.name}`} className={availabilityClass}>
              Check availability <ArrowUpRight size={17} aria-hidden="true"/>
            </a>
            : <p className="mt-5 border-t border-brown/15 pt-4 text-sm text-muted">Currently unavailable for online booking</p>
            : <button type="button" onClick={() => onSelect(room.id)} aria-label={`Check availability for ${room.name}`} className={availabilityClass}>
              Check availability <ArrowUpRight size={17} aria-hidden="true"/>
            </button>}
        </div>
      </article>)}
    </div>
    {rooms?.length > 1 && <nav className="palace-room-slider-pills" aria-label="Choose a room">
      {rooms.map((room, index) => <button key={room.id} type="button" aria-label={`Show ${room.name}`}
        aria-current={index === activeRoom ? 'true' : undefined} onClick={() => showRoom(index)}>
        <span aria-hidden="true"/>
      </button>)}
    </nav>}
  </section>;
}
