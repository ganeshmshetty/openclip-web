'use client';

import { useEffect, useRef } from 'react';
import { Lottie, type LottieHandle } from 'lottie-react';
import mascot from './store-mascot.json';

/** Lottie take on the Clip Store: a shop mascot that blinks, glances around and bobs its roof. */
export default function StoreMascot({ className }: { className?: string }) {
  const ref = useRef<LottieHandle>(null);

  useEffect(() => {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    ref.current?.seek({ frame: 0 });
    ref.current?.pause();
  }, []);

  return (
    <Lottie
      lottieRef={ref}
      src={mascot}
      autoplay
      loop
      className={className}
      role="img"
      aria-label="The Clip Store"
      onClick={() => ref.current?.seek({ frame: 80 })}
      style={{ cursor: 'pointer' }}
    />
  );
}
