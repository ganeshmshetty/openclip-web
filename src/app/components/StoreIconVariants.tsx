'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, motionValue, useMotionValue, type MotionValue } from 'motion/react';
import AnimatedStoreIcon from './AnimatedStoreIcon';

/**
 * Story-driven takes on the Clip Store icon, all layered on the shared base
 * (roof drop-in, sway, hover lift, shrug). `trigger` is a counter: each
 * increment plays the variant's action once.
 */

type Props = { className?: string; trigger: number };

function bind(el: SVGElement | null, values: MotionValue<number>[], paint: () => string) {
  if (!el) return () => {};
  const apply = () => el.setAttribute('transform', paint());
  const stops = values.map((value) => value.on('change', apply));
  apply();
  return () => stops.forEach((stop) => stop());
}

const DOOR = { x: 127 };

/** The sign flips between Open and Closed. */
export function OpenSignIcon({ className, trigger }: Props) {
  const signRef = useRef<SVGGElement>(null);
  const flip = useMotionValue(1);
  const swing = useMotionValue(0);
  const [open, setOpen] = useState(true);
  const first = useRef(true);

  useEffect(
    () => bind(signRef.current, [flip, swing], () => `rotate(${swing.get()} ${DOOR.x} 158) translate(${DOOR.x} 172) scale(${flip.get()} 1) translate(${-DOOR.x} -172)`),
    [flip, swing]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    let cancelled = false;
    void (async () => {
      await animate(flip, 0, { duration: 0.14, ease: 'easeIn' });
      if (cancelled) return;
      setOpen((value) => !value);
      swing.set(14);
      animate(flip, 1, { duration: 0.2, ease: 'easeOut' });
      animate(swing, 0, { type: 'spring', stiffness: 160, damping: 7 });
    })();
    return () => {
      cancelled = true;
    };
  }, [trigger, flip, swing]);

  return (
    <AnimatedStoreIcon className={className}>
      <g ref={signRef}>
        <path d={`M${DOOR.x - 6} 158 L${DOOR.x} 150 L${DOOR.x + 6} 158`} fill="none" stroke="#fff" strokeOpacity="0.9" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        <rect x={DOOR.x - 17} y="161" width="34" height="22" rx="4" fill={open ? '#fff' : '#d9dde4'} />
        <text x={DOOR.x} y="175.5" textAnchor="middle" fontSize={open ? 10 : 8} fontWeight="800" fontFamily="system-ui, sans-serif" fill={open ? '#2983FD' : '#6b7280'}>
          {open ? 'OPEN' : 'CLOSED'}
        </text>
      </g>
    </AnimatedStoreIcon>
  );
}

/** A clip flies in from the side and drops through the doorway: "installed". */
export function ClipInIcon({ className, trigger }: Props) {
  const clipRef = useRef<SVGGElement>(null);
  const flash = useRef<SVGEllipseElement>(null);
  const x = useMotionValue(250);
  const y = useMotionValue(120);
  const scale = useMotionValue(1);
  const opacity = useMotionValue(0);
  const first = useRef(true);

  useEffect(
    () =>
      bind(clipRef.current, [x, y, scale, opacity], () => {
        clipRef.current?.setAttribute('opacity', String(opacity.get()));
        return `translate(${x.get()} ${y.get()}) scale(${scale.get()})`;
      }),
    [x, y, scale, opacity]
  );

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    x.set(238);
    y.set(112);
    scale.set(1);
    opacity.set(0);
    const flight = [
      animate(opacity, [0, 1, 1, 0], { duration: 1.1, times: [0, 0.1, 0.85, 1] }),
      animate(x, [238, 190, DOOR.x], { duration: 1.1, ease: 'easeInOut', times: [0, 0.5, 1] }),
      animate(y, [112, 88, 172], { duration: 1.1, ease: 'easeIn', times: [0, 0.45, 1] }),
      animate(scale, [1, 1.15, 0.45], { duration: 1.1, times: [0, 0.4, 1] }),
    ];
    const pulse = flash.current
      ? animate(flash.current, { opacity: [0, 0.85, 0] }, { duration: 0.7, delay: 0.95 })
      : null;
    return () => {
      flight.forEach((controls) => controls.stop());
      pulse?.stop();
    };
  }, [trigger, x, y, scale, opacity]);

  return (
    <AnimatedStoreIcon className={className}>
      <ellipse ref={flash} cx={DOOR.x} cy="185" rx="20" ry="26" fill="#FFD58A" opacity="0" />
      <g ref={clipRef} opacity="0">
        <rect x="-11" y="-11" width="22" height="22" rx="6" fill="#fff" />
        <rect x="-5" y="-6" width="10" height="3" rx="1.5" fill="#2983FD" />
        <rect x="-5" y="-1" width="10" height="3" rx="1.5" fill="#2983FD" fillOpacity="0.6" />
        <rect x="-5" y="4" width="6" height="3" rx="1.5" fill="#2983FD" fillOpacity="0.35" />
      </g>
    </AnimatedStoreIcon>
  );
}

const WARES = [
  { dx: -42, rise: 30, delay: 0 },
  { dx: 0, rise: 14, delay: 0.14 },
  { dx: 42, rise: 30, delay: 0.28 },
] as const;

function Ware({ kind }: { kind: 0 | 1 | 2 }) {
  return (
    <>
      <rect x="-12" y="-12" width="24" height="24" rx="7" fill="#fff" />
      {kind === 0 && (
        <g fill="#292929">
          <rect x="-7" y="-7" width="5" height="5" rx="1" />
          <rect x="2" y="-7" width="5" height="5" rx="1" />
          <rect x="-7" y="2" width="5" height="5" rx="1" />
          <rect x="3" y="3" width="3" height="3" rx="0.6" />
        </g>
      )}
      {kind === 1 && (
        <g fill="none" stroke="#292929" strokeWidth="2.2" strokeLinecap="round">
          <path d="M-1.5 3.5 L-5.5 7.5 A3 3 0 0 1 -9.5 3.5 L-5.5 -0.5" transform="translate(5 -2) rotate(0)" />
          <path d="M1.5 -3.5 L5.5 -7.5 A3 3 0 0 1 9.5 -3.5 L5.5 0.5" transform="translate(-5 2) rotate(0)" />
        </g>
      )}
      {kind === 2 && (
        <text x="0" y="4" textAnchor="middle" fontSize="11" fontWeight="800" fontFamily="ui-monospace, monospace" fill="#292929">
          {'>_'}
        </text>
      )}
    </>
  );
}

/** Clips pop out of the doorway and float up: the shop is stocked. */
export function WaresIcon({ className, trigger }: Props) {
  const refs = useRef<(SVGGElement | null)[]>([]);
  const [values] = useState(() => WARES.map(() => ({ x: motionValue(DOOR.x), y: motionValue(180), s: motionValue(0.3), o: motionValue(0) })));
  useEffect(() => {
    const unbind = values.map((v, i) =>
      bind(refs.current[i], [v.x, v.y, v.s, v.o], () => {
        refs.current[i]?.setAttribute('opacity', String(v.o.get()));
        return `translate(${v.x.get()} ${v.y.get()}) scale(${v.s.get()})`;
      })
    );
    return () => unbind.forEach((stop) => stop());
  }, [values]);

  useEffect(() => {
    const play = () =>
      WARES.flatMap((ware, i) => {
        const v = values[i];
        v.x.set(DOOR.x);
        v.y.set(184);
        v.s.set(0.3);
        v.o.set(0);
        return [
          animate(v.o, [0, 1, 1, 0], { duration: 1.9, delay: ware.delay, times: [0, 0.12, 0.7, 1] }),
          animate(v.x, DOOR.x + ware.dx, { duration: 1.9, delay: ware.delay, ease: [0.22, 1, 0.36, 1] }),
          animate(v.y, ware.rise, { duration: 1.9, delay: ware.delay, ease: [0.22, 1, 0.36, 1] }),
          animate(v.s, 1, { type: 'spring', stiffness: 150, damping: 10, delay: ware.delay }),
        ];
      });
    const controls = play();
    return () => controls.forEach((c) => c.stop());
  }, [trigger, values]);

  return (
    <AnimatedStoreIcon className={className}>
      {WARES.map((ware, i) => (
        <g
          key={ware.dx}
          ref={(el) => {
            refs.current[i] = el;
          }}
          opacity="0"
        >
          <Ware kind={i as 0 | 1 | 2} />
        </g>
      ))}
    </AnimatedStoreIcon>
  );
}
