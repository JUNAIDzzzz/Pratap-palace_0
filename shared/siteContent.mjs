const galleryPhotos = [
  {
    image: "/images/gallery/02-dome-through-palms.jpg",
    caption: "Dome through palms"
  },
  {
    image: "/images/gallery/03-courtyard-dome.jpg",
    caption: "Courtyard dome"
  },
  {
    image: "/images/gallery/05-carved-archway.jpg",
    caption: "Carved archway"
  },
  {
    image: "/images/gallery/10-lobby-overview.jpg",
    caption: "Lobby overview"
  },
  {
    image: "/images/gallery/13-lobby-seating.jpg",
    caption: "Lobby seating"
  },
  {
    image: "/images/gallery/14-bedroom-artwork.jpg",
    caption: "Bedroom artwork"
  },
  {
    image: "/images/gallery/15-bedside-lamp.jpg",
    caption: "Bedside lamp"
  },
  {
    image: "/images/gallery/16-bed-detail.jpg",
    caption: "Bed detail"
  },
  {
    image: "/images/gallery/18-bedroom-wide.jpg",
    caption: "Bedroom wide"
  },
  {
    image: "/images/gallery/19-room-window.jpg",
    caption: "Room window"
  },
  {
    image: "/images/gallery/21-balcony-door.jpg",
    caption: "Balcony door"
  },
  {
    image: "/images/gallery/22-balcony-architecture.jpg",
    caption: "Balcony architecture"
  },
  {
    image: "/images/gallery/23-terrace-view.jpg",
    caption: "Terrace view"
  },
  {
    image: "/images/gallery/27-arched-corridor.jpg",
    caption: "Arched corridor"
  }
];

export const defaultSiteContent = {
  galleryPhotos,
  galleryCover: '/images/gallery/02-dome-through-palms.jpg',
  gallery: [
    { image: '/images/gallery/03-courtyard-dome.jpg', title: 'A glimpse of the courtyard.', description: 'A dome framed by carved arches and sunlit stone.' },
    { image: '/images/gallery/05-carved-archway.jpg', title: 'Details worth a closer look.', description: 'Sculpted columns and intricate patterns frame the view.' },
    { image: '/images/gallery/13-lobby-seating.jpg', title: 'A space to settle in.', description: 'Warm seating beneath the glow of a chandelier.' },
    { image: '/images/gallery/18-bedroom-wide.jpg', title: 'Room to slow down.', description: 'Soft bedding and framed artwork bring warmth to the room.' },
    { image: '/images/gallery/27-arched-corridor.jpg', title: 'Follow the arches.', description: 'A quiet corridor opens onto light and patterned stone.' },
  ],
  diningDescription: 'Reserve a prepaid dining experience for two, a family gathering, or a group. Explore available seating times and the complete package price before requesting your table.',
  eventsDescription: 'Tell us about your celebration or meeting. Check venue availability, send your requirements, and review a tailored quote from the hotel.',
  contact: { address: '', phone: '', email: '' },
  socials: null,
};

export const maxContentImageBytes = 3 * 1024 * 1024;
export const maxGalleryPages = 8;
export const maxGalleryPhotos = 20;
