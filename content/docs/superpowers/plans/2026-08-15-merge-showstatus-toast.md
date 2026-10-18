# Merge `showStatus` into the Single Toast Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold `ActionResult.showStatus(StatusFeedback)` into the single toast surface as `ActionResult.toast(StatusFeedback)`, with **uniform dismissal** (every run hides the popup, including errors), an opt-in `StatusFeedback.keepVisible` for scripts that must keep the popup up, and **one toast per run** (a script toast wins over a declared per-click toast and over the default "Copied"). Implicit string returns from JS functions and AppleScript now map to `.paste` so that left-click pastes and a secondary click derives copy via the existing delivery logic.

**Architecture:** Rename the result case (mechanical), move the dismissal decision into `StatusFeedback.keepVisible` (`dismissesPopup` = `!feedback.keepVisible`, flipping the default from keep-open to dismiss), keep `ActionResultDelivery.resolve` as the single pure per-leaf delivery decision, and add a **presenter-level suppression** rule: when a top-level result tree contains a toast (`.toast` directly or inside a `.sequence`), the delivery companion toast is suppressed for every effect in that tree (script toast wins; one toast per run). JS resolution changes so a toast **coexists** with effects (a `.sequence([.toast, effect])` instead of one winning), and JS/AppleScript implicit returns become `.paste`.

**Execution-order note (corrected):** the enum-case rename is a cross-file, atomic change — Swift cannot compile when Core names the case `.toast` while the app and tests still pattern-match `.showStatus`. So **Task 2 performs the whole rename at once** (no behavior change), and the behavior changes layer on afterward as individually green, verifiable tasks. Tasks 2-8 each end with a compiling, test-passing build.

**Tech Stack:** Swift 6 (SWIFT_STRICT_CONCURRENCY complete), AppKit + SwiftUI, XcodeGen (`project.yml`), XCTest (flat `Tests/OpenClipTests/` target), jq-based manifest validator.

## Global Constraints

- **No backwards-compatibility and no deprecation notes.** The `showStatus` name is removed everywhere — no alias, no shim, no "legacy"/"deprecated"/"renamed from" wording in any doc. Docs present `toast` as the API. Shell JSON `status` type is removed from the mapper (unknown types already map to `.success`) and from the validator whitelist.
- **Core stays pure** — no AppKit/SwiftUI imports in `Sources/Core/`. `keepVisible`, the `.toast` case, `dismissesPopup`, `containsToast`, the shell mapper, and `ActionResultDelivery` all live in Core; toast *rendering* and the precedence suppression live in App (`PopupWindowController`/`ToastPanelController`).
- **`ActionResult` is not Equatable** — keep using the existing `assertCase`/pattern-match helper style (`Tests/OpenClipTests/ActionResultDeliveryTests.swift`); `ActionDelivery.areEqual` is extended in place (its `.showStatus` pair becomes `.toast`).
- **One toast per run.** Precedence: **script toast > declared per-click toast (`primaryToast`/`secondaryToast`) > default "Copied"**. Implemented as presenter-level suppression: `result.containsToast` (true for a `.toast` anywhere in the top-level result, including inside a `.sequence`) suppresses the delivery companion toast for every effect in that tree.
- **Uniform dismissal.** Default is now dismiss: `.toast(feedback)` has `dismissesPopup == !feedback.keepVisible` (`.sequence` dismisses only when non-empty and every item dismisses — so a `keepVisible: true` toast in a sequence forces the popup open, explicit author intent).
- **JS `toast` coexists with effects.** `openclip.toast(msg, style?, opts?)` with `opts = { keepVisible: true }`; a toast plus effects resolves to `.sequence([.toast(feedback)] + effects)` in call order (toast first). Configuration still wins over everything.
- **AppleScript has no toast channel** — its returned string maps to `.paste` (empty stays `.success`); errors map to `.toast` via the shared error path.
- **Implicit returns paste.** JS function string return and AppleScript returned string → `.paste`. Shell plain-text stdout already pastes (unchanged). Shell JSON `{"type":"copy"}` stays an explicit copy (unchanged). `CustomAction.swift:105` (`replaceSelection ? .paste : .copy`) is **not** changed — it is driven by the explicit `replaceSelection` flag.
- **No `switch action.id` string-matching** in new code.
- **Tests**: flat target `OpenClipTests`; test classes touching app singletons call `TestIsolation.reset()` in `setUp()`; store-backed tests use `MemorySettingsStore`. Run with `./scripts/test.sh` or `./scripts/test.sh <ClassName>` (new `.swift` files auto-regenerate via XcodeGen in the scripts).
- **Docs**: keep `docs/developer-guide/AGENTS.md` (authoritative spec), `docs/runtimes/*`, `web/src/docs/content/runtimes.tsx`, and `docs/architecture/known-debt.md` in step. No deprecation notes (see first constraint).

---

### Task 1: Core — `StatusFeedback.keepVisible`

**Files:**
- Modify: `Sources/Core/Actions/StatusFeedback.swift`
- Test: `Tests/OpenClipTests/StatusFeedbackTests.swift`

**Interfaces:**
- Consumes: existing `StatusFeedback` (`message`, `style`, `symbolName`, `isLoading`, `init(error:)`).
- Produces: `StatusFeedback.keepVisible: Bool` (default `false`), an init parameter, and `init(error:)` keeping the default.

- [ ] **Step 1: Add the field and init parameter**

In `Sources/Core/Actions/StatusFeedback.swift`:
- Add `public var keepVisible: Bool` and `public init(message:style:symbolName:isLoading:keepVisible:)` with `keepVisible: Bool = false` as the trailing parameter (all existing call sites keep compiling).
- `init(error:)` needs no change (defaults apply).
- Update the header doc comment: the type is now the single toast surface; `keepVisible: true` keeps the popup open and stops auto-dismiss (defaults to dismissing).

- [ ] **Step 2: Tests**

Add to `Tests/OpenClipTests/StatusFeedbackTests.swift`:
```swift
func testKeepVisibleDefaultsToFalse() {
    XCTAssertFalse(StatusFeedback(message: "Copied", style: .success).keepVisible)
    XCTAssertFalse(StatusFeedback(error: NSError(domain: "t", code: 1)).keepVisible)
}
func testKeepVisibleRoundTrips() {
    XCTAssertTrue(StatusFeedback(message: "Stick", style: .info, keepVisible: true).keepVisible)
}
```
Also keep an equality assertion: `StatusFeedback(...)` with different `keepVisible` values are not `==`.

- [ ] **Step 3: Verify**

```bash
./scripts/test.sh StatusFeedbackTests
```

---

### Task 2: Atomic `.showStatus` → `.toast` rename (all files, no behavior change)

**Files:**
- Modify: `Sources/Core/Actions/ActionResult.swift`
- Modify: `Sources/Core/Actions/ActionDelivery.swift`
- Modify: `Sources/Core/Extensions/ShellProcessRunner.swift`
- Modify: `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift`
- Modify: `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift`
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Modify: `Sources/OpenClip/UI/Popup/PopupView.swift`
- Modify: `Sources/OpenClip/UI/Popup/PopupSearchView.swift`
- Modify: `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift`
- Test: `Tests/OpenClipTests/ActionResultDismissPolicyTests.swift`, `Tests/OpenClipTests/ActionResultDeliveryTests.swift`, `Tests/OpenClipTests/OpenClipJSHostTests.swift`, `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift`

**Interfaces:** None — pure mechanical rename. `ActionResult.showStatus` → `ActionResult.toast` everywhere, plus the sibling symbol renames (`Collected.status` → `Collected.toast`, `showStatusBlock` → `toastBlock`, `mapStatusStyle` → `mapToastStyle`, `presentStatus` → `presentToast`). **Behavior is identical after this task**: `.toast` still keeps the popup open (`dismissesPopup` is NOT flipped here), JS resolution still lets an effect fall through over a status, the JS-facing bridge key and the shell/manifest `status` string keys are unchanged, and function returns still produce `.copy`. The dismissal flip, `containsToast`, the JS bridge `toast` key, `keepVisible` plumbing, return→paste, and suppression all land in later tasks.

- [ ] **Step 1: Rename the case + sibling symbols**

In `Sources/Core/Actions/ActionResult.swift`:
- `:40` `case showStatus(StatusFeedback)` → `case toast(StatusFeedback)`. Keep the existing doc comment meaning for now (the dismissal wording is rewritten in Task 3).
- `:66` `case .showStatus:` → `case .toast:` (still `return false` here — the flip is Task 3).

In `Sources/Core/Actions/ActionDelivery.swift:49`:
```swift
case (.toast(let x), .toast(let y)):
    return x == y
```

In `Sources/Core/Extensions/ShellProcessRunner.swift:189`: `return .showStatus(...)` → `return .toast(...)` (the `case "status"` JSON string key is unchanged here; Task 4 renames it).

In `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift:199`: `return .showStatus(...)` → `return .toast(...)` (the `case "status"` string key is unchanged here; Task 7 renames it).

In `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift`:
- `:74` `public var status: StatusFeedback?` → `public var toast: StatusFeedback?` (and the `Collected` doc comment).
- `:244-246` `showStatusBlock` → `toastBlock` — keep the same `@convention(block) (String, String?) -> Void` signature and set `collected.value.toast = ...` (the 3-arg options form lands in Task 5). Registration at `:259` keeps `"showStatus"` as the JS key for now.
- `:587` and `:597` `.showStatus(...)` → `.toast(...)`.
- `:710` `mapStatusStyle` → `mapToastStyle` (doc comment: "Maps a JS `toast` style string…").

In `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift:178`: `case .showStatus, .openConfiguration, .sequence:` → `case .toast, .openConfiguration, .sequence:` (and any nearby doc comment at `:247`).

- [ ] **Step 2: Presenter rename**

In `Sources/OpenClip/UI/Popup/PopupWindowController.swift`:
- `:612` `case .showStatus(let feedback): presentStatus(feedback)` → `case .toast(let feedback): presentToast(feedback)`.
- `:624` doc comment: `.showStatus(.error)` → `.toast(.error)`.
- `:642`, `:728`, `:766`, `:795` `.showStatus(StatusFeedback(error: error))` → `.toast(...)`.
- `:771` and `:777` (`settleLoadingResult` doc + case) `.showStatus` → `.toast`.
- `:800-804` `presentStatus` → `presentToast` (same body; doc comment "the single status renderer" is refreshed in Task 8).

In `Sources/OpenClip/UI/Popup/PopupView.swift:670` and `Sources/OpenClip/UI/Popup/PopupSearchView.swift:344`: `onResult(.showStatus(StatusFeedback(error: error)))` → `.toast(...)`.

- [ ] **Step 3: Test renames (guards only — assertions unchanged)**

- `Tests/OpenClipTests/ActionResultDismissPolicyTests.swift:31-32,38,40`: `.showStatus(...)` → `.toast(...)` — the assertions `XCTAssertFalse(...dismissesPopup)` stay (behavior is unchanged until Task 3).
- `Tests/OpenClipTests/ActionResultDeliveryTests.swift:211,355,507` comments and `:366`, `:523` `.showStatus(...)` → `.toast(...)`; rename `testShowStatusRoutesToToast` (`:359`) → `testToastRoutesToToast` (body unchanged).
- `Tests/OpenClipTests/OpenClipJSHostTests.swift`: all `guard case .showStatus` → `guard case .toast` (`:183,192,312,360-362,378,430,868,880`), failure messages "Expected .showStatus" → "Expected .toast". The JS *scripts* stay `openclip.showStatus(...)` for now (bridge key unchanged) — only the Swift pattern-matches and messages change. `:374` comment `showStatus` → `toast`.
- `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift:315-316`: `guard case .showStatus` → `guard case .toast`, message "Expected an error status" → "Expected an error toast".

- [ ] **Step 4: Verify — full suite green**

```bash
./scripts/test.sh
```

---

### Task 3: Core — dismissal policy flip + `containsToast`

**Files:**
- Modify: `Sources/Core/Actions/ActionResult.swift`
- Test: `Tests/OpenClipTests/ActionResultDismissPolicyTests.swift`

**Interfaces:**
- Consumes: `ActionResult.toast` (renamed in Task 2), `StatusFeedback.keepVisible` (Task 1).
- Produces: `dismissesPopup` = `!feedback.keepVisible` for `.toast`; new `ActionResult.containsToast: Bool` (recursive through `.sequence`).

- [ ] **Step 1: Flip dismissal + update docs**

In `Sources/Core/Actions/ActionResult.swift`:
- `dismissesPopup`:
```swift
public var dismissesPopup: Bool {
    switch self {
    case .toast(let feedback):
        return !feedback.keepVisible
    case .sequence(let items):
        return !items.isEmpty && items.allSatisfy(\.dismissesPopup)
    default:
        return true // includes openConfiguration: hide bar, then open Preferences
    }
}
```
- Update the `:39` case doc comment and the `:60-63` `dismissesPopup` doc comment: `.toast` surfaces a transient toast that **dismisses the popup by default** (`keepVisible` opts out); a `.sequence` dismisses only when non-empty and every item dismisses.

- [ ] **Step 2: Add `containsToast`**

In `Sources/Core/Actions/ActionResult.swift`:
```swift
/// True when this result (or any item of a `.sequence`) is a `.toast` — the presenter uses this
/// to suppress the delivery companion toast so a script toast wins (one toast per run).
public var containsToast: Bool {
    switch self {
    case .toast: return true
    case .sequence(let items): return items.contains(where: \.containsToast)
    default: return false
    }
}
```

- [ ] **Step 3: Update dismissal tests**

In `Tests/OpenClipTests/ActionResultDismissPolicyTests.swift`:
```swift
func testToastDismissesPopupByDefault() {
    XCTAssertTrue(ActionResult.toast(.init(message: "ok", style: .success)).dismissesPopup)
    XCTAssertTrue(ActionResult.toast(.init(message: "boom", style: .error)).dismissesPopup)
    XCTAssertFalse(ActionResult.toast(.init(message: "stick", style: .info, keepVisible: true)).dismissesPopup)
}
```
Replace the decision-9 MARK comment (`.showStatus(.error)` → `.toast(.error)`; errors surface as a dismissing toast) and `testErrorStatusKeepsPopup` → `testErrorToastDismissesPopup` (`XCTAssertTrue(ActionResult.toast(status).dismissesPopup)`).
Add:
```swift
func testKeepVisibleToastInSequenceForcesPopupOpen() {
    let seq = ActionResult.sequence([.toast(.init(message: "working", style: .info, keepVisible: true)), .copy("x")])
    XCTAssertFalse(seq.dismissesPopup)
    let dismiss = ActionResult.sequence([.toast(.init(message: "done", style: .success)), .copy("x")])
    XCTAssertTrue(dismiss.dismissesPopup)
}
func testContainsToast() {
    XCTAssertTrue(ActionResult.toast(.init(message: "t", style: .info)).containsToast)
    XCTAssertTrue(ActionResult.sequence([.copy("x"), .toast(.init(message: "t", style: .info))]).containsToast)
    XCTAssertFalse(ActionResult.copy("x").containsToast)
    XCTAssertFalse(ActionResult.sequence([.copy("x"), .paste("y")]).containsToast)
}
```

- [ ] **Step 4: Verify**

```bash
./scripts/test.sh ActionResultDismissPolicyTests
```

---

### Task 4: Shell JSON protocol — `status` → `toast` + `keepVisible`

**Files:**
- Modify: `Sources/Core/Extensions/ShellProcessRunner.swift`
- Test: `Tests/OpenClipTests/ScriptActionExecutionTests.swift`

**Interfaces:**
- Consumes: `ScriptJSONOutput` DTO, `ShellResultMapper`, `StatusFeedback.keepVisible`.
- Produces: mapper key `"toast"` → `.toast(StatusFeedback(message:style:keepVisible:))`; `ScriptJSONOutput.keepVisible: Bool?`.

- [ ] **Step 1: Extend the DTO**

In `Sources/Core/Extensions/ShellProcessRunner.swift:93-110`, add `let keepVisible: Bool?` to `ScriptJSONOutput`.

- [ ] **Step 2: Rename the mapper key + map keepVisible**

In `Sources/Core/Extensions/ShellProcessRunner.swift:182-189`:
```swift
case "toast":
    let style: StatusFeedback.Style
    switch output.style?.lowercased() {
    case "success": style = .success
    case "error": style = .error
    default: style = .info
    }
    return .toast(StatusFeedback(message: output.message ?? "", style: style, keepVisible: output.keepVisible ?? false))
```
The old `case "status"` is deleted (no alias — unknown types fall through to `.success` per the existing default).

- [ ] **Step 3: Tests**

In `Tests/OpenClipTests/ScriptActionExecutionTests.swift`, extend `testShellResultMapperParsesExpandedJSONProtocol` (ends `:321`):
```swift
let toastRes = ShellResultMapper.actionResult(from: "{\"type\":\"toast\",\"message\":\"Saved\",\"style\":\"success\",\"keepVisible\":true}", actionID: "a")
guard case .toast(let fb) = toastRes else { return XCTFail("Expected .toast") }
XCTAssertEqual(fb.message, "Saved")
XCTAssertEqual(fb.style, .success)
XCTAssertTrue(fb.keepVisible)
```
Also assert the plain form (no `keepVisible`) defaults to `false`, and that `{"type":"status",...}` now maps to `.success` (removed type falls through).

- [ ] **Step 4: Verify**

```bash
./scripts/test.sh ScriptActionExecutionTests
```

---

### Task 5: JS host — bridge `toast` key + options, coexistence with effects, return→paste

**Files:**
- Modify: `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift`
- Test: `Tests/OpenClipTests/OpenClipJSHostTests.swift`, `Tests/OpenClipTests/ActionOptionStoreTests.swift`, `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift` (JS parts only)

**Interfaces:**
- Consumes: `Collected.toast`, `toastBlock`, `mapToastStyle` (renamed in Task 2), `makeActionResult`.
- Produces: `toastBlock: (String, String?, JSValue?) -> Void` registered as `"toast"`; resolution order **exception → `.toast(error)`; configuration → `.openConfiguration`; toast+effects → `.sequence([.toast] + effects)`; toast only → `.toast`; effects → single/sequence; return → `.paste`; else `.success`**.

- [ ] **Step 1: Extend the bridge block + registration key**

In `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift:244-246`:
```swift
let toastBlock: @convention(block) (String, String?, JSValue?) -> Void = { message, style, options in
    let keepVisible: Bool
    if let options, !options.isUndefined, !options.isNull {
        keepVisible = options.objectForKeyedSubscript("keepVisible")?.toBool() ?? false
    } else {
        keepVisible = false
    }
    collected.value.toast = StatusFeedback(message: message, style: Self.mapToastStyle(style ?? "info"), keepVisible: keepVisible)
}
```
Registration at `:259` → `openclip.setObject(toastBlock, forKeyedSubscript: "toast" as NSString)`.

- [ ] **Step 2: Rewrite `makeActionResult` resolution**

`OpenClipJSHost.swift:582-609`:
```swift
private static func makeActionResult(_ evaluation: EvaluationResult, request: Request) -> ActionResult {
    let collected = evaluation.collected

    // JS exceptions win over any partially-collected effects (do NOT throw for JS exceptions).
    if let exceptionMessage = evaluation.exceptionMessage {
        return .toast(StatusFeedback(message: exceptionMessage, style: .error))
    }

    // Deterministic resolution order: configuration > toast (coexisting with effects) > effects
    // (in call order, sequence when >1) > function string return (pastes) > success.
    let effects = evaluation.effects
    let raw: ActionResult
    if let configuration = collected.configuration {
        raw = .openConfiguration(configuration)
    } else if let toast = collected.toast {
        if effects.isEmpty {
            raw = .toast(toast)
        } else {
            let input = request.context.match?.matchedText ?? request.context.selection.text
            let mapped = effects.map { effectResult($0, input: input) }
            raw = mapped.count == 1 ? .sequence([.toast(toast), mapped[0]]) : .sequence([.toast(toast)] + mapped)
        }
    } else if !effects.isEmpty {
        let input = request.context.match?.matchedText ?? request.context.selection.text
        let mapped = effects.map { effectResult($0, input: input) }
        raw = mapped.count == 1 ? mapped[0] : .sequence(mapped)
    } else if let returnValue = evaluation.asyncReturnValue ?? collected.returnValue {
        raw = .paste(returnValue)
    } else {
        raw = .success
    }

    return raw
}
```

- [ ] **Step 3: Update `OpenClipJSHostTests`**

Bridge-key + behavior changes (guards were already renamed in Task 2):
- `testStatusOnlySurfacesStatusButStatusWithEffectFallsThrough` (`:359-372`) → **`testToastCoexistsWithEffects`**: `openclip.toast('Done', 'success')` alone → `.toast` (message `Done`, style `.success`); `openclip.toast('nope', 'error'); openclip.copy('c');` → `.sequence` with `items[0]` == `.toast` (message `nope`, style `.error`) and `items[1]` == `.copy("c")`.
- `testShowStatusDefaultsToInfoWhenStyleOmitted` (`:374-383`) → `testToastDefaultsToInfoWhenStyleOmitted` (`openclip.toast('Done')` → `.toast`, style `.info`).
- Add `testToastKeepVisibleOption`:
```swift
let result = try await host.run(makeRequest(script: "openclip.toast('Keep', 'info', { keepVisible: true });"))
guard case .toast(let feedback) = result else { return XCTFail("Expected .toast, got \(result)") }
XCTAssertTrue(feedback.keepVisible)
```
- Return-string tests expecting `.copy` → `.paste`: `:132/:147/:159/:174` (console shim tests), `:220`, `:229-236` (isSecondaryClick branch — both primary and secondary now produce `.paste` raw), `:254`, `:266`, `:296` (testFunctionStringReturnBecomesCopy → `testFunctionStringReturnBecomesPaste`), `:304` (testFunctionStringReturnProducesRawCopyResult → `...PasteResult`), `:401`, `:412`, `:461`, `:486`, `:532`, `:557`, `:580`, `:605`, `:634` (fetch/async return tests), `:764`, `:804/:814/:824/:842/:858` (module tests), `:894`, `:917`.
- `testPromiseRejectionSurfacesErrorStatus` (`:427-435`) → `testPromiseRejectionSurfacesErrorToast` (guard `.toast`, style `.error`).
- `testAsyncTopLevelSideEffectsWithoutEntryPointSucceed` (`:418-425`) stays `.copy` — explicit `openclip.copy('side')` effect.
- `testMultipleEffectsSequenceInCallOrder` (`:347-357`) unchanged.
- JS strings that previously called `openclip.showStatus(...)` now call `openclip.toast(...)` (the bridge key changed).

- [ ] **Step 4: Related JS-return tests elsewhere**

- `Tests/OpenClipTests/ActionOptionStoreTests.swift:56,74` — `JavaScriptAction` `return` strings (`"CUSTOM: HELLO"`, `"DEFAULT: HELLO"`) → `.copy` becomes `.paste`; failure messages "Expected .copy result" → "Expected .paste result".
- `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift:200-203,211-214` — default/custom JS action results → `.paste` (messages "Expected .copy result for JS action" → "Expected .paste result…"). **Do not touch the AppleScript block `:219-225` or the shell block `:227-233` in this task** (AppleScript is Task 6; shell already pastes).

- [ ] **Step 5: Verify**

```bash
./scripts/test.sh OpenClipJSHostTests && ./scripts/test.sh ActionOptionStoreTests && ./scripts/test.sh GoldenExtensionPlatformTests
```

---

### Task 6: AppleScript return → paste

**Files:**
- Modify: `Sources/OpenClip/Platform/Runtimes/AppleScriptAction.swift`
- Test: `Tests/OpenClipTests/ScriptActionExecutionTests.swift`, `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift` (AppleScript block)

**Interfaces:**
- Consumes: `AppleScriptAction.perform`'s `output.isEmpty ? .success : .copy(output)`.
- Produces: `output.isEmpty ? .success : .paste(output)`.

- [ ] **Step 1: Change the mapping**

`AppleScriptAction.swift:124` → `return output.isEmpty ? .success : .paste(output)` (update the surrounding doc comment: returned text is pasted on a primary click; a secondary click derives copy via delivery).

- [ ] **Step 2: Tests**

- `Tests/OpenClipTests/ScriptActionExecutionTests.swift` AppleScript tests `:242-245`, `:261-264`, `:281-284` — `.copy` → `.paste`, messages "Expected .copy result…" → "Expected .paste result…".
- `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift:219-225` — AppleScript result → `.paste`, "Expected .copy result for AppleScript action" → "Expected .paste result…".

- [ ] **Step 3: Verify**

```bash
./scripts/test.sh ScriptActionExecutionTests && ./scripts/test.sh GoldenExtensionPlatformTests
```

---

### Task 7: Manifest secondary type `status` → `toast` (factory + validator + comment)

**Files:**
- Modify: `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift`
- Modify: `Sources/Core/Extensions/Manifest/ExtensionManifest.swift`
- Modify: `scripts/validate_extension.sh`
- Test: `Tests/OpenClipTests/ManifestValidationTests.swift`, `Tests/OpenClipTests/DefaultActionFactoryTests.swift`

**Interfaces:**
- Consumes: manifest secondary `type: "status"` mapping (factory, Swift construction already renamed in Task 2), validator whitelist.
- Produces: secondary `type: "toast"` → `.toast(StatusFeedback(message:style:.info))`; validator whitelist `"toast"`; manifest comment updated.

- [ ] **Step 1: Factory mapping**

`DefaultActionFactory.swift:198-199`:
```swift
case "toast":
    return .toast(StatusFeedback(message: secondary.message ?? "", style: .info))
```

- [ ] **Step 2: Manifest comment**

`ExtensionManifest.swift:185` → `// "copy" | "paste" | "openURL" | "toast" | "success" | "none"` (and the `message` comment stays "for toast").

- [ ] **Step 3: Validator whitelist**

`scripts/validate_extension.sh:59` → `def secondary_types: ["copy","paste","openURL","toast","success","none"];`. Check any error-message text nearby (lines 85-87) references `status` and update to `toast`.

- [ ] **Step 4: Tests**

- `ManifestValidationTests.swift:164` `"secondary": { "type": "status" }` → `"type": "toast"` (this test only asserts the JS-secondary rejection; the type value is incidental but must stay in-whitelist).
- In `DefaultActionFactoryTests.swift` delivery section (near `:337-364`), add a test that a manifest secondary `{ "type": "toast", "message": "Heads up" }` yields `ActionDelivery.secondary` == `.toast(StatusFeedback(message: "Heads up", style: .info))`. Follow the existing factory-test pattern used for the `copy`/`paste` secondary tests.

- [ ] **Step 5: Verify**

```bash
./scripts/test.sh ManifestValidationTests && ./scripts/test.sh DefaultActionFactoryTests
```

---

### Task 8: Presenter wiring — precedence suppression + keep-visible toast

**Files:**
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Modify: `Sources/OpenClip/UI/Popup/ToastPanelController.swift`
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift`, `Tests/OpenClipTests/ToastPanelControllerTests.swift`

**Interfaces:**
- Consumes: `ActionResult.toast`, `StatusFeedback.keepVisible`, `ActionResult.containsToast`.
- Produces: `handleActionResult`/`handleEffect`/`resolveDelivery`/`settleLoadingResult` gain a `suppressDeliveryToast` flag (true when the top-level result contains a toast); `ToastPanelController.show` skips auto-dismiss for `keepVisible` toasts; `presentToast` is the single toast renderer.

- [ ] **Step 1: `ToastPanelController` keep-visible**

`ToastPanelController.swift:47-68`: in `show(_:)`, auto-dismiss only when `!feedback.isLoading && !feedback.keepVisible`. Update the doc comments (`show`, `showLoading`, `swapTo`): info/error toasts auto-dismiss unless `keepVisible`; loading and keep-visible toasts have no timer and are cleared via `swapTo`/`hide`.
Test in `ToastPanelControllerTests.swift` (mirror `testLoadingToastHasNoTimer`):
```swift
func testKeepVisibleToastHasNoTimer() async throws {
    let controller = ToastPanelController(autoDismissNanoseconds: 20_000_000)
    controller.show(StatusFeedback(message: "Stick", style: .info, keepVisible: true))
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertTrue(controller.isShowing, "keep-visible toast must not auto-dismiss")
    controller.hide()
}
```

- [ ] **Step 2: Thread the precedence suppression**

- `handleActionResult` (`PopupWindowController.swift:610-621`):
```swift
func handleActionResult(_ result: ActionResult, delivery: DeliveryContext? = nil, suppressDeliveryToast: Bool = false) {
    switch result {
    case .toast(let feedback):
        presentToast(feedback)
    case .openConfiguration(let request):
        presentConfiguration(for: request)
    case .sequence(let items):
        for item in items { handleActionResult(item, delivery: delivery, suppressDeliveryToast: suppressDeliveryToast) }
    default:
        handleEffect(result, delivery: delivery, suppressDeliveryToast: suppressDeliveryToast)
    }
}
```
- `deliverResult` (`:597-604`): `handleActionResult(result, delivery: delivery, suppressDeliveryToast: result.containsToast)`.
- `runAction` success path (`:719-730`): after `let result = try await action.perform(performContext)`, `self.handleActionResult(result, delivery: delivery, suppressDeliveryToast: result.containsToast)`.
- `handleEffect` (`:632-645`): add `suppressDeliveryToast: Bool = false` param, pass to `resolveDelivery`, and:
```swift
if let toast = resolved.toast, !suppressDeliveryToast {
    toastController.show(toast, anchorPoint: panel?.centerPoint)
}
```
- `resolveDelivery` (`:655-683`): add `suppressDeliveryToast: Bool = false`; after `ActionResultDelivery.resolve(...)`, `return (resolved.result, suppressDeliveryToast ? nil : resolved.toast)`.
- `runLoadingAction` → `settleLoadingResult` (`:760-798`): add `suppressDeliveryToast: Bool = false` to `settleLoadingResult`; the `.sequence` recursion forwards it; the `default` branch passes it to `resolveDelivery`, and:
```swift
if let toast = resolved.toast, !suppressDeliveryToast {
    toastController.swapTo(toast)
} else if !suppressDeliveryToast {
    toastController.hide()
}
```
  (when suppressed, leave whatever toast is showing — the script toast item in the tree presents itself). Callers pass `suppressDeliveryToast: result.containsToast` at `:763` and `:766`/`:795` (the error path passes `suppressDeliveryToast: false` — a lone error toast needs no suppression).

- [ ] **Step 3: Update `ActionResultDeliveryTests`**

- `:211` comment already renamed in Task 2 — refresh any stale `.showStatus`/non-dismissing wording (`:507`): the prior action's **dismissing** `.toast` result routes through `deliverResult` (the test's final assertion — `toast.currentFeedback == working` survives the completion paste — holds because the lone script toast presents and the cleared declaration fires no stale companion).
- `testToastRoutesToToast` (`:359-370`) — assert the toast shows and `lastAnchorPoint` is set (mirror the existing body).
- Add:
  - `testScriptToastWinsOverDeclaredToast`: set a declared `primaryToast` on the delivery snapshot, then `deliverResult(.toast(scriptToast))` — assert `toastController.currentFeedback == scriptToast` (not the declared one).
  - `testScriptToastSuppressesDefaultCopiedToast`: no declared toast, a paste-capable context, `deliverResult(.sequence([.toast(scriptToast), .copy("x")]))` — assert the shown toast is `scriptToast`, never the "Copied" default.

- [ ] **Step 4: Verify**

```bash
./scripts/test.sh ActionResultDeliveryTests && ./scripts/test.sh ToastPanelControllerTests
```

---

### Task 9: Docs + web + scaffold (no deprecation notes)

**Files:**
- Modify: `docs/developer-guide/AGENTS.md`
- Modify: `docs/runtimes/javascript.md`, `docs/runtimes/zsh-python.md`
- Modify: `docs/developer-guide/extensions-modules.md`, `docs/architecture/popup-window.md`, `docs/architecture/extensions.md`, `docs/architecture/known-debt.md`
- Modify: `web/src/docs/content/runtimes.tsx`
- Modify: `scripts/new_extension.sh`
- Modify: `Extensions/raw/Slugify.openclipext/src/openclip.d.ts` (installed scaffold copy — keep the shipped catalog extension's d.ts in step with the scaffold; regenerate via `./scripts/new_extension.sh` or hand-edit to match)

**Interfaces:** none (documents behavior Tasks 1-8 implemented). Present `toast` as the API — no "renamed from showStatus"/"deprecated" wording anywhere.

- [ ] **Step 1: Authoritative spec (`docs/developer-guide/AGENTS.md`)**

- `:105-110` manifest example — keep `toast`/`secondaryToast` (already correct); check `loading`/`loadingMessage` wording still reads.
- `:152`, `:593` — `.showStatus(.error)` → `.toast(.error)`.
- §5b delivery (`:388-458`) — add the **one-toast-per-run** precedence (script toast > declared per-click toast > default "Copied") and that a `.toast` script result suppresses the delivery companion; clarify the "Copied" default is delivery-side, not a script surface.
- `:504-514` (JS delivery + loading) — `:514` "never changes the result/dismissal semantics of `.showStatus`" → drop the `.showStatus` reference; state that script `toast` results and the delivery companion follow the precedence in §5b.
- §8 JS bridge (`:610-623`): `openclip.showStatus(message, style)` → `openclip.toast(message, style?, options?)` with `options = { keepVisible: boolean }`; rewrite the resolution-order bullets (`:615-617`) to **exception → `.toast(error)`; configuration → `.openConfiguration`; toast (+ coexisting effects) → `[toast, effects]`; effects → single/`sequence`; function string return → `.paste`; else `.success`**; `:622` "showStatus followed by an effect yields the effect, not the status" → a toast followed by an effect yields a sequence of both.
- §8 ActionResult table (`:642`) — `.showStatus(StatusFeedback)` row → `.toast(StatusFeedback)`, "transient toast; **dismisses by default**, `keepVisible: true` keeps the popup open".
- §8 dismissal (`:649`) — `.showStatus` keeps the popup → `.toast` dismisses by default; `.sequence` dismisses only when non-empty and all items dismiss (a `keepVisible` toast forces it open).
- `:652-653` companion-toast note — update to the precedence in §5b.
- §8a shell protocol — the `"status"` result type becomes `"toast"` with `message`/`style`/`keepVisible`.
- Anywhere else `.showStatus`/`.status` is documented, replace with `toast`/`.toast` (grep the whole file).

- [ ] **Step 2: Runtime + architecture docs**

- `docs/runtimes/javascript.md`: `:48` `showStatus(message, style)` → `toast(message, style?, options?)`; `:58`/`:110` `.showStatus(.error)` → `.toast(.error)`; `:154-166` rewrite the resolution list (exception → `.toast`; toast coexists with effects → sequence; function string return → paste — update the example heading and the "return value is copied" wording); `:101` delivery note now references the §5b precedence.
- `docs/runtimes/zsh-python.md`: `:61-66` protocol list — `"status"` → `"toast"` (add `keepVisible`).
- `docs/developer-guide/extensions-modules.md`: `:60` `.showStatus(.error)` → `.toast(.error)`.
- `docs/architecture/popup-window.md`: `:16/:76/:112-120` — status toast wording stays; update any dismissal notes (`:119` loading swap list gains the keep-visible rule); no deprecation notes.
- `docs/architecture/extensions.md`: `:103` capability table — `showStatus` → `toast` in the `openclip.*` effects list.
- `docs/architecture/known-debt.md`: update stale `showStatus`/status wording if any (`:107-108` toast queue note and `:156-158` delivery note) to the new dismissal/keep-visible/precedence model.

- [ ] **Step 3: Web + scaffold**

- `web/src/docs/content/runtimes.tsx`: `:85` bridge row `openclip.showStatus(msg, style?)` → `openclip.toast(msg, style?, opts?)` with the new signature; `:110` example `openclip.showStatus("City not found", "error")` → `openclip.toast("City not found", "error")`; `:244` shell JSON type list `"status"` → `"toast"` (add `"keepVisible"`).
- `scripts/new_extension.sh`: `:211` d.ts declaration →
  `toast(message: string, style?: 'success' | 'error' | 'info', options?: { keepVisible?: boolean }): void;`
- `Extensions/raw/Slugify.openclipext/src/openclip.d.ts`: `:48` same replacement (regenerate the scaffold or hand-edit to match).

- [ ] **Step 4: Verify docs consistency**

```bash
rg -n "showStatus|showStatusBlock|mapStatusStyle|\.status\b|case \"status\"" Sources/ Tests/ scripts/ web/src/docs/content/runtimes.tsx docs/
```
The only acceptable hits are intentional (e.g. `status` as the fetch `r.status` example in `javascript.md:124` / `runtimes.tsx` fetch snippet, `status: number;` in the d.ts `__resolveModule` response type, `Constants.actionType*` string constants, and `output.statusCode`-style HTTP fields). No `showStatus` should remain in Swift, docs, or the scaffold.

---

## Self-Review

**Spec coverage:**
- `StatusFeedback.keepVisible` field + init default → Task 1. ✓
- `.showStatus` → `.toast` everywhere (Core, presenter, handler) → Task 2 (atomic rename), Task 8 (`.toast` sites already renamed; error paths uniform). ✓
- Uniform dismissal including errors → Task 3 (`.toast` default dismisses), Tasks 2/8 (error sites become `.toast`). ✓
- Script toast wins over declared toast and default "Copied" (one toast per run) → Task 8 suppression (`containsToast` + `suppressDeliveryToast`), Task 3 (`containsToast`), Task 9 docs. ✓
- JS `openclip.toast(msg, style?, opts?)` + `{keepVisible}` → Task 5. ✓
- JS toast coexists with effects (`.sequence([.toast, …])`) → Task 5. ✓
- Shell `{"type":"toast",…,"keepVisible":…}` replaces `status` → Task 4. ✓
- Manifest secondary type `status` → `toast` → Task 7. ✓
- Implicit returns map to `.paste`: JS function string + AppleScript; shell plain-text already pastes; shell JSON `copy` and `CustomAction.replaceSelection` unchanged → Tasks 5, 6 (+ constraint). ✓
- AppleScript no toast channel; errors → `.toast` via shared paths → Tasks 6, 8. ✓
- keep-visible toasts: no auto-dismiss + force popup open inside a sequence → Tasks 1, 3, 8. ✓
- Docs/scaffold/web updated with no deprecation notes → Task 9. ✓

**Execution-order fix (why the plan differs from the original task split):** the enum-case rename is compile-atomic — Core, app, and tests must be renamed together (Task 2) or the build stays red. Behavior then layers on in green tasks: dismissal flip (Task 3), shell protocol (Task 4), JS bridge/resolution/return→paste (Task 5), AppleScript return→paste (Task 6), manifest secondary type (Task 7), presenter precedence suppression + keep-visible toast (Task 8), docs (Task 9). Each task's verify step compiles and passes before the next starts.

**Placeholder scan:** All tasks include concrete code, file paths, and test commands. No TBD/TODO placeholders.

**Type consistency:** `StatusFeedback.keepVisible` (Tasks 1,4,5,8), `ActionResult.toast` (Tasks 2-8), `ActionResult.containsToast` (Tasks 3,8), `suppressDeliveryToast` (Task 8), `Collected.toast`/`toastBlock`/`mapToastStyle` (Tasks 2,5), `ScriptJSONOutput.keepVisible` (Task 4), `presentToast` (Tasks 2,8). `ActionResultDelivery.resolve` is untouched (its signature is unchanged; suppression happens above it in the presenter). No task references `showStatus`/`mapStatusStyle`/`.showStatus` except as names being removed.
