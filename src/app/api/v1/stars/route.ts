import { NextResponse } from 'next/server';

const REPO = 'ganeshmshetty/openclip';
const GITHUB_API_URL = `https://api.github.com/repos/${REPO}`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

export const dynamic = 'force-dynamic';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let cachedStars: number | null = null;
let cachedAt = 0;

export async function GET() {
  const now = Date.now();

  if (cachedStars !== null && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ stars: cachedStars }, {
      headers: {
        'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
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

    const res = await fetch(GITHUB_API_URL, {
      headers,
      next: { revalidate: 900 },
    });

    if (res.ok) {
      const data = await res.json();
      const count = typeof data.stargazers_count === 'number' ? data.stargazers_count : 0;
      cachedStars = count;
      cachedAt = now;
      return NextResponse.json({ stars: count }, {
        headers: {
          'Cache-Control': 'public, s-maxage=900, stale-while-revalidate=1800',
        },
      });
    }

    // Return fallback if throttled or error
    return NextResponse.json({ stars: cachedStars ?? 0 });
  } catch (err) {
    console.error('Error fetching GitHub stars:', err);
    return NextResponse.json({ stars: cachedStars ?? 0 });
  }
}
