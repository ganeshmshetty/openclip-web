'use client';

import { useEffect, useState } from 'react';

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
 * Renders an extension's normalized adaptive icon.
 *
 * The pipeline emits monochrome `currentColor` SVGs, so we fetch the markup and
 * render it INLINE — `currentColor` then inherits the page's text color and the
 * icon adapts to light/dark automatically. An `<img>` would freeze the color to
 * black and vanish in dark mode. Falls back to a deterministic letter tile when
 * the URL is missing, fails to load, or is not an SVG.
 */
export default function ExtensionIcon({ id, name, iconURL, size = 32, className }: Props) {
  const [failed, setFailed] = useState(false);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!iconURL) return;
    let cancelled = false;
    setSvg(null);
    setFailed(false);

    fetch(iconURL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const trimmed = text.trim();
        if (!trimmed.startsWith('<svg')) throw new Error('not an SVG document');
        // Defensive strip (content comes from our own publish pipeline).
        const clean = trimmed.replace(/<script[\s\S]*?<\/script>/gi, '');
        // Pipeline strips fixed dimensions; size explicitly for layout.
        const sized = clean.replace('<svg', `<svg width="${size}" height="${size}"`);
        setSvg(sized);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [iconURL, size]);

  if (!iconURL || failed || !svg) {
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
    <span
      role="img"
      aria-label={`${name} icon`}
      className={`inline-flex shrink-0 items-center justify-center leading-none ${className ?? ''}`}
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
