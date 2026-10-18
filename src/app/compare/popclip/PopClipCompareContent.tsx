'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import {
  Check,
  X,
  Sparkles,
  Terminal,
  Download,
  ShieldCheck,
  Zap,
  Copy,
  Command,
  Plus,
  ChevronRight,
  ArrowRight,
  Blocks,
  Cpu,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { downloadLatestDmg } from '@/lib/downloadClient';

function AppleIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.13.64-2.79 1.41-.58.68-1.1 1.76-1.01 2.81 1.07.08 2.18-.6 2.79-1.35z" />
    </svg>
  );
}

interface MatrixRow {
  feature: string;
  description: string;
  openclip: string | boolean;
  popclip: string | boolean;
  highlight?: boolean;
}

const COMPARISON_ROWS: MatrixRow[] = [
  {
    feature: 'Pricing & Licensing',
    description: 'Cost and software license terms',
    openclip: '100% Free & Open Source (AGPL-3.0)',
    popclip: '$20+ Paid License',
    highlight: true,
  },
  {
    feature: 'Native Architecture',
    description: 'Underlying framework and codebase',
    openclip: 'Modern Swift 6 & AppKit',
    popclip: 'Objective-C & AppleScript architecture',
  },
  {
    feature: 'macOS Optimization',
    description: 'Support for modern Apple Silicon & OS features',
    openclip: 'macOS 14 Sonoma & 15 Sequoia Native',
    popclip: 'macOS 10.15+ (Broader legacy compatibility)',
  },
  {
    feature: 'Local Offline AI (Ollama)',
    description: 'Run private local LLMs without internet',
    openclip: true,
    popclip: false,
    highlight: true,
  },
  {
    feature: 'Apple Intelligence Integration',
    description: 'Native system writing tools on macOS 15.1+',
    openclip: true,
    popclip: false,
    highlight: true,
  },
  {
    feature: 'Cloud AI Streaming (OpenAI, Claude, Groq)',
    description: 'Real-time response streaming in floating card',
    openclip: true,
    popclip: 'Basic single prompt',
  },
  {
    feature: 'Keyboard Command Palette (⌥⌘C)',
    description: 'Trigger text actions without reaching for the mouse',
    openclip: true,
    popclip: false,
    highlight: true,
  },
  {
    feature: 'Sub-5ms Inline Math Calculator',
    description: 'Instant inline evaluation of math expressions',
    openclip: true,
    popclip: 'Requires extension',
  },
  {
    feature: 'Extension Ecosystem',
    description: 'Supported scripting runtimes for custom actions',
    openclip: 'JavaScript, AppleScript, Shell, Shortcuts',
    popclip: 'JavaScript, AppleScript, Shell',
  },
  {
    feature: 'Extension Catalog & 1-Click Install',
    description: 'Deep link installation via openclip://install',
    openclip: '100+ Free Extensions',
    popclip: 'Web directory & snippets',
  },
  {
    feature: 'Privacy & Zero Telemetry',
    description: 'Data stays strictly local on device',
    openclip: '100% Local (Keychain storage, 0 tracking)',
    popclip: 'Proprietary / Closed source',
    highlight: true,
  },
];

const FAQS = [
  {
    question: 'Why should I choose OpenClip over PopClip?',
    answer:
      'OpenClip offers a strictly modern, free, and open-source alternative. It delivers Swift 6 native responsiveness, on-device local AI via Ollama, streaming cards for LLMs, a universal keyboard Command Palette (⌥⌘C), and over 100 extensions with zero tracking and no paywalls.',
  },
  {
    question: 'Is OpenClip really free forever?',
    answer:
      'Yes. OpenClip is licensed under the open-source AGPL-3.0 license. There are no paid tiers, no pro unlocks, no trial limits, and no subscriptions. The source code is completely public on GitHub.',
  },
  {
    question: 'How do I migrate my existing PopClip extensions to OpenClip?',
    answer:
      'OpenClip supports JavaScript, AppleScript, and Shell scripts with a clean JSON manifest. Creating or porting an extension takes under 2 minutes. You can place your custom scripts in ~/.openclip/extensions or submit them to our open GitHub catalog.',
  },
  {
    question: 'Does OpenClip replace or work alongside Raycast or Alfred?',
    answer:
      'OpenClip complements launchers like Raycast and Alfred perfectly. While launchers require you to open a centralized window, OpenClip meets you right at your mouse cursor whenever you highlight text, or summons an action bar with ⌥⌘C.',
  },
  {
    question: 'Does OpenClip upload or track my selected text?',
    answer:
      'Never. OpenClip uses native macOS Accessibility APIs to detect selected text directly on your screen without reading your clipboard until an action is explicitly clicked. No telemetry, analytics, or text logging ever occurs.',
  },
];

export default function PopClipCompareContent() {
  const [copiedBrew, setCopiedBrew] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const copyBrewCommand = async () => {
    try {
      await navigator.clipboard.writeText('brew install openclip');
      setCopiedBrew(true);
      setTimeout(() => setCopiedBrew(false), 2000);
    } catch {}
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)]">
      <Navbar />

      <main className="flex-1">
        {/* ── Hero Section ── */}
        <section className="relative pt-16 pb-14 sm:pt-24 sm:pb-20 px-5 sm:px-8 max-w-5xl mx-auto text-center">
          {/* Top Breadcrumb / Eyebrow */}
          <div className="flex items-center justify-center gap-2 mb-4 text-[13px] font-medium text-[var(--text-tertiary)]">
            <Link href="/" className="hover:text-[var(--text-primary)] transition-colors">
              OpenClip
            </Link>
            <ChevronRight className="w-3.5 h-3.5 opacity-40" />
            <span className="text-[var(--accent)] font-semibold">PopClip Alternative</span>
          </div>

          <h1 className="text-[34px] sm:text-[54px] font-bold tracking-tight text-[var(--text-primary)] leading-[1.08] max-w-3xl mx-auto">
            The Modern, Free &amp; Open Source PopClip Alternative for macOS
          </h1>

          <p className="mt-5 sm:mt-7 text-[16px] sm:text-[19px] text-[var(--text-secondary)] max-w-2xl mx-auto leading-relaxed">
            Looking for a PopClip alternative? OpenClip turns selected text into instant actions
            with native Swift 6 speed, local AI streaming, a universal keyboard palette, and 100+
            extensions—100% free under the AGPL-3.0 license.
          </p>

          {/* CTA Buttons */}
          <div className="mt-8 flex flex-row items-center justify-center gap-2.5 sm:gap-3 w-full px-2">
            <a
              href="/download"
              onClick={(e) => {
                e.preventDefault();
                downloadLatestDmg();
              }}
              className="h-[42px] sm:h-[46px] px-5 sm:px-7 rounded-full bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 active:scale-[0.98] font-semibold text-[13.5px] sm:text-[14.5px] shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer whitespace-nowrap select-none"
            >
              <AppleIcon className="w-4 h-4 -mt-0.5" />
              <span>Download OpenClip Free</span>
            </a>

            <button
              onClick={copyBrewCommand}
              className="h-[42px] sm:h-[46px] px-4 sm:px-5 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] active:scale-[0.98] text-[11.5px] sm:text-[12px] font-mono font-medium text-[var(--text-primary)] flex items-center justify-center gap-2 shadow-xs border border-[var(--border-subtle)] hover:border-[var(--border-strong)] transition-all cursor-pointer whitespace-nowrap group select-none"
              title="Copy brew install command"
            >
              <Terminal className="w-3.5 h-3.5 opacity-80 text-[var(--accent)] shrink-0" />
              <span className="hidden sm:inline">brew install openclip</span>
              <span className="sm:hidden">brew install</span>
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-colors ml-0.5 shrink-0">
                {copiedBrew ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500 animate-in zoom-in-75 duration-150" />
                ) : (
                  <Copy className="w-3.5 h-3.5 text-current" />
                )}
              </span>
            </button>
          </div>

          {/* Trust strip */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[12px] font-medium text-[var(--text-tertiary)]">
            <span className="inline-flex items-center gap-1">
              <AppleIcon className="w-3 h-3 text-[var(--text-secondary)]" />
              <span>macOS 14+ Sonoma &amp; Sequoia</span>
            </span>
            <span className="text-[var(--border-strong)] opacity-40">·</span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>100% Free &amp; Open Source</span>
            </span>
            <span className="text-[var(--border-strong)] opacity-40">·</span>
            <span>Zero Tracking or Telemetry</span>
          </div>
        </section>

        {/* ── Feature Comparison Matrix Table ── */}
        <section className="py-12 px-5 sm:px-8 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <span className="badge-subtle mb-3">Feature Matrix</span>
            <h2 className="text-[26px] sm:text-[34px] font-bold tracking-tight text-[var(--text-primary)]">
              OpenClip vs. PopClip: Head-to-Head
            </h2>
            <p className="text-[14px] sm:text-[15.5px] text-[var(--text-secondary)] mt-2 max-w-xl mx-auto">
              How the modern open-source floating action bar compares against the proprietary veteran.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-sm">
            <table className="w-full text-left border-collapse min-w-[620px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-hover)]">
                  <th className="py-4 px-5 text-[13px] font-semibold text-[var(--text-secondary)] w-2/5">
                    Feature &amp; Capability
                  </th>
                  <th className="py-4 px-5 text-[14px] font-bold text-[var(--accent)] w-3/10 bg-[var(--accent-soft)]/20 border-x border-[var(--accent-border)]/30">
                    <div className="flex items-center gap-2">
                      <span>OpenClip</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--accent)] text-white font-normal">
                        AGPL-3.0 Open Source
                      </span>
                    </div>
                  </th>
                  <th className="py-4 px-5 text-[13px] font-semibold text-[var(--text-tertiary)] w-3/10">
                    PopClip
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)] text-[13px]">
                {COMPARISON_ROWS.map((row) => (
                  <tr
                    key={row.feature}
                    className={`transition-colors hover:bg-[var(--bg-surface-hover)] ${
                      row.highlight ? 'bg-[var(--accent-soft)]/5 font-medium' : ''
                    }`}
                  >
                    <td className="py-3.5 px-5">
                      <div className="font-semibold text-[var(--text-primary)]">{row.feature}</div>
                      <div className="text-[11.5px] text-[var(--text-tertiary)] mt-0.5">
                        {row.description}
                      </div>
                    </td>
                    <td className="py-3.5 px-5 bg-[var(--accent-soft)]/10 border-x border-[var(--accent-border)]/20 font-medium text-[var(--text-primary)]">
                      {typeof row.openclip === 'boolean' ? (
                        row.openclip ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-500 font-semibold">
                            <Check className="w-4 h-4" />
                            <span>Included</span>
                          </div>
                        ) : (
                          <X className="w-4 h-4 text-red-400" />
                        )
                      ) : (
                        row.openclip
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-[var(--text-secondary)]">
                      {typeof row.popclip === 'boolean' ? (
                        row.popclip ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-500 font-semibold">
                            <Check className="w-4 h-4" />
                            <span>Included</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-[var(--text-tertiary)]">
                            <X className="w-4 h-4 opacity-50" />
                            <span>Not Supported</span>
                          </div>
                        )
                      ) : (
                        row.popclip
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 text-[11.5px] text-[var(--text-tertiary)] text-center max-w-2xl mx-auto leading-relaxed opacity-80">
            * Legal Notice: PopClip is a trademark of Nicholas Moore / Pilotmoon Software. OpenClip is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Nicholas Moore or Pilotmoon Software. Feature comparisons reflect publicly documented features and pricing as of 2026.
          </p>
        </section>

        {/* ── Key Advantages Deep Dive ── */}
        <section className="py-14 px-5 sm:px-8 max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-[26px] sm:text-[34px] font-bold tracking-tight text-[var(--text-primary)]">
              Why Mac Users Are Switching to OpenClip
            </h2>
            <p className="text-[14px] sm:text-[15.5px] text-[var(--text-secondary)] mt-2 max-w-xl mx-auto">
              Built from scratch in 2026 for Sonoma and Sequoia with modern developer expectations.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <div className="glass-card p-6 sm:p-7 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] text-[var(--accent)] flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="text-[17px] font-bold text-[var(--text-primary)]">
                Local-First AI with Real-Time Streaming
              </h3>
              <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed">
                PopClip requires third-party web requests. OpenClip connects directly to on-device
                Apple Intelligence or local offline models via <strong>Ollama</strong> (Llama 3,
                DeepSeek, Mistral) without internet access. For cloud LLMs, results stream token-by-token
                into a native floating result card.
              </p>
            </div>

            <div className="glass-card p-6 sm:p-7 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-3">
                <Command className="w-5 h-5" />
              </div>
              <h3 className="text-[17px] font-bold text-[var(--text-primary)]">
                Universal Keyboard Command Palette (⌥⌘C)
              </h3>
              <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed">
                You don’t always want to reach for your mouse. OpenClip includes a global command
                palette accessible via <strong>⌥⌘C</strong> so you can search, filter, and execute
                any text action entirely from the keyboard with instant fuzzy matching.
              </p>
            </div>

            <div className="glass-card p-6 sm:p-7 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center mb-3">
                <Cpu className="w-5 h-5" />
              </div>
              <h3 className="text-[17px] font-bold text-[var(--text-primary)]">
                Swift 6 &amp; Sub-5ms Inline Math
              </h3>
              <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed">
                Highlight any math expression like <code>14.99 * 1.18</code> or <code>2^12</code> and
                OpenClip calculates the result locally in under 5 milliseconds with zero battery
                drain. Written in pure Swift 6 with strict concurrency.
              </p>
            </div>

            <div className="glass-card p-6 sm:p-7 space-y-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
                <Blocks className="w-5 h-5" />
              </div>
              <h3 className="text-[17px] font-bold text-[var(--text-primary)]">
                100+ Free Extensions &amp; Open Catalog
              </h3>
              <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed">
                Browse our catalog of over 100 extensions—from Markdown preview and case conversion
                to Obsidian capture and developer formatters. Install with a single click using the
                <code>openclip://install</code> protocol without restarting the app.
              </p>
            </div>
          </div>
        </section>

        {/* ── Migration Guide Section ── */}
        <section className="py-12 px-5 sm:px-8 max-w-4xl mx-auto">
          <div className="glass-card p-7 sm:p-9 border border-[var(--border-strong)]/40 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="space-y-2 max-w-xl">
                <span className="badge-subtle">Easy Migration</span>
                <h2 className="text-[22px] sm:text-[26px] font-bold tracking-tight text-[var(--text-primary)]">
                  Switching from PopClip takes 60 seconds
                </h2>
                <p className="text-[14px] text-[var(--text-secondary)] leading-relaxed">
                  OpenClip installs side-by-side with PopClip so you can test them together. All your
                  familiar workflows—copy, paste, search, and text transformation—work immediately
                  out of the box.
                </p>
              </div>

              <Link
                href="/docs/manifest-spec"
                className="btn-secondary whitespace-nowrap flex items-center gap-1.5 shrink-0 text-[13px] font-medium"
              >
                <span>Read Developer Spec</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* ── FAQ Section ── */}
        <section className="py-14 px-5 sm:px-8 max-w-4xl mx-auto">
          <div className="text-center mb-8">
            <span className="badge-subtle mb-3">Questions &amp; Answers</span>
            <h2 className="text-[24px] sm:text-[32px] font-bold tracking-tight text-[var(--text-primary)]">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-xs">
            {FAQS.map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={faq.question}
                  className="border-b border-[var(--border-subtle)] last:border-b-0"
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-5 sm:px-6 py-4 text-left flex items-center justify-between gap-4 cursor-pointer select-none transition-colors hover:bg-[var(--bg-surface-hover)]"
                    aria-expanded={isOpen}
                  >
                    <span className="text-[14px] sm:text-[15px] font-semibold text-[var(--text-primary)] leading-snug">
                      {faq.question}
                    </span>
                    <Plus
                      className={`w-4 h-4 text-[var(--text-tertiary)] shrink-0 transition-transform duration-200 ${
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
                        <div className="px-5 sm:px-6 pb-4.5 pt-0.5 text-[13.5px] text-[var(--text-secondary)] leading-relaxed">
                          {faq.answer}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Final Call to Action ── */}
        <section className="py-16 px-5 sm:px-8 max-w-4xl mx-auto text-center border-t border-[var(--border-subtle)]">
          <h2 className="text-[28px] sm:text-[38px] font-bold tracking-tight text-[var(--text-primary)]">
            Ready to upgrade your text actions?
          </h2>
          <p className="mt-3 text-[15px] sm:text-[17px] text-[var(--text-secondary)] max-w-lg mx-auto">
            Download OpenClip for free and experience the native floating action bar for macOS.
          </p>

          <div className="mt-7 flex flex-row items-center justify-center gap-3">
            <a
              href="/download"
              onClick={(e) => {
                e.preventDefault();
                downloadLatestDmg();
              }}
              className="h-[44px] px-6 rounded-full bg-[var(--text-primary)] text-[var(--bg-app)] hover:opacity-90 active:scale-[0.98] font-semibold text-[14px] shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer select-none"
            >
              <AppleIcon className="w-4 h-4 -mt-0.5" />
              <span>Download for macOS</span>
            </a>

            <Link
              href="/extensions"
              className="h-[44px] px-5 rounded-full bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] active:scale-[0.98] text-[13.5px] font-medium text-[var(--text-primary)] flex items-center justify-center gap-1.5 border border-[var(--border-subtle)] transition-all cursor-pointer select-none shadow-2xs"
            >
              <Blocks className="w-4 h-4 text-[var(--accent)]" />
              <span>Browse Extensions</span>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
