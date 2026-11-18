import GuestLayout from '../components/hospitality/GuestLayout';
import { useSiteContent } from '../services/siteContent';

export default function Gallery() {
  const { galleryPhotos } = useSiteContent();
  return <GuestLayout>
    <p className="text-xs uppercase tracking-[.25em] text-caramel">A CLOSER LOOK</p>
    <h1 className="mt-5 font-display text-5xl lg:text-6xl">The Pratap Palace gallery.</h1>
    <div className="mt-12 grid grid-cols-1 items-start gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {galleryPhotos.map(({ image, caption }, index) => <figure key={index} className="overflow-hidden border border-brown/15 bg-sand/20">
        <img src={image} alt={caption} loading={index < 3 ? 'eager' : 'lazy'} className="h-auto w-full"/>
        <figcaption className="px-5 py-4 text-sm text-brown">{caption}</figcaption>
      </figure>)}
    </div>
  </GuestLayout>;
}
