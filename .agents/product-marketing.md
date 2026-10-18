# Product Marketing Context

**Document version:** v1
**Last updated:** 2026-08-16

## Product Overview
**One-liner:** A lightweight floating popup for macOS that turns any selected text into instant actions.
**What it does:** Select text in any app and a floating action bar appears with contextual actions — copy, cut, paste, search, transform, calculations, AI writing, and your own scripts and extensions. A hotkey (⌥⌘C) turns it into a fuzzy action-search palette over the whole catalog. Reads selections via macOS Accessibility APIs — never touches your clipboard or stores anything about your text.
**Product category:** macOS text-selection utility (searches as "macOS floating action bar", "text selection actions")
**Product type:** Open-source macOS desktop app (Swift 6, AppKit + SwiftUI)
**Business model:** Free, AGPL-3.0 licensed, open source. Install via `brew install openclip` or download from GitHub releases. No pricing.

## Target Audience
**Target companies:** Consumers & individual developers — no company targeting (B2C/individual)
**Decision-makers:** The end user (free download, single decision maker)
**Primary use case:** "I select text and want to act on it without switching apps or re-typing."
**Jobs to be done:**
- Act on selected text instantly (copy, search, transform, calculate, translate) without leaving the current app
- Trigger custom workflows (scripts, web searches, AI presets) from anywhere
- Fix/summarize/rewrite selected text with AI inline
**Use cases:**
- Writers/editors doing grammar, case transforms, word completion, spell check
- Developers running scripts on snippets, web searching terms, formatting SQL
- Anyone using Apple Intelligence / Ollama / OpenAI / Claude for quick text tasks
- Power users who want a fast, private, extensible selection tool

## Problems & Pain Points
**Core problem:** Acting on selected text means copying, switching apps, pasting into another tool, doing the thing, copying back. Slow, context-switching, error-prone.
**Why alternatives fall short:**
- Copy/paste cycles into a browser or other app waste time and lose context
- Established selection tools are proprietary/paid with closed extension ecosystems and no AI
- No single tool couples inline AI writing + calculation + scripts/extensions in one floating bar
**What it costs them:** Seconds per interaction, many times a day; context loss; friction that makes them skip the task entirely
**Emotional tension:** Frustration at repeated copy-switch-paste; the feeling of a clunky multi-app workflow for something that should be one click

## Competitive Landscape
**Direct:** **PopClip** (paid, proprietary macOS text-selection bar), other selection bar tools — closed source, closed extension model, clipboard-based, no AI presets, no local calculation.
**Secondary:** Clipboard managers (Paste, Raycast), text expanders (Raycast, Alfred), Automator/Shortcuts, macOS Services — different shape, same "stop re-typing" job, but no floating contextual bar on selection.
**Indirect:** The manual copy-switch-paste habit; AI chat apps (ChatGPT/Claude desktop) for rewriting.
*Positioning note: PopClip is a direct competitor but NOT the headline angle — the headline is "select text, do things, instantly & privately."*

## Differentiation
**Key differentiators:**
- Reads selection live via Accessibility — never touches or pollutes the clipboard
- Privacy-first: 100% on-device processing, zero telemetry, stores nothing about selections
- Extension ecosystem you can install in one click (JavaScript, AppleScript, shell, URL, Shortcuts) — no coding required
- Built-in extension store + point-and-click action editor
- Native AI writing inline (Apple Intelligence, Ollama, cloud LLMs) as first-class actions
- Local calculation (no Calculator.app), word completion & spell check
- Modern native look — Liquid Glass on macOS 26+, Classic or Glass themes, Light or Dark
**How we do it differently:** Native floating bar + live selection read instead of clipboard watching; everything is a first-class reorderable action.
**Why that's better:** Faster, private, easy to extend without writing Swift, and feels like a modern macOS app.
**Why customers choose us:** Free + open source, privacy, no clipboard pollution, AI + extensions + utilities in one bar.

## Objections
| Objection | Response |
|-----------|----------|
| "Accessibility permission?" | Required to read selections live (never the clipboard). Grant or revoke anytime in Preferences; nothing leaves the device. |
| "Is it as polished as the paid tool?" | Native Swift 6, instant response, Liquid Glass on macOS 26+, and a one-click extension store. |
| "I don't write code" | Built-ins work out of the box; extensions install from the store in one click — no scripting needed. |

**Anti-persona:** Users on macOS 13 or earlier; users who won't grant Accessibility permission; people who never select text (pure keyboard navigators).

## Switching Dynamics
**Push:** Frustration with copy-switch-paste; cost/licensing of paid tools; clipboard pollution from clipboard-based readers; lack of AI support.
**Pull:** Free, open source, privacy-first, one-click extensions, native AI writing, local math.
**Habit:** Existing selection-bar or copy-paste muscle memory; established Services/Shortcuts habits.
**Anxiety:** Granting Accessibility permissions; switching from a trusted paid tool to a new one.

## Customer Language
**How they describe the problem:**
- "I hate copy-pasting between apps just to do one thing."
- "The paid tool is good but closed and keeps touching my clipboard."
- "I want AI to fix this text right here, not in a browser tab."
**How they describe us:**
- "A floating action bar for macOS." / "Select text, do things."
**Words to use:** instant, floating action bar, select → act, privacy-first, on-device, extension store, no clipboard, free & open source
**Words to avoid:** clipboard manager (it isn't), agent/assistant (overloaded), internal metrics, "alternative to [competitor]" as the headline
**Glossary:**
| Term | Meaning |
|------|---------|
| Action | A single thing the bar can run (copy, search, script, AI preset) |
| Extension | A ready-made add-on you install from the store (one click) |
| Palette | The fuzzy action-search overlay you open with ⌥⌘C |

## Brand Voice
**Tone:** Confident, technical, developer-friendly
**Style:** Direct, concrete, jargon-light; short punchy sentences; "Select text. Do things."
**Personality:** Fast, privacy-respecting, open, macOS-native, modern

## Proof Points
**Metrics:** 100% on-device processing, zero telemetry, ~1-click extension installs, instant response
**Customers:** No public logos (pre-launch)
**Testimonials:** None yet (pre-launch)
**Value themes:**
| Theme | Proof |
|-------|-------|
| Privacy | Never touches the clipboard; 100% on-device; zero telemetry |
| Ease | Works out of the box; one-click extension store |
| Free & open | AGPL-3.0 license; install via brew |

## Goals
**Business goal:** Developer/community adoption of the open-source project — downloads, GitHub stars, extension contributions
**Conversion action:** Download/install the app (brew or GitHub releases) and use it
**Current metrics:** Pre-launch — 0 downloads tracked

## Changelog
- v1 (2026-08-16) — Initial context.
