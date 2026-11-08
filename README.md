# OpenClip website

Marketing site and docs portal for OpenClip, built with Next.js (App Router). Deployed to
**Cloudflare Workers** through the [OpenNext adapter](https://opennext.js.org/cloudflare).

## Commands

```bash
bun dev            # http://localhost:3000
bun run lint
bun run build      # next build; also runs the predev/prebuild sync scripts
bun run preview    # build + serve in the Workers runtime (workerd) on :8787
bun run deploy     # build + deploy to Cloudflare
```

`bun run preview` is the one that matters before shipping: it runs the same `workerd` runtime
production uses, where `node:fs`, `node:path` and the Node.js globals behave differently from
`next dev`.

## Deployment

Config lives in `wrangler.jsonc` (Worker, static assets, compatibility flags) and
`open-next.config.ts` (caching). Details:

- **Every page is prerendered at build time.** `open-next.config.ts` uses the read-only
  Static Assets incremental cache, so nothing is written at runtime and `revalidate` exports are
  not supported by it — a page is as fresh as the last deploy. Do not add `export const revalidate`
  to a page; it will be served stale then re-rendered on every request.
- **Assets before the Worker.** Public files and `/_next/static` are matched by Workers Static
  Assets (`run_worker_first: false`) and are not billed. Prerendered HTML and API routes do run
  the Worker.
- **Static-asset headers** belong in `public/_headers`, not `next.config.ts` — `headers()` never
  applies to files served by the asset layer.
- `wrangler deploy` must be run with the cache populated; `bun run deploy` does that for you.

### Environment

| Name | Where | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SITE_URL` | build env | Canonical origin. Falls back to `https://www.getopenclip.app`. |
| `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` | build env | Cloudflare Web Analytics beacon. Omitted when unset. |
| `GITHUB_TOKEN` | Worker secret | Raises GitHub rate limits for the stars/download routes. |
| `REVALIDATE_SECRET` | Worker secret | Bearer token for `POST /api/revalidate`, called by the extensions repo. |
| `DEPLOY_HOOK_URL` | Worker secret | Workers Builds deploy hook that `/api/revalidate` triggers. |

`NEXT_PUBLIC_*` values are inlined at build time; the rest are runtime secrets:

```bash
bunx wrangler secret put GITHUB_TOKEN
bunx wrangler secret put REVALIDATE_SECRET
bunx wrangler secret put DEPLOY_HOOK_URL
```

### Publishing a catalog change

There is no ISR to revalidate in place — pages are frozen at build time. The extensions repo
already calls `POST /api/revalidate` with `Authorization: Bearer <REVALIDATE_SECRET>`; that route
now fires the Workers Builds **deploy hook** (Workers → Settings → Build → Deploy hooks), so a
catalog publish produces one rebuild instead of thousands of background revalidations. Without
`DEPLOY_HOOK_URL` the route returns `501` and the site only refreshes on the next push.

### First deploy / domain cutover

1. `bun run deploy` to get a `*.workers.dev` URL; smoke-test the routes below.
2. Add the zone in Cloudflare, then attach `www.getopenclip.app` as a Worker **custom domain**
   and redirect the apex to `www`.
3. Verify `/`, `/extensions/<id>`, `/docs/getting-started`, `/api/v1/extensions`, `/download`
   (307 to the GitHub release), `/opengraph-image` and `/sitemap.xml`.
4. Keep the old deployment reachable until DNS has fully propagated, then remove it.

The site is inside the free tier for bandwidth and asset requests; Workers **Paid** ($5/month) is
recommended for the 30 s CPU ceiling rather than the 10 ms free ceiling, which server-rendered
routes can exceed.
