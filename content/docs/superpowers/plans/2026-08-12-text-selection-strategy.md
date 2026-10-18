# Text-Selection Strategy v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrieve the user's selection with zero observable side effects — in particular, **never modify the clipboard** unless every non-destructive option is exhausted. For an Electron/Chromium app, the chain must resolve through a read-only path (activated AX tree + role-guided walk + range/marker reads) such that the clipboard's change count never moves.

**Architecture:** Replace the `useMenuCopy` boolean policy with a graduated `SelectionMode` (`.standard` / `.lenient` / `.opaque`) decided by bundle ID, keep `use-menu-copy` decode-compatible in the rules JSON, and rework `MacTextRetriever` into a 5-step, caller-aware fall-through chain. Role sets (`:text-controls:` / `:non-text-roles:`) drive the AX walk by role instead of bundle-ID heuristics. Passive detection (`MacSelectionMonitor`) is hard-gated to the non-destructive steps; manual trigger (`HotkeyManager`) may reach the menu-copy and clipboard-grab fallbacks.

**Tech Stack:** Swift 6 (strict concurrency, `SWIFT_STRICT_CONCURRENCY: complete`), AppKit + ApplicationServices (AXUIElement), XCTest.

## Global Constraints

- Swift 6 with `SWIFT_STRICT_CONCURRENCY: complete`. `MacTextRetriever` is `@unchecked Sendable`; keep the existing `OnceResume`/`TaskBox` deadline pattern (`Constants.axReadTimeout` = 0.5 s) for every new blocking AX read. AX calls must never run on the cooperative pool — keep them in `Task.detached` like `strategyAXDirect` does today.
- **Core is pure.** `Sources/Core/` imports no AppKit/SwiftUI/ApplicationServices. AX role names are plain `String` values (`"AXTextField"` etc.) in Core — no `kAX*Role` constants there. All AXUIElement calls live in `Sources/OpenClip/`.
- **No new `UserDefaults.standard` access** — route through `SettingsStore`/`SettingKey` (not touched by this plan).
- **No `switch action.id`** string matching in presentation (not touched by this plan).
- **No legacy decode-compat shims.** The app has no shipped users, so `AppRule` exposes no `useMenuCopy` field/CodingKey, `RuleEngine` has no `useMenuCopy → lenient` mapping, and `:menu-copy-apps:` is not aliased to `:lenient-select-apps:`. `"selection-mode"` is the only retrieval-policy key. Remove `useMenuCopy` entirely — do not keep it around for hypothetical old rules files.
- New `.swift` file → run `xcodegen generate` (the scripts re-run it automatically).
- Logging via `Log.selection`; never `print()`; add no new log categories.
- Do not weaken the Safari JS path (`strategySafariJS` unchanged). Do not change the watchdog/kill behavior of any subprocess runner.
- **Passive detection never touches the clipboard** (DoD): with a `.lenient` policy and `.passive` trigger, `NSPasteboard.general.changeCount` must not move.
- Menu-copy (step 4) writes the pasteboard, so it requires `.manual` trigger — passive never reaches it. Clipboard grab (step 5) requires `.manual` + `.opaque`.

## File Structure

- **Create (Core):** `Sources/Core/Rules/SelectionMode.swift`, `Sources/Core/Selection/AXRoleClassifier.swift`
- **Create (App):** `Sources/OpenClip/Platform/AXMenuItemMatching.swift`
- **Modify (Core):** `Sources/Core/Rules/AppRule.swift`, `Sources/Core/Rules/RuleEngine.swift`, `Sources/Core/Rules/DefaultAppRules.swift`, `Sources/Core/Selection/TextRetrieving.swift`, `Sources/Core/Selection/Constants.swift`
- **Modify (App):** `Sources/OpenClip/Platform/MacTextRetriever.swift`, `Sources/OpenClip/Platform/MacSelectionMonitor.swift`, `Sources/OpenClip/Platform/HotkeyManager.swift`, `Sources/OpenClip/Platform/PasteAvailabilityProbe.swift`
- **Test:** `Tests/OpenClipTests/RuleEngineTests.swift`, `Tests/OpenClipTests/TextRetrieverTests.swift`, `Tests/OpenClipTests/AXRoleClassifierTests.swift`
- **Docs:** `docs/text-selection.md`, `docs/architecture/known-debt.md`, `docs/logging.md` (only if a new message pattern is worth documenting), `todo.md`

Reference spec: `docs/superpowers/specs/2026-08-12-text-selection-strategy-design.md`.

---

## Task 1: Core policy model — `SelectionMode` replaces `useMenuCopy`

**Files:**
- Create: `Sources/Core/Rules/SelectionMode.swift`
- Modify: `Sources/Core/Rules/AppRule.swift`, `Sources/Core/Rules/RuleEngine.swift`, `Sources/Core/Rules/DefaultAppRules.swift`
- Modify (compile site only): `Sources/OpenClip/Platform/MacTextRetriever.swift` (the `if policy.useMenuCopy` gate at `:35`)
- Test: `Tests/OpenClipTests/RuleEngineTests.swift`

**Interfaces:**
- Produces `public enum SelectionMode: String, Codable, Sendable, CaseIterable` with `case standard, lenient, opaque`.
- `AppPolicyContext` gains `public let selectionMode: SelectionMode` (default `.standard`); `useMenuCopy` is **removed** from the context.
- `AppRule` gains `public let selectionMode: SelectionMode?` with CodingKey `"selection-mode"`. The `useMenuCopy` field and its `"use-menu-copy"` CodingKey are **removed entirely** (no shipped users, no compat shims).

- [ ] **Step 1: Create `SelectionMode.swift`**
```swift
// SelectionMode.swift
// OpenClip
//
// Coarse per-application retrieval policy buckets (Core — no AX imports).
import Foundation

public enum SelectionMode: String, Codable, Sendable, CaseIterable {
    case standard   // steps 1–2 of the retrieval chain
    case lenient    // + step 3 (Chromium read), + step 4 (menu-copy, manual only)
    case opaque     // + step 5 (clipboard grab, manual only)
}
```

- [ ] **Step 2: `AppRule.swift`**
- `AppPolicyContext`: replace `useMenuCopy: Bool` with `selectionMode: SelectionMode` (default `.standard`), update the `default` static and `init`.
- `AppRule`: add `selectionMode: SelectionMode?`; **delete** the `useMenuCopy` field, its `init` parameter, and the `"use-menu-copy"` CodingKey (no compat shims). Both remaining fields pass through `init`.

- [ ] **Step 3: `RuleEngine.resolvePolicies`** — merge `selectionMode: rule.selectionMode ?? context.selectionMode` (no useMenuCopy mapping).
`expandRules` passes the field through unchanged.

- [ ] **Step 4: `DefaultAppRules`**
- Rename `menuCopyApps` → `lenientSelectApps` (same list, PopClip-informed; keep the entries).
- Add `opaqueApps: [String] = ["com.apple.Spotlight", "net.ankiweb.dtop"]`.
- Add role sets (plain `Set<String>` of AX role names, Core-safe):
  ```swift
  public static let textControlRoles: Set<String> = [
      "AXTextField", "AXTextArea", "AXStaticText", "AXComboBox", "AXWebArea"
  ]
  public static let nonTextRoles: Set<String> = [
      "AXButton", "AXCheckBox", "AXRadioButton", "AXSlider",
      "AXMenuItem", "AXCell", "AXDisclosureTriangle", "AXPopUpButton"
  ]
  ```
- Catalog: replace the `:menu-copy-apps:` rule (`useMenuCopy: true`) with `AppRule(bundleIdentifiers: [":lenient-select-apps:"], selectionMode: .lenient)`; add `AppRule(bundleIdentifiers: [":opaque-apps:"], selectionMode: .opaque)`.
- `expandRules`: map `":lenient-select-apps:"` to `lenientSelectApps`, `":opaque-apps:"` to `opaqueApps`. **Do not** keep a `":menu-copy-apps:"` legacy alias.

- [ ] **Step 5: Compile site in `MacTextRetriever.retrieveTextResult`** — change `if policy.useMenuCopy {` to `if policy.selectionMode == .lenient {` (full chain gating lands in Task 5; this keeps the tree compiling and preserves today's behavior).

- [ ] **Step 6: Tests — `RuleEngineTests.swift`**
- Update `testMenuCopyAppsMacroResolvesUseMenuCopy` → assert VSCode/Zed resolve `selectionMode == .lenient`, random app resolves `.standard`.
- Add: `:opaque-apps:` app (`com.apple.Spotlight`) resolves `.opaque`.
- Add: `"selection-mode": "lenient"` in a user-rules JSON → resolves `.lenient` (and `"selection-mode": "opaque"` → `.opaque`).
- `testJSONDecodingWithKebabCase` and `testWildcardMatchingAndResolvePolicies` must stay green.

**Acceptance:** builds; `./scripts/test.sh RuleEngineTests` passes.

---

## Task 2: Retrieval protocol + callers — `SelectionTrigger` wiring

**Files:**
- Modify: `Sources/Core/Selection/TextRetrieving.swift`
- Modify: `Sources/OpenClip/Platform/MacSelectionMonitor.swift`, `Sources/OpenClip/Platform/HotkeyManager.swift`
- Test: `Tests/OpenClipTests/TextRetrieverTests.swift`

**Interfaces:**
- Produces `public enum SelectionTrigger: Sendable { case passive, manual }` in `TextRetrieving.swift`.
- `TextRetrieving` protocol gains `trigger: SelectionTrigger` on `retrieveTextResult`; the default `retrieveText(for:policy:)` extension passes `.manual`.

- [ ] **Step 1: `TextRetrieving.swift`** — add the enum and thread `trigger` through the protocol and the default extension. Keep the existing `retrieveText(for:policy:)` signature by giving it a default `trigger: SelectionTrigger = .manual` parameter.

- [ ] **Step 2: `MacSelectionMonitor.handleMouseUp`** — call `retrieveTextResult(for:policy:trigger: .passive)`.

- [ ] **Step 3: `HotkeyManager`** — call `retrieveTextResult(for:policy:trigger: .manual)` (clipboard fallback block untouched).

- [ ] **Step 4: `MacTextRetriever.retrieveTextResult`** — accept `trigger: SelectionTrigger` and gate the existing menu-copy branch on manual trigger (pulled forward from Task 5 so the Task 2 clipboard test is meaningful):
```swift
if trigger == .manual && policy.selectionMode == .lenient {
    // strategyAXMenuCopy branch (unchanged body)
}
```
Full chain finalization (steps 3/5 additions) still lands in Tasks 4–5.

- [ ] **Step 5: Tests — `TextRetrieverTests.swift`**
- Update `testTextRetrieverRetrievesSelectedText` to the new signature.
- Add `testPassiveLenientNeverTouchesClipboard`: `AppPolicyContext(selectionMode: .lenient)`, trigger `.passive`, no AX selection in the test runner → assert result is nil **and** `NSPasteboard.general.changeCount` is unchanged (guard against future menu-copy/copy-simulation in the passive path).

**Acceptance:** builds; `./scripts/test.sh TextRetrieverTests` passes.

---

## Task 3: Role-guided direct walk — classifier + ancestor walk refactor

**Files:**
- Create: `Sources/Core/Selection/AXRoleClassifier.swift` (pure, no AX imports)
- Modify: `Sources/OpenClip/Platform/MacTextRetriever.swift` (`extractFromAncestors`, `strategyAXDirect` focused/hit-test paths)
- Test: `Tests/OpenClipTests/AXRoleClassifierTests.swift`

- [ ] **Step 1: Create `AXRoleClassifier.swift`** — pure functions over role-name `String`s:
```swift
public enum AXRoleClassifier {
    /// True when the element may own a text selection worth probing.
    public static func isTextControl(role: String?) -> Bool
    /// True when the element is a control that never carries selected text.
    public static func isNonText(role: String?) -> Bool
}
```
Both delegate to `DefaultAppRules.textControlRoles` / `nonTextRoles`; `nil` role → `false` for both.

- [ ] **Step 2: `MacTextRetriever.extractFromAncestors`** — replace the blind depth-4 probe with a role-guided walk: at each ancestor read `kAXRoleAttribute`; **stop and read** at the first ancestor whose role `isTextControl` (or a web area); **skip** ancestors whose role `isNonText`; stop at the window boundary (max 8 levels as a safety cap). Keep reading via the existing `extractTextAndBounds`.

- [ ] **Step 3: `strategyAXDirect`** — before probing the focused element, read its role: if `isNonText`, skip straight to the ancestor walk / hit-test path (a menu item or button must not be probed for selected text).

- [ ] **Step 4: Tests — `AXRoleClassifierTests.swift`** (pure, no live AX): `AXTextFieldRole` name in → `isTextControl` true; `AXButton` in → `isNonText` true; unknown role and `nil` → both false; a role in neither set → both false.

**Acceptance:** builds; `./scripts/test.sh AXRoleClassifierTests` passes; `TextRetrieverTests` stays green (no live-AX dependency in tests).

---

## Task 4: `strategyChromium` + menu-copy cmd-char refactor + shared `AXMenuItemMatching`

**Files:**
- Create: `Sources/OpenClip/Platform/AXMenuItemMatching.swift` (App target)
- Modify: `Sources/OpenClip/Platform/MacTextRetriever.swift`, `Sources/OpenClip/Platform/PasteAvailabilityProbe.swift`
- Test: `Tests/OpenClipTests/TextRetrieverTests.swift` (regression only)

- [ ] **Step 1: Create `AXMenuItemMatching.swift`** — shared, localization-independent menu-item lookup, generalizing the pattern already in `PasteAvailabilityProbe`:
```swift
enum AXMenuItemMatching {
    /// Matches a menu item by Command-key equivalent (kAXMenuItemCmdChar + no Command modifier) or,
    /// when the item publishes no equivalent, by a curated localized-title set.
    static func isMenuItem(title: String?, cmdChar: String?, cmdModifiers: UInt?, matchChar: String, matchTitles: Set<String>) -> Bool
    /// Returns the first menu-bar item in `app` whose item tree yields a match; returns nil when AX is unavailable.
    static func findMenuBarItem(in appElement: AXUIElement, matchChar: String, matchTitles: Set<String>) -> AXUIElement?
    /// Presses a menu item via AXUIElementPerformAction(kAXPressAction).
    static func press(_ item: AXUIElement) -> AXError
}
```
`matchChar` — `"C"` for Copy, `"V"` for Paste. Move `pasteMenuTitles` logic into this type; `PasteAvailabilityProbe` keeps its public `canPaste` API but delegates its walk to `AXMenuItemMatching`.

- [ ] **Step 2: Refactor `strategyAXMenuCopy`** — replace the English "Edit"/"Copy" title walk with `AXMenuItemMatching.findMenuBarItem(appElement:matchChar: "C", matchTitles: copyMenuTitles)` + `press`; keep the `fetchPasteboardText` save/poll/restore wrapper and the 0.15 s deadline. Add a curated `copyMenuTitles` set (en + the same locales as `pasteMenuTitles`).

- [ ] **Step 3: Implement `strategyChromium(for app: AppIdentity) async -> TextResult?`** in `MacTextRetriever`, gated by the `.lenient` mode, mirroring the `strategyAXDirect` deadline pattern:
  - (a) `AXUIElementSetAttributeValue(appElement, kAXManualAccessibilityAttribute, kCFBooleanTrue)` — once per PID; cache the PIDs in a lock-guarded `Set<pid_t>` on the retriever.
  - (b) Role-guided ancestor walk from the focused element to the nearest `textControlRoles` element or `AXWebArea` (reuse the Task 3 walk helpers).
  - (c) Read `kAXSelectedTextRangeAttribute` (a CFRange AXValue), then `AXUIElementCopyParameterizedAttributeValue(element, kAXStringForRangeParameterizedAttribute, range, &text)` — a pure read.
  - (d) If empty, prefer the text-marker model: `kAXSelectedTextMarkerRangeAttribute` → `kAXStringForTextMarkerRangeParameterizedAttribute`.
  - (e) Bounds via `kAXBoundsForRangeParameterizedAttribute` (reuse `extractTextAndBounds` bounds logic).
  - Returns `TextResult?`; never touches the clipboard.

- [ ] **Step 4: Chain insertion** — in `retrieveTextResult`, after `strategySafariJS` and before the menu-copy gate:
```swift
if policy.selectionMode == .lenient {
    if let result = await strategyChromium(for: app) { return result }
}
```

- [ ] **Step 5: Tests** — no live-Electron test in CI (deliberate). Extend `TextRetrieverTests.testPassiveLenientNeverTouchesClipboard` comment to cover that `.passive` + `.lenient` never reaches menu-copy either; keep the existing clipboard-untouched assertions green.

**Acceptance:** builds; `./scripts/test.sh TextRetrieverTests` passes; `PasteAvailabilityProbe` `canPaste` behavior unchanged.

---

## Task 5: `strategyKeyboardGrab` + full chain gating + docs

**Files:**
- Modify: `Sources/Core/Selection/Constants.swift`, `Sources/OpenClip/Platform/MacTextRetriever.swift`
- Modify (docs): `docs/text-selection.md`, `docs/architecture/known-debt.md`, `todo.md`
- Test: `Tests/OpenClipTests/TextRetrieverTests.swift`, `Tests/OpenClipTests/RuleEngineTests.swift`

- [ ] **Step 1: `Constants.swift`** — re-add `public static let cVirtualKey: CGKeyCode = 0x08` (with a comment: Command-C key code, used only by the opaque-apps clipboard grab; never in the default path).

- [ ] **Step 2: `strategyKeyboardGrab(for app: AppIdentity) async -> String?`** — re-add the Cmd+C CGEvent path (muted alert volume while posting, then restore), reusing the existing `fetchPasteboardText` save/poll/restore. Gated to `.opaque` + `.manual`. Post the key down/up via `CGEvent` to the target PID with the Command flag; wrap the system beep suppression as the old `withMutedAlertVolume` helper did.

- [ ] **Step 3: Full chain in `retrieveTextResult`** — final order:
```
1. strategyAXDirect()                      // role-guided walk
2. strategySafariJS(for:)                  // safariGroup only
3. if selectionMode == .lenient → strategyChromium(for:)     // read-only
4. if trigger == .manual && selectionMode == .lenient → strategyAXMenuCopy(for:)
5. if trigger == .manual && selectionMode == .opaque → strategyKeyboardGrab(for:)
→ nil
```
Update the class doc comment to the 5-step chain and the trigger gating.

- [ ] **Step 4: Tests**
- `TextRetrieverTests`: add `testManualOpaqueAllowsKeyboardGrabOnlyForOpaque` is **not** possible without a real grab target — instead add `testManualStandardNeverReachesClipboardGrab`: trigger `.manual`, policy `.standard`, assert clipboard changeCount unchanged (guards step 5 against firing for standard apps). Keep passive tests green.
- `RuleEngineTests`: no change needed beyond Task 1.

- [ ] **Step 5: Docs**
- `docs/architecture/text-selection.md`: rewrite the retrieval-chain section to the 5-step model with mode/trigger gating and the DoD. Note the role-guided walk change (neutral ancestors such as AXGroup/AXScrollArea are no longer probed) and the marker-model bounds:nil UX gap.
- `docs/architecture/known-debt.md`: replace the `strategyAXMenuCopy` concurrency note (line ~140) with the v2 model — passive/manual gating, Chromium read-only resolution, keyboard-grab scope.
- `todo.md`: add a checked item under Phase 1 (or Phase 2) capturing the selection-strategy v2 rollout, referencing the spec.

**Acceptance:** builds; `./scripts/test.sh` full suite green (the known-flaky `CanvasKeyBehaviorTests.testDisabledNodeDoesNotFireOrFocus` focus-timing test may fail in full-suite runs — that is pre-existing and unrelated); docs updated.