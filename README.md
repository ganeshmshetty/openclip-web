# OpenClip website

Marketing site and docs portal for OpenClip, built with Next.js (App Router) as a **static
export** and served by **Cloudflare Workers Static Assets**. A small `worker.ts` handles the few
routes that need code at request time.

## Commands

```bash
bun dev            # http://localhost:3000 (pages only; no /api/*, /download, _redirects)
bun run lint
bun run build      # prebuild sync scripts + next build -> out/
bun run preview    # build + wrangler dev on :8787 (static files + worker.ts, like production)
bun run deploy     # build + wrangler deploy
```

`bun run preview` is the one that matters before shipping: it serves `out/` exactly as
production does, with `public/_headers`, `public/_redirects` and the Worker routes.

## Deployment

Config lives in `wrangler.jsonc`. Workers Builds runs **`bun run build`** and then
**`npx wrangler deploy`** (previews: `npx wrangler versions upload`). Details:

- **Every page is a file.** `next.config.ts` sets `output: "export"`, so `next build` writes HTML,
  the RSC `.txt` payloads used for client-side navigation, the OG images, the sitemap and
  `/api/v1/stars` into `out/`. Static Assets serves them without running the Worker. A page is as
  fresh as the last deploy, and anything that needs a request at runtime fails the build.
- **Only these routes run code** (`run_worker_first` in `wrangler.jsonc`, handlers in
  `src/worker/`): `GET /api/v1/extensions` (prebuilt JSON from `scripts/build-extensions-api.ts`,
  or search over the baked catalog), `GET /api/v1/icon/:id`, and `GET /download` (latest release,
  which is published from another repo and can't be baked). None of them load Next.js. Unknown
  paths get `out/404.html` with a 404 from Static Assets.
- **Headers and redirects** belong in `public/_headers` and `public/_redirects`; a static export
  does not support `headers()`/`redirects()` in `next.config.ts`.
- **Builds fail if GitHub can't serve the extensions catalog or stats**, rather than shipping an
  empty store or zeroed download counts.

### Environment

| Name | Where | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SITE_URL` | build env | Canonical origin. Falls back to `https://www.getopenclip.app`. |
| `NEXT_PUBLIC_CF_ANALYTICS_TOKEN` | build env | Cloudflare Web Analytics beacon. Omitted when unset. |
| `GITHUB_TOKEN` | Worker secret + build env | Raises GitHub rate limits for `/download` and the build-time fetches. Must be valid if set. |

`NEXT_PUBLIC_*` values are inlined at build time; `GITHUB_TOKEN` is a runtime secret:

```bash
bunx wrangler secret put GITHUB_TOKEN
```

### Publishing a catalog change

The extensions publish workflow dispatches the `sync-extensions` workflow in this repo. That
workflow copies the latest catalog and icons into `public/icons/extensions`, regenerates
`extension-icon-hashes.json` and `extensionsData.json`, and pushes to `main`. The push triggers the
normal Cloudflare build. Use the Workers Builds deploy hook from the Cloudflare dashboard if you
need a rebuild without a commit.

### First deploy / domain cutover

1. `bun run deploy` to get a `*.workers.dev` URL; smoke-test the routes below.
2. Add the zone in Cloudflare, then attach `www.getopenclip.app` as a Worker **custom domain**
   and redirect the apex to `www`.
3. Verify `/`, `/extensions/<id>`, `/docs/getting-started`, `/api/v1/extensions`, `/download`
   (307 to the GitHub release), `/opengraph-image` and `/sitemap.xml`.
4. Keep the old deployment reachable until DNS has fully propagated, then remove it.

The site is inside the free tier: static files cost no Worker invocations, and the Worker routes
use a few milliseconds of CPU at most (no Next.js server).
