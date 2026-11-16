/**
 * GET /download: 307 to the latest OpenClip release asset (`?format=zip` for the
 * zip). This stays dynamic because app releases are published in another repo and
 * do not rebuild the site; baking the URL would point at an old release until the
 * next deploy. Ported from the old Next.js route as is, minus Next.js.
 */
import type { Env } from './http';

const REPO = 'ganeshmshetty/openclip';
const GITHUB_RELEASE_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const FALLBACK_RELEASES_URL = `https://github.com/${REPO}/releases/latest`;
const CACHE_TTL_MS = 5 * 60 * 1000;
const REDIRECT_CACHE = 'public, s-maxage=300, stale-while-revalidate=600';

let cachedDmgUrl: string | null = null;
let cachedZipUrl: string | null = null;
let cachedAt = 0;

function redirect(location: string, cacheable: boolean): Response {
  const headers: Record<string, string> = { Location: location };
  if (cacheable) headers['Cache-Control'] = REDIRECT_CACHE;
  return new Response(null, { status: 307, headers });
}

export async function handleDownload(url: URL, env: Env): Promise<Response> {
  const isZip = url.searchParams.get('format')?.toLowerCase() === 'zip';
  const now = Date.now();

  const cachedTarget = isZip ? cachedZipUrl : cachedDmgUrl;
  if (cachedTarget && now - cachedAt < CACHE_TTL_MS) return redirect(cachedTarget, true);

  try {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'OpenClip-Web',
    };
    const token = env.GITHUB_TOKEN || env.GH_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(GITHUB_RELEASE_API_URL, {
      cf: { cacheTtl: 300 },
      headers,
      signal: AbortSignal.timeout(5000),
    } as RequestInit);

    if (res.ok) {
      const data = (await res.json()) as { assets?: { name: string; browser_download_url: string }[] };
      const assets = data.assets || [];
      const dmgAsset = assets.find((a) => a.name.endsWith('.dmg'));
      const zipAsset = assets.find((a) => a.name.endsWith('.zip'));
      if (dmgAsset?.browser_download_url) cachedDmgUrl = dmgAsset.browser_download_url;
      if (zipAsset?.browser_download_url) cachedZipUrl = zipAsset.browser_download_url;
      cachedAt = now;

      const target = isZip
        ? cachedZipUrl || cachedDmgUrl || FALLBACK_RELEASES_URL
        : cachedDmgUrl || FALLBACK_RELEASES_URL;
      return redirect(target, true);
    }
  } catch (err) {
    console.error('Error resolving latest release in /download:', err);
  }

  // Fallback to the latest GitHub release page if the API throttled or errored.
  return redirect((isZip ? cachedZipUrl : cachedDmgUrl) || FALLBACK_RELEASES_URL, false);
}
