import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import { useSiteContent } from '../../services/siteContent';
import './ScrollGallery.css';

const clamp = value => Math.max(0, Math.min(1, value));

function Photograph({ entry, className = '' }) {
  return <div className={`palace-book-photo ${className}`}>
    <img src={entry.image} alt={entry.title} decoding="async"/>
  </div>;
}

function Cover({ image }) {
  return <div className="palace-book-cover">
    <div className="palace-book-cover-frame">
      <span className="palace-book-cover-arch" aria-hidden="true">
        <img src={image} alt="" decoding="async"/>
      </span>
      <h2>Pratap Palace</h2>
    </div>
  </div>;
}

export default function ScrollGallery() {
  const { gallery: featured, galleryCover } = useSiteContent();
  const pageCount = featured.length;
  const trackRef = useRef(null);
  const stageRef = useRef(null);
  const mobileStageRef = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 1023px)');
    let frame;
    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      if (preference.matches) {
        document.documentElement.style.removeProperty('--gallery-dim');
        setProgress(0);
        return;
      }
      const bounds = track.getBoundingClientRect();
      const viewport = window.innerHeight;
      if (mobile.matches) {
        document.documentElement.style.removeProperty('--gallery-dim');
        const travel = bounds.height - mobileStageRef.current.offsetHeight;
        setProgress(clamp((88 - bounds.top) / Math.max(1, travel)) * Math.max(0, pageCount - 1));
        return;
      }
      const entering = clamp(1 - bounds.top / viewport);
      const leaving = clamp(bounds.bottom / viewport);
      const darkness = Math.min(entering, leaving);
      const eased = darkness * darkness * (3 - 2 * darkness);
      document.documentElement.style.setProperty('--gallery-dim', String(eased));
      const travel = bounds.height - stageRef.current.offsetHeight;
      setProgress(clamp(-bounds.top / travel) * (pageCount + 2));
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    preference.addEventListener('change', schedule);
    mobile.addEventListener('change', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      preference.removeEventListener('change', schedule);
      mobile.removeEventListener('change', schedule);
      document.documentElement.style.removeProperty('--gallery-dim');
    };
  }, [pageCount]);


  const opening = clamp((progress - 0.2) / 0.65);
  const closing = clamp((progress - featured.length - 1.15) / 0.65);
  const finished = progress >= featured.length + 0.5;

  return <section id="home-gallery" ref={trackRef} aria-label="Discover Pratap Palace in photographs" className="palace-book-gallery"
    style={{ '--book-travel': `${220 + 60 * pageCount}svh`, '--stack-travel': `${100 + 75 * Math.max(0, pageCount - 1)}svh` }}>
    <div ref={mobileStageRef} className="palace-photo-stack">
      <div className="palace-photo-stack-cards">
        {featured.map((entry, index) => {
          const arrival = index === 0 ? 1 : clamp(progress - index + 1);
          const covered = clamp(progress - index);
          return <figure key={index} className="palace-photo-stack-card" style={{
            '--arrival': arrival,
            '--covered': covered,
            zIndex: index + 1,
          }}>
            <img src={entry.image} alt={entry.title} loading="lazy" decoding="async"/>
            <figcaption>
              <h3>{entry.title}</h3>
              <p>{entry.description}</p>
            </figcaption>
          </figure>;
        })}
      </div>
      <div className="palace-photo-stack-footer">
        <span aria-hidden="true"><ArrowDown size={14}/>Scroll to explore</span>
        <a href="/gallery">View gallery <ArrowUpRight size={16} aria-hidden="true"/></a>
      </div>
    </div>
    <div ref={stageRef} className="palace-book-stage">
      <div className="palace-book" style={{ '--opening': opening, '--closing': closing }}>
        <div className="palace-book-binding" aria-hidden="true"/>
        {[null, ...featured].map((entry, index) => {
          const turn = index === featured.length ? closing : clamp((progress - index - 0.2) / 0.65);
          const turned = turn === 1;
          const turning = turn > 0 && !turned;
          const next = featured[index];

          return <div key={index} className="palace-book-leaf" data-turned={turned} style={{
            '--turn': turn,
            '--turn-shadow': Math.sin(turn * Math.PI) * 0.3,
            zIndex: turning ? featured.length * 2 + 2 : turned ? index + 1 : featured.length * 2 + 1 - index,
          }}>
            <div className="palace-book-face palace-book-front">
              {entry ? <>
                <Photograph entry={entry} className="palace-book-inline-photo"/>
                <div className="palace-book-caption">
                  <p className="palace-book-number">{String(index).padStart(2, '0')} / {String(featured.length).padStart(2, '0')}</p>
                  <h3>{entry.title}</h3>
                  <p>{entry.description}</p>
                </div>
              </> : <Cover image={galleryCover}/>}
            </div>
            <div className="palace-book-face palace-book-back" aria-hidden="true">
              {next ? <Photograph entry={next}/> : <Cover image={galleryCover}/>}
            </div>
          </div>;
        })}
        <div className="palace-book-face palace-book-mobile-end" aria-hidden="true"><Cover image={galleryCover}/></div>
      </div>
      <div className="palace-book-footer">
        {!finished && <p className="palace-book-hint"><ArrowDown size={14} aria-hidden="true"/>{opening < 0.5 ? 'Scroll to open the book' : 'Scroll to turn the page'}</p>}
        <a className="palace-book-gallery-link" data-finished={finished} href="/gallery">View all <ArrowUpRight size={16} aria-hidden="true"/></a>
      </div>
    </div>
  </section>;
}
