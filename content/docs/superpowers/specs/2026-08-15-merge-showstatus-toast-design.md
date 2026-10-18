# Merge showStatus into Toast, Uniform Dismiss, keepVisible, Implicit-Return → Paste

Date: 2026-08-15
Status: Approved (design)
Scope: Core + OpenClip app targets, JS host, shell protocol, AppleScript, docs, web docs

## 1. Motivation

`.showStatus` and the manifest/delivery toast are already rendered by the *same* surface
(`ToastPanelController`); `presentStatus` literally calls `toastController.show(...)`. The two are
semantically redundant as separate "status" concepts, with `.showStatus` additionally carrying a
"keep popup open" behavior that is rarely wanted. This design merges them into **one thing — a
toast** — with uniform dismissal, an opt-in `keepVisible` escape hatch exposed imperatively
(JS + shell), and re-points every implicit string-return mapping at paste so the primary/secondary
click contract is consistent.

## 2. Decisions (from brainstorming)

1. **Merge**: `ActionResult.showStatus` → `ActionResult.toast`. Toast is the single status surface.
2. **Uniform dismiss**: every run dismisses the popup by default, **including errors**.
3. **`keepVisible`**: opt-in, **imperative only** (JS bridge + shell JSON). No manifest key.
4. **AppleScript excluded** from the toast channel (no structured output channel; stays copy/paste-or-fail).
5. **JS bridge**: `openclip.showStatus(msg, style?)` → `openclip.toast(msg, style?, opts?)` with `opts = { keepVisible: true }`.
6. **JS resolution**: toast **coexists** with effects — no longer dropped when effects are present.
7. **Shell**: `{type:"status"}` → `{type:"toast"}`, gains `keepVisible`.
8. **Errors**: default-dismiss too (uniform rule; an author can opt back in via `try/catch` + `keepVisible`).
9. **Precedence**: script toast (JS/shell) wins over manifest-declared `toast`/`secondaryToast` **and** over the default "Copied" toast — **one toast per run**.
10. **primary/secondary**: manifest `toast`/`secondaryToast` keys stay for both click intents.
11. **Implicit return → paste**: JS function string return and AppleScript returned string map to `.paste`, not `.copy`. Shell plain-text stdout already pastes. Shell JSON `{type:"copy"}` stays an explicit author choice.

## 3. Current state (verified)

| Runtime | Current implicit return mapping |
|---|---|
| JS function string return | `.copy` (`OpenClipJSHost.swift:603`) |
| AppleScript returned string | `.copy` (`AppleScriptAction.swift:124`; empty → `.success`) |
| Shell plain-text stdout (non-JSON) | `.paste` (`ScriptAction.swift:83`) |
| Shell JSON `{type:"copy"}` | `.copy` (explicit author choice) |

`ActionResult.dismissesPopup`: `.showStatus` → `false` (keeps popup open); everything else dismisses
(`ActionResult.swift:64-73`). JS resolution: status only becomes the result when no effects collected
(`OpenClipJSHost.swift:596-601`) — the status is **dropped** when an effect exists. This changes.

## 4. Design

### 4.1 Core model (`Sources/Core/Actions/`)

- **`StatusFeedback` gains `keepVisible: Bool`** (default `false`). This field is the toast's
  dismissal switch. `StatusFeedback` already is the toast payload, so both runtimes feed one model.
- **`ActionResult.showStatus(StatusFeedback)` → `ActionResult.toast(StatusFeedback)`**
  (`ActionResult.swift:40`). `dismissesPopup` for `.toast` = `!feedback.keepVisible`
  (`ActionResult.swift:64-73`).
- **Sequence rule**: a `.sequence` dismisses only when non-empty and every item dismisses (unchanged).
  Consequence: `[.toast(keepVisible: false), .copy("x")]` dismisses like the copy alone; a
  `keepVisible: true` toast in a sequence forces the popup open — explicit author intent.
- **`ActionDelivery` equality** (`ActionDelivery.swift:49`): `.showStatus` case reference → `.toast`.
  `ActionDelivery` payloads (`primaryToast`/`secondaryToast`) unchanged — manifest keys stay.

### 4.2 JS host (`Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift`)

- **Bridge**: `openclip.showStatus(message, style)` → **`openclip.toast(message, style?, opts?)`**.
  `opts` is an object with one optional key `keepVisible` (boolean, default `false`).
- `collected.status` → `collected.toast`; the collected toast is no longer exclusive of effects.
- **Resolution order** (`makeActionResult`, :582-609) becomes:
  1. JS exception → `.toast(StatusFeedback(message:, style: .error))` (default dismiss).
  2. `requireConfiguration` → `.openConfiguration` (unchanged).
  3. Effects (call order, `.sequence` when >1) — **plus** any collected toast: if both toast and
     effects exist, the toast is prepended/appended to the sequence so both surface.
  4. Else toast alone → `.toast`.
  5. Else function string return → `.paste(returnValue)` (was `.copy`).
  6. Else `.success`.
- JS exceptions / promise rejections surface as `.toast(...)` with default dismiss (decision 8).
- No extension currently uses `showStatus` (verified: catalog + `~/.openclip/extensions`), so the
  rename has near-zero real-world breakage.

### 4.3 Shell (`Sources/Core/Extensions/ShellProcessRunner.swift`, `ScriptAction.swift`)

- `{type:"status"}` → **`{type:"toast", message, style, keepVisible}`** in `ShellResultMapper`
  (`ShellProcessRunner.swift:182-189`). `keepVisible` maps onto `StatusFeedback.keepVisible`.
- Plain-text stdout stays `.paste` (`ScriptAction.swift:83`).
- Explicit `{type:"copy"}` stays `.copy` (unchanged; decision 11).

### 4.4 AppleScript (`Sources/OpenClip/Platform/Runtimes/AppleScriptAction.swift`)

- Returned string → `.paste(output)` (was `.copy`); empty → `.success` unchanged
  (`AppleScriptAction.swift:124`).
- **No toast channel** (decision 4): AppleScript stays copy/paste-or-fail. Errors surface via the
  presenter's generic error path (`.failure` → toast, default dismiss).

### 4.5 Delivery (`Sources/Core/Actions/ActionResultDelivery.swift`)

- Script toast (from JS/shell, riding in the raw result) **wins** over the declared
  `primaryToast`/`secondaryToast` and over the default "Copied" toast — one toast per run
  (decision 9). The pipeline Select → Probe → Toast is unchanged structurally; the toast step's
  source is just resolved as: script toast > declared > default "Copied".
- `toast`/`secondaryToast` manifest keys and `ActionDelivery` stay (decision 10).
- Paste probe unchanged: a chosen `.paste` downgrades to `.copy` when the target can't paste; the
  secondary click on a paste primary derives `.copy` (`ActionResultDelivery.swift:71-73`) — which is
  exactly what the new implicit `.paste` returns enable for JS/AppleScript.

### 4.6 Presenter (`Sources/OpenClip/UI/Popup/PopupWindowController.swift`)

- `.showStatus` sites → `.toast` (`:612`, `:642`, `:728`, `:766`, `:777`, `:795`).
- `presentStatus` (`:802`) and `settleLoadingResult` (`:771`) unchanged in mechanism — they already
  call `toastController.show`. Keep-visible toasts stay until dismissed; dismissing toasts
  auto-hide after `PopupMetrics.toastDurationNanoseconds`.
- `PopupSearchView.swift:344` / `PopupView.swift:670` error paths → `.toast(StatusFeedback(error:))`.

### 4.7 Docs & scaffolding

- `docs/developer-guide/AGENTS.md`: §5b (secondary/toast), §5d, §7 (bridge table +
  `openclip.toast`), §8 (`.toast` case), §8a (shell `{type:"toast"}`), §10 (examples), §11, §12.
- `docs/developer-guide/extensions-modules.md`: any `showStatus` references.
- `docs/architecture/known-debt.md`, `docs/architecture/popup-window.md`: status/toast wording.
- `web/src/docs/content/runtimes.tsx`: bridge table row + example.
- `scripts/new_extension.sh` + `src/openclip.d.ts` (both scaffold copies): `showStatus` → `toast(msg, style?, opts?)`.
- `docs/superpowers/plans/` (gitignored) gets the implementation plan next.

## 5. Blast radius / files touched

| File | Change |
|---|---|
| `Sources/Core/Actions/StatusFeedback.swift` | add `keepVisible: Bool` |
| `Sources/Core/Actions/ActionResult.swift` | `.showStatus` → `.toast`; `dismissesPopup` uses `keepVisible` |
| `Sources/Core/Actions/ActionDelivery.swift` | equality case update |
| `Sources/Core/Actions/ActionResultDelivery.swift` | toast precedence (script > declared > "Copied") |
| `Sources/Core/Extensions/ShellProcessRunner.swift` | `status` → `toast` + `keepVisible` |
| `Sources/Core/Extensions/ScriptAction.swift` | (no change expected; plain-text already pastes) |
| `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift` | bridge rename, toast coexistence, return → paste |
| `Sources/OpenClip/Platform/Runtimes/AppleScriptAction.swift` | return → paste |
| `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift` | `.showStatus` → `.toast` in switch |
| `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift` | secondary `status` mapping → `.toast` |
| `Sources/OpenClip/UI/Popup/PopupWindowController.swift` | `.showStatus` sites → `.toast` |
| `Sources/OpenClip/UI/Popup/PopupSearchView.swift`, `PopupView.swift` | error → `.toast` |
| `scripts/new_extension.sh` | d.ts bridge decl |
| `docs/…` (AGENTS.md, extensions-modules.md, known-debt.md, popup-window.md), `web/src/docs/content/runtimes.tsx` | wording + examples |

Tests: `OpenClipJSHostTests` (~10 assertions on `.showStatus`), `ActionResultDismissPolicyTests`
(`:31-40`), `ActionResultDeliveryTests` (`:355-523`), `GoldenExtensionPlatformTests` (`:315`),
`StatusFeedbackTests`, `DefaultActionFactoryTests` (`:372`), `ActionDeliveryTests`, plus any
`ScriptActionExecutionTests`/`CustomActionManifestWriterTests` referencing status.

## 6. Not changing

- AppleScript toast channel (none added).
- Shell JSON `{type:"copy"}`, `{type:"configure"}`.
- Loading spinner toast (`loading: true`) mechanism.
- Manifest `toast`/`secondaryToast` keys and `ActionDelivery`.
- The toast renderer (`ToastPanelController`), toast duration/auto-hide for dismissing toasts.
- `KeepVisible` in the manifest — no manifest key (decision 3).

## 7. Risks / notes

- **Behavior change**: scripts relying on `openclip.showStatus` to keep the popup open now dismiss by
  default; they must pass `keepVisible: true`. Near-zero real usage (verified).
- **JS return change**: scripts returning a string now paste instead of copy. Secondary click derives
  copy (delivery default), primary pastes, and the paste probe downgrades to copy when the target
  can't paste. This aligns JS/AppleScript with shell and with the popup's primary/secondary contract.
- **Sequence + keepVisible**: a `keepVisible: true` toast inside a `.sequence` forces the popup open.
  This is explicit author intent; documented.
- **One toast per run**: script toast suppresses declared toasts and the default "Copied". Simpler to
  reason about; a declared manifest toast is a fallback, not an addition.