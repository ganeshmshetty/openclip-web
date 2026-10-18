# Interactive Component Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution preference for this plan:** the user has explicitly required **subagent-driven development (sdd)** — a fresh implementer subagent per task, a task review after each, and a broad whole-branch review at the end. Use `superpowers:subagent-driven-development`. Subagents are allowed only for implementation and review; planning-time research is already done.

**Goal:** Replace the canned `PopupContent` canvas with a typed, interactive component tree (`CanvasComponent`) that native actions (Swift DSL) and extensions (`type: "canvas"` JS + `h()` element objects) build, render, and interact with — inside the single popup panel, with content mode becoming key exactly like search.

**Architecture:** Pure-additive Core model first (component tree, event/effect/handler types, session state, engine-agnostic `CanvasScripting` seam, neutral `CanvasElementSpec` parser, tree limits, focus helper, native DSL). Then a shared key-mode refactor (`enterKeyMode`/`exitKeyMode`) extracted from today's search-only flow, with capture-once-per-show/clear-on-hide semantics. Then the session + renderer (one view per node, chrome header kept verbatim, hover preview becomes a non-keyed `text` component) and a **dual-case** `ActionResult` migration (`showContent(PopupContent)` bridged through a temporary `LegacyContentBridge` while `showContentTree`/`showCanvas` land; old case + `PopupContent.swift` + bridge deleted last). Finally the JS engine (`JavaScriptCanvasEngine`, compiled `JSScript` reused across fresh contexts in one `JSVirtualMachine`) and the manifest `type: "canvas"` kind. Content-is-key lands with the renderer swap; the now-wrong `testContentModeKeepsPanelNonKey` is inverted.

**Tech Stack:** Swift 6, SwiftUI, AppKit (`NSPanel` nonactivating → conditional key), JavaScriptCore (`JSVirtualMachine` + `JSScript`), Core Swift Package (pure value types, no AppKit/SwiftUI). No new dependencies.

## Global Constraints

- **No `import AppKit`/`SwiftUI`** in `Sources/Core/` — `CanvasComponent`, props, `CanvasHandler`/`CanvasEffect`/`CanvasEvent`, `CanvasSessionState`, `CanvasSize`, `CanvasHeader`, `CanvasScripting`, `CanvasElementSpec`, `CanvasElementParser`, `CanvasTreeValidator`, `firstInteractiveID()`, the DSL, and `CanvasLimits` are pure value types.
- **`xcodegen generate` is MANDATORY** after adding/removing/renaming `.swift` files (`Sources/`, `Tests/`).
- **Dual-case `ActionResult` transition (this plan's spine):** `.showContent(PopupContent)` keeps compiling and working until Task 21. New cases `.showContentTree(CanvasComponent, CanvasHeader?)` and `.showCanvas(CanvasMountRequest, CanvasHeader)` are added in Task 17 and routed by `handleActionResult`; all producers migrate 17→20; Task 21 deletes the old case, `LegacyContentBridge`, `PopupContent.swift`, and renames `showContentTree` → `showContent`. No mega-atomic payload flip.
- **Key-mode semantics (Task 9):** `enterKeyMode()`/`exitKeyMode()` are shared helpers on `PopupWindowController`. Capture is conditional (skip when non-nil); `exitKeyMode` reactivates but does **not** clear; only `hide()` clears. `previousFrontmostApp` is captured in `show(for:)` before any key transition and is never OpenClip itself.
- **Content mode is key exactly like search** (Task 14): one uniform key mode, no per-canvas exception, no non-key canvas. The global event monitor stays observation-only in content mode (keystrokes land in the focused canvas component). Esc always collapses the canvas to the bar — via SwiftUI `.onKeyPress` on each `textField` and the focusable canvas root; the controller's `keyDown` handler ignores non-Esc keys in content mode.
- **`deliverKeyboardEffect`:** a keyboard-delivered canvas effect (`.paste`/`.cut`/`.keyPress`/`.simulatePaste`) resigns the panel's key status, activates the stored source app, posts the keystroke, then restores key status + refocus when the canvas stays open. `CGEvent` broadcasts land in the frontmost key window — the canvas itself while key.
- **Canvas effects never dismiss the popup:** inside a canvas session, `dismissesPopup` is ignored; collapse comes only from Esc → bar, click-outside, `appDidDeactivate`, or `hide()`. Status never renders inside a canvas — `.showStatus` while a canvas is open surfaces after collapse, on the bar banner.
- **One active session; replace on new mount.** A second mount replaces the session (state/tree/in-flight dispatch discarded). `hide()` cancels in-flight work; a late result never re-shows or re-renders.
- **Tree limits (Core constants):** max **512 nodes**, max **depth 32**, max **64 list items** per `list`, max **32,000 characters** per `text` node. A violation rejects the whole canvas with an error status — never truncates. Enforced by `CanvasTreeValidator` (used by the parser and at native mount).
- **Parser recovery is lenient per node, strict structurally:** unknown element type → drop node; malformed/unknown handler → node renders non-interactive; invalid `link` URL → drop node; invalid `image`/`icon` path → error placeholder; non-array `children` → ignored; unknown color/style token → default. Only structural violations (limits, non-object `ui()`/`h()` result) reject the canvas.
- **`h()` parser stays JavaScriptCore-free:** the engine converts `JSValue` → `CanvasElementSpec` (a neutral Codable element object) via `JSONSerialization`; Core's `CanvasElementParser` decodes it. Local `file:`/icon paths are confined to the extension's own directory via `Constants.isPathSafe`; an outside path renders the error placeholder.
- **Native `dispatch` handlers render non-interactive in v1** (native handler registration deferred); JS `.dispatch` resolves to `handlers[name]` in the script. `.effect` accepts only leaf effects — no `.success`/`.failure`/`.none`, no presentation results, no `.sequence`/`.keepVisible` (the enum makes it a compile error). The JS bridge unwraps `keepVisible(...)` to its inner leaf in a canvas session.
- **Toggle/textField state:** `textField` commits on submit (Enter) or blur, never per keystroke; `toggle` commits on tap. The handler receives the **already-flipped** state. Focus re-applies to `focusedComponentID`/`targetID` after a re-render (submit restores, blur-triggered change skips), falling back to `firstInteractiveID()` when the id vanishes.
- **Sizing:** width column `min 220 / ideal 300 / max 360` (`CanvasLimits`), clamped to `screen − 2 × popupPadding`; body scroll capped at a single shared constant (`Constants.searchMaxHeight` **renamed to `Constants.popupMaxHeight`**, code value **240** wins). `resizePanel` (→ `PopupPanel.setFrame` pinning/re-centering) stays the single sizing funnel; the tree never sets its own frame. Producer-set `preferredSize` is clamped and fixed for the session.
- **Renderer identity:** `.id(nodeID)` applied on `CanvasComponentView` only when `props.id` non-nil → implicit animations on dispatch re-renders (no `withAnimation` wrappers). The `textField`/`toggle` `id` doubles as the focus id.
- **`Self.<static>` never used inside `Task.detached`** — reference the type by name. Watchdog = `TimeoutFlag` + sync-eval gate (`Constants.maxConcurrentSyncScriptEvaluations`) + async CFRunLoop pump (patterns from `OpenClipJSHost`).
- **Log through `Log`, never `print()`;** canvas mount/dispatch errors logged via `Log.extensions`; never log per-mouse-move or in hot paths.
- **No hidden singleton wiring in Core;** managers use `onRegister`/`onUnregister` callbacks. Tests inject `MemorySettingsStore`/fake engines; never `UserDefaults.standard`.
- **Glass stays apart from the color themes:** the canvas surface reuses the `.result` card surface pattern — `.ultraThinMaterial` + `.clipShape` + `.glassEffect(.clear)` + `.compositingGroup()` + SwiftUI shadow (macOS 26+; `.ultraThinMaterial` fallback on 14–15) or the classic opaque fill; `PopupThemeModel.effectiveScheme` forced via `.environment(\.colorScheme, ...)` on the popup content only. Component colors come from `PopupThemeModel` tokens / `.primary`/`.secondary`/accent — never hardcoded, no second theme system.
- **Verify:** quick build gate (`timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`) after each task, then the full suite wrapped in a timeout (`timeout -k 10 60 ./scripts/test.sh`) once at the end. Single class: `./scripts/test.sh <ClassName>`.
- **Spec:** `docs/superpowers/specs/2026-08-07-component-canvas-design.md` (all confirmed-2026-08-08 decisions are treated as binding: list cap 64, text 32k, stable node ids in v1, non-keyed hover preview, capture-once/clear-on-hide applied to search too).

## Dependency Graph

```
Task 1-8  Core model (pure additive: no existing-file changes)
   ├── Task 1  CanvasComponent + props (+ id: String?)
   ├── Task 2  CanvasEffect / CanvasHandler / CanvasEvent
   ├── Task 3  JSONValue / CanvasSessionState / CanvasSize / CanvasHeader
   ├── Task 4  CanvasLimits + CanvasTreeValidator + Constants.searchMaxHeight → popupMaxHeight
   ├── Task 5  CanvasScripting protocol + CanvasMount/CanvasDispatch requests + results
   ├── Task 6  CanvasElementSpec + CanvasElementParser (limits + recovery)
   ├── Task 7  CanvasComponent.firstInteractiveID()
   └── Task 8  Native DSL (Canvas.build + @CanvasBuilder + constructors)

Task 9-10  Key-mode refactor (PopupWindowController; independent of Core, needed by 14)
   ├── Task 9  enterKeyMode()/exitKeyMode() extraction + capture-once/clear-on-hide
   └── Task 10 handleEvent dismissal matrix (content modal, non-Esc never dismisses)

Task 11-16 Session + renderer (App)
   ├── Task 11 CanvasSession + CanvasSessionController (dispatch serialization, state write-back)
   ├── Task 12 CanvasComponentView renderer + CanvasHeaderView + CanvasSessionView + sizing
   ├── Task 13 PopupModeStore types + PopupView wiring + preview→CanvasComponent
   │            + deliverKeyboardEffect + delete PopupContentView/StatusBadgeModel (bridge keeps old producers alive)
   ├── Task 14 Content-is-key swap (enterContent→enterKeyMode, exitContent→exitKeyMode,
   │            focusFirstInteractive, invert testContentModeKeepsPanelNonKey)
   ├── Task 15 Renderer/key/effect-delivery/sizing/accessibility tests
   └── Task 16 Session lifecycle + integration tests

Task 17-21 Producer migration + deletion (dual-case spine)
   ├── Task 17 ActionResult dual-case (.showContentTree/.showCanvas) + controller arms
   ├── Task 18 Migrate AIAction.perform + showAIContent → tree
   ├── Task 19 Migrate ResultContentProviding.makeContent → CanvasComponent? + CalculateAction
   │            + beginLongPressIfNeeded + ActionResultAdapter.showResult
   ├── Task 20 Migrate OpenClipJSHost parseContent → element tree (returns .showContentTree)
   └── Task 21 Delete .showContent(PopupContent) + LegacyContentBridge + PopupContent.swift
               + shell showContent→.success + ScriptJSONOutput keys + rename showContentTree→showContent

Task 22-26 JS engine + manifest
   ├── Task 22 JSValue→CanvasElementSpec conversion + h() helper + CanvasScriptBox
   ├── Task 23 JavaScriptCanvasEngine (compile-once JSScript, mount, dispatch, watchdog, sync cap)
   ├── Task 24 openclip.showContent(elementTree, {size}) + keepVisible unwrap + effect collection
   ├── Task 25 Manifest "canvas" kind + validator + factory + JavaScriptCanvasAction
   └── Task 26 Canvas end-to-end tests (validator + loader + runtime + dispatch + shell non-canvas)

Task 27 Docs (AGENTS.md, popup-window.md, javascript.md, package-format.md, extensions.md, known-debt)
```

## Execution Order

1. Tasks 1–8 (Core additive) — commit after each; no existing-file edits yet.
2. Tasks 9–10 (key refactor) — behavior tests around the search flow first.
3. Tasks 11–16 (session + renderer + content-is-key) — the panel still renders bridged legacy content throughout; nothing user-visible regresses.
4. Tasks 17–21 (dual-case migration + deletion) — producers move off `PopupContent` one slice at a time; the final deletion is mechanical.
5. Tasks 22–26 (JS engine + `type: "canvas"`) — depends on Core 4/5/6; e2e tests last.
6. Task 27 (docs).
7. Full verification: quick build gate, then `timeout -k 10 60 ./scripts/test.sh`.

## Verification Commands

- Quick build gate (per task): `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
- Single test class: `./scripts/test.sh <ClassName>`
- Full suite (once, at the end): `timeout -k 10 60 ./scripts/test.sh`
- `xcodegen generate` after any `.swift` add/remove/rename.
- Manual smoke (optional): `./scripts/dev_run.sh`

## Master Task Checklist

- [ ] Task 1: `CanvasComponent` + props structs (`CanvasStackProps`, `CanvasSpacerProps`, `CanvasTextProps`, `CanvasIconProps`, `CanvasImageProps`, `CanvasButtonProps`, `CanvasListProps`/`CanvasListItem`, `CanvasTextFieldProps`, `CanvasToggleProps`, `CanvasLinkProps`) + `CanvasOrientation`/`CanvasTextStyle`/`CanvasColorToken`/`CanvasButtonStyle`/`CanvasIconSource`/`CanvasImageSource` + node-level `id: String?`
- [ ] Task 2: `CanvasEffect` (leaf-only) + `asActionResult` + `CanvasHandler` + `CanvasEvent`
- [ ] Task 3: `JSONValue` + `CanvasSessionState` + `CanvasSize` + `CanvasHeader`
- [ ] Task 4: `CanvasLimits` (512/32/64/32k + widths) + `CanvasTreeValidator` + `Constants.searchMaxHeight`→`popupMaxHeight`
- [ ] Task 5: `CanvasScripting` protocol + `CanvasMountRequest`/`CanvasDispatchRequest`/`CanvasMountResult`/`CanvasDispatchResult`
- [ ] Task 6: `CanvasElementSpec` + `CanvasElementParser` (recovery + limits)
- [ ] Task 7: `CanvasComponent.firstInteractiveID()`
- [ ] Task 8: `Canvas.build` + `@CanvasBuilder` + component constructors
- [ ] Task 9: `enterKeyMode()`/`exitKeyMode()` + capture-once in `show(for:)` + no-clear-on-exit + `hide()` clears
- [ ] Task 10: `handleEvent` dismissal matrix (content modal; non-Esc keyDown ignored; distance/scroll suspended)
- [ ] Task 11: `CanvasSession` + `CanvasSessionController`
- [ ] Task 12: `CanvasComponentView` (11 components) + `CanvasHeaderView` + `CanvasSessionView` + sizing
- [ ] Task 13: `PopupModeStore.content`→`CanvasSession?`, `preview`→`CanvasComponent?` + `PopupView` wiring + `deliverKeyboardEffect` + delete `PopupContentView`/`StatusBadgeModel` + `LegacyContentBridge`
- [ ] Task 14: content-is-key swap + focus + invert `testContentModeKeepsPanelNonKey`
- [ ] Task 15: renderer/key/effect-delivery/sizing/a11y tests
- [ ] Task 16: session lifecycle + integration tests
- [ ] Task 17: `ActionResult.showContentTree`/`.showCanvas` + controller arms + `dismissesPopup`/`effectForHandler`
- [ ] Task 18: migrate `AIAction.perform` + `PopupWindowController.showAIContent`
- [ ] Task 19: migrate `ResultContentProviding.makeContent` + `CalculateAction` + `beginLongPressIfNeeded` + `ActionResultAdapter`
- [ ] Task 20: migrate `OpenClipJSHost.parseContent` → element tree
- [ ] Task 21: delete `.showContent(PopupContent)` + bridge + `PopupContent.swift` + shell `showContent`→`.success` + `ScriptJSONOutput` keys + rename `showContentTree`→`showContent`
- [ ] Task 22: `JSValue`→`CanvasElementSpec` + `h()` + `CanvasScriptBox`
- [ ] Task 23: `JavaScriptCanvasEngine` (compile-once `JSScript`, mount/dispatch, watchdog)
- [ ] Task 24: canvas `openclip.showContent(elementTree, {size})` + `keepVisible` unwrap
- [ ] Task 25: manifest `canvas` kind + validator + factory + `JavaScriptCanvasAction`
- [ ] Task 26: canvas e2e tests + shell non-canvas tests
- [ ] Task 27: docs
