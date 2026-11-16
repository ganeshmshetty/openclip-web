/**
 * Bakes the extension store into the build, so nothing about it runs at request
 * time (the site is a static export; see worker.ts):
 *
 * 1. Icons: any catalog extension without a local icon in public/icons/extensions
 *    is downloaded from openclip-extensions and the icon hash map is refreshed, so
 *    every `iconURL` points at a static file instead of the /api/v1/icon proxy.
 * 2. public/_api/extensions/catalog.json: the merged catalog (download counts +
 *    synced README/manifest metadata), featured ids and the site origin. The pages read it at build
 *    time and the Worker reads it for search, so both use one snapshot.
 * 3. public/_api/extensions/limit-<N>/page-<P>.json for every PREBUILT_LIMITS value,
 *    plus an out-of-range.json per limit for pages past the end. Built with the
 *    same pure functions the Worker uses for search (mergeCatalog +
 *    buildExtensionsPage), so the bytes match.
 *
 * Freshness: every catalog or stats change already rebuilds the site (openclip-
 * extensions' revalidate-site.yml -> POST /api/revalidate -> deploy hook).
 *
 * The catalog and stats never fall back: if either can't be fetched, the build
 * fails, so a deploy never bakes an empty store or zeroed counts. featured.json keeps
 * the old runtime rule (missing, broken or empty means CURATED_FEATURED_IDS). A
 * missing icon only warns: that extension keeps the /api/v1/icon proxy URL.
 * Runs after sync-extensions (it reads the synced metadata that script writes).
 */
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  OUT_OF_RANGE_PAGE_MARKER,
  PREBUILT_API_DIR,
  PREBUILT_CATALOG_PATH,
  PREBUILT_LIMITS,
  prebuiltOutOfRangePath,
  prebuiltPagePath,
} from '../src/lib/extensions-query';
import type { ExtensionItem } from '../src/lib/extensions';

const PUBLIC_DIR = join(__dirname, '../public');
const ICONS_DIR = join(PUBLIC_DIR, 'icons/extensions');
const ICON_HASHES_FILE = join(__dirname, '../src/lib/extension-icon-hashes.json');
const ATTEMPTS = 3;

const REPO = 'ganeshmshetty/openclip-extensions';
const RAW = `https://raw.githubusercontent.com/${REPO}/main/published`;
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

async function fetchWithRetry(url: string, label: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
      if (res.status === 404) break;
    } catch (err) {
      lastError = err;
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
  throw new Error(`[ExtensionsAPI] ${label} fetch failed: ${(lastError as Error).message}`);
}

async function fetchFeatured(): Promise<unknown> {
  try {
    return await (await fetchWithRetry(`${RAW}/featured.json`, 'featured.json')).json();
  } catch (err) {
    console.log(`${(err as Error).message}; using the curated featured list`);
    return null;
  }
}

/** Downloads icons the committed/synced set lacks; returns how many were added. */
async function bakeMissingIcons(ids: string[]): Promise<number> {
  mkdirSync(ICONS_DIR, { recursive: true });
  const missing = [...new Set(ids.map((id) => id.toLowerCase()))].filter(
    (id) => !existsSync(join(ICONS_DIR, `${id}.svg`))
  );
  let added = 0;
  await Promise.all(
    missing.map(async (id) => {
      try {
        const svg = await (await fetchWithRetry(`${RAW}/icons/${id}.svg`, `icon ${id}`)).text();
        if (!svg.trim().startsWith('<svg')) throw new Error('not an SVG');
        writeFileSync(join(ICONS_DIR, `${id}.svg`), svg);
        added++;
      } catch (err) {
        console.warn(`[ExtensionsAPI] ⚠ ${(err as Error).message}; ${id} keeps the /api/v1/icon proxy URL`);
      }
    })
  );
  // Same format as scripts/sync-extensions.ts.
  const hashes = Object.fromEntries(
    readdirSync(ICONS_DIR)
      .filter((file) => file.endsWith('.svg'))
      .sort()
      .map((file) => [
        file.slice(0, -'.svg'.length).toLowerCase(),
        createHash('sha256').update(readFileSync(join(ICONS_DIR, file))).digest('hex').slice(0, 16),
      ])
  );
  writeFileSync(ICON_HASHES_FILE, `${JSON.stringify(hashes, null, 2)}\n`);
  return added;
}

function write(path: string, body: string) {
  const file = join(PUBLIC_DIR, path);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, body);
}

async function main() {
  const [catalogData, statsData, featuredData] = await Promise.all([
    fetchWithRetry(`${RAW}/catalog.json`, 'catalog.json').then((r) => r.json()),
    fetchWithRetry(`${RAW}/extension-stats.json`, 'extension-stats.json').then((r) => r.json()),
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

  const addedIcons = await bakeMissingIcons(extensions.map((e) => e.id));

  // Imported only now: src/lib/extensions.ts reads the icon hash map at load time.
  const { mergeCatalog, parseFeaturedIds, CURATED_FEATURED_IDS } = await import('../src/lib/extensions');
  const { buildExtensionsPage } = await import('../src/lib/extensions-page');
  const { siteUrl } = await import('../src/lib/site');

  // Same rule as the old runtime loader: missing or empty means the curated defaults.
  const parsedFeatured = parseFeaturedIds(featuredData);
  const featuredIDs = parsedFeatured.length > 0 ? parsedFeatured : CURATED_FEATURED_IDS;
  const catalog = mergeCatalog(extensions, downloads);

  rmSync(join(PUBLIC_DIR, PREBUILT_API_DIR), { recursive: true, force: true });
  write(PREBUILT_CATALOG_PATH, JSON.stringify({ siteUrl, featuredIDs, catalog }));

  let files = 1;
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
    `[ExtensionsAPI] ✓ ${catalog.length} extensions, ${addedIcons} icons downloaded → ${files} files in public${PREBUILT_API_DIR}`
  );
}

main().catch((err) => {
  console.error((err as Error).message);
  process.exit(1);
});
