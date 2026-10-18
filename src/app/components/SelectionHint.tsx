'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Calculator,
  CaseUpper,
  Copy,
  Check,
  Search,
  Command,
  X,
  FileText,
  Code2,
  CornerDownLeft,
} from 'lucide-react';

interface TabItem {
  id: 'notes' | 'math' | 'code';
  title: string;
  tabLabel: string;
  subLabel: string;
  fileType: string;
  icon: typeof FileText;
}

const TABS: TabItem[] = [
  {
    id: 'notes',
    title: 'AI Tools',
    tabLabel: 'AI Tools',
    subLabel: 'Spelling & rewrite',
    fileType: 'Markdown',
    icon: Sparkles,
  },
  {
    id: 'math',
    title: 'Sprint Budget',
    tabLabel: 'Instant Math',
    subLabel: 'Inline evaluation',
    fileType: 'Calculation',
    icon: Calculator,
  },
  {
    id: 'code',
    title: 'Engine Config',
    tabLabel: 'Code & Case',
    subLabel: 'Format & transform',
    fileType: 'Swift 6',
    icon: Code2,
  },
];

export default function SelectionHint() {
  const [activeTab, setActiveTab] = useState<'notes' | 'math' | 'code'>('notes');
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [caseIndex, setCaseIndex] = useState(0);
  const [aiStreaming, setAiStreaming] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiText, setAiText] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [mathSolved, setMathSolved] = useState(false);
  const [hasUserSelection, setHasUserSelection] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const CASE_VARIANTS = ['openclip_engine', 'openClipEngine', 'OPENCLIP_ENGINE', 'OpenclipEngine', 'openclip-engine'];

  // Auto-cycle tabs frequently (every 3.5s) unless user is interacting/hovering
  useEffect(() => {
    if (aiOpen || hasUserSelection || isHovered) return;
    const timer = setInterval(() => {
      setActiveTab((prev) => {
        if (prev === 'notes') return 'math';
        if (prev === 'math') return 'code';
        return 'notes';
      });
      setIsFixed(false);
      setAiOpen(false);
      setAiText('');
      setMathSolved(false);
    }, 3500);
    return () => clearInterval(timer);
  }, [aiOpen, hasUserSelection, isHovered]);

  // Listen to document selection to avoid double-popup collision
  useEffect(() => {
    const checkSelection = () => {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.toString().trim().length > 1) {
        setHasUserSelection(true);
      } else {
        setHasUserSelection(false);
      }
    };

    document.addEventListener('selectionchange', checkSelection);
    return () => document.removeEventListener('selectionchange', checkSelection);
  }, []);

  const triggerFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 1600);
  };

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeTab === 'notes') {
      setAiOpen(true);
      setAiStreaming(true);
      setAiText('');
      const target = 'lightweight popup';
      let idx = 0;
      const interval = setInterval(() => {
        idx += 1;
        setAiText(target.slice(0, idx));
        if (idx >= target.length) {
          clearInterval(interval);
          setAiStreaming(false);
        }
      }, 30);
    } else if (activeTab === 'math') {
      setMathSolved(!mathSolved);
      triggerFeedback(mathSolved ? 'Reverted' : 'Calculated: 1,620 ✓');
    } else if (activeTab === 'code') {
      const nextIdx = (caseIndex + 1) % CASE_VARIANTS.length;
      setCaseIndex(nextIdx);
      triggerFeedback(`Transformed: ${CASE_VARIANTS[nextIdx]} ✓`);
    }
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const textToCopy =
      activeTab === 'code'
        ? CASE_VARIANTS[caseIndex]
        : activeTab === 'math'
        ? (mathSolved ? '1,620' : '15 * 80 + 420')
        : (isFixed ? 'lightweight popup' : 'ligthweight popuup');

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      triggerFeedback('Copied to clipboard ✓');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      triggerFeedback('Copied ✓');
    }
  };

  const renderTabContent = () => {
    if (activeTab === 'notes') {
      const currentSnippet = isFixed ? 'lightweight popup' : 'ligthweight popuup';
      return (
        <div>
          <span>Fixed rendering of </span>
          <span className="relative inline-block my-0.5">
            <span
              className={`px-2 py-0.5 rounded-[5px] font-semibold cursor-text transition-colors shadow-xs ${
                isFixed
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/25 underline decoration-wavy decoration-red-500/60 underline-offset-4'
              }`}
            >
              {currentSnippet}
            </span>

            {/* Floating Action HUD with Caret Pointer */}
            {!hasUserSelection && !aiOpen && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-auto select-none animate-in fade-in zoom-in-95 duration-150">
                <div className="popup-pill flex items-center shadow-2xl cursor-default">
                  <button
                    onClick={handleActionClick}
                    className="popup-btn-text flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer group"
                    title="Fix spelling with Apple Intelligence"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] group-hover:text-white transition-colors" />
                    <span className="font-medium">Fix Spelling</span>
                    <kbd className="hidden sm:inline-flex items-center text-[9.5px] opacity-70 bg-black/10 dark:bg-white/15 group-hover:bg-white/25 px-1 py-0.2 rounded ml-0.5 font-mono">
                      ⌘↵
                    </kbd>
                  </button>
                  <span className="popup-divider" />
                  <button
                    onClick={handleCopy}
                    className="popup-btn-text flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors cursor-pointer"
                    title="Copy (⌘C)"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-80" />}
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                  <span className="popup-divider" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerFeedback('Command palette (⌥⌘C) ✓');
                    }}
                    className="popup-btn-icon transition-colors cursor-pointer"
                    title="Command Palette (⌥⌘C)"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Downward pointing triangle caret */}
                <div className="popup-caret" />
              </div>
            )}

            {/* Apple Intelligence In-Place Suggestion Pill */}
            {aiOpen && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-auto select-none animate-in fade-in zoom-in-95 duration-150">
                <div className="popup-pill flex items-stretch h-[34px] shadow-2xl cursor-default whitespace-nowrap overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 whitespace-nowrap">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 animate-pulse" />
                    <span className="text-[12px] font-semibold text-[var(--text-primary)] font-mono whitespace-nowrap">
                      {aiText || 'lightweight popup'}
                      {aiStreaming && (
                        <span className="inline-block w-1.5 h-3 ml-0.5 bg-[var(--accent)] align-middle animate-pulse" />
                      )}
                    </span>
                  </div>

                  <span className="popup-divider" />

                  <button
                    onClick={() => {
                      setIsFixed(true);
                      setAiOpen(false);
                      triggerFeedback('Spelling corrected ✓');
                    }}
                    className="popup-btn-text flex items-center gap-1 px-3 text-[12px] font-semibold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors cursor-pointer whitespace-nowrap !opacity-100"
                    title="Apply correction (↵)"
                  >
                    <span>Apply Fix</span>
                    <CornerDownLeft className="w-3 h-3 ml-0.5" />
                  </button>

                  <span className="popup-divider" />

                  <button
                    onClick={() => setAiOpen(false)}
                    className="popup-btn-icon flex items-center justify-center px-2 text-[var(--text-tertiary)] hover:text-white transition-colors cursor-pointer"
                    title="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Downward pointing triangle caret */}
                <div className="popup-caret" />
              </div>
            )}
          </span>
          <span> in macOS without clipboard pollution.</span>
        </div>
      );
    }

    if (activeTab === 'math') {
      return (
        <div>
          <span>Compute capacity: </span>
          <span className="relative inline-block my-0.5">
            <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-[5px] font-semibold cursor-text transition-colors shadow-xs">
              {mathSolved ? '= 1,620' : '15 * 80 + 420'}
            </span>

            {!hasUserSelection && (
              <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-auto select-none animate-in fade-in zoom-in-95 duration-150">
                <div className="popup-pill flex items-center shadow-2xl cursor-default">
                  <button
                    onClick={handleActionClick}
                    className="popup-btn-text flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer group"
                    title="Calculate expression"
                  >
                    <Calculator className="w-3.5 h-3.5 text-[var(--accent)] group-hover:text-white transition-colors" />
                    <span className="font-medium">{mathSolved ? 'Revert' : '= 1,620'}</span>
                    <kbd className="hidden sm:inline-flex items-center text-[9.5px] opacity-70 bg-black/10 dark:bg-white/15 group-hover:bg-white/25 px-1 py-0.2 rounded ml-0.5 font-mono">
                      ↵
                    </kbd>
                  </button>
                  <span className="popup-divider" />
                  <button
                    onClick={handleCopy}
                    className="popup-btn-text flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors cursor-pointer"
                    title="Copy result"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-80" />}
                    <span className="hidden sm:inline">Copy</span>
                  </button>
                  <span className="popup-divider" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerFeedback('Search (⌥⌘C) ✓');
                    }}
                    className="popup-btn-icon transition-colors cursor-pointer"
                    title="Search actions"
                  >
                    <Search className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="popup-caret" />
              </div>
            )}
          </span>
          <span> units.</span>
        </div>
      );
    }

    // Code Tab
    return (
      <div>
        <span className="text-purple-600 dark:text-purple-400 font-semibold">let</span>{' '}
        <span className="text-[var(--text-primary)]">identifier = </span>
        <span className="relative inline-block my-0.5">
          <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-[5px] font-semibold cursor-text transition-colors shadow-xs">
            "{CASE_VARIANTS[caseIndex]}"
          </span>

          {!hasUserSelection && (
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-auto select-none animate-in fade-in zoom-in-95 duration-150">
              <div className="popup-pill flex items-center shadow-2xl cursor-default">
                <button
                  onClick={handleActionClick}
                  className="popup-btn-text flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors cursor-pointer group"
                  title="Cycle case transformation"
                >
                  <CaseUpper className="w-3.5 h-3.5 text-[var(--accent)] group-hover:text-white transition-colors" />
                  <span className="font-medium">Transform Case</span>
                  <kbd className="hidden sm:inline-flex items-center text-[9.5px] opacity-70 bg-black/10 dark:bg-white/15 group-hover:bg-white/25 px-1 py-0.2 rounded ml-0.5 font-mono">
                    ⇧T
                  </kbd>
                </button>
                <span className="popup-divider" />
                <button
                  onClick={handleCopy}
                  className="popup-btn-text flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] transition-colors cursor-pointer"
                  title="Copy identifier"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 opacity-80" />}
                  <span className="hidden sm:inline">Copy</span>
                </button>
                <span className="popup-divider" />
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    triggerFeedback('Command palette (⌥⌘C) ✓');
                  }}
                  className="popup-btn-icon transition-colors cursor-pointer"
                  title="Command Palette (⌥⌘C)"
                >
                  <Command className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="popup-caret" />
            </div>
          )}
        </span>
      </div>
    );
  };

  return (
    <div
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full max-w-[540px] mx-auto flex flex-col items-center"
    >
      {/* Centered Segmented Control Styled Exactly Like Navbar */}
      <div className="flex justify-center mb-5">
        <div
          onPointerEnter={() => setIsHovered(true)}
          onPointerLeave={() => setIsHovered(false)}
          className="nav-pill inline-flex items-stretch h-[34px] overflow-hidden shadow-md max-w-full"
        >
          {TABS.map((tab, idx) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <React.Fragment key={tab.id}>
                {idx > 0 && <span className="nav-divider" />}
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setIsFixed(false);
                    setAiOpen(false);
                    setAiText('');
                    setMathSolved(false);
                    setIsHovered(true);
                  }}
                  className={`relative nav-btn-text flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-4 text-[12px] sm:text-[12.5px] cursor-pointer transition-colors !rounded-none ${
                    isActive ? 'nav-btn-text-active' : ''
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.tabLabel}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* ── Native macOS Window Stage with Ambient Glow ── */}
      <div className="w-full relative">
        {/* Soft ambient background glow */}
        <div className="absolute inset-0 -top-6 -bottom-6 max-w-md mx-auto bg-gradient-to-tr from-blue-500/10 via-purple-500/8 to-emerald-500/6 blur-3xl -z-10 rounded-full pointer-events-none opacity-70 dark:opacity-40" />

        <div className="w-full mac-window !overflow-visible border border-black/[0.1] dark:border-white/[0.14] shadow-[0_24px_70px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_24px_70px_-12px_rgba(0,0,0,0.7)] rounded-[14px] bg-[#fafafc] dark:bg-[#0d0d10] relative transition-all duration-300">
          {/* Traffic Lights directly in top-left */}
          <div className="absolute top-3.5 left-4 sm:top-4 sm:left-4.5 flex items-center gap-2 select-none z-10">
            <span className="w-3 h-3 rounded-full bg-[#ff5f57] border border-black/10 shadow-xs inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#febc2e] border border-black/10 shadow-xs inline-block" />
            <span className="w-3 h-3 rounded-full bg-[#28c840] border border-black/10 shadow-xs inline-block" />
          </div>

          {/* Window Editor Body with Centered Content & Precise Baseline Alignment */}
          <div
            ref={editorRef}
            className="relative px-5 pt-11 pb-6 sm:px-7 sm:pt-13 sm:pb-7 transition-all duration-300 rounded-[14px] font-mono text-left select-text flex flex-col justify-center min-h-[160px] sm:min-h-[175px]"
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-baseline gap-3 sm:gap-4 pt-3 pb-1"
              >
                <span className="hidden sm:inline-block text-[11.5px] text-[var(--text-tertiary)] select-none opacity-30 font-mono shrink-0 tabular-nums">
                  01
                </span>
                <div className="flex-1 font-mono text-[13.5px] sm:text-[14px] leading-[1.75] tracking-tight select-text text-[var(--text-secondary)]">
                  {renderTabContent()}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

