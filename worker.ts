/**
 * Worker entry. The site is a Next.js static export (`out/`, served by Workers
 * Static Assets with `run_worker_first: false`), so pages, RSC payloads, images,
 * the sitemap and the prebuilt API files never reach this code.
 *
 * Only requests with no matching asset get here:
 *
 * - GET  /api/v1/extensions  prebuilt JSON, or search over the baked catalog
 * - GET  /api/v1/icon/:id    baked icon, or the openclip-extensions copy
 * - GET  /download           307 to the latest app release (stays dynamic)
 * - POST /api/revalidate     fires the Workers Builds deploy hook
 * - anything else            Static Assets' 404 page
 *
 * None of these load Next.js. Workers Cache (`cache.enabled` in wrangler.jsonc)
 * sits in front as well.
 */
import { handleDownload } from './src/worker/download';
import { handleExtensionsApi } from './src/worker/extensions-api';
import { methodNotAllowed, options, withSiteHeaders, type Ctx, type Env } from './src/worker/http';
import { handleIcon } from './src/worker/icon';
import { handleRevalidate } from './src/worker/revalidate';

const ICON_PREFIX = '/api/v1/icon/';

async function route(request: Request, url: URL, env: Env, ctx: Ctx): Promise<Response> {
  const { pathname } = url;
  const method = request.method;
  const isRead = method === 'GET' || method === 'HEAD';

  if (pathname === '/api/v1/extensions') {
    if (method === 'OPTIONS') return options('GET, HEAD, OPTIONS');
    if (!isRead) return methodNotAllowed();
    return handleExtensionsApi(request, url, env, ctx);
  }

  if (pathname.startsWith(ICON_PREFIX) && !pathname.slice(ICON_PREFIX.length).includes('/')) {
    if (method === 'OPTIONS') return options('GET, HEAD, OPTIONS');
    if (!isRead) return methodNotAllowed();
    return handleIcon(pathname.slice(ICON_PREFIX.length), url, env);
  }

  if (pathname === '/download') {
    if (method === 'OPTIONS') return options('GET, HEAD, OPTIONS');
    if (!isRead) return methodNotAllowed();
    return handleDownload(url, env);
  }

  if (pathname === '/api/revalidate') {
    if (method === 'OPTIONS') return options('OPTIONS, POST');
    if (method !== 'POST') return methodNotAllowed();
    return handleRevalidate(request, env);
  }

  // Not an asset and not ours: Static Assets answers with out/404.html.
  return env.ASSETS.fetch(request);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(request.url);
    const res = await route(request, url, env, ctx);
    return withSiteHeaders(res, url.pathname);
  },
};

export default worker;
