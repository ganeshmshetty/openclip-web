# ZERO-TRUST ARCHITECTURAL AUDIT & BUG HUNT — Component Canvas Feature

Date: 2026-08-09 (audit); status refreshed 2026-08-09 — Tasks 24–27 (original plan) landed since, but **no fix from this plan has been applied**
Branch: `feat/component-canvas-implementation`
Commit audited: `769c73d` (Task 23); follow-up commits reviewed through `dfc2f0e` (Task 27)
Spec under audit: `docs/superpowers/specs/2026-08-07-component-canvas-design.md`
Audit method: full read-through of the canvas Core model, App renderer, JavaScriptCore
engine/bridge, popup key-mode/effect-delivery paths, plus **empirical probes** (JSContext `h()`
variadic behavior, JSVirtualMachine header thread-safety contract) and a build/test baseline.

---

## 0. What this task is — remediation workstream + status ledger

**Why this document exists.** This is the remediation plan produced by the post-Task-23 zero-trust
audit. Its 18 steps (§7) are the bug-fix backlog for the component-canvas feature. The audit ran at
the Task 23/24 boundary, so the finding details in §2–§6 reflect the tree at `769c73d`. The
*feature* surface identified as missing then (open gap, not a bug) was Task 24's bridge work.

**What landed after the audit (SDD Tasks 24–27 — reviewed against this plan 2026-08-09):**

> **⚠️ Read first:** none of the work below is an audit **fix**. Tasks 24–27 were the remaining
> items of the *original* SDD plan (feature implementation). **Not one fix from this remediation
> plan (Steps 1–18) has been applied** — engineer-confirmed 2026-08-09.

| Task | Commit | Delivered | Relation to this fix plan |
| :--- | :--- | :--- | :--- |
| 24 | `d140e3c` | `CanvasBridgeCollector`; `openclip.showContent(tree,{size})` + `showStatus`; preferredSize capture & status routing; `Self.`→type-by-name; `mapStatusStyle` dedupe | Pre-planned feature work. Step 18's feature item text described this task — it shipped as part of the original plan, **not as a fix** † |
| 25 | `18a4a33` | Manifest `type:"canvas"` kind + validator + factory + `JavaScriptCanvasAction` (emits `.showCanvas`) | Pre-planned feature work (the `.showCanvas` producer). **Not an audit fix** † |
| 26 | `b368b86` | Canvas e2e suite; shell-non-canvas; additionally fixed a live gap the plan did not catch — the `.showCanvas` mount path never entered content mode (`onSessionArmed`/`armMountedSession`) | New find fixed in-feature, outside this plan's scope. **Not an audit fix** |
| 27 | `dfc2f0e` | Docs + stale-line cleanup (`PopupContent*`, shell `"showContent"`) | none |

† Step 18 also required *"re-run the Step 9–12 checks against the new bridge and re-run the full
suite"* — that closure half was **never executed** (still open below).

**Current status of the steps (verified against `dfc2f0e`):** **0 of 18 applied — not one fix from
this plan has been implemented (engineer-confirmed 2026-08-09).** Steps 1–17 were never turned into
SDD task briefs — no task file under `.superpowers/sdd/canvas-component/` references this plan —
and Step 18's closure half (the Step 9–12 re-checks) was never run. The only "DONE-looking" work is
the pre-planned feature surface (Tasks 24–27 above), which is **not** an audit fix. Every finding
in §2–§6 remains live at HEAD, including: the SEC-1 arbitrary local file read, the false
"compile-once `JSScript`" claim (also at `JavaScriptCanvasEngine.swift:5`), the cross-thread
VM/ivar data race, the KM-1 key-status restore race, the `h()` variadic child drop, the unbounded
`elementSpec` recursion, the mount-time effect drop, and the dead `keepVisible` flag.

**How to use this document.** Each §7 step below is a self-contained fix task. For the remaining
work, create one SDD brief per step (`task-28-<n>-brief.md`) in
`.superpowers/sdd/canvas-component/`, execute in §7's suggested order (security → invariant races →
engine claims → renderer bugs → hardening), and after each step run: `xcodegen generate` → build
gate → the step's targeted suites → full suite in review. Flip the `STATUS` tag on the step line
and update the §0 matrix when a step lands. Line numbers in §2–§7 are as of `dfc2f0e` and drift —
re-read the cited files before editing.

---

## 1. Executive Summary

The component-canvas feature is 85% implemented (SDD Tasks 1–23 of 27; the ledger marks
Task 24 active and Tasks 25–27 open). The architecture is genuinely good and mostly spec-faithful:
Core/App module boundaries are clean (`Sources/Core` contains **no** AppKit/SwiftUI imports);
the dual-case `ActionResult` migration was landed as planned; the fresh-context-per-event engine
model, the value DSL, the drop-after-commit draft plan, and the capture-once/clear-on-hide key
semantics are all present and well-tested.

However, zero-trust review found **one outright spec violation** (the "compile-once `JSScript`"
claim is false — no `JSScript` exists anywhere), **one real security deviation** (canvas `icon`
local paths bypass the `Constants.isPathSafe` confinement that `image` enforces), **one
never-key-invariant race** in `deliverKeyboardEffect`, **one SwiftUI state-divergence bug** in
`CanvasToggleView`, and a cluster of JS-bridge hardening gaps (silent `h()` child drops —
empirically confirmed — unbounded element-tree recursion, discarded mount-time effects). The
outstanding feature surface (Task 24's `openclip.showContent(tree, {size})`, `showStatus`,
`showCanvas` producer) is recorded as an open gap, not a bug.

**Bottom line:** no call-site crashes were found in the normal path, but a hostile or naive
extension can currently (a) read/display arbitrary local image files via `icon.local`,
(b) crash the process with a pathologically deep element tree before the depth validator runs,
and (c) silently lose rendered children when calling `h()` variadically. Keyboard delivery has a
key-status restoration race that violates the project's never-key rule. Fix these before
shipping the canvas kind to extension authors.

---

## 2. Critical / Crash / Security Bugs

### SEC-1 — Canvas `icon.local` bypasses the path-confinement rule (arbitrary local file read + display)

- **Location:** `Sources/OpenClip/UI/Popup/CanvasComponentView.swift:320` (`CanvasIconView` →
  `case .local`). Compare `imageSource` at the same file's `:233`, which *does* guard.
- **Root cause:** the `.image` renderer rejects out-of-directory `file:` paths via
  `Constants.isPathSafe(...)` and renders the error placeholder. `CanvasIconView.case .local`
  calls `LocalIconCache.shared.image(for: url)` directly — `LocalIconCache.image(for:)`
  (`Sources/OpenClip/UI/Icons/LocalIconCache.swift:27`) does `NSImage(contentsOf:)` on *any* URL
  with no containment check.
- **Impact:** a canvas JS extension (whose element tree is untrusted input by design) can render
  any readable local file (PNG/JPEG/ICNS/GIF) — an arbitrary-file-read + visual-exfiltration and
  file-existence-probing primitive. Violates spec §7 ("local `file:`/icon path outside the
  extension's own directory renders the error placeholder") and §10 ("Local paths confined").
- **Repro:** extension script returns `h('icon', { local: '/Users/x/Documents/secret.png' })`;
  the pixel data appears in the popup canvas.
- **Fix:** apply the same `isPathSafe` guard in `CanvasIconView` before touching
  `LocalIconCache`; otherwise render `exclamationmark.triangle`. See §7 step 1.

### CR-1 — The "compile-once `JSScript`" engine is actually per-event source re-parsing (spec §5.4 violation)

- **Location:** `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift` `executeMount`
  (`:112–125`) and `executeDispatch` (`:221–229`) — both call `jsContext.evaluateScript(scriptCode)`
  with the raw source string. **Status at `dfc2f0e`: still unfixed** (no `JSScript` exists; the
  file-level doc comment at `:5` still claims "script compiled once per session VM").
- **Root cause:** spec §5.4 requires: *"The script is compiled once per session at mount into a
  `JSScript` (compiled bytecode); every dispatch evaluates that compiled script inside a fresh
  JSContext."* There is **no `JSScript` anywhere in Sources/ or Tests/** (verified by grep).
  Commit `769c73d` and `.superpowers/sdd/README/task-23-report.md` claim "compile-once JSScript,
  fresh-context mount/dispatch", but the implementation re-parses and re-compiles the full
  source on *every* tap/change/submit.
- **Impact:** the central performance goal of §5.4 is unmet; each dispatch pays the full
  lex+parse+compile cost of the script (dominant for large extension preludes).
- **Repro:** `grep -r JSScript Sources Tests` returns nothing; profile two taps of the counter
  script — no compiled artifact is reused.
- **Fix:** create a `JSScript` at mount, store it on the engine, and per dispatch run
  `jsContext.evaluateJSScript(compiledScript)`. Details in §7 step 2.

### CR-2 — `JSVirtualMachine`/engine state used across threads without synchronization (latent crash/UB under GC)

- **Location:** `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift:19–37, 54–61, 79–87,
  123–128, 229–233, 307–309`.
- **Root cause (two layers):**
  1. `engine.virtualMachine = JSVirtualMachine()` is created in `init` on the **MainActor**
     thread; every `JSContext(virtualMachine:)` is created *inside* `Task.detached` — an
     arbitrary cooperative-pool thread that may change per call. The SDK header
     (`JSVirtualMachine.h`) states the VM internally locks ("Thread safety is supported by
     locking the virtual machine") but *"a virtual machine may need to run deferred tasks on a
     run loop … it will use the run loop of the thread it was initialized on"* — GC and WASM
     deferred work is targeted at the main thread's run loop while evaluation threads have no
     run loop (except the async dispatch's explicit CFRunLoop pump).
  2. `engine.scriptCode`, `engine.sessionInput`, `engine.sessionOptionValues`, `engine.isAsync`
     are **written from inside `executeMount`** (detached thread, lines 123–128) and **read from
     inside `executeDispatch`** (a different detached thread, lines 229–233, 307–309) with no
     lock — a genuine data race that Swift 6's `@unchecked Sendable` silences. The controller's
     dispatch chain serializes *logical* order and the `await Task.detached{}.value` hop creates
     a happens-before edge, so it *works today*, but the Task-23 review already deferred this
     ("lock around stored session vars … cross-thread access defense in depth").
- **Fix:** (a) create the `JSVirtualMachine` lazily *inside the first evaluation's detached task*
  (or pin one dedicated evaluation thread per engine); (b) eliminate the engine ivar sharing —
  pass `scriptCode/input/options/isAsync` as parameters through `executeMount`/`executeDispatch`
  (they already receive `request`), or guard them with a lock. §7 step 3.

---

## 3. UI Rendering & Visual Defects

### UI-1 — `CanvasToggleView` optimistic local `@State` can permanently diverge from the tree's authoritative value

- **Location:** `Sources/OpenClip/UI/Popup/CanvasComponentView.swift:437–471`.
- **Root cause:** the toggle seeds `@State isOn` from `props.value` in `init` and flips it
  optimistically on tap, resyncing only via `.onChange(of: props.value)`. When a dispatch
  re-render returns a tree whose toggle `props.value` is **equal** to the pre-tap value (handler
  rejects/ignores the change, or returns the same state), SwiftUI does not fire `.onChange`
  (old == new), `@State isOn` keeps the optimistic flip, and the switch visually disagrees with
  session state. The controller's pre-flip write (`CanvasSessionController.swift:82–89`)
  flipped session state optimistically too, so authoritative value and renderer can disagree
  until the next value *change*.
- **Repro:** toggle with `onToggle` handler returning `state` unchanged; tap the switch — it
  flips ON; dispatch completes with unchanged tree; switch stays ON although the tree/session
  value is OFF.
- **Fix:** drive the switch from `props.value` as the single source of truth + a short-lived
  optimistic override keyed to the dispatch round-trip, or resync on every tree render with a
  stable `.id(props.id)`. Align the controller pre-flip to consume the event's own `value`.
  §7 step 4.

### UI-2 — Header Esc keycap can draw a system focus ring (focus vocabulary inconsistency)

- **Location:** `Sources/OpenClip/UI/Popup/CanvasHeaderView.swift:59–78`.
- **Root cause:** every canvas interactive component opts out of the system focus ring via
  `.focusEffectDisabled()` (root ScrollView `CanvasSessionView.swift:168`, buttons/rows
  `applyFocusID` at `CanvasComponentView.swift:517–523`). The header's Esc `Button` is a plain
  SwiftUI button with no `.focusEffectDisabled()`, so full-keyboard-access focus draws the
  default blue outline — exactly the artifact Task 18 removed from the canvas body.
- **Repro:** enable keyboard navigation; Tab until the Esc keycap; a focus ring appears.
- **Fix:** add `.focusEffectDisabled()` to the Esc button. §7 step 5.

### UI-3 — Width-clamp source uses `NSScreen.main` instead of the panel's screen

- **Location:** `Sources/OpenClip/UI/Popup/CanvasSessionView.swift:180–188` (`clampedWidths`).
- **Root cause:** `NSScreen.main?.visibleFrame.width` clamps the canvas width column, but the
  popup positions against the screen containing the cursor
### UI-4 — Same-`.id` siblings are not rejected (SwiftUI identity ambiguity)

- **Location:** `CanvasComponentView.swift:100–113` (ForEach over `children.indices` with
  `.applyNodeID`) + `CanvasTreeValidator` (`Sources/Core/Canvas/CanvasLimits.swift:36–59`).
- **Root cause:** two sibling nodes sharing one `id` collide on `.id(id)` at the same tree level
  — SwiftUI diffing becomes ambiguous (undefined re-use/animations, console identity warnings).
  Nothing validates uniqueness across siblings.
- **Fix (hardening):** add a sibling-uniqueness validation pass to `CanvasTreeValidator` and
  prefer identity-keyed ForEach over `.id(\.self)` indices. §7 step 7.

### UI-5 — Accessibility labels leak internal component ids

- **Location:** `CanvasComponentView.swift:467` (`"Toggle \(props.id)"`) and `:429`
  (`"Text field \(props.id)"`).
- **Root cause:** spec §7.3 requires every interactive node to expose a meaningful label; ids
  like `field_2a9f1` are not user-facing. `button`/`link`/`listItem` do pass real titles.
- **Fix:** use `placeholder`/`title` when present with an id fallback. §7 step 8.

---

## 4. JS Engine & Bridge Flaws

### JS-1 — `h()` silently drops variadic child arguments and non-object child values (EMPIRICALLY CONFIRMED)

- **Location:** `Sources/OpenClip/Actions/CanvasScriptBox.swift:15–21`.
- **Root cause:** `h` is installed as an ObjC block with a fixed 3-parameter signature
  `(String, Any?, Any?)`. JSCore bridges it to a JS function that only surfaces the first extra
  argument. A probe run against the harness confirmed the behavior (`h.length == 0`):
  ```
  h('stack', null, {type:'a'}, {type:'b'})  // => { children: {type:'a'} }  ← 'b' DROPPED
  h('stack', null, [{type:'a'},{type:'b'}]) // => works (array path)
  ```
  Extension authors coming from React/TSX naturally write `h('stack', props, childA, childB)`
  and get **silent data loss**. A bare string child (`h('text', props, 'hi')`) is also dropped by
  `elementSpec`'s dict-only child conversion (`CanvasScriptBox.swift:28–39`).
- **Fix:** replace the ObjC-block `h` with a tiny JS wrapper installed via
  `context.evaluateScript` so children are genuinely variadic:
  `h = (type, props, ...children) => ({ type, props, children: children.length === 1 ? children[0] : children })`.
  Add tests for 2+ children and bare-string children. §7 step 9.

### JS-2 — Unbounded recursion converting a pathological element tree before the depth cap applies

- **Location:** `CanvasScriptBox.elementSpec(from:)` (`CanvasScriptBox.swift:25–41`) recurses
  fully; `CanvasTreeValidator` (`CanvasLimits.swift:38–59`) only rejects depth **after** the
  `[String: Any]`→`CanvasElementSpec` tree is materialized.
- **Root cause:** a hostile script can build `h(`-nested objects ~5k–50k deep (JS's own stack
  allows this before "Maximum call stack size exceeded"). `elementSpec` recurses Swift frames per
  level before any limit is consulted → stack overflow → process crash. The parser's mandated
  depth cap (32) never gets a chance.
- **Repro:** a script that programmatically builds a 10k-deep `{type:'stack',children:[x]}`
  chain and returns it from `ui()`.
- **Fix:** bound the recursion inside `elementSpec` (thread a `depth` parameter; return nil /
  abort past `CanvasLimits.maxDepth` + slack), or walk the JS objects iteratively. §7 step 10.

### JS-3 — Mount-time `openclip` effects are silently discarded

- **Location:** `JavaScriptCanvasEngine.swift:98–141` (mount installs `effectsBox`/bridge but
  never reads `effectsBox.value`); dispatch reads it (`:342`).
- **Root cause:** `CanvasMountResult` intentionally carries no effects (spec §5.2), but the
  bridge *does* collect them during mount — a script that calls `openclip.paste(...)` from the
  module top-level or inside `ui()` has its side effect silently vanish, while the identical
  call during a dispatch is honored. Inconsistent and surprising: mounts should either reject
  or execute, never silently drop.
- **Fix:** on mount, if `effectsBox.value` is non-empty, surface a rejection (mount already
  collapses via `onSessionError`) or document+enforce "no effects at mount". §7 step 11.
  (`PopupWindowController.positionPanel`, `:477–484`). On a narrower-than-main secondary display
  the column can exceed the available width; on a wider display it under-fills.
- **Fix:** resolve the screen from the panel (`panel.screen` or the screen containing
  `context.cursorPosition`). §7 step 6.
### JS-4 — `keepVisible` is a dead flag (collector `value` never read)

- **Location:** `CanvasScriptBox.swift:124–126, 174–177`; `JavaScriptCanvasEngine.swift` (no read
  of `keepVisibleBox.value` anywhere).
- **Root cause:** `CanvasKeepVisibleBox.value` is set and never consumed. Today benign (canvas
  effects never dismiss), but the claimed "keepVisible unwraps to its inner leaf" behavior (test
  `testKeepVisibleUnwrapsToInnerLeaf` passes only because `keepVisible` was never an effect in
  the first place) is vacuous plumbing.
- **Fix:** fold into Task 24's `CanvasBridgeCollector`; either delete the box or genuinely
  unwrap a wrapped result. §7 step 12.

### JS-5 — Task 24 bridge surface absent (open feature gap, not a bug)

- **Location:** `ActionResult.showCanvas` is a transient dead case
  (`Sources/Core/Actions/ActionResult.swift:35`); `PopupWindowController.mountCanvas`
  (`:304–310`) has no producer; spec §7.1 producer-set `{ size }` and §11 JS `showStatus` for
  canvas are unimplemented (`CanvasBridgeCollector`, `openclip.showContent(tree,{size})`,
  `openclip.showStatus` all missing).
- **Note:** matches the SDD ledger ("Task 24 active"). Recorded so a later reviewer does not
  mistake the gap for a regression.

---

## 5. State Machine & Key Behavior Edge Cases

### KM-1 — `deliverKeyboardEffect` can re-enable key status on a *collapsed* (bar-mode) panel

- **Location:** `Sources/OpenClip/UI/Popup/PopupWindowController.swift:700–713`.
- **Root cause:** `wasKey`/`wasContent`/`needsRestore` are snapshotted **before** the effect is
  posted. During `await handleEffect(effect.asActionResult).value`, the user can press Esc
  (`exitContent()` → `modeStore.mode = .actions`, `allowsKey = false`) or click outside
  (`hide()`). The restore guard only checks `panel?.isVisible == true` — a **collapsed but
  visible** panel passes it, so the code sets `allowsKey = true` and `makeKeyAndOrderFront(nil)`
  on a bar-mode popup. That is precisely the never-key invariant violation the popup window
  architecture forbids.
- **Repro:** in a canvas, trigger a `.paste` and immediately press Esc before the effect
  completes; inspect `panel.allowsKey` — it is `true` while `modeStore.mode == .actions`.
- **Fix:** re-check the live mode at restore time —
  `if wasKey, modeStore.mode == .content, panel?.isVisible == true { … }`. §7 step 13.

### KM-2 — Long-press re-arms a canvas while a canvas is already open (content is modal, but the click path isn't)

- **Location:** `PopupWindowController.handleEvent` `.leftMouseDown` (`:560–570`) →
  `beginLongPressIfNeeded` (`:400–424`).
- **Root cause:** `beginLongPressIfNeeded` does not check `modeStore.mode == .actions`. In
  content mode, holding the mouse button inside the canvas starts the hovered action's long-press
  timer; when it fires, `armCanvas(...)` **replaces the live session** mid-edit — typed drafts,
  the focused field, and any in-flight dispatch are discarded. `testHoverLongPressStaysInert`
  covers the bar case only.
- **Fix:** early-return from `beginLongPressIfNeeded` unless `modeStore.mode == .actions`. §7
  step 14.

### KM-3 — `exitContent()` during a keyboard-effect await leaves the restore branch re-keying the panel

- **Location:** `PopupWindowController.swift:700–713` + `exitContent` (`:342–350`).
- **Root cause:** no coordination between the effect restorer and `exitContent()`/`clear()` — if
  `exitContent` runs during the await, `exitKeyMode()` clears panel key status before the restore
  branch runs, which then re-keys the panel (KM-1).
- **Fix:** covered by KM-1's live-mode re-check; additionally make `deliverKeyboardEffect`
  cooperative-cancellable (check a session generation before restoring). §7 step 13.

### KM-4 — Native DSL trees bypass `CanvasTreeValidator` at mount

- **Location:** `PopupWindowController.armCanvas` (`:272–291`) creates the session directly with
  the tree; only scripting mounts (`JavaScriptCanvasEngine`) run `parseTree` → validation.
- **Root cause:** spec §5.3 says "native DSL builds are bounded by the same limits" — the
  defensive validator is skipped for native `.showContent` producers (AI results, long-press,
---

## 6. Performance & Memory Leak Opportunities

### PERF-1 — Per-event source re-parse (spec §5.4), see CR-1

Every dispatch re-parses + re-compiles the whole script. This is the largest performance
finding. Fixing CR-1 (real `JSScript` compile-once) removes it. Cost scales with prelude size on
the hot path (every button row tap, every text-field commit).

### PERF-2 — `CanvasSessionView` blur/tree commits do O(n) DFS per committed draft

- **Location:** `CanvasSessionView.swift:262–267` + `:321–333`
  (`canvasTextFieldProps(withID:)` walks the whole tree per field per `.onChange`, and
  `CanvasSessionDraftPlan.plan` calls it per draft).
- **Root cause:** for a form with `k` drafts and an `n`-node tree this is O(k·n) DFS traversals
  in one update cycle. Fine at limits (512 nodes) but needless on every keystroke/blur cycle.
- **Fix:** build an `[id: CanvasTextFieldProps]` map once per tree render and resolve in O(1).
  §7 step 16.

### PERF-3 — Panel-growth double funnel (hosting-view auto-resize + `resizePanel`) can flash/jitter

- **Location:** `PopupPanel.setFrame` (`PopupPanel.swift:50–69`) + `resizePanel`
  (`PopupWindowController.swift:429–455`) + `onContentSizeChange` (`PopupView.swift:207–211`).
- **Root cause:** entering content mode grows the panel via two mechanisms that both funnel into
  `setFrame`: the host auto-resize (top-origin preserved) and the controller's explicit
  `resizePanel` (origin adjusted for `searchResultsAbove`). Both rely on the `pin…`/`recenterX`
  flags being set *before* the mode flip; any ordering gap produces a double-frame. The brief
  requires "no visual jitter or clipping." Needs a runtime smoke pass (cannot be fully asserted
  headless); cheap hardening: set the pin/recenter flags one run-loop ahead of the mode flip and
  keep `resizePanel` the single height-cap authority. §7 step 17.

### PERF/MEM-4 — No cross-event retention seen; flags are clean

The fresh-context model contains JS object lifetimes per event; `PromiseState`/boxes are released
with the ephemeral context. `LocalIconCache` is NSCache-capped (128). `dispatchChain` uses
`[weak self]` and awaits-then-drops the prior link. No session-level JS retention was found. The
one true memory-model hazard remains CR-2's unsynchronized engine ivars (race, not leak).
  `ResultContentProviding`). A native action emitting >32k chars or >512 nodes renders unbounded
  instead of rejecting.
- **Fix:** run `CanvasTreeValidator.validate(tree)` inside `armCanvas` (and
  `armCanvasForTesting`), collapsing + error-banner on failure. §7 step 15.
- **Location:** `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift:123` (mount) and `:229`
---

## 7. Actionable Step-by-Step Fix Instructions

**Prereqs:** after every `Sources/`/`Tests/` file change run `xcodegen generate`; keep Core
AppKit/SwiftUI-free; keep every log through `Log`. Suggested order: security → invariant races →
engine claims → renderer bugs → hardening.

**Status legend (refreshed 2026-08-09, verified against `dfc2f0e`):**
`❌ OPEN` = **not applied** · `⚠️ PARTIAL` = already partly correct *at audit time* (no fix applied).
**There are no `✅ DONE` steps — the implementing engineer confirmed that not one fix from this
plan (Steps 1–18) has been applied.** Create `task-28-<n>-brief.md` per step and flip the tag as
each lands. Line refs below are as of `dfc2f0e`.

### Step 1 — Close the `icon.local` path-confinement hole (SEC-1) — **STATUS ❌ OPEN (high priority — arbitrary local file read/display, still live at `CanvasComponentView.swift:320-331`)**
- **File:** `Sources/OpenClip/UI/Popup/CanvasComponentView.swift` (`CanvasIconView`,
  `case .local`, ~line 320).
- **Change:** mirror the `imageSource` guard at `:233`:
  ```swift
  case .local(let url):
      if Constants.isPathSafe(destinationURL: url, baseDirectory: Constants.extensionsDirectory),
         let nsImage = LocalIconCache.shared.image(for: url) {
          Image(nsImage: nsImage).resizable().aspectRatio(contentMode: .fit).frame(width: size, height: size)
      } else {
          Image(systemName: "exclamationmark.triangle").resizable().aspectRatio(contentMode: .fit).frame(width: size, height: size)
      }
  ```
- **Test:** extend `CanvasRendererTests.testUnsafeImagePathRejectedWithPlaceholder` or add
  `testUnsafeIconPathRejectedWithPlaceholder` — `.local` icon URL outside
  `Constants.extensionsDirectory` must render the placeholder (no `NSImage` decode).
- **Verify:** `./scripts/test.sh CanvasRendererTests`.

### Step 2 — Actually compile the script once per session (CR-1) — **STATUS ❌ OPEN (engine still re-parses per dispatch; fix the false doc claim at `JavaScriptCanvasEngine.swift:5` in the same change)**
- **File:** `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift`.
- **Change:**
  1. Store `private var compiledScript: JSScript?` on the engine.
  2. In `executeMount`, after bridge setup, compile once:
     `engine.compiledScript = try JSScript(source: scriptCode)` (a `JSScript` is
     context-independent and reusable across fresh contexts).
  3. In `executeDispatch`, replace `jsContext.evaluateScript(scriptCode)` with
     `jsContext.evaluateJSScript(compiledScript)` (runtime error path if nil).
  4. Keep the `setupSnippet` (`__canvas_ui`/`__canvas_handlers`) evaluation as-is.
- **Test:** existing 15 `JavaScriptCanvasEngineTests` stay green; add an assertion that the same
  `JSScript` is reused across dispatches. Update the file-level doc comment and Task-23 claims.
- **Verify:** `./scripts/test.sh JavaScriptCanvasEngineTests`.

### Step 3 — Make engine thread-ownership explicit (CR-2) — **STATUS ❌ OPEN (VM still made on MainActor in `init`; session ivars still written/read on different detached threads with no lock)**
- **File:** `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift`, `:19–37`, `:39–87`.
- **Change (both):**
  1. Create the `JSVirtualMachine` lazily *inside* the first `Task.detached` evaluation (or hop
     to a pinned executor) so the VM's deferred-task run loop and all contexts live on the same
     evaluation thread; inherit it for subsequent mount/dispatch.
  2. Remove the shared mutable ivars: pass `scriptCode`/`input`/`optionValues`/`isAsync` through
     `executeMount`/`executeDispatch` parameters (they already receive `request`); or guard the
     remaining session cache with an `NSLock` (Task-23 review's deferred minor).
- **Verify:** `./scripts/test.sh JavaScriptCanvasEngineTests` + `CanvasSessionLifecycleTests`.

### Step 4 — Fix the toggle divergence (UI-1) — **STATUS ❌ OPEN (toggle still optimistic `@State` + `.onChange(of: props.value)`; controller pre-flip unchanged)**
- **File:** `Sources/OpenClip/UI/Popup/CanvasComponentView.swift`, `CanvasToggleView`
  `:437–471`; `Sources/OpenClip/UI/Popup/CanvasSessionController.swift:82–89`.
- **Change (suggest A):**
  - **A (preferred):** drive the switch from `props.value` as the single source of truth and keep
    a short-lived optimistic override only across the dispatch round-trip (clear on the next tree
    change); give each toggle a stable `.id(props.id)`.
  - **B:** replace `.onChange(of: props.value)` with a tree-driven resync and force `@State`
    reseed when `props.value` differs.
  - Also align the controller pre-flip (`:82–89`) to consume the **event's own value**
    (`event.value`) rather than recomputing from state (spec §4: "handler receives the
    already-flipped state").
- **Test:** add `CanvasKeyBehaviorTests.testToggleRejectedChangeDoesNotDiverge` — fake scripting
  returns the unchanged tree; assert the re-rendered tree value equals the rendered switch.
- **Verify:** `./scripts/test.sh CanvasKeyBehaviorTests`.

### Step 5 — Header Esc keycap loses its focus ring (UI-2) — **STATUS ❌ OPEN (no `.focusEffectDisabled()` on the Esc button at `CanvasHeaderView.swift:59-81`)**
- **File:** `Sources/OpenClip/UI/Popup/CanvasHeaderView.swift:59–78` — append
  `.focusEffectDisabled()` to the Esc `Button` modifier chain.
- **Verify:** build gate + a manual Tab pass.

### Step 6 — Clamp widths against the popup's screen (UI-3) — **STATUS ❌ OPEN (still `NSScreen.main` at `CanvasSessionView.swift:181`)**
- **File:** `Sources/OpenClip/UI/Popup/CanvasSessionView.swift:180–188` — resolve the screen from
  the panel (or pass `screenVisibleWidth` from the controller) instead of `NSScreen.main`.
- **Verify:** `CanvasRendererTests.testWidthColumnClampsToLimits` still passes.

### Step 7 — Reject duplicate sibling ids (UI-4, hardening) — **STATUS ❌ OPEN (validator at `CanvasLimits.swift:36-59` walks depth/nodes only; no sibling-uniqueness check)**
- **File:** `Sources/Core/Canvas/CanvasLimits.swift` (`CanvasTreeValidator`).
- **Change:** during the walk, collect seen ids per stack-sibling scope; on a duplicate throw a
  new `CanvasParseError` case. Keep Core AppKit-free.
- **Test:** `CanvasTreeValidatorTests` — add duplicate-id rejection cases.

### Step 8 — Human-readable a11y labels (UI-5) — **STATUS ⚠️ PARTIAL (pre-existing at audit time, NOT an applied fix — text field was already placeholder-first; toggle still leaks the internal id)**
- **File:** `Sources/OpenClip/UI/Popup/CanvasComponentView.swift:424, 467`.
- **Change:** use `placeholder`/`title` first, id last; keep
  `CanvasRendererTests.testInteractiveNodesExposeLabels` green. The text field already reads
  `props.placeholder?.isEmpty == false ? props.placeholder! : "Text field \(props.id)"` (:424).
  Only the toggle remains at :467 (`"Toggle \(props.id)"` — spell out a human label), matching
  the list/link rows that already use titles (`:278`, `:497`).

### Step 9 — Make `h()` children truly variadic (JS-1) — **STATUS ❌ OPEN (still the fixed 3-param ObjC block at `CanvasScriptBox.swift:17-23`; `h('stack', p, a, b)` drops `b`)**
- **File:** `Sources/OpenClip/Actions/CanvasScriptBox.swift:16-24`.
- **Change:** replace the ObjC-block `h` with a JS-defined wrapper so children are variadic and
  single-or-array semantics hold:
  ```swift
  context.evaluateScript("""
    h = (type, props, ...children) =>
      ({ type, props, children: children.length === 1 ? children[0] : children });
  """)
  ```
  (`elementSpec` already handles both a single dict child and an array.)
- **Test:** extend `CanvasScriptBoxTests`: `h('stack', p, a, b)` → two children;
  `h('stack', p, [a,b])` → two children; `h('text', p, 'hi')` → string child surfaced (then
  decide parser handling for a bare-string child). **Reproduce the current drop first**
  (empirically confirmed: child `b` vanishes).
- **Verify:** `./scripts/test.sh CanvasScriptBoxTests`.

### Step 10 — Bound element-tree conversion depth (JS-2) — **STATUS ❌ OPEN (`CanvasScriptBox.elementSpec(from:)` still recurses unbounded before any depth cap)**
- **File:** `Sources/OpenClip/Actions/CanvasScriptBox.swift:25–41` — thread `depth` and early-out
  past `CanvasLimits.maxDepth` (or an explicit larger cap) by returning nil for that subtree,
  or convert iteratively.
- **Test:** `JavaScriptCanvasEngineTests` — a script building a ~10k-deep `h()` chain must throw
  `scriptException` instead of crashing the process.
- **Verify:** `./scripts/test.sh JavaScriptCanvasEngineTests`.

### Step 11 — Decide mount-time effects policy (JS-3) — **STATUS ❌ OPEN (`executeMount` never reads `collector.effects`; the Task-24 collector made the drop invisible, not fixed)**
- **File:** `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift` (`executeMount`).
- **Change:** after `ui()` renders, if `collector.effects` is non-empty, throw
  `CanvasJSRuntimeError.scriptException("Effects are not allowed at mount time")` (surfaces via
  the existing `onSessionError` collapse) — or extend `CanvasMountResult` policy if the spec is
  re-approved. Document in `docs/runtimes/javascript.md` and the engine doc comment.
- **Verify:** `./scripts/test.sh JavaScriptCanvasEngineTests`.

### Step 12 — Own `keepVisible` meaning in the engine (JS-4) — **STATUS ❌ OPEN (`collector.keepVisible` written at `CanvasScriptBox.swift:127/213`, never read by the engine; deliberately deferred in Task 24)**
- **File:** `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift` dispatch +
  `Sources/OpenClip/Actions/CanvasScriptBox.swift:126–127, 213`.
- **Change:** Task 24 already folded the flag into the collector (`collector.keepVisible`,
  written by the `keepVisibleBlock`). Now **consume it**: after the handler call in
  `executeDispatch`, read `collector.keepVisible`; if set, log/assert it only (canvas effects
  never dismiss) — no behavior change is otherwise needed. Update
  `testKeepVisibleUnwrapsToInnerLeaf` (`JavaScriptCanvasEngineTests.swift:94-115`) to assert the
  *policy* (e.g. the engine exposes/does not re-dismiss) rather than the incidental pass-through.

### Step 13 — Fix the keyboard-effect restore invariant race (KM-1/KM-3) — **STATUS ❌ OPEN (restore branch still checks only the snapshot `wasContent` + `panel?.isVisible`, never live `modeStore.mode`)**
- **File:** `Sources/OpenClip/UI/Popup/PopupWindowController.swift:723–736` (`deliverKeyboardEffect`).
- **Change:**
  ```swift
  private func deliverKeyboardEffect(_ effect: CanvasEffect) async {
      let wasKey = panel?.allowsKey == true
      if wasKey {
          panel?.allowsKey = false
          previousFrontmostApp?.activate(options: [.activateAllWindows])
      }
      await handleEffect(effect.asActionResult).value
      // Only re-key if the canvas is STILL the live surface. Esc/collapse/hide during the
      // await must never re-enable key status on a bar-mode or hidden popup (never-key rule).
      if wasKey, modeStore.mode == .content, canvasSessionController.session != nil,
         panel?.isVisible == true {
          panel?.allowsKey = true
          panel?.makeKeyAndOrderFront(nil)
          canvasSessionController.refocus()
      }
  }
  ```
- **Test:** `CanvasEffectDeliveryTests` — new `testEscDuringKeyboardEffectDoesNotRestoreKey`:
  arm a canvas, fire `onEffects([.paste])`, immediately `exitContent()`, pump, assert
  `panel.allowsKey == false && modeStore.mode == .actions`.
- **Verify:** `./scripts/test.sh CanvasEffectDeliveryTests`.

### Step 14 — Long-press stays bar-mode-only (KM-2) — **STATUS ❌ OPEN (no mode guard on `beginLongPressIfNeeded` at `PopupWindowController.swift:425`)**
- **File:** `Sources/OpenClip/UI/Popup/PopupWindowController.swift:425` — add
  `guard modeStore.mode == .actions else { return }` to `beginLongPressIfNeeded`.
- **Test:** extend `CanvasKeyBehaviorTests.testHoverLongPressStaysInert` with a canvas-open arm
  then a long-press click; assert the session is not replaced (`controller.session == armed`).
- **Verify:** `./scripts/test.sh CanvasKeyBehaviorTests`.

### Step 15 — Validate native mounts too (KM-4) — **STATUS ❌ OPEN (no arm path invokes `CanvasTreeValidator`)**
- **File:** `Sources/OpenClip/UI/Popup/PopupWindowController.swift` `armCanvas` (`:280–300`),
  `armMountedSession` (`:306–315`), and `armCanvasForTesting` (`:339–359`).
- **Change:** `try CanvasTreeValidator.validate(tree)` (map failure through
  `exitContent()` + `modeStore.statusBanner = StatusFeedback(error:)`, like `failCanvas`).
- **Test:** a native tree over 32k chars must collapse + error banner, not render.
- **Verify:** `./scripts/test.sh CanvasSessionLifecycleTests`.

### Step 16 — O(1) field-handler resolution (PERF-2) — **STATUS ❌ OPEN (per-draft DFS still at `canvasTextFieldProps(withID:)` in `CanvasSessionView.swift`)**
- **File:** `Sources/OpenClip/UI/Popup/CanvasSessionView.swift:319` (`CanvasSessionDraftPlan.plan`)
  and `:327` (`canvasTextFieldProps(withID:)`).
- **Change:** precompute `[id: CanvasTextFieldProps]` per tree (`fieldMap(tree:)`) and hand it to
  `CanvasSessionDraftPlan.plan` / `commitDraft` instead of per-draft DFS.
- **Verify:** existing `CanvasSessionViewTests` green (plan behavior unchanged).

### Step 17 — Single-funnel panel growth on content entry (PERF-3) — **STATUS ❌ OPEN (pin flags are still set *after* the `modeStore.mode = .content` flip)**
- **File:** `Sources/OpenClip/UI/Popup/PopupWindowController.swift:280–315` (`armCanvas`/
  `armMountedSession` both set `pinBottomEdgeOnResize` after the mode flip) and
  `PopupPanel.swift:50–69`.
- **Change:** set `pinBottomEdgeOnResize`/`recenterXOnResize` **before** `modeStore.mode =
  .content` publishes, and confirm `resizePanel` remains the only height-cap authority; add a
  manual smoke checklist entry (`./scripts/dev_run.sh`) for entering content with
  `searchResultsAbove == false` on a top-anchored screen.
- **Note:** full verification needs a live window; record results in the plan ledger.

### Step 18 — Land Task 24 and re-run the audit closure — **STATUS ❌ OPEN (no fix applied — the "land Task 24" feature item shipped as pre-planned work in Tasks 24–25, NOT as a fix; the closure re-checks were never run)**
- **Feature item — shipped as part of the original plan, not as an audit fix (Tasks 24–25,
  `d140e3c` + `18a4a33`):** `CanvasBridgeCollector`; `openclip.showContent(tree, { size })`;
  `openclip.showStatus(message, style)`; preferredSize capture; and the `showCanvas` producer
  (`JavaScriptCanvasAction`). Status routing (`onStatus` → `presentStatus`) and the content-mode
  gap were addressed by Tasks 24/26 (`d140e3c`, `b368b86`). None of this implemented a fix from
  this audit.
- **Closure half — STILL OPEN (this is the actual work of this step):** the plan required
  *"re-run the Step 9–12 checks against the new bridge and re-run the full suite."* With the
  collector now installed, re-run against `CanvasScriptBox`/`JavaScriptCanvasEngine` at HEAD —
  Step 9 (`h()` variadic), Step 10 (recursion bound), Step 11 (mount-time effects — the collector
  makes the drop silent), Step 12 (`keepVisible` dead flag — `collector.keepVisible` still
  unconsumed). Fix or explicitly rule each, then re-run the full suite. The audit findings in
  §2–§6 are otherwise unchanged.

---

## Verification Workflow (this audit's empirical baseline)

- Commit audited: `769c73d` (Task 23); post-audit commits `d140e3c`/`18a4a33`/`b368b86`/`dfc2f0e`
  (Tasks 24–27) reviewed and reconciled against this plan on 2026-08-09.
- Deliverable written before baseline run per task instructions.
- Local toolchain: `xcodegen`, `xcodebuild`, `timeout` present.
- Findings labeled: **SEC** security · **CR** crash/claim · **UI** rendering · **JS** bridge ·
  **KM** key/state · **PERF** performance.
- Official spec references: §4 (handler/event/state), §5.1 (JS contract), §5.3 (safety/limits),
  §5.4 (dispatch performance + parser recovery), §7 (sizing/theming/delivery), §11 (errors).