# web/AGENTS.md

Marketing site + docs portal for OpenClip (a macOS app; the rest of the repo is Swift). Standalone Next.js app, deployed on Vercel.

## Stack & commands

- Next.js 16.2.12 (App Router), React 19, TypeScript strict, Tailwind CSS v4, `lucide-react` icons. Package manager is **bun** (`bun.lock`). No test suite.
- `bun dev` (http://localhost:3000) · `bun run lint` · `bun run build` · `bun run start`
- **Next 16 is newer than most training data — before writing Next-specific code, read the bundled docs in `node_modules/next/dist/docs/` and heed deprecation notices.**
- Deploys automatically from `web/` via Vercel (project "web"; `.vercel/` is gitignored). `vercel.json` sets `cleanUrls` and adds CORS headers for `/api/*`.

## Layout

- `src/app/page.tsx` — marketing homepage. Showcase cards reference `/gifs/*.gif` / `*.mp4`, auto-converted to hardware-accelerated MP4s at build time via `scripts/convert-gifs.ts`; `GifFrame` renders a "Drop into /public/gifs/" placeholder until you add them.
- `src/app/extensions/page.tsx` + `src/app/extensions/[id]/page.tsx` — extension store (server-rendered from the catalog; `[id]` pages have per-extension metadata and real 404s). Install is an `openclip://install?id=…&name=…&url=…` deep link.
- `src/app/api/v1/extensions/route.ts` — proxies `published/catalog.json` and `published/extension-stats.json` from `ganeshmshetty/openclip-extensions` (raw.githubusercontent.com, branch `main`) via `src/lib/extensions.ts`. In-memory TTL cache (catalog 5 min, stats 1 h). Optional `GH_TOKEN`/`GITHUB_TOKEN` env var (set on Vercel) raises api.github.com rate limits. When stats are unavailable, serve the last valid catalog rather than zeroed counts — and never cache zeroed counts.
- `src/app/docs/[slug]/page.tsx` — docs portal.
- The docs portal is **markdown-ingested directly from the repository's `docs/` folder**: `scripts/sync-docs.ts` runs at `predev`/`prebuild` to extract all markdown docs into `src/docs/data/docsData.json`, parsed and rendered natively via `MarkdownRenderer.tsx` and registered in `src/docs/registry.ts`. Add or edit `.md` files in `docs/` and the website picks them up automatically with zero double-maintenance. Each doc is statically generated at `/docs/<slug>` with per-doc canonical metadata, JSON-LD structured data (`TechArticle` and `BreadcrumbList`), and dynamic TOC.
- The extensions store is **server-rendered**: `src/lib/extensions.ts` fetches/caches the catalog (shared by the API route and the pages); `/extensions` and `/extensions/[id]` are dynamic server components with metadata, canonical, and real 404s for unknown ids.
- Repository `docs/` is the single source of truth for documentation.

## Conventions

- Theme via CSS variables in `src/app/globals.css` (`:root` = light, `[data-theme="dark"]` = dark). Use `var(--bg-*)`, `var(--text-*)`, `var(--accent)`, `var(--border-*)` — never hardcode colors. Theme persists under `openclip-theme` in localStorage; the inline script in `layout.tsx` `<head>` prevents flash.
- Reuse the Apple-style component classes in `globals.css` (`nav-pill`, `glass-card`, `mac-window`, `btn-primary`, …) and arbitrary-value Tailwind (`text-[13px]`). Shared UI lives in `src/app/components/`.
- Marketing copy guidance lives in `.agents/product-marketing.md` (voice, positioning, words to use/avoid).
- SEO lives in `layout.tsx` (metadata + JSON-LD), `sitemap.ts`, `robots.ts` (disallows `/api/`). Base URL = `NEXT_PUBLIC_SITE_URL` env, falls back to `https://getopenclip.app`.