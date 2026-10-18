# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users: individual macOS users and developers (B2C — no company or enterprise targeting). Two jobs this site serves:

- **End users:** "I selected text and want to act on it without switching apps or re-typing." They decide on a single free download.
- **Developers:** they write and install OpenClip extensions, and need the manifest/runtime spec, authoring docs, and the extension store.

Conversion action: download/install the app (brew or GitHub releases) and use it; for developers, ship extensions.

## Product Purpose

OpenClip is a free, open-source macOS utility — a lightweight floating action bar that turns any selected text into instant actions (copy, cut, paste, search, transform, calculate, AI writing, and user scripts/extensions). A hotkey (⌥⌘C) opens a fuzzy action-search palette over the whole catalog. Selections are read via macOS Accessibility APIs — never the clipboard — and nothing about the text is stored.

This web app is OpenClip's marketing site, docs portal, and extension store. Its job: drive downloads and adoption, serve developer docs, and let users browse/install extensions. Success means installs, GitHub stars, and extension contributions.

## Positioning

OpenClip reads the live selection via Accessibility (never touches or pollutes the clipboard) with 100% on-device processing and zero telemetry, and couples inline AI writing, local calculation, and a one-click extension store in one native floating bar. Free and AGPL-3.0 licensed.

Positioning note (confirmed): the headline angle is "select text, do things, instantly & privately" — not "alternative to PopClip." PopClip is a direct competitor but not the headline.

## Operating Context

- macOS 14+ app (Swift 6, AppKit + SwiftUI); supports Liquid Glass on macOS 26+, Classic/Glass themes, Light/Dark.
- Install via `brew install openclip` or download from GitHub releases.
- Extension catalog served from `ganeshmshetty/openclip-extensions` (raw.githubusercontent.com, branch `main`), proxied and TTL-cached by the site.
- Install is an `openclip://install?id=…&name=…&url=…` deep link.
- Docs portal mirrors the authoritative extension manifest/runtime spec in the repo root `docs/developer-guide/AGENTS.md` — the two must stay in sync.
- Deployed on Vercel; base URL from `NEXT_PUBLIC_SITE_URL`, falls back to `https://getopenclip.app`.
- Site theme persists under `openclip-theme` in localStorage; a head script prevents flash.

## Capabilities and Constraints

- Requires macOS Accessibility permission to read selections live (never the clipboard); grantable or revocable anytime in Preferences.
- macOS 14+ only. Anti-persona: macOS 13 and earlier, users who won't grant Accessibility, people who never select text.
- Free, AGPL-3.0 licensed, open source, no pricing. Pre-launch: 0 downloads tracked; no public logos or testimonials — future work must not fabricate them.
- Extensions can be JS, AppleScript, shell, URL, or Shortcuts. Unknown manifest keys are ignored; unknown extension `type` strings reject the whole package.
- Site stack is fixed by the existing codebase: Next.js 16.2.12 (App Router), React 19, TypeScript strict, Tailwind CSS v4, lucide-react, bun. No test suite.
- No localization or launch-date commitment established.

## Brand Commitments

- Name: OpenClip. Creator/author: Ganesh M.
- Tagline and voice: "Select text. Do things." Confident, technical, developer-friendly; direct, concrete, jargon-light, short punchy sentences.
- Words to use: instant, floating action bar, select → act, privacy-first, on-device, extension store, no clipboard, free & open source.
- Words to avoid: clipboard manager (it isn't), agent/assistant (overloaded), "alternative to [competitor]" as a headline.
- Assets: `/icons/openclip-icon.svg` (favicon) and apple-touch `openclip-icon.png`; opengraph/twitter images; showcase cards reference `/gifs/*.gif` — not yet committed, rendered as placeholders.
- Glossary: **Action** — a single thing the bar can run; **Extension** — a ready-made add-on installed from the store in one click; **Palette** — the fuzzy action-search opened with ⌥⌘C.

## Evidence on Hand

- `.agents/product-marketing.md` (v1, 2026-08-16) — full marketing context: audience, JTBD, differentiation, objections, customer language, proof points.
- `src/app/layout.tsx` — JSON-LD (WebSite + SoftwareApplication: free, macOS 14.0+, downloadUrl), SEO metadata, theme handling.
- `src/docs/content/*.tsx` — user guide, extension authoring, runtimes & APIs, architecture docs (registry in `src/docs/registry.ts`).
- `src/lib/extensions.ts` + `src/app/api/v1/extensions/route.ts` — catalog/stats proxy with TTL cache.
- `src/app/page.tsx` (home), `src/app/extensions/*`, `src/app/docs/*`, `sitemap.ts`, `robots.ts`.
- Absences future work must not fabricate: no testimonials, no public customer logos, no pricing, no committed showcase GIFs, no tracked downloads.

## Product Principles

1. **Privacy-first is the product** — on-device, zero telemetry, never touches the clipboard; never undermine this claim in copy or features.
2. **Instant and native** — the site should feel as fast and macOS-native as the app; the floating action bar is the mental model for everything.
3. **Free and open** — AGPL-3.0, brew-installable, open extension ecosystem; no invented monetization, pricing, or deployment claims.
4. **Evidence before hype** — no testimonials, benchmarks, or logos that don't exist yet; pre-launch honesty is a feature.
5. **Select text, do things** — copy stays direct, concrete, jargon-light; "select → act" framing throughout.

## Accessibility & Inclusion

- Site ships light/dark themes via CSS variables, respects system preference, and persists the choice under `openclip-theme`.
- No other product-specific accessibility requirement was established; the macOS app's Accessibility permission need is a capability, not a site requirement.