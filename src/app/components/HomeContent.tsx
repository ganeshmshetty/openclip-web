'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from './Navbar';
import Footer from './Footer';
import PromoVideo from './PromoVideo';
import FeatureRows from './FeatureRows';
import SelectingRibbon from './SelectingRibbon';
import DeskScene from './DeskScene';
import { ArrowRight, ArrowUpRight, Quote, Heart, Blocks, Plus } from 'lucide-react';
import { DownloadPill, BrewPill } from './CtaPills';

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

const CTA_TEXT = 'Free and open source. No account, no paywall. No telemetry. Nothing leaves your Mac. Select text. Take action.';

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


export default function HomeContent() {
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
        <section className="home-hero relative pb-6 sm:pb-8">
          <DeskScene />
          <div className="section-shell pointer-events-none relative z-10 text-center [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
            <h1
              className="home-hero-title font-semibold tracking-[-0.055em] leading-[1.04] text-[var(--text-primary)]"
            >
              OpenClip
              <span className="sr-only"> — Free, Open Source Floating Action Bar for macOS &amp; PopClip Alternative</span>
            </h1>

            <p
              className="mx-auto mt-3 max-w-[34rem] text-balance text-[17px] font-normal leading-[1.55] text-[var(--text-secondary)] sm:mt-4 sm:text-[19px]"
            >
              select some text and see what you can do with it. free and open source.
            </p>

            <div className="mt-7 flex flex-col items-center" data-nosnippet="true">
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <DownloadPill />
                <Link
                  href="/support"
                  className="group inline-flex h-[38px] items-center justify-center gap-1.5 rounded-full border border-[var(--border-subtle)] px-4 text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-200 hover:border-pink-400/60 hover:bg-pink-500/[0.06] sm:h-[46px] sm:gap-2 sm:px-6 sm:text-[14.5px]"
                >
                  <Heart className="h-3.5 w-3.5 transition-all duration-200 ease-out group-hover:scale-125 group-hover:fill-pink-500 group-hover:text-pink-500" aria-hidden="true" />
                  Support
                </Link>
              </div>
              <BrewPill compact className="mt-3" />
            </div>

          </div>
        </section>

        {/* ── Product Demo ── */}
        <PromoVideo />

        {/* ── Feature rows ── */}
        <FeatureRows />

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
          <SelectingRibbon
            path="M -100 430 C 400 410, 1000 230, 1540 170"
            viewBox="0 0 1440 600"
            preserveAspectRatio="xMidYMid slice"
            text={CTA_TEXT}
            size={30}
            className="ribbon-fade-center absolute inset-0 hidden h-full w-full sm:block"
          />
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
