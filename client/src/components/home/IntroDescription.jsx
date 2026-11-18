import { ArrowUpRight } from 'lucide-react';

export default function IntroDescription() {
  return <section id="story" className="palace-home-story" aria-labelledby="home-story-title">
    <div className="palace-home-story-copy">
      <h2 id="home-story-title">A slower rhythm.</h2>
      <p>Step into a slower rhythm at Pratap Palace. Let the everyday give way to quiet moments. Find comfort in the simple pleasure of staying.</p>
      <p>Make space for conversations and new memories. And take a little of that feeling home with you.</p>
      <a href="/gallery" className="palace-home-text-link">Explore the gallery <ArrowUpRight size={17} aria-hidden="true"/></a>
    </div>
    <figure className="palace-home-story-photo">
      <img src="/images/gallery/27-arched-corridor.jpg" alt="Carved sandstone arches and patterned floors at Pratap Palace" loading="lazy" decoding="async"/>
    </figure>
  </section>;
}
