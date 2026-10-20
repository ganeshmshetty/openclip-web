'use client';

import { useEffect, useRef, useState } from 'react';

/** Steps a counter on a timer while on screen. Holds the first step with reduced motion. */
function useCycle(length: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer = 0;
    const io = new IntersectionObserver(([entry]) => {
      window.clearInterval(timer);
      if (entry.isIntersecting) timer = window.setInterval(() => setStep((s) => (s + 1) % length), ms);
    });
    io.observe(el);
    return () => {
      window.clearInterval(timer);
      io.disconnect();
    };
  }, [length, ms]);

  return { ref, step, setStep };
}

const ACTIONS = ['Proofread', 'Rewrite', 'Summarize', 'Translate'] as const;

/** The action pills on their own; the active one moves on, like the selection in the popup. */
export function ActionsVisual({ className = '' }: { className?: string }) {
  const { ref, step, setStep } = useCycle(ACTIONS.length, 2200);

  return (
    <div ref={ref} className={`feature-visual ${className}`}>
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(index)}
            className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition-colors duration-200 ${
              index === step ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** The shortcut as keycaps. */
export function PaletteVisual({ className = '' }: { className?: string }) {
  return (
    <div className={`feature-visual ${className}`}>
      <div className="flex items-center gap-1.5">
        {['⌥', '⌘', 'C'].map((key) => (
          <kbd key={key} className="feature-keycap">
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}
