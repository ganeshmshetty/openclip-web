import { NextRequest, NextResponse } from 'next/server';
import { EDGE_CACHE_5_MIN } from '@/lib/edge-cache';

const REPO = 'ganeshmshetty/openclip';
const GITHUB_RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const FALLBACK_RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache
let cachedDmgUrl: string | null = null;
let cachedZipUrl: string | null = null;
let cachedAt = 0;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const format = searchParams.get('format')?.toLowerCase();
  const isZip = format === 'zip';
  const now = Date.now();

  const cachedTarget = isZip ? cachedZipUrl : cachedDmgUrl;
  if (cachedTarget && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.redirect(cachedTarget, {
      status: 307,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  }

  try {
    const headers: HeadersInit = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'OpenClip-Web',
    };

    if (GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
    }

    const res = await fetch(GITHUB_RELEASE_API_URL, {
      ...EDGE_CACHE_5_MIN,
      headers,
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data = await res.json();
      const assets = data.assets || [];
      const dmgAsset = assets.find((a: { name: string; browser_download_url: string }) =>
        a.name.endsWith('.dmg')
      );
      const zipAsset = assets.find((a: { name: string; browser_download_url: string }) =>
        a.name.endsWith('.zip')
      );

      if (dmgAsset?.browser_download_url) {
        cachedDmgUrl = dmgAsset.browser_download_url;
      }
      if (zipAsset?.browser_download_url) {
        cachedZipUrl = zipAsset.browser_download_url;
      }
      cachedAt = now;

      const targetUrl = isZip
        ? cachedZipUrl || cachedDmgUrl || FALLBACK_RELEASES_URL
        : cachedDmgUrl || FALLBACK_RELEASES_URL;

      return NextResponse.redirect(targetUrl, {
        status: 307,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      });
    }
  } catch (err) {
    console.error('Error resolving latest release in /download route:', err);
  }

  // Fallback to latest GitHub release page if API throttled or errored
  const fallback = (isZip ? cachedZipUrl : cachedDmgUrl) || FALLBACK_RELEASES_URL;
  return NextResponse.redirect(fallback, { status: 307 });
}

export async function HEAD(request: NextRequest) {
  return GET(request);
}
