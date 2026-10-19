'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Heart, Terminal } from 'lucide-react';
import { downloadLatestDmg } from '@/lib/downloadClient';

function AppleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.13.64-2.79 1.41-.58.68-1.1 1.76-1.01 2.81 1.07.08 2.18-.6 2.79-1.35z" />
    </svg>
  );
}

const PILL_BASE =
  'rounded-full flex items-center justify-center gap-1.5 sm:gap-2 transition-all cursor-pointer whitespace-nowrap select-none shrink-0';
const PILL_HEIGHT = 'h-[38px] sm:h-[46px]';

type PillProps = { className?: string };

export function DownloadPill({ className = '' }: PillProps) {
  return (
    <a
      href="/download"
      onClick={(e) => {
        e.preventDefault();
        downloadLatestDmg();
      }}
      className={`${PILL_BASE} ${PILL_HEIGHT} px-3.5 sm:px-6 bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 active:scale-[0.98] font-semibold text-[13px] sm:text-[14.5px] shadow-md ${className}`}
    >
      <AppleIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 -mt-0.5 shrink-0" />
      <span>Download for Mac</span>
    </a>
  );
}

export function SponsorPill({ className = '' }: PillProps) {
  return (
    <Link
      href="/support"
      className={`${PILL_BASE} ${PILL_HEIGHT} px-4 sm:px-6 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] active:scale-[0.98] font-semibold text-[13px] sm:text-[14.5px] text-[var(--text-primary)] shadow-sm hover:shadow ${className}`}
    >
      <Heart className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-pink-500 fill-pink-500 shrink-0" />
      <span>Sponsor</span>
    </Link>
  );
}

export function BrewPill({ className = '', compact = false }: PillProps & { compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copyBrewCommand = async () => {
    try {
      await navigator.clipboard.writeText('brew install openclip');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <button
      onClick={copyBrewCommand}
      title="Copy brew install command: brew install openclip"
      aria-label="Copy brew install command"
      className={`${PILL_BASE} ${compact
        ? 'px-2 py-2 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        : `${PILL_HEIGHT} px-3 sm:px-5 bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] active:scale-[0.98] text-[11px] sm:text-[12px] text-[var(--text-primary)] shadow-sm hover:shadow`
      } font-mono font-medium group ${className}`}
    >
      {!compact && <Terminal className="w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-80 text-[var(--accent)] shrink-0" />}
      <span>brew install openclip</span>
      <span role="status" className="sr-only">{copied ? 'Command copied' : ''}</span>
      <span className="inline-flex items-center justify-center w-3 h-3 sm:w-3.5 sm:h-3.5 opacity-60 group-hover:opacity-100 transition-colors ml-0.5 shrink-0">
        {copied ? (
          <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-500 animate-in zoom-in-75 duration-150" />
        ) : (
          <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-current" />
        )}
      </span>
    </button>
  );
}
