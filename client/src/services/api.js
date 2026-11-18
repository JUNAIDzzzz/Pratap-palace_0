async function request(path, options) { const response = await fetch(`/api${path}`, options); const data = await response.json(); if (!response.ok) throw new Error(data.message || 'Something went wrong. Please try again.'); return data; }
export const getRooms = () => request('/rooms');
export const createInquiry = (body) => request('/inquiries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
