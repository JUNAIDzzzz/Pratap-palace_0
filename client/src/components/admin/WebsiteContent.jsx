import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Upload } from 'lucide-react';
import { maxContentImageBytes, maxGalleryPages, maxGalleryPhotos } from '../../../../shared/siteContent.mjs';
import { api } from '../../services/bookingApi';
import { defaultSocialLinks } from '../../services/siteContent';

const field = 'mt-1.5 block w-full rounded border border-brown/25 bg-offwhite px-3 py-2.5 text-sm';
const card = 'rounded-xl border border-brown/15 bg-offwhite p-4 sm:p-6';
const button = 'inline-flex min-h-10 items-center justify-center gap-2 rounded border border-brown/25 px-3 py-2 text-sm disabled:opacity-40';

function toDraft(content) {
  return {
    ...content,
    socials: content.socials ?? { ...defaultSocialLinks },
    gallery: content.gallery.map(page => ({ ...page, key: crypto.randomUUID() })),
    galleryPhotos: content.galleryPhotos.map(photo => ({ ...photo, key: crypto.randomUUID() })),
    roomPhotos: Object.fromEntries(content.rooms.map(room => [room.id, room.image])),
  };
}

function fileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  });
}

function ImageField({ label, value, onChange, upload }) {
  const [broken, setBroken] = useState('');
  const preview = /^\/(?:images\/|api\/site-content\/images\/)|^https:\/\//i.test(value);
  return <div className="grid items-start gap-3 sm:grid-cols-[6rem_minmax(0,1fr)]">
    <div className="grid aspect-[4/3] w-24 place-items-center overflow-hidden rounded border border-brown/15 bg-sand/30">
      {preview && broken !== value
        ? <img className="h-full w-full object-cover" src={value} alt="" onError={() => setBroken(value)}/>
        : <span className="px-1 text-center text-xs text-muted">No preview</span>}
    </div>
    <div className="min-w-0">
      <label className="block text-sm">{label}<input className={field} value={value} onChange={event => {
        setBroken('');
        onChange(event.target.value);
      }} required maxLength={1024} placeholder="Upload an image or enter an HTTPS URL"/></label>
      <label className={`${button} relative mt-2 cursor-pointer focus-within:outline-2 focus-within:outline-caramel`}>
        <Upload size={15} aria-hidden="true"/> Upload image
        <span className="sr-only"> for {label}</span>
        <input className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={event => {
          const [file] = event.target.files;
          event.target.value = '';
          if (file) upload(file, onChange);
        }}/>
      </label>
    </div>
  </div>;
}

export default function WebsiteContent({ onPublished }) {
  const [draft, setDraft] = useState(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [load, setLoad] = useState(0);
  const status = useRef(null);

  useEffect(() => {
    let current = true;
    api('/admin/site-content').then(content => { if (current) setDraft(toDraft(content)); })
      .catch(err => { if (current) setError(err.message); });
    return () => { current = false; };
  }, [load]);

  function edit(key, value) {
    setNotice('');
    setDraft(current => ({ ...current, [key]: value }));
  }

  function editEntry(collection, key, fieldName, value) {
    setNotice('');
    setDraft(current => ({
      ...current,
      [collection]: current[collection].map(entry => entry.key === key ? { ...entry, [fieldName]: value } : entry),
    }));
  }

  function moveEntry(collection, index, direction) {
    const entries = [...draft[collection]];
    const other = index + direction;
    [entries[index], entries[other]] = [entries[other], entries[index]];
    edit(collection, entries);
  }

  async function upload(file, onChange) {
    setError('');
    setNotice('');
    setBusy('Uploading image…');
    try {
      if (file.size > maxContentImageBytes) throw new Error('Choose an image up to 3 MB.');
      const { url } = await api('/admin/site-content/images', { method: 'POST', body: { data: await fileData(file) } });
      onChange(url);
      setNotice('Image uploaded. Publish changes to show it on the website.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function publish(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy('Publishing…');
    try {
      const { revision, galleryCover, gallery, galleryPhotos, roomPhotos, diningDescription, eventsDescription, contact, socials } = draft;
      const pages = gallery.map(({ image, title, description }) => ({ image, title, description }));
      const content = await api('/admin/site-content', {
        method: 'PUT',
        body: { revision, galleryCover, gallery: pages, galleryPhotos: galleryPhotos.map(({ image, caption }) => ({ image, caption })), roomPhotos, diningDescription, eventsDescription, contact, socials },
      });
      setDraft(toDraft(content));
      setNotice('Changes published to the website.');
      onPublished?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
      status.current?.scrollIntoView({ block: 'nearest' });
    }
  }

  const reload = () => {
    if (draft && !window.confirm('Discard unsaved edits and reload the published content?')) return;
    setDraft(null);
    setError('');
    setNotice('');
    setLoad(value => value + 1);
  };

  return <section aria-label="Website content editor" className="mx-auto max-w-5xl">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted">Edit what guests see. Changes go live when you publish.</p>
      <button type="button" className={button} disabled={Boolean(busy)} onClick={reload}>Reload published content</button>
    </div>
    <div ref={status} className="mb-4" aria-live="polite">
      {busy && <p role="status" className="rounded bg-sand/40 p-3 text-sm">{busy}</p>}
      {notice && <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
      {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>}
      {!draft && !error && <p role="status" className="text-sm text-muted">Loading website content…</p>}
    </div>
    {draft && <form onSubmit={publish}>
      <fieldset disabled={Boolean(busy)} className="min-w-0 space-y-5">
        <section className={card}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Homepage gallery</h2>
              <p className="mt-1 text-sm text-muted">Arrange the pages of the homepage photo book. Use JPG, PNG or WebP images up to 3 MB.</p>
            </div>
            <button type="button" className={button} disabled={draft.gallery.length >= maxGalleryPages}
              onClick={() => edit('gallery', [...draft.gallery, { key: crypto.randomUUID(), image: '', title: '', description: '' }])}>
              <Plus size={15} aria-hidden="true"/> Add page
            </button>
          </div>
          <ImageField label="Book cover photo" value={draft.galleryCover} onChange={value => edit('galleryCover', value)} upload={upload}/>
          <ol className="mt-5 space-y-4">
            {draft.gallery.map((page, index) => <li key={page.key} className="rounded-lg border border-brown/15 p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Page {index + 1}</h3>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={button} disabled={index === 0} aria-label={`Move page ${index + 1} up`} onClick={() => moveEntry('gallery', index, -1)}><ArrowUp size={15} aria-hidden="true"/></button>
                  <button type="button" className={button} disabled={index === draft.gallery.length - 1} aria-label={`Move page ${index + 1} down`} onClick={() => moveEntry('gallery', index, 1)}><ArrowDown size={15} aria-hidden="true"/></button>
                  <button type="button" className={button} disabled={draft.gallery.length === 1} onClick={() => edit('gallery', draft.gallery.filter(item => item.key !== page.key))}>Remove page</button>
                </div>
              </div>
              <ImageField label={`Page ${index + 1} photo`} value={page.image} onChange={value => editEntry('gallery', page.key, 'image', value)} upload={upload}/>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm">Title<input className={field} required maxLength={70} value={page.title} onChange={event => editEntry('gallery', page.key, 'title', event.target.value)}/></label>
                <label className="text-sm">Caption<textarea className={field} rows="2" required maxLength={160} value={page.description} onChange={event => editEntry('gallery', page.key, 'description', event.target.value)}/></label>
              </div>
            </li>)}
          </ol>
        </section>
        <section className={card}>
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl">Gallery page</h2>
              <p className="mt-1 text-sm text-muted">Manage the photos, captions, and display order on the standalone gallery page.</p>
            </div>
            <button type="button" className={button} disabled={draft.galleryPhotos.length >= maxGalleryPhotos}
              onClick={() => edit('galleryPhotos', [...draft.galleryPhotos, { key: crypto.randomUUID(), image: '', caption: '' }])}>
              <Plus size={15} aria-hidden="true"/> Add photo
            </button>
          </div>
          <ol className="space-y-4">
            {draft.galleryPhotos.map((photo, index) => <li key={photo.key} className="rounded-lg border border-brown/15 p-3 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Photo {index + 1}</h3>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={button} disabled={index === 0} aria-label={`Move photo ${index + 1} up`}
                    onClick={() => moveEntry('galleryPhotos', index, -1)}><ArrowUp size={15} aria-hidden="true"/></button>
                  <button type="button" className={button} disabled={index === draft.galleryPhotos.length - 1} aria-label={`Move photo ${index + 1} down`}
                    onClick={() => moveEntry('galleryPhotos', index, 1)}><ArrowDown size={15} aria-hidden="true"/></button>
                  <button type="button" className={button} disabled={draft.galleryPhotos.length === 1}
                    onClick={() => edit('galleryPhotos', draft.galleryPhotos.filter(item => item.key !== photo.key))}>Remove photo</button>
                </div>
              </div>
              <ImageField label={`Gallery photo ${index + 1}`} value={photo.image} onChange={value => editEntry('galleryPhotos', photo.key, 'image', value)} upload={upload}/>
              <label className="mt-3 block text-sm">Caption<input className={field} required maxLength={160} value={photo.caption}
                onChange={event => editEntry('galleryPhotos', photo.key, 'caption', event.target.value)}/></label>
            </li>)}
          </ol>
        </section>
        <section className={card}>
          <h2 className="font-display text-2xl">Room photos</h2>
          <p className="mt-1 text-sm text-muted">These photos appear on room cards and in booking results.</p>
          <div className="mt-5 grid gap-5">
            {draft.rooms.map(room => <ImageField key={room.id} label={room.name} value={draft.roomPhotos[room.id]}
              onChange={value => edit('roomPhotos', { ...draft.roomPhotos, [room.id]: value })} upload={upload}/>)}
          </div>
        </section>
        <section className={card}>
          <h2 className="font-display text-2xl">Dining and events</h2>
          <p className="mt-1 text-sm text-muted">Update the introduction on each landing page. Venue-specific descriptions and policies are managed in the corresponding booking tab.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm">Dining introduction<textarea className={field} rows="4" required maxLength={400}
              value={draft.diningDescription} onChange={event => edit('diningDescription', event.target.value)}/></label>
            <label className="text-sm">Event introduction<textarea className={field} rows="4" required maxLength={400}
              value={draft.eventsDescription} onChange={event => edit('eventsDescription', event.target.value)}/></label>
          </div>
        </section>
        <section className={card}>
          <h2 className="font-display text-2xl">Footer contact and social links</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="text-sm sm:col-span-2">Hotel address<textarea className={field} rows="2" maxLength={300} value={draft.contact.address}
              onChange={event => edit('contact', { ...draft.contact, address: event.target.value })}/></label>
            <label className="text-sm">Hotel phone<input className={field} type="tel" maxLength={25} value={draft.contact.phone}
              onChange={event => edit('contact', { ...draft.contact, phone: event.target.value })}/></label>
            <label className="text-sm">Hotel email<input className={field} type="email" maxLength={254} value={draft.contact.email}
              onChange={event => edit('contact', { ...draft.contact, email: event.target.value })}/></label>
            {Object.entries({ instagram: 'Instagram', youtube: 'YouTube', facebook: 'Facebook' }).map(([key, label]) =>
              <label key={key} className="text-sm">{label} profile URL<input className={field} type="url" maxLength={1024}
                value={draft.socials[key]} onChange={event => edit('socials', { ...draft.socials, [key]: event.target.value })}/></label>)}
          </div>
        </section>
        <button className="rounded bg-brown px-6 py-3 text-sm font-semibold text-offwhite disabled:opacity-50">Publish changes</button>
      </fieldset>
    </form>}
  </section>;
}
