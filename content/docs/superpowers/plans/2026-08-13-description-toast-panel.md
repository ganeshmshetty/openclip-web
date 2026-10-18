# Description Toast Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating one-line toast at the cursor that replaces the inline status banner and reports post-action outcomes — "Copied" on paste→copy downgrade, errors, and an opt-in `[spinner] Opening …` loading state for slow actions (Apple Music).

**Architecture:** A new `ToastPanel` (borderless, non-activating `NSPanel`) owned by `ToastPanelController`, rendering a SwiftUI `ToastView` (`[icon | spinner] message`, one line, `PopupThemeModel`-themed). `PopupWindowController` routes every `.showStatus` result and the paste→copy downgrade to the toast; `showsLoading` actions get an early-close flow (hide popup → spinner toast → swap/fade on result). `ActionChrome` + manifest key `"loading"` declare slow actions. The inline banner (`modeStore.statusBanner`, `presentStatus` banner path, `pendingStatus`/`flushPendingStatus`/`startStatusDismissal`, `statusBubbleDurationNanoseconds`) is deleted.

**Tech Stack:** Swift 6 (`SWIFT_STRICT_CONCURRENCY: complete`), AppKit + SwiftUI, XCTest. Targets: Core (pure), OpenClip (app), OpenClipTests.

## Global Constraints

- Core stays pure — no AppKit/SwiftUI imports in `Sources/Core/`. `StatusFeedback` and `ActionChrome` changes are pure Core.
- No direct `UserDefaults.standard` in new code — theme reads in `ToastView` use `@AppStorage(SettingKey.*.name)` like `PopupView`.
- No `switch action.id` string-matching — the loading gate is `action.chrome.showsLoading` (protocol/chrome-driven).
- Subprocess spawning already goes through `ShellProcessRunner`'s shared watchdog; no new process code here.
- Selected text / clipboard content must stay privacy-default in logs; only ids/URLs get `privacy: .public`.
- New `.swift` files are auto-discovered by XcodeGen; the dev/test scripts re-run `xcodegen generate` automatically. Run `./scripts/test.sh` after each task.
- Update `docs/architecture/known-debt.md`, `docs/architecture/popup-window.md`, `docs/architecture/directory-structure.md`, and `docs/logging.md` (if a category changes) when touching those areas.
- Test classes touching app singletons call `TestIsolation.reset()` in `setUp()`.
- Every task ends with a green `./scripts/test.sh <ClassName>` run before moving on.

---

### Task 1: Core — `StatusFeedback.isLoading`

**Files:**
- Modify: `Sources/Core/Actions/StatusFeedback.swift`

**Interfaces:**
- Consumes: nothing new.
- Produces: `StatusFeedback(message:style:symbolName:isLoading:)` — `isLoading: Bool` defaults `false`; `StatusFeedback(error:)` sets `isLoading: false`. Used by Tasks 6, 8, 10.

- [ ] **Step 1: Write the failing test**

Create `Tests/OpenClipTests/StatusFeedbackTests.swift`:

```swift
import XCTest
import Core

final class StatusFeedbackTests: XCTestCase {
    func testDefaultIsLoadingFalse() {
        let feedback = StatusFeedback(message: "Copied", style: .success)
        XCTAssertFalse(feedback.isLoading)
    }

    func testIsLoadingRoundTrips() {
        let feedback = StatusFeedback(message: "Opening…", style: .info, isLoading: true)
        XCTAssertTrue(feedback.isLoading)
    }

    func testErrorFeedbackNotLoading() {
        let feedback = StatusFeedback(error: NSError(domain: "t", code: 1))
        XCTAssertFalse(feedback.isLoading)
        XCTAssertEqual(feedback.style, .error)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh StatusFeedbackTests`
Expected: FAIL — `isLoading` does not exist.

- [ ] **Step 3: Implement**

In `Sources/Core/Actions/StatusFeedback.swift`, add the stored property and extend the memberwise init (keep `isLoading` defaulted last so existing call sites compile unchanged):

```swift
public var message: String
public var style: Style
/// Optional SF Symbol preset name; the app maps a nil value to the style's default token.
public var symbolName: String?
/// True when this status renders a spinner instead of a symbol (loading/opening state).
public var isLoading: Bool

public init(message: String, style: Style, symbolName: String? = nil, isLoading: Bool = false) {
    self.message = message
    self.style = style
    self.symbolName = symbolName
    self.isLoading = isLoading
}
```

`init(error:)` needs no change — `isLoading` defaults to `false` via the memberwise init it delegates to.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh StatusFeedbackTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Actions/StatusFeedback.swift Tests/OpenClipTests/StatusFeedbackTests.swift
git commit -m "feat: add isLoading flag to StatusFeedback"
```

---

### Task 2: Core — `ActionChrome.showsLoading`

**Files:**
- Modify: `Sources/Core/Actions/ActionChrome.swift`
- Test: `Tests/OpenClipTests/ActionChromeTests.swift`

**Interfaces:**
- Consumes: `ActionChrome` existing init.
- Produces: `ActionChrome(..., showsLoading: Bool = false)` — chrome-driven slow-action flag read by Tasks 4, 8, 10.

- [ ] **Step 1: Write the failing test**

Append to `Tests/OpenClipTests/ActionChromeTests.swift`:

```swift
func testShowsLoadingDefaultsFalse() {
    let plain = CustomAction(id: "custom.plain", title: "Plain", iconName: "star", type: .textSnippet(template: "P"))
    XCTAssertFalse(plain.chrome.showsLoading)
}

func testShowsLoadingRoundTrips() {
    let chrome = ActionChrome(source: .builtin, showsLoading: true)
    XCTAssertTrue(chrome.showsLoading)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh ActionChromeTests`
Expected: FAIL — `showsLoading` does not exist.

- [ ] **Step 3: Implement**

In `Sources/Core/Actions/ActionChrome.swift`:

```swift
/// True when the action is slow (e.g. an AppleScript that activates an app) and the popup
/// should close immediately on click with a spinner toast until the result lands.
public let showsLoading: Bool
```

Add `showsLoading: Bool = false` to the memberwise init (last parameter, defaulted) and assign `self.showsLoading = showsLoading`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh ActionChromeTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Actions/ActionChrome.swift Tests/OpenClipTests/ActionChromeTests.swift
git commit -m "feat: add showsLoading flag to ActionChrome"
```

---

### Task 3: Core — manifest `"loading"` key

**Files:**
- Modify: `Sources/Core/Extensions/Manifest/ExtensionManifest.swift`

**Interfaces:**
- Consumes: `ExtensionActionMetadata` existing Codable shape.
- Produces: `ExtensionActionMetadata.loading: Bool?` decoded from JSON key `"loading"`. Consumed by Task 4.

- [ ] **Step 1: Write the failing test**

Append to `Tests/OpenClipTests/ExtensionManifestTests.swift` (read the file first to match its assertion helpers):

```swift
func testActionDecodesLoadingKey() throws {
    let json = """
    {
      "identifier": "com.test.music",
      "name": "Music",
      "action": {
        "title": "Music",
        "type": "applescript",
        "script": "main.applescript",
        "loading": true
      }
    }
    """
    let data = Data(json.utf8)
    let manifest = try JSONDecoder().decode(ExtensionMetadata.self, from: data)
    XCTAssertEqual(manifest.actions.first?.loading, true)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh ExtensionManifestTests`
Expected: FAIL — `loading` not decoded (nil).

- [ ] **Step 3: Implement**

In `Sources/Core/Extensions/Manifest/ExtensionManifest.swift`, for `ExtensionActionMetadata`:
1. Add `public let loading: Bool?` near `menuRelevance` (line 28).
2. Add `loading: Bool? = nil` parameter to the memberwise init and assign `self.loading = loading`.
3. Decode in `init(from:)`: `self.loading = try container.decodeIfPresent(Bool.self, forKey: .loading)`.
4. Encode in `encode(to:)`: `try container.encodeIfPresent(loading, forKey: .loading)`.
5. Add `case loading = "loading"` to `CodingKeys`.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh ExtensionManifestTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Extensions/Manifest/ExtensionManifest.swift Tests/OpenClipTests/ExtensionManifestTests.swift
git commit -m "feat: decode manifest loading key"
```

---

### Task 4: App — map `loading` → `ActionChrome.showsLoading` in the factory

**Files:**
- Modify: `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift`
- Test: `Tests/OpenClipTests/DefaultActionFactoryTests.swift`

**Interfaces:**
- Consumes: `ExtensionActionMetadata.loading` (Task 3), `ActionChrome.showsLoading` (Task 2).
- Produces: extension actions whose `chrome.showsLoading` reflects the manifest. Consumed by Tasks 8, 10.

- [ ] **Step 1: Write the failing test**

Append to `Tests/OpenClipTests/DefaultActionFactoryTests.swift`:

```swift
func testFactoryMapsLoadingFlagOntoChrome() async {
    let factory = DefaultActionFactory()
    let loadingMeta = ExtensionActionMetadata(title: "Loading", icon: "symbol:play", script: "test.applescript", type: "applescript", loading: true)
    let plainMeta = ExtensionActionMetadata(title: "Plain", icon: "symbol:play", script: "test2.applescript", type: "applescript")
    let manifest = ExtensionMetadata(identifier: "com.test.loading", name: "Loading Test", actions: [loadingMeta, plainMeta], options: nil)

    let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    try? "return \"hi\"".write(to: tempDir.appendingPathComponent("test.applescript"), atomically: true, encoding: .utf8)
    try? "return \"hi\"".write(to: tempDir.appendingPathComponent("test2.applescript"), atomically: true, encoding: .utf8)

    guard let loading = await factory.createAction(metadata: loadingMeta, manifest: manifest, directoryURL: tempDir, index: 0) as? AppleScriptAction else {
        try? FileManager.default.removeItem(at: tempDir)
        return XCTFail("Expected AppleScriptAction")
    }
    XCTAssertTrue(loading.chrome.showsLoading)

    guard let plain = await factory.createAction(metadata: plainMeta, manifest: manifest, directoryURL: tempDir, index: 1) as? AppleScriptAction else {
        try? FileManager.default.removeItem(at: tempDir)
        return XCTFail("Expected AppleScriptAction")
    }
    XCTAssertFalse(plain.chrome.showsLoading)

    try? FileManager.default.removeItem(at: tempDir)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh DefaultActionFactoryTests`
Expected: FAIL — `showsLoading` is false.

- [ ] **Step 3: Implement**

In `DefaultActionFactory.makeAction`, the shared `extensionChrome` is built once (line 202) and reused by every runtime branch — set the flag there so all kinds (applescript, script, js, url, …) honor it:

```swift
let extensionChrome = ActionChrome(
    badge: .extensionPkg(manifest.name),
    rowStyle: .standard,
    popupBehavior: .perform,
    source: .extensionPkg(packageID: manifest.identifier),
    showsLoading: metadata.loading ?? false
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh DefaultActionFactoryTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift Tests/OpenClipTests/DefaultActionFactoryTests.swift
git commit -m "feat: map manifest loading flag onto action chrome"
```

---

### Task 5: App — `PopupMetrics.toastDurationNanoseconds`

**Files:**
- Modify: `Sources/OpenClip/UI/Popup/PopupMetrics.swift`
- Test: `Tests/OpenClipTests/PopupPanelTests.swift`

**Interfaces:**
- Consumes: nothing.
- Produces: `PopupMetrics.toastDurationNanoseconds: UInt64 = 500_000_000` (0.5 s). Consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Append to `Tests/OpenClipTests/PopupPanelTests.swift` (inside `testPopupMetricsConstants` or a new test):

```swift
func testToastDurationConstant() {
    XCTAssertEqual(PopupMetrics.toastDurationNanoseconds, 500_000_000)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh PopupPanelTests`
Expected: FAIL — constant missing.

- [ ] **Step 3: Implement**

Append to `Sources/OpenClip/UI/Popup/PopupMetrics.swift`:

```swift
/// How long an info/error toast stays up before auto-dismissing (0.5 s). Loading toasts have
/// no timer — they live until the action's result lands.
public static let toastDurationNanoseconds: UInt64 = 500_000_000
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh PopupPanelTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/UI/Popup/PopupMetrics.swift Tests/OpenClipTests/PopupPanelTests.swift
git commit -m "feat: add toast auto-dismiss duration metric"
```

---

### Task 6: App — `ToastView`

**Files:**
- Create: `Sources/OpenClip/UI/Popup/ToastView.swift`
- Test: `Tests/OpenClipTests/PopupPanelTests.swift` (fitting-size sentinel, mirroring `testAICardFittingSizeIncludesResponseBody`)

**Interfaces:**
- Consumes: `StatusFeedback.isLoading` (Task 1), `SettingKey.popupTheme`/`popupThemeColor`, `PopupThemeModel`.
- Produces: `ToastView(feedback:)` — SwiftUI one-liner `[spinner | icon] message`, `.lineLimit(1)`. Consumed by Task 8.

- [ ] **Step 1: Write the failing test**

Append to `Tests/OpenClipTests/PopupPanelTests.swift`:

```swift
func testToastFittingSizeIsOneLine() throws {
    let toast = ToastView(feedback: StatusFeedback(message: "Copied to clipboard", style: .success, symbolName: "checkmark"))
    let host = NSHostingView(rootView: toast)
    host.layoutSubtreeIfNeeded()
    let fit = host.fittingSize
    XCTAssertGreaterThan(fit.width, 80, "toast collapsed to zero width")
    XCTAssertLessThan(fit.height, 60, "toast should be a single compact line")
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh PopupPanelTests`
Expected: FAIL — `ToastView` does not exist.

- [ ] **Step 3: Implement**

Create `Sources/OpenClip/UI/Popup/ToastView.swift`:

```swift
// ToastView.swift
// OpenClip
//
// The one-line floating toast rendered by ToastPanelController: `[spinner | icon] message`,
// capped to a single line and themed through PopupThemeModel so it matches the bar.
import SwiftUI
import Core

struct ToastView: View {
    let feedback: StatusFeedback

    @AppStorage(SettingKey.popupTheme.name) private var selectedTheme: String = SettingKey.popupTheme.defaultValue
    @AppStorage(SettingKey.popupThemeColor.name) private var themeColor: String = SettingKey.popupThemeColor.defaultValue
    @Environment(\.colorScheme) private var colorScheme

    private var themeCategory: PopupThemeModel.Category {
        PopupThemeModel.category(fromStored: selectedTheme)
    }

    private var effectiveTheme: String {
        if themeCategory == .glass { return "glass" }
        return PopupThemeModel.classicToken(appearance: themeColor, systemIsDark: colorScheme == .dark)
    }

    private var bubbleFill: Color {
        switch effectiveTheme {
        case "light": return Color(red: 0.91, green: 0.91, blue: 0.93)
        case "dark": return Color(red: 0.20, green: 0.20, blue: 0.22)
        default: return Color(red: 0.15, green: 0.15, blue: 0.18)
        }
    }

    private var bubbleBorder: Color {
        effectiveTheme == "light" ? Color.black.opacity(0.20) : Color.white.opacity(0.22)
    }

    private var textColor: Color {
        switch feedback.style {
        case .success: return .green
        case .error: return .red
        case .info: return PopupThemeModel.restForeground(for: effectiveTheme)
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            if feedback.isLoading {
                ProgressView()
                    .controlSize(.small)
            } else if let symbol = feedback.symbolName {
                Image(systemName: symbol)
                    .font(.system(size: 10, weight: .semibold))
            }
            Text(feedback.message)
                .font(.system(size: 11, weight: .semibold))
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .foregroundColor(textColor)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(bubbleFill)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .stroke(bubbleBorder, lineWidth: 1)
        )
        .shadow(color: .black.opacity(effectiveTheme == "light" ? 0.16 : 0.32), radius: 6, x: 0, y: 3)
        .environment(\.colorScheme, PopupThemeModel.effectiveScheme(appearance: themeColor, systemIsDark: colorScheme == .dark))
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh PopupPanelTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/UI/Popup/ToastView.swift Tests/OpenClipTests/PopupPanelTests.swift
git commit -m "feat: add one-line themed toast view"
```

---

### Task 7: App — `ToastPanel` + `ToastPanelController`

**Files:**
- Create: `Sources/OpenClip/UI/Popup/ToastPanel.swift`
- Create: `Sources/OpenClip/UI/Popup/ToastPanelController.swift`
- Test: `Tests/OpenClipTests/ToastPanelControllerTests.swift`

**Interfaces:**
- Consumes: `ToastView` (Task 6), `PopupMetrics.toastDurationNanoseconds` (Task 5), `StatusFeedback` (Task 1).
- Produces:
  - `ToastPanel` — non-key, borderless, floating `NSPanel` subclass.
  - `ToastPanelController` — `@MainActor` class with:
    - `init(panel: ToastPanel = ToastPanel(), autoDismissNanoseconds: UInt64 = PopupMetrics.toastDurationNanoseconds)`
    - `func show(_ feedback: StatusFeedback)` — replaces current content, places at cursor, starts auto-dismiss (unless `.isLoading`).
    - `func showLoading(message: String)`
    - `func swapTo(_ feedback: StatusFeedback)`
    - `func hide()`
    - `public private(set) var currentFeedback: StatusFeedback?`
    - `public private(set) var isLoading: Bool`
    - `public var isShowing: Bool { panel.isVisible }`
  - Consumed by Tasks 8, 10.

- [ ] **Step 1: Write the failing test**

Create `Tests/OpenClipTests/ToastPanelControllerTests.swift`:

```swift
import XCTest
import AppKit
import Core
@testable import OpenClip

@MainActor
final class ToastPanelControllerTests: XCTestCase {
    override func setUp() async throws {
        try await super.setUp()
        try XCTSkipUnless(NSScreen.main != nil, "no screen")
    }

    func testShowPresentsFeedbackAndShows() {
        let controller = ToastPanelController(autoDismissNanoseconds: 100_000_000)
        controller.show(StatusFeedback(message: "Copied", style: .success, symbolName: "checkmark"))
        XCTAssertTrue(controller.isShowing)
        XCTAssertEqual(controller.currentFeedback?.message, "Copied")
        XCTAssertFalse(controller.isLoading)
        controller.hide()
    }

    func testShowLoadingFlag() {
        let controller = ToastPanelController()
        controller.showLoading(message: "Opening Apple Music…")
        XCTAssertTrue(controller.isShowing)
        XCTAssertTrue(controller.isLoading)
        controller.hide()
    }

    func testSwapToReplacesContent() {
        let controller = ToastPanelController()
        controller.showLoading(message: "Opening…")
        controller.swapTo(StatusFeedback(message: "Done", style: .info))
        XCTAssertEqual(controller.currentFeedback?.message, "Done")
        XCTAssertFalse(controller.isLoading)
        controller.hide()
    }

    func testAutoDismissAfterDuration() async throws {
        let controller = ToastPanelController(autoDismissNanoseconds: 20_000_000)
        controller.show(StatusFeedback(message: "Copied", style: .success))
        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertFalse(controller.isShowing, "info toast should auto-dismiss")
    }

    func testLoadingToastHasNoTimer() async throws {
        let controller = ToastPanelController(autoDismissNanoseconds: 20_000_000)
        controller.showLoading(message: "Opening…")
        try await Task.sleep(nanoseconds: 150_000_000)
        XCTAssertTrue(controller.isShowing, "loading toast must not auto-dismiss")
        controller.hide()
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh ToastPanelControllerTests`
Expected: FAIL — `ToastPanelController` does not exist.

- [ ] **Step 3: Implement**

Create `Sources/OpenClip/UI/Popup/ToastPanel.swift`:

```swift
// ToastPanel.swift
// OpenClip
//
// The non-key floating panel behind the description toast. Mirrors PopupPanel conventions:
// borderless, non-activating, floating level, never key, SwiftUI-drawn shadow.
import AppKit

@MainActor
public final class ToastPanel: NSPanel {
    public init() {
        super.init(
            contentRect: .zero,
            styleMask: [.nonactivatingPanel, .borderless, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        self.level = .floating
        self.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        self.backgroundColor = .clear
        self.isOpaque = false
        self.hasShadow = false
        self.isMovable = false
        self.hidesOnDeactivate = false
    }

    public override var canBecomeKey: Bool { false }
    public override var canBecomeMain: Bool { false }
}
```

Create `Sources/OpenClip/UI/Popup/ToastPanelController.swift`:

```swift
// ToastPanelController.swift
// OpenClip
//
// Owns the ToastPanel + its NSHostingView(ToastView) and the auto-dismiss timer. The single
// status surface: replaces the removed inline banner. Info/error toasts auto-dismiss after
// `autoDismissNanoseconds`; loading toasts have no timer and are cleared via swapTo/hide.
import AppKit
import SwiftUI
import Core

@MainActor
public final class ToastPanelController {
    public private(set) var currentFeedback: StatusFeedback?
    public private(set) var isLoading = false
    public var isShowing: Bool { panel.isVisible }

    private let panel: ToastPanel
    private let autoDismissNanoseconds: UInt64
    private var dismissTask: Task<Void, Never>?
    private let hostingView: NSHostingView<ToastView>

    public init(panel: ToastPanel = ToastPanel(),
                autoDismissNanoseconds: UInt64 = PopupMetrics.toastDurationNanoseconds) {
        self.panel = panel
        self.autoDismissNanoseconds = autoDismissNanoseconds
        let view = NSHostingView(rootView: ToastView(feedback: StatusFeedback(message: "", style: .info)))
        view.sizingOptions = [.preferredContentSize]
        self.hostingView = view
        self.panel.contentView = view
    }

    /// Shows (or replaces) a toast at the cursor. Info/error start auto-dismiss; loading does not.
    public func show(_ feedback: StatusFeedback) {
        dismissTask?.cancel()
        dismissTask = nil
        currentFeedback = feedback
        isLoading = feedback.isLoading
        hostingView.rootView = ToastView(feedback: feedback)
        placeAtCursor(hostingView.fittingSize)
        panel.orderFrontRegardless()
        if !feedback.isLoading {
            startDismissal()
        }
    }

    public func showLoading(message: String) {
        show(StatusFeedback(message: message, style: .info, isLoading: true))
    }

    /// Replaces a loading toast with a settled status (and starts its auto-dismiss).
    public func swapTo(_ feedback: StatusFeedback) {
        show(feedback)
    }

    public func hide() {
        dismissTask?.cancel()
        dismissTask = nil
        currentFeedback = nil
        isLoading = false
        panel.orderOut(nil)
    }

    private func startDismissal() {
        dismissTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: autoDismissNanoseconds)
            guard !Task.isCancelled else { return }
            self.hide()
        }
    }

    /// Centers the toast on the current mouse location (screen coords), clamped to the visible frame.
    private func placeAtCursor(_ size: CGSize) {
        let mouse = NSEvent.mouseLocation
        var origin = CGPoint(x: mouse.x - size.width / 2, y: mouse.y - size.height / 2)
        if let screen = NSScreen.screens.first(where: { $0.frame.contains(mouse) }) ?? NSScreen.main {
            let vf = screen.visibleFrame
            origin.x = min(max(origin.x, vf.minX), vf.maxX - size.width)
            origin.y = min(max(origin.y, vf.minY), vf.maxY - size.height)
        }
        panel.setFrame(NSRect(origin: origin, size: size), display: true)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh ToastPanelControllerTests`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/UI/Popup/ToastPanel.swift Sources/OpenClip/UI/Popup/ToastPanelController.swift Tests/OpenClipTests/ToastPanelControllerTests.swift
git commit -m "feat: add toast panel and controller"
```

---

### Task 8: App — Wire the toast into `PopupWindowController` and delete the inline banner

**Files:**
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Modify: `Sources/OpenClip/UI/Popup/PopupModeStore.swift`
- Modify: `Sources/OpenClip/UI/Popup/PopupView.swift`
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift`, `Tests/OpenClipTests/PopupModeStoreTests.swift`

**Interfaces:**
- Consumes: `ToastPanelController` (Task 7), `PopupMetrics.toastDurationNanoseconds` (Task 5).
- Produces:
  - `PopupWindowController.init(resultHandler:pasteProbe:toastController:)` (new param, defaulted).
  - Trigger 1: `.paste` → `.copy` downgrade shows "Copied" toast (in `handleEffect`).
  - Trigger 2: every `.showStatus` → `presentStatus` → `toastController.show`.
  - Deleted: `modeStore.statusBanner`, `PopupView.statusBannerView`, `pendingStatus`, `flushPendingStatus()`, `startStatusDismissal()`, `statusDismissTask`, `statusBubbleDurationNanoseconds`.

- [ ] **Step 1: Write the failing tests**

**a)** Update `Tests/OpenClipTests/PopupModeStoreTests.swift` — remove the two `statusBanner` references (`testStoreDefaults` asserts `XCTAssertNil(store.statusBanner)`; `testStatusBannerPublishes` is deleted).

**b)** Append to `Tests/OpenClipTests/ActionResultDeliveryTests.swift` a toast-aware recording controller test. Extend the file's `RecordingHandler` to also record toasts via an injected `ToastPanelController` and add a helper to build a controller with one. Add:

```swift
@MainActor
func testDowngradeToCopyShowsCopiedToast() async throws {
    let handler = RecordingHandler()
    let toast = ToastPanelController(autoDismissNanoseconds: 100_000_000)
    let controller = try shownController(resultHandler: handler,
                                         pasteProbe: FixedProbe(result: false),
                                         appPolicy: .default,
                                         toastController: toast)
    defer { controller.hide(); toast.hide() }

    controller.deliverResult(.paste("hello"))

    _ = try await awaitDelivery(from: handler)
    XCTAssertEqual(toast.currentFeedback?.message, "Copied")
    XCTAssertEqual(toast.currentFeedback?.style, .success)
}

@MainActor
func testNativeCopyShowsNoToast() async throws {
    let handler = RecordingHandler()
    let toast = ToastPanelController(autoDismissNanoseconds: 100_000_000)
    let controller = try shownController(resultHandler: handler,
                                         pasteProbe: FixedProbe(result: true),
                                         appPolicy: .default,
                                         toastController: toast)
    defer { controller.hide(); toast.hide() }

    controller.deliverResult(.copy("hello"))

    _ = try await awaitDelivery(from: handler)
    XCTAssertNil(toast.currentFeedback, "native copy must not show the Copied toast")
}

@MainActor
func testShowStatusRoutesToToast() async throws {
    let toast = ToastPanelController()
    let controller = PopupWindowController(toastController: toast)
    controller.handleActionResult(.showStatus(StatusFeedback(message: "hello", style: .info)))
    XCTAssertEqual(toast.currentFeedback?.message, "hello")
    toast.hide()
}
```

Update `shownController` to accept `toastController: ToastPanelController = ToastPanelController()` and pass it through:

```swift
let controller = PopupWindowController(resultHandler: resultHandler,
                                       pasteProbe: pasteProbe,
                                       toastController: toastController)
```

Note: `testShowStatusRoutesToToast` calls `handleActionResult` without showing a popup — fine, the toast is independent. Ensure the existing controller tests still compile (init param defaulted).

- [ ] **Step 2: Run tests to verify they fail**

Run: `./scripts/test.sh PopupModeStoreTests` and `./scripts/test.sh ActionResultDeliveryTests`
Expected: FAIL — `statusBanner` still exists; `toastController` init param missing; no Copied toast.

- [ ] **Step 3: Implement**

**a) `PopupModeStore.swift`** — delete the `statusBanner` property (line 29) and its doc comment.

**b) `PopupView.swift`** — delete `statusBannerView(_:)` (lines 326-340), `statusColor(for:)` (lines 342-348), and the banner branch in `barStack` (lines 318-321). `barStack` becomes:

```swift
@ViewBuilder
private var barStack: some View {
    unifiedHStack
}
```

**c) `PopupWindowController.swift`**:

1. Replace the status-banner state with the toast controller. Delete `statusDismissTask` (line 36), `statusBubbleDurationNanoseconds` (line 38), `pendingStatus` (line 42).

2. Add the injected toast:

```swift
private let toastController: ToastPanelController

public init(resultHandler: ActionResultHandler = DefaultActionResultHandler(),
            pasteProbe: PasteAvailabilityProbing = PasteAvailabilityProbe(),
            toastController: ToastPanelController = ToastPanelController()) {
    self.resultHandler = resultHandler
    self.pasteProbe = pasteProbe
    self.toastController = toastController
}
```

3. `hide()` (line 363): delete the banner clearing — `statusDismissTask?.cancel()`, `statusDismissTask = nil`, `pendingStatus = nil`, `modeStore.statusBanner = nil`. (The toast must survive popup hide; `hide()` does not touch `toastController`.)

4. `exitContent()` (line 291): delete the `flushPendingStatus()` call.

5. Replace `presentStatus` (lines 667-678), `flushPendingStatus` (682-688), `startStatusDismissal` (691-697) with:

```swift
/// Surfaces a StatusFeedback as the floating toast (the single status renderer). The toast
/// is independent of the popup, so it shows whether the popup stays up or has already hidden.
private func presentStatus(_ feedback: StatusFeedback) {
    toastController.show(feedback)
}
```

6. Trigger 1 in `handleEffect` (line 594): after `resolveDelivery`, before `resultHandler.handle`, detect the downgrade:

```swift
let delivered = await resolveDelivery(effect, delivery: delivery)
if case .paste = effect, case .copy = delivered {
    toastController.show(StatusFeedback(message: "Copied", style: .success, symbolName: "checkmark"))
}
try await resultHandler.handle(delivered, in: panel?.contentView)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh PopupModeStoreTests`, `./scripts/test.sh ActionResultDeliveryTests`, `./scripts/test.sh PopupPanelTests`
Expected: PASS. Then run the full suite `./scripts/test.sh` to catch other `statusBanner`/init usages.

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/UI/Popup/PopupWindowController.swift Sources/OpenClip/UI/Popup/PopupModeStore.swift Sources/OpenClip/UI/Popup/PopupView.swift Tests/OpenClipTests/ActionResultDeliveryTests.swift Tests/OpenClipTests/PopupModeStoreTests.swift
git commit -m "feat: replace inline status banner with floating toast"
```

---

### Task 9: App — Loading (slow-action) early-close flow

**Files:**
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Modify: `Sources/OpenClip/UI/Popup/PopupView.swift`
- Modify: `Sources/OpenClip/UI/Popup/PopupSearchView.swift`
- Test: `Tests/OpenClipTests/ActionResultDeliveryTests.swift` (controller-level loading routing)

**Interfaces:**
- Consumes: `ActionChrome.showsLoading` (Task 2), `ToastPanelController.showLoading/swapTo/hide` (Task 7).
- Produces: `runLoadingAction(_:with:forceCopy:)` on `PopupWindowController`; `onRunLoadingAction` callback plumbed through `PopupView`/`PopupSearchView`.

- [ ] **Step 1: Write the failing test**

Append to `Tests/OpenClipTests/ActionResultDeliveryTests.swift` a recording `Action` stub whose `perform` resolves after a short delay and returns `.success` (result without a description), plus a test that the loading path hides the popup, shows the spinner, and fades on `.success`:

```swift
private final class SlowStubAction: Action {
    let id = "stub.slow"
    let title = "Slow"
    var chrome: ActionChrome { ActionChrome(source: .builtin, showsLoading: true) }
    func isEnabled(for context: ActionContext) -> Bool { true }
    func matchInfo(for context: ActionContext) -> ActionMatchInfo? { nil }
    func perform(_ context: ActionContext) async throws -> ActionResult {
        try await Task.sleep(nanoseconds: 30_000_000)
        return .success
    }
}
```

(Add `Action` conformance helpers if the protocol requires them — check `Sources/Core/Actions/Action.swift` and mirror an existing test stub.) Then:

```swift
@MainActor
func testLoadingActionShowsSpinnerThenFades() async throws {
    let handler = RecordingHandler()
    let toast = ToastPanelController(autoDismissNanoseconds: 100_000_000)
    let controller = try shownController(resultHandler: handler,
                                         pasteProbe: FixedProbe(result: true),
                                         appPolicy: .default,
                                         toastController: toast)
    defer { controller.hide(); toast.hide() }

    controller.runLoadingAction(SlowStubAction(), with: controllerCurrentContext(controller), forceCopy: false)
    XCTAssertTrue(toast.isLoading, "spinner should be visible immediately")
    try await Task.sleep(nanoseconds: 150_000_000)
    XCTAssertFalse(toast.isLoading, "loading toast should fade once a description-free result lands")
}
```

Provide a small helper that reads the controller's live context for the stub (mirror the context used in `shownController`):

```swift
@MainActor
private func controllerCurrentContext(_ controller: PopupWindowController) -> ActionContext {
    let context = SelectionContext(
        text: "hello",
        sourceApp: AppIdentity(bundleIdentifier: "com.test", localizedName: "Test"),
        cursorPosition: CGPoint(x: 300, y: 300),
        timestamp: Date(),
        appPolicy: .default
    )
    return ActionContext(selection: context, modifiers: [])
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh ActionResultDeliveryTests`
Expected: FAIL — `runLoadingAction` does not exist.

- [ ] **Step 3: Implement**

**a) `PopupWindowController.swift`** — add the loading lifecycle. Mirror `runAction`'s delivery snapshot (taken before the early `hide()` clears live state):

```swift
/// Performs a `showsLoading` action with early-close: the popup hides immediately, a spinner
/// toast appears at the cursor, and the result settles the toast (swap to description, or fade
/// when the result carries none). Mirrors runAction's delivery snapshot: captured before the
/// early hide so paste-vs-copy still sees the pre-dismissal context.
func runLoadingAction(_ action: any Action, with context: ActionContext, forceCopy: Bool) {
    let clickIntent: ActionResultDelivery.ClickIntent = forceCopy ? .forceCopy : .leftClick
    pendingClickIntent = clickIntent
    let delivery = DeliveryContext(
        policy: context.selection.appPolicy,
        clickIntent: clickIntent,
        application: NSWorkspace.shared.frontmostApplication
    )
    usageStore.record(action.id)
    let match = action.matchInfo(for: context)
    let performContext = match.map {
        ActionContext(selection: context.selection, modifiers: context.modifiers, match: $0)
    } ?? context
    hide()
    toastController.showLoading(message: "Opening \(action.title)…")
    Task { @MainActor in
        do {
            let result = try await action.perform(performContext)
            await settleLoadingResult(result, delivery: delivery)
        } catch {
            Log.presentation.error("Action failed (id \(action.id, privacy: .public)): \(error.localizedDescription)")
            await settleLoadingResult(.showStatus(StatusFeedback(error: error)), delivery: delivery)
        }
    }
}

/// Resolves a loading action's result into the toast: `.showStatus` swaps to that status,
/// a paste→copy downgrade swaps to "Copied", a leaf with an effect that delivers swaps to
/// "Copied" on downgrade, and everything else (`.success`, `.openURL`, honored paste, native
/// copy) fades the spinner.
private func settleLoadingResult(_ result: ActionResult, delivery: DeliveryContext) async {
    switch result {
    case .showStatus(let feedback):
        toastController.show(feedback)
    case .openConfiguration(let request):
        presentConfiguration(for: request)
    case .keepVisible(let inner):
        await settleLoadingResult(inner, delivery: delivery)
    case .sequence(let items):
        for item in items { await settleLoadingResult(item, delivery: delivery) }
    default:
        guard let effect = result.effectForHandler else {
            toastController.hide()
            return
        }
        do {
            let delivered = await resolveDelivery(effect, delivery: delivery)
            if case .paste = effect, case .copy = delivered {
                toastController.swapTo(StatusFeedback(message: "Copied", style: .success, symbolName: "checkmark"))
            } else {
                try await resultHandler.handle(delivered, in: panel?.contentView)
                toastController.hide()
            }
        } catch {
            await settleLoadingResult(.showStatus(StatusFeedback(error: error)), delivery: delivery)
        }
    }
}
```

**b) Route the right-click path** — at the top of `runAction` (line 635):

```swift
if action.chrome.showsLoading {
    runLoadingAction(action, with: context, forceCopy: forceCopy)
    return
}
```

**c) `PopupView.swift`** — add the `onRunLoadingAction` callback (init parameter + stored property, default `nil`), and in the `.perform` bar-button branch (non-AI), before the existing `Task`, gate on chrome:

```swift
Button {
    if action.chrome.showsLoading {
        onRunLoadingAction?(action)
        return
    }
    Task { /* existing perform body */ }
}
```

**d) `PopupSearchView.swift`** — add the same `onRunLoadingAction` callback (default `nil`), and in the row perform path (before the `Task`, after the AI-preset branch), gate:

```swift
if action.chrome.showsLoading {
    onRunLoadingAction?(action)
    return
}
```

**e) Wire the callback in `PopupWindowController.show(for:)`** — pass to `PopupView`:

```swift
onRunLoadingAction: { [weak self] action in
    guard let self, let context = self.currentActionContext else { return }
    self.runLoadingAction(action, with: context, forceCopy: false)
},
```

And pass it through the `PopupSearchView` construction in `PopupView.searchContent`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh ActionResultDeliveryTests`, then the full suite `./scripts/test.sh`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/UI/Popup/PopupWindowController.swift Sources/OpenClip/UI/Popup/PopupView.swift Sources/OpenClip/UI/Popup/PopupSearchView.swift Tests/OpenClipTests/ActionResultDeliveryTests.swift
git commit -m "feat: early-close loading toast for slow actions"
```

---

### Task 10: Apple Music — declare the loading flag

**Files:**
- Modify: `Extensions/raw/AppleMusic.openclipext/openclip.json`

**Interfaces:**
- Consumes: manifest `"loading"` key (Task 3).

- [ ] **Step 1: Edit the manifest**

In `Extensions/raw/AppleMusic.openclipext/openclip.json`, add `"loading": true` to the `action` object:

```json
{
  "identifier": "com.openclip.applemusic",
  "name": "Apple Music",
  "version": "1.0.1",
  "author": "OpenClip Team",
  "description": "Search Apple Music for the selected text.",
  "category": "search",
  "action": {
    "title": "Apple Music",
    "icon": "music.note",
    "type": "applescript",
    "script": "main.applescript",
    "loading": true
  }
}
```

- [ ] **Step 2: Validate the manifest**

Run: `./scripts/validate_extension.sh Extensions/raw/AppleMusic.openclipext`
Expected: no `loading`-related rejection (unknown keys are ignored by validation; the loader decodes it).

- [ ] **Step 3: Commit**

```bash
git add Extensions/raw/AppleMusic.openclipext/openclip.json
git commit -m "feat: declare Apple Music action as loading"
```

---

### Task 11: Docs — dev-guide manifest spec, architecture docs, known-debt

**Files:**
- Modify: `docs/developer-guide/AGENTS.md`
- Modify: `docs/architecture/popup-window.md`
- Modify: `docs/architecture/known-debt.md`
- Modify: `docs/architecture/directory-structure.md`

**Interfaces:**
- Consumes: the final state from Tasks 1-10.

- [ ] **Step 1: Dev-guide manifest spec**

In `docs/developer-guide/AGENTS.md`:
- Add `"loading": true` to the "Common action fields" JSONC example (line ~97-109) with a `// see §5d` comment.
- Add a short `### 5d. loading (slow actions)` subsection after §5c explaining: `loading: true` closes the popup immediately on click, shows a `[spinner] Opening <title>…` toast at the cursor, and swaps to a description ("Copied" on paste→copy downgrade, or the action's error status) or fades when the result carries none. Note it is presentation metadata only — it never changes the result/dismissal semantics for `.showStatus`/`.keepVisible`.

- [ ] **Step 2: popup-window.md**

In `docs/architecture/popup-window.md`, replace the "Status" bullet in the Content-Mode section (lines ~111-115) and the "Inline status banner" mentions with the toast: statuses now render as a floating one-line toast at the cursor (`ToastPanelController`), the inline banner and its queue (`pendingStatus`/`flushPendingStatus`) are gone, and `showsLoading` actions early-close with a spinner toast.

- [ ] **Step 3: known-debt.md**

In `docs/architecture/known-debt.md`, replace the "The floating bubble panel is gone… StatusBadgeModel and the old … status emitted while a card is open is queued (pendingStatus) and flushed onto the bar banner" note (lines ~85-90) with: the inline status banner is gone too — `StatusFeedback` renders as a floating toast (`ToastPanelController`), no queue (toast shows over the card), and `showsLoading` actions use the early-close spinner toast.

- [ ] **Step 4: directory-structure.md**

In `docs/architecture/directory-structure.md`, add the new files under `UI/Popup/` (or wherever `PopupPanel.swift` is listed): `ToastPanel.swift`, `ToastView.swift`, `ToastPanelController.swift` with one-line responsibilities.

- [ ] **Step 5: Verify docs only (no code change) — run the suite to confirm nothing broke**

Run: `./scripts/test.sh`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/developer-guide/AGENTS.md docs/architecture/popup-window.md docs/architecture/known-debt.md docs/architecture/directory-structure.md
git commit -m "docs: document toast panel and loading flag"
```

---

## Self-Review

**Spec coverage:**
- Toast at cursor, one line, optional icon → Tasks 6, 7.
- Auto-dismiss 0.5 s info/error; no timer for loading → Tasks 5, 7 (Timer column).
- Trigger 1 "Copied" only on paste→copy downgrade (right-click/⇧/canPaste=false); native copy shows nothing → Task 8 Step 3.6.
- Trigger 2 all `.showStatus` → toast; banner removed (`statusBanner`, `pendingStatus`, `flushPendingStatus`, `statusDismissTask`, `statusBubbleDurationNanoseconds`) → Task 8.
- Trigger 3 `showsLoading` early-close, spinner, swap-or-fade on no-description → Task 9.
- Manifest `"loading"` + `ActionChrome.showsLoading` + dev-guide doc → Tasks 2, 3, 4, 10, 11.
- `StatusFeedback.isLoading` → Task 1.
- Apple Music gets `"loading": true` → Task 10.
- Non-goals respected: no Preferences UI, no author surface beyond `"loading"`, no progress-bar variant, `.showStatus` keep-open semantics unchanged (popup still stays up), toast always floating → all tasks.

**Placeholder scan:** All steps carry concrete code or exact edits; no TBD/TODO/“handle edge cases”.

**Type consistency:** `runLoadingAction(_:with:forceCopy:)`, `ToastPanelController.show/showLoading/swapTo/hide`, `currentFeedback/isLoading/isShowing`, `PopupMetrics.toastDurationNanoseconds`, `StatusFeedback(message:style:symbolName:isLoading:)`, `ActionChrome(showsLoading:)`, `ExtensionActionMetadata(loading:)` are referenced identically across tasks. `shownController` gains a defaulted `toastController:` param in Task 8 and is reused by Task 9 tests.