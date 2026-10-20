'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '../../app/components/Navbar';
import Footer from '../../app/components/Footer';
import {
  docCategories,
  allDocs,
  getDocById,
  getAdjacentDocs,
  searchDocs,
  loadSearchCorpus,
} from '../registryMeta';
import { DocItem } from '../types';
import { MarkdownRenderer } from './MarkdownRenderer';
import {
  Search,
  ChevronRight,
  ChevronDown,
  Check,
  Compass,
  Code2,
  Cpu,
  Layers,
  ArrowLeft,
  ArrowRight,
  Menu,
  X,
  BookOpen,
  ExternalLink,
  FileCode,
  ArrowUp,
  FileText,
  Sparkles,
  Loader2,
  List,
} from 'lucide-react';

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  'user-guide': <Compass className="w-4 h-4 text-[var(--text-tertiary)]" />,
  'extension-authoring': <Code2 className="w-4 h-4 text-[var(--text-tertiary)]" />,
  runtimes: <Cpu className="w-4 h-4 text-[var(--text-tertiary)]" />,
  architecture: <Layers className="w-4 h-4 text-[var(--text-tertiary)]" />,
};

export default function DocsView({ docId, content }: { docId: string; content?: string }) {
  const router = useRouter();
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchCorpus, setSearchCorpus] = useState<Record<string, string>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    'user-guide': true,
    'extension-authoring': true,
    runtimes: true,
    architecture: true,
  });
  const [copiedRawMarkdown, setCopiedRawMarkdown] = useState(false);
  const [copyingPrompt, setCopyingPrompt] = useState(false);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeDoc: DocItem = useMemo(() => {
    return getDocById(docId) || allDocs[0];
  }, [docId]);

  const adjacent = useMemo(() => {
    return getAdjacentDocs(activeDoc.id);
  }, [activeDoc.id]);

  const selectDoc = (id: string) => {
    const slug = getDocById(id)?.slug ?? id;
    setSidebarOpen(false);
    setSearchModalOpen(false);
    setSearchQuery('');
    router.push(`/docs/${slug}`);
  };

  const toggleCategory = (catId: string) => {
    setOpenCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  // Keyboard shortcut listener for ⌘K or /
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSelectedIndex(0);
        setSearchModalOpen((prev) => !prev);
      } else if (e.key === '/' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setSelectedIndex(0);
        setSearchModalOpen(true);
      } else if (e.key === 'Escape') {
        setSearchModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Focus search input when modal opens
  useEffect(() => {
    if (searchModalOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [searchModalOpen]);

  // Scroll spy for headings
  useEffect(() => {
    const handleScroll = () => {
      const headings = activeDoc.headings;
      if (!headings || headings.length === 0) return;

      const scrollPos = window.scrollY + 140;
      let current = headings[0].id;

      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.offsetTop <= scrollPos) {
          current = h.id;
        }
      }

      setActiveHeadingId(current);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeDoc]);

  // Filtered docs for search modal
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return allDocs.slice(0, 8);
    return searchDocs(searchQuery, searchCorpus).slice(0, 10);
  }, [searchQuery, searchCorpus]);

  // Full-text search text is a separate asset, fetched the first time the user searches.
  useEffect(() => {
    if (!searchQuery.trim() || Object.keys(searchCorpus).length > 0) return;
    let cancelled = false;
    loadSearchCorpus().then((corpus) => {
      if (!cancelled) setSearchCorpus(corpus);
    });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, searchCorpus]);

  // Handle keyboard navigation in search modal
  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, searchResults.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + searchResults.length) % Math.max(1, searchResults.length));
    } else if (e.key === 'Enter' && searchResults[selectedIndex]) {
      e.preventDefault();
      selectDoc(searchResults[selectedIndex].id);
    }
  };

  const copyRawMarkdown = async () => {
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedRawMarkdown(true);
      setTimeout(() => setCopiedRawMarkdown(false), 2000);
    } catch {}
  };

  const copyAgentPrompt = async () => {
    if (copyingPrompt) return;
    setCopyingPrompt(true);
    try {
      let promptText = '';

      // 1. Client-side fetch from static public asset (/agent-prompt.txt)
      // This is served statically from the CDN with zero Vercel server execution or rate limits
      try {
        const res = await fetch('/agent-prompt.txt');
        if (res.ok) {
          promptText = await res.text();
        }
      } catch {
        // Fallback to client-side GitHub fetch
      }

      // 2. Client-side fetch from GitHub raw if static file failed
      // Executed directly in user's browser, completely avoiding Vercel server IP rate limits
      if (!promptText) {
        try {
          const res = await fetch('https://raw.githubusercontent.com/ganeshmshetty/openclip-extensions/main/AGENTS.md');
          if (res.ok) {
            const rawSpec = await res.text();
            promptText = `# Instructions for AI Agent: Authoring OpenClip Extensions\n\nYou are an expert developer assistant specialized in creating extensions for OpenClip.\nOpenClip is a native macOS floating-popup utility (Swift 6, macOS 14+, AppKit + SwiftUI) that turns selected text into instant actions.\n\n## Context & Objectives\nWhen asked to author or modify an OpenClip extension, you will generate or update a complete extension package:\n1. openclip.json (the extension manifest file specifying actions, options, triggers, and effects).\n2. Accompanying executable scripts (run.js, script.sh, script.py, run.applescript, etc.) if needed.\n3. Proper permissions, icons, and localized labels.\n\n## Authoritative Specification\nAdhere strictly to the OpenClip Extension Manifest Specification below. Do NOT hallucinate keys, enum values, or effect types.\n\n---\n\n` + rawSpec;
          }
        } catch {
          // Fallback to active document
        }
      }

      // 3. Fallback: if manifest-spec doc is in active or loaded docs, format from that
      if (!promptText) {
        const fallbackContent = content;
        if (fallbackContent) {
          promptText = `# Instructions for AI Agent: Authoring OpenClip Extensions\n\nYou are an expert developer assistant specialized in creating extensions for OpenClip.\nOpenClip is a native macOS floating-popup utility (Swift 6, macOS 14+, AppKit + SwiftUI) that turns selected text into instant actions.\n\n## Context & Objectives\nWhen asked to author or modify an OpenClip extension, you will generate or update a complete extension package:\n1. openclip.json (the extension manifest file specifying actions, options, triggers, and effects).\n2. Accompanying executable scripts (run.js, script.sh, script.py, run.applescript, etc.) if needed.\n3. Proper permissions, icons, and localized labels.\n\n## Authoritative Specification\nAdhere strictly to the OpenClip Extension Manifest Specification below. Do NOT hallucinate keys, enum values, or effect types.\n\n---\n\n` + fallbackContent;
        }
      }

      if (promptText) {
        await navigator.clipboard.writeText(promptText);
        setCopiedPrompt(true);
        setTimeout(() => setCopiedPrompt(false), 2000);
      }
    } catch (err) {
      console.error('Failed to copy agent prompt:', err);
    } finally {
      setCopyingPrompt(false);
    }
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const githubSourceUrl = activeDoc.sourcePath
    ? `https://github.com/ganeshmshetty/openclip/blob/main/${activeDoc.sourcePath}`
    : 'https://github.com/ganeshmshetty/openclip';

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)] selection:bg-[var(--accent-soft)] selection:text-[var(--accent)]">
      <Navbar />

      {/* Main Documentation Area */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 sm:pt-14">
        {/* Mobile Header bar */}
        <div className="lg:hidden flex items-center justify-between p-3 mb-6 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors cursor-pointer"
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            <span>{sidebarOpen ? 'Close Menu' : 'Documentation Menu'}</span>
          </button>
          <button
            onClick={() => { setSelectedIndex(0); setSearchModalOpen(true); }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--bg-tertiary)] text-[12px] text-[var(--text-secondary)] font-mono border border-[var(--border-subtle)] cursor-pointer"
          >
            <Search className="w-3 h-3" />
            <span>Search</span>
          </button>
        </div>

        {/* Mobile Drawer Backdrop */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="flex gap-7 xl:gap-9 items-start">
          {/* Left Sidebar Navigation */}
          <aside
            className={`shrink-0 z-50 lg:z-0 ${
              sidebarOpen
                ? 'fixed inset-y-0 left-0 w-[85%] max-w-[320px] p-6 bg-[var(--bg-surface)] border-r border-[var(--border-subtle)] shadow-2xl overflow-y-auto block'
                : 'hidden lg:block w-60 lg:sticky lg:top-28'
            }`}
          >
            <div className="space-y-4">
              {/* Mobile Drawer Close Header */}
              {sidebarOpen && (
                <div className="lg:hidden flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                  <span className="font-semibold text-[14px] text-[var(--text-primary)]">Documentation Menu</span>
                  <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] transition-colors cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Quick Search Trigger */}
              <button
                onClick={() => { setSelectedIndex(0); setSearchModalOpen(true); }}
                className="w-full flex items-center justify-between px-3 py-2 text-[13px] bg-[var(--bg-tertiary)] lg:bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-xl text-[var(--text-secondary)] transition-all shadow-xs group cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
                  <span>Search docs...</span>
                </div>
                <div className="flex items-center gap-1 font-mono text-[10.5px] bg-[var(--bg-tertiary)] px-1.5 py-0.5 rounded border border-[var(--border-subtle)] text-[var(--text-tertiary)]">
                  <span>⌘</span>
                  <span>K</span>
                </div>
              </button>

              {/* Category Tree Navigation */}
              <nav className="space-y-4 max-h-[calc(100vh-170px)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden pr-1 pb-8">
                {docCategories.map((category) => {
                  const isOpen = openCategories[category.id] ?? true;
                  const hasActiveDoc = category.items.some((item) => item.id === activeDoc.id || item.slug === activeDoc.slug);

                  return (
                    <div key={category.id} className="space-y-1">
                      <button
                        onClick={() => toggleCategory(category.id)}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 text-[12.5px] font-semibold rounded-lg transition-colors ${
                          hasActiveDoc ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        } hover:bg-[var(--bg-surface-hover)]`}
                      >
                        <div className="flex items-center gap-2">
                          {CATEGORY_ICONS[category.id] || <BookOpen className="w-3.5 h-3.5" />}
                          <span className="tracking-tight">{category.name}</span>
                        </div>
                        {isOpen ? (
                          <ChevronDown className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        )}
                      </button>

                      {isOpen && (
                        <div className="pl-3.5 space-y-0.5 border-l border-[var(--border-subtle)] ml-3 mt-1">
                          {category.items.map((item) => {
                            const isActive = item.id === activeDoc.id || item.slug === activeDoc.slug;
                            return (
                              <button
                                key={item.id}
                                onClick={() => selectDoc(item.id)}
                                className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] transition-all flex items-center justify-between ${
                                  isActive
                                    ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-medium'
                                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                                }`}
                              >
                                <span className="whitespace-normal leading-5">{item.title}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Central Article Container */}
          <article className="flex-1 min-w-0 max-w-[75ch] py-2 sm:py-3">
            {/* Top Action Bar */}
            <div className="flex items-center justify-between gap-3 pb-2">
              {/* Category Pill on left */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[var(--text-tertiary)]">
                  {CATEGORY_ICONS[activeDoc.categorySlug] || <Compass className="w-3.5 h-3.5 text-[var(--accent)]" />}
                  <span>{activeDoc.category}</span>
                </span>
              </div>

              {/* Secondary Actions on right */}
              <div className="flex items-center gap-5">
                {content && (
                  <button
                    onClick={copyRawMarkdown}
                    className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                    title="Copy full page markdown text"
                  >
                    {copiedRawMarkdown ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-500 font-medium">Copied MD</span>
                      </>
                    ) : (
                      <>
                        <FileCode className="w-3.5 h-3.5" />
                        <span>Copy MD</span>
                      </>
                    )}
                  </button>
                )}
                <a
                  href={githubSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  title="View original Markdown file on GitHub"
                >
                  <span>View source</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                </a>
              </div>
            </div>

            {/* Doc Title & Lead Paragraph */}
            <header className="space-y-2.5 pt-6 pb-4">
              <h1 className="text-[28px] sm:text-[34px] font-extrabold text-[var(--text-primary)] tracking-tight leading-tight">
                {activeDoc.title}
              </h1>
              {activeDoc.description && (
                <p className="text-[15px] sm:text-[16px] text-[var(--text-secondary)] leading-relaxed max-w-3xl">
                  {activeDoc.description}
                </p>
              )}
            </header>

            {/* Mobile On-This-Page TOC Accordion */}
            {activeDoc.headings && activeDoc.headings.length > 0 && (
              <details className="xl:hidden my-4 p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[13px] group shadow-xs">
                <summary className="flex items-center justify-between font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer list-none select-none">
                  <span className="flex items-center gap-2">
                    <List className="w-4 h-4 text-[var(--accent)]" />
                    <span>On this page ({activeDoc.headings.length} sections)</span>
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 group-open:rotate-180 transition-transform text-[var(--text-tertiary)]" />
                </summary>
                <nav className="mt-3 pt-3 border-t border-[var(--border-subtle)] space-y-1">
                  {activeDoc.headings.map((h) => {
                    const isActive = activeHeadingId === h.id;
                    return (
                      <a
                        key={h.id}
                        href={`#${h.id}`}
                        className={`block text-[12.5px] transition-all leading-5 py-1 rounded px-2 ${
                          h.level === 3 ? 'ml-3 text-[11.5px]' : ''
                        } ${
                          isActive
                            ? 'text-[var(--accent)] font-medium'
                            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                      >
                        {h.title}
                      </a>
                    );
                  })}
                </nav>

                <div className="mt-3">
                {activeDoc.categorySlug === 'extension-authoring' && (
                      <button
                        onClick={copyAgentPrompt}
                        disabled={copyingPrompt}
                        className="flex items-center gap-1.5 text-[var(--accent)] hover:underline font-medium text-left cursor-pointer disabled:opacity-60 pt-1"
                      >
                        {copyingPrompt ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span>Copying prompt...</span>
                          </>
                        ) : copiedPrompt ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                            <span className="text-emerald-500 font-medium">Copied prompt!</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5 shrink-0" />
                            <span>Copy Agent Prompt</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
              </details>
            )}

            {/* Markdown Content Area */}
            <div className="py-6">
              {content ? <MarkdownRenderer content={content} /> : null}
            </div>

            {/* Bottom Next / Prev Navigation Cards */}
            <nav className="mt-14 pt-8 border-t border-[var(--border-subtle)] grid grid-cols-1 sm:grid-cols-2 gap-4">
              {adjacent.prev ? (
                <button
                  onClick={() => selectDoc(adjacent.prev!.id)}
                  className="flex flex-col items-start gap-1 p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-all shadow-xs group text-left"
                >
                  <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider group-hover:text-[var(--accent)] transition-colors">
                    <ArrowLeft className="w-3 h-3 group-hover:-translate-x-0.5 transition-transform" /> Previous
                  </span>
                  <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate max-w-full">
                    {adjacent.prev.title}
                  </span>
                </button>
              ) : (
                <div />
              )}

              {adjacent.next ? (
                <button
                  onClick={() => selectDoc(adjacent.next!.id)}
                  className="flex flex-col items-end gap-1 p-4 rounded-xl border border-[var(--border-subtle)] hover:border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] transition-all shadow-xs group text-right sm:ml-auto w-full"
                >
                  <span className="flex items-center gap-1 text-[11px] text-[var(--text-tertiary)] uppercase font-mono tracking-wider group-hover:text-[var(--accent)] transition-colors">
                    Next <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                  <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate max-w-full">
                    {adjacent.next.title}
                  </span>
                </button>
              ) : (
                <div />
              )}
            </nav>

            {/* GitHub Feedback row */}
            <div className="mt-8 pt-4 flex items-center justify-between text-[12.5px] text-[var(--text-tertiary)]">
              <a
                href="https://github.com/ganeshmshetty/openclip/issues/new"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1"
              >
                <span>Found a typo or issue? Report on GitHub</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={scrollToTop}
                className="hover:text-[var(--text-primary)] transition-colors inline-flex items-center gap-1 font-mono text-[11.5px]"
              >
                <span>Scroll to top</span>
                <ArrowUp className="w-3 h-3" />
              </button>
            </div>
          </article>

          {/* Right Sidebar: Table of Contents & Sticky Outline */}
          <aside className="hidden xl:block w-44 shrink-0 sticky top-28 max-h-[calc(100vh-140px)] overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden py-2 pl-4 border-l border-[var(--border-subtle)]">
            <p className="text-[12.5px] font-medium text-[var(--text-primary)] mb-3">
              On this page
            </p>
            {activeDoc.headings && activeDoc.headings.length > 0 ? (
              <nav className="space-y-1">
                {activeDoc.headings.map((h) => {
                  const isActive = activeHeadingId === h.id;
                  return (
                    <a
                      key={h.id}
                      href={`#${h.id}`}
                      className={`block text-[12.5px] transition-all leading-5 py-1 rounded px-2 ${
                        h.level === 3 ? 'ml-3 text-[11.5px]' : ''
                      } ${
                        isActive
                          ? 'text-[var(--accent)] font-medium'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      {h.title}
                    </a>
                  );
                })}
              </nav>
            ) : (
              <p className="text-[12px] text-[var(--text-tertiary)] italic">
                No sections
              </p>
            )}

            {/* AI Agent Prompt exclusively for developers on Extension Authoring docs */}
            {activeDoc.categorySlug === 'extension-authoring' && (
              <div className="mt-5 pt-4 border-t border-[var(--border-subtle)] space-y-1.5">
                <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                  Authoring with AI?
                </p>
                <p className="text-[11.5px] text-[var(--text-tertiary)] leading-relaxed">
                  Copy manifest prompt for Cursor, Claude, or ChatGPT.
                </p>
                <button
                  onClick={copyAgentPrompt}
                  disabled={copyingPrompt}
                  className="pt-1 flex items-center gap-1.5 text-[var(--accent)] hover:underline font-medium text-left text-[12px] cursor-pointer disabled:opacity-60"
                  title="Copy extension authoring prompt for AI agents"
                >
                  {copyingPrompt ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                      <span>Copying prompt...</span>
                    </>
                  ) : copiedPrompt ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-emerald-500 font-medium">Copied prompt!</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5 shrink-0" />
                      <span>Copy Agent Prompt</span>
                    </>
                  )}
                </button>
              </div>
            )}

          </aside>
        </div>
      </div>

      {/* Global ⌘K Search Modal */}
      {searchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-28 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div
            className="w-full max-w-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Search Input Bar */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[var(--border-subtle)] bg-[var(--bg-tertiary)]/50">
              <Search className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Search documentation, guides, and runtimes..."
                className="flex-1 bg-transparent text-[14px] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
              />
              <button
                onClick={() => setSearchModalOpen(false)}
                className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                ESC
              </button>
            </div>

            {/* Search Results List */}
            <div className="max-h-[380px] overflow-y-auto p-2 space-y-1">
              {searchResults.length > 0 ? (
                searchResults.map((result, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={result.id}
                      onClick={() => selectDoc(result.id)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full text-left p-3 rounded-xl transition-all flex items-start justify-between gap-3 ${
                        isSelected
                          ? 'bg-[var(--accent-soft)] border border-[var(--accent-border)]'
                          : 'hover:bg-[var(--bg-surface-hover)] border border-transparent'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <FileText className={`w-3.5 h-3.5 ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-tertiary)]'}`} />
                          <span className={`text-[13.5px] font-semibold truncate ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                            {result.title}
                          </span>
                        </div>
                        <p className="text-[12px] text-[var(--text-secondary)] line-clamp-1">
                          {result.description}
                        </p>
                      </div>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border border-[var(--border-subtle)] shrink-0">
                        {result.category}
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="py-12 text-center text-[13px] text-[var(--text-tertiary)]">
                  No matching documentation found for &ldquo;{searchQuery}&rdquo;
                </div>
              )}
            </div>

            {/* Footer keyboard hints */}
            <div className="px-4 py-2 bg-[var(--bg-tertiary)]/50 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] text-[var(--text-tertiary)] font-mono">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">↑</kbd>
                  <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">↓</kbd>
                  <span>navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)]">↵</kbd>
                  <span>select</span>
                </span>
              </div>
              <span>OpenClip Docs</span>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
