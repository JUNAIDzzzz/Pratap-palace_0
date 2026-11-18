import { ArrowUpRight } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { defaultSocialLinks, useSiteContent } from '../../services/siteContent';
import './Footer.css';

const explore = [
  ['Dining', '/dining'],
  ['Gallery', '/gallery'],
  ['Our rooms', '/rooms'],
  ['Events & celebrations', '/events'],
];
const plan = [
  ['Plan an event', '/events'],
  ['Book your stay', '/booking'],
  ['Reserve a table', '/dining'],
];
const socialProfiles = [
  { name: 'Instagram', icon: 'instagram.png', platform: 'instagram' },
];

function FooterSocials({ links }) {
  return <ul className="palace-footer-socials" aria-label="Social media">
    {socialProfiles.map(({ name, icon, platform }) => {
      const href = links[platform]?.trim();
      const image = <img src={`/images/social/${icon}`} width="24" height="24" alt={name}/>;
      return <li key={icon}>
        {href?.startsWith('https://') ? <a href={href} className="palace-footer-social-icon">{image}</a>
          : <span className="palace-footer-social-icon">{image}</span>}
      </li>;
    })}
  </ul>;
}

function FooterLinks({ title, links }) {
  return <nav className="palace-footer-nav" aria-label={title}>
    <h3 className="palace-footer-label">{title}</h3>
    <ul>{links.map(([label, href]) => <li key={label}>
      <a href={href} className="palace-footer-link">
        {label}<ArrowUpRight size={14} aria-hidden="true"/>
      </a>
    </li>)}</ul>
  </nav>;
}

export default function Footer() {
  const { contact, socials } = useSiteContent();
  const footerRef = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      document.documentElement.dataset.footerVisible = String(entry.isIntersecting);
    }, { threshold: .01 });
    observer.observe(footerRef.current);
    return () => {
      observer.disconnect();
      delete document.documentElement.dataset.footerVisible;
    };
  }, []);
  return <footer ref={footerRef} className="palace-footer">
    <div className="palace-footer-inner">
      <div className="palace-footer-main">
        <div>
          <h2 className="palace-footer-title">Slow down.<br/><em>Stay a little longer.</em></h2>
          <p className="palace-footer-copy">A quiet escape, a shared table, a special occasion. Find your next moment at Pratap Palace.</p>
          <div className="palace-footer-actions">
            <a href="/booking" className="palace-footer-cta">Plan your stay<ArrowUpRight size={18} strokeWidth={1.6} aria-hidden="true"/></a>
            <FooterSocials links={socials ?? defaultSocialLinks}/>
          </div>
          {(contact.address || contact.phone || contact.email) && <address className="palace-footer-contact">
            {contact.address && <p>{contact.address}</p>}
            {contact.phone && <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>{contact.phone}</a>}
            {contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}
          </address>}
        </div>
        <div className="palace-footer-navigation">
          <FooterLinks title="Explore" links={explore}/>
          <FooterLinks title="Plan your visit" links={plan}/>
        </div>
      </div>
      <div className="palace-footer-legal">
        <p>© {new Date().getFullYear()} Pratap Palace. All rights reserved.</p>
      </div>
    </div>
  </footer>;
}
