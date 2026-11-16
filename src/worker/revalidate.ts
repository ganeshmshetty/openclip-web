/**
 * POST /api/revalidate, called by the openclip-extensions repo's `revalidate-site`
 * workflow after the published catalog changes. Requires
 * `Authorization: Bearer <REVALIDATE_SECRET>`.
 *
 * The site is a static export, so there is nothing to revalidate in place: a catalog
 * change rebuilds the site by hitting the Worker's Deploy Hook. Same contract and
 * responses as the old Next.js route.
 */
import { json, type Env } from './http';

const encoder = new TextEncoder();

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const subtle = crypto.subtle as SubtleCrypto & { timingSafeEqual?: (x: Uint8Array, y: Uint8Array) => boolean };
  if (subtle.timingSafeEqual) return subtle.timingSafeEqual(a, b);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function isAuthorized(header: string | null, secret: string | undefined): boolean {
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const given = encoder.encode(header.slice('Bearer '.length));
  const expected = encoder.encode(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function handleRevalidate(request: Request, env: Env): Promise<Response> {
  if (!isAuthorized(request.headers.get('authorization'), env.REVALIDATE_SECRET)) {
    return json({ revalidated: false, error: 'Unauthorized' }, 401);
  }

  const hook = env.DEPLOY_HOOK_URL;
  if (!hook) {
    return json({ revalidated: false, error: 'DEPLOY_HOOK_URL is not configured' }, 501);
  }

  try {
    const res = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return json({ revalidated: false, error: `Deploy hook returned ${res.status}` }, 502);
    }
  } catch (err) {
    console.error('Deploy hook request failed:', err);
    return json({ revalidated: false, error: 'Deploy hook request failed' }, 502);
  }

  return json({ revalidated: true, now: Date.now() });
}
