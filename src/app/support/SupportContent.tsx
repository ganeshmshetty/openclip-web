'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import {
  Heart,
  Star,
  Coffee,
  ArrowUpRight,
  MessageSquareHeart,
  CheckCircle2,
} from 'lucide-react';

function GithubIcon({ className = 'w-5 h-5' }: { className?: string }) {
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

function BuyMeACoffeeIcon({ className = 'w-5 h-5' }: { className?: string }) {
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

function KofiIcon({ className = 'w-5 h-5' }: { className?: string }) {
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

interface SponsorCardProps {
  icon: React.ReactNode;
  iconWrapperClass: string;
  badge: string;
  badgeClass: string;
  accentClass: string;
  title: string;
  description: string;
  perks: string[];
  href: string;
  ariaLabel: string;
  ctaLabel: string;
  ctaIcon: React.ReactNode;
  ctaClass: string;
}

function SponsorCard({
  icon,
  iconWrapperClass,
  badge,
  badgeClass,
  accentClass,
  title,
  description,
  perks,
  href,
  ariaLabel,
  ctaLabel,
  ctaIcon,
  ctaClass,
}: SponsorCardProps) {
  return (
    <div className="bento-card group flex flex-col justify-between p-4 sm:p-6 shadow-md hover:shadow-lg transition-all duration-300">
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${accentClass}`} />
      <div>
        <div className="flex items-center justify-between gap-2 mb-3 sm:mb-3.5">
          <div
            className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shadow-xs group-hover:scale-105 transition-transform ${iconWrapperClass}`}
          >
            {icon}
          </div>
          <span className={`badge-subtle text-[11px] font-medium border-0 ${badgeClass}`}>
            {badge}
          </span>
        </div>

        <h2 className="text-[16px] sm:text-[17px] font-semibold text-[var(--text-primary)] tracking-tight">
          {title}
        </h2>
        <p className="mt-1 sm:mt-1.5 text-[12.5px] text-[var(--text-secondary)] leading-relaxed">
          {description}
        </p>

        <ul className="mt-2.5 sm:mt-3 space-y-1.5 text-[12px] text-[var(--text-secondary)]">
          {perks.map((perk) => (
            <li key={perk} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{perk}</span>
            </li>
          ))}
        </ul>
      </div>

      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={`mt-4 sm:mt-5 w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-[13px] font-semibold transition-all duration-200 shadow-sm hover:shadow active:scale-[0.98] ${ctaClass}`}
      >
        {ctaIcon}
        <span>{ctaLabel}</span>
        <ArrowUpRight className="w-3.5 h-3.5 opacity-70" />
      </a>
    </div>
  );
}

export default function SupportContent() {
  return (
    <div className="h-dvh flex flex-col justify-between overflow-y-auto lg:overflow-hidden bg-[var(--bg-app)] selection:bg-[var(--accent)] selection:text-white">
      {/* Top Navbar */}
      <Navbar />

      {/* Main Support Center */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6 py-4 sm:py-6 max-w-4xl mx-auto w-full">
        {/* Ambient Subtle Glow */}
        <div className="hero-ambient-glow w-full flex flex-col items-center">
          {/* Eyebrow Pill */}
          <div className="feature-eyebrow mb-2 sm:mb-3 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] sm:text-[12px]">
            <Heart className="w-3.5 h-3.5 text-pink-500 fill-pink-500 animate-pulse" />
            <span>Support Independent macOS Software</span>
          </div>

          {/* Heading */}
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-[var(--text-primary)] text-center leading-tight">
            Support OpenClip
          </h1>

          {/* Subheading */}
          <p className="mt-2 text-[13.5px] sm:text-[14.5px] text-[var(--text-secondary)] text-center max-w-lg leading-relaxed">
            OpenClip is 100% free and open-source under AGPL-3.0 with no paywalls or trackers.
            Your sponsorship directly fuels ongoing updates, macOS releases, and new extensions.
          </p>
        </div>

        {/* Sponsor Cards Grid (3 Column) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 sm:gap-5 w-full mt-5 sm:mt-7 max-w-3xl">
          <SponsorCard
            icon={<Heart className="w-4 h-4 sm:w-5 sm:h-5 fill-[#ea4aaa]" />}
            iconWrapperClass="bg-pink-500/10 dark:bg-pink-500/15 text-[#ea4aaa]"
            badge="0% platform fee"
            badgeClass="text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/40"
            accentClass="bg-gradient-to-r from-pink-500/70 via-pink-500/25 to-transparent"
            title="GitHub Sponsors"
            description="Sponsor monthly or with a one-time contribution. Displays a sponsor badge on your GitHub profile."
            perks={[
              'Monthly tiers or custom one-time amount',
              'GitHub Sponsor profile badge',
            ]}
            href="https://github.com/sponsors/ganeshmshetty"
            ariaLabel="Sponsor Ganesh M on GitHub Sponsors (opens in new tab)"
            ctaLabel="Sponsor"
            ctaIcon={<GithubIcon className="w-4 h-4" />}
            ctaClass="text-white bg-[#24292f] hover:bg-[#1b1f24] dark:bg-pink-600 dark:hover:bg-pink-500"
          />

          <SponsorCard
            icon={<Coffee className="w-4 h-4 sm:w-5 sm:h-5" />}
            iconWrapperClass="bg-amber-500/10 dark:bg-amber-500/15 text-amber-500"
            badge="Instant Tip"
            badgeClass="text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40"
            accentClass="bg-gradient-to-r from-amber-400/80 via-amber-400/30 to-transparent"
            title="Buy Me a Coffee"
            description="Send a quick coffee tip in seconds. Pay seamlessly with Apple Pay, cards, or PayPal without an account."
            perks={[
              'Apple Pay, Google Pay, Cards & PayPal',
              'Leave a message or feature shoutout',
            ]}
            href="https://buymeacoffee.com/ganeshmshetty"
            ariaLabel="Buy Ganesh M a coffee on Buy Me a Coffee (opens in new tab)"
            ctaLabel="Buy a Coffee"
            ctaIcon={<BuyMeACoffeeIcon className="w-4 h-4" />}
            ctaClass="text-neutral-900 bg-[#FFDD00] hover:bg-[#ffea40]"
          />

          <SponsorCard
            icon={<KofiIcon className="w-4 h-4 sm:w-5 sm:h-5" />}
            iconWrapperClass="bg-[#FF5E5B]/10 dark:bg-[#FF5E5B]/15 text-[#FF5E5B]"
            badge="No account needed"
            badgeClass="text-[#FF5E5B] bg-[#FF5E5B]/10 dark:bg-[#FF5E5B]/15"
            accentClass="bg-gradient-to-r from-[#FF5E5B]/70 via-[#FF5E5B]/25 to-transparent"
            title="Ko-fi"
            description="Treat me to a coffee on Ko-fi. One-time or monthly support in seconds, with no sign-up required."
            perks={[
              'One-time tip or monthly membership',
              'Cards, Apple Pay & PayPal',
            ]}
            href="https://ko-fi.com/ganeshmshetty"
            ariaLabel="Support Ganesh M on Ko-fi (opens in new tab)"
            ctaLabel="Buy a Ko-fi"
            ctaIcon={<KofiIcon className="w-4 h-4" />}
            ctaClass="text-white bg-[#FF5E5B] hover:bg-[#ff706d]"
          />
        </div>

        {/* Free Ways to Support Bar */}
        <div className="mt-3.5 sm:mt-5 w-full max-w-3xl px-4 py-3 sm:py-2.5 rounded-xl bg-[var(--bg-surface)]/60 backdrop-blur-md shadow-xs flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-2.5 text-[12px] text-[var(--text-secondary)]">
          <span className="font-medium text-[var(--text-primary)]">
            Free ways to help:
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5">
            <a
              href="https://github.com/ganeshmshetty/openclip"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1"
            >
              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span>Star on GitHub</span>
            </a>
            <span className="opacity-30">•</span>
            <a
              href="https://alternativeto.net/software/openclip/about/?utm_source=badge&utm_medium=referral"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1"
            >
              <MessageSquareHeart className="w-3 h-3 text-blue-500" />
              <span>Review on AlternativeTo</span>
            </a>
            <span className="opacity-30">•</span>
            <a
              href="https://x.com/pandannzo"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1"
            >
              <span>Share on X</span>
            </a>
          </div>
        </div>
      </main>

      {/* Minimal Clean Bottom Bar */}
      <footer className="shrink-0 border-t border-[var(--border-subtle)]/20 py-2.5 sm:py-3 px-4 text-center text-[11.5px] text-[var(--text-tertiary)] flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <span>
          Built with 💙 by{' '}
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
        <span>Free & Open Source under AGPL-3.0</span>
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
