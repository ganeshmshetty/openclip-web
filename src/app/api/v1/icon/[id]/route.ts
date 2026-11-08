import { NextResponse } from 'next/server';

/**
 * Same-origin icon proxy for extensions that have no static icon yet.
 *
 * The store ships icons from `public/icons/extensions` (copied at build), but the
 * live catalog can list an extension newer than the local extensions clone. Rather
 * than making the browser reach a third-party CDN, fetch it here and let the edge
 * cache the result.
 */

const REPO = 'ganeshmshetty/openclip-extensions';

// Ids are dotted reverse-DNS strings; anything else is rejected before it reaches the URL.
const ID_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!ID_PATTERN.test(id) || id.includes('..')) {
    return new NextResponse('Invalid icon id', { status: 400 });
  }

  const upstream = `https://cdn.jsdelivr.net/gh/${REPO}@main/published/icons/${id.toLowerCase()}.svg`;

  try {
    const res = await fetch(upstream);
    if (!res.ok) return new NextResponse('Icon not found', { status: 404 });

    const svg = await res.text();
    if (!svg.trim().startsWith('<svg')) {
      return new NextResponse('Upstream did not return an SVG', { status: 404 });
    }

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'CDN-Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch {
    return new NextResponse('Icon unavailable', { status: 502 });
  }
}
