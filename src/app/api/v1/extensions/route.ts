import { NextResponse } from 'next/server';
import { getCatalogResult, loadFeatured, ExtensionItem } from '@/lib/extensions';
import { siteUrl } from '@/lib/site';

export type { ExtensionItem } from '@/lib/extensions';

export interface ExtensionsPageResponse {
  featured?: ExtensionItem[];
  new?: ExtensionItem[];
  extensions: ExtensionItem[];
  page: number;
  totalPages: number;
  totalCount: number;
}

/**
 * The site's own pages resolve `iconURL` against their origin, but this API is also
 * read by the macOS app, which has no origin to resolve against and needs a full URL.
 */
function withAbsoluteIcon(item: ExtensionItem, base: string): ExtensionItem {
  return item.iconURL?.startsWith('/') ? { ...item, iconURL: `${base}${item.iconURL}` } : item;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const filter = (searchParams.get('filter') || searchParams.get('sort') || '').toLowerCase().trim();
  // Number() rejects malformed input ("2abc") and non-integers ("1.9") as NaN,
  // so only well-formed integer values are normalized into the valid range.
  const rawPage = Number(searchParams.get('page') ?? '1');
  const rawLimit = Number(searchParams.get('limit') ?? '12');
  const page = Number.isInteger(rawPage) ? Math.max(1, rawPage) : 1;
  const limit = Number.isInteger(rawLimit) ? Math.min(500, Math.max(1, rawLimit)) : 12;

  const { catalog, complete } = await getCatalogResult();
  const byId = new Map(catalog.map((e) => [e.id.toLowerCase(), e]));

  // 1. Featured items driven by published/featured.json
  const featuredIDs = await loadFeatured();
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

  return NextResponse.json(
    {
      featured: featured.map((e) => withAbsoluteIcon(e, siteUrl)),
      new: newShowcase.map((e) => withAbsoluteIcon(e, siteUrl)),
      extensions: paginatedExtensions.map((e) => withAbsoluteIcon(e, siteUrl)),
      page,
      totalPages,
      totalCount,
    },
    {
      // A fallback (GitHub down, no earlier snapshot) must not be shared: no-store keeps
      // it out of Workers Cache and the Worker's Cache API layer, so the next request
      // retries GitHub.
      headers: complete
        ? {
            'Cache-Control': 'public, max-age=60',
            'CDN-Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          }
        : { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' },
    }
  );
}
