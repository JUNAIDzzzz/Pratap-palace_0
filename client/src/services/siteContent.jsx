import { createContext, useContext, useEffect, useState } from 'react';
import { defaultSiteContent } from '../../../shared/siteContent.mjs';
import { api } from './bookingApi';

const SiteContentContext = createContext(defaultSiteContent);

export const defaultSocialLinks = {
  instagram: import.meta.env.VITE_INSTAGRAM_URL || 'https://www.instagram.com/pratap_palace_champaran',
  youtube: import.meta.env.VITE_YOUTUBE_URL || '',
  facebook: import.meta.env.VITE_FACEBOOK_URL || '',
};

export function SiteContentProvider({ children }) {
  const [content, setContent] = useState(defaultSiteContent);
  useEffect(() => {
    let active = true;
    api('/site-content').then(result => { if (active) setContent(result); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <SiteContentContext.Provider value={content}>{children}</SiteContentContext.Provider>;
}

export function useSiteContent() {
  return useContext(SiteContentContext);
}
