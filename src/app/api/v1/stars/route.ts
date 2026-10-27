import { NextResponse } from 'next/server';

const REPO = 'ganeshmshetty/openclip';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60',
  'CDN-Cache-Control': 'public, max-age=900, stale-while-revalidate=1800',
};
let cachedStars: number | null = null;
let cachedAt = 0;

export async function GET() {
  const now = Date.now();

  if (cachedStars !== null && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ stars: cachedStars }, {
      headers: CACHE_HEADERS,
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

    const res = await fetch(GITHUB_API_URL, {
      headers,
      next: { revalidate: 3600 },
    });

    if (res.ok) {
      const data = await res.json();
      const count = typeof data.stargazers_count === 'number' ? data.stargazers_count : 0;
      cachedStars = count;
      cachedAt = now;
      return NextResponse.json({ stars: count }, {
        headers: CACHE_HEADERS,
      });
    }

    // Return fallback if throttled or error
    return NextResponse.json({ stars: cachedStars ?? 0 }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('Error fetching GitHub stars:', err);
    return NextResponse.json({ stars: cachedStars ?? 0 }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
