import BrandLogo from '../ui/BrandLogo';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';

const links = [
  ['Our story', '/#story'],
  ['Rooms', '/rooms'],
  ['Experiences', '/#experiences'],
  ['Dining', '/dining'],
  ['Gallery', '/gallery'],
  ['Events', '/events'],
  ['My bookings', '/my-booking'],
];

export default function Header({ overlay = true, mobileHeroBrand = false }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(() => window.scrollY > 40);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const themed = scrolled || open;
  const treatment = themed ? 'border-brown/10 bg-offwhite/95 text-brown backdrop-blur'
    : `border-transparent bg-transparent ${overlay ? 'text-offwhite' : 'text-brown'}`;
  return <header className={`palace-site-header fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300 ${treatment}`}>
    <div className={mobileHeroBrand
      ? 'mx-auto flex max-w-7xl items-center justify-between px-3 pb-2 pt-[max(.5rem,env(safe-area-inset-top))] lg:h-22 lg:px-10 lg:py-0'
      : 'mx-auto flex h-22 max-w-7xl items-center justify-between px-6 lg:px-10'}>
      <a href="/" aria-label="Pratap Palace home" className="flex shrink-0 items-center gap-3">
        <BrandLogo className={mobileHeroBrand ? 'h-12 w-12 lg:h-19 lg:w-auto' : 'h-19 w-auto'}/>
        {mobileHeroBrand && <span className="font-display text-xl tracking-tight lg:hidden">Pratap Palace</span>}
      </a>
      <nav aria-label="Main navigation" className="hidden items-center gap-4 whitespace-nowrap text-sm lg:flex xl:gap-6">
        {links.map(([name, href]) => <a key={href} className="transition hover:text-caramel" href={href}>{name}</a>)}
      </nav>
      <button type="button" className="p-2 lg:hidden" aria-label="Toggle navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X/> : <Menu/>}</button>
    </div>
    {open && <nav aria-label="Mobile navigation" className="flex max-h-[calc(100dvh-5.5rem)] flex-col gap-5 overflow-y-auto border-t border-brown/10 px-6 py-6 lg:hidden">
      {links.map(([name, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{name}</a>)}
    </nav>}
  </header>;
}
