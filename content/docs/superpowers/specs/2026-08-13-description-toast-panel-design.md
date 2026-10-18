# Description Toast Panel — Design

Date: 2026-08-13
Status: Approved (pending written review)

A small floating one-line toast that appears at the mouse cursor to tell the user what
just happened — e.g. "Copied", an error message, or a loading state for slow actions
like the Apple Music extension. It is the **single status surface**: it replaces the
inline status banner entirely and always renders floating (never inline), whether the
popup is open or has already closed.

---

## Problem

Three gaps today:

1. **Silent copy-downgrade.** When a `.paste` result is downgraded to `.copy`
   (right-click / ⇧-click → `forceCopy`, or `canPaste=false`), the copy happens
   silently (ActionResultDelivery.swift:40). The user has no idea a copy landed
   instead of a paste.
2. **Errors vanish on dismissal.** When an action throws and the popup is already
   dismissing, the error has no surface to render on.
3. **Slow actions freeze the popup.** `AppleScriptAction`/`ScriptAction.perform` block
   on the subprocess; Apple Music's `tell application "Music" activate` does not return
   until Music.app finishes launching. Dismissal is decided *after* `perform` returns
   (PopupWindowController.swift:653), so the popup sits frozen open with no feedback.

This feature adds a **floating description toast** — one line, optional icon,
auto-dismissing — gives slow actions an opt-in loading state that closes the popup
immediately and shows `[spinner] Opening …` until the result lands, and **replaces the
inline status banner** (`modeStore.statusBanner` + the strip above the bar) with this
one surface.

---

## Design Overview

### Toast panel component

A new floating panel modeled on `PopupPanel` conventions:

- **`ToastPanel`** — `NSPanel` subclass. Borderless, `.nonactivatingPanel`,
  `.floating` window level, never key. SwiftUI-drawn shadow (reuse `PopupPanel`'s
  approach; panel shadow stays off). Sized to fit content, clamped to the active
  screen.
- **`ToastPanelController`** — owns the panel, its `NSHostingView(ToastView)`, and the
  auto-dismiss timer. API:
  - `showLoading(message:)`
  - `show(feedback: StatusFeedback)`
  - `swapTo(feedback:)`
  - `hide()`
- **`ToastView`** — SwiftUI one-liner: `[spinner | icon] message`, `.lineLimit(1)`,
  themed through the existing `PopupThemeModel` tokens so it matches the bar.
- **Placement** — at `NSEvent.mouseLocation` captured at trigger time, clamped
  on-screen. The toast floats over the bar when the popup is still up and stays at the
  cursor after the popup closes — it never renders inline.
- **Timing** — info/error auto-dismiss **0.5 s** (`PopupMetrics.toastDurationNanoseconds`,
  an app-internal constant this pass; author-settable later). **Loading has no timer** —
  it lives until the action's result lands. (The old inline banner's
  `statusBubbleDurationNanoseconds` dismissal machinery is removed.)

### Toast states

| State | Render | Timer |
| :--- | :--- | :--- |
| `.loading` | `[spinner] Opening Apple Music…` | none — cleared on result |
| `.info` | `[icon] Copied` | 0.5 s auto-dismiss |
| `.error` | `[icon] <message>` | 0.5 s auto-dismiss |

`StatusFeedback` gains `isLoading: Bool = false` (pure Core; style stays `.info` while
loading). No new Core value type.

---

## Data Flow

### Trigger 1 — "Copied" (paste → copy downgrade only)

**Scope is deliberately narrow:** the toast fires **only** when a `.paste` result is
downgraded to `.copy`. Cases:

- force-copy click intent (right-click / ⇧-click → `.forceCopy`)
- `canPaste=false` (unified `PasteAvailability` says the target can't paste)

An action that natively returns `.copy` (e.g. the built-in Copy action) shows **no**
toast.

**Implementation:** in `PopupWindowController.handleEffect` (PopupWindowController.swift:594),
when the raw result is `.paste` and `resolveDelivery` returns `.copy`, present the
"Copied" toast. One check at the existing choke point — no `switch action.id`.

### Trigger 2 — All `.showStatus` results → toast (banner replaced)

The inline banner is **removed**. Every `.showStatus(StatusFeedback)` result now renders
as the floating toast, whether the popup stays up (keep-open) or is dismissing:

- **Keep-open** (`.showStatus` while the popup stays up, e.g. JS `showStatus`,
  `stayVisible`) → toast floats at the cursor over the bar; popup stays up.
- **Errors** thrown in `handleEffect` / `runAction` (`catch` paths) → toast at the cursor;
  popup stays if it's still up, or the toast is the only surface if it already hid.
- **While the AI card is open** — the queued-status machinery (`pendingStatus` /
  `flushPendingStatus`) is removed; the toast shows directly over the card.

The toast is now the **only** status renderer — `modeStore.statusBanner`,
`PopupView.statusBannerView`, `PopupWindowController.presentStatus`'s banner path, and
`statusBubbleDurationNanoseconds` are all deleted.

### Trigger 3 — Loading (slow actions, opt-in)

Actions declaring `showsLoading` (manifest `"loading": true`) get an early-close flow:

1. Presenter hides the popup immediately at click (no waiting for `perform`).
2. Shows `[spinner] Opening <title>…` at the cursor.
3. Runs `perform` in the background.
4. On result:
   - carries a description (`.copy` downgrade, error) → `swapTo`
   - no description (`.success`, `.openURL`, native `.copy`, `.paste` honored)
     → **the spinner just fades** (Apple Music's stdout is empty → `.success`)
   - defensively `.showStatus` / `.keepVisible` → spinner fades; the status (if any) is
     still surfaced as a toast and keep-open semantics remain the popup's concern.

---

## Surface Changes

### `ActionChrome`

Gains `showsLoading: Bool = false`. Chrome is presentation metadata, so this fits the
existing architecture. Mapped from the new manifest key `"loading"` in
`DefaultActionFactory`, and **documented in the dev-guide manifest spec**
(`docs/developer-guide/AGENTS.md`).

**Apple Music** (`Extensions/raw/AppleMusic.openclipext/openclip.json`) gets
`"loading": true`.

### `StatusFeedback`

Gains `isLoading: Bool = false` (pure Core, `Sendable`/`Equatable` preserved).

### Removals (inline banner)

- `PopupModeStore.statusBanner` (`@Published`)
- `PopupView.statusBannerView(_:)` and the `barStack` banner branch
- `PopupWindowController.presentStatus`'s banner path, `pendingStatus`,
  `flushPendingStatus()`, `startStatusDismissal()`, `statusDismissTask`,
  `statusBubbleDurationNanoseconds`

---

## Testing

- Toast "Copied" logic — unit tests around the downgrade check (paste → copy shows
  toast; native copy shows nothing).
- `ToastPanelController` show/swap/dismiss timing — injected timer so tests are
  deterministic.
- Banner-removal regression — `.showStatus` (keep-open and dismissing) routes to the
  toast; `modeStore.statusBanner` is gone.
- Manifest `"loading"` mapping — factory/validation test.
- Existing live-integration tests (right-click force-copy path) remain.

---

## Non-Goals (this pass)

- No user-facing Preferences UI for duration/style.
- No author-facing surface beyond the manifest `"loading"` flag.
- No progress-bar / animated-loader variant — the loading surface is the toast spinner
  only (`[spinner] Opening …`).
- No inline status surface of any kind remains — the floating toast is the single
  status renderer.
- No change to `.showStatus` keep-open semantics (popup still stays up); only the
  rendering moves from inline banner to floating toast.
