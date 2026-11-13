/**
 * Bakes the GitHub star count into the build, so the navbar renders it without a
 * request to /api/v1/stars on every page load. The site rebuilds on every deploy
 * (including the catalog deploy hook), which keeps the number fresh enough.
 *
 * Fallback: if GitHub can't be reached, the last committed value in
 * src/lib/github-stars.json is kept, so a build never fails or shows 0 because of it.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const REPO = 'ganeshmshetty/openclip';
const OUT = join(__dirname, '../src/lib/github-stars.json');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

async function main() {
  const previous = existsSync(OUT)
    ? (JSON.parse(readFileSync(OUT, 'utf-8')) as { stars: number | null; fetchedAt: string | null })
    : { stars: null, fetchedAt: null };

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'OpenClip-Web-Build',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
    const data = (await res.json()) as { stargazers_count?: unknown };
    const stars = data.stargazers_count;
    if (typeof stars !== 'number' || stars <= 0) throw new Error('no stargazers_count');
    writeFileSync(OUT, JSON.stringify({ stars, fetchedAt: new Date().toISOString() }, null, 2) + '\n');
    console.log(`[Stars] ✓ ${stars} stars`);
  } catch (err) {
    if (!existsSync(OUT)) writeFileSync(OUT, JSON.stringify(previous, null, 2) + '\n');
    console.warn(`[Stars] ⚠ ${(err as Error).message}; keeping ${previous.stars ?? 'no'} stars from the last build`);
  }
}

main();
