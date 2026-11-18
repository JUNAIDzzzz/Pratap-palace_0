import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import './ExperienceCarousel.css';

const slides = [
  { image: '/images/gallery/03-courtyard-dome.jpg', alt: 'Carved arches overlooking the Pratap Palace courtyard', title: 'A stay at Pratap Palace', description: 'Find your own space to slow down. Explore our rooms and plan a stay surrounded by the character and quiet charm of Pratap Palace.', link: '/booking', action: 'Book your stay' },
  { image: '/images/experiences/dining.jpg', alt: 'A glimpse of food preparation at Pratap Palace', title: 'Gather around the table', description: 'Good company deserves a memorable setting. Discover dining at Pratap Palace and plan a meal for two, a family gathering, or a group.', link: '/dining', action: 'Explore dining' },
  { image: '/images/experiences/events.jpg', alt: 'An interior gathering space at Pratap Palace', title: 'Make it an occasion', description: 'Bring your celebration or meeting to Pratap Palace. Explore our event booking page, share your plans, and request a tailored quote from the hotel.', link: '/events', action: 'Plan your event' },
];

export default function ExperienceCarousel() {
  const [active, setActive] = useState(0);
  const sliderRef = useRef(null);
  const activeRef = useRef(0);

  function selectSlide(index) {
    activeRef.current = index;
    setActive(index);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      const slider = sliderRef.current;
      slider.scrollTo({
        left: index * slider.clientWidth,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
  }
  const move = direction => selectSlide((activeRef.current + direction + slides.length) % slides.length);

  function syncSlide() {
    if (!window.matchMedia('(max-width: 1023px)').matches) return;
    const slider = sliderRef.current;
    const index = Math.max(0, Math.min(slides.length - 1, Math.round(slider.scrollLeft / slider.clientWidth)));
    activeRef.current = index;
    setActive(index);
  }

  useEffect(() => {
    const slider = sliderRef.current;
    const observer = new ResizeObserver(() => {
      slider.scrollTo({ left: activeRef.current * slider.clientWidth, behavior: 'instant' });
    });
    observer.observe(slider);
    return () => observer.disconnect();
  }, []);

  return <section id="experiences" aria-label="Explore Pratap Palace" aria-roledescription="carousel" className="relative isolate flex min-h-[80svh] items-center overflow-hidden bg-brown px-6 py-20 md:px-20 lg:px-28"
    onKeyDown={event => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  }}>
    <div className="absolute inset-0 -z-10" aria-hidden="true">
      {slides.map((item, index) => <img key={item.image} src={item.image} alt="" loading="lazy" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${index === active ? 'opacity-100' : 'opacity-0'}`}/>)}
      <div className="absolute inset-0 bg-black/65"/>
    </div>
    <div className="mx-auto w-full max-w-6xl">
      <div ref={sliderRef} className="palace-experience-slider" onScroll={syncSlide}>
      {slides.map((slide, index) => <article key={slide.image} data-active={index === active} aria-label={`Slide ${index + 1} of ${slides.length}`} aria-roledescription="slide" className="grid overflow-hidden bg-offwhite shadow-2xl md:min-h-[480px] md:grid-cols-2">
        <img src={slide.image} alt={slide.alt} loading="lazy" draggable={false} className="h-64 w-full object-cover md:h-[480px] lg:h-[520px]"/>
        <div className="flex flex-col justify-center px-7 py-10 text-brown md:px-10 lg:px-16 lg:py-16">
          <h2 className="font-display text-2xl uppercase leading-snug lg:text-3xl">{slide.title}</h2>
          <p className="mt-6 text-base leading-8 text-brown/80 lg:text-lg">{slide.description}</p>
          <a href={slide.link} className="mt-7 inline-flex w-fit items-center gap-1 border-b border-caramel text-sm uppercase tracking-widest text-muted">{slide.action}<ChevronRight size={18} aria-hidden="true"/></a>
        </div>
      </article>)}
      </div>
      <div className="mt-7 flex justify-center gap-3">{slides.map((item, index) => <button type="button" key={item.title} aria-label={`Show ${item.title.toLowerCase()}`} aria-current={index === active ? 'true' : undefined} onClick={() => selectSlide(index)} className="flex h-8 w-8 items-center justify-center"><span className={`block h-1.5 rounded-full transition-all ${index === active ? 'w-7 bg-offwhite' : 'w-1.5 bg-offwhite/45'}`}/></button>)}</div>
    </div>
    <button type="button" onClick={() => move(-1)} aria-label="Previous experience" className="absolute bottom-10 left-6 flex h-11 w-11 items-center justify-center rounded-full border border-offwhite/70 bg-offwhite/10 text-offwhite backdrop-blur-sm transition hover:bg-offwhite/25 md:bottom-auto md:left-4 lg:left-8"><ChevronLeft size={25} strokeWidth={1.5} aria-hidden="true"/></button>
    <button type="button" onClick={() => move(1)} aria-label="Next experience" className="absolute bottom-10 right-6 flex h-11 w-11 items-center justify-center rounded-full border border-offwhite/70 bg-offwhite/10 text-offwhite backdrop-blur-sm transition hover:bg-offwhite/25 md:bottom-auto md:right-4 lg:right-8"><ChevronRight size={25} strokeWidth={1.5} aria-hidden="true"/></button>
  </section>;
}
