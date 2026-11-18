import { useSiteContent } from '../../services/siteContent';

export default function EventsHero() {
  const { eventsDescription } = useSiteContent();
  return <section className="relative h-svh overflow-hidden bg-brown text-offwhite" aria-label="Events at Pratap Palace">
    <video autoPlay muted loop playsInline preload="auto" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover">
      <source src="/videos/pratap-palace-events.mp4" type="video/mp4"/>
    </video>
    <div className="absolute inset-0 bg-gradient-to-r from-brown/75 via-brown/35 to-brown/15"/>
    <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-center px-6 pt-22 lg:px-12">
      <p className="text-xs uppercase tracking-[.25em]">Make it an occasion</p>
      <h1 className="mt-6 max-w-3xl font-display text-5xl leading-tight md:text-7xl">Your occasion,<br/>thoughtfully planned.</h1>
      <p className="mt-7 max-w-lg whitespace-pre-line break-words leading-7 text-offwhite/85">{eventsDescription}</p>
    </div>
  </section>;
}
