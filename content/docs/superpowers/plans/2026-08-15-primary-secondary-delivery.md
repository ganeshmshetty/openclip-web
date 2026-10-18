# Primary/Secondary Result Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generalize OpenClip's paste-vs-copy delivery from a single hardcoded rule into a per-action declarable **primary/secondary** result pair (left-click = primary, right/shift-click = secondary), with a per-result declarable companion toast — uniform across extension manifest actions and builtin actions.

**Architecture:** Rename the click-intent vocabulary (`forceCopy` → the trigger flag `isSecondaryClick`; `ClickIntent.leftClick` → `.primary`, `ClickIntent.forceCopy` → `.secondary`) and move delivery resolution into a pure Core function that, given the action's raw primary result, its optional declared secondary result, the click intent, and paste availability, returns the leaf result plus an optional companion toast. The App layer (PopupWindowController) captures the action's delivery config alongside the existing click-intent snapshot and renders the returned toast through the existing `ToastPanelController`.

**Two channels for the secondary, scoped by action kind (no split-brain):**
- **JS actions** author the secondary *imperatively*: the script branches on a new `openclip.input.isSecondaryClick` flag and emits an explicit `openclip.paste(...)` / `openclip.copy(...)` effect (primary = the non-branching effect path). The manifest `secondary` key is **rejected on `javascript`** (validator), so there is only one source of truth for JS.
- **Non-scripting kinds** (`url`, `textsnippet`, `shell`, `applescript`, `shortcut`) author the secondary *declaratively* via the manifest `secondary` key (a static result), because they have no script to branch.
- **Toasts** are declarative on **all** kinds via `toast` / `secondaryToast`.

Builtins conform via a new `Action.delivery` protocol property (declared outcomes) plus the `context.isSecondaryClick` trigger flag (code branches). The probe (paste availability) always applies to whichever result is chosen. The legacy `after` behavior (`ActionAfterBehavior`/`ActionResultAdapter`) is **fully removed** — copy/paste/none forcing is expressed via declared secondary results (static kinds), JS branches (JS), or the derived paste→copy default.

**Tech Stack:** Swift 6 (SWIFT_STRICT_CONCURRENCY complete), AppKit + SwiftUI, XcodeGen (`project.yml`), XCTest (flat `Tests/OpenClipTests/` target), jq-based manifest validator.

## Global Constraints

- **Core stays pure** — no AppKit/SwiftUI imports in `Sources/Core/`. All new delivery/toast logic and the `ActionDelivery` type live in Core; toast *rendering* stays in App (`ToastPanelController`).
- **`ActionResult` is not Equatable** — tests must keep using the existing `assertCase` pattern-matching helper (`Tests/OpenClipTests/ActionResultDeliveryTests.swift:14`), or new equality helpers for composed types.
- **No `switch action.id` string-matching** — builtins are configured via the new `Action.delivery` protocol property / `context.secondary`, never by id.
- **`after` is fully removed** — `ActionAfterBehavior`, `ActionResultAdapter`, `ExtensionActionMetadata.after`, `ExtensionActionRules.after`, and all call sites/tests are deleted. Copy/paste/none forcing is expressed declaratively (declared `secondary` results on static kinds, JS `isSecondaryClick` branches, or derived paste→copy). No shipped manifest uses `after`, so removal is zero-migration. Do not reference `after` in any new signature (the `resolve` signature in Task 3 has no `after` param).
- **Probe always applies** — a `.paste` result downgrades to `.copy` when the target can't paste, on either click, declared or not. The *declared secondary* only replaces the click-intent half (the paste→copy default), never the probe.
- **Secondary is authored one way per kind, never both (no split-brain).** `javascript` actions branch on `openclip.input.isSecondaryClick` (imperative); the manifest `secondary` key is validator-rejected on `javascript`. Static kinds (`url`/`textsnippet`/`shell`/`applescript`/`shortcut`) declare `secondary` in the manifest. Toasts (`toast`/`secondaryToast`) are declarative on all kinds.
- **Rename scope**: `forceCopy` → the trigger flag `ActionContext.isSecondaryClick`; `ClickIntent.leftClick` → `.primary`, `ClickIntent.forceCopy` → `.secondary`. `secondary` is reserved for *outcomes* (`ClickIntent.secondary`, `ActionDelivery.secondary`, manifest `secondary`); the *trigger flag* is `isSecondaryClick` (verb+noun, reads as "was this a secondary click?"). Rename is behavioral-mechanical (no logic change).
- **Toast reuses `StatusFeedback` + `ToastPanelController`** — do NOT add a new result case and do NOT use `.showStatus` for the companion toast (`.showStatus` keeps the popup open; the "Copied" toast accompanies a *dismissing* result).
- **Tests**: flat target `OpenClipTests`; test classes touching app singletons call `TestIsolation.reset()` in `setUp()`. Run with `./scripts/test.sh`; after adding `.swift` files, `xcodegen generate` re-runs automatically via the scripts.
- **Docs**: keep `docs/developer-guide/AGENTS.md` (authoritative spec) and `docs/architecture/known-debt.md` in step.

---

### Task 1: Rename `forceCopy` → `isSecondaryClick` / `ClickIntent` cases

**Files:**
- Modify: `Sources/Core/Actions/ActionResultDelivery.swift:18-22,36-41`
- Modify: `Sources/Core/Actions/ActionContext.swift:15,23,28`
- Modify: `Sources/Core/Actions/Builtin/DefineAction.swift:43`
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift:45,140,142,372,456,466,478,551,565,639,661,697-698`
- Modify: `Sources/OpenClip/UI/Popup/PopupView.swift:651`
- Modify: `Sources/OpenClip/UI/Popup/PopupSearchView.swift:332`
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift` (references `.forceCopy`/`.leftClick`/`forceCopy`)

**Interfaces:**
- Consumes: existing `ActionResultDelivery.ClickIntent` (`leftClick`, `forceCopy`), `ActionContext.forceCopy: Bool`.
- Produces: `ClickIntent.primary`, `ClickIntent.secondary`; `ActionContext.isSecondaryClick: Bool`. These new names are the vocabulary all later tasks use.

- [ ] **Step 1: Rename `ClickIntent` cases**

Edit `Sources/Core/Actions/ActionResultDelivery.swift`:
- `case leftClick` → `case primary`
- `case forceCopy` → `case secondary`
- Update the doc comment on the enum and on `secondary`'s case ("Right-click or a ⇧-modifier click maps to `.secondary`"). Keep `secondary` here — it denotes the *outcome* requested by the click.
- Update `resolve`: `let forceCopy = (clickIntent == .secondary) || !canPaste` → rename the local to `deliverAsCopy`:
```swift
let deliverAsCopy = (clickIntent == .secondary) || !canPaste
return deliverAsCopy ? .copy(text) : .paste(text)
```

- [ ] **Step 2: Rename `ActionContext.forceCopy` → `isSecondaryClick`**

Edit `Sources/Core/Actions/ActionContext.swift`: property `public let forceCopy: Bool` → `public let isSecondaryClick: Bool`; init param `forceCopy: Bool = false` → `isSecondaryClick: Bool = false`; `self.forceCopy = forceCopy` → `self.isSecondaryClick = isSecondaryClick`. Update the doc comment ("True when the action was triggered by a secondary click (right-click or ⇧-click)").

- [ ] **Step 3: Update the one code-branching builtin**

Edit `Sources/Core/Actions/Builtin/DefineAction.swift:43`: `if context.forceCopy {` → `if context.isSecondaryClick {`. Update its comment.

- [ ] **Step 4: Update App call sites**

In `PopupWindowController.swift` rename every `.forceCopy`/`.leftClick` to `.secondary`/`.primary` and `forceCopy` params/local names to `isSecondaryClick` where they denote the trigger flag:
- Line 45 `pendingClickIntent: ... = .leftClick` → `.primary`
- Line 140 `self.pendingClickIntent == .forceCopy` → `== .secondary`
- Line 142 `?? .leftClick` → `?? .primary`
- Line 372 `pendingClickIntent = .leftClick` → `.primary`
- Line 456 `isShift ? .forceCopy : .leftClick` → `isShift ? .secondary : .primary`
- Line 466 `pendingClickIntent = .forceCopy` → `.secondary`
- Line 478 `runAction(hoveredAction, with: actionContext, forceCopy: true)` → `isSecondaryClick: true`
- Line 639 `if delivery.clickIntent == .forceCopy` → `== .secondary`
- Lines 661, 697 `let clickIntent: ... = forceCopy ? .forceCopy : .leftClick` → `forceCopy ? .secondary : .primary` (rename param to `isSecondaryClick` if it is the trigger flag)
- Rename method params `forceCopy: Bool` on `runAction` (line 656) and `runLoadingAction` (line 696) to `isSecondaryClick: Bool` — **only** if the value represents the trigger flag (it does). Update all internal `forceCopy:` call sites to `isSecondaryClick:`.

In `PopupView.swift:651` and `PopupSearchView.swift:332`: `forceCopy: onClickIntent() == .forceCopy` → `isSecondaryClick: onClickIntent() == .secondary`.

- [ ] **Step 5: Update tests**

In `Tests/OpenClipTests/ActionResultDeliveryTests.swift` replace `.leftClick`→`.primary` and `.forceCopy`→`.secondary` everywhere, and update test names (`testForceCopyCopiesEvenWhenPasteAvailable`, `testForceCopyCopiesEvenWhenPasteAvailable`, the `// MARK: - Force-copy` section, `ForceCopyProbeAction`, `lastPerformContext?.forceCopy`, `runAction(..., forceCopy:)` calls) to the `isSecondaryClick`/`secondary` vocabulary.

- [ ] **Step 6: Run the full suite to verify the mechanical rename is green**

Run: `./scripts/test.sh`
Expected: ALL pass (no behavior change; pure rename).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(delivery): rename forceCopy to isSecondaryClick; ClickIntent primary/secondary"
```

---

### Task 2: Core `ActionDelivery` + declarative `Action.delivery`

**Files:**
- Create: `Sources/Core/Actions/ActionDelivery.swift`
- Modify: `Sources/Core/Actions/Action.swift:15-34` (add protocol requirement + default)
- Modify: `Sources/Core/Actions/ConfigurableAction.swift` (no change needed — inherits default)
- Test: `Tests/OpenClipTests/ActionDeliveryTests.swift`

**Interfaces:**
- Consumes: `ActionResult`, `StatusFeedback`, `Action` protocol.
- Produces:
```swift
public struct ActionDelivery: Sendable, Equatable {
    public var secondary: ActionResult?    // nil → derived (paste primary ⇒ copy)
    public var primaryToast: StatusFeedback?
    public var secondaryToast: StatusFeedback?
    public init(secondary: ActionResult? = nil,
                primaryToast: StatusFeedback? = nil,
                secondaryToast: StatusFeedback? = nil) {}
    public static var none: ActionDelivery { ActionDelivery() }
}
```
and `Action.delivery: ActionDelivery?` (default `nil`), so all conformers compile unchanged.

- [ ] **Step 1: Write the failing test**

`Tests/OpenClipTests/ActionDeliveryTests.swift`:
```swift
import XCTest
import Core

final class ActionDeliveryTests: XCTestCase {
    func testNoneIsEmpty() {
        XCTAssertEqual(ActionDelivery.none, ActionDelivery())
    }
    func testInitDefaults() {
        let d = ActionDelivery()
        XCTAssertNil(d.secondary)
        XCTAssertNil(d.primaryToast)
        XCTAssertNil(d.secondaryToast)
    }
    func testHoldsDeclaredValues() {
        let toast = StatusFeedback(message: "Copied", style: .success)
        let d = ActionDelivery(secondary: .copy("x"), primaryToast: toast, secondaryToast: nil)
        guard case .copy(let t)? = d.secondary else { return XCTFail("expected copy") }
        XCTAssertEqual(t, "x")
        XCTAssertEqual(d.primaryToast, toast)
    }
    /// Every conformer gets the nil default without declaring it.
    func testProtocolDefaultIsNil() {
        struct NoDelivery: Action {
            let id = "t"; let title = "t"; let icon = ActionIcon.symbol("t")
            var chrome: ActionChrome { ActionChrome(source: .builtin) }
            func isEnabled(for context: ActionContext) -> Bool { true }
            func matchInfo(for context: ActionContext) -> ActionMatchInfo? { nil }
            func perform(_ context: ActionContext) async throws -> ActionResult { .success }
        }
        XCTAssertNil(NoDelivery().delivery)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh ActionDeliveryTests`
Expected: FAIL — `ActionDelivery` not defined, `delivery` not a member.

- [ ] **Step 3: Implement `ActionDelivery` + protocol default**

Create `Sources/Core/Actions/ActionDelivery.swift` with the type above (import Foundation only).

In `Sources/Core/Actions/Action.swift` add to the `Action` protocol: `var delivery: ActionDelivery? { get }`, and in the default extension: `var delivery: ActionDelivery? { nil }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh ActionDeliveryTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Actions/ActionDelivery.swift Sources/Core/Actions/Action.swift Tests/OpenClipTests/ActionDeliveryTests.swift
git commit -m "feat(delivery): add ActionDelivery type and Action.delivery protocol hook"
```

---

### Task 3: Pure resolution — `ActionResultDelivery.resolve` returns `(result, toast)`

**Files:**
- Modify: `Sources/Core/Actions/ActionResultDelivery.swift`
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift`

**Interfaces:**
- Consumes: `ActionResult`, `ActionDelivery`, `ClickIntent`, `StatusFeedback` (all Core). Note: `after`/`ActionAfterBehavior` are **removed** (Task 9) — `resolve` has no `after` parameter. The `delivery.secondary` here is the *declared outcome* (static kinds + builtin `Action.delivery`); the JS imperative branch happens earlier, in the script (`openclip.input.isSecondaryClick`), so its chosen result simply arrives as `raw`.
- Produces:
```swift
public static func resolve(
    raw: ActionResult,                 // the action's primary (perform) result
    clickIntent: ClickIntent,
    canPaste: Bool,
    delivery: ActionDelivery           // declared secondary + toasts
) -> (result: ActionResult, toast: StatusFeedback?)
```
Decision algorithm:
1. **Select**: if `clickIntent == .secondary` and `delivery.secondary != nil` → `delivery.secondary!`; else `raw`. If secondary click and `delivery.secondary == nil` and `raw` is `.paste(text)` → derive `.copy(text)` (the legacy default). Otherwise (primary click, or secondary with non-paste primary) → `raw`.
2. **Apply probe**: if the result is `.paste(text)` and `!canPaste` → `.copy(text)`.
3. **Toast**: `delivery.primaryToast` for a primary click, `delivery.secondaryToast` for a secondary click; if nil, default to `StatusFeedback(message: "Copied", style: .success, symbolName: "checkmark")` when the *pre-probe* result was a paste context that delivered `.copy` (either derived or declared), or when the delivered result is `.copyDefinition`; else `nil`.

(There is no `after` step — the declarative primary/secondary results *are* the copy/paste forcing. This task does NOT touch `ActionAfterBehavior`; Task 9 removes it. For JS, the secondary is chosen in-script and arrives as `raw`; for static kinds/builtins it arrives via `delivery.secondary`.)

- [ ] **Step 1: Write the failing tests**

Append to `Tests/OpenClipTests/ActionResultDeliveryTests.swift` (uses existing `assertCase`). New cases, under new MARK sections:

```swift
// MARK: - Primary/secondary selection

func testPrimaryUsesRawResult() {
    let (r, _) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .primary, canPaste: true, delivery: .none)
    assertCase(r, .paste("a"))
}

func testSecondaryWithoutDeclaredSecondaryCopiesPaste() {
    let (r, _) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .secondary, canPaste: true, delivery: .none)
    assertCase(r, .copy("a"))
}

func testSecondaryWithNonPastePrimaryStaysPrimary() {
    let (r, _) = ActionResultDelivery.resolve(raw: .openURL(URL(string: "https://x")!), clickIntent: .secondary, canPaste: true, delivery: .none)
    assertCase(r, .openURL(URL(string: "https://x")!))
}

func testSecondaryUsesDeclaredSecondary() {
    let d = ActionDelivery(secondary: .openURL(URL(string: "https://alt")!))
    let (r, _) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .secondary, canPaste: true, delivery: d)
    assertCase(r, .openURL(URL(string: "https://alt")!))
}

// MARK: - Probe applies to whichever result is chosen

func testProbeAppliesToDeclaredPasteSecondary() {
    let d = ActionDelivery(secondary: .paste("a"))
    let (r, _) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .secondary, canPaste: false, delivery: d)
    assertCase(r, .copy("a"))   // declared paste still downgrades when target can't paste
}

func testProbeAppliesToPrimary() {
    let (r, _) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .primary, canPaste: false, delivery: .none)
    assertCase(r, .copy("a"))
}

// MARK: - Toast

func testDefaultCopiedToastOnDerivedCopy() {
    let (_, toast) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .secondary, canPaste: true, delivery: .none)
    XCTAssertEqual(toast?.message, "Copied")
    XCTAssertEqual(toast?.style, .success)
}

func testNoDefaultToastOnHonoredPaste() {
    let (_, toast) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .primary, canPaste: true, delivery: .none)
    XCTAssertNil(toast)
}

func testNoDefaultToastOnNativeCopy() {
    let (_, toast) = ActionResultDelivery.resolve(raw: .copy("a"), clickIntent: .primary, canPaste: true, delivery: .none)
    XCTAssertNil(toast)
}

func testDeclaredPrimaryToastOverridesDefault() {
    let t = StatusFeedback(message: "Saved", style: .info)
    let (_, toast) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .primary, canPaste: true, delivery: ActionDelivery(primaryToast: t))
    XCTAssertEqual(toast, t)
}

func testDeclaredSecondaryToastUsed() {
    let t = StatusFeedback(message: "Copied alt", style: .success)
    let (_, toast) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .secondary, canPaste: true, delivery: ActionDelivery(secondaryToast: t))
    XCTAssertEqual(toast, t)
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/test.sh ActionResultDeliveryTests`
Expected: FAIL — `resolve` signature mismatch / no such function.

- [ ] **Step 3: Implement the new `resolve`**

Replace `resolve` in `Sources/Core/Actions/ActionResultDelivery.swift` with the multi-return version. Keep the enum cases `primary`/`secondary` from Task 1. Return a tuple `(ActionResult, StatusFeedback?)`. Keep `ClickIntent` and the `guard case .paste` logic in a helper so probe application is a single choke point. (Do NOT reference `ActionResultAdapter` — it is removed in Task 9; there is no `after` step.)

- [ ] **Step 4: Update the existing single-return call sites so the tree compiles**

The `resolve` signature change breaks two live call sites that must be updated *in this task* (not deferred to Task 4) so `./scripts/test.sh` at Step 5 compiles:
- `Sources/OpenClip/UI/Popup/PopupWindowController.swift:644`: update to the tuple return + pass `delivery: .none` (minimal compile fix; the real delivery wiring is Task 4's `resolveDelivery`). Adjust the surrounding code so `.result` and `.toast` are handled — this is the interim plumbing until Task 4 replaces it.
- `Tests/OpenClipTests/PasteAvailabilityTests.swift:34`: destructure the tuple `let (result, _) = ...`.

Update any other test using the old single-return signature. Keep `resolveDelivery`'s external behavior identical for now (Task 4 reworks it).

- [ ] **Step 5: Run tests to verify they pass**

Run: `./scripts/test.sh ActionResultDeliveryTests`
Expected: PASS (new + updated).

- [ ] **Step 6: Commit**

```bash
git add Sources/Core/Actions/ActionResultDelivery.swift Tests/OpenClipTests/ActionResultDeliveryTests.swift
git commit -m "feat(delivery): resolve returns selected result + companion toast"
```

---

### Task 4: App wiring — snapshot action delivery, render returned toast

**Files:**
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift:549-649,696-754,119-142`
- Modify: `Sources/OpenClip/UI/Popup/PopupView.swift:643,655` (invoke `onWillPerformAction`)
- Modify: `Sources/OpenClip/UI/Popup/PopupSearchView.swift:323,336`
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift`

**Interfaces:**
- Consumes: `ActionDelivery` (Task 2), the new `ActionResultDelivery.resolve` tuple (Task 3).
- Produces: `DeliveryContext.delivery: ActionDelivery?` and a `pendingDelivery` snapshot; `PopupView`/`PopupSearchView` gain `onWillPerformAction: (@MainActor (any Action) -> Void)?` so the controller captures delivery before the SwiftUI perform path fires `onResult`.

- [ ] **Step 1: Add `delivery` to `DeliveryContext` + snapshot**

In `PopupWindowController.swift`:
- Add `private var pendingDelivery: ActionDelivery? = nil` near `pendingClickIntent` (line 45).
- Add to `struct DeliveryContext` (line 549): `let delivery: ActionDelivery?`.
- `deliverySnapshot()` (line 562): pass `delivery: pendingDelivery`.
- In `runAction` (656) and `runLoadingAction` (696): set `pendingDelivery = action.delivery` (before the perform Task), and add `delivery: action.delivery` to the `DeliveryContext(...)` they build.
- In the `onResult` closure (119): `self?.deliverResult(result)` — no change (delivery travels in the snapshot).
- Add a new closure param `onWillPerformAction: (@MainActor (any Action) -> Void)? = nil` and thread it into `PopupView`/`PopupSearchView`; in its controller closure set `self.pendingDelivery = action.delivery`.

- [ ] **Step 2: Render the returned toast**

In `handleEffect` (609) and `settleLoadingResult` (731), replace the manual paste→copy toast detection with the resolved tuple. `resolveDelivery` (630) returns the tuple; `handleEffect` shows `toast` if non-nil instead of the inline `isDowngradedToCopy`/`isCopyDefinition` logic; `settleLoadingResult` swaps to the returned toast (or hides when nil). Keep `.showStatus` and `.openConfiguration` handling unchanged.

- [ ] **Step 3: Write failing tests for the wiring**

Append to `Tests/OpenClipTests/ActionResultDeliveryTests.swift`:
- A stub `Action` with `delivery = ActionDelivery(secondary: .openURL(...), secondaryToast: ...)`; assert `runAction(stub, ..., secondary: true)` delivers the declared secondary (via `awaitDelivery`) and shows the declared toast.
- A stub with declared `primaryToast`; assert a primary perform shows it.
- Update existing `runAction`/`runLoadingAction` calls to the `secondary:` label (Task 1 rename).

- [ ] **Step 4: Run the test suite**

Run: `./scripts/test.sh`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/UI/Popup/PopupWindowController.swift Sources/OpenClip/UI/Popup/PopupView.swift Sources/OpenClip/UI/Popup/PopupSearchView.swift Tests/OpenClipTests/ActionResultDeliveryTests.swift
git commit -m "feat(delivery): wire action delivery snapshot + declarative toast into controller"
```

---

### Task 5: Manifest schema — `secondary`, `toast`, `secondaryToast`

**Files:**
- Modify: `Sources/Core/Extensions/Manifest/ExtensionManifest.swift`
- Modify: `Sources/Core/Extensions/Manifest/ActionRequirements.swift` (optional — no)
- Modify: `Sources/Core/Extensions/Manifest/ManifestValidation.swift` (add in-app JS-secondary rejection — see Step 5b)
- Modify: `scripts/validate_extension.sh`
- Test: `Tests/OpenClipTests/ExtensionManifestTests.swift`, `Tests/OpenClipTests/ManifestValidationTests.swift` (in-app validator)

**Interfaces:**
- Consumes: `ExtensionActionMetadata` decoding conventions (aliases, CodingKeys).
- Produces on `ExtensionActionMetadata`: `secondary: ExtensionSecondaryDeclaration?`, `toast: ExtensionToastDeclaration?`, `secondaryToast: ExtensionToastDeclaration?` with aliases `secondary`, `toast`, `secondary-toast`.
- **Scoping rule (Global Constraint):** `secondary` is only valid on non-scripting kinds (`url`, `textsnippet`, `shell`, `applescript`, `shortcut`). On `javascript` the validator **rejects** the package — JS authors branch on `openclip.input.isSecondaryClick` instead. `toast`/`secondaryToast` are valid on all kinds.
- Produces new Core codables:
```swift
public struct ExtensionSecondaryDeclaration: Codable, Sendable, Equatable {
    public let type: String      // "copy" | "paste" | "openURL" | "status" | "success" | "none"
    public let value: String?    // for copy/paste/openURL
    public let message: String?  // for status
}
public struct ExtensionToastDeclaration: Codable, Sendable, Equatable {
    public let message: String
    public let style: String?    // "success" | "error" | "info" (default success)
}
```

- [ ] **Step 1: Write the failing decode tests**

In `Tests/OpenClipTests/ExtensionManifestTests.swift` add tests decoding a manifest action with `secondary`, `toast`, `secondaryToast` (and dash aliases) and asserting the values decode. Add a decode assertion that `secondary` decodes **only** on non-`javascript` kinds.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh ExtensionManifestTests`
Expected: FAIL — fields don't decode (unknown keys are currently ignored, so also add a decode-assertion that the new fields are non-nil).

- [ ] **Step 3: Implement manifest fields**

Add the two codable structs to `ExtensionManifest.swift` (or a sibling file). Add to `ExtensionActionMetadata`: properties, `init` params, `init(from:)`, `encode`, and `CodingKeys` (`secondary`, `toast`, `secondaryToast = "secondaryToast"` + `secondaryToastDash = "secondary-toast"`). Decode `secondary` unconditionally (validator enforces the kind-scoping), so Core just carries it.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh ExtensionManifestTests`
Expected: PASS.

- [ ] **Step 5: Update `scripts/validate_extension.sh`**

Extend the jq validator so an action with a `secondary` object validates `secondary.type` is one of `["copy","paste","openURL","status","success","none"]`; reject unknown `secondary.type` at install time (exit 1). Reject unknown `toast.style` (`success|error|info`). **Reject `secondary` on `type == "javascript"`** with a clear message pointing at `openclip.input.isSecondaryClick` (exit 1).

- [ ] **Step 5b: Add the in-app `ManifestValidator` JS-secondary rejection**

The shell validator alone is bypassed for manifests installed while the app is running (`ExtensionManager` calls the Core `ManifestValidator`). Add the same rule in-app so the no-split-brain constraint holds on every install path:
- `Sources/Core/Extensions/Manifest/ManifestValidation.swift`: add a `ManifestValidationIssue.Kind` case (e.g. `secondaryOnJavaScriptAction`) with a `description` pointing at `openclip.input.isSecondaryClick`; in `validateAction`, when `action.type` is `javascript` (use `ExtensionActionKind.isRecognized`/the same kind resolution the file already uses — check how `action.kind` is derived) and `action.secondary != nil`, append the issue at the action's path.
- `Tests/OpenClipTests/ManifestValidationTests.swift` (or `ExtensionManifestTests.swift`): add tests — a JS action with `secondary` yields the issue; a non-JS action (e.g. `url`) with `secondary` does not; a JS action without `secondary` does not.

- [ ] **Step 6: Commit**

```bash
git add Sources/Core/Extensions/Manifest/ExtensionManifest.swift Sources/Core/Extensions/Manifest/ManifestValidation.swift scripts/validate_extension.sh Tests/OpenClipTests/ExtensionManifestTests.swift Tests/OpenClipTests/ManifestValidationTests.swift
git commit -m "feat(manifest): add toast/secondaryToast keys; scope secondary to non-JS kinds + validation"
```

---

### Task 6: Factory + decorator — map manifest delivery onto `Action.delivery`

**Files:**
- Create: `Sources/Core/Actions/DeliveryDecoratedAction.swift`
- Modify: `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift:93-159`
- Test: `Tests/OpenClipTests/DefaultActionFactoryTests.swift`

**Interfaces:**
- Consumes: `ExtensionActionMetadata.secondary/toast/secondaryToast` (Task 5), `ExtensionSecondaryDeclaration` → `ActionResult` mapping, `MenuDecoratedAction` forwarding pattern.
- Produces `DeliveryDecoratedAction: Action` forwarding id/title/icon/chrome/actionOptions/isEnabled/matchInfo/perform to a base action but overriding `delivery`, and a factory helper mapping an `ExtensionSecondaryDeclaration` to `ActionResult` (reusing `ShellResultMapper`'s vocabulary where possible, else a small pure switch).

- [ ] **Step 1: Write the failing factory test**

In `Tests/OpenClipTests/DefaultActionFactoryTests.swift`: build an `ExtensionActionMetadata` with `secondary`/`toast`/`secondaryToast`, run `createAction`, and assert the returned action's `delivery` carries the declared secondary + toasts. Also assert an action *without* those keys has `delivery == nil` (unchanged).

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh DefaultActionFactoryTests`
Expected: FAIL — `delivery` is nil.

- [ ] **Step 3: Implement the decorator + factory mapping**

Create `DeliveryDecoratedAction.swift` mirroring `MenuDecoratedAction` (forward everything, override `delivery`). In `DefaultActionFactory.decorate` (line 151), when metadata declares secondary/toast/secondaryToast, wrap in `DeliveryDecoratedAction` with the mapped `ActionDelivery`; otherwise return the action unchanged (preserving current nil-delivery behavior). Keep the `menuRelevance` decoration working together (compose both wraps when both declared).

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh DefaultActionFactoryTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Actions/DeliveryDecoratedAction.swift Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift Tests/OpenClipTests/DefaultActionFactoryTests.swift
git commit -m "feat(delivery): map manifest secondary/toast onto Action.delivery via decorator"
```

---

### Task 7: Builtin actions declare delivery uniformly

**Files:**
- Modify: `Sources/Core/Actions/Builtin/DefineAction.swift`
- Modify: `Sources/Core/Actions/Builtin/CopyAction.swift`
- Modify: `Sources/Core/Actions/Builtin/PasteAction.swift`
- Modify: `Sources/Core/Actions/Builtin/CutAction.swift`
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift` (or a new builtin-delivery test)

**Interfaces:**
- Consumes: `Action.delivery` (Task 2), `context.isSecondaryClick` (Task 1).
- Produces: builtin declarations demonstrating uniformity (e.g. PasteAction declares no secondary but relies on the paste→copy default; DefineAction keeps its `context.isSecondaryClick` code branch and may add a `secondaryToast`).

- [ ] **Step 1: Add declarative delivery to builtins**

- `PasteAction`: no `delivery` change needed (default nil → secondary derives to copy). Add a comment documenting the default.
- `DefineAction`: add `var delivery: ActionDelivery? { ActionDelivery(secondaryToast: StatusFeedback(message: "Copied definition", style: .success)) }` so the code-branched `.copyDefinition` shows a toast on secondary click.
- `CopyAction`/`CutAction`: no secondary (default nil). Add comments.

- [ ] **Step 2: Write failing test**

A test asserting `DefineAction().delivery?.secondaryToast != nil` and that `PasteAction().delivery == nil` (uniform default).

- [ ] **Step 3: Run the full suite**

Run: `./scripts/test.sh`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add Sources/Core/Actions/Builtin/ Tests/OpenClipTests/
git commit -m "feat(delivery): builtins declare delivery uniformly"
```

---

### Task 8: Expose `openclip.input.isSecondaryClick` in the JS bridge

**Files:**
- Modify: `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift` (`makeOpenClipObject`, ~line 510-535)
- Modify: `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift` `Request.context` plumbing if `ActionContext.isSecondaryClick` isn't already reachable at the `makeOpenClipObject` call site
- Test: `Tests/OpenClipTests/OpenClipJSHostTests.swift`

**Interfaces:**
- Consumes: `ActionContext.isSecondaryClick` (Task 1), the `openclip.input` object.
- Produces: a boolean `openclip.input.isSecondaryClick` so JS actions can branch imperatively on the trigger flag (the JS channel for secondary — Global Constraint: the manifest `secondary` is rejected on `javascript`, so this is the *only* secondary path for JS).

- [ ] **Step 1: Write the failing test**

In `Tests/OpenClipTests/OpenClipJSHostTests.swift`, add a test that runs a script reading `openclip.input.isSecondaryClick` and asserting it equals the `ActionContext.isSecondaryClick` passed in the `Request` (run once with `true`, once with `false`). E.g. `function action(t){ return openclip.input.isSecondaryClick ? 'secondary' : 'primary'; }` and assert the copy payload matches.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh OpenClipJSHostTests`
Expected: FAIL — `openclip.input.isSecondaryClick` is `undefined`.

- [ ] **Step 3: Implement**

In `makeOpenClipObject(in:text:matchedText:captures:sourceApp:options:)`, add the flag before the `input` object is attached. Thread the value from `request.context.isSecondaryClick` into the call (add a `isSecondaryClick: Bool` parameter, or pass the `ActionContext`). Add:
```swift
input.setObject(isSecondaryClick, forKeyedSubscript: "isSecondaryClick")
```
Keep it alongside `text`/`matchedText`/`captures`/`app`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh OpenClipJSHostTests`
Expected: PASS.

- [ ] **Step 5: Document the JS authoring pattern**

Add a note (in the doc comment near `makeOpenClipObject`, and to `docs/runtimes/javascript.md` in Task 10) that JS secondary is authored by branching on `openclip.input.isSecondaryClick` and emitting an explicit effect — `openclip.paste(...)` for the primary path, `openclip.copy(...)` for the secondary — rather than relying on a string-return convention or a manifest `secondary`.

- [ ] **Step 6: Commit**

```bash
git add Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift Tests/OpenClipTests/OpenClipJSHostTests.swift
git commit -m "feat(js): expose openclip.input.isSecondaryClick for imperative secondary branching"
```

---

### Task 9: Fully remove `after` (`ActionAfterBehavior`, `ActionResultAdapter`)

**Files:**
- Delete: `Sources/Core/Actions/ActionResultAdapter.swift` (its `ActionIcon.symbolName` extension moves to `ActionIcon` in `Action.swift` or a sibling Core file first — do NOT lose it)
- Modify: `Sources/Core/Extensions/Manifest/ActionRequirements.swift:81-87` (delete `ActionAfterBehavior` enum)
- Modify: `Sources/Core/Extensions/Manifest/ExtensionManifest.swift` (remove `after` property/init/decode/encode/CodingKey)
- Modify: `Sources/Core/Actions/ExtensionActionRules.swift` (remove `after` field/init/default/decode/encode; `decodeIfPresent(...) ?? .default` for `after` goes away)
- Modify: `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift:196` (remove `after: metadata.after ?? .default` from the `ExtensionActionRules(...)` construction)
- Modify: `Sources/OpenClip/Platform/Runtimes/JavaScriptAction.swift:113`
- Modify: `Sources/OpenClip/Platform/Runtimes/AppleScriptAction.swift` (if it calls the adapter)
- Modify: `Sources/Core/Extensions/ScriptAction.swift:90`
- Modify: `Sources/Core/Actions/CustomAction.swift:114`
- Modify: `Sources/OpenClip/UI/Preferences/EditActionSheet.swift:404` (remove `after: meta.after`)
- Test: `Tests/OpenClipTests/ActionResultAdapterTests.swift` (delete file), `Tests/OpenClipTests/DefaultActionFactoryTests.swift:238,252`, `Tests/OpenClipTests/OpenClipJSHostTests.swift:289`, `Tests/OpenClipTests/ExtensionManifestTests.swift:60,83`

**Interfaces:**
- Consumes: the declarative primary/secondary delivery (Tasks 2/3) so copy/paste/none forcing is expressed via `ActionDelivery`, not `after`.
- Produces: no `ActionAfterBehavior`, no `ActionResultAdapter`, no `ExtensionActionMetadata.after`, no `ExtensionActionRules.after`. All runtime `perform` methods return raw results; the `resolve` (Task 3) and `delivery` declarations replace all `after` behavior. Copy/paste forcing → declare `primary`/`secondary` results or rely on the derived paste→copy default; `none` → declare `.none` result.

- [ ] **Step 1: Move `ActionIcon.symbolName` out of the file being deleted**

`ActionResultAdapter.swift` contains `public extension ActionIcon { var symbolName: String? }` (`:37-44`). Before deleting, move that extension into `Action.swift` (or a new `Sources/Core/Actions/ActionIcon.swift`). Verify nothing else referenced the adapter's symbolName in a way that breaks.

- [ ] **Step 2: Delete the enum + adapter, remove fields**

- Delete `ActionAfterBehavior` from `ActionRequirements.swift`.
- Delete `ActionResultAdapter.swift`.
- Remove `after` from `ExtensionManifest.swift` (property `:17`, init `:49,69`, decode `:98`, encode `:122`, CodingKey `:150`).
- Remove `after` from `ExtensionActionRules.swift` (field `:16`, init `:25,30`, CodingKeys `:47`, decode `:56`, encode `:64`).

- [ ] **Step 3: Update all call sites**

- `DefaultActionFactory.swift:196`: drop `after: metadata.after ?? .default`.
- `JavaScriptAction.swift:113`, `ScriptAction.swift:90`, `CustomAction.swift:114`: drop the trailing `ActionResultAdapter.apply(raw:after:)` — return the raw result directly (the runtime's `raw` is now the primary; secondary/delivery handled downstream).
- `EditActionSheet.swift:404`: drop `after: meta.after`.
- Grep for any other `ActionResultAdapter` / `ActionAfterBehavior` / `rules?.after` references and remove.

- [ ] **Step 4: Update tests**

- Delete `Tests/OpenClipTests/ActionResultAdapterTests.swift`.
- `DefaultActionFactoryTests.swift:238,252`: remove the `.showResult` `after` assertions.
- `OpenClipJSHostTests.swift:289`: drop the `after: .pasteResult` argument.
- `ExtensionManifestTests.swift:60,83`: remove `after` decode assertions (keep `secondary`/`toast` from Task 5 if present).

- [ ] **Step 5: Run the full suite**

Run: `./scripts/test.sh`
Expected: PASS (no `after` references remain in Sources or Tests).

- [ ] **Step 6: Verify no stragglers**

Run: `rg -n "ActionAfterBehavior|ActionResultAdapter|after:\.|rules\?\.after|\"after\"" Sources Tests`
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(delivery): remove after/ActionAfterBehavior/ActionResultAdapter entirely"
```

---

### Task 10: Docs

**Files:**
- Modify: `docs/developer-guide/AGENTS.md` (§5b delivery + §8 ActionResult surface + dismissal note; §5c JS authoring — `openclip.input.isSecondaryClick`)
- Modify: `docs/architecture/known-debt.md`
- Modify: `docs/developer-guide/popclip-reference.md` (model-parity table row for `before`/`after`)
- Modify: `docs/developer-guide/package-format.md` if it documents `after`/delivery
- Modify: `docs/runtimes/javascript.md`, `docs/runtimes/zsh-python.md` if they mention delivery/toast

**Interfaces:** none (documents the behavior Tasks 1–9 implemented).

- [ ] **Step 1: Update the authoritative spec**

In `docs/developer-guide/AGENTS.md`:
- §5b: rewrite to document the primary/secondary model, the paste→copy default, the probe always applying, and the declarable `toast`/`secondaryToast` keys, plus the `secondary` key **scoped to non-JS kinds** (with examples). **Remove all `after` documentation** (`ActionAfterBehavior`, `after` manifest key, the `ActionResultAdapter` translator).
- §5c (JS): document imperative secondary via `openclip.input.isSecondaryClick` + explicit `openclip.paste(...)`/`openclip.copy(...)` effects; note `secondary` is rejected on `javascript`.
- §8 table/dismissal: confirm `.showStatus` keeps the popup; clarify the companion toast is a delivery-side effect, not a new `ActionResult`.
- Add a note that `after` is removed and copy/paste forcing is expressed via declared secondary results (static kinds), JS `isSecondaryClick` branches (JS), or the derived paste→copy default.

- [ ] **Step 2: Update known-debt + reference docs**

`docs/architecture/known-debt.md`: update any stale `forceCopy`/`after`/delivery wording. `docs/developer-guide/popclip-reference.md` and `package-format.md`: update the parity/delivery rows if they mention `forceCopy`, `after`, or a single-result delivery.

- [ ] **Step 3: Commit**

```bash
git add docs/
git commit -m "docs(delivery): document primary/secondary result + toast model, remove after"
```

---

## Self-Review

**Spec coverage:**
- Rename forceCopy→isSecondaryClick + ClickIntent.primary/secondary → Task 1. ✓
- Both results individually configurable → Tasks 2/3 (protocol `delivery`), 5/6 (manifest `secondary`, non-JS), 8 (JS branch). ✓
- JS secondary authored imperatively via `openclip.input.isSecondaryClick` → Task 8. ✓
- Manifest `secondary` scoped to non-JS kinds, rejected on `javascript` → Task 5 (+ validator). ✓
- Paste-primary ⇒ secondary copies by default → Task 3 selection. ✓
- Non-paste primary ⇒ no secondary (both clicks same) → Task 3 selection. ✓
- Both declared ⇒ no internal paste→copy derivation → Task 3 (probe still applies). ✓
- Probe applies to both → Task 3 (`testProbeAppliesToDeclaredPasteSecondary`). ✓
- Toast declarable per primary/secondary + default "Copied" on copy-from-paste-context → Task 3 + Task 4 rendering. ✓
- Uniform with builtins → Task 7 (`context.isSecondaryClick`). ✓
- `after` fully removed → Task 9 (enum + adapter + manifest/rules fields + all call sites + tests + docs). ✓
- Docs → Task 10. ✓

**Placeholder scan:** All tasks include concrete code, file paths, and test commands. No TBD/TODO placeholders.

**Type consistency:** `ActionDelivery` (Tasks 2–4,6,7), `ClickIntent.primary/secondary` (Tasks 1,3), `ActionContext.isSecondaryClick` (Tasks 1,7,8), `openclip.input.isSecondaryClick` (Task 8), `ActionResultDelivery.resolve` tuple return (Tasks 3,4), `ExtensionSecondaryDeclaration`/`ExtensionToastDeclaration` (Tasks 5,6), `DeliveryDecoratedAction` (Task 6), `DeliveryContext.delivery`/`pendingDelivery`/`onWillPerformAction` (Task 4). No task references `after`/`ActionAfterBehavior`/`ActionResultAdapter` except Task 9 (which removes them) — confirmed consistent with the Global Constraints.