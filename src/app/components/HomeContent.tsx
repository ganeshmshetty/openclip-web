'use client';

import Link from 'next/link';
import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useScroll, useTransform } from 'motion/react';
import Navbar from './Navbar';
import Footer from './Footer';
import GifFrame from './GifFrame';
import PromoVideo from './PromoVideo';
import { ArrowRight, Command, ShieldCheck, Blocks, Plus, MousePointer2, MousePointerClick, Play, Sparkles, Calculator, SpellCheck, Coffee, Star, ArrowUpRight } from 'lucide-react';
import { DownloadPill, SponsorPill, BrewPill } from './CtaPills';

function AppleIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.13.64-2.79 1.41-.58.68-1.1 1.76-1.01 2.81 1.07.08 2.18-.6 2.79-1.35z" />
    </svg>
  );
}

const PINNED_SHOWCASE = [
  {
    id: 'ai',
    tab: 'AI Writing',
    icon: Sparkles,
    title: 'AI writing, inline.',
    body: 'Fix grammar, summarize, or translate directly into a floating card.',
    mp4: '/gifs/ai-actions.mp4',
    alt: 'OpenClip AI actions rewriting selected text',
    inkAnnotation: 'Streams into native card',
  },
  {
    id: 'math',
    tab: 'Inline Math',
    icon: Calculator,
    title: 'Math without Calculator.',
    body: 'Highlight any math expression to get the answer instantly.',
    mp4: '/gifs/calculate.mp4',
    alt: 'OpenClip calculating a selected math expression',
    inkAnnotation: 'Sub-5ms local evaluation',
  },
  {
    id: 'words',
    tab: 'Spell Check',
    icon: SpellCheck,
    title: 'Instant spell check.',
    body: 'Suggests completions and word fixes with a single click.',
    mp4: '/gifs/word-completion.mp4',
    alt: 'OpenClip suggesting spelling completions for selected word',
    inkAnnotation: '1-click word replacement',
  },
];

function ApplePencilArrow({ className = 'w-24 h-14' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M 110 8 C 75 12, 35 25, 12 48" />
      <path d="M 10 36 L 12 49 L 25 46" />
    </svg>
  );
}

function ApplePencilUnderline({ className = 'w-44 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 180 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <path d="M 4 10 C 45 6, 110 5, 176 11" />
    </svg>
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

interface SupporterReview {
  id: string;
  author: string;
  initials: string;
  avatarClass: string;
  quote: string;
  href: string;
}

const SUPPORTER_REVIEWS: SupporterReview[] = [
  {
    id: '7060855',
    author: 'Juan Carlos',
    initials: 'JC',
    avatarClass: 'from-amber-400/25 to-orange-500/25 text-amber-600 dark:text-amber-400',
    quote: 'Extraordinary app, better than the competition I had installed on my Mac. That’s why I decided to try it and contribute so you keep improving!',
    href: 'https://buymeacoffee.com/ganeshmshetty/t/7060855',
  },
  {
    id: '20071719',
    author: 'Someone',
    initials: 'SO',
    avatarClass: 'from-sky-400/25 to-blue-500/25 text-sky-600 dark:text-sky-400',
    quote: 'Thank you for OpenClip. It’s a great app.',
    href: 'https://buymeacoffee.com/ganeshmshetty/c/20071719',
  },
];

function SupporterTestimonialDeck() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const activeReview = SUPPORTER_REVIEWS[currentIndex];
  const nextIndex = (currentIndex + 1) % SUPPORTER_REVIEWS.length;
  const peekReview = SUPPORTER_REVIEWS[nextIndex];

  return (
    <div className="mt-10 sm:mt-12 max-w-[500px] sm:max-w-[530px] mx-auto text-left select-none">
      {/* Asymmetric Stacked Container - visibly layered with fixed height */}
      <div className="relative h-[215px] sm:h-[195px]">
        {/* Layer 3: Base Stack Rim (Deepest shadow card) */}
        <div
          className="absolute inset-0 top-[-14px] sm:top-[-16px] left-8 sm:left-10 right-[-18px] sm:right-[-22px] bottom-5 sm:bottom-6 rounded-2xl bg-[var(--bg-surface)]/35 dark:bg-[#161618]/35 backdrop-blur-xs shadow-xs transform rotate-[5.2deg] z-0 pointer-events-none opacity-45"
          aria-hidden="true"
        />

        {/* Layer 2: Background Peek Card (Visibly angled & offset to top-right) */}
        <motion.div
          key={`peek-${peekReview.id}`}
          initial={{ opacity: 0.5, scale: 0.95 }}
          animate={{ opacity: 0.8, scale: 0.98 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ rotate: 3.5, scale: 1.005, opacity: 1 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => setCurrentIndex(nextIndex)}
          className="group absolute inset-0 top-[-7px] sm:top-[-9px] left-4 sm:left-6 right-[-12px] sm:right-[-16px] bottom-3 sm:bottom-4 rounded-2xl bg-[var(--bg-surface)]/75 dark:bg-[#161618]/75 backdrop-blur-md shadow-md transform rotate-[2.8deg] p-4 sm:p-5 flex flex-col justify-between cursor-pointer z-10"
          title="Click card to flip to next review"
          aria-hidden="true"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 opacity-70">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />
                ))}
              </div>
              <span className="text-[11px] font-mono font-medium text-[var(--text-tertiary)]">
                {nextIndex + 1} of {SUPPORTER_REVIEWS.length}
              </span>
            </div>
            <span className="text-[11px] font-medium text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)] flex items-center gap-1">
              <span>Next note</span>
              <MousePointerClick className="w-3 h-3 text-[var(--accent)]" />
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] line-clamp-2 italic font-normal">
            &ldquo;{peekReview.quote}&rdquo;
          </p>
          <div className="pt-2.5 flex items-center justify-between opacity-70">
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full bg-gradient-to-br ${peekReview.avatarClass} flex items-center justify-center font-bold text-[10px]`}
              >
                {peekReview.initials}
              </div>
              <span className="text-[12px] font-medium text-[var(--text-secondary)]">
                {peekReview.author}
              </span>
            </div>
            <Coffee className="w-3 h-3 text-amber-500 opacity-60" />
          </div>
        </motion.div>

        {/* Layer 1: Foreground Active Card with Subtle 3D Card-Flip Animation */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={activeReview.id}
            initial={{ opacity: 0, y: 12, rotateX: 12, rotate: -2, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, rotateX: 0, rotate: -0.75, scale: 1 }}
            exit={{ opacity: 0, y: -12, rotateX: -12, rotate: 1.5, scale: 0.96 }}
            transition={{
              duration: 0.28,
              ease: [0.16, 1, 0.3, 1],
            }}
            whileHover={{ scale: 1.008, rotate: -0.2 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => setCurrentIndex(nextIndex)}
            className="relative z-20 h-full rounded-2xl bg-[var(--bg-surface)]/95 dark:bg-[#161618]/95 backdrop-blur-xl shadow-lg hover:shadow-xl p-5 sm:p-6 flex flex-col justify-between cursor-pointer group"
            style={{ transformOrigin: 'bottom center' }}
            title="Click to flip review"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <span className="text-[11px] font-mono font-medium text-[var(--text-tertiary)] bg-[var(--text-primary)]/5 dark:bg-white/5 px-1.5 py-0.5 rounded">
                    {currentIndex + 1} of {SUPPORTER_REVIEWS.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={activeReview.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors group/link cursor-pointer"
                    title="View supporter note on Buy Me a Coffee"
                  >
                    <span>Verified supporter</span>
                    <ArrowUpRight className="w-3 h-3 opacity-60 group-hover/link:opacity-100" />
                  </a>
                  <span className="text-[var(--text-tertiary)]/40">·</span>
                  <div className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors">
                    <MousePointerClick className="w-3 h-3 text-[var(--accent)]" />
                    <span className="hidden sm:inline">Click to flip</span>
                  </div>
                </div>
              </div>

              <p className="text-[14px] sm:text-[14.5px] text-[var(--text-primary)] leading-relaxed italic font-normal">
                &ldquo;{activeReview.quote}&rdquo;
              </p>
            </div>

            <div className="pt-3.5 border-t border-[var(--border-subtle)]/15 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br ${activeReview.avatarClass} flex items-center justify-center font-bold text-[11px] sm:text-[12px]`}
                >
                  {activeReview.initials}
                </div>
                <div>
                  <p className="text-[13px] sm:text-[13.5px] font-semibold text-[var(--text-primary)] leading-tight">
                    {activeReview.author}
                  </p>
                  <p className="text-[11px] sm:text-[11.5px] text-[var(--text-tertiary)]">
                    Supporter on Buy Me a Coffee
                  </p>
                </div>
              </div>
              <Coffee className="w-4 h-4 text-amber-500 opacity-85 shrink-0" />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Zero-footprint Deck Dots Navigation */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {SUPPORTER_REVIEWS.map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentIndex(i);
            }}
            className={`h-1.5 rounded-full transition-all duration-200 cursor-pointer ${
              i === currentIndex
                ? 'w-6 bg-[var(--text-primary)]'
                : 'w-1.5 bg-[var(--text-tertiary)]/30 hover:bg-[var(--text-tertiary)]'
            }`}
            aria-label={`Go to review ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

function ApplePencilPinnedShowcase() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  const scrollToDownload = (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById('download')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleTabClick = (idx: number) => {
    setActiveIdx(idx);
    setProgress(0);
  };

  const current = PINNED_SHOWCASE[activeIdx];

  return (
    <section className="py-16 sm:py-24 max-w-4xl mx-auto px-5 sm:px-8">
      {/* Title & Description */}
      <div className="text-center max-w-2xl mx-auto mb-8">
        <div className="relative inline-block">
          <h2 className="text-[28px] sm:text-[40px] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
            {current.title}
          </h2>
          <div className="text-[var(--accent)] opacity-80 mt-0.5 flex justify-center">
            <ApplePencilUnderline className="w-36 h-3" />
          </div>
        </div>
        <p className="mt-2.5 text-[14.5px] sm:text-[16px] text-[var(--text-secondary)] leading-relaxed min-h-[24px]">
          {current.body}
        </p>
      </div>

      {/* Centered Segmented Control with Left-to-Right Progress Shift */}
      <div className="flex justify-center mb-6">
        <div className="nav-pill inline-flex items-stretch h-[34px] overflow-hidden shadow-md">
          {PINNED_SHOWCASE.map((item, idx) => {
            const Icon = item.icon;
            const isActive = activeIdx === idx;
            return (
              <React.Fragment key={item.id}>
                <button
                  onClick={() => handleTabClick(idx)}
                  className={`relative nav-btn-text flex items-center gap-2 px-3.5 sm:px-4.5 cursor-pointer transition-colors !rounded-none overflow-hidden ${
                    isActive ? 'nav-btn-text-active !bg-transparent' : ''
                  }`}
                  aria-selected={isActive}
                  role="tab"
                >
                  {/* Left-to-right animated progress fill */}
                  {isActive && (
                    <span
                      className="absolute inset-0 bg-[var(--accent-soft)] pointer-events-none"
                      style={{ width: `${progress * 100}%` }}
                    />
                  )}
                  {isActive && (
                    <span
                      className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)] pointer-events-none"
                      style={{ width: `${progress * 100}%` }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.tab}</span>
                  </span>
                </button>
                {idx < PINNED_SHOWCASE.length - 1 && <span className="nav-divider" />}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Zero-Layout-Shift Crossfade Frame Stack */}
      <div className="max-w-2xl mx-auto w-full relative">
        {/* Ink Annotation */}
        <div className="absolute -top-10 right-4 z-20 text-[var(--accent)] hidden sm:flex items-center gap-2 pointer-events-none transition-all duration-300">
          <div className="relative flex flex-col items-end">
            <span className="text-[12.5px] font-sans font-medium text-[var(--accent)] whitespace-nowrap">
              {current.inkAnnotation}
            </span>
            <ApplePencilArrow className="w-16 h-8 -mt-1 mr-2 text-[var(--accent)]" />
          </div>
        </div>

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
                  onProgress={isActive ? setProgress : undefined}
                  onEnded={() => {
                    setProgress(0);
                    setActiveIdx((idx + 1) % PINNED_SHOWCASE.length);
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Bottom Play with it button */}
        <div className="mt-8 flex justify-center">
          <a
            href="#download"
            onClick={scrollToDownload}
            className="inline-flex items-center gap-2 h-[38px] px-5 rounded-full bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 active:scale-[0.98] font-medium text-[13px] shadow-sm transition-all cursor-pointer select-none"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Play with it</span>
          </a>
        </div>
      </div>
    </section>
  );
}

function TryItNowSection() {
  return (
    <section className="hidden md:block max-w-5xl mx-auto px-5 pb-16 pt-8 sm:-mt-[20vh] sm:px-8 sm:pb-24 sm:pt-12">
      <div className="text-center max-w-xl mx-auto mb-9">
        <h2 className="text-[32px] sm:text-[48px] font-bold tracking-[-0.04em] text-[var(--text-primary)] leading-[1.06]">
          Just try it out.
        </h2>
        <p className="mt-2.5 text-[14px] sm:text-[15px] text-[var(--text-secondary)] leading-relaxed">
          Select a line in the app you are already using. OpenClip is ready when you are.
        </p>
      </div>

      <div className="try-it-desktop" aria-label="A macOS desktop with text selected in Notes">
        <div className="try-it-menu-bar">
          <div className="flex items-center gap-3">
            <AppleIcon className="w-3.5 h-3.5" />
            <span className="font-semibold">OpenClip</span>
            <span className="opacity-70">File</span>
            <span className="opacity-70">Edit</span>
            <span className="opacity-70">View</span>
          </div>
          <span className="font-medium">Tue 25 Aug&nbsp; 19:51</span>
        </div>
        <div className="try-it-notch" aria-hidden="true" />

        <div className="try-it-files" aria-hidden="true">
          <div className="try-it-file">
            <span className="try-it-folder" />
            <span>Projects</span>
          </div>
          <div className="try-it-file">
            <span className="try-it-document" />
            <span>Notes.txt</span>
          </div>
        </div>

        <div className="try-it-window">
          <div className="try-it-window-bar">
            <span className="try-it-traffic try-it-close" />
            <span className="try-it-traffic try-it-minimize" />
            <span className="try-it-traffic try-it-expand" />
            <span className="try-it-window-title">Notes</span>
          </div>
          <div className="try-it-paper">
            <p className="try-it-date">25 August 2026 at 7:51 PM</p>
            <h3>
              Saturday plans:{' '}
              <span className="try-it-selection">
                Meet at the gallery at six, then find somewhere for dinner.
              </span>
            </h3>
          </div>
          <MousePointer2 className="try-it-cursor" aria-hidden="true" />
        </div>
        <p className="try-it-hint">Select the highlighted sentence</p>
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
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'center center'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.7], [0.35, 1]);
  const y = useTransform(scrollYProgress, [0, 1], [28, 0]);
  const scale = useTransform(scrollYProgress, [0, 1], [0.99, 1]);

  return (
    <motion.section
      ref={ref}
      style={{ opacity, y, scale }}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`${className} will-change-transform`}
    >
      {children}
    </motion.section>
  );
}

export default function HomeContent() {
  const [featureTab, setFeatureTab] = useState<'palette' | 'extensions'>('palette');
  const [featureProgress, setFeatureProgress] = useState(0);

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
        <section className="relative pt-16 pb-12 sm:pt-24 sm:pb-16">
          <div className="relative z-10 mx-auto max-w-4xl px-5 text-center sm:px-8">
            {/* Top Eyebrow Text */}
            <motion.p
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mb-4 text-[14px] font-medium tracking-tight text-[var(--text-secondary)] sm:mb-7 sm:text-[16px]"
            >
              The missing floating action bar for macOS
            </motion.p>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="text-[44px] font-bold tracking-[-0.04em] leading-[1.02] text-[var(--text-primary)] sm:text-[clamp(4.5rem,8vw,6rem)]"
            >
              Select text.<br />Do things.
              <span className="sr-only"> — Free, Open Source Floating Action Bar for macOS &amp; PopClip Alternative</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-5 max-w-xl text-[17px] font-normal leading-[1.55] text-[var(--text-secondary)] sm:mt-7 sm:text-[19px]"
            >
              A native floating action bar for macOS. Highlight any text to copy, calculate, transform, or run custom scripts — without switching windows.
            </motion.p>

            {/* Floating CTA Buttons: Download, Sponsor & Brew capsules side-by-side */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-row flex-wrap items-center justify-center gap-2 sm:gap-3 w-full px-2 sm:mt-10"
              data-nosnippet="true"
            >
              <DownloadPill />
              <BrewPill />
              <SponsorPill />
            </motion.div>

            {/* Single Consolidated Trust & Compatibility Strip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.65, delay: 0.28 }}
              className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[12px] font-medium text-[var(--text-tertiary)] sm:text-[13px]"
            >
              <span className="inline-flex items-center gap-1">
                <AppleIcon className="w-3 h-3 text-[var(--text-secondary)] shrink-0" />
                <span>macOS 14+ Sonoma &amp; Sequoia</span>
              </span>
              <span className="text-[var(--border-strong)] opacity-40">·</span>
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>100% Free &amp; Open Source</span>
              </span>
              <span className="text-[var(--border-strong)] opacity-40">·</span>
              <Link
                href="/extensions"
                className="hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-0.5"
              >
                <span>100+ Extensions</span>
                <ArrowRight className="w-3 h-3 ml-0.5 opacity-70" />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ── Promo Video (Cinematic Scroll-Expand) ── */}
        <PromoVideo />

        {/* ── Desktop Try-It Scene ── */}
        <TryItNowSection />

        {/* ── Showcases (Apple Pencil Pinned Scrollytelling) ── */}
        <ApplePencilPinnedShowcase />

        {/* ── Interactive Features Tab Section (Direct-Drive Scroll-Linked) ── */}
        <DirectDriveSection
          className="py-16 sm:py-24 max-w-4xl mx-auto px-5 sm:px-8"
        >
          <div className="text-center max-w-2xl mx-auto mb-8">
            <h2 className="text-[24px] sm:text-[36px] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
              Power tools, right at your fingertips.
            </h2>
            <p className="mt-2.5 text-[14.5px] sm:text-[16px] text-[var(--text-secondary)] leading-relaxed">
              Instant keyboard workflows and fully customizable extensions tailored for macOS.
            </p>
          </div>

          {/* Centered Segmented Control with Navbar Style and 0 Border Radius on Inside Buttons */}
          <div className="flex justify-center mb-6">
            <div
              className="nav-pill inline-flex items-stretch h-[34px] overflow-hidden shadow-md"
            >
              <button
                onClick={() => {
                  setFeatureTab('palette');
                  setFeatureProgress(0);
                }}
                className={`relative nav-btn-text flex items-center gap-2 px-3.5 sm:px-4 cursor-pointer transition-colors !rounded-none overflow-hidden ${
                  featureTab === 'palette' ? 'nav-btn-text-active !bg-transparent' : ''
                }`}
              >
                {/* Left-to-right animated progress fill */}
                {featureTab === 'palette' && (
                  <span
                    className="absolute inset-0 bg-[var(--accent-soft)] pointer-events-none"
                    style={{ width: `${featureProgress * 100}%` }}
                  />
                )}
                {featureTab === 'palette' && (
                  <span
                    className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)] pointer-events-none"
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

              <span className="nav-divider" />

              <button
                onClick={() => {
                  setFeatureTab('extensions');
                  setFeatureProgress(0);
                }}
                className={`relative nav-btn-text flex items-center gap-2 px-3.5 sm:px-4 cursor-pointer transition-colors !rounded-none overflow-hidden ${
                  featureTab === 'extensions' ? 'nav-btn-text-active !bg-transparent' : ''
                }`}
              >
                {/* Left-to-right animated progress fill */}
                {featureTab === 'extensions' && (
                  <span
                    className="absolute inset-0 bg-[var(--accent-soft)] pointer-events-none"
                    style={{ width: `${featureProgress * 100}%` }}
                  />
                )}
                {featureTab === 'extensions' && (
                  <span
                    className="absolute bottom-0 left-0 h-[2px] bg-[var(--accent)] pointer-events-none"
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
          <div className="max-w-2xl mx-auto w-full">
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
                  onProgress={featureTab === 'palette' ? setFeatureProgress : undefined}
                  onEnded={() => {
                    setFeatureProgress(0);
                    setFeatureTab('extensions');
                  }}
                />
                <p className="text-center text-[13.5px] text-[var(--text-secondary)] leading-relaxed min-h-[22px]">
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
                  onProgress={featureTab === 'extensions' ? setFeatureProgress : undefined}
                  onEnded={() => {
                    setFeatureProgress(0);
                    setFeatureTab('palette');
                  }}
                />
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-[13.5px] text-[var(--text-secondary)] min-h-[22px]">
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

        {/* ── FAQ Section (Clean Centered Layout) ── */}
        <section className="py-16 sm:py-24 max-w-3xl mx-auto px-5 sm:px-8">
          <div className="text-center max-w-xl mx-auto mb-10">
            <h2 className="text-[24px] sm:text-[36px] font-bold tracking-tight text-[var(--text-primary)] leading-tight">
              Before you install.
            </h2>
            <p className="mt-2.5 text-[14.5px] sm:text-[16px] text-[var(--text-secondary)] leading-relaxed">
              Quick answers about privacy, permissions, and making OpenClip your own.
            </p>
          </div>

          <FAQAccordion />

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] font-semibold text-[var(--accent)]">
            <Link href="/docs/getting-started" className="inline-flex items-center gap-1.5 hover:text-[var(--accent-hover)] transition-colors">
              Read the quick start <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <span className="text-[var(--border-strong)] opacity-40">·</span>
            <Link href="/extensions" className="inline-flex items-center gap-1.5 hover:text-[var(--accent-hover)] transition-colors">
              Browse extensions <Blocks className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>

        {/* ── Download CTA Section ── */}
        <section id="download" className="relative py-24 sm:py-32 overflow-hidden scroll-mt-12">
          <div className="relative z-10 max-w-4xl mx-auto px-5 sm:px-8 text-center">
            <h2 className="text-[32px] sm:text-[48px] font-bold tracking-[-0.04em] text-[var(--text-primary)] leading-tight">
              Get OpenClip for Mac.
            </h2>
            <p className="mt-3 text-[15px] sm:text-[17px] text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              Free, open-source, and ready for macOS Sonoma &amp; Sequoia.
            </p>

            <div className="mt-8 flex flex-row flex-wrap items-center justify-center gap-2 sm:gap-3 w-full px-2" data-nosnippet="true">
              <DownloadPill />
              <BrewPill />
              <SponsorPill />
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] font-medium text-[var(--text-tertiary)]">
              <span>macOS 14+</span>
              <span>·</span>
              <span>100% Free &amp; Open Source</span>
              <span>·</span>
              <span>Zero Tracking</span>
            </div>

            {/* Supporter Testimonials - Asymmetric Floating Deck */}
            <SupporterTestimonialDeck />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
