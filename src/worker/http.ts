/**
 * Shared response helpers for the Worker (worker.ts). The site is a static export,
 * so these are the only responses not served by Workers Static Assets; they carry
 * the same headers `next.config.ts` `headers()` used to add.
 */

export interface Assets {
  fetch(input: Request | string | URL): Promise<Response>;
}

export interface Env {
  ASSETS: Assets;
  /** `version_metadata` binding (wrangler.jsonc); absent outside workerd. */
  CF_VERSION_METADATA?: { id: string };
  GITHUB_TOKEN?: string;
  GH_TOKEN?: string;
}

export interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

export const API_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/** Adds the security headers (and CORS under /api/) without overriding explicit ones. */
export function withSiteHeaders(res: Response, pathname: string): Response {
  const out = new Response(res.body, res);
  const extra = pathname.startsWith('/api/') ? { ...SECURITY_HEADERS, ...API_CORS_HEADERS } : SECURITY_HEADERS;
  for (const [k, v] of Object.entries(extra)) {
    if (!out.headers.has(k)) out.headers.set(k, v);
  }
  return out;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

export function text(body: string, status: number, headers: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain;charset=UTF-8', ...headers } });
}

/** What a Next.js route handler answered for a method it doesn't export. */
export function methodNotAllowed(): Response {
  return new Response(null, { status: 405 });
}

/** What Next.js answered for OPTIONS on a route handler. */
export function options(allow: string): Response {
  return new Response(null, { status: 204, headers: { Allow: allow } });
}

/** The Cache API (`caches.default`), typed loosely: it is workerd-only. */
export function edgeCache(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

/**
 * Cache API entries are keyed on the URL alone and, unlike Workers Cache, survive a
 * deploy. Adding the Worker version id makes every deploy (including the catalog
 * deploy hook) start from an empty cache, so a long TTL can't serve stale data.
 */
export function versionedCacheKey(url: URL, env: Env): Request {
  const key = new URL(url.toString());
  const version = env.CF_VERSION_METADATA?.id;
  if (version) key.searchParams.set('__v', version);
  return new Request(key.toString(), { method: 'GET' });
}
