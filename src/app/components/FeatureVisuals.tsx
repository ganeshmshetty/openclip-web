'use client';

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
