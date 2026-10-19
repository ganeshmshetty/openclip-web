'use client';

import { useState } from 'react';

// Deterministic tile hue from the extension id so letter-tile fallbacks are stable.
function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 360;
}

interface Props {
  id: string;
  name: string;
  iconURL?: string;
  size?: number;
  className?: string;
}

/**
 * Renders an extension's normalized monochrome icon.
 *
 * Icons are copied into `public/icons/extensions` at build (see
 * `copyPublishedIcons` in scripts/sync-extensions.ts), so they load from this
 * origin as ordinary lazy images. The publish pipeline emits black monochrome
 * SVGs, so dark mode inverts them rather than fetching and inlining the markup.
 *
 * Falls back to a deterministic letter tile when the file is absent.
 */
export default function ExtensionIcon({ id, name, iconURL, size = 32, className }: Props) {
  const [failed, setFailed] = useState(false);

  if (!iconURL || failed) {
    return (
      <div
        className={`flex items-center justify-center font-semibold text-white shrink-0 select-none ${className ?? ''}`}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          background: `hsl(${hueFor(id)}, 55%, 45%)`,
          fontSize: Math.round(size * 0.44),
        }}
        aria-hidden
      >
        {name.trim().charAt(0).toUpperCase() || '?'}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={iconURL}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`object-contain dark:invert ${className ?? ''}`}
      aria-hidden
    />
  );
}
