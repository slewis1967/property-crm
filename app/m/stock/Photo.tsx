"use client";

import { useState } from "react";

/**
 * A builder-hosted photo that falls back to a plain tile if it fails. Stored
 * brochure_url links die or turn out not to be images (see PropertyGrid), and a
 * broken-image icon is worse than no picture when showing a client.
 */
export default function Photo({ src, alt, className }: { src: string | null; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className={`${className} flex items-center justify-center bg-gradient-to-br from-[#0F4C5C]/10 to-[#0F4C5C]/25 text-2xl`}>🏠</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={`${className} object-cover`} />
  );
}
