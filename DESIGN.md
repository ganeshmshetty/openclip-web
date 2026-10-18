---
name: OpenClip Web
description: Marketing site and docs portal for OpenClip — Apple-system palette, layered glass, one blue accent.
colors:
  accent: "#0071e3"
  accent-hover: "#0077ed"
  accent-dark: "#2997ff"
  accent-hover-dark: "#47a6ff"
  accent-soft: "rgba(0, 113, 227, 0.08)"
  accent-soft-dark: "rgba(41, 151, 255, 0.14)"
  app-bg: "#f5f5f7"
  app-bg-dark: "#000000"
  surface: "#ffffff"
  surface-dark: "#121212"
  surface-elevated: "#ffffff"
  surface-elevated-dark: "#1c1c1e"
  surface-tertiary: "#ebebed"
  surface-tertiary-dark: "#2c2c2e"
  text-primary: "#1d1d1f"
  text-primary-dark: "#f5f5f7"
  text-secondary: "#6e6e73"
  text-secondary-dark: "#a1a1a6"
  text-tertiary: "#86868b"
  text-tertiary-dark: "#6e6e73"
  border-subtle: "rgba(0, 0, 0, 0.08)"
  border-subtle-dark: "rgba(255, 255, 255, 0.10)"
  border-strong: "rgba(0, 0, 0, 0.16)"
  border-strong-dark: "rgba(255, 255, 255, 0.18)"
  success: "#10b981"
  warning: "#f59e0b"
  ai-accent: "#a855f7"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Inter, system-ui, sans-serif"
    fontSize: "clamp(2.125rem, 7vw, 4rem)"
    fontWeight: 700
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Inter, system-ui, sans-serif"
    fontSize: "clamp(1.25rem, 3vw, 1.75rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.05em"
  mono:
    fontFamily: "'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
rounded:
  xxs: "4px"
  xs: "6px"
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "14px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "8px 18px"
    typography: "500 / 13.5px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "8px 18px"
    typography: "500 / 13.5px"
  nav-pill:
    backgroundColor: "rgba(255, 255, 255, 0.85)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: "34px"
    typography: "500 / 12.5px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
  glass-card:
    backgroundColor: "rgba(255, 255, 255, 0.85)"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.xl}"
    padding: "16px 20px"
  keycap:
    backgroundColor: "{colors.surface-tertiary}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.xxs}"
    height: "20px"
    typography: "500 / 11px mono"
  badge-accent:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
    rounded: "{rounded.xs}"
    padding: "2px 8px"
    typography: "600 / 11.5px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "6px 12px"
    typography: "400 / 13px"
---

# Design System: OpenClip Web

## Overview

**Creative North Star: "The Floating Glass Panel"**

OpenClip Web renders macOS chrome directly in the browser. Every interactive surface is a frosted glass panel — a HUD, palette, or window — floating over a calm system-gray backdrop. The site is the app's demo stage: the same Liquid-Glass material language the macOS app ships, translated to the web with backdrop blur, saturation, and a soft "top light" on every panel.

The system is quietly confident. Density is moderate, transitions are sub-5ms-fast, and there is exactly one saturated color doing all the accent work (System Blue). Type is Apple's system font with SF Mono reserved for labels, keycaps, and code — the developer's voice lives in those mono details, not in decorative type. Depth is layered glass: surfaces are semi-opaque and blurred, shadows are ambient and soft, and nothing ever sits flat against a hard-edged panel. Both light and dark themes are first-class palettes, switched by CSS variables.

**Key Characteristics:**

- Frosted glass panels (backdrop blur + saturation + inset top-light) float over a neutral system-gray page.
- One accent — System Blue — drives every interactive state; hover resolves to accent-fill + white text.
- Apple system type (SF Pro / Inter) with SF Mono for labels, keycaps, code, and breadcrumbs.
- Crisp, instant micro-interactions: 0.15s transitions, active press at scale 0.98.
- Full light and dark themes via CSS variables (`:root` / `[data-theme="dark"]`), never a filter.
- Radius stays tight and size-relative (4px keycaps → 14px panels); hairlines separate sections.

## Colors

An Apple-system palette: warm-neutral grays and a single saturated blue. Semantic accents (emerald, amber, violet) are reserved for the docs portal's callouts and category icons — they never appear in product chrome.

### Primary
- **System Blue** (#0071e3): the one accent. CTAs, hover fills, active nav, focus borders, links. Dark: #2997ff.
- **System Blue Hover** (#0077ed): accent button hover. Dark: #47a6ff.
- **System Blue Soft** (rgba(0,113,227,0.08)): tinted fill behind selected nav items, AI badges, feedback pills. Dark: rgba(41,151,255,0.14).

### Neutral
- **System Gray** (#f5f5f7): page background, footer. Dark: #000000.
- **Glass White** (#ffffff): surface and panel backgrounds. Dark: #121212.
- **Elevated Glass** (#ffffff): menus, popovers, code blocks, AI result card. Dark: #1c1c1e.
- **Quarry** (#ebebed): tertiary fills — code-header bars, keycaps, hover rows, table headers. Dark: #2c2c2e.
- **Ink** (#1d1d1f): primary text. Dark: #f5f5f7.
- **Asphalt** (#6e6e73): secondary text, muted icons. Dark: #a1a1a6.
- **Steel** (#86868b): tertiary text, placeholders, breadcrumbs. Dark: #6e6e73.
- **Hairline** (rgba(0,0,0,0.08)): borders and dividers at rest. Dark: rgba(255,255,255,0.10).
- **Hairline Strong** (rgba(0,0,0,0.16)): keycap borders, strong borders, scrollbar. Dark: rgba(255,255,255,0.18).

### Semantic accents (docs only)
- **Success Green** (#10b981): copy-confirmed states, tip callouts.
- **Warning Amber** (#f59e0b): warning callouts, architecture category icon.
- **AI Violet** (#a855f7): security/agent callouts, runtimes category icon.

### Named Rules
**The One-Accent Rule.** System Blue is the only saturated color in product chrome. Any second saturated brand color breaks the native illusion — reserve emerald, amber, and violet for docs callouts and icons.
**The Dual Theme Rule.** Every surface exists twice — light (#f5f5f7 page) and dark (#000000 page). Dark mode is a first-class palette, not a filter: borders shift to white-alpha, blur and saturation rise, shadows deepen.

## Typography

**Display Font:** SF Pro Display (via `-apple-system`, `BlinkMacSystemFont`) with Inter as the bundled variable fallback, then system-ui.
**Body Font:** The same stack — no separate body face.
**Label/Mono Font:** SF Mono, ui-monospace, Menlo, Monaco, Consolas.

**Character:** Quiet Apple system type — tight tracking on display sizes, no serif, no display-font drama. The system's personality lives in the mono layer: uppercase micro-labels, keycaps, and code carry the developer voice.

### Hierarchy
- **Display** (700, 34px→64px clamp, 1.08, -0.035em): hero headline only ("Select text. Do things.").
- **Headline** (700, 20px→28px clamp, 1.2, -0.025em): section titles.
- **Title** (600, 14px): card titles, list-item titles.
- **Body** (400, 14–15px, 1.5): copy; hold to roughly 65ch.
- **Label** (500, 11.5–12px, +0.05em, uppercase, mono): eyebrow labels ("ENGINE", "PRIVACY"), breadcrumbs, table headers, sidebar section labels.
- **Mono Text** (400–500, 12–13px, mono): code, shortcuts, brew commands, keycaps, "On this page".

### Named Rules
**The Mono Eyebrow Rule.** Uppercase mono at 11.5–12px is the system's voice for metadata and data labels. Never set body copy in uppercase mono.
**The Tight-Display Rule.** Negative tracking scales with size: hero −0.035em, section titles −0.025em, small text −tight or none. Tight tracking is a size privilege, not a general style.

## Layout

Single-column, centered, generously padded. Max-width containers step up per section: `max-w-2xl` (hero), `max-w-3xl` (try-it hint), `max-w-4xl` (showcases, under-the-hood, CTA), `max-w-5xl` (footer), `max-w-7xl` (docs). Page padding is `px-5` mobile, `sm:px-8`. Sections stack vertically and are separated by a 1px hairline (`border-t border-subtle`) rather than whitespace alone; intra-section spacing uses 8/16/24px steps, and section rhythm is `py-14` (56px) mobile, `sm:py-20` (80px) desktop.

Key grids: showcase rows are 2-column on `md` (image | text, alternating order); "Under the hood" is a `gap-px` grid where the border color shows through between cells; the docs page is a 12-column layout (3 sidebar | 6–7 article | 2 TOC) with sticky sidebars on `lg`/`xl`. Everything collapses to a single column on mobile; the nav pill drops to brand + theme + hamburger, and the docs sidebar becomes a slide-in drawer.

### Named Rules
**The Hairline Division Rule.** Sections are divided by a 1px hairline, not spacing alone — whitespace is what happens inside a section.

## Elevation & Depth

Depth is layered glass. Surfaces are semi-opaque panels with backdrop blur + saturation; shadows are ambient and soft; and every glass panel carries an inset top-light highlight (`inset 0 1px 1px 0 rgba(255,255,255,0.9)`) — the one detail that makes a panel read as glass instead of a flat box. In dark theme, blur and saturation rise, shadows deepen to near-black, and the top-light weakens to white-alpha 0.15. Floating overlays (the search palette, nav pill, popup HUD) use the strongest shadow plus a 1px ring.

### Shadow Vocabulary
- **Ambient Sm** (`0 1px 2px rgba(0,0,0,0.04)` / dark `0 1px 3px rgba(0,0,0,0.5)`): resting cards, brew badge.
- **Ambient Md** (`0 4px 16px rgba(0,0,0,0.06)` / dark `0 8px 24px rgba(0,0,0,0.6)`): hover lift on panels.
- **Ambient Lg** (`0 12px 32px rgba(0,0,0,0.08)` / dark `0 20px 48px rgba(0,0,0,0.8)`): large panels, CTA.
- **Popup** (`0 12px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.08)` / dark `0 16px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.12)`): the nav pill, floating HUD, and search palette — anything that must read above everything else.

### Named Rules
**The Top-Light Rule.** Every frosted glass surface carries the inset top-light highlight. Without it, a panel reads flat, not glass — and flat panels are the one thing this system must never be.

## Shapes

The form language is Apple-rounded: radius is small and grows with surface size, never decorative. Keycaps at 4px, badges at 6px, buttons and inputs at 8px, the nav pill and HUD at 9–10px, cards and windows at 12–14px. Borders are 1px hairlines — border-subtle at rest, border-strong on hover and keycaps. There are no sharp right angles and no oversized radius; the deliberate 4→14px range is the entire vocabulary. Pills and the scrollbar thumb use full roundness (9999px) only where a true pill silhouette is required.

## Components

### Buttons
- **Shape:** rounded 8px (hero buttons step to 12px on `sm`); secondary carries a 1px hairline border.
- **Primary:** System Blue bg, white text, weight 500, padding 8px 18px (0.5rem 1.1rem). Hover: System Blue Hover. Active: `scale(0.98)` with a 0.1s transform.
- **Secondary:** Glass White bg, Ink text, Hairline border. Hover: surface-hover bg + Hairline Strong border. Active: `scale(0.98)`.
- **Link-style:** accent text at 13px/500 with a trailing ArrowRight; hover shifts to System Blue Hover. Used for "Explore Extensions Store" and inline CTAs.

### Navigation (Navbar)
- **Style:** one floating glass pill (nav-pill), 34px tall, rounded 10px, blur 28px, segmented by 1px dividers (currentColor at 0.12 opacity). Brand (icon + wordmark), links, GitHub, theme toggle, and Download share the pill.
- **States:** inactive 12.5px/500 at 0.8 opacity; hover and active both fill System Blue with white text — active adds weight 600.
- **Mobile:** below `md`, the pill collapses to brand + theme toggle + hamburger; the dropdown is the same pill, stacked, ending in a full-width System Blue Download row.

### Cards / Containers
- **Corner Style:** rounded 14px (glass-card), 12px (solid content cards, code blocks, callouts), 16px (CTA panel).
- **Background:** glass-card is frosted (white 0.85 + blur 24px); solid cards are Glass White.
- **Shadow Strategy:** Ambient Sm at rest; border-subtle → border-strong on hover. No hard drop shadows on content cards.
- **Internal Padding:** 16–24px (p-4/p-5/p-6, up to 32–40px on desktop).

### The Floating HUD & Palette (signature component)
- **mac-hud:** the in-browser replica of the OpenClip popup — frosted pill rounded 9px, blur 32px, popup shadow. Action cells are 32×32 at rounded 8px; hover fills System Blue with white icon. The AI trigger cell keeps accent-soft + accent Sparkles at rest.
- **Search palette (mac-window):** Spotlight-style overlay, ~340px wide, rounded 14px, popup shadow. Search row with mono `esc` keycap; result rows at 1px inset; the selected row fills System Blue with white text and an inline AI badge.
- **AI Result Card:** elevated surface, rounded 12px, hairline border; header row with accent Sparkles + "On-device" badge; typewriter body with an accent caret that pulses.

### Inputs / Fields
- **Style:** Glass White bg, 1px Hairline border, rounded 8px, 13px text. Focus: border shifts to System Blue — no ring, no glow.
- **Placeholder:** Steel tertiary.
- **Search:** leading icon at 3.5px, an inline clear affordance on the right.

### Badges & Keycaps
- **Badge Subtle:** Glass White bg, Hairline border, rounded 6px, 12px/500, Asphalt text — used for states like "On-device".
- **Badge Accent:** System Blue Soft bg + accent border, System Blue text, 11.5px/600 — used for "AI" and feedback pills.
- **Keycap:** Quarry bg, Hairline Strong border, rounded 4px, SF Mono 11px, min 20×20 — used for ⌘-key hints and the palette's esc.

### Code & Tables (docs)
- **CodeBlock:** rounded 12px, Glass White bg, SF Mono 13px; header bar in Quarry with a traffic-light dot (Hairline Strong at 0.6) + mono filename + Copy.
- **DocTable:** rounded 12px, Glass White bg; header row in Quarry, hairline dividers, hover row = surface-hover.
- **Callouts:** four semantic types — Note (System Blue Soft + accent border), Tip (Success Green at 10%), Important (Warning Amber at 10%), Security (AI Violet at 10%).

## Do's and Don'ts

### Do:
- **Do** use System Blue for every interactive accent and let hover resolve to accent-fill + white text.
- **Do** keep glass surfaces genuinely frosted — backdrop blur + saturation + the inset top-light. A solid white panel where a glass one belongs reads wrong.
- **Do** use the mono eyebrow (uppercase SF Mono, 11.5–12px) for labels, metadata, and breadcrumbs.
- **Do** ship both themes; dark mode is a first-class palette, never a filter.
- **Do** keep the radius tight and size-relative (4px → 14px).
- **Do** divide sections with the 1px hairline and spend whitespace inside sections.

### Don't:
- **Don't** introduce a second saturated brand color in product chrome — one accent is the rule.
- **Don't** use display fonts, serifs, or web-font novelty; Apple system type only.
- **Don't** fake elevation with flat white boxes and hard shadows; glass + soft ambient shadow.
- **Don't** add gradients or decorative flourish to product surfaces.
- **Don't** set body copy in uppercase mono, and never loosen display tracking below −0.02em.