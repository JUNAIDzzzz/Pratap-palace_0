import { useSiteContent } from '../../services/siteContent';

export default function HotelContact({ reference, fallback = 'Contact hotel reception and share your booking reference.' }) {
  const { contact } = useSiteContent();
  if (!contact.phone && !contact.email) return <p className="text-sm leading-6 text-muted">{fallback}</p>;
  const subject = encodeURIComponent(`Pratap Palace booking ${reference || ''}`.trim());
  return <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
    {contact.phone && <a className="underline underline-offset-4" href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>Call reception</a>}
    {contact.email && <a className="underline underline-offset-4" href={`mailto:${contact.email}?subject=${subject}`}>Email reception</a>}
  </div>;
}
