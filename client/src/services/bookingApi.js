export async function api(path, { method = 'GET', body, key, token } = {}) {
  const response = await fetch(`/api${path}`, {
    method, credentials: 'same-origin',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(key ? { 'Idempotency-Key': key } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data;
  try { data = await response.json(); } catch { throw new Error('The server is not available. Please try again.'); }
  if (!response.ok) {
    if (response.status === 401 && path.startsWith('/admin/') && path !== '/admin/login' && path !== '/admin/me') {
      window.dispatchEvent(new Event('pp-admin-session-expired'));
    }
    const error = new Error(data.message || 'Unable to complete your request.'); error.status = response.status; throw error;
  }
  return data;
}
export const money = amount => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount / 100);
export const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
export function nextDate(value) { return new Date(Date.parse(value) + 86400000).toISOString().slice(0, 10); }
