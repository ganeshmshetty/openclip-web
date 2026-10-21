'use client';

import { useEffect, useRef } from 'react';
import { mediaURL } from '@/lib/media';

type Clip = { name: string; label: string; src: string };
type Slot = { className: string; width: number; drift: number };

// Three clips, same size, staggered heights. Add a clip and it takes the next free slot.
const CLIPS: Clip[] = [
  { name: 'calculate', label: 'inline math', src: mediaURL('calculate.mp4') },
  { name: 'word-completion', label: 'spell check', src: mediaURL('word-completion.mp4') },
  { name: 'qrcode', label: 'qr codes', src: mediaURL('extensions/com.openclip.qrcode.mp4') },
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

function ClipWindow({ clip, slot, index }: { clip: Clip; slot: Slot; index: number }) {
  const ref = useRef<HTMLVideoElement>(null);
  useLazyPlay(ref);

  return (
    <figure
      tabIndex={0}
      aria-label={`${clip.label} demo`}
      className={`desk-window absolute ${slot.className}`}
      style={{
        width: slot.width,
        animationDelay: `${0.1 + index * 0.08}s`,
        translate: `0 calc(var(--desk-scroll, 0) * ${slot.drift}px)`,
      }}
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
 * floating on it. They play dimmed and drift slightly against the scroll; hovering one lights it up and grows it in place.
 */
export default function DeskScene() {
  const rootRef = useRef<HTMLDivElement>(null);

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
          <ClipWindow key={clip.name} clip={clip} slot={SLOTS[index]} index={index} />
        ))}
      </div>
    </>
  );
}
