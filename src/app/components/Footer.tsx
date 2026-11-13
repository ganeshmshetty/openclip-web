import Link from 'next/link';
import { ArrowUpRight, ArrowRight } from 'lucide-react';

const productLinks = [
  { href: '/extensions', label: 'Clips Directory' },
  { href: '/compare/popclip', label: 'PopClip Alternative' },
  { href: '/docs/getting-started', label: 'Documentation' },
  { href: '/changelog', label: 'Changelog' },
  { href: '/support', label: 'Support OpenClip' },
  { href: 'https://github.com/ganeshmshetty/openclip/releases', label: 'Releases', external: true },
  { href: 'https://github.com/ganeshmshetty/openclip', label: 'GitHub Repository', external: true },
];

const developerLinks = [
  { href: '/docs/manifest-spec', label: 'Manifest Spec' },
  { href: '/docs/javascript', label: 'JS Runtime API' },
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
      <div className="section-shell pt-10 sm:pt-12 pb-10">
        {/* ── Support callout: a plain row ── */}
        <div className="mb-10 pb-8 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 sm:gap-6">
          <div>
            <h3 className="text-[15px] sm:text-[16px] font-semibold text-[var(--text-primary)] tracking-tight">
              Support OpenClip
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] mt-1 max-w-xl leading-relaxed">
              OpenClip is free and open source. If it saves you time, you can chip in toward its development.
            </p>
          </div>
          <Link
            href="/support"
            className="btn-primary shrink-0 py-2.5 px-5 rounded-full text-[13.5px] font-semibold flex items-center gap-2 transition-all active:scale-[0.98] w-full sm:w-auto justify-center"
          >
            <span>Support OpenClip</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr_1fr_1fr] gap-8 md:gap-10">
          {/* ── Brand Narrative ── */}
          <div className="space-y-3.5">
            <div className="flex items-center gap-2.5">
              <img
                src="/icons/openclip-icon.svg"
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
              <span>Built by</span>
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
