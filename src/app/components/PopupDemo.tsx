'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Copy,
  Scissors,
  ClipboardPaste,
  CaseUpper,
  Calculator,
  Sparkles,
  Command,
  Search,
  Globe,
  BookOpen,
  X,
  Check,
} from 'lucide-react';

type Phase = 'idle' | 'processing' | 'result';

const ACTION_CELLS = [
  { icon: Copy, label: 'Copy' },
  { icon: Scissors, label: 'Cut' },
  { icon: ClipboardPaste, label: 'Paste' },
  { icon: CaseUpper, label: 'Uppercase' },
  { icon: Calculator, label: 'Calculate' },
];

const PALETTE_ACTIONS = [
  { icon: Copy, label: 'Copy Text', shortcut: '⌘C' },
  { icon: Scissors, label: 'Cut Text', shortcut: '⌘X' },
  { icon: ClipboardPaste, label: 'Paste Magic', shortcut: '⌘V' },
  { icon: CaseUpper, label: 'Title Case', shortcut: '⇧T' },
  { icon: Calculator, label: 'Evaluate Math', shortcut: '↵' },
  { icon: BookOpen, label: 'Quick Define', shortcut: '⌃D' },
  { icon: Sparkles, label: 'Fix Grammar', badge: 'AI', shortcut: '⌘↵' },
  { icon: Sparkles, label: 'Summarize Text', badge: 'AI', shortcut: '⌥⌘S' },
];

const RANDOM_AI_RESULTS = [
  'Highlight any text on macOS. Run instant actions in milliseconds — zero setup, zero overhead.',
  'OpenClip runs on-device using native Swift 6 and Apple Intelligence with sub-5ms latency.',
  'Transform text, evaluate math expressions, and trigger custom scripts without switching apps.',
];

export default function PopupDemo() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [typed, setTyped] = useState('');
  const [resultText, setResultText] = useState(RANDOM_AI_RESULTS[0]);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const timers = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Typewriter for the AI result card
  useEffect(() => {
    if (phase !== 'result') return;
    setTyped('');
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(resultText.slice(0, i));
      if (i >= resultText.length) window.clearInterval(id);
    }, 16);
    return () => window.clearInterval(id);
  }, [phase, resultText]);

  // Focus search input when palette opens
  useEffect(() => {
    if (paletteOpen) inputRef.current?.focus();
  }, [paletteOpen]);

  const filteredActions = PALETTE_ACTIONS.filter((a) =>
    a.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  const showFlash = (text: string) => {
    setFlash({ text, key: Date.now() });
    const id = window.setTimeout(() => {
      setFlash(null);
      timers.current = timers.current.filter((t) => t !== id);
    }, 1100);
    timers.current.push(id);
  };

  const runAI = () => {
    if (phase !== 'idle') return;
    const chosen = RANDOM_AI_RESULTS[Math.floor(Math.random() * RANDOM_AI_RESULTS.length)];
    setResultText(chosen);
    setPhase('processing');
    const id = window.setTimeout(() => {
      setPhase('result');
      timers.current = timers.current.filter((t) => t !== id);
    }, 1100);
    timers.current.push(id);
  };

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(resultText);
      showFlash('Copied to Clipboard ✓');
    } catch {
      showFlash('Copy Failed');
    }
  };

  const togglePalette = () => {
    setPaletteOpen((open) => !open);
    setQuery('');
    setSelectedIndex(0);
  };

  // Global ⌘K
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const runPaletteAction = (label: string) => {
    showFlash(label);
    setPaletteOpen(false);
    setQuery('');
    setSelectedIndex(0);
  };

  const handlePaletteKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (query) {
        setQuery('');
      } else {
        setPaletteOpen(false);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (filteredActions.length) setSelectedIndex((i) => (i + 1) % filteredActions.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (filteredActions.length) {
        setSelectedIndex((i) => (i - 1 + filteredActions.length) % filteredActions.length);
      }
      return;
    }
    if (e.key === 'Enter' && filteredActions[selectedIndex]) {
      runPaletteAction(filteredActions[selectedIndex].label);
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        {/* Flash Toast feedback */}
        {flash && (
          <div
            key={flash.key}
            className="mac-feedback-pill absolute -top-10 left-1/2 -translate-x-1/2 whitespace-nowrap z-30"
          >
            <span className="badge-accent shadow-sm flex items-center gap-1.5 px-3 py-1">
              <Check className="w-3 h-3 text-[var(--accent)]" />
              <span>{flash.text}</span>
            </span>
          </div>
        )}

        {/* Floating Action HUD */}
        <div className="relative">
          <div
            className={`mac-hud p-1 transition-all duration-300 ${
              phase === 'processing' ? 'ai-active-glow' : ''
            }`}
          >
            <div className="flex items-center gap-0.5">
              {ACTION_CELLS.map(({ icon: Icon, label }) => (
                <button
                  key={label}
                  onClick={() => showFlash(`${label} Executed`)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] active:scale-95 transition-all duration-150"
                  aria-label={label}
                  title={label}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}

              {/* AI Trigger Cell */}
              <div className="h-4 w-px bg-[var(--border-subtle)] mx-1" />
              <button
                onClick={runAI}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 active:scale-95 ${
                  phase === 'processing'
                    ? 'bg-[var(--accent)] text-white'
                    : 'text-[var(--accent)] hover:bg-[var(--accent-soft)]'
                }`}
                aria-label="AI Actions"
                title="Run AI Actions"
              >
                <Sparkles className="w-4 h-4" />
              </button>

              {/* ⌘ Search Palette Trigger */}
              <button
                onClick={togglePalette}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all duration-150 active:scale-95 ${
                  paletteOpen
                    ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                    : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
                aria-label="Search all actions"
                title="Search all actions (⌘K)"
              >
                <Command className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Spotlight-Style Search Overlay */}
          {paletteOpen && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-[340px] max-w-[90vw] z-30 mac-window shadow-2xl animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-2.5 px-3.5 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <Search className="w-4 h-4 text-[var(--accent)] shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={handlePaletteKeyDown}
                  placeholder="Search actions or type a prompt..."
                  className="popup-search-input flex-1 min-w-0 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none shadow-none"
                  spellCheck={false}
                />
                <button
                  onClick={() => setPaletteOpen(false)}
                  className="mac-keycap text-[10px] cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  esc
                </button>
              </div>

              <div className="max-h-[180px] overflow-y-auto p-1.5 bg-[var(--bg-elevated)] space-y-0.5">
                {filteredActions.length === 0 && (
                  <p className="px-3 py-3 text-[12.5px] text-[var(--text-tertiary)] text-center">
                    No matching actions found
                  </p>
                )}
                {filteredActions.map(({ icon: Icon, label, badge, shortcut }, i) => {
                  const isSelected = i === selectedIndex;
                  return (
                    <button
                      key={label}
                      onClick={() => runPaletteAction(label)}
                      onMouseEnter={() => setSelectedIndex(i)}
                      className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left transition-colors ${
                        isSelected
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-[var(--text-secondary)]'}`} />
                        <span className="text-[13px] font-medium truncate">{label}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {badge && (
                          <span
                            className={`text-[9.5px] font-semibold uppercase px-1.5 py-0.5 rounded ${
                              isSelected ? 'bg-white/20 text-white' : 'badge-accent'
                            }`}
                          >
                            {badge}
                          </span>
                        )}
                        {shortcut && (
                          <span
                            className={`text-[11px] font-mono ${
                              isSelected ? 'text-white/80' : 'text-[var(--text-tertiary)]'
                            }`}
                          >
                            {shortcut}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* AI Result Card - macOS Floating Window style */}
        {phase === 'result' && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 w-[340px] max-w-[92vw] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-2xl rounded-xl p-4 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                  Apple Intelligence
                </span>
                <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                  On-device
                </span>
              </div>
              <button
                onClick={() => setPhase('idle')}
                className="w-5 h-5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[13px] leading-relaxed text-[var(--text-primary)] min-h-[70px]">
              {typed}
              <span className="inline-block w-[1.5px] h-[13px] ml-0.5 bg-[var(--accent)] align-middle animate-pulse" />
            </div>

            <div className="flex items-center justify-end gap-2 mt-3 pt-2.5 border-t border-[var(--border-subtle)]">
              <button
                onClick={copyResult}
                className="px-2.5 py-1 text-[11.5px] font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
              <button
                onClick={() => {
                  showFlash('Replaced in App ✓');
                  setPhase('idle');
                }}
                className="px-3 py-1 text-[11.5px] font-medium rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Check className="w-3 h-3" />
                <span>Replace</span>
              </button>
            </div>
          </div>
        )}

        {phase === 'processing' && (
          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-10">
            <span className="badge-subtle text-[11px] text-[var(--accent)] font-medium">
              Generating with Apple Intelligence…
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
