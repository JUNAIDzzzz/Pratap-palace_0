import { useEffect, useState } from 'react';
import { api } from '../../services/bookingApi';

export default function NotificationPreference() {
  const [options, setOptions] = useState(null);
  useEffect(() => {
    let current = true;
    api('/notifications/options').then(result => { if (current) setOptions(result); }).catch(() => {});
    return () => { current = false; };
  }, []);
  if (!options?.whatsapp) return null;
  return <label className="mt-4 flex items-start gap-3 text-xs leading-6">
    <input className="mt-1" type="checkbox" name="whatsappUpdates" value="true"/>
    <span>Send reservation updates to my WhatsApp number. Include the country code above (for example, +91).
      {options.email && ' Otherwise, reservation updates go to your email.'}</span>
  </label>;
}
