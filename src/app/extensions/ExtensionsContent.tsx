'use client';

import { useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import {
  Search,
  Download,
  Check,
  PackageOpen,
  Blocks,
  Flame,
  Clock,
  X,
  Plus,
  BadgeCheck,
  GitPullRequest,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'motion/react';
import ExtensionIcon from '../components/ExtensionIcon';
import { type ExtensionItem, CURATED_FEATURED_IDS } from '@/lib/extensions';

interface Props {
  extensions: ExtensionItem[];
  featuredIDs?: string[];
}

type StoreFilter = 'all' | 'popular' | 'new';

function releasedAt(ext: ExtensionItem): number {
  const t = ext.publishedAt ? Date.parse(ext.publishedAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

// Stable first-added time. Falls back to `publishedAt` for snapshots from before `addedAt` existed.
function addedTime(ext: ExtensionItem): number {
  const t = ext.addedAt ? Date.parse(ext.addedAt) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

// Newest first. Compares parsed timestamps rather than the raw ISO strings,
// whose mixed timezone offsets made localeCompare non-chronological.
function byNewest(a: ExtensionItem, b: ExtensionItem): number {
  const dateDiff = releasedAt(b) - releasedAt(a);
  if (dateDiff !== 0) return dateDiff;
  return (b.version || '').localeCompare(a.version || '', undefined, { numeric: true });
}

// Newest added first (stable first-publish date), for the New list.
function byAddedNewest(a: ExtensionItem, b: ExtensionItem): number {
  const dateDiff = addedTime(b) - addedTime(a);
  if (dateDiff !== 0) return dateDiff;
  return (b.version || '').localeCompare(a.version || '', undefined, { numeric: true });
}

// How long an extension stays "New" after it was first added. Mirrors the app's
// `ExtensionsStoreViewModel.newWindowDays`; keep the two in sync.
const NEW_WINDOW_DAYS = 14;

// Floor for the New list: even during a quiet period the newest `MIN_NEW_COUNT` added extensions are
// shown, so the tab never goes empty. Mirrors the app's `minimumNewCount`.
const MIN_NEW_COUNT = 12;

// An extension is "new" while it is within the window of when it was first *added*. Keyed on the
// stable `addedAt`, not the version: an update must not drop a genuinely new extension out of New,
// and `publishedAt` (last release) must not revive an old one. Snapshots without `addedAt` fall back
// to the first-release heuristic. Drives the row badge (freshly added only).
function isNewRelease(ext: ExtensionItem): boolean {
  if (ext.addedAt) {
    return Date.now() - addedTime(ext) <= NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  }
  return !ext.version || ext.version === '1.0.0';
}

// The New list: everything added within the window, topped up to `MIN_NEW_COUNT` with the
// next-most-recently-added so a quiet catalogue still shows the latest additions. Never empty while
// the catalogue has items.
function newSelection(exts: ExtensionItem[]): ExtensionItem[] {
  const sorted = [...exts].sort(byAddedNewest);
  const windowed = sorted.filter(isNewRelease);
  return windowed.length >= MIN_NEW_COUNT ? windowed : sorted.slice(0, MIN_NEW_COUNT);
}

interface RowProps {
  ext: ExtensionItem;
  triggered?: boolean;
  onInstall: (ext: ExtensionItem) => void;
  index: number;
  isFeatured?: boolean;
  isRecent?: boolean;
}

function ExtensionRow({
  ext,
  triggered,
  onInstall,
  index,
  isFeatured: isExtFeatured = false,
  isRecent = false,
}: RowProps) {
  const isVersionUpdate = Boolean(ext.version && ext.version !== '1.0.0');

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.015, 0.12), ease: [0.16, 1, 0.3, 1] }}
      className="group relative bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs transition-colors duration-150"
    >
      {/* Left: Icon + Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <ExtensionIcon
          id={ext.id}
          name={ext.name}
          iconURL={ext.iconURL}
          size={32}
          className="rounded-lg group-hover:scale-105 transition-transform shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/extensions/${ext.id}`}
              className="text-[13.5px] font-semibold text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors truncate leading-tight"
            >
              {ext.name}
            </Link>
            {isExtFeatured && (
              <span
                title="Featured Extension"
                className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent)]/12 text-[var(--accent)] tracking-wide inline-flex items-center gap-1"
              >
                <BadgeCheck className="w-3 h-3" />
                Featured
              </span>
            )}
            {!isExtFeatured && isNewRelease(ext) && (
              <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 tracking-wide">
                New
              </span>
            )}
            {!isExtFeatured && isRecent && isVersionUpdate && (
              <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 tracking-wide">
                Updated
              </span>
            )}
            <span className="text-[11px] text-[var(--text-tertiary)] truncate">
              by {ext.author}
            </span>
          </div>

          <p className="text-[12px] text-[var(--text-secondary)] line-clamp-1 mt-0.5 leading-normal">
            {ext.description}
          </p>
        </div>
      </div>

      {/* Right: Meta & Actions */}
      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--border-subtle)]">
        <span className="font-mono text-[11px] text-[var(--text-tertiary)] tabular-nums flex items-center gap-1">
          <Download className="w-3 h-3 opacity-60" />
          {ext.downloadCount.toLocaleString()}
        </span>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onInstall(ext)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11.5px] font-medium transition-all active:scale-[0.98] cursor-pointer ${
              triggered
                ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white shadow-2xs'
            }`}
          >
            {triggered ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Opening…</span>
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                <span>Install</span>
              </>
            )}
          </button>

          <a
            href={ext.downloadURL}
            target="_blank"
            rel="noopener noreferrer"
            title="Download raw extension file (.openclipext)"
            download
            className="p-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

export default function ExtensionsContent({ extensions, featuredIDs }: Props) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StoreFilter>('all');
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({});

  const effectiveFeaturedIDs = useMemo(() => {
    return featuredIDs && featuredIDs.length > 0 ? featuredIDs : CURATED_FEATURED_IDS;
  }, [featuredIDs]);

  const featuredIDSet = useMemo(() => {
    return new Set(effectiveFeaturedIDs.map((id) => id.toLowerCase()));
  }, [effectiveFeaturedIDs]);

  // 1. Featured showcase items (curated featured recommendations)
  const featuredSectionItems = useMemo(() => {
    const byID = new Map(extensions.map((e) => [e.id.toLowerCase(), e]));
    return effectiveFeaturedIDs
      .map((id) => byID.get(id.toLowerCase()))
      .filter((e): e is ExtensionItem => Boolean(e))
      .slice(0, 6);
  }, [extensions, effectiveFeaturedIDs]);

  // 2. New showcase items — the New selection (window with the floor), newest added first. An update
  // never removes one, and a quiet catalogue is topped up so the section is never empty. Featured
  // items are intentionally NOT excluded here, matching the New tab; dedup against all-list happens
  // below.
  const newShowcaseItems = useMemo(() => newSelection(extensions), [extensions]);

  const newSectionItems = useMemo(() => newShowcaseItems.slice(0, 4), [newShowcaseItems]);

  // 3. Remaining All Items (deduplicating Featured + New showcase items)
  const remainingAllSectionItems = useMemo(() => {
    const showcasedIDs = new Set([
      ...featuredSectionItems.map((e) => e.id.toLowerCase()),
      ...newSectionItems.map((e) => e.id.toLowerCase()),
    ]);
    return extensions.filter((e) => !showcasedIDs.has(e.id.toLowerCase()));
  }, [extensions, featuredSectionItems, newSectionItems]);

  // Popular Filter Tab: Real extensions sorted by downloads descending
  const popularFilterItems = useMemo(() => {
    return extensions
      .filter((e) => (e.downloadCount || 0) > 0)
      .sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
  }, [extensions]);

  // New Filter Tab: every first-release (1.0.0) extension, newest first; falls back to the most
  // recent extensions when nothing is on its first release. No cap — the count shown is the real
  // number of new extensions, matching the app's New page (which uses the same rule).
  const newFilterItems = useMemo(() => newShowcaseItems, [newShowcaseItems]);

  // Version-agnostic recency rank that drives the New/Updated chips on rows in
  // every list. The New tab itself filters to first releases, but an updated
  // extension should still be flagged as "Updated" in All/Popular.
  const recentIDSet = useMemo(() => {
    return new Set(
      extensions.slice().sort(byNewest).slice(0, 10).map((e) => e.id.toLowerCase())
    );
  }, [extensions]);

  // Search Results
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return extensions.filter(
      (ext) =>
        ext.name.toLowerCase().includes(q) ||
        ext.description.toLowerCase().includes(q) ||
        ext.author.toLowerCase().includes(q)
    );
  }, [search, extensions]);

  const isSearching = Boolean(search.trim());

  const handleInstall = (ext: ExtensionItem) => {
    const url = `openclip://install?id=${encodeURIComponent(ext.id)}&name=${encodeURIComponent(ext.name)}&url=${encodeURIComponent(ext.downloadURL)}`;
    window.location.assign(url);
    setInstalledMap((prev) => ({ ...prev, [ext.id]: true }));
    setTimeout(() => {
      setInstalledMap((prev) => ({ ...prev, [ext.id]: false }));
    }, 3000);
  };

  const handleSelectFilter = (nextFilter: StoreFilter) => {
    if (isSearching) {
      setSearch('');
    }
    setFilter(nextFilter);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-5 sm:px-8 py-16 sm:py-24 w-full">
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mb-10 sm:mb-12 text-center flex flex-col items-center"
        >
          <img
            src="/icons/store-icon.png"
            alt="The Clip Store"
            width={96}
            height={96}
            className="w-20 h-20 sm:w-24 sm:h-24 drop-shadow-[0_8px_20px_rgba(0,0,0,0.12)] select-none pointer-events-none"
          />
          <h1 className="mt-5 text-3xl sm:text-4xl font-bold tracking-tight text-[var(--text-primary)]">
            The Clip Store
          </h1>
          <p className="mt-2 text-[14px] sm:text-[14.5px] text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
            Every clip installs natively into OpenClip without restarting.
          </p>
        </motion.div>

        {/* Toolbar: Search + Filter Pills (aligned with native macOS app) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none" />
            <input
              type="text"
              placeholder="Search clips by name, author, or action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-[13.5px] placeholder:text-[var(--text-tertiary)] shadow-2xs focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
            />
            {isSearching && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md hover:bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Native macOS style Store Filter Pills (All / Popular / New) */}
            <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl w-fit shadow-2xs">
              <button
                onClick={() => handleSelectFilter('all')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
                  filter === 'all' && !isSearching
                    ? 'bg-[var(--accent)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <span>All</span>
              </button>
              <button
                onClick={() => handleSelectFilter('popular')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
                  filter === 'popular' && !isSearching
                    ? 'bg-[var(--accent)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Popular</span>
              </button>
              <button
                onClick={() => handleSelectFilter('new')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all cursor-pointer ${
                  filter === 'new' && !isSearching
                    ? 'bg-[var(--accent)] text-white shadow-2xs'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>New</span>
              </button>
            </div>

            {/* Submit-your-extension link, merged into the toolbar so it needs no band of its own */}
            <a
              href="https://github.com/ganeshmshetty/openclip-extensions"
              target="_blank"
              rel="noopener noreferrer"
              title="Submit your extension to the open repository"
              className="group ml-auto inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-[12.5px] font-medium text-[var(--text-primary)] shadow-2xs hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)] active:scale-[0.98] transition-all whitespace-nowrap"
            >
              <GitPullRequest className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
              <span className="hidden sm:inline">Submit an extension</span>
              <span className="sm:hidden">Submit</span>
              <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-[var(--text-tertiary)] group-hover:text-[var(--text-primary)] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
            </a>
          </div>
        </motion.div>

        {/* Empty State */}
        {isSearching && searchResults.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl flex flex-col items-center justify-center py-16 text-center shadow-2xs">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center mb-4 text-[var(--accent)]">
              <PackageOpen className="w-6 h-6" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">No extensions found</h3>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
              Try adjusting your search terms or clearing the filter.
            </p>
          </div>
        ) : isSearching ? (
          /* Search Results (Single flat list) */
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[12px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
                Search Results ({searchResults.length})
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {searchResults.map((ext, idx) => (
                <ExtensionRow
                  key={ext.id}
                  ext={ext}
                  triggered={installedMap[ext.id]}
                  onInstall={handleInstall}
                  index={idx}
                  isFeatured={featuredIDSet.has(ext.id.toLowerCase())}
                  isRecent={recentIDSet.has(ext.id.toLowerCase())}
                />
              ))}
            </div>
          </div>
        ) : filter === 'popular' ? (
          /* Popular Tab */
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-500" />
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
                  Popular Extensions
                </h2>
              </div>
              <span className="text-[11.5px] font-mono text-[var(--text-tertiary)] tabular-nums">
                {popularFilterItems.length} total
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {popularFilterItems.map((ext, idx) => (
                <ExtensionRow
                  key={ext.id}
                  ext={ext}
                  triggered={installedMap[ext.id]}
                  onInstall={handleInstall}
                  index={idx}
                  isFeatured={featuredIDSet.has(ext.id.toLowerCase())}
                  isRecent={recentIDSet.has(ext.id.toLowerCase())}
                />
              ))}
            </div>
          </div>
        ) : filter === 'new' ? (
          /* New Tab — first-release extensions only */
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-500" />
                <h2 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
                  New Extensions
                </h2>
              </div>
              <span className="text-[11.5px] font-mono text-[var(--text-tertiary)] tabular-nums">
                {newFilterItems.length} total
              </span>
            </div>
            {newFilterItems.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-2xl flex flex-col items-center justify-center py-16 text-center shadow-2xs">
                <div className="w-12 h-12 rounded-2xl bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center mb-4 text-[var(--accent)]">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">No new extensions yet</h3>
                <p className="text-[13px] text-[var(--text-tertiary)] mt-1">
                  Extensions appear here the moment they are first published.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {newFilterItems.map((ext, idx) => (
                  <ExtensionRow
                    key={ext.id}
                    ext={ext}
                    triggered={installedMap[ext.id]}
                    onInstall={handleInstall}
                    index={idx}
                    isFeatured={featuredIDSet.has(ext.id.toLowerCase())}
                    isRecent={true}
                  />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Default "All" View: Sectioned storefront mirroring native app */
          <div className="space-y-9">
            {/* Section 1: Featured (Curated) */}
            {featuredSectionItems.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-1.5">
                    <BadgeCheck className="w-4 h-4 text-[var(--accent)]" />
                    <h2 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
                      Featured
                    </h2>
                  </div>
                  <span className="text-[11.5px] text-[var(--text-tertiary)]">
                    Curated essentials
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {featuredSectionItems.map((ext, idx) => (
                    <ExtensionRow
                      key={`featured-${ext.id}`}
                      ext={ext}
                      triggered={installedMap[ext.id]}
                      onInstall={handleInstall}
                      index={idx}
                      isFeatured={true}
                      isRecent={recentIDSet.has(ext.id.toLowerCase())}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section 2: New (first release, else most recent) */}
            {newSectionItems.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-500" />
                    <h2 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
                      New
                    </h2>
                  </div>
                  <span className="text-[11.5px] text-[var(--text-tertiary)]">
                    Latest
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {newSectionItems.map((ext, idx) => (
                    <ExtensionRow
                      key={`new-${ext.id}`}
                      ext={ext}
                      triggered={installedMap[ext.id]}
                      onInstall={handleInstall}
                      index={idx}
                      isFeatured={featuredIDSet.has(ext.id.toLowerCase())}
                      isRecent={true}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Section 3: All Extensions (Deduplicated remaining) */}
            {remainingAllSectionItems.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-3 px-1">
                  <div className="flex items-center gap-1.5">
                    <Blocks className="w-4 h-4 text-[var(--text-secondary)]" />
                    <h2 className="text-[14px] font-semibold text-[var(--text-primary)] tracking-tight">
                      All Extensions
                    </h2>
                  </div>
                  <span className="text-[11.5px] font-mono text-[var(--text-tertiary)] tabular-nums">
                    {remainingAllSectionItems.length} extensions
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {remainingAllSectionItems.map((ext, idx) => (
                    <ExtensionRow
                      key={ext.id}
                      ext={ext}
                      triggered={installedMap[ext.id]}
                      onInstall={handleInstall}
                      index={idx}
                      isFeatured={featuredIDSet.has(ext.id.toLowerCase())}
                      isRecent={recentIDSet.has(ext.id.toLowerCase())}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
