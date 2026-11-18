import { rooms } from '../data/rooms.js';
export function validateInquiry(body) {
 const {name,email,checkIn,checkOut,guests,room}=body;
 if(typeof name!=='string'||!name.trim()||name.length>100) return 'Please enter your name (up to 100 characters).';
 if(typeof email!=='string'||email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
 const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
 if(!validDate(checkIn)||!validDate(checkOut)) return 'Please select valid arrival and departure dates.';
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
 if(checkIn<today||checkOut<=checkIn) return 'Check-in must be today or later, and check-out must be after check-in.';
 if(!Number.isInteger(Number(guests))||Number(guests)<1||Number(guests)>4) return 'Please select between 1 and 4 guests.';
 const selected=rooms.find(item=>item.id===room);
 if(room!=='any'&&!selected) return 'Please select a valid room.';
 if(selected&&Number(guests)>selected.guests) return `This room accommodates up to ${selected.guests} guests.`;
 return null;
}
