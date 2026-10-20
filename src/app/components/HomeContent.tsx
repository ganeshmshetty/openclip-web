'use client';

import Link from 'next/link';
import React, { useState, useSyncExternalStore } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from './Navbar';
import Footer from './Footer';
import GifFrame from './GifFrame';
import PromoVideo from './PromoVideo';
import { ArrowRight, ArrowUpRight, Quote, Heart, Command, Blocks, Plus, Sparkles, Calculator, SpellCheck } from 'lucide-react';
import { DownloadPill, BrewPill } from './CtaPills';

const PINNED_SHOWCASE = [
  {
    id: 'ai',
    tab: 'AI Writing',
    icon: Sparkles,
    title: 'AI writing, inline.',
    body: 'Fix grammar, summarize, or translate. The result streams into the card in place, not a browser tab.',
    mp4: '/gifs/ai-actions.mp4',
    alt: 'OpenClip AI actions rewriting selected text',
  },
  {
    id: 'math',
    tab: 'Inline Math',
    icon: Calculator,
    title: 'Math without Calculator.',
    body: 'Highlight any expression and the answer replaces it in place. Evaluated locally, no network round trip.',
    mp4: '/gifs/calculate.mp4',
    alt: 'OpenClip calculating a selected math expression',
  },
  {
    id: 'words',
    tab: 'Spell Check',
    icon: SpellCheck,
    title: 'Instant spell check.',
    body: 'Suggests completions and fixes for the word under your cursor. Apply one with a single click.',
    mp4: '/gifs/word-completion.mp4',
    alt: 'OpenClip suggesting spelling completions for selected word',
  },
];

// Shared spring so every segmented-control knob on the page feels identical.
const KNOB_SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;

/**
 * The demo carousels advance themselves when a clip finishes. That is the
 * "content moves at the page's pace" problem, so they also hold while the
 * pointer is over them, and stop advancing entirely for anyone who has asked
 * for reduced motion. useSyncExternalStore keeps the read out of an effect.
 */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false
  );
}

function Knob({ id }: { id: string }) {
  return (
    <motion.span
      layoutId={id}
      className="nav-knob"
      transition={KNOB_SPRING}
      initial={false}
    />
  );
}

interface FAQItem {
  question: string;
  answer: string;
  link?: { text: string; href: string };
}

const FAQS: FAQItem[] = [
  {
    question: 'How does OpenClip compare to PopClip?',
    answer:
      'OpenClip is free, 100% open-source, and written in modern Swift 6 for macOS 14+. It includes streaming AI actions (Apple Intelligence, Ollama, OpenAI-compatible APIs), sub-5ms inline math calculation, a universal keyboard command palette (⌥⌘C), and an open extension ecosystem (JavaScript, AppleScript, Shell) with zero tracking or telemetry.',
    link: { text: 'Read the in-depth OpenClip vs PopClip comparison →', href: '/compare/popclip' },
  },
  {
    question: 'Does OpenClip monitor or store my clipboard data?',
    answer:
      'Never. OpenClip uses native macOS Accessibility APIs to detect selected text directly on screen without reading your clipboard until you explicitly trigger an action or copy. Your data stays strictly on your Mac.',
  },
  {
    question: 'Which AI providers and models are supported?',
    answer:
      'OpenClip supports on-device Apple Intelligence (macOS 15.1+), local offline LLMs via Ollama, and any OpenAI-compatible cloud API (OpenAI, Claude via proxies, OpenRouter, Groq). API keys are stored securely in your encrypted macOS Keychain.',
  },
  {
    question: 'How do I install or create custom extensions?',
    answer:
      'Browse extensions in the built-in Catalog or on www.getopenclip.app/extensions and install with a single click (openclip://install). Building your own extension is as simple as creating a manifest.json and a script in JavaScript, AppleScript, or Shell inside ~/.openclip/extensions.',
  },
  {
    question: 'Is OpenClip completely free to use?',
    answer:
      'Yes. OpenClip is 100% free and open-source under the AGPL-3.0 license with no paywalls, subscriptions, or account requirements.',
  },
];

function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="overflow-hidden rounded-2xl bg-[var(--bg-surface)] shadow-sm">
      {FAQS.map((faq, idx) => {
        const isOpen = openIndex === idx;
        return (
          <div
            key={faq.question}
            className="border-b border-[var(--border-subtle)]/30 last:border-b-0"
          >
            <button
              onClick={() => setOpenIndex(isOpen ? null : idx)}
              className="group w-full px-5 sm:px-6 py-4 text-left flex items-center justify-between gap-4 cursor-pointer select-none transition-colors hover:bg-[var(--bg-surface-hover)]"
              aria-expanded={isOpen}
            >
              <span className="text-[13.5px] sm:text-[14.5px] font-semibold text-[var(--text-primary)] leading-snug">
                {faq.question}
              </span>
              <Plus
                className={`w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] shrink-0 transition-transform duration-200 ${
                  isOpen ? 'rotate-45 !text-[var(--accent)]' : ''
                }`}
              />
            </button>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-5 sm:px-6 pb-4.5 pt-0.5 text-[13px] sm:text-[13.5px] text-[var(--text-secondary)] leading-relaxed">
                    <p>{faq.answer}</p>
                    {faq.link && (
                      <div className="mt-2.5">
                        <Link
                          href={faq.link.href}
                          className="inline-flex items-center gap-1 font-medium text-[var(--accent)] hover:underline"
                        >
                          {faq.link.text}
                        </Link>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

interface Testimonial {
  id: string;
  quote: string;
  author: string;
  source: string;
  href: string;
}

/*
 * Every quote below is a real, unedited comment with a link to its original
 * post (Reddit threads and one Buy Me a Coffee supporter note). The wording is
 * never trimmed or paraphrased; the selection is the positive ones.
 */
const TESTIMONIALS: Testimonial[] = [
  {
    id: 'reddit-superb379',
    quote: 'It’s the best free alternative to PopClip and even surpasses it.',
    author: 'u/Superb379',
    source: 'r/macapps',
    href: 'https://reddit.com/comments/p9h0a56',
  },
  {
    id: 'reddit-zackria',
    quote:
      'The local LLM integration is what truly sets this apart from legacy tools. Having Ollama or on-device models handle contextual rewrites right under the cursor without sending selected buffer text off to a cloud API makes it actually viable for proprietary codebases and work notes.',
    author: 'u/zackria',
    source: 'r/MacOSApps',
    href: 'https://reddit.com/comments/pcgftzr',
  },
  {
    id: 'bmc-juan-carlos',
    quote:
      'Extraordinary app, better than the competition I had installed on my Mac. That’s why I decided to try it and contribute so you keep improving!',
    author: 'Juan Carlos',
    source: 'Buy Me a Coffee',
    href: 'https://buymeacoffee.com/ganeshmshetty/t/7060855',
  },
  {
    id: 'reddit-volatilefocus',
    quote: 'I really like this — the kind of thing that should ship with Macs, but cooler :)',
    author: 'u/volatilefocus',
    source: 'r/MacOSApps',
    href: 'https://reddit.com/comments/p9zvj4v',
  },
  {
    id: 'reddit-icyb3r',
    quote:
      'Codex recommended this to me, and I was completely blown away. Although I already own a PopClip license and recently built my own app, neither satisfied me.',
    author: 'u/iCyb3r',
    source: 'r/MacOSApps',
    href: 'https://reddit.com/comments/pcck11v',
  },
  {
    id: 'reddit-azfarrizvi',
    quote:
      'I am not associated with the developer nor was I asked to post this. I had a request for an extension and the dev circled back with a solution within the same day.',
    author: 'u/azfarrizvi',
    source: 'r/MacOSApps',
    href: 'https://reddit.com/comments/p9zdr9d',
  },
];

const QUOTE_ROWS: { items: Testimonial[]; reverse: boolean }[] = [
  { items: TESTIMONIALS.slice(0, 3), reverse: false },
  { items: TESTIMONIALS.slice(3), reverse: true },
];

const DISCUSSION_LINKS = [
  { label: 'r/macapps thread', href: 'https://www.reddit.com/r/macapps/comments/1w7z6aj/' },
  { label: 'r/MacOSApps thread', href: 'https://www.reddit.com/r/MacOSApps/comments/1wgzmhg/' },
  { label: 'Product Hunt', href: 'https://www.producthunt.com/products/openclip' },
  { label: 'AlternativeTo', href: 'https://alternativeto.net/software/openclip/about/' },
];

function QuoteCard({ t, hidden }: { t: Testimonial; hidden?: boolean }) {
  const name = t.author.replace(/^u\//, '');
  const initials = (name.includes(' ') ? name.split(' ').map((part) => part[0]).slice(0, 2).join('') : name.slice(0, 2)).toUpperCase();

  return (
    <a
      href={t.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${t.author} on ${t.source}: “${t.quote}”`}
      aria-hidden={hidden || undefined}
      tabIndex={hidden ? -1 : undefined}
      className="quote-card"
    >
      <figure className="flex h-full flex-col">
        <Quote className="h-5 w-5 fill-[var(--accent)] text-[var(--accent)]" aria-hidden="true" />
        <blockquote>{t.quote}</blockquote>
        <figcaption className="quote-author">
          <span className="quote-avatar" aria-hidden="true">{initials}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-[var(--text-primary)]">{t.author}</span>
            <span className="block truncate text-[11.5px] text-[var(--text-tertiary)]">{t.source}</span>
          </span>
        </figcaption>
      </figure>
    </a>
  );
}

function Testimonials() {
  return (
    <div>
      <div className="quote-rows">
        {QUOTE_ROWS.map(({ items, reverse }, row) => (
          <div key={row} className={`quote-marquee ${reverse ? 'is-reverse' : ''}`}>
            <div className="quote-track">
              {items.map((t) => (
                <QuoteCard key={t.id} t={t} />
              ))}
              {items.map((t) => (
                <QuoteCard key={`${t.id}-copy`} t={t} hidden />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[12px]">
        {DISCUSSION_LINKS.map(({ label, href }) => (
          <a
            key={label}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
          >
            {label}
            <ArrowUpRight className="w-3 h-3 opacity-60" aria-hidden="true" />
          </a>
        ))}
      </div>
    </div>
  );
}


function ActionShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  const reduced = usePrefersReducedMotion();

  const current = PINNED_SHOWCASE[activeIdx];

  return (
    <section className="section-shell py-16 sm:py-24">
      {/* Title and description sit side by side, so this section does not read
          as the same centred block as the hero above it. */}
      {/* Description sits under the heading rather than in a right column.
          The media below is wider than that column, so a right-hand description
          left a 289px empty slot beneath it and its left edge lined up with
          nothing else in the section. */}
      <div className="mb-7">
        <h2 className="section-title">{current.title}</h2>
        <p className="section-sub mt-2.5 max-w-xl">{current.body}</p>
      </div>

      <div
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
      >
        {/* Segmented Control — capsule shell and a sliding knob, matching the navbar */}
        <div className="home-tabs inline-flex nav-shell glass-surface items-stretch h-[38px] px-1 mb-6">
          {PINNED_SHOWCASE.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeIdx === idx;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveIdx(idx);
                  setProgress(0);
                }}
                className={`nav-chip gap-2 self-stretch my-[3px] px-3.5 sm:px-4 overflow-hidden ${
                  isActive ? 'nav-chip-active' : ''
                }`}
                aria-selected={isActive}
                role="tab"
              >
                {isActive && <Knob id="showcase-knob" />}
                {!reduced && isActive && progress > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 bg-[var(--accent-soft)] pointer-events-none"
                    style={{ width: `${progress * 100}%` }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.tab}</span>
                </span>
              </button>
            );
          })}
        </div>

      {/* Zero-Layout-Shift Crossfade Frame Stack */}
      <div className="max-w-2xl w-full relative">
        <div className="grid grid-cols-1 [grid-template-areas:'stack'] w-full">
          {PINNED_SHOWCASE.map((item, idx) => {
            const isActive = activeIdx === idx;
            return (
              <div
                key={item.id}
                className={`[grid-area:stack] space-y-3.5 transition-all duration-300 ${
                  isActive
                    ? 'opacity-100 scale-100 pointer-events-auto z-10'
                    : 'opacity-0 scale-[0.99] pointer-events-none z-0'
                }`}
              >
                <GifFrame
                  src={item.mp4}
                  alt={item.alt}
                  name={`${item.id}.mp4`}
                  isActive={isActive}
                  paused={held}
                  onProgress={isActive && !reduced ? setProgress : undefined}
                  onEnded={
                    reduced
                      ? undefined
                      : () => {
                          setProgress(0);
                          setActiveIdx((idx + 1) % PINNED_SHOWCASE.length);
                        }
                  }
                />
              </div>
            );
          })}
        </div>


      </div>
      </div>
    </section>
  );
}

function DirectDriveSection({
  children,
  className = '',
  onPointerEnter,
  onPointerLeave,
  onMouseEnter,
  onMouseLeave,
}: {
  children: React.ReactNode;
  className?: string;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  // No scroll-linked reveal. This section used to sit at 35% opacity, offset 28px,
  // until its scroll progress caught up — which left a full-width statement ("Select
  // text. Do things.") looking half-loaded, depended on JS and scroll position for
  // content to be readable, and promoted a large layer via will-change-transform.
  // It renders at full opacity on first paint instead.
  return (
    <section
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={className}
    >
      {children}
    </section>
  );
}

export default function HomeContent() {
  const [featureTab, setFeatureTab] = useState<'palette' | 'extensions'>('palette');
  const [featureProgress, setFeatureProgress] = useState(0);
  const [featureHeld, setFeatureHeld] = useState(false);
  const reduced = usePrefersReducedMotion();

  return (
    <div className="min-h-screen flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: FAQS.map((faq) => ({
              '@type': 'Question',
              name: faq.question,
              acceptedAnswer: {
                '@type': 'Answer',
                text: faq.answer,
              },
            })),
          }),
        }}
      />
      <Navbar />

      <main className="flex-1">
        <section className="home-hero relative pb-8 sm:pb-10">
          <div className="section-shell relative z-10 text-center">
            <h1
              className="home-hero-title font-semibold tracking-[-0.055em] leading-[1.04] text-[var(--text-primary)]"
            >
              OpenClip
              <span className="sr-only"> — Free, Open Source Floating Action Bar for macOS &amp; PopClip Alternative</span>
            </h1>

            <p
              className="mx-auto mt-3 max-w-xl text-[17px] font-normal leading-[1.55] text-[var(--text-secondary)] sm:mt-4 sm:text-[19px]"
            >
              Select text. Take action.
            </p>

            <div className="mt-7 flex flex-col items-center" data-nosnippet="true">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <DownloadPill />
                <Link
                  href="/support"
                  className="inline-flex h-[38px] items-center justify-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-4 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-surface)] sm:h-[46px] sm:gap-2 sm:px-6 sm:text-[14.5px]"
                >
                  <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                  Support
                </Link>
              </div>
              <BrewPill compact className="mt-3" />
            </div>

          </div>
        </section>

        {/* ── Product Demo ── */}
        <PromoVideo />

        {/* ── Showcases (pinned scrollytelling) ── */}
        <ActionShowcase />

        {/* ── Interactive Features Tab Section (Direct-Drive Scroll-Linked) ── */}
        <DirectDriveSection
          className="section-shell py-16 sm:py-24"
        >
          <div className="mb-7 text-right">
            <h2 className="section-title">Every action, one keystroke away.</h2>
            <p className="section-sub ml-auto mt-2.5 max-w-xl">
              Press ⌥⌘C to search every action, extension, and calculation from anywhere on your Mac.
            </p>
          </div>

          {/* Segmented Control — same capsule and knob as the navbar */}
          <div
            className="mb-6 flex justify-end"
            onPointerEnter={() => setFeatureHeld(true)}
            onPointerLeave={() => setFeatureHeld(false)}
          >
            <div className="home-tabs nav-shell glass-surface inline-flex items-stretch h-[38px] px-1">
              <button
                onClick={() => {
                  setFeatureTab('palette');
                  setFeatureProgress(0);
                }}
                className={`nav-chip gap-2 self-stretch my-[3px] px-3.5 sm:px-4 overflow-hidden ${
                  featureTab === 'palette' ? 'nav-chip-active' : ''
                }`}
                aria-selected={featureTab === 'palette'}
                role="tab"
              >
                {featureTab === 'palette' && <Knob id="feature-knob" />}
                {!reduced && featureTab === 'palette' && featureProgress > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 bg-[var(--accent-soft)] pointer-events-none"
                    style={{ width: `${featureProgress * 100}%` }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Command className="w-3.5 h-3.5" />
                  <span>Command Palette</span>
                  <kbd className="hidden sm:inline-flex text-[9.5px] font-mono opacity-80 bg-black/15 dark:bg-white/15 px-1.5 py-0.2 rounded ml-0.5">
                    ⌥⌘C
                  </kbd>
                </span>
              </button>

              <button
                onClick={() => {
                  setFeatureTab('extensions');
                  setFeatureProgress(0);
                }}
                className={`nav-chip gap-2 self-stretch my-[3px] px-3.5 sm:px-4 overflow-hidden ${
                  featureTab === 'extensions' ? 'nav-chip-active' : ''
                }`}
                aria-selected={featureTab === 'extensions'}
                role="tab"
              >
                {featureTab === 'extensions' && <Knob id="feature-knob" />}
                {!reduced && featureTab === 'extensions' && featureProgress > 0 && (
                  <span
                    className="absolute inset-y-0 left-0 bg-[var(--accent-soft)] pointer-events-none"
                    style={{ width: `${featureProgress * 100}%` }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  <Blocks className="w-3.5 h-3.5" />
                  <span>In-App Extensions</span>
                  <span className="hidden sm:inline-flex text-[9.5px] font-mono opacity-80 bg-black/15 dark:bg-white/15 px-1.5 py-0.2 rounded-full ml-0.5">
                    100+
                  </span>
                </span>
              </button>
            </div>
          </div>

          {/* Zero-Layout-Shift Crossfade Frame */}
          <div className="ml-auto max-w-2xl w-full">
            <div className="grid grid-cols-1 [grid-template-areas:'stack'] w-full">
              <div
                className={`[grid-area:stack] space-y-3.5 transition-all duration-300 ${
                  featureTab === 'palette'
                    ? 'opacity-100 scale-100 pointer-events-auto z-10'
                    : 'opacity-0 scale-[0.99] pointer-events-none z-0'
                }`}
              >
                <GifFrame
                  src="/gifs/command-palette.gif"
                  alt="OpenClip Universal Command Palette"
                  name="command-palette.gif"
                  isActive={featureTab === 'palette'}
                  paused={featureHeld}
                  onProgress={
                    featureTab === 'palette' && !reduced ? setFeatureProgress : undefined
                  }
                  onEnded={
                    reduced
                      ? undefined
                      : () => {
                          setFeatureProgress(0);
                          setFeatureTab('extensions');
                        }
                  }
                />
                <p className="text-right text-[13.5px] text-[var(--text-secondary)] leading-relaxed min-h-[22px]">
                  Press <kbd className="mac-keycap mx-1">⌥⌘C</kbd> from anywhere to calculate, format, or trigger quick actions straight from your keyboard.
                </p>
              </div>

              <div
                className={`[grid-area:stack] space-y-3.5 transition-all duration-300 ${
                  featureTab === 'extensions'
                    ? 'opacity-100 scale-100 pointer-events-auto z-10'
                    : 'opacity-0 scale-[0.99] pointer-events-none z-0'
                }`}
              >
                <GifFrame
                  src="/gifs/in-app-extensions.gif"
                  alt="OpenClip In-App Extensions"
                  name="in-app-extensions.gif"
                  isActive={featureTab === 'extensions'}
                  paused={featureHeld}
                  onProgress={
                    featureTab === 'extensions' && !reduced ? setFeatureProgress : undefined
                  }
                  onEnded={
                    reduced
                      ? undefined
                      : () => {
                          setFeatureProgress(0);
                          setFeatureTab('palette');
                        }
                  }
                />
                <div className="flex flex-col sm:flex-row items-end sm:items-center sm:justify-end gap-2 sm:gap-4 text-right text-[13.5px] text-[var(--text-secondary)] min-h-[22px]">
                  <span>Browse 100+ official extensions or create custom workflows in JS, AppleScript, and Shell.</span>
                  <Link
                    href="/extensions"
                    className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors shrink-0"
                  >
                    <span>Explore Catalog</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </DirectDriveSection>

        {/* ── FAQ Section (two-column: questions left, answers right) ── */}
        <section className="section-shell py-16 sm:py-24">
          <div className="grid gap-y-8 sm:grid-cols-12 sm:gap-x-12">
            <div className="sm:col-span-5">
              <h2 className="section-title">Before you install.</h2>
              <p className="section-sub mt-3">
                Privacy, permissions, and what OpenClip does with the text you select.
              </p>

              <div className="mt-6 flex flex-col items-start gap-2.5 text-[13px] font-semibold text-[var(--accent)]">
                <Link href="/docs/getting-started" className="inline-flex items-center gap-1.5 hover:text-[var(--accent-hover)] transition-colors">
                  Read the quick start <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <Link href="/extensions" className="inline-flex items-center gap-1.5 hover:text-[var(--accent-hover)] transition-colors">
                  Browse extensions <Blocks className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>

            <div className="sm:col-span-6 sm:col-start-7">
              <FAQAccordion />
            </div>
          </div>
        </section>

        {/* ── Testimonials — real comments, linked to source ── */}
        <section className="section-shell py-16 sm:py-24">
          <div className="mb-10 text-center">
            <h2 className="section-title">In their own words.</h2>
            <p className="section-sub mx-auto mt-3 max-w-md">
              From Reddit threads and supporter notes. Unedited, and linked to the originals.
            </p>
          </div>

          <Testimonials />
        </section>

        {/* ── Download CTA Section ── */}
        <section id="download" className="relative py-20 sm:py-28 overflow-hidden scroll-mt-12">
          <div className="section-shell relative z-10 text-center">
            <h2 className="section-title">Get OpenClip for Mac.</h2>
            <p className="section-sub mx-auto mt-3 max-w-md text-balance">
              Free and open source under AGPL-3.0. No account, no paywall, no telemetry.
            </p>

            <div className="mt-8 flex flex-row flex-wrap items-center justify-center gap-2 sm:gap-3 w-full px-2" data-nosnippet="true">
              <DownloadPill />
              <BrewPill />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
