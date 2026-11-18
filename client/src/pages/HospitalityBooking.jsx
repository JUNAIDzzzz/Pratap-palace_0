import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Clock, Users, CheckCircle2 } from 'lucide-react';
import GuestLayout from '../components/hospitality/GuestLayout';
import HotelContact from '../components/hospitality/HotelContact';
import NotificationPreference from '../components/booking/NotificationPreference';
import DiningHero from '../components/hospitality/DiningHero';
import EventsHero from '../components/hospitality/EventsHero';
import DescriptionPanel from '../components/hospitality/DescriptionPanel';
import { api, localToday, money } from '../services/bookingApi';

export default function HospitalityBooking({ kind }) {
  const dining=kind==='dining';
  const [catalog,setCatalog]=useState(null),[resourceId,setResourceId]=useState('');
  const [date,setDate]=useState(localToday()),[guests,setGuests]=useState(2),[partyType,setPartyType]=useState('Couple');
  const [time,setTime]=useState(''),[endTime,setEndTime]=useState(''),[layout,setLayout]=useState('');
  const [availability,setAvailability]=useState(null),[error,setError]=useState(''),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[booking,setBooking]=useState(null);
  const requestRef=useRef(null);
  const checkVersion=useRef(0);
  const resource=catalog?.find(item=>item.id===resourceId),config=resource?.config;
  const eventStart=dining?'':time;
  const selectedSlot=dining?availability?.slots.find(slot=>slot.time===time):null;
  useEffect(()=>{let live=true;api(`/hospitality/resources?kind=${kind}`).then(data=>{if(live){setCatalog(data);if(data[0]){setResourceId(data[0].id);setLayout(data[0].config.layouts.find(item=>item.capacity>0)?.name||'');}}}).catch(err=>{if(live)setError(err.message);});return()=>{live=false;};},[kind]);
  useEffect(()=>{
    checkVersion.current++;
    setAvailability(null);
    setChecking(false);
    if(dining)setTime('');
  },[dining,resourceId,date,guests,layout,endTime,eventStart]);
  async function check(event){
    event.preventDefault();
    const version=++checkVersion.current;
    setError('');
    setChecking(true);
    setAvailability(null);
    if(dining)setTime('');
    try{
      const query={resourceId,date,guests,...(!dining?{time,endTime,layout}:{})};
      const result=await api(`/hospitality/${kind}/availability?${new URLSearchParams(query)}`);
      if(version!==checkVersion.current)return;
      setCatalog(items=>items.map(item=>item.id===result.resourceId?{...item,name:result.resourceName,config:result.config,revision:result.revision}:item));
      setAvailability(result);
    }catch(err){if(version===checkVersion.current)setError(err.message);}
    finally{if(version===checkVersion.current)setChecking(false);}
  }
  async function submit(event){
    event.preventDefault();if(busy)return;setError('');setBusy(true);
    const body={...Object.fromEntries(new FormData(event.currentTarget)),resourceId,date,time,endTime,guests:Number(guests),layout,partyType,revision:availability.revision,acceptPolicies:true,...(dining?{expectedTotal:selectedSlot.total}:{})};
    const signature=JSON.stringify(body);if(requestRef.current?.signature!==signature)requestRef.current={signature,key:crypto.randomUUID()};
    try{setBooking(await api(`/hospitality/${kind}/reservations`,{method:'POST',body,key:requestRef.current.key}));window.scrollTo({top:0,behavior:'smooth'});}catch(err){setError(err.message);}finally{setBusy(false);}
  }
  const field='mt-2 w-full rounded border border-brown/20 bg-offwhite px-4 py-3 text-sm';
  const manageLink=booking?`/manage#${new URLSearchParams({reference:booking.reference,token:booking.manageToken})}`:'';
  if(booking)return <GuestLayout><div className="mx-auto max-w-2xl border border-brown/20 p-8 lg:p-12"><CheckCircle2 size={34}/><p className="mt-6 text-xs uppercase tracking-[.2em]">{dining?'Table request received':'Event enquiry received'}</p><h1 className="mt-5 font-display text-4xl">Thank you, {booking.data.name}.</h1><p className="mt-6 leading-7">{dining?'Your table is temporarily held while the hotel arranges full payment. Your reservation is not confirmed until the hotel verifies the full amount.':'The hotel will review your event and prepare a quote. This enquiry does not reserve the venue yet.'}</p><dl className="my-7 grid gap-4 border-y border-brown/20 py-7 text-sm"><div>Reference: <strong>{booking.reference}</strong></div><div>{booking.data.resourceName} · {booking.data.guests} guests</div><div>{booking.data.date} · {booking.data.time} – {booking.data.endTime} IST</div>{dining&&<div>Full amount required: <strong>{money(booking.total)}</strong></div>}</dl><p className="text-xs leading-6 text-muted">Save your private booking link below to view updates{dining?'':' and review the hotel’s quote'}. Anyone with this link can access this booking. No payment has been collected on this website.</p><a href={manageLink} className="mt-6 inline-flex items-center gap-4 bg-brown px-6 py-4 text-sm text-offwhite">Open private reservation <ArrowRight size={16}/></a>{dining ? <div className="mt-5"><HotelContact reference={booking.reference}/></div> : null}</div></GuestLayout>;
  return <GuestLayout hero={dining ? <DiningHero/> : <EventsHero/>}>
    {!catalog&&!error&&<p>Loading {dining?'restaurants':'venues'}…</p>}{catalog?.length===0&&<div className="border border-brown/20 bg-sand/30 p-10"><h2 className="font-display text-3xl">Reservations will open soon.</h2><p className="mt-4 text-muted">We’re preparing our {dining?'dining experiences':'event venues'}. Please check back soon.</p><a href="/" className="mt-6 inline-block underline">Return to the hotel</a></div>}
    {!!catalog?.length&&<div className="grid gap-10 lg:grid-cols-[1.2fr_.8fr]"><div><form onSubmit={check} className="border border-brown/20 p-6 md:p-8"><h2 className="font-display text-3xl">{dining?'Find your table':'Plan your event'}</h2><div className="mt-6 grid gap-5 sm:grid-cols-2"><label className="text-xs sm:col-span-2">{dining?'Restaurant':'Venue'}<select value={resourceId} onChange={e=>{setResourceId(e.target.value);const next=catalog.find(item=>item.id===e.target.value);setLayout(next?.config.layouts.find(item=>item.capacity>0)?.name||'');}} className={field}>{catalog.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs">Date<input type="date" required min={localToday()} value={date} onChange={e=>setDate(e.target.value)} className={field}/></label><label className="text-xs">Total guests, including children<input type="number" required min={1} max={dining?config.maxParty:10000} value={guests} onChange={e=>setGuests(e.target.value)} className={field}/></label>{dining?<label className="text-xs sm:col-span-2">Your gathering<select value={partyType} onChange={e=>{setPartyType(e.target.value);if(e.target.value==='Couple')setGuests(2);}} className={field}><option>Couple</option><option>Family</option><option>Group</option></select></label>:<><label className="text-xs">Start time<input type="time" required value={time} onChange={e=>{setTime(e.target.value);setAvailability(null);}} className={field}/></label><label className="text-xs">End time<input type="time" required value={endTime} onChange={e=>setEndTime(e.target.value)} className={field}/></label><label className="text-xs sm:col-span-2">Seating layout<select value={layout} onChange={e=>setLayout(e.target.value)} className={field}>{config.layouts.filter(item=>item.capacity>0).map(item=><option key={item.name} value={item.name}>{item.name} · up to {item.capacity} guests</option>)}</select></label></>}</div><button disabled={checking} className="mt-6 flex w-full items-center justify-center gap-4 bg-brown px-6 py-4 text-sm text-offwhite disabled:opacity-50">{checking?'Checking…':'Check availability'}<ArrowRight size={16}/></button></form>
    {availability&&<div className="mt-7 border border-brown/20 p-6 md:p-8">{dining?<><h3 className="font-display text-2xl">Available seating times</h3><div className="mt-5 flex flex-wrap gap-3">{availability.slots.map(slot=><button key={slot.time} onClick={()=>setTime(slot.time)} className={`border px-4 py-3 text-sm ${time===slot.time?'border-brown bg-brown text-offwhite':'border-brown/25'}`}>{slot.time} · {slot.period}</button>)}</div>{!availability.slots.length&&<p className="mt-4 text-sm text-muted">No tables are available for this party and date. Try another date or a smaller party.</p>}</>:<p className="flex items-center gap-3 text-sm"><CheckCircle2 size={18}/>Venue is currently available. Enquiries do not hold inventory; your hotel quote will reserve the time.</p>}</div>}
    {availability&&time&&(!dining||selectedSlot)&&<form onSubmit={submit} className="mt-7 border border-brown/20 p-6 md:p-8"><h3 className="font-display text-3xl">Your details</h3><div className="mt-6 grid gap-5 sm:grid-cols-2">{[['name','Full name','text'],['email','Email','email'],['phone','Phone','tel']].map(([name,label,type])=><label className="text-xs" key={name}>{label}<input name={name} type={type} required maxLength={name==='name'?100:name==='phone'?25:254} className={field}/></label>)}{!dining&&<label className="text-xs">Event type<select name="eventType" className={field}><option>Wedding</option><option>Family celebration</option><option>Birthday</option><option>Conference</option><option>Meeting</option><option>Other</option></select></label>}<label className="text-xs sm:col-span-2">{dining?'Dietary needs, allergies, accessibility or special requests':'Catering, dietary needs, equipment, decor and other requirements'}<textarea name="notes" maxLength={2000} rows={4} className={field}/></label></div>{dining&&<div className="mt-6 border-y border-brown/20 py-5"><p className="text-sm">{guests} guests × {money(config.pricePerGuest)}</p><p className="mt-2 font-display text-3xl">{money(selectedSlot.total)} <span className="font-sans text-xs">full package amount</span></p></div>}<label className="mt-6 flex items-start gap-3 text-xs leading-6"><input required type="checkbox" className="mt-1"/>I have read the displayed policies{dining?' and understand that full payment must be verified before confirmation. The website does not collect payments yet.':'. I understand this is an enquiry and the venue is only held after the hotel issues a valid quote.'}</label><NotificationPreference/>{error&&<p role="alert" className="mt-5 text-sm text-red-800">{error}</p>}<button disabled={busy} className="mt-6 w-full bg-brown px-6 py-4 text-sm text-offwhite disabled:opacity-50">{busy?'Submitting…':dining?'Request table · payment pending':'Send event enquiry'}</button></form>}</div>
    {config&&<DescriptionPanel key={resource.id} constrained><h2 className="font-display text-3xl">{resource.name}</h2><p className="mt-4 text-sm leading-7 text-muted">{config.description}</p><div className="mt-7 space-y-3 border-y border-brown/15 py-6 text-sm">{config.hours.map(period=><p key={period.name} className="flex items-center gap-3"><Clock size={15}/>{period.name}: {period.start} – {period.end}</p>)}<p className="flex items-center gap-3"><Users size={15}/>{dining?`${config.duration} minute seating · maximum ${config.maxParty} guests per request`:'Layout capacities apply to the complete party'}</p><p>Advance notice: {config.leadHours} hours</p>{config.dressCode&&<p>Dress code: {config.dressCode}</p>}</div>{dining&&<><h3 className="mt-6 text-sm font-semibold">Your prepaid package includes</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{config.inclusions}</p></>}<h3 className="mt-6 text-sm font-semibold">Before you book</h3><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted">{config.rules}</p><p className="mt-5 text-xs leading-6 text-muted">{dining?`A table hold lasts ${config.holdMinutes} minutes. Full payment must be arranged with the hotel and verified before it expires.`:'Prices and inclusions are provided in your hotel quote. Full verified payment is required for confirmation.'} No online payment is collected here.</p></DescriptionPanel>}</div>}
    {error&&!busy&&<p role="alert" className="mt-6 border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</p>}
  </GuestLayout>;
}
