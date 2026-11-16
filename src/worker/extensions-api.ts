/**
 * GET /api/v1/extensions, about two thirds of all Worker requests (the macOS app
 * polls it). Everything it returns is baked at build time by
 * scripts/build-extensions-api.ts:
 *
 * 1. Plain `?page=&limit=` for a prebuilt limit (12, 50, 500): the static page file,
 *    streamed from Static Assets.
 * 2. Anything else (search `q`, `filter`/`sort`, other limits): computed from the
 *    baked catalog.json with the same pure function the build uses, then kept in the
 *    Cache API under a per-deploy key.
 */
import type { ExtensionItem } from '../lib/extensions';
import { buildExtensionsPage } from '../lib/extensions-page';
import {
  EXTENSIONS_CACHE_HEADERS,
  OUT_OF_RANGE_PAGE_MARKER,
  PREBUILT_CATALOG_PATH,
  PREBUILT_LIMITS,
  parsePagination,
  prebuiltOutOfRangePath,
  prebuiltPagePath,
} from '../lib/extensions-query';
import { edgeCache, versionedCacheKey, type Ctx, type Env } from './http';

// The key carries the Worker version and every catalog change is a new deploy, so an
// entry can never outlive its data.
const CACHE_SECONDS = 86400;
const PREBUILT = new Set<number>(PREBUILT_LIMITS);

function jsonResponse(body: BodyInit | null, source: 'STATIC' | 'HIT' | 'MISS'): Response {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...EXTENSIONS_CACHE_HEADERS, 'X-OpenClip-Cache': source },
  });
}

/**
 * The prebuilt answer for a plain `?page=&limit=` request, or null to fall through.
 * Uses the same page/limit normalization as search, so `limit=abc` (→ 12) or
 * `page=0` (→ 1) map to the same file.
 */
async function servePrebuilt(url: URL, env: Env): Promise<Response | null> {
  const keys = [...url.searchParams.keys()];
  if (keys.some((k) => k !== 'page' && k !== 'limit') || new Set(keys).size !== keys.length) {
    return null;
  }
  const { page, limit } = parsePagination(url.searchParams);
  if (!PREBUILT.has(limit)) return null;

  const asset = await env.ASSETS.fetch(new URL(prebuiltPagePath(limit, page), url.origin));
  if (asset.ok) return jsonResponse(asset.body, 'STATIC');
  if (asset.status !== 404 || page === 1) return null;

  // Past the last page: an empty `extensions` list with the requested page number,
  // filled into the prebuilt template without parsing it.
  const tail = await env.ASSETS.fetch(new URL(prebuiltOutOfRangePath(limit), url.origin));
  if (!tail.ok) return null;
  const body = await tail.text();
  const at = body.lastIndexOf(OUT_OF_RANGE_PAGE_MARKER);
  if (at === -1) return null;
  return jsonResponse(
    `${body.slice(0, at)},"page":${page},"totalPages":${body.slice(at + OUT_OF_RANGE_PAGE_MARKER.length)}`,
    'STATIC'
  );
}

type Baked = { siteUrl: string; featuredIDs: string[]; catalog: ExtensionItem[] };
let bakedCatalog: { version: string; data: Promise<Baked> } | null = null;

/** Parsed once per isolate and deploy (~240 KB). */
function loadCatalog(url: URL, env: Env): Promise<Baked> {
  const version = env.CF_VERSION_METADATA?.id ?? '';
  if (!bakedCatalog || bakedCatalog.version !== version) {
    const data = env.ASSETS.fetch(new URL(PREBUILT_CATALOG_PATH, url.origin)).then((res) => {
      if (!res.ok) throw new Error(`baked catalog returned ${res.status}`);
      return res.json() as Promise<Baked>;
    });
    data.catch(() => {
      bakedCatalog = null;
    });
    bakedCatalog = { version, data };
  }
  return bakedCatalog.data;
}

export async function handleExtensionsApi(request: Request, url: URL, env: Env, ctx: Ctx): Promise<Response> {
  const prebuilt = await servePrebuilt(url, env);
  if (prebuilt) return prebuilt;

  const cacheKey = versionedCacheKey(url, env);
  const cache = edgeCache();
  const hit = await cache.match(cacheKey);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('X-OpenClip-Cache', 'HIT');
    res.headers.set('Cache-Control', EXTENSIONS_CACHE_HEADERS['Cache-Control']);
    return res;
  }

  const { searchParams } = url;
  const q = (searchParams.get('q') || '').toLowerCase().trim();
  const filter = (searchParams.get('filter') || searchParams.get('sort') || '').toLowerCase().trim();
  const { page, limit } = parsePagination(searchParams);
  // The site origin is baked too, so absolute icon URLs match the prebuilt pages.
  const { siteUrl, catalog, featuredIDs } = await loadCatalog(url, env);
  const body = JSON.stringify(buildExtensionsPage(catalog, featuredIDs, { q, filter, page, limit }, siteUrl));

  const stored = jsonResponse(body, 'MISS');
  stored.headers.set('Cache-Control', `public, max-age=${CACHE_SECONDS}`);
  ctx.waitUntil(cache.put(cacheKey, stored));
  return jsonResponse(body, 'MISS');
}
