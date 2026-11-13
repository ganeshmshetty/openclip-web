import { NextResponse } from 'next/server';
import githubStars from '@/lib/github-stars.json';

/**
 * Kept for anything outside the site that still calls it. The site itself now reads
 * the count baked in at build time (scripts/sync-stars.ts), and this route is
 * prerendered from the same value, so it never runs Worker code per request.
 */
export const dynamic = 'force-static';

export function GET() {
  const stars = typeof githubStars.stars === 'number' ? githubStars.stars : 0;
  return NextResponse.json({ stars });
}
