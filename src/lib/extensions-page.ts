import type { ExtensionItem } from './extensions';

export interface ExtensionsPageResponse {
  featured?: ExtensionItem[];
  new?: ExtensionItem[];
  extensions: ExtensionItem[];
  page: number;
  totalPages: number;
  totalCount: number;
}

export interface ExtensionsPageQuery {
  q: string;
  filter: string;
  page: number;
  limit: number;
}

/**
 * The site's own pages resolve `iconURL` against their origin, but this API is also
 * read by the macOS app, which has no origin to resolve against and needs a full URL.
 */
function withAbsoluteIcon(item: ExtensionItem, base: string): ExtensionItem {
  return item.iconURL?.startsWith('/') ? { ...item, iconURL: `${base}${item.iconURL}` } : item;
}

/**
 * One page of the extensions API. Pure, so the route (at request time) and
 * `scripts/build-extensions-api.ts` (at build time) produce byte-identical JSON.
 * Key order matters: `page`, `totalPages` and `totalCount` stay last (see
 * OUT_OF_RANGE_PAGE_MARKER).
 */
export function buildExtensionsPage(
  catalog: ExtensionItem[],
  featuredIDs: string[],
  { q, filter, page, limit }: ExtensionsPageQuery,
  base: string
): ExtensionsPageResponse {
  const byId = new Map(catalog.map((e) => [e.id.toLowerCase(), e]));

  // 1. Featured items driven by published/featured.json
  const featured = featuredIDs.map((id) => byId.get(id.toLowerCase())).filter(
    (e): e is ExtensionItem => Boolean(e)
  );
  const featuredIdSet = new Set(featured.map((e) => e.id.toLowerCase()));

  // 2. New items — the four most recently *added* non-featured extensions (stable `addedAt`, first
  // publish). An update never reorders a new extension out, and a quiet catalogue still shows its
  // latest additions, matching the app/website New list (window with a floor; the showcase is just
  // its head).
  const addedTime = (e: ExtensionItem) => {
    const t = e.addedAt ? Date.parse(e.addedAt) : NaN;
    return Number.isNaN(t) ? 0 : t;
  };
  const byRecency = (a: ExtensionItem, b: ExtensionItem) => {
    const dateDiff = addedTime(b) - addedTime(a);
    if (dateDiff !== 0) return dateDiff;
    return (b.version || '').localeCompare(a.version || '', undefined, { numeric: true });
  };
  const nonFeatured = catalog.filter((e) => !featuredIdSet.has(e.id.toLowerCase()));
  const newShowcase = nonFeatured.slice().sort(byRecency).slice(0, 4);

  let filtered = catalog;

  if (q) {
    filtered = filtered.filter(
      (ext) =>
        ext.name.toLowerCase().includes(q) ||
        ext.description.toLowerCase().includes(q) ||
        ext.author.toLowerCase().includes(q) ||
        (ext.keywords && ext.keywords.some((k) => k.toLowerCase().includes(q)))
    );
  }

  // Support server-side popular and new sorting/filtering
  if (filter === 'popular') {
    filtered = [...filtered].sort((a, b) => (b.downloadCount || 0) - (a.downloadCount || 0));
  } else if (filter === 'new') {
    filtered = [...filtered].sort(byRecency);
  }

  const totalCount = filtered.length;
  const totalPages = Math.ceil(totalCount / limit) || 1;
  const startIndex = (page - 1) * limit;
  const paginatedExtensions = filtered.slice(startIndex, startIndex + limit);

  return {
    featured: featured.map((e) => withAbsoluteIcon(e, base)),
    new: newShowcase.map((e) => withAbsoluteIcon(e, base)),
    extensions: paginatedExtensions.map((e) => withAbsoluteIcon(e, base)),
    page,
    totalPages,
    totalCount,
  };
}
