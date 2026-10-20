'use client';

import React, { useMemo, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { Search, FileText } from 'lucide-react';
import { allDocs, searchDocs, loadSearchCorpus } from '../registryMeta';

type Props = {
  searchQuery: string;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  searchCorpus: Record<string, string>;
  setSearchCorpus: Dispatch<SetStateAction<Record<string, string>>>;
  selectedIndex: number;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  selectDoc: (id: string) => void;
  onClose: () => void;
};

export default function DocsSearch({ searchQuery, setSearchQuery, searchCorpus, setSearchCorpus, selectedIndex, setSelectedIndex, selectDoc, onClose }: Props) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when modal opens
  useEffect(() => {
    const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => clearTimeout(timer);
  }, []);

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
  }, [searchQuery, searchCorpus, setSearchCorpus]);

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

  return (
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
            onClick={() => onClose()}
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
  );
}
