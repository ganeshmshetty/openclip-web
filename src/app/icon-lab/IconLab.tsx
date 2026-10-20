'use client';

import { useState } from 'react';
import AnimatedStoreIcon from '../components/AnimatedStoreIcon';
import StoreMascot from '../components/StoreMascot';
import { ClipInIcon, OpenSignIcon, WaresIcon } from '../components/StoreIconVariants';

const ICON = 'w-40 aspect-[200/170] select-none';

function Card({ title, note, action, onAction, children }: { title: string; note: string; action?: string; onAction?: () => void; children: React.ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-4 rounded-2xl bg-[var(--bg-surface)] p-6 text-center shadow-sm">
      <div className="flex h-44 items-center justify-center">{children}</div>
      <div>
        <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-secondary)]">{note}</p>
      </div>
      {action && (
        <button onClick={onAction} className="store-install inline-flex h-[30px] items-center rounded-full px-4 text-[12.5px] font-bold">
          {action}
        </button>
      )}
    </section>
  );
}

export default function IconLab() {
  const [sign, setSign] = useState(0);
  const [clip, setClip] = useState(0);
  const [wares, setWares] = useState(0);

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Store icon lab</h1>
      <p className="mt-2 text-[13.5px] text-[var(--text-secondary)]">
        Same icon, different stories. Click the icons or the buttons. The roof drop-in, sway, hover lift and shrug are shared.
      </p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Card title="Current" note="Roof drops in on load, sways, lifts on hover, shrugs on click.">
          <AnimatedStoreIcon className={ICON} />
        </Card>
        <Card title="Open for business" note="A sign hanging on the door flips between Open and Closed." action="Flip sign" onAction={() => setSign((n) => n + 1)}>
          <div onClick={() => setSign((n) => n + 1)}>
            <OpenSignIcon className={ICON} trigger={sign} />
          </div>
        </Card>
        <Card title="Clip goes in" note="On Install a clip flies in and drops through the doorway, and the door flashes." action="Install" onAction={() => setClip((n) => n + 1)}>
          <div onClick={() => setClip((n) => n + 1)}>
            <ClipInIcon className={ICON} trigger={clip} />
          </div>
        </Card>
        <Card title="Stocked shelves" note="Clips pop out of the doorway and float up: the shop is full." action="Restock" onAction={() => setWares((n) => n + 1)}>
          <div onClick={() => setWares((n) => n + 1)}>
            <WaresIcon className={ICON} trigger={wares} />
          </div>
        </Card>
        <Card title="Lottie mascot" note="A .json Lottie file played with lottie-react: eyes blink and glance around, the roof bobs. Click to make it blink.">
          <StoreMascot className="h-40 w-40" />
        </Card>
      </div>
    </main>
  );
}
