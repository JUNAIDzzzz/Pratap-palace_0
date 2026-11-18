const env = name => process.env[name]?.trim() || '';

export function notificationConfig() {
  let origin;
  try {
    const url = new URL(env('NOTIFICATION_PUBLIC_ORIGIN'));
    if (url.protocol === 'https:' && url.href === url.origin + '/') origin = url.origin;
  } catch {}

  const email = {
    key: env('RESEND_API_KEY'), from: env('NOTIFICATION_FROM'), webhookSecret: env('RESEND_WEBHOOK_SECRET'),
  };
  const whatsapp = {
    key: env('WHATSAPP_ACCESS_TOKEN'), numberId: env('WHATSAPP_PHONE_NUMBER_ID'), version: env('WHATSAPP_API_VERSION'),
    language: env('WHATSAPP_TEMPLATE_LANGUAGE') || 'en_US',
    appSecret: env('WHATSAPP_APP_SECRET'), verifyToken: env('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
    templates: {
      confirmation: env('WHATSAPP_CONFIRMATION_TEMPLATE'),
      quote: env('WHATSAPP_QUOTE_TEMPLATE'),
      reminder: env('WHATSAPP_REMINDER_TEMPLATE'),
    },
  };
  return {
    origin,
    email: { ...email, enabled: Boolean(origin && email.key && email.from && /^whsec_[a-zA-Z0-9+/_-]+={0,2}$/.test(email.webhookSecret)) },
    whatsapp: { ...whatsapp, enabled: Boolean(origin && whatsapp.key && /^\d+$/.test(whatsapp.numberId)
      && /^v\d+\.\d+$/.test(whatsapp.version) && whatsapp.appSecret && whatsapp.verifyToken
      && Object.values(whatsapp.templates).every(name => /^[a-z0-9_]+$/.test(name))) },
  };
}
