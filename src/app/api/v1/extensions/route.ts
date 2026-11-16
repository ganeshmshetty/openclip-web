import { NextResponse } from 'next/server';
import { getCatalogResult, loadFeatured } from '@/lib/extensions';
import { buildExtensionsPage } from '@/lib/extensions-page';
import { EXTENSIONS_CACHE_HEADERS, parsePagination } from '@/lib/extensions-query';
import { siteUrl } from '@/lib/site';

export type { ExtensionItem } from '@/lib/extensions';
export type { ExtensionsPageResponse } from '@/lib/extensions-page';

/**
 * Plain `?page=&limit=` requests for the limits the app uses are answered by
 * `worker.ts` from static JSON baked at build time (scripts/build-extensions-api.ts),
 * so this route only runs for search (`q`), `filter`/`sort`, other limits, or if a
 * prebuilt file is missing.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const filter = (searchParams.get('filter') || searchParams.get('sort') || '').toLowerCase().trim();
  const { page, limit } = parsePagination(searchParams);

  const { catalog, complete } = await getCatalogResult();
  const featuredIDs = await loadFeatured();

  return NextResponse.json(buildExtensionsPage(catalog, featuredIDs, { q, filter, page, limit }, siteUrl), {
    // A fallback (GitHub down, no earlier snapshot) must not be shared: no-store keeps
    // it out of Workers Cache and the Worker's Cache API layer, so the next request
    // retries GitHub.
    headers: complete ? EXTENSIONS_CACHE_HEADERS : { 'Cache-Control': 'no-store', 'CDN-Cache-Control': 'no-store' },
  });
}
