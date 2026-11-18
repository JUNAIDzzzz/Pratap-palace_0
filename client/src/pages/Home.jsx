import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUpRight, Pause, Play } from 'lucide-react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import IntroDescription from '../components/home/IntroDescription';
import ScrollGallery from '../components/home/ScrollGallery';
import ExperienceCarousel from '../components/home/ExperienceCarousel';
import Rooms from '../components/home/Rooms';
import BookingSearch from '../components/booking/BookingSearch';
import './Home.css';

const heroImage = '/images/gallery/03-courtyard-dome.jpg';

function HomeHero({ room }) {
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mobile = window.matchMedia('(max-width: 1023px)');
    function syncMotion() {
      if (motion.matches) video.pause();
      else video.play().catch(() => {});
    }
    function syncVideo() {
      setHasPlayed(false);
      video.src = mobile.matches ? '/videos/pratap-palace-mobile.mp4' : '/videos/pratap-palace.mp4';
      video.load();
      syncMotion();
    }
    syncVideo();
    mobile.addEventListener('change', syncVideo);
    motion.addEventListener('change', syncMotion);
    return () => {
      mobile.removeEventListener('change', syncVideo);
      motion.removeEventListener('change', syncMotion);
      video.pause();
    };
  }, []);

  function toggleVideo() {
    const video = videoRef.current;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  return <section className="palace-home-hero" aria-labelledby="home-title">
    <img className="palace-home-hero-still" src={heroImage} alt="" fetchPriority="high"/>
    <div className={`hero-video-frame ${hasPlayed ? 'palace-home-video-visible' : ''}`} aria-hidden="true">
      <video ref={videoRef} muted loop playsInline preload="none" onPlaying={() => {
        setHasPlayed(true);
        setPlaying(true);
      }} onPause={() => setPlaying(false)}>
      </video>
    </div>
    <h1 id="home-title" className="palace-home-hero-title">Pratap Palace</h1>
    <a href="/booking" className="palace-home-mobile-book">Book now <ArrowUpRight size={18} aria-hidden="true"/></a>
    <div className="palace-home-hero-booking" role="region" aria-label="Quick room search">
      <BookingSearch preferredRoom={room}/>
    </div>
  </section>;
}

export default function Home() {
  const [room, setRoom] = useState('any');

  function selectRoom(id) {
    const search = document.querySelector('.palace-home-hero-booking');
    if (!search.getClientRects().length) {
      window.location.assign(`/booking?${new URLSearchParams({ roomId: id })}`);
      return;
    }
    setRoom(id);
    search.querySelector('[name="checkIn"]').focus({ preventScroll: true });
    search.scrollIntoView({ block: 'center' });
  }

  return <>
    <Header mobileHeroBrand/>
    <main>
      <HomeHero room={room}/>
      <IntroDescription/>
      <ScrollGallery/>
      <Rooms onSelect={selectRoom}/>
      <ExperienceCarousel/>
    </main>
    <Footer/>
  </>;
}
