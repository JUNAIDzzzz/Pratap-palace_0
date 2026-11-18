import { useId } from 'react';

export default function BrandLogo({ className = '' }) {
  const clipId = useId();
  return <span className={`relative inline-flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#30353b] bg-black ${className}`}>
    <svg viewBox="44 12 186 122" role="img" aria-label="Pratap Palace" className="absolute inset-0 h-full w-full">
      <defs><clipPath id={clipId}><polygon points="64,14 214,14 224,72 228,72 228,109 192,109 192,132 88,132 88,109 46,109 46,72 64,72"/></clipPath></defs>
      <image href="/images/brand/pratap-palace-logo.png" width="242" height="140" clipPath={`url(#${clipId})`}/>
    </svg>
  </span>;
}
