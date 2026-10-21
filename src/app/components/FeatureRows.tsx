'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import GifFrame from './GifFrame';
import { PaletteVisual } from './FeatureVisuals';
import AnimatedStoreIcon from './AnimatedStoreIcon';

type Row = {
  id: string;
  visual?: 'palette' | 'store';
  title: string;
  body: string;
  mp4: string;
  alt: string;
  hint?: string;
  link?: { text: string; href: string };
};

const ROWS: Row[] = [
  {
    id: 'ai',
    title: 'fix your writing right where you are.',
    body: 'grammar, summaries, translations. the answer shows up in place, so you never end up in a browser tab.',
    mp4: '/gifs/ai-actions.mp4',
    alt: 'OpenClip AI actions rewriting selected text',
  },
  {
    id: 'palette',
    visual: 'palette',
    title: 'everything is one shortcut away.',
    body: 'hit the shortcut, type a few letters, and find any action, extension, or quick calculation.',
    mp4: '/gifs/command-palette.mp4',
    alt: 'OpenClip universal command palette',
  },
  {
    id: 'extensions',
    visual: 'store',
    title: 'there\'s an extension for most things.',
    body: 'there are 100+ in the Clip Store. if yours is missing, write it in JS, AppleScript, or shell.',
    mp4: '/gifs/in-app-extensions.mp4',
    alt: 'OpenClip in-app extensions',
    link: { text: 'have a look at the Clip Store', href: '/extensions' },
  },
];

/**
 * The two headline demos as big alternating rows (the supporting clips float
 * around the hero, see DeskScene).
 *
 * Big alternating rows: copy on one side, a large demo window on the other.
 * The row nearest the middle of the screen is in focus; the others dim and
 * settle back slightly, so one demo at a time holds the eye.
 */
export default function FeatureRows() {
  const refs = useRef<(HTMLElement | null)[]>([]);
  const [focus, setFocus] = useState(-1);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const middle = window.innerHeight * 0.5;
      let best = -1;
      let bestDistance = window.innerHeight * 0.42;
      refs.current.forEach((el, index) => {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      setFocus(best);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <section className="section-shell flex flex-col gap-16 py-16 sm:gap-24 sm:py-24">
      {ROWS.map((row, index) => {
        const active = focus === index;
        return (
          <article
            key={row.id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            className={`feature-row grid items-center gap-6 md:grid-cols-12 md:gap-12 ${active ? 'is-focus' : ''}`}
          >
            <div className={`md:col-span-4 ${index % 2 ? 'md:order-2' : ''}`}>
                            {row.visual === 'palette' && <PaletteVisual className="mb-6" />}
              {row.visual === 'store' && <AnimatedStoreIcon className="mb-5 aspect-[200/170] w-28" />}
              <h2 className="section-title">{row.title}</h2>
              <p className="section-sub mt-2.5">{row.body}</p>
              {row.hint && <kbd className="mac-keycap mt-4 inline-block">{row.hint}</kbd>}
              {row.link && (
                <Link
                  href={row.link.href}
                  className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
                >
                  {row.link.text}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
            <div className={`feature-media md:col-span-8 ${index % 2 ? 'md:order-1' : ''}`}>
              <GifFrame src={row.mp4} alt={row.alt} name={`${row.id}.mp4`} loop aspect="aspect-[16/10]" />
            </div>
          </article>
        );
      })}
    </section>
  );
}
