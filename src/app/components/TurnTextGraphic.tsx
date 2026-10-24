import { useId } from 'react';

type Props = { className?: string; title?: string };

/**
 * "Turn text into action." illustration: a selection toolbar (search, Copy, Cut, Paste, AI)
 * floating over a highlighted headline on a lavender paper card.
 * Pure inline SVG, so it stays crisp at any size. Aspect 1024:407.
 */
export default function TurnTextGraphic({ className = '', title = 'Turn text into action.' }: Props) {
  const id = useId().replace(/:/g, '');
  const grain = `grain-${id}`;
  const clip = `clip-${id}`;
  const navy = '#14234f';

  return (
    <svg
      viewBox="0 0 1024 407"
      role="img"
      aria-label={title}
      className={`block h-auto w-full ${className}`}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <defs>
        <clipPath id={clip}>
          <rect width="1024" height="407" rx="16" />
        </clipPath>
        <filter id={grain} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.25  0 0 0 0 0.28  0 0 0 0 0.5  0 0 0 0.22 0" />
        </filter>
      </defs>

      <g clipPath={`url(#${clip})`}>
        {/* Paper card */}
        <rect width="1024" height="407" fill="#b9c0ee" />
        <rect width="1024" height="407" filter={`url(#${grain})`} />

        {/* Toolbar */}
        <rect x="323.5" y="150" width="543.0" height="64" rx="26" fill="#ecebf1" stroke={navy} strokeWidth="2" />
        <rect x="440.9" y="158" width="93" height="48" rx="9" fill="#b3bcf4" />

        {/* Search (toolbar: search, Copy, Cut, Paste, AI, ⌘) */}
        <g fill="none" stroke={navy} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="387.7" cy="180" r="9" />
          <line x1="394.7" y1="187" x2="402.7" y2="195" />
        </g>

        <g fill={navy} fontSize="21" style={{ textRendering: "geometricPrecision" }} fontWeight="600" textAnchor="middle">
          <text x="487.4" y="191">Copy</text>
          <text x="587.8" y="191">Cut</text>
          <text x="670.0" y="191">Paste</text>
        </g>

        {/* AI sparkle */}
        <path
          d="M745.3 171 Q746.8 180.5 756.3 182 Q746.8 183.5 745.3 193 Q743.8 183.5 734.3 182 Q743.8 180.5 745.3 171 Z"
          fill={navy}
        />

        {/* Command */}
        <path transform="translate(802.4 182)" d="M-3 -3 V-6 A3 3 0 1 0 -6 -3 H6 A3 3 0 1 0 3 -6 V6 A3 3 0 1 0 6 3 H-6 A3 3 0 1 0 -3 6 Z" fill="none" stroke={navy} strokeWidth="2.2" strokeLinejoin="round" />

        {/* Pointer over Copy */}
        <path
          d="M512.9 196 L512.9 220 L518.4 214.5 L522.4 223.5 L525.9 222 L521.9 213 L529.4 213 Z"
          fill={navy}
          stroke="#ffffff"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* Headline with highlighted "text" */}
        <rect x="503" y="238" width="76" height="43" fill="#fbd796" />
        <g fill={navy} fontSize="34" fontWeight="600">
          <text x="497" y="271" textAnchor="end">Turn</text>
          <text x="541" y="271" textAnchor="middle">text</text>
          <text x="586" y="271">into action.</text>
        </g>
      </g>
    </svg>
  );
}
