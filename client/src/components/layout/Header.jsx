import BrandLogo from '../ui/BrandLogo';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import './Header.css';

const links = [
  ['Our story', '/#story'],
  ['Rooms', '/rooms'],
  ['Experiences', '/#experiences'],
  ['Dining', '/dining'],
  ['Gallery', '/gallery'],
  ['Events', '/events'],
  ['My bookings', '/my-booking'],
];

export default function Header({ overlay = true }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const mobileMenu = useRef(null);
  const [scrolled, setScrolled] = useState(() => window.scrollY > 40);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    mobileMenu.current?.querySelector('a')?.focus();
    const close = () => { setOpen(false); menuButton.current?.focus(); };
    const keys = event => {
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const links = [...mobileMenu.current.querySelectorAll('a')];
        if (event.shiftKey && document.activeElement === links[0]) {
          event.preventDefault();
          menuButton.current.focus();
        } else if (!event.shiftKey && document.activeElement === links.at(-1)) {
          event.preventDefault();
          menuButton.current.focus();
        } else if (event.shiftKey && document.activeElement === menuButton.current) {
          event.preventDefault();
          links.at(-1).focus();
        }
      }
    };
    const resize = () => { if (desktop.matches) setOpen(false); };
    document.addEventListener('keydown', keys);
    desktop.addEventListener('change', resize);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', keys);
      desktop.removeEventListener('change', resize);
    };
  }, [open]);

  const themed = scrolled || open;
  const treatment = themed ? 'border-brown/10 bg-offwhite/95 text-brown backdrop-blur'
    : `border-transparent bg-transparent ${overlay ? 'text-offwhite' : 'text-brown'}`;
  return <header className={`palace-site-header fixed inset-x-0 top-0 z-40 border-b transition-colors duration-300 ${treatment}`}>
    <div className="mx-auto flex max-w-7xl items-center justify-between px-3 pb-2 pt-[max(.5rem,env(safe-area-inset-top))] lg:h-22 lg:px-10 lg:py-0">
      <a href="/" aria-label="Pratap Palace home" className="flex shrink-0 items-center gap-3">
        <BrandLogo className="h-12 w-12 lg:h-19 lg:w-auto"/>
        <span className="font-display text-xl tracking-tight lg:hidden">Pratap Palace</span>
      </a>
      <nav aria-label="Main navigation" className="hidden items-center gap-4 whitespace-nowrap text-sm lg:flex xl:gap-6">
        {links.map(([name, href]) => <a key={href} className="transition hover:text-caramel" href={href}>{name}</a>)}
      </nav>
      <button ref={menuButton} type="button" className="palace-menu-toggle lg:hidden" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-controls="palace-mobile-navigation" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={22} strokeWidth={1.6}/> : <Menu size={24} strokeWidth={1.6}/>}</button>
    </div>
    {open && <>
      <button type="button" className="palace-menu-backdrop lg:hidden" aria-label="Dismiss navigation" tabIndex={-1} onClick={() => setOpen(false)}/>
      <nav ref={mobileMenu} id="palace-mobile-navigation" aria-label="Mobile navigation" className="palace-mobile-navigation lg:hidden">
        {links.map(([name, href]) => <a key={href} href={href}
          aria-current={window.location.pathname + window.location.hash === href ? 'page' : undefined}
          onClick={() => setOpen(false)}>{name}<ArrowUpRight size={16} strokeWidth={1.5} aria-hidden="true"/></a>)}
      </nav>
    </>}
  </header>;
}
