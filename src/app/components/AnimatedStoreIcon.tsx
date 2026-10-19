'use client';

import { useEffect, useId, useRef } from 'react';
import { animate, motionValue, type AnimationPlaybackControls } from 'motion/react';

/**
 * Clip Store icon: a roof over a shop whose top edge is scalloped to match
 * the roof's lobes, leaving a clear gutter between them (blue points rise
 * between the lobes). Only the roof moves (drop-in, idle sway, hover lift,
 * click shrug), so the gutter breathes as it moves.
 */

const ROOF_PATH =
  'M75 48 L180.5 48 Q191.5 48 193.5 60 L208 92 L208 100 ' +
  'A23.75 12 0 0 1 160.5 100 L160.5 76 A4 4 0 0 0 152.5 76 L152.5 100 ' +
  'A25 12 0 0 1 102.5 100 L102.5 76 A4 4 0 0 0 94.5 76 L94.5 100 ' +
  'A23.5 12 0 0 1 47.5 100 L47.5 92 L62 60 Q64 48 75 48Z';

// Top edge is the roof's lobes offset down by the gutter (ellipses grown by 9),
// meeting in points under the slits.
const BODY_PATH =
  'M53.5 179.5 L53.5 117.6 A32.5 21 0 0 0 98.6 111.1 A34 21 0 0 0 156.4 111.2 A32.75 21 0 0 0 201.5 117.9 ' +
  'L201.5 179.5 A20 20 0 0 1 181.5 199.5 L73.5 199.5 A20 20 0 0 1 53.5 179.5Z';

const DOOR_PATH = 'M104.5 210 L104.5 159 A14 14 0 0 1 118.5 145 L135.5 145 A14 14 0 0 1 149.5 159 L149.5 210Z';

const PIVOT = { x: 127.75, y: 80 };

const CSS = `
.asi-root { cursor: pointer; overflow: visible; }
.asi-roof-fill { fill: #292929; }
:is(.dark, [data-theme="dark"]) .asi-roof-fill { fill: #f5f5f7; }
.asi-door-glow { opacity: 0; }

@media (prefers-reduced-motion: no-preference) {
  .asi-door-glow {
    animation:
      asi-glow-in 1.4s ease-out 0.7s both,
      asi-glow-breathe 7s ease-in-out 2.1s infinite;
  }
  .asi-root[data-offscreen] .asi-door-glow { animation-play-state: paused; }
}

@keyframes asi-glow-in {
  0% { opacity: 0; }
  55% { opacity: 0.6; }
  100% { opacity: 0.22; }
}
@keyframes asi-glow-breathe {
  0%, 100% { opacity: 0.22; }
  50% { opacity: 0.08; }
}
`;

export default function AnimatedStoreIcon({ className }: { className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const roofRef = useRef<SVGGElement>(null);
  const shrugRef = useRef<(() => void) | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const id = (name: string) => `asi-${name}-${uid}`;

  useEffect(() => {
    const svg = svgRef.current;
    const roof = roofRef.current;
    if (!svg || !roof) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const swayX = motionValue(0);
    const swayR = motionValue(0);
    const dropY = motionValue(reduced.matches ? 0 : -18);
    const fade = motionValue(reduced.matches ? 1 : 0);
    const hoverY = motionValue(0);
    const shrugY = motionValue(0);
    const shrugR = motionValue(0);
    const values = [swayX, swayR, dropY, fade, hoverY, shrugY, shrugR];

    const apply = () => {
      const ty = dropY.get() + hoverY.get() + shrugY.get();
      const deg = swayR.get() + shrugR.get();
      roof.setAttribute('transform', `translate(${swayX.get()} ${ty}) rotate(${deg} ${PIVOT.x} ${PIVOT.y})`);
      roof.setAttribute('opacity', String(fade.get()));
    };
    const unsubscribe = values.map((value) => value.on('change', apply));
    apply();

    const running: AnimationPlaybackControls[] = [];
    const shrugging: AnimationPlaybackControls[] = [];

    if (!reduced.matches) {
      running.push(
        animate(fade, 1, { duration: 0.35, delay: 0.2 }),
        animate(dropY, 0, { type: 'spring', stiffness: 170, damping: 11, delay: 0.2 }),
        animate(swayX, [0, 7, 0, -7, 0], { duration: 3.2, ease: 'easeInOut', repeat: Infinity, delay: 1.3 }),
        animate(swayR, [0, 2.5, 0, -2.5, 0], { duration: 3.2, ease: 'easeInOut', repeat: Infinity, delay: 1.3 })
      );
    }

    const hoverable = window.matchMedia('(hover: hover)');
    const lift = (to: number) => {
      if (reduced.matches || !hoverable.matches) return;
      animate(hoverY, to, { type: 'spring', stiffness: 260, damping: 20 });
    };
    const onEnter = () => lift(-6);
    const onLeave = () => lift(0);
    svg.addEventListener('pointerenter', onEnter);
    svg.addEventListener('pointerleave', onLeave);

    shrugRef.current = () => {
      if (reduced.matches) return;
      shrugging.forEach((controls) => controls.stop());
      shrugging.length = 0;
      shrugging.push(
        animate(shrugY, [0, -10, -3, -9, 1, 0], { duration: 0.85, times: [0, 0.18, 0.38, 0.58, 0.8, 1], ease: 'easeOut' }),
        animate(shrugR, [0, -4, 4, -3, 1, 0], { duration: 0.85, times: [0, 0.18, 0.38, 0.58, 0.8, 1], ease: 'easeInOut' })
      );
    };

    const io = new IntersectionObserver(([entry]) => {
      svg.toggleAttribute('data-offscreen', !entry.isIntersecting);
      running.forEach((controls) => (entry.isIntersecting ? controls.play() : controls.pause()));
    });
    io.observe(svg);

    return () => {
      io.disconnect();
      svg.removeEventListener('pointerenter', onEnter);
      svg.removeEventListener('pointerleave', onLeave);
      unsubscribe.forEach((dispose) => dispose());
      [...running, ...shrugging].forEach((controls) => controls.stop());
      shrugRef.current = null;
    };
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="28 36 200 170"
      role="img"
      aria-label="The Clip Store"
      onClick={() => shrugRef.current?.()}
      className={`asi-root ${className ?? ''}`}
    >
      <style>{CSS}</style>
      <defs>
        <mask id={id('door')} maskUnits="userSpaceOnUse" x="0" y="0" width="256" height="256">
          <rect width="256" height="256" fill="#fff" />
          <path d={DOOR_PATH} fill="#000" />
        </mask>
        <radialGradient id={id('glow')} cx="0.5" cy="1" r="1">
          <stop offset="0" stopColor="#FFD58A" />
          <stop offset="0.55" stopColor="#FFE3B0" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFF0D6" stopOpacity="0" />
        </radialGradient>
        <clipPath id={id('shop')}>
          <path d={BODY_PATH} />
        </clipPath>
      </defs>

      <path d={BODY_PATH} fill="#2983FD" mask={`url(#${id('door')})`} />
      <g clipPath={`url(#${id('shop')})`}>
        <path className="asi-door-glow" d={DOOR_PATH} fill={`url(#${id('glow')})`} />
      </g>

      <g ref={roofRef}>
        <path className="asi-roof-fill" d={ROOF_PATH} />
      </g>
    </svg>
  );
}
