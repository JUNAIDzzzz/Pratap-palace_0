import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { defaultSiteContent, maxContentImageBytes, maxGalleryPages, maxGalleryPhotos } from '../../../shared/siteContent.mjs';
import { db, transaction } from './database.js';
import { fail, validPhone } from './booking.js';

db.exec(`
  CREATE TABLE IF NOT EXISTS website_content (
    id INTEGER PRIMARY KEY CHECK (id=1), revision INTEGER NOT NULL, content TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS website_images (
    id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL
  );
`);

const imagePath = '/api/site-content/images/';
const localImages = new URL('../../../client/public/', import.meta.url);
const socialHosts = { instagram: 'instagram.com', youtube: 'youtube.com', facebook: 'facebook.com' };

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Provide valid ${label}.`);
  return value;
}

function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    fail(`Enter ${label} (${required ? '1 to ' : 'up to '}${max} characters).`);
  }
  return value.trim();
}

function httpsUrl(value) {
  if (!/^https:\/\//i.test(value)) return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url;
  } catch {}
}

function image(value, label) {
  const src = text(value, label, 1024, true);
  if (src.startsWith(imagePath)) {
    const id = src.slice(imagePath.length);
    if (/^[a-f0-9]{64}$/.test(id) && db.prepare('SELECT 1 FROM website_images WHERE id=?').get(id)) return src;
    fail(`Upload a valid image for ${label}.`);
  }
  if (/^\/images\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp)$/i.test(src)
      && existsSync(new URL(src.slice(1), localImages))) return src;
  const url = httpsUrl(src);
  if (url) return url.href;
  fail(`Upload an image or enter an HTTPS image URL for ${label}.`);
}

export function siteContent() {
  const row = db.prepare('SELECT revision, content FROM website_content WHERE id=1').get();
  return row ? { ...defaultSiteContent, ...JSON.parse(row.content), revision: row.revision }
    : { ...defaultSiteContent, revision: 0 };
}

export function adminSiteContent() {
  return { ...siteContent(), rooms: db.prepare('SELECT id, name, image FROM rooms ORDER BY name').all() };
}

export function saveSiteContent(input) {
  const gallery = input.gallery;
  if (!Array.isArray(gallery) || !gallery.length || gallery.length > maxGalleryPages) fail(`Use 1 to ${maxGalleryPages} gallery pages.`);
  record(input.contact, 'contact details');
  record(input.socials, 'social links');
  const contact = {
    address: text(input.contact.address, 'an address', 300),
    phone: text(input.contact.phone, 'a phone number', 25),
    email: text(input.contact.email, 'an email address', 254),
  };
  if (contact.phone && !validPhone(contact.phone)) fail('Enter a valid hotel phone number.');
  if (contact.email && !/^[^\s@?#]+@[^\s@?#]+\.[^\s@?#]+$/.test(contact.email)) fail('Enter a valid hotel email address.');

  return transaction(() => {
    const { revision, galleryPhotos: publishedPhotos } = siteContent();
    if (input.revision !== revision) fail('Another editor published changes. Reload the content before saving.', 409);
    const galleryPhotos = input.galleryPhotos === undefined ? publishedPhotos : input.galleryPhotos;
    if (!Array.isArray(galleryPhotos) || !galleryPhotos.length || galleryPhotos.length > maxGalleryPhotos) {
      fail(`Use 1 to ${maxGalleryPhotos} photos on the gallery page.`);
    }
    const socials = {};
    for (const [platform, host] of Object.entries(socialHosts)) {
      const value = text(input.socials[platform], `a ${platform} link`, 1024);
      const url = httpsUrl(value);
      if (value && (!url || (url.hostname !== host && !url.hostname.endsWith('.' + host)) || url.pathname === '/')) {
        fail(`Enter an HTTPS ${platform} profile URL.`);
      }
      socials[platform] = url?.href ?? '';
    }
    const content = {
      galleryCover: image(input.galleryCover, 'the book cover'),
      gallery: gallery.map((entry, index) => {
        record(entry, 'gallery page');
        return {
          image: image(entry.image, `gallery page ${index + 1}`),
          title: text(entry.title, `a title for gallery page ${index + 1}`, 70, true),
          description: text(entry.description, `a caption for gallery page ${index + 1}`, 160, true),
        };
      }),
      galleryPhotos: galleryPhotos.map((entry, index) => {
        record(entry, 'gallery photo');
        const label = `gallery photo ${index + 1}`;
        return { image: image(entry.image, label), caption: text(entry.caption, `a caption for ${label}`, 160, true) };
      }),
      diningDescription: text(input.diningDescription, 'a dining description', 400, true),
      eventsDescription: text(input.eventsDescription, 'an event description', 400, true),
      contact,
      socials,
    };
    const photos = record(input.roomPhotos, 'room photos');
    const rooms = db.prepare('SELECT id, name FROM rooms').all();
    const updatePhoto = db.prepare('UPDATE rooms SET image=? WHERE id=?');
    for (const room of rooms) updatePhoto.run(image(photos[room.id], room.name), room.id);
    db.prepare(`
      INSERT INTO website_content VALUES (1, ?, ?)
      ON CONFLICT(id) DO UPDATE SET revision=excluded.revision, content=excluded.content
    `).run(revision + 1, JSON.stringify(content));
    return adminSiteContent();
  });
}

export function saveSiteImage(input) {
  const data = input?.data;
  if (typeof data !== 'string' || !data || data.length > Math.ceil(maxContentImageBytes / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    fail('Choose an image up to 3 MB.');
  }
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > maxContentImageBytes || bytes.toString('base64') !== data) fail('Invalid image data.');
  let mime;
  if (bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      && bytes.toString('ascii', 12, 16) === 'IHDR' && bytes.toString('ascii', bytes.length - 8, bytes.length - 4) === 'IEND') mime = 'image/png';
  if (bytes.length >= 8 && bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex')) && bytes.readUInt16BE(bytes.length - 2) === 0xffd9) mime = 'image/jpeg';
  if (bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
      && bytes.readUInt32LE(4) === bytes.length - 8 && ['VP8 ', 'VP8L', 'VP8X'].includes(bytes.toString('ascii', 12, 16))) mime = 'image/webp';
  if (!mime) fail('Upload a JPG, PNG, or WebP image.');
  const id = createHash('sha256').update(bytes).digest('hex');
  db.prepare('INSERT OR IGNORE INTO website_images VALUES(?,?,?)').run(id, mime, bytes);
  return { url: imagePath + id };
}

export function siteImage(id) {
  const image = /^[a-f0-9]{64}$/.test(id) && db.prepare('SELECT mime, bytes FROM website_images WHERE id=?').get(id);
  if (!image) fail('Image not found.', 404);
  return image;
}
