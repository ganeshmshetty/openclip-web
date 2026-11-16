/**
 * GET /api/v1/icon/:id, kept for older `iconURL`s and the macOS app. The build
 * bakes every catalog icon into /icons/extensions (scripts/build-extensions-api.ts),
 * so this answers from Static Assets; only an icon missing from the build is fetched
 * from openclip-extensions, as the old route did.
 */
import { text, type Env } from './http';

const REPO = 'ganeshmshetty/openclip-extensions';

// Ids are dotted reverse-DNS strings; anything else is rejected before it reaches the URL.
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;

const SVG_HEADERS = {
  'Content-Type': 'image/svg+xml; charset=utf-8',
  'Cache-Control': 'public, max-age=3600',
  'CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
};

export async function handleIcon(rawId: string, url: URL, env: Env): Promise<Response> {
  let id: string;
  try {
    id = decodeURIComponent(rawId);
  } catch {
    id = rawId;
  }
  if (!ID_PATTERN.test(id) || id.includes('..')) {
    return text('Invalid icon id', 400);
  }
  const key = id.toLowerCase();

  const asset = await env.ASSETS.fetch(new URL(`/icons/extensions/${key}.svg`, url.origin));
  if (asset.ok) return new Response(asset.body, { headers: SVG_HEADERS });

  const upstream = `https://cdn.jsdelivr.net/gh/${REPO}@main/published/icons/${key}.svg`;
  try {
    const res = await fetch(upstream, {
      cf: { cacheTtl: 300 },
      signal: AbortSignal.timeout(8000),
    } as RequestInit);
    if (!res.ok) return text('Icon not found', 404);
    const svg = await res.text();
    if (!svg.trim().startsWith('<svg')) return text('Upstream did not return an SVG', 404);
    return new Response(svg, { headers: SVG_HEADERS });
  } catch {
    return text('Icon unavailable', 502);
  }
}
