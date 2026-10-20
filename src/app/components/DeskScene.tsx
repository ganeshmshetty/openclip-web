'use client';

import { useEffect, useRef } from 'react';
import { mediaURL } from '@/lib/media';

type Clip = { name: string; label: string; src: string };
type Slot = { className: string; width: number };

// Add a clip to this list and it takes the next free slot around the hero.
const CLIPS: Clip[] = [
  { name: 'calculate', label: 'Inline math', src: mediaURL('calculate.mp4') },
  { name: 'word-completion', label: 'Spell check', src: mediaURL('word-completion.mp4') },
  { name: 'render-mermaid', label: 'Render Mermaid', src: mediaURL('extensions/com.openclip.render-mermaid.mp4') },
  { name: 'shortenlink', label: 'Shorten Link', src: mediaURL('extensions/com.openclip.shortenlink.mp4') },
];

// Percent positions so the scene scales with the viewport.
const SLOTS: Slot[] = [
  { className: 'left-[3%] top-[10%] origin-top-left', width: 230 },
  { className: 'right-[3.5%] top-[9%] origin-top-right', width: 215 },
  { className: 'right-[6%] top-[57%] origin-top-right', width: 235 },
  { className: 'left-[6.5%] top-[58%] origin-top-left', width: 200 },
  { className: 'left-[19%] top-[34%] origin-top-left', width: 170 },
  { className: 'right-[21%] top-[40%] origin-top-right', width: 170 },
];

function useLazyPlay(ref: React.RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const video = ref.current;
    if (!video || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    });
    io.observe(video);
    return () => io.disconnect();
  }, [ref]);
}

function ClipWindow({ clip, slot, index }: { clip: Clip; slot: Slot; index: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useLazyPlay(ref);

  return (
    <figure
      tabIndex={0}
      aria-label={`${clip.label} demo`}
      className={`desk-window absolute ${slot.className}`}
      style={{ width: slot.width, animationDelay: `${0.1 + index * 0.08}s` }}
    >
      <div className="desk-frame">
        <video ref={ref} src={clip.src} muted loop playsInline preload="metadata" className="block aspect-[16/10] w-full object-cover" />
      </div>
      <figcaption className="desk-caption">{clip.label}</figcaption>
    </figure>
  );
}

/**
 * Desktop-only backdrop for the hero: a dotted desk with the supporting clips
 * floating on it. They play dimmed; hovering one lights it up and grows it in place.
 */
export default function DeskScene() {
  return (
    <>
      <div className="desk-grid pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true" />
      <div className="absolute inset-0 hidden lg:block">
        {CLIPS.slice(0, SLOTS.length).map((clip, index) => (
          <ClipWindow key={clip.name} clip={clip} slot={SLOTS[index]} index={index} />
        ))}
      </div>
    </>
  );
}
