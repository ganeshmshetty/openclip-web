'use client';

import { useEffect, useRef, useState } from 'react';
import { mediaURL } from '@/lib/media';

type Clip = { name: string; label: string; src: string; glyph: React.ReactNode };

const G = { width: 11, height: 11, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const GLYPHS = {
  math: <svg {...G}><path d="M3 5h4M5 3v4M9.5 5h4M3 11.5h4M9.5 10l3.5 3.5M13 10l-3.5 3.5" /></svg>,
  spell: <svg {...G}><path d="M2.5 11 5 4.5 7.5 11M3.3 9h3.4M9 9.5l2 2 3.5-4.5" /></svg>,
  qr: <svg {...G}><rect x="2.5" y="2.5" width="4" height="4" rx="0.8" /><rect x="9.5" y="2.5" width="4" height="4" rx="0.8" /><rect x="2.5" y="9.5" width="4" height="4" rx="0.8" /><path d="M9.5 9.5h1.5v1.5M13.5 9.5v4h-4" /></svg>,
};
type Slot = { className: string; width: number; drift: number };

// Three clips, same size, staggered heights. Add a clip and it takes the next free slot.
const CLIPS: Clip[] = [
  { name: 'calculate', label: 'inline math', src: mediaURL('calculate.mp4'), glyph: GLYPHS.math },
  { name: 'word-completion', label: 'spell check', src: mediaURL('word-completion.mp4'), glyph: GLYPHS.spell },
  { name: 'qrcode', label: 'qr codes', src: mediaURL('extensions/com.openclip.qrcode.mp4'), glyph: GLYPHS.qr },
];

// Percent positions so the scene scales with the viewport.
const SLOTS: Slot[] = [
  { className: 'left-[3.5%] top-[2%] origin-top-left', width: 220, drift: 0.06 },
  { className: 'right-[3.5%] top-[24%] origin-top-right', width: 220, drift: -0.05 },
  { className: 'left-[10%] top-[56%] origin-top-left', width: 220, drift: 0.04 },
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

function ClipWindow({ clip, slot, index, open, onTap }: { clip: Clip; slot: Slot; index: number; open: boolean; onTap: () => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useLazyPlay(ref);

  return (
    <figure
      tabIndex={0}
      aria-label={`${clip.label} demo`}
      data-desk-card=""
      aria-expanded={open}
      onClick={onTap}
      className={`desk-window absolute ${slot.className}${open ? ' is-open' : ''}`}
      style={{
        width: slot.width,
        animationDelay: `${0.1 + index * 0.08}s`,
        translate: `0 calc(var(--desk-scroll, 0) * ${slot.drift}px)`,
      }}
    >
      <div className="desk-card">
        <div className="desk-frame">
          <video ref={ref} src={clip.src} muted loop playsInline preload="metadata" className="block aspect-[16/10] w-full object-cover" />
        </div>
        <figcaption className="desk-caption">
          <span className="desk-glyph">{clip.glyph}</span>
          <span className="desk-label">{clip.label}</span>
        </figcaption>
      </div>
    </figure>
  );
}

/**
 * Desktop-only backdrop for the hero: a dotted desk with the supporting clips
 * floating on it. They play dimmed and drift slightly against the scroll; hovering one lights it up and grows it in place.
 */
export default function DeskScene() {
  const rootRef = useRef<HTMLDivElement>(null);
  // Touch screens have no hover, so a tap zooms a card instead (one at a time).
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const isTouch = () => window.matchMedia('(hover: none), (pointer: coarse)').matches;

  useEffect(() => {
    if (openIndex === null) return;
    const onDown = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.('[data-desk-card]')) setOpenIndex(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenIndex(null);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [openIndex]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      root.style.setProperty('--desk-scroll', String(Math.min(window.scrollY, 500)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <>
      <div className="desk-grid pointer-events-none absolute inset-0 hidden lg:block" aria-hidden="true" />
      <div ref={rootRef} className="absolute inset-0 hidden lg:block">
        {CLIPS.slice(0, SLOTS.length).map((clip, index) => (
          <ClipWindow
            key={clip.name}
            clip={clip}
            slot={SLOTS[index]}
            index={index}
            open={openIndex === index}
            onTap={() => {
              if (isTouch()) setOpenIndex((cur) => (cur === index ? null : index));
            }}
          />
        ))}
      </div>
    </>
  );
}
