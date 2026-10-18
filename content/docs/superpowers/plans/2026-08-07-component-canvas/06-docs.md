# 06 — Documentation + Stale-Line Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution preference:** inline (no implementation subagents).

**Goal:** After Tasks 1–26 land, the docs must describe the *final* state: `type: "canvas"` authoring for extension authors (`docs/developer-guide/AGENTS.md` + `docs/developer-guide/package-format.md`), the interactive component-tree surface (popup-window / directory-structure / known-debt), the JS runtime's element-tree `showContent` (docs/runtimes/javascript.md), the shell JSON protocol losing its `showContent` type (zsh-python.md + developer-guide/AGENTS.md §8a), the repo-root `AGENTS.md` content-renderer rule, and the now-deleted `PopupContentView`/`PopupContent` citations (including the `PopupThemeModel.swift` header comment). Every stale reference to the deleted canned-content path must be purged.

**Architecture:** Pure docs + comment edits — no behavior changes. The canonical canvas contract is §5.1 of the spec (`docs/superpowers/specs/2026-08-07-component-canvas-design.md`): `const initialState`, `function ui(state, input)` (the only required export), `const handlers = { name(state, event) {...} }` (optional), the `h(type, props, children)` element-object helper, the 11 component types, the `openclip` bridge (`input`/`matchedText`/`captures`/`options`, leaf effects, `keepVisible()` no-op wrapper, `showStatus` after collapse, `showContent(tree, { size })`), and the state model (app-owned `CanvasSessionState`; `textField` commits on submit/blur; `toggle` commits the flipped value). All stale `PopupContent`/`PopupContentView`/canned-`showContent` citations below were verified against the current tree with `grep`.

## Global Constraints

(From the plan README — this task inherits them.) Docs must match the FINAL code state after Tasks 1–26: `ActionResult.showContent(CanvasComponent, CanvasHeader?)`, content mode is key exactly like search, shell never renders a canvas, `output: "canvas"` is not introduced, `PopupContent.swift`/`PopupContentView.swift` are deleted. Docs-only change — the full test suite is intentionally not re-run here; the quick build gate is the verification (nothing may reference a deleted symbol).

---

### Task 27: Documentation + stale-line cleanup

**Files:**
- Edit: `docs/developer-guide/AGENTS.md` (the extension SDK reference — the canvas authoring home)
- Edit: `docs/developer-guide/package-format.md` (manifest `type: "canvas"` kind)
- Edit: `docs/runtimes/javascript.md` (element-tree `showContent`, resolution order)
- Edit: `docs/runtimes/zsh-python.md` (shell JSON `"showContent"` removal)
- Edit: `docs/architecture/popup-window.md` (surface is the interactive canvas; content-is-key; status on the bar banner)
- Edit: `docs/architecture/directory-structure.md` (new `Sources/Core/Canvas/` + `Sources/OpenClip/UI/Popup/Canvas*.swift` + `Sources/OpenClip/Actions/Canvas*.swift`; removed `PopupContent.swift`/`PopupContentView.swift`)
- Edit: `docs/architecture/extensions.md` (privilege-tier table: `showContent` → canvas engine)
- Edit: `docs/architecture/known-debt.md` (content-mode/canvas-renderer lines)
- Edit: repo-root `AGENTS.md` (the "only content renderer" rule at line 121)
- Edit: `Sources/OpenClip/UI/Popup/PopupThemeModel.swift` (header comment line 5 cites deleted `PopupContentView`)

- [ ] **Step 1: Rewrite the canvas authoring section in `docs/developer-guide/AGENTS.md`**

The current canned-`showContent` bullet lives at lines 444–448 and the resolution order at 452–456. Replace the bullet with the §5.1 canvas contract (a new "Interactive canvases (`type: "canvas"`)" subsection, or a §7a placed before the ActionResult surface):

- Manifest kind: `"type": "canvas"` (JS-only; `scriptCode` required; `"async": true` optional).
- Script contract: `const initialState` (optional; app-owned state seeds the session), `function ui(state, input)` — the **only required export**, must return an element object (or an array → wrapped in a vertical `stack`); `const handlers = { name(state, event) { return newState } }` (optional; `state` is a fresh JSON object each call, `event = { type, targetID, value, handler }`). **Note (L6):** handlers return the **new state**, not `newTree` — the render tree is produced by `ui(newState, input)` after the handler runs.
- `h(type, props, children)` and the 11 component types with props: `stack` (orientation, spacing), `divider`, `spacer` (minLength), `text` (content, style: title/body/caption/monospaced, color: primary/secondary/accent, selectable), `icon` (symbol|iconify|local|url, size), `image` (url|local, cornerRadius), `button` (title, icon, style: accent/plain, disabled, handler), `list`/`listItem` (icon, title, subtitle, badge, disabled, handler), `textField` (id required, value, placeholder, onSubmit, onChange), `toggle` (id required, value, onToggle), `link` (title, url).
- The `openclip` bridge inside a canvas: `input`/`matchedText`/`captures`/`options`; leaf effects (`paste`/`copy`/`cut`/`keyPress`/`runShortcut`/`openURL`/`showServices`/`notify`) appended on each handler return; `keepVisible()` is a **no-op** inside a canvas (effects never dismiss); `showStatus(message, style)` surfaces on the bar banner **after** collapse, never inside the canvas; `showContent(tree, { size })` — the optional `{ size: { width, height } }` declares the canvas size once, clamped to 220–360 wide / `Constants.popupMaxHeight` tall.
- State model: `textField` commits on submit (Enter) or blur, never per keystroke; `toggle` commits the already-flipped value; handler receives `(state, event, input)`.
- Interactive counter example (mirroring §9's worked-example style) + a `textField` form example.
- Behavior contract: Esc collapses to the bar; click-outside / app deactivation hides; mount/parse/watchdog failures reject the canvas and surface an error status on the bar banner.
- Update the resolution-order paragraph (452–456) to note `showContent` resolution produces a `.showContent(CanvasComponent, CanvasHeader?)` result, and `showContent` called *from* a canvas session appends a canvas-replacement effect (never dismisses).

- [ ] **Step 2: Update the ActionResult table + shell JSON protocol in the same file**

- Line 479 `.showContent(PopupContent)` → `.showContent(CanvasComponent, CanvasHeader?)` (inline interactive canvas; **keeps popup open**).
- Line 500 shell JSON `{ "type": "showContent", "title": "T", "body": "B", "footer": [...] }` → **removed** from the accepted `type` values (shell never renders a canvas; a `"showContent"` type now maps to `.success`, matching Task 21). Update the "only script JSON `type` values" note at line 508.
- §12 source-of-truth recap (lines 646–647): drop `PopupContent.swift` from the Result-model list; add the new files — `Sources/Core/Canvas/`, `Sources/OpenClip/UI/Popup/CanvasSession*.swift`, `Sources/OpenClip/Actions/CanvasScriptBox.swift`/`JavaScriptCanvasEngine.swift`/`JavaScriptCanvasAction.swift`.

- [ ] **Step 3: Document the manifest `type: "canvas"` kind in `docs/developer-guide/package-format.md`**

Add a `"type": "canvas"` row/section beside the existing kinds (js/applescript/shell/url/group): JS-only, `scriptCode` required (the canvas script), `"async": true` optional, no `output` key (`output: "canvas"` is **not** introduced). Point to the §7a authoring section in `docs/developer-guide/AGENTS.md`.

- [ ] **Step 4: Update `docs/runtimes/javascript.md`**

- Lines 37–51: the typed `showContent(payload: object)` signature with `title`/`icon`/`subtitle`/`body`/`emphasis`/`rows`/`footer` → `showContent(elementTree: object, options?: { size?: { width, height } })` (element objects from `h()`), plus the canvas-session notes (state, handlers, keepVisible no-op, status after collapse).
- Line 129 (`showContent(...)` → `.showContent`): unchanged semantically, but note it produces the canvas `ActionResult`; add that resolution from inside a canvas session re-renders rather than dismissing.

- [ ] **Step 5: Update `docs/runtimes/zsh-python.md`**

- Line 65: `"showContent"` → content canvas is **removed** from the shell JSON protocol — shell scripts cannot render a canvas; a `"showContent"` type maps to `.success`.

- [ ] **Step 6: Update the architecture docs**

- `docs/architecture/popup-window.md`: line 15 (`PopupContentView` in the tree) → `CanvasSessionView`; line 25 (the "window is deliberately never the key window" paragraph — content mode is currently called "not an exception"; update so content mode **is** a key exception like search) → also extend the never-key phrasing at line 25 (`PopupWindowController.enterSearch()` → `enterSearch()`/`enterKeyMode()`); line 27 (12pt info cards in `PopupContentView`) → canvas card padding; line 33 (Keyboard Dismissal — content mode "stays non-key", Esc via event monitors) → content is key, Esc collapses via SwiftUI `.onKeyPress`, non-Esc keys owned by the focused canvas component; line 78 (bar renders `PopupContentView`) → `CanvasSessionView`; line 86 (Canvas renderer paragraph) → the component-tree renderer + content-is-key + hover preview is a non-keyed `text` component + status surfaces on the bar banner after canvas collapse (never in-canvas); line 91 (Non-key Esc: "content mode is **not** a key-window exception") → content mode **is** key; `exitContent()` collapses via the SwiftUI `.onKeyPress` on the field/root, the global monitor observes content Esc only for non-key transitions (M8) and the old `contentBlocksDismiss` phrasing is gone; line 97-99 (`StatusBadgeModel.shared` corner badge) → status while a canvas is open is **queued** (`pendingStatus`) and shown on the bar banner after collapse; there is no in-canvas `StatusBadgeModel` anymore. Add: content mode is **key** exactly like search; Esc from a focused field collapses via `.onKeyPress`; and the **Scoped Key Exception** section (~line 154: "Search mode makes the panel key — the **sole** exception") → rename to "Key-Mode Exceptions" and add the content-mode path (`enterKeyMode()`/`exitKeyMode()` alongside `enterSearch()`/`exitSearch()`, Task 9/14; the `previousFrontmostApp` capture-once/clear-on-hide lifecycle).
- `docs/architecture/directory-structure.md`: line 22 (`PopupContent.swift`) → the new `Sources/Core/Canvas/` directory listing (`CanvasComponent.swift`, `CanvasSessionState.swift`, `CanvasLimits.swift`, `CanvasScripting.swift`, `CanvasElementSpec.swift`, `CanvasElementParser.swift`, `CanvasFocus.swift`, `CanvasDSL.swift`); line 112 (`PopupContentView.swift`) → the new `Sources/OpenClip/UI/Popup/CanvasSession*.swift` files + `Sources/OpenClip/Actions/JavaScriptCanvas*.swift`.
- `docs/architecture/extensions.md`: line 103 privilege-tier table `openclip.* effects (... showContent/Status)` → note canvas rendering is part of the JS runtime (`type: "canvas"`), not a shell effect.
- `docs/architecture/known-debt.md`: lines 80–81 (`PopupContentView` renders `.info` emphasis; `StatusBadgeModel`) → the canvas renderer is `CanvasSessionView`; note any remaining debt accurately.

- [ ] **Step 7: Update repo-root `AGENTS.md` + the `PopupThemeModel.swift` header comment**

- `AGENTS.md` line 121: "`PopupContentView` is the only content renderer" → "`CanvasSessionView` (via `PopupContentView`'s successor) is the only content renderer", and note content mode must be added as a key-window exception **like search** (update the sentence around lines 122-123 that says content mode "is **not** a key-window exception" — it now **is**; Esc collapses via `.onKeyPress`, and the status "canvas corner badge" phrasing there should read "bar banner after collapse").
- `AGENTS.md` §5.10 (the "Popup must never be key — except the scoped action-search exception" rule, ~line 198-203): expand the exception list from search-only to **search + canvas content** — `PopupPanel.allowsKey` is enabled by `enterSearch()` *and* `enterKeyMode()` (content mode, Task 14); on exit/hide `previousFrontmostApp` is still re-activated. (L7 — this rule is stale if left search-only and `06-docs.md` must touch it.)
- `Sources/OpenClip/UI/Popup/PopupThemeModel.swift` line 5: "shared by PopupView, PopupContentView and PopupThemeSelector" → "shared by PopupView, CanvasSessionView and PopupThemeSelector".
- Also purge remaining `statusBadge`/`StatusBadgeModel`/`currentStatusBadge` citations inside popup-window/known-debt (L7) — replace with the pending-status-banner flow; the badge is deleted.

- [ ] **Step 8: Verify — no stale references remain**

```bash
rg -n "PopupContent|PopupContentView" Sources Tests docs AGENTS.md README.md 2>/dev/null || echo "clean"
```

Expected: the only remaining hits are the plan/spec files (`docs/superpowers/`) and intentional historical notes (e.g. `docs/architecture/known-debt.md` migration records), never live code/docs citations. Also confirm the shell docs no longer advertise a `"showContent"` script type:

```bash
rg -n '"showContent"' docs/runtimes docs/developer-guide 2>/dev/null || echo "clean: shell never renders a canvas"
```

- [ ] **Step 9: Quick build gate (docs/comments-only, but prove nothing dangles)**

```bash
timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build
```

- [ ] **Step 10: Commit**

```bash
git add -A docs AGENTS.md Sources/OpenClip/UI/Popup/PopupThemeModel.swift
git commit -m "docs(canvas): type canvas authoring contract; purge stale PopupContent/PopupContentView references"
```

**Plan complete.** All 27 tasks are specified. `02-key-mode.md` (9–10) → `03-session-renderer.md` (11–16) → `04-migration.md` (17–21) → `05-js-engine.md` (22–26) → this file (27). Core tasks 1–8 live in `01-core-model.md`; the plan README is the index.
