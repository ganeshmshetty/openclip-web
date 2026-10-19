'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Copy,
  Scissors,
  ClipboardPaste,
  CaseUpper,
  Calculator,
  Sparkles,
  Search,
  BookOpen,
  Code,
  Command,
  X,
  Check,
} from 'lucide-react';

interface Position {
  x: number;
  y: number;
  placement: 'top' | 'bottom';
}

const FUN_PASTE_PHRASES = [
  'Pasted text',
  'Hello World',
  'Swift 6',
  'Instant action',
  'Native power',
  'Zero latency',
  'OpenClip live',
  'Pure speed',
  'Context magic',
  'AppKit UI',
];

const DICTIONARY_ENTRIES: Record<string, { pos: string; def: string; example: string }> = {
  openclip: {
    pos: 'noun · macOS utility',
    def: 'A native floating action engine for macOS that turns highlighted text into instant actions, AI prompts, and scripts.',
    example: 'OpenClip appears seamlessly without polluting the system clipboard.',
  },
  swift: {
    pos: 'noun · programming language',
    def: 'A modern, safe, and fast language developed by Apple for building native macOS and iOS applications.',
    example: 'OpenClip is written in Swift 6 with strict concurrency.',
  },
  action: {
    pos: 'noun · computing',
    def: 'A discrete, executable operation triggered on selected text (transforms, AI, scripts, URL templates).',
    example: 'Select an expression to evaluate actions instantly.',
  },
  macos: {
    pos: 'noun · operating system',
    def: 'Apple desktop operating system featuring high-performance AppKit and Accessibility APIs.',
    example: 'OpenClip runs natively on macOS 14+ Sonoma and Sequoia.',
  },
  ai: {
    pos: 'noun · artificial intelligence',
    def: 'On-device Apple Intelligence, Ollama, or Cloud LLMs executed inline without switching windows.',
    example: 'Stream grammar fixes directly into a native floating card.',
  },
};

const PALETTE_ACTIONS = [
  { id: 'search', label: 'Search', icon: Search, shortcut: '⌘G' },
  { id: 'copy', label: 'Copy', icon: Copy, shortcut: '⌘C' },
  { id: 'cut', label: 'Cut', icon: Scissors, shortcut: '⌘X' },
  { id: 'paste', label: 'Paste', icon: ClipboardPaste, shortcut: '⌘V' },
  { id: 'ai-grammar', label: 'Proofread', icon: Sparkles, badge: 'AI', shortcut: '⌘↵' },
  { id: 'ai-rewrite', label: 'Rewrite', icon: Sparkles, badge: 'AI', shortcut: '⌥⌘R' },
  { id: 'case-title', label: 'Title Case', icon: CaseUpper, shortcut: '⇧T' },
  { id: 'case-upper', label: 'Upper Case', icon: CaseUpper, shortcut: '⇧U' },
  { id: 'case-lower', label: 'Lower Case', icon: CaseUpper, shortcut: '⇧L' },
  { id: 'case-camel', label: 'Camel Case', icon: CaseUpper, shortcut: '⇧C' },
  { id: 'calc', label: 'Evaluate Math', icon: Calculator, shortcut: '↵' },
  { id: 'format-json', label: 'Format JSON', icon: Code, badge: 'DEV', shortcut: '⌥F' },
  { id: 'define', label: 'Define Word', icon: BookOpen, shortcut: '⌃D' },
  { id: 'ai-summary', label: 'Summarize Text', icon: Sparkles, badge: 'AI', shortcut: '⌥⌘S' },
  { id: 'ai-explain', label: 'Explain Concept', icon: Sparkles, badge: 'AI', shortcut: '⌥⌘E' },
];

function evaluateMath(text: string): string | null {
  const cleaned = text.replace(/×/g, '*').replace(/÷/g, '/').replace(/,/g, '').trim();
  if (!/^[\d\s+\-*/%().]+$/.test(cleaned) || !/\d/.test(cleaned)) {
    return null;
  }
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`'use strict'; return (${cleaned})`)();
    if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
      return String(Math.round(result * 10000) / 10000);
    }
  } catch {
    return null;
  }
  return null;
}

export default function TextSelectionPopup() {
  const [selectedText, setSelectedText] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [visible, setVisible] = useState(false);
  const [toast, setToast] = useState<{ message: string; key: number } | null>(null);
  
  // Popup modes: 'bar' | 'ai' | 'palette' | 'define'
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const [aiState, setAiState] = useState<'idle' | 'processing' | 'result'>('idle');
  const [aiTitle, setAiTitle] = useState('Apple Intelligence');
  const [aiResult, setAiResult] = useState('');
  const [aiTyped, setAiTyped] = useState('');

  const [defineWord, setDefineWord] = useState<{ word: string; pos: string; def: string; example: string } | null>(null);

  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const savedRangeRef = useRef<Range | null>(null);
  const toastTimer = useRef<number | null>(null);
  const caseCycle = useRef<number>(0);

  const showToast = (message: string) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ message, key: Date.now() });
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
    }, 1300);
  };

  const handleSelection = () => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.rangeCount) {
        if (!paletteOpen && aiState === 'idle' && !defineWord) {
          setVisible(false);
        }
        return;
      }

      const text = selection.toString().trim();
      // Keep selection within reasonable bounds (ignore single characters or full-page selections)
      const MAX_SELECTION_CHARS = 220;
      if (!text || text.length < 2 || text.length > MAX_SELECTION_CHARS) {
        if (!paletteOpen && aiState === 'idle' && !defineWord) {
          setVisible(false);
        }
        return;
      }

      // Check if selection is inside our popup container
      const anchorNode = selection.anchorNode;
      if (anchorNode && popupRef.current && popupRef.current.contains(anchorNode)) {
        return;
      }

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      // Ignore empty rects or giant multi-paragraph / full page blocks
      if (rect.width === 0 || rect.height === 0 || rect.height > 200) {
        if (!paletteOpen && aiState === 'idle' && !defineWord) {
          setVisible(false);
        }
        return;
      }

      // Save a cloned Range so button clicks don't lose the selection position
      savedRangeRef.current = range.cloneRange();

      const popupWidth = 280;
      let x = rect.left + rect.width / 2;
      let y = rect.top - 10;
      let placement: 'top' | 'bottom' = 'top';

      x = Math.max(popupWidth / 2 + 12, Math.min(window.innerWidth - popupWidth / 2 - 12, x));

      if (rect.top < 70) {
        y = rect.bottom + 10;
        placement = 'bottom';
      }

      setSelectedText(text);
      setPosition({ x, y, placement });
      setVisible(true);
    }, 20);
  };

  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (popupRef.current && popupRef.current.contains(e.target as Node)) return;
      handleSelection();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setVisible(false);
        setPaletteOpen(false);
        setAiState('idle');
        setDefineWord(null);
        return;
      }
      if (popupRef.current && popupRef.current.contains(e.target as Node)) return;
      handleSelection();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (popupRef.current && popupRef.current.contains(e.target as Node)) return;
      setVisible(false);
      setPaletteOpen(false);
      setAiState('idle');
      setDefineWord(null);
    };

    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', onMouseDown);

    return () => {
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [visible, paletteOpen, aiState, defineWord]);

  // AI Typewriter effect
  useEffect(() => {
    if (aiState !== 'result') return;
    setAiTyped('');
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setAiTyped(aiResult.slice(0, i));
      if (i >= aiResult.length) window.clearInterval(id);
    }, 14);
    return () => window.clearInterval(id);
  }, [aiState, aiResult]);

  // Focus palette input
  useEffect(() => {
    if (paletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [paletteOpen]);

  if (!visible || !position) return null;

  const mathValue = evaluateMath(selectedText);

  // Core helper to temporarily replace selected text in the DOM and restore after 3.5s
  const replaceRangeInDOM = (newText: string, toastLabel: string, isStrikeThrough = false) => {
    const range = savedRangeRef.current;
    if (!range) {
      showToast(toastLabel);
      return;
    }

    try {
      const originalFragment = range.cloneContents();
      const wrapper = document.createElement('span');

      if (isStrikeThrough) {
        wrapper.className = 'opacity-30 line-through transition-all duration-300';
        wrapper.appendChild(originalFragment);
      } else {
        wrapper.className = 'text-[var(--accent)] font-semibold transition-all duration-300 px-1 rounded bg-[var(--accent-soft)]';
        wrapper.textContent = newText;
      }

      range.deleteContents();
      range.insertNode(wrapper);

      // Clear browser selection
      window.getSelection()?.removeAllRanges();
      showToast(toastLabel);

      // Restore original content cleanly after 3.5 seconds
      setTimeout(() => {
        if (wrapper.parentNode) {
          if (isStrikeThrough) {
            const restoredFrag = document.createDocumentFragment();
            while (wrapper.firstChild) restoredFrag.appendChild(wrapper.firstChild);
            wrapper.parentNode.replaceChild(restoredFrag, wrapper);
          } else {
            wrapper.parentNode.replaceChild(originalFragment, wrapper);
          }
        }
      }, 3500);
    } catch {
      showToast(toastLabel);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
      showToast('Copied ✓');
    } catch {
      showToast('Copied ✓');
    }
  };

  const handleCut = () => {
    try {
      navigator.clipboard.writeText(selectedText);
    } catch {}
    replaceRangeInDOM(selectedText, 'Cut ✓', true);
  };

  const handlePaste = () => {
    const phrase = FUN_PASTE_PHRASES[Math.floor(Math.random() * FUN_PASTE_PHRASES.length)];
    replaceRangeInDOM(phrase, 'Pasted ✓');
  };

  const handleCaseTransform = (targetType?: 'title' | 'upper' | 'lower' | 'camel') => {
    let transformed = selectedText;
    let label = 'Title Case';

    if (targetType === 'upper') {
      transformed = selectedText.toUpperCase();
      label = 'UPPERCASE';
    } else if (targetType === 'lower') {
      transformed = selectedText.toLowerCase();
      label = 'lowercase';
    } else if (targetType === 'camel') {
      transformed = selectedText
        .toLowerCase()
        .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
      label = 'camelCase';
    } else if (targetType === 'title') {
      transformed = selectedText.replace(/\b\w/g, (c) => c.toUpperCase());
      label = 'Title Case';
    } else {
      // Cycle through cases
      caseCycle.current = (caseCycle.current + 1) % 4;
      if (caseCycle.current === 0) {
        transformed = selectedText.toUpperCase();
        label = 'UPPERCASE';
      } else if (caseCycle.current === 1) {
        transformed = selectedText.toLowerCase();
        label = 'lowercase';
      } else if (caseCycle.current === 2) {
        transformed = selectedText.replace(/\b\w/g, (c) => c.toUpperCase());
        label = 'Title Case';
      } else {
        transformed = selectedText
          .toLowerCase()
          .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase());
        label = 'camelCase';
      }
    }

    replaceRangeInDOM(transformed, `${label} ✓`);
  };

  const handleCalculate = () => {
    const val = mathValue || String(Math.floor(Math.random() * 900 + 100));
    replaceRangeInDOM(`= ${val}`, `= ${val} ✓`);
  };

  const handleFormatJSON = () => {
    try {
      const parsed = JSON.parse(selectedText.trim());
      const formatted = JSON.stringify(parsed, null, 2);
      replaceRangeInDOM(formatted, 'JSON Formatted ✓');
    } catch {
      replaceRangeInDOM(`{"format": "clean"}`, 'JSON Formatted ✓');
    }
  };

  const handleDefine = () => {
    setPaletteOpen(false);
    setAiState('idle');
    const cleanWord = selectedText.toLowerCase().replace(/[^a-z]/g, '');
    const entry = DICTIONARY_ENTRIES[cleanWord] || {
      pos: 'noun · definition',
      def: `Selected term "${selectedText}". OpenClip extracts live semantics directly via macOS Accessibility APIs.`,
      example: 'Executed seamlessly with zero clipboard interference.',
    };

    setDefineWord({
      word: selectedText.length > 25 ? `${selectedText.slice(0, 22)}…` : selectedText,
      pos: entry.pos,
      def: entry.def,
      example: entry.example,
    });
  };

  const handleRunAI = (promptType: 'grammar' | 'rewrite' | 'summary' | 'explain' = 'grammar') => {
    setPaletteOpen(false);
    setDefineWord(null);
    setAiState('processing');

    let title = 'Apple Intelligence';
    let simulated = '';

    if (promptType === 'rewrite') {
      title = 'AI · Rewrite';
      simulated = `Rewritten: ${selectedText.charAt(0).toUpperCase() + selectedText.slice(1).replace(/\s+/g, ' ').trim()}`;
    } else if (promptType === 'summary') {
      title = 'AI · Summary';
      const summaries = [
        `TL;DR: "${selectedText.slice(0, 50)}…" — Core action executed on-device with zero cloud telemetry.`,
        `Summary: Highlights immediate contextual productivity actions on macOS with sub-5ms latency.`,
        `Key takeaway: Instant text execution engine engineered for power users and developers.`,
      ];
      simulated = summaries[Math.floor(Math.random() * summaries.length)];
    } else if (promptType === 'explain') {
      title = 'AI · Explain';
      simulated = `"${selectedText}" refers to an active text segment. In OpenClip, this is monitored non-destructively through AXUIElement attributes without polling the clipboard.`;
    } else {
      title = 'AI · Fix Grammar';
      const fixes = [
        selectedText.charAt(0).toUpperCase() + selectedText.slice(1) + (selectedText.endsWith('.') ? '' : '.'),
        `Refined: "${selectedText.charAt(0).toUpperCase() + selectedText.slice(1)}" with enhanced clarity and active voice.`,
        `Polished: ${selectedText.replace(/\b(teh|macbook|swift)\b/gi, (m) => m === 'teh' ? 'the' : m.toUpperCase())}.`,
      ];
      simulated = fixes[Math.floor(Math.random() * fixes.length)];
    }

    setAiTitle(title);
    setAiResult(simulated);

    setTimeout(() => {
      setAiState('result');
    }, 900);
  };

  const filteredPalette = PALETTE_ACTIONS.filter((a) =>
    a.label.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const runPaletteItem = (id: string) => {
    setPaletteOpen(false);
    setSearchQuery('');
    if (id === 'copy') handleCopy();
    else if (id === 'cut') handleCut();
    else if (id === 'paste') handlePaste();
    else if (id === 'search') {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(selectedText)}`, '_blank');
      showToast('Searching Google ✓');
    }
    else if (id === 'case-title') handleCaseTransform('title');
    else if (id === 'case-upper') handleCaseTransform('upper');
    else if (id === 'case-lower') handleCaseTransform('lower');
    else if (id === 'case-camel') handleCaseTransform('camel');
    else if (id === 'calc') handleCalculate();
    else if (id === 'format-json') handleFormatJSON();
    else if (id === 'define') handleDefine();
    else if (id === 'ai-grammar') handleRunAI('grammar');
    else if (id === 'ai-rewrite') handleRunAI('rewrite');
    else if (id === 'ai-summary') handleRunAI('summary');
    else if (id === 'ai-explain') handleRunAI('explain');
  };

  return (
    <div
      ref={popupRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: `translate(-50%, ${position.placement === 'top' ? '-100%' : '0'})`,
        zIndex: 9999,
      }}
      className="select-none animate-in fade-in zoom-in-95 duration-150"
      onMouseDown={(e) => {
        // Prevent clicking inside the popup from clearing the active text selection
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {/* Toast feedback floating above popup */}
      {toast && (
        <div className="mac-feedback-pill absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap z-50 pointer-events-none">
          <span className="badge-accent shadow-sm flex items-center gap-1.5 px-2.5 py-0.5 text-[11px]">
            <Check className="w-3 h-3 text-[var(--accent)]" />
            <span>{toast.message}</span>
          </span>
        </div>
      )}

      {/* Main HUD Pill — matches native macOS OpenClip popup */}
      <div
        className={`popup-pill glass-surface flex items-center transition-all ${
          aiState === 'processing' ? 'mac-glow-ring' : ''
        }`}
      >
        {/* Search palette */}
        <button
          onClick={() => {
            setDefineWord(null);
            setAiState('idle');
            setPaletteOpen(!paletteOpen);
          }}
          className="popup-btn-icon"
          title="Search all actions"
          aria-label="Search all actions"
        >
          <Search className="w-[15px] h-[15px]" />
        </button>

        <span className="popup-divider" />

        {/* Copy */}
        <button
          onClick={handleCopy}
          className="popup-btn-text"
          title="Copy (⌘C)"
          aria-label="Copy"
        >
          <span>Copy</span>
        </button>

        <span className="popup-divider" />

        {/* Cut */}
        <button
          onClick={handleCut}
          className="popup-btn-text"
          title="Cut (⌘X)"
          aria-label="Cut"
        >
          <span>Cut</span>
        </button>

        <span className="popup-divider" />

        {/* Paste */}
        <button
          onClick={handlePaste}
          className="popup-btn-text"
          title="Paste Text (⌘V)"
          aria-label="Paste Text"
        >
          <span>Paste</span>
        </button>

        <span className="popup-divider" />

        {/* AI Action */}
        <button
          onClick={() => handleRunAI('grammar')}
          className={`popup-btn-icon group ${
            aiState === 'processing' ? 'popup-btn-icon-active' : ''
          }`}
          title="AI Tools (⌘↵)"
          aria-label="AI Tools"
        >
          <Sparkles
            className={`w-[14px] h-[14px] transition-colors ${
              aiState === 'processing'
                ? 'text-white animate-spin'
                : 'text-[var(--accent)] group-hover:text-white'
            }`}
          />
        </button>

        <span className="popup-divider" />

        {/* Command palette */}
        <button
          onClick={() => {
            setDefineWord(null);
            setAiState('idle');
            setPaletteOpen(!paletteOpen);
          }}
          className={`popup-btn-icon ${paletteOpen ? 'popup-btn-icon-active' : ''}`}
          title="Open command palette (⌘K)"
          aria-label="Open command palette"
        >
          <Command className="w-[14px] h-[14px]" />
        </button>
      </div>

      {/* Spotlight-Style Search Overlay */}
      {paletteOpen && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[320px] max-w-[92vw] bg-[var(--bg-elevated)] border border-[var(--border-strong)] shadow-2xl rounded-xl z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden backdrop-blur-2xl">
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <Search className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
            <input
              ref={inputRef}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setPaletteOpen(false);
                }
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  if (filteredPalette.length) setSelectedIndex((i) => (i + 1) % filteredPalette.length);
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  if (filteredPalette.length) setSelectedIndex((i) => (i - 1 + filteredPalette.length) % filteredPalette.length);
                }
                if (e.key === 'Enter' && filteredPalette[selectedIndex]) {
                  e.preventDefault();
                  runPaletteItem(filteredPalette[selectedIndex].id);
                }
              }}
              placeholder="Search all actions…"
              className="popup-search-input flex-1 min-w-0 bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none shadow-none"
              spellCheck={false}
              autoFocus
            />
            <button
              onClick={() => setPaletteOpen(false)}
              className="mac-keycap text-[9.5px] cursor-pointer hover:bg-[var(--bg-surface-hover)] transition-colors"
              title="Close (Escape)"
            >
              esc
            </button>
          </div>

          <div className="max-h-[220px] overflow-y-auto p-1.5 space-y-0.5">
            {filteredPalette.length === 0 && (
              <p className="px-3 py-4 text-[12px] text-[var(--text-tertiary)] text-center">
                No matching actions
              </p>
            )}
            {filteredPalette.map(({ id, label, icon: Icon, shortcut, badge }, i) => {
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={id}
                  onClick={() => runPaletteItem(id)}
                  onMouseEnter={() => setSelectedIndex(i)}
                  className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--accent)] text-white'
                      : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-white' : 'text-[var(--text-secondary)]'}`} />
                    <span className="text-[12.5px] font-medium truncate">{label}</span>
                    {badge && (
                      <span
                        className={`text-[9px] font-semibold px-1 py-0.2 rounded font-mono ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        }`}
                      >
                        {badge}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {shortcut && (
                      <span
                        className={`text-[10.5px] font-mono ${
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

      {/* Quick Define Word Popover Card */}
      {defineWord && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[310px] max-w-[92vw] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-2xl rounded-xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[13px] font-bold text-[var(--text-primary)] capitalize">
                {defineWord.word}
              </span>
            </div>
            <button
              onClick={() => setDefineWord(null)}
              className="w-5 h-5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-[11px] font-mono text-[var(--text-tertiary)] italic mb-1.5">
            {defineWord.pos}
          </p>

          <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12.5px] leading-relaxed text-[var(--text-primary)] mb-2">
            {defineWord.def}
          </div>

          <p className="text-[11px] text-[var(--text-secondary)] italic px-1">
            "{defineWord.example}"
          </p>

          <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-[var(--border-subtle)]">
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(`${defineWord.word}: ${defineWord.def}`);
                showToast('Definition Copied ✓');
                setDefineWord(null);
              }}
              className="px-2.5 py-1 text-[11.5px] font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
            >
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </button>
            <button
              onClick={() => setDefineWord(null)}
              className="px-3 py-1 text-[11.5px] font-medium rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Check className="w-3 h-3" />
              <span>Done</span>
            </button>
          </div>
        </div>
      )}

      {/* AI Result Floating Card */}
      {aiState === 'result' && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-[320px] max-w-[92vw] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] shadow-2xl rounded-xl p-3.5 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-[var(--border-subtle)]">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" />
              <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                {aiTitle}
              </span>
              <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-surface)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)]">
                On-device
              </span>
            </div>
            <button
              onClick={() => setAiState('idle')}
              className="w-5 h-5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] flex items-center justify-center transition-colors"
              aria-label="Close"
              title="Close"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12.5px] leading-relaxed text-[var(--text-primary)] min-h-[60px] select-text">
            {aiTyped}
            <span className="inline-block w-[1.5px] h-[13px] ml-0.5 bg-[var(--accent)] align-middle animate-pulse" />
          </div>

          <div className="flex items-center justify-end gap-2 mt-3 pt-2 border-t border-[var(--border-subtle)]">
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(aiResult);
                showToast('Result Copied ✓');
                setAiState('idle');
              }}
              className="px-2.5 py-1 text-[11.5px] font-medium rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 transition-colors"
            >
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </button>
            <button
              onClick={() => {
                replaceRangeInDOM(aiResult, 'Result Applied ✓');
                setAiState('idle');
                setVisible(false);
              }}
              className="px-3 py-1 text-[11.5px] font-medium rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Check className="w-3 h-3" />
              <span>Use Result</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
