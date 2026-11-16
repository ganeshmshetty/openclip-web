/**
 * Bakes GET /api/v1/extensions into static JSON so the Worker can answer the app's
 * requests from Static Assets without booting Next.js (see worker.ts).
 *
 * Writes public/_api/extensions/limit-<N>/page-<P>.json for every PREBUILT_LIMITS
 * value, plus an out-of-range.json per limit for pages past the end. The bodies come
 * from the same pure functions as the route (mergeCatalog + buildExtensionsPage), so
 * they are byte-identical to what the route would return at build time.
 *
 * Freshness: every catalog or stats change already rebuilds the site (openclip-
 * extensions' revalidate-site.yml -> POST /api/revalidate -> deploy hook).
 *
 * Unlike the runtime route, the catalog and stats never fall back: if catalog.json
 * or the download stats can't be fetched, the build fails, so a deploy never bakes an
 * empty store or zeroed counts. featured.json keeps the route's rule (missing, broken
 * or empty means CURATED_FEATURED_IDS), because it is optional upstream. Runs after sync-extensions (it reads the synced
 * metadata and icon hashes that script writes).
 */
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  CATALOG_URL,
  CURATED_FEATURED_IDS,
  FEATURED_URL,
  STATS_URL,
  githubHeaders,
  mergeCatalog,
  parseFeaturedIds,
  type ExtensionItem,
} from '../src/lib/extensions';
import { buildExtensionsPage } from '../src/lib/extensions-page';
import {
  OUT_OF_RANGE_PAGE_MARKER,
  PREBUILT_API_DIR,
  PREBUILT_LIMITS,
  prebuiltOutOfRangePath,
  prebuiltPagePath,
} from '../src/lib/extensions-query';
import { siteUrl } from '../src/lib/site';

const PUBLIC_DIR = join(__dirname, '../public');
const ATTEMPTS = 3;

async function fetchJson(url: string, label: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers: githubHeaders(), signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastError = err;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error(`[ExtensionsAPI] ${label} fetch failed after ${ATTEMPTS} attempts: ${(lastError as Error).message}`);
}

async function fetchFeatured(): Promise<unknown> {
  try {
    const res = await fetch(FEATURED_URL, { headers: githubHeaders(), signal: AbortSignal.timeout(15000) });
    if (res.ok) return await res.json();
    console.log(`[ExtensionsAPI] featured.json returned ${res.status}; using the curated featured list`);
  } catch (err) {
    console.warn(`[ExtensionsAPI] featured.json unavailable (${(err as Error).message}); using the curated featured list`);
  }
  return null;
}

function write(path: string, body: string) {
  const file = join(PUBLIC_DIR, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, body);
}

async function main() {
  const [catalogData, statsData, featuredData] = await Promise.all([
    fetchJson(CATALOG_URL, 'catalog.json'),
    fetchJson(STATS_URL, 'extension-stats.json'),
    fetchFeatured(),
  ]);

  const extensions = (catalogData as { extensions?: ExtensionItem[] }).extensions;
  if (!Array.isArray(extensions) || extensions.length === 0) {
    throw new Error('[ExtensionsAPI] catalog.json has no extensions; refusing to bake an empty store');
  }
  const downloads = (statsData as { downloads?: Record<string, number> }).downloads;
  if (!downloads || typeof downloads !== 'object') {
    throw new Error('[ExtensionsAPI] extension-stats.json has no downloads map; refusing to bake zeroed counts');
  }
  // Same rule as loadFeatured(): missing or empty means the curated defaults.
  const parsedFeatured = parseFeaturedIds(featuredData);
  const featuredIDs = parsedFeatured.length > 0 ? parsedFeatured : CURATED_FEATURED_IDS;

  const catalog = mergeCatalog(extensions, downloads);

  rmSync(join(PUBLIC_DIR, PREBUILT_API_DIR), { recursive: true, force: true });

  let files = 0;
  for (const limit of PREBUILT_LIMITS) {
    const first = buildExtensionsPage(catalog, featuredIDs, { q: '', filter: '', page: 1, limit }, siteUrl);
    for (let page = 1; page <= first.totalPages; page++) {
      const body = buildExtensionsPage(catalog, featuredIDs, { q: '', filter: '', page, limit }, siteUrl);
      write(prebuiltPagePath(limit, page), JSON.stringify(body));
      files++;
    }
    // Pages past the end: same body as the route returns, with page 0 as a placeholder.
    const outOfRange = JSON.stringify(
      buildExtensionsPage(catalog, featuredIDs, { q: '', filter: '', page: first.totalPages + 1, limit }, siteUrl)
    ).replace(`,"page":${first.totalPages + 1},"totalPages":`, OUT_OF_RANGE_PAGE_MARKER);
    if (!outOfRange.includes(OUT_OF_RANGE_PAGE_MARKER)) {
      throw new Error('[ExtensionsAPI] out-of-range template is missing its page marker');
    }
    write(prebuiltOutOfRangePath(limit), outOfRange);
    files++;
  }

  console.log(
    `[ExtensionsAPI] ✓ ${catalog.length} extensions → ${files} files in public${PREBUILT_API_DIR} (limits ${PREBUILT_LIMITS.join(', ')})`
  );
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
