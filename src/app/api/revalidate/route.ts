import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * On-demand freshness, called by the openclip-extensions repo's `revalidate-site`
 * workflow after the published catalog changes. Requires
 * `Authorization: Bearer <REVALIDATE_SECRET>`.
 *
 * Pages are prerendered once per deploy and served from a read-only cache, so there
 * is nothing to revalidate in place: a catalog change rebuilds the site by hitting
 * the Worker's Deploy Hook. The response keeps the original contract so the caller
 * does not change.
 */
export const dynamic = 'force-dynamic';

function isAuthorized(header: string | null): boolean {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request.headers.get('authorization'))) {
    return NextResponse.json({ revalidated: false, error: 'Unauthorized' }, { status: 401 });
  }

  const hook = process.env.DEPLOY_HOOK_URL;
  if (!hook) {
    return NextResponse.json(
      { revalidated: false, error: 'DEPLOY_HOOK_URL is not configured' },
      { status: 501 }
    );
  }

  try {
    const res = await fetch(hook, { method: 'POST' });
    if (!res.ok) {
      return NextResponse.json(
        { revalidated: false, error: `Deploy hook returned ${res.status}` },
        { status: 502 }
      );
    }
  } catch (err) {
    console.error('Deploy hook request failed:', err);
    return NextResponse.json(
      { revalidated: false, error: 'Deploy hook request failed' },
      { status: 502 }
    );
  }

  return NextResponse.json({ revalidated: true, now: Date.now() });
}
