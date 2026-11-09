#!/usr/bin/env node
/**
 * Post-deploy smoke test.
 *
 * Fetches the live sitemap and verifies every URL, plus the critical routes and
 * the extensions API. Exits non-zero on the first class of failure so a deploy
 * check / uptime monitor can gate on it.
 *
 * Usage: node scripts/smoke.mjs
 *        SMOKE_BASE_URL=http://localhost:8788 node scripts/smoke.mjs
 */

const BASE = (process.env.SMOKE_BASE_URL || 'https://www.getopenclip.app').replace(/\/+$/, '');
const CONCURRENCY = 10;

const REQUIRED_ROUTES = [
  '/',
  '/docs',
  '/docs/javascript',
  '/docs/getting-started',
  '/extensions',
  '/changelog',
  '/support',
  '/api/v1/extensions',
  '/sitemap.xml',
  '/robots.txt',
];

const failures = [];

async function check(url, { expect = 200, validate, follow = false } = {}) {
  let response;
  try {
    response = await fetch(url, {
      redirect: follow ? 'follow' : 'manual',
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    failures.push(`${url} — request failed: ${error?.message || error}`);
    return;
  }

  if (response.status !== expect) {
    failures.push(`${url} — expected ${expect}, got ${response.status}`);
    return;
  }

  if (validate) {
    try {
      await validate(response);
    } catch (error) {
      failures.push(`${url} — ${error?.message || error}`);
    }
  }
}

async function pool(items, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  });
  await Promise.all(runners);
}

async function main() {
  console.log(`Smoke testing ${BASE}`);

  for (const route of REQUIRED_ROUTES) {
    if (route === '/api/v1/extensions') {
      await check(`${BASE}${route}`, {
        follow: true,
        validate: async (response) => {
          const body = await response.json();
          if (!Array.isArray(body.extensions)) throw new Error('missing extensions array');
          if (!Number.isFinite(body.totalCount) || body.totalCount < 1) {
            throw new Error(`catalog is empty (totalCount=${body.totalCount})`);
          }
        },
      });
    } else {
      await check(`${BASE}${route}`, { follow: true });
    }
  }

  const sitemapResponse = await fetch(`${BASE}/sitemap.xml`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!sitemapResponse.ok) {
    failures.push(`/sitemap.xml — expected 200, got ${sitemapResponse.status}`);
  } else {
    const sitemap = await sitemapResponse.text();
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    if (urls.length === 0) {
      failures.push('/sitemap.xml — contains no <loc> entries');
    }
    console.log(`Checking ${urls.length} sitemap URLs…`);
    await pool(urls, (url) => check(url));
  }

  if (failures.length > 0) {
    console.error(`\n✗ ${failures.length} failure(s):`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('✓ All smoke checks passed');
}

main().catch((error) => {
  console.error('Smoke test crashed:', error);
  process.exit(1);
});
