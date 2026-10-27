import { timingSafeEqual } from 'node:crypto';
import { revalidatePath, revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * On-demand revalidation, called by the openclip-extensions repo's
 * `revalidate-site` workflow after the published catalog changes.
 * Requires `Authorization: Bearer <REVALIDATE_SECRET>`.
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

  revalidateTag('extensions', { expire: 0 });
  revalidatePath('/extensions');
  revalidatePath('/extensions/[id]', 'page');

  return NextResponse.json({ revalidated: true, now: Date.now() });
}
