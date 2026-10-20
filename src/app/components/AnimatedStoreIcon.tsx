'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { animate, motionValue, type AnimationPlaybackControls } from 'motion/react';

/**
 * Clip Store icon: a roof over a shop whose top edge is scalloped to match
 * the roof's lobes, leaving a clear gutter between them (blue points rise
 * between the lobes). Only the roof moves: it drops in once on load, then
 * stays still except for a hover lift and a click shrug.
 */

const ROOF_PATH =
  'M82 48 L173.5 48 Q189 48 193.5 62 L205 85 Q208 92 208 100 ' +
  'A23.75 12 0 0 1 160.5 100 L160.5 76 A4 4 0 0 0 152.5 76 L152.5 100 ' +
  'A25 12 0 0 1 102.5 100 L102.5 76 A4 4 0 0 0 94.5 76 L94.5 100 ' +
  'A23.5 12 0 0 1 47.5 100 Q47.5 92 50.5 85 L61.5 62 Q66 48 82 48Z';

// Top edge is the roof's lobes offset down by the gutter (ellipses grown by 9),
// meeting in points under the slits.
const BODY_PATH =
  'M53.5 169.5 L53.5 117.6 A32.5 21 0 0 0 98.6 111.1 A34 21 0 0 0 156.4 111.2 A32.75 21 0 0 0 201.5 117.9 ' +
  'L201.5 169.5 A30 30 0 0 1 171.5 199.5 L83.5 199.5 A30 30 0 0 1 53.5 169.5Z';

// Flares out at the floor so the shop's inner leg corners are rounded.
const DOOR_PATH =
  'M96.5 210 L96.5 199.5 A8 8 0 0 0 104.5 191.5 L104.5 165 A20 20 0 0 1 124.5 145 L129.5 145 A20 20 0 0 1 149.5 165 ' +
  'L149.5 191.5 A8 8 0 0 0 157.5 199.5 L157.5 210Z';

const PIVOT = { x: 127.75, y: 80 };

const CSS = `
.asi-root { cursor: pointer; overflow: visible; }
.asi-roof-fill { fill: #292929; }
:is(.dark, [data-theme="dark"]) .asi-roof-fill { fill: #d9dbe1; }
.asi-body-fill { fill: #2983fd; }
:is(.dark, [data-theme="dark"]) .asi-body-fill { fill: #4a94ff; }
`;

export default function AnimatedStoreIcon({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
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
        animate(dropY, 0, { type: 'spring', stiffness: 170, damping: 11, delay: 0.2 })
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
      </defs>

      <path className="asi-body-fill" d={BODY_PATH} mask={`url(#${id('door')})`} />
      <g ref={roofRef}>
        <path className="asi-roof-fill" d={ROOF_PATH} />
      </g>
      {children}
    </svg>
  );
}
