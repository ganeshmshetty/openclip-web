# 04 — Producer Migration & Deletion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution preference:** inline (no implementation subagents).

**Goal:** Land the plan's spine — the **dual-case `ActionResult` transition**. Add `.showContentTree(CanvasComponent, CanvasHeader?)` and `.showCanvas(CanvasMountRequest, CanvasHeader)` alongside the still-working `.showContent(PopupContent)`, migrate every producer onto the tree (AIAction, `showAIContent`, `ResultContentProviding.makeContent`, `CalculateAction`, `beginLongPressIfNeeded`, `ActionResultAdapter.showResult`, `OpenClipJSHost.parseContent`), then delete the old case, `LegacyContentBridge`, `PopupContent.swift`, and the shell `showContent` JSON type, renaming `showContentTree` → `showContent`. No mega-atomic payload flip: the old case compiles and works until Task 21.

**Architecture:** Core changes are additive until the final mechanical delete. The controller arms trees via the Task 13 `armCanvas`; scripting mounts route through `canvasSessionController.mount` with a temporary `UnavailableCanvasEngine` (replaced by `JavaScriptCanvasEngine` in Task 23 — no producer emits `.showCanvas` before then). Tests migrate in the same task that changes the producer.

**Tech Stack:** Swift 6, Foundation, SwiftUI/AppKit (App target only). Core gains two `ActionResult` cases + a protocol return-type change.

## Global Constraints

(From the plan README — every task here inherits them.) Dual-case transition: old case + bridge alive until Task 21, then deleted; `xcodegen generate` after any `.swift` add/remove/rename; `CanvasTreeValidator.validate` runs at mount (native and parser); shell never produces a canvas in v1 (old `showContent` JSON maps to `.success`); `ContentOutcome` is retired (`.perform` → `CanvasEffect`, `.run`/`.showSubMenu` dropped); `dismissesPopup` stays false for canvas presentation results. All tests live in `Tests/OpenClipTests/`. Spec: `docs/superpowers/specs/2026-08-07-component-canvas-design.md` §7, §8, §10.

---

### Task 17: ActionResult dual-case + controller arms

**Files:**
- Edit: `Sources/Core/Actions/ActionResult.swift`
- Edit: `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift` (exhaustive-switch compile fix)
- Edit: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Edit: `Tests/OpenClipTests/ActionResultDismissPolicyTests.swift`

**Interfaces:**
- Consumes: `CanvasComponent`, `CanvasHeader`, `CanvasMountRequest` (Core).
- Produces:
  - `ActionResult.showContentTree(CanvasComponent, CanvasHeader?)`
  - `ActionResult.showCanvas(CanvasMountRequest, CanvasHeader)` — dormant until Task 24 (no producer emits it through Task 22; declared now only so the exhaustive switches + Task 21 final shape enumerate it).
  - Both non-dismissing (`dismissesPopup == false`).

- [ ] **Step 1: Add the cases to `ActionResult.swift`**

In `Sources/Core/Actions/ActionResult.swift` (line 27), after the existing presentation cases:

```swift
    /// Render an interactive component tree on the popup panel (spec §7). The optional header is the
    /// running action's chrome title/icon; nil falls back to the controller's current-action header.
    /// Keeps the popup open. (Legacy `.showContent(PopupContent)` is deleted in Task 21.)
    case showContentTree(CanvasComponent, CanvasHeader?)
    /// Mount a scripting canvas session (spec §5.2): the engine evaluates the mount request, arms
    /// the session, and the tree re-renders via `.dispatch`. Keeps the popup open.
    /// Transient dead case until Task 24: no producer emits `.showCanvas` before the JS canvas
    /// producer (Task 24). Declared now for ecosystem completeness (exhaustive switches + the
    /// Task 21 final shape enumerate it); the first producer arms it in Task 24.
    case showCanvas(CanvasMountRequest, CanvasHeader)
```

Update `dismissesPopup` (line 55-64): `case .keepVisible, .showContent, .showContentTree, .showCanvas, .showStatus:` returns false. Keep the doc comment on the legacy case (`showContent(PopupContent)`) noting it's bridged until Task 21.

- [ ] **Step 2: Fix `ActionResultHandler.handle`'s exhaustive switch**

`Sources/OpenClip/Platform/Effects/ActionResultHandler.swift` line 76: `case .showContent, .showStatus, .openConfiguration, .sequence:` → add the two new cases: `case .showContent, .showContentTree, .showCanvas, .showStatus, .openConfiguration, .sequence:`. Presentation results stay presenter-owned no-ops (`.showCanvas` included only for switch exhaustiveness — it's a no-op until Task 24).

- [ ] **Step 3: Route the new cases in `PopupWindowController`**

In `handleActionResult` (line 555), add before the `default`:

```swift
        case .showContentTree(let tree, let header):
            armCanvas(tree: tree, header: header ?? currentHeaderFromAction())
        case .showCanvas(let request, let header): // no-op/unused until Task 24 (first producer)
            mountCanvas(request: request, header: header)
```

Add the two helpers:

```swift
    /// The running action's chrome title/icon for a canvas whose producer left the header nil.
    private func currentHeaderFromAction() -> CanvasHeader {
        if let hoveredAction {
            return CanvasHeader(
                title: hoveredAction.displayTitle(using: ActionCustomizationManager.shared),
                icon: hoveredAction.icon.symbolName
            )
        }
        return CanvasHeader(title: "", icon: nil)
    }

    /// Arms a scripting session. Dormant until Task 24 — no producer emits `.showCanvas` before the
    /// JS canvas producer; the engine is injected here (replaced by JavaScriptCanvasEngine in Task 23)
    /// and the stub surfaces a mount error that collapses + shows the error banner.
    private func mountCanvas(request: CanvasMountRequest, header: CanvasHeader) {
        canvasSessionController.mount(request, scripting: UnavailableCanvasEngine(), header: header)
    }
```

- `ActionIcon.symbolName` already exists in `Sources/Core/Actions/ActionResultAdapter.swift:52`.

- [ ] **Step 4: Add the temporary `UnavailableCanvasEngine`**

Small file `Sources/OpenClip/UI/Popup/UnavailableCanvasEngine.swift` (deleted in Task 23):

```swift
// UnavailableCanvasEngine.swift
// OpenClip
//
// Placeholder CanvasScripting until Task 23 wires JavaScriptCanvasEngine. No producer emits
// `.showCanvas` before then; a stray producer gets a deterministic mount error → failCanvas.
import Core

struct UnavailableCanvasEngine: CanvasScripting {
    func mount(_ request: CanvasMountRequest) async throws -> CanvasMountResult {
        throw NSError(domain: Constants.actionErrorDomain, code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Canvas runtime not available."])
    }
    func dispatch(_ request: CanvasDispatchRequest) async throws -> CanvasDispatchResult {
        throw NSError(domain: Constants.actionErrorDomain, code: 1,
                      userInfo: [NSLocalizedDescriptionKey: "Canvas runtime not available."])
    }
}
```

- [ ] **Step 5: Extend the dismissal-policy tests**

`Tests/OpenClipTests/ActionResultDismissPolicyTests.swift`:

```swift
    func testCanvasTreeDoesNotDismiss() {
        let tree = CanvasComponent.text(CanvasTextProps(content: "hi"))
        XCTAssertFalse(ActionResult.showContentTree(tree, nil).dismissesPopup)
    }
    func testCanvasMountDoesNotDismiss() {
        // Exercises the dormant `.showCanvas` case in isolation (no producer emits it before Task 24).
        let request = CanvasMountRequest(input: "x", scriptCode: "const ui = () => h('text', {});")
        XCTAssertFalse(ActionResult.showCanvas(request, CanvasHeader(title: "T", icon: nil)).dismissesPopup)
    }
```

Add a controller-routing test in `PopupCanvasTests`:

```swift
    func testShowContentTreeArmsSession() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        let tree = CanvasComponent.stack(.init(), [
            .text(CanvasTextProps(content: "hello")),
            .button(CanvasButtonProps(title: "Go", handler: .effect(.copy("hello"))))
        ])
        controller.handleActionResult(.showContentTree(tree, CanvasHeader(title: "T", icon: nil)))
        XCTAssertEqual(controller.modeStore.mode, .content)
        XCTAssertNil(controller.modeStore.content?.scripting, "tree results arm a native session")
    }
```

- [ ] **Step 6: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh ActionResultDismissPolicyTests`, `timeout -k 10 60 ./scripts/test.sh PopupCanvasTests`, then the quick build gate.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
xcodegen generate
git add -A Sources/Core/Actions/ActionResult.swift Sources/OpenClip/Platform/Effects/ActionResultHandler.swift Sources/OpenClip/UI/Popup/PopupWindowController.swift Sources/OpenClip/UI/Popup/UnavailableCanvasEngine.swift Tests/OpenClipTests/ActionResultDismissPolicyTests.swift Tests/OpenClipTests/PopupCanvasTests.swift
git commit -m "feat(core): dual-case ActionResult (.showContentTree/.showCanvas) + controller arms"
```

---

### Task 18: Migrate AIAction.perform + showAIContent → tree

**Files:**
- Edit: `Sources/OpenClip/AI/AIAction.swift`
- Edit: `Sources/OpenClip/UI/Popup/PopupWindowController.swift` (`showAIContent`)
- Edit: any AI-action tests asserting the old `.showContent(PopupContent)` shape

**Interfaces:**
- Consumes: `Canvas.build` DSL (Task 8), `CanvasEffect`, `CanvasHeader`.
- Produces: `AIAction.perform` returns `.keepVisible(.showContentTree(tree, header))`; `showAIContent` arms the tree directly.

- [ ] **Step 1: Rewrite `AIAction.perform` (lines 40–54)**

```swift
    @MainActor
    public func perform(_ context: ActionContext) async throws -> ActionResult {
        guard let preset = preset(), !context.selection.text.isEmpty else { return .success }
        let provider = AIServiceManager.shared.currentProvider
        let response = try await provider.process(prompt: preset.prompt, text: context.selection.text)
        return .keepVisible(.showContentTree(
            Canvas.build {
                Canvas.text(response)
                Canvas.button("Replace", icon: "arrow.triangle.2.circlepath", handler: .effect(.paste(response)))
                Canvas.button("Copy", icon: "doc.on.doc", handler: .effect(.copy(response)))
            },
            CanvasHeader(
                title: displayTitle(using: ActionCustomizationManager.shared),
                icon: icon.symbolName
            )
        ))
    }
```

(`keepVisible` is now redundant — `.showContentTree` never dismisses — but keep it for exact behavioral parity with the old AI result path; remove the wrap in Task 21 cleanup if the tree-walk proves it inert. The header comes from the action's manifest chrome (`displayTitle(using:)`/`icon.symbolName`) per spec §7.6 — producers never set the canvas header; the AI preset's title/icon supply it.)

- [ ] **Step 2: Rewrite `showAIContent` (lines 246–266)**

```swift
    /// Renders the AI response (or error) as a canvas with Replace/Copy delivery options.
    private func showAIContent(text: String, isError: Bool) {
        let tree = Canvas.build {
            Canvas.text(text)
            if !isError {
                Canvas.button("Replace", icon: "arrow.triangle.2.circlepath", handler: .effect(.paste(text)))
                Canvas.button("Copy", icon: "doc.on.doc", handler: .effect(.copy(text)))
            }
        }
        armCanvas(tree: tree, header: currentHeaderFromAction())
    }
```

The header is the running action's chrome (`currentHeaderFromAction()` → `displayTitle(using:)`/`icon.symbolName`), never a producer literal — spec §7.6. The old error split (`"AI Error"`/`"exclamationmark.triangle"` vs `"AI Result"`/`"sparkles"`) is dropped; the `isError` state now surfaces only in the tree/status banner, not the header.

Remove the now-unused `PopupContent` import reference if it becomes unused in the file.

- [ ] **Step 3: Update AI tests**

Grep for assertions on the AI result shape:

```bash
rg -n "showContent\(|PopupContent|\.rows|\.footer" Tests/OpenClipTests | rg -i "ai"
```

Update any test that pattern-matches `case .showContent(let content)` from an AI action to `case .showContentTree(let tree, let header)`, asserting the tree contains a `text` with the response and two `.effect` buttons. If the file builds without a dedicated AI-result test, add `AIActionCanvasTests.swift` with a fake `AIServiceManager` provider (inject a stub provider if `AIServiceManager` supports it; otherwise test `showAIContent`'s output by calling it on the controller and asserting the armed session's tree).

- [ ] **Step 4: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh PopupCanvasTests`, `timeout -k 10 60 ./scripts/test.sh Popup`, then the quick build gate.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add -A Sources/OpenClip/AI Sources/OpenClip/UI/Popup/PopupWindowController.swift Tests/OpenClipTests
git commit -m "refactor(popup): AI result renders as a CanvasComponent tree"
```

---

### Task 19: Migrate ResultContentProviding + CalculateAction + beginLongPressIfNeeded + ActionResultAdapter

**Files:**
- Edit: `Sources/Core/Actions/ResultContentProviding.swift` (`makeContent` returns `CanvasComponent?`)
- Edit: `Sources/Core/Actions/Builtin/CalculateAction.swift`
- Edit: `Sources/Core/Actions/ActionResultAdapter.swift` (`.showResult` builds a tree)
- Edit: `Sources/OpenClip/UI/Popup/PopupWindowController.swift` (`beginLongPressIfNeeded`)
- Edit: `Tests/OpenClipTests/CalculateActionTests.swift`, `Tests/OpenClipTests/ActionResultAdapterTests.swift`

**Interfaces:**
- Consumes: `CanvasComponent`, `Canvas.build`, `CanvasEffect`, `CanvasHeader`.
- Produces: `makeContent` returns `CanvasComponent?`; the long-press path arms the tree with the action's header; `.showResult` returns `.showContentTree`.

- [ ] **Step 1: Change `ResultContentProviding`**

```swift
/// Provides a full result tree (title chrome + body + delivery options) shown on long-press.
public protocol ResultContentProviding: Action {
    @MainActor
    func makeContent(for context: ActionContext) async -> CanvasComponent?
}
```

Update the file doc comment (`Sources/Core/Actions/ResultContentProviding.swift`).

- [ ] **Step 2: Rewrite `CalculateAction.makeContent` (lines 57–91)**

```swift
    @MainActor
    public func makeContent(for context: ActionContext) async -> CanvasComponent? {
        let text = context.selection.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let result = evaluateExpression(text) else { return nil }
        let resultString = formatResult(result)
        let fullLine = "\(text) = \(resultString)"

        return Canvas.build {
            Canvas.text(fullLine)
            Canvas.button("Paste \(resultString)", icon: "arrow.triangle.2.circlepath", handler: .effect(.paste(resultString)))
            Canvas.button("Copy \(resultString)", icon: "doc.on.doc", handler: .effect(.copy(resultString)))
            Canvas.button("Copy \(fullLine)", icon: "doc.on.doc.fill", handler: .effect(.copy(fullLine)))
        }
    }
```

(Subtitle + row-text split collapses into a single body text — a faithful simplification; the chrome header still says "Calculate".)

- [ ] **Step 3: Rewrite `beginLongPressIfNeeded` (lines 309–328)**

```swift
            guard let tree = await (targetAction as? any ResultContentProviding)?.makeContent(for: actionContext) else {
                return
            }
            guard !Task.isCancelled else { return }
            longPressFired = true
            self.armCanvas(
                tree: tree,
                header: CanvasHeader(
                    title: targetAction.displayTitle(using: ActionCustomizationManager.shared),
                    icon: targetAction.icon.symbolName
                )
            )
```

- [ ] **Step 4: Rewrite `ActionResultAdapter.showResult` (lines 31–39)**

```swift
        case (.showResult, .copy(let s)), (.showResult, .paste(let s)):
            normalized = .showContentTree(
                Canvas.build {
                    Canvas.text(s)
                    Canvas.button("Paste", icon: "arrow.triangle.2.circlepath", handler: .effect(.paste(s)))
                    Canvas.button("Copy", icon: "doc.on.doc", handler: .effect(.copy(s)))
                },
                CanvasHeader(title: title, icon: icon)
            )
```

Update the file doc comment: `.showResult` wraps a string outcome in a component tree (was a `PopupContent` card).

- [ ] **Step 5: Update the tests**

- `CalculateActionTests.swift` (lines 53, 73): `makeContent` now returns `CanvasComponent?`; assert `case .stack(_, let children)` and that a child `.button` carries `handler: .effect(.paste(resultString))`. The header title assertion moves to the long-press arming path (covered in Task 16 integration).
- `ActionResultAdapterTests.swift` (lines 43, 67, 107–109, 178–180): pattern-match `case .showContentTree(let tree, let header)`; assert `header.title == "T"`, `header.icon == icon`, and the tree contains the `.paste`/`.copy` effect buttons.
- `ActionResultHandlerTests.swift:21` still compiles (old case alive until Task 21).

- [ ] **Step 6: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh CalculateActionTests`, `ActionResultAdapterTests`, `PopupCanvasTests`, then the quick build gate.
Expected: PASS (legacy `.showContent(PopupContent)` still alive — no other producer references it yet).

- [ ] **Step 7: Commit**

```bash
xcodegen generate
git add -A Sources/Core/Actions Sources/OpenClip/UI/Popup/PopupWindowController.swift Tests/OpenClipTests/CalculateActionTests.swift Tests/OpenClipTests/ActionResultAdapterTests.swift
git commit -m "refactor(core): ResultContentProviding/ActionResultAdapter build CanvasComponent trees"
```

---

### Task 20: Migrate OpenClipJSHost parseContent → element tree

**Files:**
- Edit: `Sources/OpenClip/Actions/OpenClipJSHost.swift`
- Edit: `Tests/OpenClipTests/OpenClipJSHostTests.swift`
- Edit: `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift`

**Interfaces:**
- Consumes: `CanvasElementSpec`, `CanvasElementParser`, `CanvasParseError` (Core Task 6), `h()` element objects.
- Produces: the one-shot host's `openclip.showContent` accepts an **element tree** (`h()` objects) and returns `.showContentTree(tree, nil)`; canned keys (`title`/`body`/`footer`/`emphasis`) removed.

- [ ] **Step 1: Register `h()` in the one-shot host's context**

In `makeOpenClipObject(...)` (OpenClipJSHost.swift:549), add a global `h` before `openclip` is populated:

```swift
        // h(type, props, children) → element object for the canvas bridge (spec §5.1). The one-shot
        // host registers it so a script can build openclip.showContent(...) trees; the canvas engine
        // (Task 22-24) shares the same contract via CanvasScriptBox.
        let hBlock: @convention(block) (String, Any?, Any?) -> Any = { type, props, children in
            var element: [String: Any] = ["type": type]
            if let props { element["props"] = props }
            if let children { element["children"] = children }
            return element
        }
        jsContext.setObject(hBlock, forKeyedSubscript: "h" as NSString)
```

- [ ] **Step 2: Change `collected.content` to a tree and rewrite `parseContent`**

- `collected.value.content: PopupContent?` → `CanvasComponent?`.
- The `showContentBlock` (line 220) becomes:

```swift
        let showContentBlock: @convention(block) (JSValue) -> Void = { value in
            collected.value.content = Self.parseElementTree(value)
        }
```

- Replace `parseContent` (lines 618–678) with `parseElementTree`:

```swift
    /// Parses an h() element object (`{type, props, children}`) into a CanvasComponent tree. The JS
    /// object is bridged to a neutral CanvasElementSpec via JSONSerialization (the parser stays
    /// JavaScriptCore-free). A structural violation (limits, non-object root) returns nil → status
    /// error; a lenient per-node recovery (unknown type dropped, malformed handler → non-interactive)
    /// is the parser's job. Canned keys (title/body/footer/emphasis) are gone.
    private static func parseElementTree(_ value: JSValue) -> CanvasComponent? {
        guard value.isObject,
              let object = value.toObject() as? [String: Any],
              let spec = CanvasElementSpecSpec(object: object),
              let root = try? CanvasElementParser.parseTree(spec),
              CanvasTreeValidator.isValid(root) else { return nil }
        return root
    }
```

  (`CanvasElementSpecSpec` is the App-side JSValue→spec conversion; see Step 3. Use `CanvasTreeValidator.isValid` (or wrap `parseTree` which already validates) — the Core parser already enforces limits and throws `CanvasParseError` on structural violations, so `try? parseTree` returning nil is sufficient; drop the redundant `isValid` check.)

- [ ] **Step 3: Add the JSValue→`CanvasElementSpec` conversion (promoted to `CanvasScriptBox` in Task 22)**

Add a small App-side helper (inline in `OpenClipJSHost.swift` for now):

```swift
    /// Converts a bridged JS element object to the neutral Core spec. nil for a non-object root.
    private static func CanvasElementSpecSpec(object: [String: Any]) -> CanvasElementSpec? {
        guard let type = object["type"] as? String else { return nil }
        let props = (object["props"] as? [String: Any] ?? [:]).compactMapValues(Self.jsonValue(from:))
        let children = (object["children"] as? [Any] ?? []).compactMap { child -> CanvasElementSpec? in
            guard let dict = child as? [String: Any] else { return nil }
            return CanvasElementSpecSpec(object: dict)
        }
        return CanvasElementSpec(type: type, props: props, children: children)
    }

    private static func jsonValue(from value: Any) -> JSONValue? {
        switch value {
        case let s as String: return .string(s)
        case let n as NSNumber: return CFGetTypeID(n) == CFBooleanGetTypeID() ? .bool(n.boolValue) : .number(n.doubleValue)
        case let b as Bool: return .bool(b)
        case let arr as [Any]: return .array(arr.compactMap(jsonValue(from:)))
        case let dict as [String: Any]: return .object(dict.compactMapValues(jsonValue(from:)))
        default: return nil
        }
    }
```

  (Task 22 moves these into `CanvasScriptBox` so the canvas engine reuses them.)

- [ ] **Step 4: Resolution order + error path**

In `resolveRaw` (lines 504–519), `raw = .showContent(content)` becomes `raw = .showContentTree(content, nil)` (header filled by the controller's `currentHeaderFromAction()`). When `parseElementTree` returns nil (malformed tree / structural violation), treat it as a mount rejection: return `.showStatus(StatusFeedback(message: "Canvas payload rejected.", style: .error))` instead of `.success` (matches §11 mount-exception handling for the one-shot path).

- [ ] **Step 5: Update the JS host tests**

- `OpenClipJSHostTests.swift:138` — replace the canned payload:

```swift
        let script = """
        openclip.showContent(h('stack', { direction: 'vertical' }, [
          h('text', { content: 'Hello' }),
          h('button', { title: 'Paste', handler: 'x', props: {} })
        ]));
        """
        guard case .showContentTree(let tree, _) = result else { return XCTFail(...) }
        XCTAssertEqual(tree, .stack(...))   // match the built tree
```

- `GoldenExtensionPlatformTests.swift:305` — the sample extension script's `showContent` payload becomes an element tree; update the golden assertion accordingly.
- Add `testShowContentRejectsMalformedElementTree` — `openclip.showContent({ notATree: true })` → `.showStatus(.error)`.
- Add `testCannedKeysNoLongerProduceContent` — `openclip.showContent({ title: 'T', body: 'B' })` is now a **non-object tree** → rejected with an error status (canned keys removed; no silent fallback).

- [ ] **Step 6: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh OpenClipJSHostTests`, `timeout -k 10 60 ./scripts/test.sh GoldenExtensionPlatformTests`, then the quick build gate.

- [ ] **Step 7: Commit**

```bash
xcodegen generate
git add -A Sources/OpenClip/Actions/OpenClipJSHost.swift Tests/OpenClipTests/OpenClipJSHostTests.swift Tests/OpenClipTests/GoldenExtensionPlatformTests.swift
git commit -m "feat(js): openclip.showContent accepts element trees; drop canned canvas keys"
```

---

### Task 21: Delete the legacy path + rename

**Files:**
- Edit: `Sources/Core/Actions/ActionResult.swift` (remove old case; rename `showContentTree` → `showContent`)
- Delete: `Sources/Core/Actions/PopupContent.swift`
- Delete: `Sources/OpenClip/UI/Popup/LegacyContentBridge.swift`
- Edit: `Sources/OpenClip/UI/Popup/PopupWindowController.swift` (remove bridge usage, old `enterContent(PopupContent)`, `currentStatusBadge` vestiges)
- Edit: `Sources/Core/Extensions/ShellProcessRunner.swift` (shell `showContent` → `.success`; drop `title`/`body`/`footer` from `ScriptJSONOutput`)
- Edit: `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift` (switch cases)
- Edit: all tests referencing the old `.showContent(PopupContent)` case

**Interfaces:**
- Consumes: everything from Tasks 17–20.
- Produces: the final `ActionResult` shape — `case showContent(CanvasComponent, CanvasHeader?)` + `case showCanvas(CanvasMountRequest, CanvasHeader)`; `PopupContent`/`ContentEmphasis`/`ContentRow`/`ContentOption`/`ContentOutcome` deleted; shell protocol loses `showContent`/`title`/`body`/`footer`.

- [ ] **Step 1: Rename + delete in `ActionResult.swift`**

- Remove `case showContent(PopupContent)` (line 27).
- Rename `case showContentTree(CanvasComponent, CanvasHeader?)` → `case showContent(CanvasComponent, CanvasHeader?)`, updating the comment (this is now the one canvas-tree case; `.showCanvas` remains for scripting mounts).
- `dismissesPopup`: `case .keepVisible, .showContent, .showCanvas, .showStatus:` returns false.

- [ ] **Step 2: Delete `PopupContent.swift` + `LegacyContentBridge.swift`**

- `Sources/Core/Actions/PopupContent.swift` — delete (retires `PopupContent`, `ContentEmphasis`, `ContentRow`, `ContentOption`, `ContentOutcome`).
- `Sources/OpenClip/UI/Popup/LegacyContentBridge.swift` — delete.
- Check nothing else references these types:

```bash
rg -n "PopupContent|ContentEmphasis|ContentRow|ContentOption|ContentOutcome" Sources Tests
```

Fix every remaining reference (the only producers left are the ones already migrated in Tasks 18–20; `PopupCanvasTests` `makeResultContent()` and `PopupCanvasViewTests` may still build a `PopupContent` — replace with a `Canvas.build { ... }` tree armed via `handleActionResult(.showContent(tree, header))`).

- [ ] **Step 3: Clean `PopupWindowController`**

- Remove the old `enterContent(_ content: PopupContent)` (bridge path) — only `armCanvas` remains.
- `handleActionResult`: `case .showContent(let tree, let header):` → `armCanvas(tree: tree, header: header ?? currentHeaderFromAction())`.
- Remove the `currentStatusBadge`/`StatusBadgeModel` vestiges if any survived Task 13; confirm `presentStatus` uses only `pendingStatus` + banner.
- `onContentOutcome` closure in `show(for:)` (lines 89–98) and the `PopupView` `ContentOutcome` param: `ContentOutcome` is deleted, so remove the closure and the `onContentOutcome`/`onExitContent` plumbing that referenced it. (Esc collapse is now the canvas root `.onKeyPress` → `onExitContent`; bar-level paste-from-canvas is gone — canvas buttons use `.effect(.paste)`.)
- `onCanvasEffect` needs **no re-wiring** on bridge deletion: it already routes through `handleCanvasEffects` (Task 13), the single keep-open door shared with dispatch-collected effects — keyboard effects get `deliverKeyboardEffect`, leaf effects never dismiss. Do not re-point it at `handleEffect`; there is no legacy dismissal path left to preserve (the old footer-paste `hide()` was an `onContentOutcome` artifact removed above).

- [ ] **Step 4: Shell non-canvas**

`Sources/Core/Extensions/ShellProcessRunner.swift`:
- Delete the `case "showContent":` block (lines 82–100).
- Delete `title`/`body`/`footer` from `ScriptJSONOutput` (lines 49–51, 56). `message`/`style` stay (status).
- A script still emitting `{"type":"showContent", ...}` now decodes with an unknown `type` → the mapper's default returns `.success` (shell never renders a canvas in v1 — §10). Verify the default branch ends in `.success`.

- [ ] **Step 5: Fix `ActionResultHandler` + update all tests**

- `ActionResultHandler.handle` (line 76): `case .showContent, .showCanvas, .showStatus, .openConfiguration, .sequence:` → break.
- Grep the whole test tree for `.showContent(` / `PopupContent` / `ContentOption` and update each:
  - `PopupCanvasTests.makeResultContent()` → a `Canvas.build` tree; assertions move to `modeStore.content?.tree` / `header`.
  - `ScriptActionExecutionTests.swift:112–121` — the shell script emitting `showContent` now maps to `.success`; rewrite the test to assert `.success` and add a paste-path assertion for leaf-effect parity.
  - `ActionResultHandlerTests:21` — `.showContent(content)` → `.showContent(tree, nil)` (handler treats it as a no-op).
  - `ActionResultAdapterTests` — `.showContentTree` → `.showContent` in the pattern matches.
  - `AIActionTests`/`OpenClipJSHostTests`/`GoldenExtensionPlatformTests` — `.showContentTree` → `.showContent` (already asserting the tree shape).
  - `ActionResultDismissPolicyTests` — case renamed.

- [ ] **Step 6: Full verification**

Run the quick build gate, then the full suite once:

```bash
timeout -k 10 60 ./scripts/test.sh
```

Fix any straggler `.showContent(PopupContent)`/`PopupContent` reference until green.

- [ ] **Step 7: Commit**

```bash
xcodegen generate
git add -A Sources Core Sources/OpenClip Tests
git commit -m "refactor(core): delete legacy PopupContent canvas path; shell showContent maps to success"
```

**Done with migration.** Next: `05-js-engine.md` (Tasks 22–26).
