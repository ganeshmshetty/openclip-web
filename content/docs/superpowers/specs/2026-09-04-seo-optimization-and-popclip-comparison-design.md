# Design Spec: SEO Optimization & PopClip Competitor Landing Page

**Date**: 2026-09-04  
**Status**: Approved by user ("Do everything")  
**Goal**: Maximize organic search indexing, resolve Google Search Console "Discovered - currently not indexed" for 99+ extensions, and capture the #1 search query ("PopClip alternative for macOS") via a dedicated landing page.

---

## 1. Context & Problems Identified

1. **GSC Bottleneck**: 99 extension pages sit in "Discovered – currently not indexed" because they represent thin content (~15 words each) without internal linking meshes or schema markup.
2. **Structured Data Contamination**: `FAQPage` JSON-LD is located in root `layout.tsx`, forcing FAQ schemas onto 100+ pages that do not have visible FAQs (violating Google Search Central policies).
3. **Double Branding in Metadata**: `title.template` in `layout.tsx` causes `%s | OpenClip` to render redundant brand names (e.g. `Word Count — OpenClip Extension | OpenClip`).
4. **Sitemap Deficiencies**: Missing `/changelog`, missing comparison page, and using dynamic `new Date()` timestamps on every crawl.
5. **Entity Ambiguity & High-Intent Opportunity**: Live Google searches for "PopClip alternative" already recommend OpenClip, but lack a dedicated, authoritative landing page (`/compare/popclip`) to capture and convert users.

---

## 2. Technical Architecture & Changes

### A. Root Layout & Schema Sanitization (`src/app/layout.tsx`)
- Extract `FAQPage` JSON-LD from `layout.tsx` and place it strictly in `HomeContent.tsx` (or `app/page.tsx`).
- Keep `WebSite` and root `SoftwareApplication` in `layout.tsx`.

### B. Title Template Cleanup
- In `src/app/extensions/[id]/page.tsx`, set `title: "${ext.name} Extension"` so Next.js renders `${ext.name} Extension | OpenClip` cleanly without repeating "OpenClip".
- In `src/app/docs/[slug]/page.tsx`, set `title: "${doc.title} — Documentation"` so it renders as `${doc.title} — Documentation | OpenClip`.

### C. Sitemap Architecture (`src/app/sitemap.ts`)
- Add static routes:
  - `/changelog` (priority: 0.7, changeFrequency: 'weekly')
  - `/compare/popclip` (priority: 0.9, changeFrequency: 'weekly')
- Differentiate extension priorities:
  - Recommended extensions (`CURATED_RECOMMENDED_IDS`): priority 0.8
  - Catalog extensions: priority 0.6
- Replace per-request `new Date()` with a stable last-updated date or content-derived date.

### D. Programmatic SEO for Extensions (`src/app/extensions/[id]/`)
- In `ExtensionDetailContent.tsx`:
  - **"How to Use" Step-by-Step Workflow**: Clear 3-step guide on how to highlight text and trigger the extension using the popup or `⌥⌘C`.
  - **"Technical Capabilities"**: Explains local execution, privacy, and zero telemetry.
  - **"Related Extensions" Cross-Linking**: Automatically select 3-4 other extensions from the catalog with direct crawlable links (`<Link href="...">`). This provides Googlebot with an interconnected crawl web across all 97+ extensions.
- In `src/app/extensions/[id]/page.tsx`:
  - Add `BreadcrumbList` schema: `Home > Extensions > [Extension Name]`.
  - Add extension-specific `SoftwareApplication` (addon) schema.

### E. Dedicated Competitor Landing Page (`src/app/compare/popclip/`)
- Page route: `/compare/popclip`
- Metadata:
  - Title: `OpenClip vs PopClip — The Modern Free & Open Source Alternative for macOS`
  - Description: `Compare OpenClip and PopClip for macOS. Free, open-source Swift 6 native action bar with local AI (Ollama), streaming cards, 100+ extensions, and zero subscriptions.`
  - Canonical: `https://www.getopenclip.app/compare/popclip`
  - `FAQPage` schema addressing PopClip switching questions.
- Content sections:
  1. **Hero**: Clear statement of differences: 100% Free MIT Open Source, Swift 6 native, modern macOS Sonoma & Sequoia integration.
  2. **Detailed Feature Matrix**:
     - Pricing: Free ($0) vs $20+ paid license
     - Architecture: Swift 6 + AppKit native vs older runtime
     - Local & Cloud AI: Built-in Ollama offline + Apple Intelligence + OpenAI/Claude streaming cards
     - Extension Language Support: JavaScript, AppleScript, Shell, Shortcuts
     - Keyboard Access: Universal Command Palette (`⌥⌘C`)
     - Privacy: 100% local, zero telemetry, Keychain storage
  3. **Migration Guide**: How to recreate or import PopClip actions into OpenClip.
  4. **Call to Action**: Direct DMG download + Homebrew Cask command.
- Cross-linking:
  - Link from Site Footer (`Compare PopClip`).
  - Link from Home page FAQ answer.

### F. Homepage Semantic Keyword Enhancement
- In `HomeContent.tsx`:
  - Add accessible screen-reader / search crawler keyword context to `<h1>`:
    `Select text.<br />Do things.<span className="sr-only"> — Free, Open Source Floating Action Bar for macOS & PopClip Alternative</span>`
- In `showcase-preview/page.tsx`:
  - Add `robots: { index: false, follow: false }` to prevent indexing of developer sandbox.

---

## 3. Verification & Acceptance Criteria
1. `bun run build` succeeds with zero errors.
2. `sitemap.xml` generates valid XML including `/compare/popclip`, `/changelog`, docs, and prioritized extensions.
3. No `FAQPage` schema on `/extensions/*` or `/docs/*`.
4. Extension detail pages contain >250 words of unique, helpful context plus 3-4 internal links to related extensions.
5. All metadata canonicals point to `https://www.getopenclip.app/*`.
