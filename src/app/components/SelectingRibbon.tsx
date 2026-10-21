'use client';

import { useEffect, useId, useRef } from 'react';

type Props = {
  /** Left-to-right SVG path in viewBox units. */
  path: string;
  viewBox: string;
  preserveAspectRatio?: string;
  /** One continuous run of sentences; it repeats to fill the path. */
  text: string;
  size?: number;
  /** Text drift along the path, in viewBox units per second (negative flows backwards). */
  textSpeed?: number;
  /** Cursor travel along the path, in viewBox units per second. */
  cursorSpeed?: number;
  className?: string;
};

const NS = 'http://www.w3.org/2000/svg';
/** Highlight stays full this far behind the cursor, then fades over FADE. */
const HOLD = 200;
const FADE = 320;

/**
 * One ribbon of flowing sentences. The text drifts along the curve while a
 * cursor travels around it in a loop, dragging a selection over everything it
 * passes; the highlight fades out behind it. Decorative only: hidden from
 * screen readers; static (a stretch selected) with reduced motion.
 */
export default function SelectingRibbon({ path, viewBox, preserveAspectRatio, text, size = 30, textSpeed = 18, cursorSpeed = 85, className }: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rootRef = useRef<SVGSVGElement>(null);
  const textRef = useRef<SVGTextElement>(null);
  const textPathRef = useRef<SVGTextPathElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const cursorRef = useRef<SVGGElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const label = textRef.current;
    const textPath = textPathRef.current;
    const curve = pathRef.current;
    const cursor = cursorRef.current;
    if (!root || !label || !textPath || !curve || !cursor) return;

    let frame = 0;
    let cancelled = false;
    let io: IntersectionObserver | undefined;

    const setup = () => {
      if (cancelled) return;
      const block = `${text} `;
      const probe = document.createElementNS(NS, 'text');
      probe.setAttribute('font-size', String(size));
      probe.setAttribute('font-weight', '600');
      probe.setAttribute('visibility', 'hidden');
      probe.textContent = block;
      root.appendChild(probe);
      const period = probe.getComputedTextLength() || 1;
      root.removeChild(probe);
      const length = curve.getTotalLength();
      const copies = Math.ceil(length / period) + 2;

      textPath.textContent = '';
      const chars: SVGTSpanElement[] = [];
      for (let copy = 0; copy < copies; copy++) {
        for (const char of block) {
          const span = document.createElementNS(NS, 'tspan');
          span.setAttribute('class', 'ribbon-char');
          span.textContent = char;
          textPath.appendChild(span);
          chars.push(span);
        }
      }
      if (!chars.length || !label.getNumberOfChars()) return;
      const starts = chars.map((_, i) => (i === 0 ? 0 : label.getSubStringLength(0, i)));
      const levels = new Float32Array(chars.length);

      const paint = (i: number, level: number) => {
        const q = Math.round(level * 20) / 20;
        if (levels[i] === q) return;
        levels[i] = q;
        chars[i].style.setProperty('--sel', String(q));
      };
      const place = (x: number, y: number) => {
        cursor.setAttribute('transform', `translate(${x} ${y - size * 0.25}) scale(0.9)`);
        cursor.style.opacity = '1';
      };

      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        textPath.setAttribute('startOffset', '0');
        const at = Math.min(length, 520);
        chars.forEach((_, i) => {
          const d = at - starts[i];
          paint(i, d < 0 ? 0 : d < HOLD ? 1 : Math.max(0, 1 - (d - HOLD) / FADE));
        });
        const point = curve.getPointAtLength(at);
        place(point.x, point.y);
        return;
      }

      let travelled = 0;
      let cursorAt = 0;
      let last = performance.now();
      let visible = true;
      const step = (now: number) => {
        if (!visible || document.hidden) {
          last = now;
          return;
        }
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        travelled = (travelled + dt * Math.abs(textSpeed)) % period;
        cursorAt = (cursorAt + dt * cursorSpeed) % length;
        const offset = textSpeed > 0 ? -travelled : travelled - period;
        textPath.setAttribute('startOffset', String(offset));

        for (let i = 0; i < chars.length; i++) {
          const d = cursorAt - (offset + starts[i]);
          paint(i, d < 0 ? 0 : d < HOLD ? 1 : Math.max(0, 1 - (d - HOLD) / FADE));
        }
        const point = curve.getPointAtLength(cursorAt);
        place(point.x, point.y);
      };
      const tick = (now: number) => {
        frame = requestAnimationFrame(tick);
        try {
          step(now);
        } catch {
          // Some engines throw for text metrics mid-layout; skip the frame.
        }
      };
      frame = requestAnimationFrame(tick);
      io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
      });
      io.observe(root);
    };

    void document.fonts.ready.then(setup);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      io?.disconnect();
    };
  }, [text, size, textSpeed, cursorSpeed]);

  return (
    <svg
      ref={rootRef}
      aria-hidden="true"
      focusable="false"
      viewBox={viewBox}
      preserveAspectRatio={preserveAspectRatio}
      overflow="visible"
      className={`text-ribbon pointer-events-none select-none ${className ?? ''}`}
    >
      <defs>
        <path ref={pathRef} id={`sr-${uid}`} d={path} fill="none" />
      </defs>
      <text ref={textRef} fontSize={size} fontWeight={600} letterSpacing="-0.01em">
        <textPath ref={textPathRef} href={`#sr-${uid}`} />
      </text>
      <g ref={cursorRef} style={{ opacity: 0 }}>
        <path
          className="ribbon-cursor"
          d="M0 0 L0 20 L5.2 15.6 L8.6 23.4 L11.8 22 L8.4 14.4 L15.4 14.4 Z"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
