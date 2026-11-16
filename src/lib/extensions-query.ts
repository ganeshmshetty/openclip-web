/**
 * Query parsing and the prebuilt-file layout for GET /api/v1/extensions.
 *
 * No imports on purpose: `worker.ts` uses this before Next.js boots, so it must stay
 * a tiny, dependency-free module that the route and the build script share.
 */

export const DEFAULT_LIMIT = 12;
export const MAX_LIMIT = 500;

/**
 * Limits that `scripts/build-extensions-api.ts` bakes into static JSON. These are the
 * ones the macOS app sends: 12 (store page, also the API default), 50 (update checks)
 * and 500 (full catalog for onboarding and Preferences).
 */
export const PREBUILT_LIMITS = [12, 50, 500] as const;

/** Under `public/`, so it ships as a Static Asset. */
export const PREBUILT_API_DIR = '/_api/extensions';

/** `{ siteUrl, featuredIDs, catalog }`: the merged catalog, for search and the pages. */
export const PREBUILT_CATALOG_PATH = `${PREBUILT_API_DIR}/catalog.json`;

export function prebuiltPagePath(limit: number, page: number): string {
  return `${PREBUILT_API_DIR}/limit-${limit}/page-${page}.json`;
}

/**
 * The response for any page past the end, with `"page":0` as a placeholder. The page
 * keys are serialized last, so the Worker swaps the final `,"page":0,` for the
 * requested page without parsing the body.
 */
export function prebuiltOutOfRangePath(limit: number): string {
  return `${PREBUILT_API_DIR}/limit-${limit}/out-of-range.json`;
}

export const OUT_OF_RANGE_PAGE_MARKER = ',"page":0,"totalPages":';

/** Cache headers for a complete (non-fallback) response. */
export const EXTENSIONS_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60',
  'CDN-Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
} as const;

/**
 * Number() rejects malformed input ("2abc") and non-integers ("1.9") as NaN, so only
 * well-formed integer values are normalized into the valid range.
 */
export function parsePagination(searchParams: URLSearchParams): { page: number; limit: number } {
  const rawPage = Number(searchParams.get('page') ?? '1');
  const rawLimit = Number(searchParams.get('limit') ?? String(DEFAULT_LIMIT));
  const page = Number.isInteger(rawPage) ? Math.max(1, rawPage) : 1;
  const limit = Number.isInteger(rawLimit) ? Math.min(MAX_LIMIT, Math.max(1, rawLimit)) : DEFAULT_LIMIT;
  return { page, limit };
}
