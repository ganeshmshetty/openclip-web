import Link from 'next/link';
import { ArrowUpRight, Heart, ArrowRight } from 'lucide-react';

function AppleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.13.64-2.79 1.41-.58.68-1.1 1.76-1.01 2.81 1.07.08 2.18-.6 2.79-1.35z" />
    </svg>
  );
}

const productLinks = [
  { href: '/extensions', label: 'Clips Directory' },
  { href: '/compare/popclip', label: 'PopClip Alternative' },
  { href: '/docs', label: 'Documentation' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/support', label: 'Support OpenClip' },
  { href: 'https://github.com/ganeshmshetty/openclip/releases', label: 'Releases', external: true },
  { href: 'https://github.com/ganeshmshetty/openclip', label: 'GitHub Repository', external: true },
];

const developerLinks = [
  { href: '/docs/manifest-spec', label: 'Manifest Spec' },
  { href: '/docs/js-api-reference', label: 'JS Runtime API' },
  { href: '/docs/getting-started', label: 'Quick Start' },
  { href: 'https://github.com/ganeshmshetty/openclip-extensions', label: 'Extensions Catalog', external: true },
];

const connectLinks = [
  { href: 'https://alternativeto.net/software/openclip/about/?utm_source=badge&utm_medium=referral', label: 'AlternativeTo', external: true },
  { href: 'https://www.producthunt.com/products/openclip', label: 'Product Hunt', external: true },
  { href: 'https://x.com/pandannzo', label: 'X (Twitter)', external: true },
  { href: 'https://github.com/ganeshmshetty', label: 'GitHub Profile', external: true },
];

export default function Footer() {
  return (
    <footer className="mt-auto bg-[var(--bg-app)]">
      <div className="max-w-5xl mx-auto px-5 sm:px-8 pt-10 sm:pt-12 pb-10">
        {/* ── Support OpenClip Callout Banner (Big Button) ── */}
        <div className="mb-10 p-5 sm:p-6 rounded-2xl bg-[var(--bg-surface)]/80 backdrop-blur-xl shadow-md hover:shadow-lg transition-all flex flex-col sm:flex-row items-center justify-between gap-5 sm:gap-6">
          <div className="flex items-center gap-4 text-center sm:text-left">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-pink-500/10 dark:bg-pink-500/15 text-pink-500 flex items-center justify-center shrink-0 shadow-xs">
              <Heart className="w-5 h-5 sm:w-6 sm:h-6 fill-pink-500 animate-pulse" />
            </div>
            <div>
              <h3 className="text-[15px] sm:text-[16.5px] font-semibold text-[var(--text-primary)] tracking-tight">
                Support OpenClip Development
              </h3>
              <p className="text-[12.5px] sm:text-[13px] text-[var(--text-secondary)] mt-0.5 max-w-xl leading-relaxed">
                OpenClip is 100% free and open-source. Help keep it fast, independent, and actively maintained.
              </p>
            </div>
          </div>
          <Link
            href="/support"
            className="btn-primary shrink-0 py-3 px-6 rounded-xl text-[14px] font-semibold flex items-center gap-2 shadow-sm hover:shadow-md transition-all active:scale-[0.98] w-full sm:w-auto justify-center"
          >
            <Heart className="w-4 h-4 fill-white" />
            <span>Support OpenClip</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr_1fr] gap-8 md:gap-10">
          {/* ── Brand Narrative ── */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2.5">
              <img
                src="/icons/openclip-icon.png"
                alt="OpenClip"
                className="w-7 h-7 rounded-[7px] shadow-sm"
                width={28}
                height={28}
              />
              <span className="text-[16px] font-bold tracking-tight text-[var(--text-primary)]">
                OpenClip
              </span>
            </div>

            <p className="text-[13.5px] font-medium text-[var(--text-primary)] leading-snug">
              Select text. Do things.
            </p>

            <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed max-w-xs">
              A floating action bar for macOS. Highlight any text to copy, calculate, transform, or run custom scripts.
            </p>

            <div className="pt-2 text-[12px] text-[var(--text-tertiary)] flex items-center gap-1.5">
              <span>Built with 💙 by</span>
              <a
                href="https://x.com/pandannzo"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors inline-flex items-center gap-0.5"
              >
                <span>Ganesh M</span>
                <ArrowUpRight className="w-3 h-3 opacity-60" />
              </a>
            </div>

            <div className="pt-2 flex flex-wrap items-center gap-2.5">
              <a
                href="https://alternativeto.net/software/openclip/about/?utm_source=badge&utm_medium=referral"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block opacity-85 hover:opacity-100 transition-opacity"
                title="OpenClip on AlternativeTo"
              >
                <img
                  src="https://alternativeto.net/static/badges/badge-compact-color.svg"
                  alt="OpenClip | AlternativeTo"
                  width={140}
                  height={42}
                  style={{ width: '140px', height: 'auto' }}
                />
              </a>
            </div>
          </div>

          {/* ── Column 1: Product ── */}
          <div className="space-y-3">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              Product
            </p>
            <ul className="space-y-2 text-[12.5px]">
              {productLinks.map(({ href, label, external }) => (
                <li key={href}>
                  <Link
                    href={href}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors inline-flex items-center gap-1"
                  >
                    <span>{label}</span>
                    {external && <ArrowUpRight className="w-2.5 h-2.5 opacity-50" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Column 2: Developers ── */}
          <div className="space-y-3">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              Developers
            </p>
            <ul className="space-y-2 text-[12.5px]">
              {developerLinks.map(({ href, label, external }) => (
                <li key={href}>
                  <Link
                    href={href}
                    target={external ? '_blank' : undefined}
                    rel={external ? 'noopener noreferrer' : undefined}
                    className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors inline-flex items-center gap-1"
                  >
                    <span>{label}</span>
                    {external && <ArrowUpRight className="w-2.5 h-2.5 opacity-50" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* ── Column 3: Community & Connect ── */}
          <div className="space-y-3">
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">
              Community &amp; Connect
            </p>
            <ul className="space-y-2 text-[12.5px]">
              {connectLinks.map(({ href, label }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors inline-flex items-center gap-1"
                  >
                    <span>{label}</span>
                    <ArrowUpRight className="w-2.5 h-2.5 opacity-50" />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Bottom Sub-Strip ── */}
        <div className="mt-10 pt-6 border-t border-[var(--border-subtle)]/30 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-[var(--text-tertiary)]">
            <p>© 2026 OpenClip. Designed for macOS.</p>
            <p className="flex items-center gap-1">
              Open Source under AGPL-3.0 License
            </p>
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] text-center sm:text-left leading-relaxed opacity-75">
            PopClip is a trademark of Nicholas Moore / Pilotmoon Software. OpenClip is an independent, open-source project and is not affiliated with, endorsed by, or sponsored by Nicholas Moore or Pilotmoon Software.
          </p>
        </div>
      </div>
    </footer>
  );
}
