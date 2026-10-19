'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { Star, ArrowUpRight, MessageSquareHeart } from 'lucide-react';

function GithubIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

function BuyMeACoffeeIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M20.216 6.415l-.132-.666c-.119-.598-.388-1.163-1.001-1.379-.197-.069-.42-.098-.57-.241-.152-.143-.196-.366-.231-.572-.065-.378-.125-.756-.192-1.133-.054-.305-.16-.606-.387-.82-.249-.234-.59-.304-.925-.304H7.223c-.334 0-.676.07-.925.304-.228.214-.333.515-.387.82-.067.377-.127.755-.192 1.133-.035.206-.079.429-.231.572-.15.143-.373.172-.57.241-.613.216-.882.781-.981 1.379l-.132.666c-.059.298-.095.602-.095.908v.228c0 .285.031.57.086.851l.926 4.673c.27 1.365.986 2.581 2.036 3.456 1.05 1.051 2.457 1.636 3.94 1.636h2.616c1.483 0 2.89-.585 3.94-1.636 1.05-.875 1.766-2.091 2.036-3.456l.926-4.673c.055-.281.086-.566.086-.851v-.228c0-.306-.036-.61-.095-.908zM18 9.5c0 .28-.03.55-.08.82l-.93 4.67c-.18.9-.65 1.7-1.34 2.27-.69.58-1.57.9-2.48.9h-2.34c-.91 0-1.79-.32-2.48-.9-.69-.57-1.16-1.37-1.34-2.27l-.93-4.67c-.05-.27-.08-.54-.08-.82v-.23c0-.18.02-.36.06-.54l.13-.67c.04-.2.13-.39.34-.46.06-.02.13-.04.2-.04h11.72c.07 0 .14.02.2.04.21.07.3.26.34.46l.13.67c.04.18.06.36.06.54v.23z" />
    </svg>
  );
}

function KofiIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 7.324-.022 11.822c.164 2.424 2.586 2.672 2.586 2.672s8.267-.023 11.966-.049c2.438-.426 2.683-2.566 2.658-3.734 4.352.24 7.422-2.831 6.649-6.916zm-11.062 3.511c-1.246 1.453-4.011 3.976-4.011 3.976s-.121.119-.31.023c-.076-.057-.108-.09-.108-.09-.443-.441-3.368-3.049-4.034-3.954-.709-.965-1.041-2.7-.091-3.71.951-1.01 3.005-1.086 4.363.407 0 0 1.565-1.782 3.468-.963 1.904.82 1.832 3.011.723 4.311zm6.173.478c-.928.116-1.682.028-1.682.028V7.284h1.77s1.971.551 1.971 2.638c0 1.913-.985 2.667-2.059 3.015z" />
    </svg>
  );
}

const OTHER_OPTIONS = [
  {
    icon: <GithubIcon />,
    label: 'GitHub Sponsors',
    detail: 'Monthly tiers or a one-time amount',
    href: 'https://github.com/sponsors/ganeshmshetty',
  },
  {
    icon: <KofiIcon />,
    label: 'Ko-fi',
    detail: 'One-time tip or monthly membership',
    href: 'https://ko-fi.com/ganeshmshetty',
  },
];

const FREE_WAYS = [
  {
    icon: <Star className="w-3.5 h-3.5" />,
    label: 'Star on GitHub',
    href: 'https://github.com/ganeshmshetty/openclip',
  },
  {
    icon: <MessageSquareHeart className="w-3.5 h-3.5" />,
    label: 'Review on AlternativeTo',
    href: 'https://alternativeto.net/software/openclip/about/?utm_source=badge&utm_medium=referral',
  },
  { icon: null, label: 'Share on X', href: 'https://x.com/pandannzo' },
];

export default function SupportContent() {
  return (
    <div className="h-dvh flex flex-col justify-between overflow-y-auto lg:overflow-hidden bg-[var(--bg-app)] selection:bg-[var(--accent)] selection:text-white">
      <Navbar />

      <main className="flex-1 flex flex-col justify-center px-4 sm:px-6 py-8 max-w-2xl mx-auto w-full">
        <h1 className="section-title">Support OpenClip</h1>

        <p className="section-sub mt-3 max-w-lg">
          OpenClip is free and open source under AGPL-3.0. There is no paid tier,
          no telemetry, and no company behind it. Sponsorship pays for macOS releases
          and new extensions.
        </p>

        {/* One decisive ask, not a comparison table of three. */}
        <div className="mt-7">
          <a
            href="https://buymeacoffee.com/ganeshmshetty"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary inline-flex items-center justify-center gap-2 h-[46px] px-6 rounded-full text-[14.5px] font-semibold transition-all active:scale-[0.98]"
          >
            <BuyMeACoffeeIcon className="w-[18px] h-[18px]" />
            <span>Buy me a coffee</span>
            <ArrowUpRight className="w-4 h-4 opacity-70" />
          </a>
        </div>

        <p className="mt-3 text-[12.5px] text-[var(--text-tertiary)]">
          Apple Pay, cards, or PayPal. No account needed.
        </p>

        {/* The other two are alternatives to the primary ask, so they get a plain row. */}
        <div className="mt-9 pt-7 border-t border-[var(--border-subtle)]">
          <p className="text-[12.5px] font-medium text-[var(--text-tertiary)]">
            Or pick whichever is easier
          </p>
          <div className="mt-3 flex flex-col gap-1">
            {OTHER_OPTIONS.map(({ icon, label, detail, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-xl hover:bg-[var(--bg-surface)] transition-colors"
              >
                <span className="text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors shrink-0">
                  {icon}
                </span>
                <span className="text-[13.5px] font-medium text-[var(--text-primary)]">
                  {label}
                </span>
                <span className="text-[12.5px] text-[var(--text-tertiary)] hidden sm:inline">
                  {detail}
                </span>
                <ArrowUpRight className="w-3.5 h-3.5 text-[var(--text-tertiary)] ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>
            ))}
          </div>
        </div>

        {/* Free ways to help — no money involved, so it sits below the fold of the ask. */}
        <div className="mt-8 pt-6 border-t border-[var(--border-subtle)]">
          <p className="text-[12.5px] font-medium text-[var(--text-tertiary)]">
            Free ways to help
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
            {FREE_WAYS.map(({ icon, label, href }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
              >
                {icon}
                <span>{label}</span>
              </a>
            ))}
          </div>
        </div>
      </main>

      {/* Minimal Clean Bottom Bar */}
      <footer className="shrink-0 border-t border-[var(--border-subtle)]/20 py-2.5 sm:py-3 px-4 text-center text-[11.5px] text-[var(--text-tertiary)] flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span>
          Built by{' '}
          <a
            href="https://x.com/pandannzo"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-medium underline underline-offset-2"
          >
            Ganesh M
          </a>
        </span>
        <span className="opacity-30">•</span>
        <span>Free &amp; Open Source under AGPL-3.0</span>
        <span className="opacity-30">•</span>
        <Link href="/" className="hover:text-[var(--text-secondary)] transition-colors">
          Home
        </Link>
        <span className="opacity-30">•</span>
        <Link href="/extensions" className="hover:text-[var(--text-secondary)] transition-colors">
          Extensions
        </Link>
        <span className="opacity-30">•</span>
        <Link href="/docs" className="hover:text-[var(--text-secondary)] transition-colors">
          Docs
        </Link>
      </footer>
    </div>
  );
}
