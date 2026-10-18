# Configurable Result Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users choose what happens to an action's *implicitly returned text* (JS string return, AppleScript output, shell plain-text stdout, or a text snippet) on primary and secondary clicks — **preview**, **paste**, or **copy** — via two segmented pickers in the General preferences tab, while leaving explicit effects (openclip.paste/copy, JSON effects, declared `secondary`, builtins) exactly as authored.

**Architecture:** Add a new `ActionResult.text(String)` case for implicit returned text and have the four runtimes that today emit `.paste` for a returned string emit `.text` instead. The pure resolver `ActionResultDelivery.resolve` gains a `preference: ResultDeliveryPreference?` input that maps `.text` to preview/paste/copy per click (nil → legacy default: primary paste, secondary copy). The controller (`PopupWindowController`) reads two new `SettingKey<String>`s into a per-click preference, snapshots it (with the action title + selection) in its `DeliveryContext`, routes a resolved `.text` (preview) into the existing native AI result card in content mode (popup stays open; Esc collapses), and dismisses for paste/copy like today. Loading actions with preview preference re-show the popup as the card using the pre-early-close selection.

**Tech Stack:** Swift 6 (SWIFT_STRICT_CONCURRENCY complete), AppKit + SwiftUI, XcodeGen (`project.yml`), XCTest (flat `Tests/OpenClipTests/` target).

## Global Constraints

- **Core stays pure** — no AppKit/SwiftUI imports and no `UserDefaults` in `Sources/Core/`. `ResultDeliveryPreference` and the resolver preference live in Core; the controller injects the per-click value (Core never reads the setting).
- **Explicit outcomes always win.** The picker governs only implicit `.text` results. `openclip.paste/copy/cut` in JS, shell JSON `{"type":"paste"|"copy"}`, manifest-declared `secondary`, builtins, and `CustomAction.shellScript`'s `replaceSelection` (author-chosen `.paste`/`.copy`) are NOT touched. A declared `secondary` beats the picker even for a `.text` raw result.
- **Defaults preserved.** `.primaryClickBehavior` default `"paste"`, `.secondaryClickBehavior` default `"copy"` — behavior identical to today for implicit text. With default settings the app behaves exactly as before the cutover (Task 3 lands with the full suite green and no behavior drift). One deliberate, designed difference: today a *secondary-click copy* of implicit text fires the default "Copied" toast only as a side effect of the paste→copy derivation; after the change any delivered copy (native `.copy`/`.copyContent`, derived, declared, or downgraded) fires the default "Copied" toast (`testDefaultToastOnNativeCopy` / `testNativeCopyShowsCopiedToast` semantics).
- **Probe always applies.** Whenever the chosen (or authored) outcome is paste, the unified paste probe downgrades it to `.copy` when the target can't paste — for primary and secondary clicks, declared and derived alike. Unknown availability (`nil`) is treated as cannot-paste.
- **Preview respects canPaste.** When the outcome is preview, the card's Paste button is hidden when `modeStore.canPaste == false`; unknown (`nil`) is normalized to `false` before the card shows (safe default).
- **`.text` never auto-dismisses.** `dismissesPopup == false`. The controller decides dismissal from the resolved outcome: preview keeps the popup open, paste/copy dismiss (via a `shouldDismiss` override). Hide-before-deliver ordering is preserved so `exitKeyMode()` reactivates the source app before paste keys are posted.
- **No `switch action.id` string-matching** in UI/presentation.
- **No direct `UserDefaults.standard`** in new code — route through `SettingKey` + `SettingsStore`.
- **Tests**: flat target `OpenClipTests`; store-backed tests use `MemorySettingsStore`; test classes touching app singletons call `TestIsolation.reset()` in `setUp()`. Run with `./scripts/test.sh <ClassName>` (or `./scripts/test.sh` for all).
- **Docs**: keep `docs/developer-guide/AGENTS.md` (authoritative) and `docs/architecture/known-debt.md` in step (Task 5).

---

### Task 1: Core — `ActionResult.text` case, resolver preference, defensive arms

**Files:**
- Modify: `Sources/Core/Actions/ActionResult.swift:10-58,65-85`
- Modify: `Sources/Core/Actions/ActionDelivery.swift:41-46`
- Modify: `Sources/Core/Actions/ActionResultDelivery.swift:21-76`
- Modify: `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift:176-179`
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift` (assertCase helper + new resolver tests)

**Interfaces:**
- Consumes: `ActionResult`, `ActionDelivery`, `StatusFeedback`.
- Produces:
```swift
public enum ResultDeliveryPreference: String, CaseIterable, Sendable, Equatable {
    case preview
    case paste
    case copy
}
```
`ActionResultDelivery.resolve(raw:clickIntent:canPaste:delivery:preference:)` — `preference` is `ResultDeliveryPreference? = nil` (nil → legacy default). For a `.text` raw result: preview → stays `.text`; paste → `.paste(text)` (probe applies); copy → `.copy(text)`. For every non-`.text` raw result the preference is a no-op. New `case text(String)` in `ActionResult` with `dismissesPopup == false`.

- [ ] **Step 1: Add the `.text` case to `ActionResult`**

In `Sources/Core/Actions/ActionResult.swift` add the case after `case paste(String)` (line 17):

```swift
    case paste(String)
    /// Implicitly returned text — a JS string return, AppleScript output, shell plain-text stdout,
    /// or a text snippet. Unlike `.paste`, it carries no delivery decision: the user's per-click
    /// preference (General tab → "When an action returns text") decides preview / paste / copy in
    /// `ActionResultDelivery.resolve`. Explicit effects (openclip.paste/copy, JSON effects, declared
    /// `secondary`) are never re-decided. Does not auto-dismiss the popup; the controller decides
    /// dismissal from the resolved outcome.
    case text(String)
```

- [ ] **Step 2: `dismissesPopup` and `containsToast` arms**

In `dismissesPopup` (line 65-74) add a `.text` case before `default`:

```swift
    public var dismissesPopup: Bool {
        switch self {
        case .toast(let feedback):
            return !feedback.keepVisible
        case .text:
            // Implicit returned text is a presentation result: dismissal is decided by the
            // controller from the resolved outcome (preview keeps the popup open; paste/copy dismiss).
            return false
        case .sequence(let items):
            return !items.isEmpty && items.allSatisfy(\.dismissesPopup)
        default:
            return true // includes openConfiguration: hide bar, then open Preferences
        }
    }
```

In `containsToast` (line 78-84) add an explicit `.text` arm (the default already returns false; make it explicit):

```swift
        switch self {
        case .toast: return true
        case .text: return false
        case .sequence(let items): return items.contains(where: \.containsToast)
        default: return false
        }
```

- [ ] **Step 3: `ActionDelivery.areEqual` arm**

In `Sources/Core/Actions/ActionDelivery.swift` add `.text` to the String payload group (lines 43-46):

```swift
            case (.copy(let x), .copy(let y)), (.cut(let x), .cut(let y)),
                 (.paste(let x), .paste(let y)), (.text(let x), .text(let y)),
                 (.showServices(let x), .showServices(let y)),
                 (.copyDefinition(let x), .copyDefinition(let y)):
                return x == y
```

- [ ] **Step 4: Defensive arm in the effect handler**

In `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift:178` add `.text` to the presentation no-op arm:

```swift
        // Presentation/flow results are presenter-owned (PopupWindowController). The handler treats
        // them as no-ops so the switch stays exhaustive without crashing when one is routed here.
        case .toast, .openConfiguration, .sequence, .text:
            break
```

- [ ] **Step 5: `ResultDeliveryPreference` + resolver preference input**

In `Sources/Core/Actions/ActionResultDelivery.swift`, define `ResultDeliveryPreference` at top-level / file scope (before `public enum ActionResultDelivery`, or inside `ActionResultDelivery` with a top-level `public typealias ResultDeliveryPreference = ActionResultDelivery.ResultDeliveryPreference`):

```swift
/// The user's chosen behavior when an action implicitly returns text (the General-tab setting,
/// "When an action returns text"). `.preview` renders the text in the AI result card;
/// `.paste`/`.copy` deliver it directly. Core never reads the setting itself — the controller
/// injects the per-click value into `resolve`.
public enum ResultDeliveryPreference: String, CaseIterable, Sendable, Equatable {
    case preview
    case paste
    case copy
}
```

Inside `ActionResultDelivery`, change `resolve` to accept and forward the preference (keep the `preference: ... = nil` default so all existing callers compile unchanged):

```swift
    public static func resolve(
        raw: ActionResult,
        clickIntent: ClickIntent,
        canPaste: Bool,
        delivery: ActionDelivery,
        preference: ResultDeliveryPreference? = nil
    ) -> (result: ActionResult, toast: StatusFeedback?) {
        let selected = select(raw: raw, clickIntent: clickIntent, delivery: delivery, preference: preference)
        let delivered = applyProbe(to: selected, canPaste: canPaste)
        let toast = toast(for: raw, selected: selected, delivered: delivered, clickIntent: clickIntent, delivery: delivery)
        return (delivered, toast)
    }
```

Replace `select` (lines 66-76) with the preference-aware version:

```swift
    /// Step 1 — Select: which result the delivery starts from.
    private static func select(raw: ActionResult, clickIntent: ClickIntent, delivery: ActionDelivery, preference: ResultDeliveryPreference?) -> ActionResult {
        if clickIntent == .secondary, let declared = delivery.secondary {
            // Declared outcomes always win over the picker.
            return declared
        }
        if case .text(let text) = raw {
            // Implicit returned text is governed by the user's per-click preference; nil → the
            // legacy default (primary pastes, secondary copies). `.preview` stays `.text` — a
            // presentation marker the controller renders in the AI result card, never delivered.
            let resolved = preference ?? (clickIntent == .secondary ? .copy : .paste)
            switch resolved {
            case .preview: return raw
            case .paste: return .paste(text)
            case .copy: return .copy(text)
            }
        }
        if clickIntent == .secondary, case .paste(let text) = raw {
            // Legacy default: a secondary click on a paste primary copies.
            return .copy(text)
        }
        return raw
    }
```

`applyProbe` downgrades a selected `.paste` (a `.text`/preview passthrough is never downgraded), and `toast` fires the default "Copied" for any delivered copy outcome (`.copy`, `.copyContent`, `.copyDefinition`). Trace the `.text` paths: `.text`+copy → selected `.copy`, delivered `.copy` → "Copied" (native copy, correct); `.text`+paste → selected `.paste`, probe downgrade → delivered `.copy` → "Copied" (correct); `.text`+preview → selected `.text`, delivered `.text` → not copy → nil (correct).

- [ ] **Step 6: Write the failing resolver tests**

In `Tests/OpenClipTests/ActionResultDeliveryTests.swift`, extend `assertCase` (line 14-23) with a `.text` arm:

```swift
        switch (result, expected) {
        case (.paste(let a), .paste(let b)): XCTAssertEqual(a, b, file: file, line: line)
        case (.copy(let a), .copy(let b)): XCTAssertEqual(a, b, file: file, line: line)
        case (.text(let a), .text(let b)): XCTAssertEqual(a, b, file: file, line: line)
        case (.cut(let a), .cut(let b)): XCTAssertEqual(a, b, file: file, line: line)
        case (.openURL(let a), .openURL(let b)): XCTAssertEqual(a, b, file: file, line: line)
        case (.success, .success), (.none, .none): XCTAssertTrue(true, file: file, line: line)
        default: XCTFail("unexpected result \(result)", file: file, line: line)
        }
```

Add a new `// MARK: - Implicit returned text (.text) + user preference` section before `// MARK: - RuleEngine propagates denyPaste`:

```swift
    // MARK: - Implicit returned text (.text) + user preference

    func testTextWithPastePreferencePastesWhenCanPaste() {
        let (r, toast) = ActionResultDelivery.resolve(raw: .text("hello"), clickIntent: .primary, canPaste: true, delivery: .none, preference: .paste)
        assertCase(r, .paste("hello"))
        XCTAssertNil(toast, "an honored paste fires no companion toast")
    }

    func testTextWithPastePreferenceCopiesWhenCannotPaste() {
        let (r, toast) = ActionResultDelivery.resolve(raw: .text("hello"), clickIntent: .primary, canPaste: false, delivery: .none, preference: .paste)
        assertCase(r, .copy("hello"))
        XCTAssertEqual(toast?.message, "Copied", "a paste context delivered as a copy fires the default Copied toast")
    }

    func testTextWithCopyPreferenceCopiesWithToast() {
        let (r, toast) = ActionResultDelivery.resolve(raw: .text("hello"), clickIntent: .primary, canPaste: true, delivery: .none, preference: .copy)
        assertCase(r, .copy("hello"))
        XCTAssertEqual(toast?.message, "Copied", "a delivered copy outcome fires the default Copied toast")
    }

    func testTextWithPreviewPreferenceStaysText() {
        let (r, toast) = ActionResultDelivery.resolve(raw: .text("hello"), clickIntent: .primary, canPaste: true, delivery: .none, preference: .preview)
        assertCase(r, .text("hello"))
        XCTAssertNil(toast)
    }

    func testTextWithPreviewPreferenceIgnoresProbe() {
        let (r, _) = ActionResultDelivery.resolve(raw: .text("hello"), clickIntent: .primary, canPaste: false, delivery: .none, preference: .preview)
        assertCase(r, .text("hello"))
    }

    func testTextNilPreferencePrimaryDefaultsToPaste() {
        let (r, _) = ActionResultDelivery.resolve(raw: .text("hello"), clickIntent: .primary, canPaste: true, delivery: .none)
        assertCase(r, .paste("hello"))
    }

    func testTextNilPreferenceSecondaryDefaultsToCopy() {
        let (r, _) = ActionResultDelivery.resolve(raw: .text("hello"), clickIntent: .secondary, canPaste: true, delivery: .none)
        assertCase(r, .copy("hello"))
    }

    func testDeclaredSecondaryWinsOverTextPreference() {
        let d = ActionDelivery(secondary: .openURL(URL(string: "https://alt")!))
        let (r, _) = ActionResultDelivery.resolve(raw: .text("a"), clickIntent: .secondary, canPaste: true, delivery: d, preference: .preview)
        assertCase(r, .openURL(URL(string: "https://alt")!))
    }

    func testPreferenceIsNoOpForExplicitPaste() {
        let (r, _) = ActionResultDelivery.resolve(raw: .paste("a"), clickIntent: .primary, canPaste: false, delivery: .none, preference: .preview)
        assertCase(r, .copy("a"), "an explicit .paste is never previewed — the probe downgrade still applies")
    }

    func testPreferenceIsNoOpForExplicitCopy() {
        let (r, _) = ActionResultDelivery.resolve(raw: .copy("a"), clickIntent: .primary, canPaste: false, delivery: .none, preference: .preview)
        assertCase(r, .copy("a"))
    }
```

- [ ] **Step 7: Run the failing tests**

Run: `./scripts/test.sh ActionResultDeliveryTests`
Expected: FAIL — `.text` case / `preference` parameter don't exist yet (compile error), or `default: XCTFail` for the new assertions.

- [ ] **Step 8: Run the full suite to verify no regressions**

Run: `./scripts/test.sh`
Expected: ALL pass. The new `.text` case is unused by runtimes and existing tests only use explicit `.paste`/`.copy`, so the preference input is a no-op everywhere.

- [ ] **Step 9: Commit**

```bash
git add Sources/Core/Actions/ActionResult.swift Sources/Core/Actions/ActionDelivery.swift Sources/Core/Actions/ActionResultDelivery.swift Sources/OpenClip/Platform/Effects/ActionResultHandler.swift Tests/OpenClipTests/ActionResultDeliveryTests.swift
git commit -m "feat(core): add ActionResult.text case and resolver delivery preference"
```

---

### Task 2: Settings — `SettingKey`s + General tab "When an action returns text"

**Files:**
- Modify: `Sources/Core/Settings/SettingKey.swift:71-85`
- Modify: `Sources/OpenClip/UI/Preferences/GeneralTabView.swift`
- Test: `Tests/OpenClipTests/SettingsStoreTests.swift`

**Interfaces:**
- Consumes: `SettingKey<String>` pattern (`calculateMode`), `DefaultSettingsStore`, `ResultDeliveryPreference` (Task 1).
- Produces:
```swift
SettingKey.primaryClickBehavior   // SettingKey<String>, name "resultDelivery.primary",   default "paste"
SettingKey.secondaryClickBehavior // SettingKey<String>, name "resultDelivery.secondary", default "copy"
```
Stored values: `"preview"` / `"paste"` / `"copy"` (the `ResultDeliveryPreference` raw values). The General tab reads/writes them through `DefaultSettingsStore.shared` only.

- [ ] **Step 1: Write the failing settings tests**

In `Tests/OpenClipTests/SettingsStoreTests.swift` append:

```swift
    func testResultDeliveryDefaults() {
        XCTAssertEqual(store.get(.primaryClickBehavior), "paste")
        XCTAssertEqual(store.get(.secondaryClickBehavior), "copy")
    }

    func testResultDeliveryRoundTrip() {
        store.set(.primaryClickBehavior, value: "preview")
        store.set(.secondaryClickBehavior, value: "paste")
        XCTAssertEqual(store.get(.primaryClickBehavior), "preview")
        XCTAssertEqual(store.get(.secondaryClickBehavior), "paste")
    }

    func testResultDeliveryPreferenceMapping() {
        XCTAssertEqual(ResultDeliveryPreference.allCases, [.preview, .paste, .copy])
        XCTAssertEqual(ResultDeliveryPreference(rawValue: "preview"), .preview)
        XCTAssertEqual(ResultDeliveryPreference(rawValue: "paste"), .paste)
        XCTAssertEqual(ResultDeliveryPreference(rawValue: "copy"), .copy)
        XCTAssertNil(ResultDeliveryPreference(rawValue: "bogus"))
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `./scripts/test.sh SettingsStoreTests`
Expected: FAIL — `primaryClickBehavior`/`secondaryClickBehavior`/`ResultDeliveryPreference.allCases` unknown.

- [ ] **Step 3: Add the `SettingKey`s**

In `Sources/Core/Settings/SettingKey.swift`, inside the `Value == String` extension (after `searchURL`, line 74):

```swift
    /// The user's chosen behavior when an action implicitly returns text (General tab →
    /// "When an action returns text"): "preview" | "paste" | "copy". The raw `ResultDeliveryPreference`
    /// values; defaults preserve today's behavior (primary pastes, secondary copies).
    static var primaryClickBehavior: SettingKey<String> { SettingKey<String>("resultDelivery.primary", defaultValue: "paste") }
    static var secondaryClickBehavior: SettingKey<String> { SettingKey<String>("resultDelivery.secondary", defaultValue: "copy") }
```

- [ ] **Step 4: Add the General tab section**

In `Sources/OpenClip/UI/Preferences/GeneralTabView.swift`:
- Add two `@State` vars and seed them in `init()`:

```swift
    @State private var isAppEnabled: Bool
    @State private var primaryBehavior: String
    @State private var secondaryBehavior: String
    @ObservedObject private var launchManager = LaunchAtLoginManager.shared
    @ObservedObject private var permissionManager = PermissionManager.shared

    init() {
        _isAppEnabled = State(initialValue: DefaultSettingsStore.shared.get(.isAppEnabled))
        _primaryBehavior = State(initialValue: DefaultSettingsStore.shared.get(.primaryClickBehavior))
        _secondaryBehavior = State(initialValue: DefaultSettingsStore.shared.get(.secondaryClickBehavior))
    }
```

- Insert a new `Section` between the "General Controls" section and the "System Permissions" section (before line 103). User-facing wording is exactly "When an action returns text" (not "Result Delivery"):

```swift
            Section(header: Text("When an action returns text")) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Primary click")
                            .font(.body)
                            .fontWeight(.medium)
                        Text("What happens to returned text on a primary click")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Picker("Primary click", selection: $primaryBehavior) {
                        ForEach(ResultDeliveryPreference.allCases, id: \.self) { pref in
                            Text(pref.rawValue.capitalized).tag(pref.rawValue)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(width: 220)
                    .onChange(of: primaryBehavior) { _, newValue in
                        DefaultSettingsStore.shared.set(.primaryClickBehavior, value: newValue)
                    }
                }
                .padding(.vertical, 4)

                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Secondary click")
                            .font(.body)
                            .fontWeight(.medium)
                        Text("What happens to returned text on a right-click or ⇧-click")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Picker("Secondary click", selection: $secondaryBehavior) {
                        ForEach(ResultDeliveryPreference.allCases, id: \.self) { pref in
                            Text(pref.rawValue.capitalized).tag(pref.rawValue)
                        }
                    }
                    .labelsHidden()
                    .pickerStyle(.segmented)
                    .frame(width: 220)
                    .onChange(of: secondaryBehavior) { _, newValue in
                        DefaultSettingsStore.shared.set(.secondaryClickBehavior, value: newValue)
                    }
                }
                .padding(.vertical, 4)
            }
```

(`ResultDeliveryPreference` is imported via `import Core`. The SwiftUI section has no unit-test harness in this repo — the setting's behavior is covered by the `SettingsStoreTests` above and the controller tests in Tasks 3-4.)

- [ ] **Step 5: Run the settings tests**

Run: `./scripts/test.sh SettingsStoreTests`
Expected: PASS (3 new tests).

- [ ] **Step 6: Commit**

```bash
git add Sources/Core/Settings/SettingKey.swift Sources/OpenClip/UI/Preferences/GeneralTabView.swift Tests/OpenClipTests/SettingsStoreTests.swift
git commit -m "feat(settings): add per-click result delivery behavior pickers to General tab"
```

---

### Task 3: Runtime cutover — emit `.text` from runtimes + controller delivery wiring

**Files:**
- Modify: `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift:602,619-623`
- Modify: `Sources/OpenClip/Platform/Runtimes/AppleScriptAction.swift:126`
- Modify: `Sources/Core/Extensions/ScriptAction.swift:82-83`
- Modify: `Sources/Core/Actions/CustomAction.swift:74-76`
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift` (see steps 2-7)
- Test: `Tests/OpenClipTests/OpenClipJSHostTests.swift`, `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift`, `Tests/OpenClipTests/ScriptActionExecutionTests.swift`, `Tests/OpenClipTests/ActionVisibilityTests.swift`, `Tests/OpenClipTests/ActionOptionStoreTests.swift`, `Tests/OpenClipTests/ActionResultDeliveryTests.swift`

**Interfaces:**
- Consumes: `ResultDeliveryPreference`, `ActionResult.text`, `ActionResultDelivery.resolve(preference:)` (Task 1); `SettingKey.primaryClickBehavior`/`secondaryClickBehavior` (Task 2).
- Produces (controller vocabulary all later tasks use):
```swift
// PopupWindowController
init(resultHandler: ActionResultHandler = DefaultActionResultHandler(),
     pasteProbe: PasteAvailabilityProbing = PasteAvailabilityProbe(),
     toastController: ToastPanelController = ToastPanelController(),
     settingsStore: SettingsStore = DefaultSettingsStore.shared)

private func preference(for clickIntent: ActionResultDelivery.ClickIntent) -> ResultDeliveryPreference
private func isText(_ result: ActionResult) -> Bool
private func shouldDismiss(_ result: ActionResult, preference: ResultDeliveryPreference) -> Bool

// DeliveryContext gains:
let preference: ResultDeliveryPreference
let actionTitle: String?
let selection: SelectionContext?

// resolveDelivery now accounts for a `.text`+paste preference when deciding whether to probe.
```

- [ ] **Step 1: Write failing runtime tests (`.text` emissions)**

Update the string-return assertions to expect `.text` (they fail now because runtimes still emit `.paste`). All are mechanical: replace the `guard case .paste(...)`/`if case .paste(...)` pattern with `guard case .text(...)`/`if case .text(...)` and the failure message "Expected .paste" → "Expected .text", keeping the payload equality checks identical. The exact list:

**`Tests/OpenClipTests/OpenClipJSHostTests.swift`** — string *returns* become `.text`; explicit `openclip.paste(...)` effects stay `.paste` (only `testPasteEffectReturnsPaste` at lines 122-128 stays `.paste`):
- `testConsoleLogShimDoesNotThrowAndActionSucceeds` (line 147) → `.text`
- `testConsoleLogShimWorksInAsyncScript` (line 159) → `.text`
- `testConsoleLogShimRemovesRawLogAccess` (line 174) → `.text`
- `testInputCapturesExposed` (line 220) → `.text`
- `testInputIsSecondaryClickFlagBranchesScript` (lines 230, 236, both branches) → `.text`
- `testInputMatchedTextAndAppExposed` (line 254) → `.text`
- `testTypedBooleanOptionsDeliveredAsNativeBooleans` (line 266) → `.text`
- `testFunctionStringReturnBecomesPaste` (line 296) → `.text`; **rename the test** to `testFunctionStringReturnBecomesText`
- `testFunctionStringReturnProducesRawPasteResult` (line 304) → `.text`; **rename the test** to `testFunctionStringReturnProducesRawTextResult`
- `testOptionsReadOnlyViaOptionStore` (line 412) → `.text`
- `testAsyncFunctionResolvesReturnValue` (line 423) → `.text`
- `testFetchGetReturnsStatusAndText` (line 472) → `.text`
- `testFetchPostSendsJSONBodyAndParsesResponse` (line 497) → `.text`
- `testFetchNetworkErrorRejectsPromise` (line 543) → `.text`
- `testFetchRejectsUnsupportedScheme` (line 568) → `.text`
- `testFetchAcceptsCaseInsensitiveHTTPScheme` (line 591) → `.text`
- `testFetchRejectsDirectLoopback` (line 616) → `.text`
- `testFetchRejectsRedirectToLoopback` (line 645) → `.text`
- `testMissingRequiredOptionsRunsNormallyWhenStoreSet` (line 775) → `.text`
- `testNestedEntryModuleResolvesRelativeRequires` (line 818) → `.text`
- `testModulePackageRequiresLocalHelper` (line 830) → `.text`
- `testCJSModuleExportsActionEntryForm` (line 840) → `.text`
- `testDirectFunctionExportEntryForm` (line 850) → `.text`
- `testModuleCacheAndSingletonAcrossRequires` (line 868) → `.text`
- `testModuleCycleResolvesWithPartialExports` (line 884) → `.text`
- `testAsyncModulePackageResolvesHelper` (line 920) → `.text`
- `testJavaScriptActionPerformThreadsPackageDirectory` (line 943) → `.text`

**`Tests/OpenClipTests/GoldenExtensionPlatformTests.swift`** (lines 200, 211, 221, 229) — JS default/custom option results, AppleScript output, and shell plain stdout → `.text`:

```swift
        let defaultJSResult = try await jsAction.perform(sampleContext)
        if case .text(let text) = defaultJSResult {
            XCTAssertEqual(text, "JS_DEFAULT: SAMPLEINPUT")
        } else {
            XCTFail("Expected .text result for JS action, got \(defaultJSResult)")
        }
```
(and the same for `customJSResult`, `asResult` "AS:SampleInput", `shResult` "SH:SampleInput" — payloads unchanged.)

**`Tests/OpenClipTests/ScriptActionExecutionTests.swift`** (lines 32, 53, 77 — shell plain stdout; 242, 261, 281 — AppleScript output) → `.text` (payload equality unchanged).

**`Tests/OpenClipTests/ActionVisibilityTests.swift:249`** (shell stdout) → `.text`.

**`Tests/OpenClipTests/ActionOptionStoreTests.swift`** (lines 56, 74 — JS actions returning strings) → `.text`.

Do NOT touch: `CalculateActionTests` (builtin authored `.paste`), `DefaultActionFactoryTests:432,438` (manifest-declared `secondary` `.paste`), `ActionResultHandlerTests:72` (explicit `.paste`), `ActionResultDismissPolicyTests` (explicit `.paste`/`.copy`), `PasteAvailabilityTests:34` (explicit `.paste`), `ActionResultDeliveryTests` `.paste` tests (explicit).

- [ ] **Step 2: Run to verify they fail**

Run: `./scripts/test.sh OpenClipJSHostTests`
Run: `./scripts/test.sh GoldenExtensionPlatformTests`
Run: `./scripts/test.sh ScriptActionExecutionTests`
Run: `./scripts/test.sh ActionVisibilityTests`
Run: `./scripts/test.sh ActionOptionStoreTests`
Expected: FAIL — runtimes still emit `.paste`.

- [ ] **Step 3: Cut the four emission sites over to `.text`**

**`Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift`**:
- Line 602 comment: `// (in call order, sequence when >1) > function string return (pastes) > success.` → `// (in call order, sequence when >1) > function string return (.text) > success.`
- Line 620: `raw = .paste(returnValue)` → `raw = .text(returnValue)` and update the line 628 doc comment: `"raw = .text(returnValue) — implicitly returned text, governed by the user's per-click preference"`.

**`Sources/OpenClip/Platform/Runtimes/AppleScriptAction.swift:126`**:
```swift
            return output.isEmpty ? .success : .text(output)
```

**`Sources/Core/Extensions/ScriptAction.swift:78-86`**:
```swift
        // Raw runtime result: JSON stdout wins, plain-text stdout is implicitly returned text
        // (governed by the user's per-click preference), empty stdout succeeds.
        let raw: ActionResult
        if let jsonResult = ShellResultMapper.actionResult(from: output.stdout, actionID: id) {
            raw = jsonResult
        } else if !output.stdout.isEmpty {
            raw = .text(output.stdout)
        } else {
            raw = .success
        }
```

**`Sources/Core/Actions/CustomAction.swift:74-76`**:
```swift
        case .textSnippet(let template):
            let formatted = TextPlaceholderEngine.replacePlaceholders(in: template, context: context, urlEncode: false)
            raw = .text(formatted) // implicitly returned text, governed by the user's per-click preference
```
Leave line 105 (`replaceSelection ? .paste(output.stdout) : .copy(output.stdout)`) untouched — author-chosen explicit delivery.

- [ ] **Step 4: Wire the controller — settings store + per-click preference**

In `Sources/OpenClip/UI/Popup/PopupWindowController.swift`:

**Add the store property** (near line 57) and init param (lines 63-69):

```swift
    /// The settings store resolving the per-click result-delivery preference. Injected for tests.
    private let settingsStore: SettingsStore

    public init(resultHandler: ActionResultHandler = DefaultActionResultHandler(),
                pasteProbe: PasteAvailabilityProbing = PasteAvailabilityProbe(),
                toastController: ToastPanelController = ToastPanelController(),
                settingsStore: SettingsStore = DefaultSettingsStore.shared) {
        self.resultHandler = resultHandler
        self.pasteProbe = pasteProbe
        self.toastController = toastController
        self.settingsStore = settingsStore
    }
```

**Add the pending action title state** (near `pendingDelivery`, line 54):

```swift
    /// The most recent bar/palette action's title, for the preview card header. Set by the perform
    /// paths (`onWillPerformAction`, `runAction`, `runLoadingAction`) alongside `pendingDelivery`,
    /// consumed once by the next `deliverResult` snapshot (which clears it), reset by hide(). Internal
    /// for tests.
    var pendingActionTitle: String? = nil
```

**Set it in `onWillPerformAction`** (lines 147-149):

```swift
            onWillPerformAction: { [weak self] action in
                self?.pendingDelivery = action.delivery
                self?.pendingActionTitle = action.title
            },
```

**Add `preference(for:)`, `isText`, `shouldDismiss`** (near `isPaste`, line 691):

```swift
    /// Resolves the user's chosen behavior for a click from the two General-tab settings. Unknown
    /// stored values fall back to the defaults (primary paste, secondary copy).
    private func preference(for clickIntent: ActionResultDelivery.ClickIntent) -> ResultDeliveryPreference {
        let key: SettingKey<String> = clickIntent == .primary ? .primaryClickBehavior : .secondaryClickBehavior
        return ResultDeliveryPreference(rawValue: settingsStore.get(key))
            ?? (clickIntent == .primary ? .paste : .copy)
    }

    private func isText(_ result: ActionResult) -> Bool {
        guard case .text = result else { return false }
        return true
    }

    /// Dismissal for a top-level result: an implicit `.text` follows its resolved outcome (preview
    /// keeps the popup open; paste/copy dismiss like any paste today), everything else uses
    /// `dismissesPopup` as-is.
    private func shouldDismiss(_ result: ActionResult, preference: ResultDeliveryPreference) -> Bool {
        if isText(result) && preference != .preview { return true }
        return result.dismissesPopup
    }
```

- [ ] **Step 5: Extend `DeliveryContext` + snapshot**

In the `DeliveryContext` struct (lines 566-578) add the three fields:

```swift
    struct DeliveryContext {
        let policy: AppPolicyContext
        let clickIntent: ActionResultDelivery.ClickIntent
        /// The action's declared delivery (secondary outcome + per-click toasts), snapshotted from
        /// the performing action right before the perform. `nil` means no declaration: the unified
        /// decision derives the secondary and default toasts exactly as before.
        let delivery: ActionDelivery?
        /// The target app the result will be delivered to. Captured synchronously with the other
        /// inputs: while the (non-activating) panel is up, the source app stays frontmost, and
        /// `exitKeyMode()` reactivates exactly this app on hide — so the snapshot is the same app
        /// `pasteProbe` must inspect, without reading frontmost state after hide or an await.
        let application: NSRunningApplication?
        /// The user's chosen behavior for this click (preview/paste/copy), resolved from the two
        /// General-tab settings at snapshot time.
        let preference: ResultDeliveryPreference
        /// The performing action's title — the preview card header. nil for explicit user requests.
        let actionTitle: String?
        /// The selection context captured before any early-close (loading actions), used to re-show
        /// the popup as a preview card. nil when the popup never closed.
        let selection: SelectionContext?
    }
```

In `deliverySnapshot()` (lines 583-590):

```swift
    private func deliverySnapshot() -> DeliveryContext {
        DeliveryContext(
            policy: currentActionContext?.selection.appPolicy ?? .default,
            clickIntent: pendingClickIntent,
            delivery: pendingDelivery,
            application: NSWorkspace.shared.frontmostApplication,
            preference: preference(for: pendingClickIntent),
            actionTitle: pendingActionTitle,
            selection: currentActionContext?.selection
        )
    }
```

- [ ] **Step 6: Rework `deliverResult`, `resolveDelivery`, `runAction`, `runLoadingAction`**

**`deliverResult`** (lines 600-607) — dismiss via `shouldDismiss`, clear `pendingActionTitle`:

```swift
    func deliverResult(_ result: ActionResult) {
        let delivery = deliverySnapshot()
        pendingDelivery = nil
        pendingActionTitle = nil
        if shouldDismiss(result, preference: delivery.preference) {
            hide()
        }
        handleActionResult(result, delivery: delivery, suppressDeliveryToast: result.containsToast)
    }
```

**`resolveDelivery`** (lines 660-689) — account for a `.text`+paste preference when deciding `couldPaste`/probing, and pass the preference into `resolve`:

```swift
    private func resolveDelivery(_ result: ActionResult, delivery: DeliveryContext?, suppressDeliveryToast: Bool = false) async -> (result: ActionResult, toast: StatusFeedback?) {
        guard let delivery else { return (result, nil) }
        // A declared `.paste` secondary is pasted on a secondary click, so the probe must run for it
        // too; likewise a `.text` result whose user preference is paste. The force-copy short-circuit
        // below applies only when the click's outcome is a copy.
        let declaredSecondaryIsPaste = delivery.clickIntent == .secondary && isPaste(delivery.delivery?.secondary)
        let preference = delivery.preference
        let textPrefersPaste = isText(result) && preference == .paste
        let couldPaste = isPaste(result) || declaredSecondaryIsPaste || textPrefersPaste
        // The unified paste decision: per-app rules (assume/deny paste) answer definitively and
        // skip the AX walk entirely (no Accessibility dependency for those apps); a force-copy click
        // (a secondary click whose outcome is a copy — derived, or a non-paste declared secondary)
        // also skips it (the outcome is a copy regardless). A declared `.paste` secondary or a
        // `.text`+paste preference is the exception: the outcome is a paste, so the probe still runs.
        // Otherwise probe the target app and treat unknown availability as cannot-paste — the safe
        // default: never paste blindly when we cannot confirm the target supports it. The target is
        // the snapshotted app captured before hide(), never frontmost state read after suspension.
        let canPaste: Bool
        if !couldPaste {
            canPaste = false // unused: `resolve` only consults it for a selected `.paste`
        } else if (delivery.clickIntent == .secondary && !(declaredSecondaryIsPaste || textPrefersPaste)) || !PasteAvailability.needsProbe(policy: delivery.policy) {
            canPaste = PasteAvailability.effective(policy: delivery.policy, probe: nil) ?? false
        } else {
            canPaste = await pasteProbe.canPaste(in: delivery.application, policy: delivery.policy) ?? false
        }
        let resolved = ActionResultDelivery.resolve(
            raw: result,
            clickIntent: delivery.clickIntent,
            canPaste: canPaste,
            delivery: delivery.delivery ?? .none,
            preference: preference
        )
        return (resolved.result, suppressDeliveryToast ? nil : resolved.toast)
    }
```

**`runAction`** (lines 701-737) — build the snapshot with the new fields and dismiss via `shouldDismiss`:

```swift
    func runAction(_ action: any Action, with context: ActionContext, isSecondaryClick: Bool) {
        if action.chrome.showsLoading {
            runLoadingAction(action, with: context, isSecondaryClick: isSecondaryClick)
            return
        }
        let clickIntent: ActionResultDelivery.ClickIntent = isSecondaryClick ? .secondary : .primary
        pendingClickIntent = clickIntent
        // Snapshot the action's declared delivery with the rest of the delivery inputs, before the
        // perform await and before hide() can clear it.
        pendingDelivery = action.delivery
        pendingActionTitle = action.title
        let preference = preference(for: clickIntent)
        let delivery = DeliveryContext(
            policy: context.selection.appPolicy,
            clickIntent: clickIntent,
            delivery: action.delivery,
            application: NSWorkspace.shared.frontmostApplication,
            preference: preference,
            actionTitle: action.title,
            selection: context.selection
        )
        usageStore.record(action.id)
        let match = action.matchInfo(for: context)
        let performContext = ActionContext(
            selection: context.selection,
            modifiers: context.modifiers,
            isSecondaryClick: isSecondaryClick,
            match: match
        )
        Task { @MainActor in
            do {
                let result = try await action.perform(performContext)
                if self.shouldDismiss(result, preference: preference) {
                    self.hide()
                }
                self.handleActionResult(result, delivery: delivery, suppressDeliveryToast: result.containsToast)
            } catch {
                Log.presentation.error("Action failed (id \(action.id, privacy: .public)): \(error.localizedDescription)")
                self.handleActionResult(.toast(StatusFeedback(error: error)))
            }
        }
    }
```

**`runLoadingAction`** (lines 743-775) — capture title + selection + preference before the early hide:

```swift
    func runLoadingAction(_ action: any Action, with context: ActionContext, isSecondaryClick: Bool) {
        let clickIntent: ActionResultDelivery.ClickIntent = isSecondaryClick ? .secondary : .primary
        pendingClickIntent = clickIntent
        // Snapshot the action's declared delivery before the early hide clears the session state.
        pendingDelivery = action.delivery
        pendingActionTitle = action.title
        let delivery = DeliveryContext(
            policy: context.selection.appPolicy,
            clickIntent: clickIntent,
            delivery: action.delivery,
            application: NSWorkspace.shared.frontmostApplication,
            preference: preference(for: clickIntent),
            actionTitle: action.title,
            selection: context.selection
        )
        usageStore.record(action.id)
        let match = action.matchInfo(for: context)
        let performContext = ActionContext(
            selection: context.selection,
            modifiers: context.modifiers,
            isSecondaryClick: isSecondaryClick,
            match: match
        )
        let anchorPoint = panel?.centerPoint
        hide()
        let message = action.chrome.loadingMessage ?? "Opening \(action.title)…"
        toastController.showLoading(message: message, anchorPoint: anchorPoint)
        Task { @MainActor in
            do {
                let result = try await action.perform(performContext)
                await settleLoadingResult(result, delivery: delivery, suppressDeliveryToast: result.containsToast)
            } catch {
                Log.presentation.error("Action failed (id \(action.id, privacy: .public)): \(error.localizedDescription)")
                await settleLoadingResult(.toast(StatusFeedback(error: error)), delivery: delivery)
            }
        }
    }
```

**`hide()`** (line 379-404) — reset the new state:

```swift
        pendingClickIntent = .primary
        pendingDelivery = nil
        pendingActionTitle = nil
```

- [ ] **Step 7: Add controller wiring tests**

In `Tests/OpenClipTests/ActionResultDeliveryTests.swift`, update the `shownController` helper to inject a memory settings store (default `MemorySettingsStore()`) and thread it into the controller:

```swift
    @MainActor
    private func shownController(resultHandler: ActionResultHandler,
                                 pasteProbe: PasteAvailabilityProbing,
                                 appPolicy: AppPolicyContext,
                                 toastController: ToastPanelController = ToastPanelController(),
                                 settingsStore: SettingsStore = MemorySettingsStore()) throws -> PopupWindowController {
        guard NSScreen.main != nil else { throw XCTSkip("no screen") }
        let controller = PopupWindowController(resultHandler: resultHandler, pasteProbe: pasteProbe, toastController: toastController, settingsStore: settingsStore)
        let context = SelectionContext(
            text: "hello",
            sourceApp: AppIdentity(bundleIdentifier: "com.test", localizedName: "Test"),
            cursorPosition: CGPoint(x: 300, y: 300),
            timestamp: Date(),
            appPolicy: appPolicy
        )
        controller.show(for: context)
        return controller
    }
```

Add a new `// MARK: - Implicit .text delivery wiring (defaults preserved)` section (after `testNilDeliveryPassesPasteThroughUntouched`, line 269) plus two stub actions at the bottom of the file:

```swift
    /// Default settings (primary = paste): an implicit `.text` result delivers a paste and dismisses
    /// the popup — identical to today's string-return behavior.
    @MainActor
    func testTextDeliversPasteAndDismissesWithDefaultSettings() async throws {
        let handler = RecordingHandler()
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: true),
                                             appPolicy: .default)
        defer { controller.hide() }

        controller.deliverResult(.text("hello"))

        assertCase(try await awaitDelivery(from: handler), .paste("hello"))
        XCTAssertFalse(controller.isVisible, "a .text result with a paste preference must dismiss like a paste today")
    }

    /// Default primary = paste + cannot paste → copy with the default "Copied" toast.
    @MainActor
    func testTextDeliversCopyAndCopiedToastWhenCannotPaste() async throws {
        let handler = RecordingHandler()
        let toast = ToastPanelController(autoDismissNanoseconds: 100_000_000)
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: false),
                                             appPolicy: .default,
                                             toastController: toast)
        defer { controller.hide(); toast.hide() }

        controller.deliverResult(.text("hello"))

        assertCase(try await awaitDelivery(from: handler), .copy("hello"))
        XCTAssertEqual(toast.currentFeedback?.message, "Copied")
    }

    /// User picks copy for the primary click: `.text` delivers a copy with the default Copied toast and dismisses.
    @MainActor
    func testTextDeliversCopyWhenPreferenceIsCopy() async throws {
        let handler = RecordingHandler()
        let store = MemorySettingsStore()
        store.set(.primaryClickBehavior, value: "copy")
        let toast = ToastPanelController(autoDismissNanoseconds: 100_000_000)
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: true),
                                             appPolicy: .default,
                                             toastController: toast,
                                             settingsStore: store)
        defer { controller.hide(); toast.hide() }

        controller.deliverResult(.text("hello"))

        assertCase(try await awaitDelivery(from: handler), .copy("hello"))
        XCTAssertEqual(toast.currentFeedback?.message, "Copied", "a delivered copy outcome fires the default Copied toast")
    }

    /// A secondary click with the default secondary = copy: `.text` copies with the default Copied toast.
    @MainActor
    func testTextSecondaryCopiesWithDefaultSettings() async throws {
        let handler = RecordingHandler()
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: true),
                                             appPolicy: .default)
        defer { controller.hide() }

        let stub = TextStubAction()
        controller.runAction(stub, with: controllerCurrentContext(controller), isSecondaryClick: true)

        assertCase(try await awaitDelivery(from: handler), .copy("hello"))
        XCTAssertFalse(controller.isVisible)
    }
```

Add the stub actions at the end of the test file (after `DeclaredDeliveryStub`, before `LockedContextBox`):

```swift
/// An action whose perform returns implicitly returned text (a `.text` result), like the JS string
/// return / AppleScript output / shell stdout / text snippet runtimes.
private final class TextStubAction: Action, @unchecked Sendable {
    let id = "stub.text"
    let title = "Text Action"
    let icon: ActionIcon = .symbol("text.alignleft")
    var chrome: ActionChrome { ActionChrome(source: .builtin) }
    private let result: ActionResult
    init(result: ActionResult = .text("hello")) { self.result = result }
    func isEnabled(for context: ActionContext) -> Bool { true }
    func matchInfo(for context: ActionContext) -> ActionMatchInfo? { nil }
    func perform(_ context: ActionContext) async throws -> ActionResult { result }
}

/// A `showsLoading` action returning `.text` after a short delay (loading + preview re-show path).
private final class SlowTextStubAction: Action, @unchecked Sendable {
    let id = "stub.slowtext"
    let title = "Slow Text"
    let icon: ActionIcon = .symbol("text.alignleft")
    var chrome: ActionChrome { ActionChrome(source: .builtin, showsLoading: true) }
    private let text: String
    init(text: String = "loaded") { self.text = text }
    func isEnabled(for context: ActionContext) -> Bool { true }
    func matchInfo(for context: ActionContext) -> ActionMatchInfo? { nil }
    func perform(_ context: ActionContext) async throws -> ActionResult {
        try await Task.sleep(nanoseconds: 30_000_000)
        return .text(text)
    }
}
```

- [ ] **Step 8: Run the full suite**

Run: `./scripts/test.sh`
Expected: ALL pass. Runtime tests now assert `.text`; controller tests confirm defaults preserve today's behavior end-to-end.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(delivery): emit ActionResult.text from runtimes; wire per-click preference into controller"
```

---

### Task 4: Preview routing — AI result card for `.text` (including loading re-show)

**Files:**
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift` (`handleEffect`, `settleLoadingResult`)
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift`

**Interfaces:**
- Consumes: `DeliveryContext.preference/actionTitle/selection`, `resolveDelivery` returning `.text` for preview, `showAIContent(text:isError:title:)`, `show(for:pasteAvailable:)`, `modeStore.canPaste`, `pasteProbe` (all from Task 3).
- Produces: resolved `.text` (preview) is a *presentation* result rendered in the native AI card — `modeStore.mode == .content`, `modeStore.aiResult = AIResultPayload(text:, isError: false, title:)`, popup stays open, Esc collapses via the existing `exitContent()`. Loading actions with preview preference hide the spinner toast, re-show the popup via `show(for: selection, pasteAvailable: probedCanPaste)`, then `showAIContent`.

- [ ] **Step 1: Write failing preview tests**

In `Tests/OpenClipTests/ActionResultDeliveryTests.swift` add a `// MARK: - Preview routing (implicit .text → AI result card)` section:

```swift
    /// Preview preference on a primary click keeps the popup open and renders the returned text in
    /// the native AI result card (content mode) with the performing action's title — no effect is
    /// delivered to the handler.
    @MainActor
    func testTextPreviewKeepsPopupOpenAndShowsCard() async throws {
        let handler = RecordingHandler()
        let store = MemorySettingsStore()
        store.set(.primaryClickBehavior, value: "preview")
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: true),
                                             appPolicy: .default,
                                             settingsStore: store)
        defer { controller.hide() }
        controller.pendingActionTitle = "My Action"

        controller.deliverResult(.text("hello"))

        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertTrue(handler.results.isEmpty, "preview must not deliver any effect")
        XCTAssertTrue(controller.isVisible, "preview keeps the popup open")
        XCTAssertEqual(controller.modeStore.mode, .content)
        XCTAssertEqual(controller.modeStore.aiResult?.text, "hello")
        XCTAssertEqual(controller.modeStore.aiResult?.title, "My Action")
        XCTAssertFalse(controller.modeStore.aiResult?.isError ?? true)
    }

    /// Preview with cannot-paste hides the card's Paste button (modeStore.canPaste == false).
    @MainActor
    func testTextPreviewHidesPasteWhenCannotPaste() async throws {
        let handler = RecordingHandler()
        let store = MemorySettingsStore()
        store.set(.primaryClickBehavior, value: "preview")
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: false),
                                             appPolicy: .default,
                                             settingsStore: store)
        defer { controller.hide() }
        controller.pendingActionTitle = "My Action"

        controller.deliverResult(.text("hello"))

        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertEqual(controller.modeStore.canPaste, false, "preview card must gate Paste on the probe answer")
    }

    /// Preview with can-paste keeps Paste visible on the card.
    @MainActor
    func testTextPreviewKeepsPasteWhenCanPaste() async throws {
        let handler = RecordingHandler()
        let store = MemorySettingsStore()
        store.set(.primaryClickBehavior, value: "preview")
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: true),
                                             appPolicy: .default,
                                             settingsStore: store)
        defer { controller.hide() }
        controller.pendingActionTitle = "My Action"

        controller.deliverResult(.text("hello"))

        try await Task.sleep(nanoseconds: 50_000_000)
        XCTAssertNotEqual(controller.modeStore.canPaste, false)
    }

    /// Esc collapses the preview card back to the actions bar (exitContent) without hiding the popup.
    @MainActor
    func testTextPreviewEscCollapsesToBar() async throws {
        let handler = RecordingHandler()
        let store = MemorySettingsStore()
        store.set(.primaryClickBehavior, value: "preview")
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: true),
                                             appPolicy: .default,
                                             settingsStore: store)
        defer { controller.hide() }
        controller.pendingActionTitle = "My Action"

        controller.deliverResult(.text("hello"))
        try await Task.sleep(nanoseconds: 50_000_000)
        controller.exitContent()

        XCTAssertEqual(controller.modeStore.mode, .actions)
        XCTAssertNil(controller.modeStore.aiResult)
        XCTAssertTrue(controller.isVisible, "collapsing the card never hides the popup")
    }

    /// A loading action with preview preference: the spinner hides and the popup re-shows as a
    /// content-mode card using the original selection.
    @MainActor
    func testLoadingTextPreviewReshowsPopupAsCard() async throws {
        let handler = RecordingHandler()
        let store = MemorySettingsStore()
        store.set(.primaryClickBehavior, value: "preview")
        let toast = ToastPanelController(autoDismissNanoseconds: 100_000_000)
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: true),
                                             appPolicy: .default,
                                             toastController: toast,
                                             settingsStore: store)
        defer { controller.hide(); toast.hide() }

        controller.runLoadingAction(SlowTextStubAction(text: "loaded"), with: controllerCurrentContext(controller), isSecondaryClick: false)
        XCTAssertTrue(toast.isLoading, "spinner should be visible immediately")

        let deadline = Date().addingTimeInterval(3.0)
        while controller.modeStore.mode != .content && Date() < deadline {
            try? await Task.sleep(nanoseconds: 20_000_000)
        }

        XCTAssertFalse(toast.isLoading, "the spinner must hide when the preview card re-shows")
        XCTAssertEqual(controller.modeStore.mode, .content)
        XCTAssertEqual(controller.modeStore.aiResult?.text, "loaded")
        XCTAssertEqual(controller.modeStore.aiResult?.title, "Slow Text")
        XCTAssertTrue(controller.isVisible, "the popup must re-show as the preview card")
        XCTAssertTrue(handler.results.isEmpty)
    }

    /// A loading action with a paste preference keeps the existing settle path (deliver + spinner
    /// swap/hide) — no re-show.
    @MainActor
    func testLoadingTextPastePreferenceDeliversNormally() async throws {
        let handler = RecordingHandler()
        let controller = try shownController(resultHandler: handler,
                                             pasteProbe: FixedProbe(result: true),
                                             appPolicy: .default)
        defer { controller.hide() }

        controller.runLoadingAction(SlowTextStubAction(text: "loaded"), with: controllerCurrentContext(controller), isSecondaryClick: false)

        assertCase(try await awaitDelivery(from: handler), .paste("loaded"))
    }
```

- [ ] **Step 2: Run to verify they fail**

Run: `./scripts/test.sh ActionResultDeliveryTests`
Expected: FAIL — `handleEffect`/`settleLoadingResult` still route `.text` to the handler or swallow it (no card).

- [ ] **Step 3: Route preview in `handleEffect`**

In `Sources/OpenClip/UI/Popup/PopupWindowController.swift`, replace `handleEffect`'s resolution + delivery body (lines 637-650):

```swift
    @discardableResult
    private func handleEffect(_ result: ActionResult, delivery: DeliveryContext?, suppressDeliveryToast: Bool = false) -> Task<Void, Never> {
        let effect = result
        return Task { @MainActor in
            do {
                let resolved = await resolveDelivery(effect, delivery: delivery, suppressDeliveryToast: suppressDeliveryToast)
                if case .text(let text) = resolved.result {
                    // Preview preference: render the returned text in the native AI result card
                    // without delivering any effect. The popup stays open (a top-level `.text` never
                    // dismisses via dismissesPopup); Esc collapses via exitContent. Unknown paste
                    // availability normalizes to cannot-paste (safe default) so the card hides Paste.
                    modeStore.canPaste = modeStore.canPaste ?? false
                    showAIContent(text: text, isError: false, title: delivery?.actionTitle ?? "Action")
                    return
                }
                try await resultHandler.handle(resolved.result, in: panel?.contentView)
                if let toast = resolved.toast, !suppressDeliveryToast {
                    toastController.show(toast, anchorPoint: panel?.centerPoint)
                }
            } catch {
                handleActionResult(.toast(StatusFeedback(error: error)))
            }
        }
    }
```

- [ ] **Step 4: Route preview in `settleLoadingResult`**

Replace the default branch of `settleLoadingResult` (lines 793-806):

```swift
        default:
            let effect = result
            do {
                let resolved = await resolveDelivery(effect, delivery: delivery, suppressDeliveryToast: suppressDeliveryToast)
                if case .text(let text) = resolved.result {
                    // Preview preference on a loading action: the popup early-closed for the spinner,
                    // so hide the spinner and re-show the popup as a content-mode card, anchored to
                    // the original selection (captured before the early close). Re-probe so the card
                    // gates its Paste button on the real answer.
                    toastController.hide()
                    if let selection = delivery.selection {
                        let canPaste = await pasteProbe.canPaste(in: delivery.application, policy: delivery.policy) ?? false
                        show(for: selection, pasteAvailable: canPaste)
                        showAIContent(text: text, isError: false, title: delivery.actionTitle ?? "Action")
                    }
                    return
                }
                try await resultHandler.handle(resolved.result, in: panel?.contentView)
                if let toast = resolved.toast, !suppressDeliveryToast {
                    toastController.swapTo(toast)
                } else if !suppressDeliveryToast {
                    toastController.hide()
                }
            } catch {
                await settleLoadingResult(.toast(StatusFeedback(error: error)), delivery: delivery)
            }
        }
```

- [ ] **Step 5: Run the preview tests**

Run: `./scripts/test.sh ActionResultDeliveryTests`
Expected: PASS (new preview tests + all prior delivery tests).

- [ ] **Step 6: Run the full suite**

Run: `./scripts/test.sh`
Expected: ALL pass. (Manual smoke: select text in an app, run a JS/shell action that returns a string with the picker set to Preview → card shows; Paste/Copy footer works; Esc collapses. Run a `showsLoading` action → card re-shows.)

- [ ] **Step 7: Commit**

```bash
git add Sources/OpenClip/UI/Popup/PopupWindowController.swift Tests/OpenClipTests/ActionResultDeliveryTests.swift
git commit -m "feat(popup): preview implicitly returned text in the AI result card"
```

---

### Task 5: Docs — extension spec + known debt + full verification

**Files:**
- Modify: `docs/developer-guide/AGENTS.md`
- Modify: `docs/architecture/known-debt.md`
- No code changes.

- [ ] **Step 1: Document the `.text` result surface**

In `docs/developer-guide/AGENTS.md`:

- **§3c (line 183)**: `"handler. A non-empty string the script returns becomes \`.paste\`."` → `"handler. A non-empty string the script returns becomes \`.text\` — implicitly returned text, governed by the user's per-click preference (preview / paste / copy, General tab → "When an action returns text"); it pastes by default."`
- **§3d (line 202)**: `"stdout is interpreted per §8 (JSON effects, plain-text paste, or empty-text success)."` → `"stdout is interpreted per §8 (JSON effects, implicitly returned plain text governed by the user's per-click preference, or empty-text success)."`
- **§3e (textsnippet)**: add one line — `"The formatted snippet is \`.text\` — implicitly returned text governed by the user's per-click preference (paste by default)."`
- **§6 JS section (line 631)**: `"single/\`sequence\`; function string return → \`.paste(returnValue)\`; else \`.success\`."` → `"single/\`sequence\`; function string return → \`.text(returnValue)\`; else \`.success\`."` and update line 599 `"A returned non-null string maps to \`.paste\`."` → `"A returned non-null string maps to \`.text\`."`
- **§8 ActionResult table (line 650)**: add a row after `.paste(String)`:

```markdown
| `.text(String)` | implicitly returned text; **not delivered directly** — the user's per-click preference (preview / paste / copy) decides, via the General-tab setting; preview keeps the popup open and renders the AI result card |
```

  and update the §8 Dismissal sentence (line 662-664) to add: `" \`.text\` never auto-dismisses (preview keeps the popup open; paste/copy dismiss via the resolved outcome)."`

- **§5b (lines 393-493)**: after the "Only `.paste` outcomes are ever downgraded" paragraph (line 419), add a paragraph:

```markdown
**Implicit returned text is user-governed.** A runtime that "just returns a string" (JS string
return, AppleScript output, shell plain-text stdout, a text snippet) produces a `.text` result —
a *presentation* result that is not delivered directly. The user's **General-tab setting** ("When an
action returns text") decides, per click: **preview** (render the text in the native AI result card,
popup stays open), **paste** (probe applies as usual), or **copy**. Defaults: primary pastes,
secondary copies — identical to today. The picker never governs explicit outcomes (`openclip.paste`
effects, JSON effects, declared `secondary`, builtins); a declared `secondary` still wins for static
kinds even when the raw result is `.text`.
```

- [ ] **Step 2: Update `known-debt.md`**

In `docs/architecture/known-debt.md`, in the delivery bullet (around line 140-165), append a sentence noting the `.text` surface:

```markdown
Since the configurable-result-delivery change, implicitly returned text emits `ActionResult.text`
(never delivered directly): the controller resolves it against the user's per-click General-tab
preference (`resultDelivery.primary`/`resultDelivery.secondary`), previewing it in the AI result card
or delivering paste/copy (probe still applies). The loading re-show path (`settleLoadingResult`)
re-creates the popup from the pre-early-close selection snapshot to present the card.
```

- [ ] **Step 3: Full verification**

Run: `./scripts/test.sh`
Expected: ALL pass. Also run a debug build to confirm the app compiles with the new General-tab section:

Run: `./scripts/dev_run.sh` (build + launch Debug from DerivedData; confirm the popup and the two new pickers render in Preferences → General).

- [ ] **Step 4: Commit**

```bash
git add docs/developer-guide/AGENTS.md docs/architecture/known-debt.md
git commit -m "docs: document configurable result delivery for implicitly returned text"
```

---

## Self-Review

**Spec coverage:**
- §1 `.text` case + 4 emission sites + defensive arms → Task 1 (arms) + Task 3 (emissions).
- §2 resolver preference + preview/paste/copy mapping + probe → Task 1.
- §3 controller routing (preference snapshot, keep-open, AI card, Esc, Paste gating) → Tasks 3-4.
- §4 SettingKeys + General tab wording → Task 2.
- §5 loading + preview re-show → Task 4.
- Edge cases (explicit wins, declared secondary wins, unknown canPaste → safe default, `.text` in sequence defensive) → Task 1 resolver ordering + Task 4 safe-default normalization.
- Testing bullets → Tasks 1, 3, 4 (resolver/runtimes/controller/settings/delivery).
- Docs → Task 5.

**Placeholder scan:** no TBD/""handle later"" steps; every step carries exact code or an exact file+line edit list.

**Type consistency:** `ResultDeliveryPreference` (raw-value enum) defined in Task 1, used by `resolve(preference:)` (Task 1), `preference(for:)`/`DeliveryContext.preference` (Task 3), the General tab picker tags (Task 2), and tests — all use `ResultDeliveryPreference(rawValue:)` and `.allCases`. `DeliveryContext` gains `preference/actionTitle/selection` once (Task 3) and is consumed by `handleEffect`/`settleLoadingResult` (Task 4). `shouldDismiss(result:preference:)` defined in Task 3, used in `deliverResult`/`runAction`. `pendingActionTitle` added in Task 3, set in `onWillPerformAction`/`runAction`/`runLoadingAction`, cleared in `deliverResult`/`hide()`. Stub actions `TextStubAction`/`SlowTextStubAction` defined in Task 3, used in Tasks 3-4.