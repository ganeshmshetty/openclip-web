# Configurable Result Delivery for Returned Text

Status: Approved design (2026-08-16). Awaiting implementation plan.

## Problem

Today, an action that returns text (the "implicit returned text" path — a JS string
return, AppleScript output, shell plain-text stdout, or a text snippet) is **always
pasted** on a primary click and **copied** on a secondary click (the paste→copy default).
Users have no control over this. We want the user to choose what happens to that returned
text for both the primary and secondary click — **preview**, **paste**, or **copy** —
with a global setting in Preferences.

## Model (decided with the user)

- **Explicit outcomes always win.** When an action author explicitly produces a result —
  `openclip.paste/copy/cut` in JS, `{"type":"paste"|"copy"}` JSON in shell, a
  manifest-declared `secondary` outcome, or a builtin's authored `.paste`/`.copy`
  (Copy/Cut/Paste/Calculate/Completion) — that result is delivered exactly as authored.
  The picker never fights an explicit effect.
- **Implicit returned text is governed by the user.** When a runtime "just returns a
  string", the new global primary/secondary picker decides preview / paste / copy.
- **Default behavior is preserved.** Primary defaults to paste, secondary defaults to
  copy — identical to today's behavior (paste on primary, paste→copy on secondary).
- **User choice wins.** If the user changes the picker, it wins over the paste→copy
  default.
- **Paste probe still applies.** Whenever the chosen (or authored) outcome is paste, the
  unified paste probe applies: if the target can't paste, the paste is downgraded to copy.
  This holds for both primary and secondary clicks, and for explicit effects too (the
  paste→copy fallback stays).
- **Preview respects canPaste.** When the outcome is preview, the preview card hides the
  Paste button when the target can't paste (only Copy is shown) — matching the existing AI
  result card behavior.

## Mechanism

### 1. New `ActionResult.text(String)` case (Core)

A new case `case text(String)` in `ActionResult` (`Sources/Core/Actions/ActionResult.swift`)
represents *implicitly returned text*. The runtimes that today map a returned string to
`.paste` emit `.text` instead:

| Site | Today | After |
| :--- | :--- | :--- |
| JS string return (`OpenClipJSHost.swift:620`) | `.paste(returnValue)` | `.text(returnValue)` |
| AppleScript output (`AppleScriptAction.swift:126`) | `.paste(output)` | `.text(output)` |
| Shell plain-text stdout (`ScriptAction.swift:83`, inline shell non-JSON) | `.paste(stdout)` | `.text(stdout)` |
| Text snippet (`CustomAction.textSnippet`, `CustomAction.swift:76`) | `.paste(formatted)` | `.text(formatted)` |

Explicit paths are **not** touched: JS `openclip.paste/copy/cut`, shell JSON
`{"type":"paste"|"copy"}` (`ShellResultMapper`/`ShellProcessRunner`), manifest-declared
`secondary` (`DefaultActionFactory.actionResult(from:)`), and builtins.

`.text` does **not** auto-dismiss the popup (`dismissesPopup == false`), like other
presentation results (`.toast` keepVisible). The exhaustive switches that pattern-match
`ActionResult` get a defensive arm for `.text` (`ActionDelivery.areEqual`, the effect
handler, `dismissesPopup`, `containsToast`).

### 2. Pure resolver: `ActionResultDelivery.resolve` gains a preference input

`Sources/Core/Actions/ActionResultDelivery.swift` stays pure. A new pure value carries the
user's chosen behavior for a given click:

```swift
public enum ResultDeliveryPreference: Sendable, Equatable {
    case preview
    case paste
    case copy
}
```

`resolve(raw:clickIntent:canPaste:delivery:preference:)` gains the `preference` parameter
(the user's behavior for *this* click, injected by the controller — Core never reads
UserDefaults). For a `.text` raw result:

- **preference = paste** → probe applies: `canPaste ? .paste(text) : .copy(text)`.
- **preference = copy** → `.copy(text)`.
- **preference = preview** → stays `.text(text)` (a presentation marker; no leaf effect).

Non-`.text` results pass through exactly as today — the preference input is a no-op for
explicit effects (they're never re-decided).

### 3. Controller routing (App target)

`PopupWindowController` reads the two `SettingKey`s before invoking the resolver and passes
the per-click preference. A resolved `.text` is a **presentation** result:

- **Keep the popup open** — do not hide.
- Render the native `AIResultCardView` in content mode (reusing `modeStore.aiResult` /
  `showAIContent`), with the performing action's title.
- Esc collapses the card back to the actions bar (`exitContent`).
- The card's **Paste / Copy** footer buttons are the existing explicit requests
  (`performCardEffect`, nil delivery → never re-decided). The Paste button is gated by
  `modeStore.canPaste` — when the target can't paste, only Copy is shown.

Delivery path notes: a `.text` result is routed through `deliverResult` →
`handleActionResult`; since it doesn't dismiss, the existing `hide()`-before-handle ordering
is skipped for it. The AI-card `Paste`/`Copy` path already handles dismissal itself.

### 4. Settings (General tab)

Two new `SettingKey`s in `Sources/Core/Settings/SettingKey.swift`:

- `primaryClickBehavior: SettingKey<String>` — default `"paste"`
- `secondaryClickBehavior: SettingKey<String>` — default `"copy"`

Values: `"preview"`, `"paste"`, `"copy"`.

UI: **General** tab (`GeneralTabView`), section **"When an action returns text"**, with two
segmented pickers:

- **Primary click**: Preview / Paste / Copy
- **Secondary click**: Preview / Paste / Copy

Wording is user-facing, not "Result Delivery". Reading/writing goes through
`SettingsStore`/`SettingKey` only (no direct `UserDefaults`).

### 5. Loading actions + preview

`loading` actions early-close the popup and show a spinner toast (`runLoadingAction`).
When the result lands and the click's preference is **preview**:

- Hide the spinner toast.
- **Re-show the popup as a content-mode preview card**, using the original selection
  context captured before the early-close, then render the `.text` result in the card.

When the preference is paste/copy, the existing `settleLoadingResult` path is unchanged.

## Edge cases

- **Explicit effects**: never re-decided; the paste→copy probe fallback still applies to
  an explicit paste (unchanged today).
- **Declared `secondary`** (static kinds): wins as authored; the picker only governs
  implicit `.text` results. (JS can't declare `secondary` — §5b of the extension spec.)
- **`.text` inside `.sequence`**: JS string-return never coexists with effects (effects
  win in `makeActionResult` resolution order), so `.text` is effectively a single
  top-level result; the sequence/defensive arms still handle it safely.
- **canPaste unknown** (`modeStore.canPaste == nil`): treated as cannot-paste, so paste
  downgrades to copy and preview hides Paste — the existing safe default.
- **Loading + preview**: covered in §5 (re-show as card).

## Testing

- **Resolver** (`ActionResultDeliveryTests`): `.text` + each preference → paste (with
  probe downgrade), copy, preview passthrough; explicit `.paste`/`.copy` unaffected by the
  preference input.
- **Runtimes**: JS string return, AppleScript output, shell stdout, text snippet now emit
  `.text` (not `.paste`); explicit effects still emit `.paste`/`.copy`.
- **Controller**: preview routes to content-mode card without dismissing; paste/copy
  deliver normally; Paste button hidden when `canPaste == false`; loading + preview
  re-shows the card; Esc collapses.
- **Settings**: defaults (`paste` / `copy`), round-trip via `MemorySettingsStore`.
- **Delivery**: user picker beats paste→copy default; declared `secondary` still wins for
  static kinds.

## Docs

- `docs/developer-guide/AGENTS.md`: document the `.text` result surface (§8 table),
  the implicit-vs-explicit delivery split (§5b), and the new General-tab setting.
- `docs/architecture/known-debt.md`: update if the content-mode re-show path lands there.

## Out of scope

- Per-action or per-extension overrides (the setting is global only).
- A new `ActionResult` preview *case* (preview is the existing card flow, not a new leaf).
- Changing how explicit effects or builtins deliver (except the unchanged probe fallback).