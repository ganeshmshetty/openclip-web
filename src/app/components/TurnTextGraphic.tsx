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
        <rect x="497" y="150" width="451" height="64" rx="13" fill="#ecebf1" stroke={navy} strokeWidth="2" />
        <rect x="579" y="160" width="95" height="45" rx="7" fill="#b3bcf4" />

        {/* Search */}
        <g fill="none" stroke={navy} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="532" cy="180" r="9" />
          <line x1="539" y1="187" x2="547" y2="195" />
        </g>

        <g fill={navy} fontSize="21" style={{ textRendering: "geometricPrecision" }} fontWeight="600" textAnchor="middle">
          <text x="627" y="191">Copy</text>
          <text x="720" y="191">Cut</text>
          <text x="817" y="191">Paste</text>
        </g>

        {/* AI sparkle */}
        <path
          d="M907 166 C909 177 912 180 923 182 C912 184 909 187 907 198 C905 187 902 184 891 182 C902 180 905 177 907 166 Z"
          fill={navy}
        />

        {/* Pointer over Copy */}
        <path
          d="M652 196 L652 220 L657.5 214.5 L661.5 223.5 L665 222 L661 213 L668.5 213 Z"
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
