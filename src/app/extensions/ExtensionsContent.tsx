'use client';

import { useMemo, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import AnimatedStoreIcon from '../components/AnimatedStoreIcon';
import {
  Search,
  Download,
  Check,
  PackageOpen,
  Blocks,
  Flame,
  Clock,
  X,
  BadgeCheck,
  GitPullRequest,
  ArrowUpRight,
} from 'lucide-react';
import Link from 'next/link';
import { motion } from 'motion/react';
import ExtensionIcon from '../components/ExtensionIcon';
import type { ExtensionItem } from '@/lib/extensions';
import { CURATED_FEATURED_IDS } from '@/lib/featured-extensions';

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

interface CardProps {
  ext: ExtensionItem;
  triggered?: boolean;
  onInstall: (ext: ExtensionItem) => void;
  index: number;
  hero?: boolean;
  isFeatured?: boolean;
  isRecent?: boolean;
  showBadges?: boolean;
}

// One card used by every list on the store page (Featured, New, All, Popular, New tab, search).
function ExtensionCard({
  ext,
  triggered,
  onInstall,
  index,
  hero = false,
  isFeatured: isExtFeatured = false,
  isRecent = false,
  showBadges = true,
}: CardProps) {
  const isVersionUpdate = Boolean(ext.version && ext.version !== '1.0.0');
  const badgeClass =
    'shrink-0 text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full tracking-wide inline-flex items-center gap-1';

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.25), ease: [0.16, 1, 0.3, 1] }}
      className={`spotlight-card rounded-2xl p-4 flex flex-col gap-2.5 ${hero ? 'sm:col-span-2' : ''}`}
    >
      <div className="flex items-start gap-3.5">
        <ExtensionIcon
          id={ext.id}
          name={ext.name}
          iconURL={ext.iconURL}
          size={hero ? 44 : 40}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <Link
              href={`/extensions/${ext.id}`}
              className="block min-w-0 text-[15px] font-semibold tracking-tight text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors truncate"
            >
              {ext.name}
            </Link>
            {showBadges && isExtFeatured && (
              <span title="Featured Extension" className={`${badgeClass} bg-[var(--accent)]/12 text-[var(--accent)]`}>
                <BadgeCheck className="w-3 h-3" />
                Featured
              </span>
            )}
            {showBadges && !isExtFeatured && isNewRelease(ext) && (
              <span className={`${badgeClass} bg-emerald-500/12 text-emerald-600 dark:text-emerald-400`}>New</span>
            )}
            {showBadges && !isExtFeatured && !isNewRelease(ext) && isRecent && isVersionUpdate && (
              <span className={`${badgeClass} bg-blue-500/10 text-blue-600 dark:text-blue-400`}>Updated</span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-2 text-[11.5px] text-[var(--text-tertiary)]">
            <span className="truncate">by {ext.author}</span>
            <span className="inline-flex shrink-0 items-center gap-1 font-mono tabular-nums">
              <Download className="w-3 h-3 opacity-60" />
              {ext.downloadCount.toLocaleString()}
            </span>
          </p>
        </div>
        <button
          onClick={() => onInstall(ext)}
          className={`store-install inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 h-[30px] text-[12.5px] font-bold tracking-tight cursor-pointer active:opacity-70 transition-opacity ${
            triggered ? 'is-done' : ''
          }`}
        >
          {triggered && <Check className="w-3.5 h-3.5" />}
          <span>{triggered ? 'Opening…' : 'Install'}</span>
        </button>
      </div>
      <p className="text-[12.5px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
        {ext.description}
      </p>
    </motion.article>
  );
}

const KNOB_SPRING = { type: 'spring', stiffness: 420, damping: 34 } as const;

const FILTERS: { id: StoreFilter; label: string; icon?: typeof Flame }[] = [
  { id: 'all', label: 'All' },
  { id: 'popular', label: 'Popular', icon: Flame },
  { id: 'new', label: 'New', icon: Clock },
];


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

      <main className="relative flex-1 max-w-4xl mx-auto px-5 sm:px-8 pt-8 pb-12 sm:pt-14 sm:pb-24 w-full">
        <div className="store-glow" aria-hidden="true" />
        {/* Page Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 mb-8 sm:mb-12 text-center flex flex-col items-center"
        >
          <AnimatedStoreIcon className="w-24 sm:w-32 aspect-[200/170] select-none" />
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
          className="relative z-10 mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4"
        >
          {/* Search Input */}
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)] pointer-events-none z-10" />
            <input
              type="search"
              inputMode="search"
              enterKeyHint="search"
              placeholder="Search clips by name, author, or action..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="store-control w-full h-11 sm:h-10 pl-11 pr-10 rounded-full text-[var(--text-primary)] text-[14px] sm:text-[13.5px] placeholder:text-[var(--text-tertiary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] [&::-webkit-search-cancel-button]:hidden"
            />
            {isSearching && (
              <button
                onClick={() => setSearch('')}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 z-10 p-1 rounded-full hover:bg-[var(--bg-surface-hover)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            {/* Segmented filter: same glass shell and sliding knob as the navbar */}
            <div role="tablist" aria-label="Filter clips" className="nav-shell store-control inline-flex items-stretch h-[40px] px-1">
              {FILTERS.map(({ id, label, icon: Icon }) => {
                const active = filter === id && !isSearching;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={active}
                    onClick={() => handleSelectFilter(id)}
                    className={`nav-chip gap-1.5 self-stretch my-[3px] px-3.5 ${active ? 'nav-chip-active' : ''}`}
                  >
                    {active && (
                      <motion.span layoutId="store-knob" className="nav-knob" transition={KNOB_SPRING} initial={false} />
                    )}
                    <span className="relative z-10 flex items-center gap-1.5">
                      {Icon && <Icon className="w-3.5 h-3.5" />}
                      <span>{label}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Submit-your-extension link, merged into the toolbar so it needs no band of its own */}
            <a
              href="https://github.com/ganeshmshetty/openclip-extensions"
              target="_blank"
              rel="noopener noreferrer"
              title="Submit your extension to the open repository"
              aria-label="Submit an extension"
              className="store-control group inline-flex items-center justify-center gap-1.5 rounded-full w-10 sm:w-auto sm:px-4 h-10 text-[12.5px] font-medium text-[var(--text-primary)] active:scale-[0.98] transition-transform whitespace-nowrap"
            >
              <GitPullRequest className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
              <span className="hidden sm:inline">Submit an extension</span>
              <ArrowUpRight className="hidden sm:block w-3.5 h-3.5 shrink-0 text-[var(--text-tertiary)]" />
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
            <div className="grid sm:grid-cols-2 gap-3">
              {searchResults.map((ext, idx) => (
                <ExtensionCard
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
            <div className="grid sm:grid-cols-2 gap-3">
              {popularFilterItems.map((ext, idx) => (
                <ExtensionCard
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
              <div className="grid sm:grid-cols-2 gap-3">
                {newFilterItems.map((ext, idx) => (
                  <ExtensionCard
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

                <div className="grid sm:grid-cols-2 gap-3">
                  {featuredSectionItems.map((ext, idx) => (
                    <ExtensionCard
                      key={`featured-${ext.id}`}
                      ext={ext}
                      triggered={installedMap[ext.id]}
                      onInstall={handleInstall}
                      index={idx}
                      hero={idx === 0 && featuredSectionItems.length % 2 === 1}
                      showBadges={false}
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

                <div className="grid sm:grid-cols-2 gap-3">
                  {newSectionItems.map((ext, idx) => (
                    <ExtensionCard
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

                <div className="grid sm:grid-cols-2 gap-3">
                  {remainingAllSectionItems.map((ext, idx) => (
                    <ExtensionCard
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
