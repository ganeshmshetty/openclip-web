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
        <rect x="455" y="150" width="508" height="64" rx="32" fill="#ecebf1" stroke={navy} strokeWidth="2" />
        <rect x="528" y="158" width="96" height="48" rx="11" fill="#b3bcf4" />

        {/* Search (toolbar: search, Copy, Cut, Paste, AI, ⌘) */}
        <g fill="none" stroke={navy} strokeWidth="2.4" strokeLinecap="round">
          <circle cx="491" cy="180" r="9" />
          <line x1="498" y1="187" x2="506" y2="195" />
        </g>

        <g fill={navy} fontSize="21" style={{ textRendering: "geometricPrecision" }} fontWeight="600" textAnchor="middle">
          <text x="576" y="191">Copy</text>
          <text x="668" y="191">Cut</text>
          <text x="762" y="191">Paste</text>
        </g>

        {/* AI sparkle */}
        <path
          d="M851 166 C853 177 856 180 867 182 C856 184 853 187 851 198 C849 187 846 184 835 182 C846 180 849 177 851 166 Z"
          fill={navy}
        />

        {/* Command */}
        <text x="923" y="192" fill={navy} fontSize="26" fontWeight="500" textAnchor="middle">
          ⌘
        </text>

        {/* Pointer over Copy */}
        <path
          d="M600 196 L600 220 L605.5 214.5 L609.5 223.5 L613 222 L609 213 L616.5 213 Z"
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
