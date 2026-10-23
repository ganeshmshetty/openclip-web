'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { Menu, X, ArrowDown } from 'lucide-react';
import { motion } from 'motion/react';
import ThemeToggle from './ThemeToggle';
import { downloadLatestDmg, getLatestDmgUrl } from '@/lib/downloadClient';

function GithubIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function DiscordIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function AppleIcon({ className = 'w-3.5 h-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.13.64-2.79 1.41-.58.68-1.1 1.76-1.01 2.81 1.07.08 2.18-.6 2.79-1.35z" />
    </svg>
  );
}

const NAV_LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/extensions', label: 'Clips' },
  { href: '/docs', label: 'Docs' },
];

const KNOB_SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    getLatestDmgUrl().catch(() => {});
  }, []);

  const shell = 'nav-shell glass-surface flex items-stretch px-1 h-[44px]';
  const isActiveHref = (href: string) =>
    pathname === href || (href === '/docs' && pathname === '/developers');

  return (
    <header className="site-navbar sticky top-4 z-[100] px-4 sm:px-6">
      <div className="relative max-w-fit mx-auto">
        <div className="flex items-stretch gap-2">
          {/* ── Island 1 · Navigation ── */}
          <div className={`${shell} gap-0.5`}>
            <Link
              href="/"
              className="nav-chip self-stretch my-[3px] gap-2 pl-2.5 pr-3"
              aria-label="OpenClip home"
            >
              <img
                src="/icons/openclip-icon.png"
                alt=""
                className="w-[18px] h-[18px] rounded-[5px] shrink-0"
                width={18}
                height={18}
              />
              <span className="font-semibold text-[13px] tracking-tight text-[var(--text-primary)]">
                OpenClip
              </span>
            </Link>

            <div className="hidden md:flex items-stretch self-stretch gap-0.5">
              {NAV_LINKS.map(({ href, label }) => {
                const isActive = isActiveHref(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={isActive ? 'page' : undefined}
                    className={`nav-chip self-stretch my-[3px] px-3.5 ${
                      isActive ? 'nav-chip-active' : ''
                    }`}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-knob"
                        className="nav-knob"
                        transition={KNOB_SPRING}
                        initial={false}
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </Link>
                );
              })}
            </div>

            <div className="flex md:hidden items-stretch self-stretch gap-0.5">
              <ThemeToggle />
              <button
                className="nav-chip self-stretch my-[3px] px-2.5"
                onClick={() => setMobileOpen(!mobileOpen)}
                aria-label="Toggle menu"
                aria-expanded={mobileOpen}
              >
                {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* ── Island 2 · Utility ── */}
          <div className={`${shell} gap-0.5 hidden md:flex`}>
            <ThemeToggle />
            <a
              href="https://github.com/ganeshmshetty/openclip"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-chip self-stretch my-[3px] w-9"
              title="OpenClip on GitHub"
              aria-label="OpenClip on GitHub"
            >
              <GithubIcon className="w-[15px] h-[15px] shrink-0" />
            </a>
            <a
              href="https://discord.gg/acYYdzM7jR"
              target="_blank"
              rel="noopener noreferrer"
              className="nav-chip self-stretch my-[3px] w-9"
              title="Join the OpenClip Discord"
              aria-label="Join the OpenClip Discord"
            >
              <DiscordIcon className="w-[15px] h-[15px]" />
            </a>
          </div>

          {/* ── Island 3 · Primary action ── */}
          {/* Desktop: blue liquid-glass pill */}
          <div className="hidden sm:flex items-stretch">
            <a
              href="/download"
              onClick={(e) => {
                e.preventDefault();
                downloadLatestDmg();
              }}
              className="nav-cta self-stretch my-[3px] pl-4 pr-5"
              aria-label="Download for Mac"
            >
              <AppleIcon className="w-[18px] h-[18px] shrink-0 -mt-0.5" />
              <span>Download</span>
            </a>
          </div>
          {/* Mobile: neutral liquid-glass "Get" */}
          <div className="flex sm:hidden items-stretch">
            <a
              href="/download"
              onClick={(e) => {
                e.preventDefault();
                downloadLatestDmg();
              }}
              className="nav-cta-glass self-stretch px-3.5"
              aria-label="Download for Mac"
            >
              <ArrowDown className="w-3.5 h-3.5 shrink-0" strokeWidth={2.5} />
              <span>Get</span>
            </a>
          </div>
        </div>

        {/* ── Mobile menu ── */}
        {mobileOpen && (
          <>
            <div
              className="fixed inset-0 z-[100] bg-black/25 dark:bg-black/60 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
              onClick={() => setMobileOpen(false)}
            />

            <div className="md:hidden absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[calc(100vw-2rem)] max-w-xs nav-shell glass-surface !rounded-3xl p-2 flex flex-col gap-0.5 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 z-[101]">
              {NAV_LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`nav-chip self-stretch !justify-start px-3.5 py-2.5 !rounded-2xl !text-[13.5px] ${
                    isActiveHref(href) ? 'nav-chip-active bg-[var(--bg-tertiary)]' : ''
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <a
                href="https://github.com/ganeshmshetty/openclip"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-chip self-stretch !justify-start px-3.5 py-2.5 !rounded-2xl !text-[13.5px]"
                onClick={() => setMobileOpen(false)}
                aria-label="OpenClip on GitHub"
              >
                <GithubIcon className="w-4 h-4 shrink-0" />
              </a>
              <a
                href="https://discord.gg/acYYdzM7jR"
                target="_blank"
                rel="noopener noreferrer"
                className="nav-chip self-stretch !justify-start px-3.5 py-2.5 !rounded-2xl !text-[13.5px]"
                onClick={() => setMobileOpen(false)}
              >
                <DiscordIcon className="w-4 h-4 shrink-0" />
                <span className="ml-2.5">Discord</span>
              </a>
              <a
                href="/download"
                onClick={(e) => {
                  e.preventDefault();
                  setMobileOpen(false);
                  downloadLatestDmg();
                }}
                className="nav-cta mt-2 h-10 !text-[13px]"
              >
                <AppleIcon className="w-4 h-4 -mt-0.5" />
                <span>Download for Mac</span>
              </a>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
