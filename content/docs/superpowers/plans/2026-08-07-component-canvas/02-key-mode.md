# 02 — Key-Mode Primitives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution preference:** inline (no implementation subagents).

**Goal:** Extract the two key-mode primitives (`enterKeyMode()`/`exitKeyMode()`) that Tasks 14+ will reuse for the interactive canvas, change the capture/clear semantics of `previousFrontmostApp` to *capture-once-per-session / clear-only-on-hide*, and rewire `handleEvent`'s dismissal matrix so a content canvas is always modal (distance/scroll suspended, non-Esc keys never dismiss).

**Architecture:** `PopupWindowController` currently inlines key-window logic in `enterSearch`/`exitSearch`/`hide` and clears `previousFrontmostApp` on every search exit. Task 9 centralizes that into two private primitives plus one capture point in `show(for:)`. Task 10 makes `.content` unconditionally modal in `handleEvent` (today it consults `contentBlocksDismiss`, which keys off `PopupContent.emphasis != .info`). Both tasks keep the observable search behavior unchanged (the internal `previousFrontmostApp` lifecycle changes from clear-on-every-exit to capture-once / clear-only-on-hide).

**Tech Stack:** Swift 6, AppKit. No new dependencies. No Core changes.

## Global Constraints

(From the plan README — every task here inherits them.) `xcodegen generate` after any `.swift` add/remove/rename; `Self.<static>` never inside `Task.detached`; popup stays non-key except the scoped search exception (and, later, the canvas — see Task 14); Esc and dismissal run through the global/local event monitors, observation-only. Spec: `docs/superpowers/specs/2026-08-07-component-canvas-design.md` §7 (modal canvas), §8 (result routing).

**Test-target note:** this repo has a single test target — `OpenClipTests` → `Tests/OpenClipTests/`. All test files in this plan, and in the sibling Core plan, go there.

---

### Task 9: enterKeyMode()/exitKeyMode() extraction + capture-once/clear-on-hide

**Files:**
- Edit: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Create: `Tests/OpenClipTests/PopupKeyModeTests.swift`

**Interfaces:**
- Consumes: current `PopupWindowController` state machine (search/content/actions modes, `panel.allowsKey`, `previousFrontmostApp`).
- Produces (private, used by Task 14):
  - `private func enterKeyMode()` — fills `previousFrontmostApp` **only when nil**, sets `panel.allowsKey = true`, `panel.makeKeyAndOrderFront(nil)`.
  - `private func exitKeyMode()` — sets `panel.allowsKey = false`; if `NSApp.isActive`, reactivates `previousFrontmostApp`. **Never clears `previousFrontmostApp`.**
  - `var previousFrontmostApp: NSRunningApplication?` (changed from `private` → internal so the Task 9 tests can read it).
  - `show(for:)` captures `previousFrontmostApp` once at session start, skipping the capture entirely when OpenClip itself is already frontmost (the same guard `enterKeyMode()` uses).
  - `hide()` clears `previousFrontmostApp`.

- [ ] **Step 1: Update the file doc comment**

`PopupWindowController.swift` line 5-9 currently says content mode "stays non-key (Esc is observed by the event monitors)". Replace with: content mode "stays non-key today; the interactive canvas (Task 14) will make the panel key and reuse `enterKeyMode()`/`exitKeyMode()`, which are also the search-mode path". Keep the decision-8 paragraph.

- [ ] **Step 2: Extract the primitives and add the session capture**

- Change line 30 from `private var previousFrontmostApp: NSRunningApplication?` to `var previousFrontmostApp: NSRunningApplication?` with a comment: "Frontmost app before the panel became key (search or, later, canvas); captured once per session in show(for:), reactivated on exitKeyMode/hide, cleared only by hide(). Internal for tests."

- Add the capture at the top of `show(for:)` (after line 58 `currentContext = context`):

```swift
// The source app is frontmost when the popup shows; capture it once for the whole session.
// Skip the capture while OpenClip itself is frontmost (e.g. a preference window, or a mid-
// session re-show): storing ourselves makes the later re-activation a no-op that loses the real
// source app. Search re-entry and content↔search hops must never re-capture, either.
if previousFrontmostApp == nil,
   let app = NSWorkspace.shared.frontmostApplication,
   app.bundleIdentifier != Bundle.main.bundleIdentifier {
    previousFrontmostApp = app
}
```

- Add two primitives near `enterSearch`:

```swift
/// Makes the panel key (a scoped, user-initiated exception to the never-key rule) so a key
/// component can receive typing. A nonactivating panel can become key without activating this
/// app, so the source app stays active throughout. Captures the frontmost app only when no
/// session value exists yet — mid-session re-entry (search → bar → search, or content → search)
/// must keep the original source app — and only when that app is not OpenClip itself.
private func enterKeyMode() {
    guard let panel, panel.isVisible else { return }
    if previousFrontmostApp == nil,
       let app = NSWorkspace.shared.frontmostApplication,
       app.bundleIdentifier != Bundle.main.bundleIdentifier {
        previousFrontmostApp = app
    }
    panel.allowsKey = true
    panel.makeKeyAndOrderFront(nil)
}

/// Restores the never-key invariant and hands keyboard focus back to the source app. Deliberately
/// does NOT clear previousFrontmostApp: only hide() ends the session, so the same source app is
/// re-activated on the next exit and re-used on the next enter.
private func exitKeyMode() {
    panel?.allowsKey = false
    if NSApp.isActive {
        previousFrontmostApp?.activate(options: [.activateAllWindows])
    }
}
```

- [ ] **Step 3: Rewrite `enterSearch(with:)` and `exitSearch()` on the primitives**

`enterSearch(with:)` (lines 162-179) becomes:

```swift
public func enterSearch(with scope: SearchScope? = nil) {
    guard panel?.isVisible == true else { return }
    modeStore.scope = scope
    modeStore.mode = .search
    // Content-driven growth keeps the panel's bottom edge fixed (results render above the field,
    // so growth must extend upward); see PopupPanel.setFrame.
    panel?.pinBottomEdgeOnResize = modeStore.searchResultsAbove
    enterKeyMode()
    // Explicitly make the search field first responder on the next run-loop turn. A @FocusState
    // request issued during the mode-change render can be silently dropped on macOS before the
    // panel has finished becoming key (worst on the click-path: the click that opened search).
    Task { @MainActor in
        await Task.yield()
        self.focusSearchField()
    }
}
```

`exitSearch()` (lines 211-224) becomes:

```swift
public func exitSearch() {
    guard modeStore.mode == .search else { return }
    modeStore.scope = nil
    modeStore.mode = .actions
    // Return to the bar keeps the field-anchoring rule active for hover-preview/banner growth
    // (strip renders above the bar when the popup sits low), so set it explicitly rather than
    // leaving the search-mode value behind. Cleared by show()/hide() before placement.
    panel?.pinBottomEdgeOnResize = modeStore.searchResultsAbove
    exitKeyMode() // reactivates previousFrontmostApp but keeps it for the session
}
```

- [ ] **Step 4: Rewrite `hide()`'s key teardown**

In `hide()` (lines 392-405) replace:

```swift
    panel?.allowsKey = false
    panel?.pinBottomEdgeOnResize = false
    panel?.orderOut(nil)
    removeMonitors()
    ...
    if NSApp.isActive {
        previousFrontmostApp?.activate(options: [.activateAllWindows])
    }
    previousFrontmostApp = nil
```

with:

```swift
    panel?.pinBottomEdgeOnResize = false
    exitKeyMode() // allowsKey=false + reactivate previousFrontmostApp
    previousFrontmostApp = nil // hide() is the only thing that ends the key-mode session
    panel?.orderOut(nil)
    removeMonitors()
    ...
```

Keep the rest of `hide()` unchanged (mode/scope/content/preview/badge resets, `currentContext = nil`, etc.).

- [ ] **Step 5: Write the failing tests**

`Tests/OpenClipTests/PopupKeyModeTests.swift`:

```swift
import XCTest
import AppKit
import Core
@testable import OpenClip

@MainActor
final class PopupKeyModeTests: XCTestCase {

    override func setUp() {
        super.setUp()
        StatusBadgeModel.shared.currentStatusBadge = nil
    }

    private func shownController() throws -> PopupWindowController {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = PopupWindowController()
        controller.show(for: SelectionContext(
            text: "hello world",
            sourceApp: AppIdentity(bundleIdentifier: "com.test", localizedName: "Test"),
            cursorPosition: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200),
            timestamp: Date(),
            appPolicy: .default
        ))
        return controller
    }

    func testShowCapturesFrontmostAppOnce() throws {
        let controller = try shownController()
        defer { controller.hide() }
        XCTAssertNotNil(controller.previousFrontmostApp, "show must capture the source app")
        let captured = controller.previousFrontmostApp
        controller.enterSearch()
        XCTAssertEqual(controller.previousFrontmostApp, captured, "re-entry must not re-capture")
    }

    func testKeyedPanelNeverStoresOpenClip() throws {
        // The self-capture guard runs in show(for:), not in enterSearch: asserting the frontmost
        // app right after enterSearch is non-deterministic on headless CI, where the runner
        // process (not the true source app) is frontmost. Assert at the capture site instead.
        let controller = try shownController()
        defer { controller.hide() }
        XCTAssertNotEqual(controller.previousFrontmostApp?.bundleIdentifier, Bundle.main.bundleIdentifier,
                          "a session must never store OpenClip itself as the source app")
        // The capture is a show(for:) artifact, not a post-enterSearch side effect: re-entering
        // search must not re-record the frontmost.
        let capturedAtShow = controller.previousFrontmostApp
        controller.enterSearch()
        controller.exitSearch()
        XCTAssertEqual(controller.previousFrontmostApp, capturedAtShow,
                       "only show(for:) captures the source app; enterSearch never re-captures")
        // hide() ends the session and clears; the next show() re-records whatever is frontmost then.
        controller.hide()
        XCTAssertNil(controller.previousFrontmostApp, "hide() clears the session capture")
    }

    func testExitSearchKeepsFrontmostApp() throws {
        let controller = try shownController()
        defer { controller.hide() }
        let captured = controller.previousFrontmostApp
        controller.enterSearch()
        controller.exitSearch()
        XCTAssertEqual(controller.previousFrontmostApp, captured,
                       "exitSearch must not clear the session source app")
        controller.enterSearch()
        XCTAssertEqual(controller.previousFrontmostApp, captured,
                       "re-entering search after exit must reuse the original source app")
    }

    func testHideClearsFrontmostApp() throws {
        let controller = try shownController()
        controller.enterSearch()
        controller.exitSearch()
        controller.hide()
        XCTAssertNil(controller.previousFrontmostApp, "only hide() ends the session")
    }

    func testSearchPanelBecomesKeyAndReturnsToNonKey() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController()
        defer { controller.hide() }
        let panel = try XCTUnwrap(NSApp.windows.first(where: { $0 is PopupPanel && $0.isVisible }) as? PopupPanel)
        controller.enterSearch()
        XCTAssertTrue(panel.allowsKey, "search mode must allow key (rule 9 exception)")
        controller.exitSearch()
        XCTAssertFalse(panel.allowsKey, "exit must restore the never-key invariant")
    }
}
```

- [ ] **Step 6: Run to verify they pass**

Run: `timeout -k 10 60 ./scripts/test.sh PopupKeyModeTests`
Expected: PASS. Then run the full popup surface to confirm search behavior is unchanged:
`timeout -k 10 60 ./scripts/test.sh Popup`

- [ ] **Step 7: Commit**

```bash
xcodegen generate
git add Sources/OpenClip/UI/Popup/PopupWindowController.swift Tests/OpenClipTests/PopupKeyModeTests.swift
git commit -m "refactor(popup): extract enterKeyMode/exitKeyMode primitives, capture-once source app"
```

---

### Task 10: handleEvent dismissal matrix (content = modal)

**Files:**
- Edit: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Edit: `Tests/OpenClipTests/PopupCanvasTests.swift` (extend)

**Interfaces:**
- Consumes: `handleEvent(_:)` (currently `private`, lines 462-517); `contentBlocksDismiss` (line 37-39, will be removed).
- Produces: `func handleEvent(_ event: NSEvent)` (visibility change `private` → internal, so tests can drive the matrix); `.content` is always modal.

- [ ] **Step 1: Make `handleEvent` internal**

Change line 462 `private func handleEvent(_ event: NSEvent)` → `func handleEvent(_ event: NSEvent)`. Update the file doc comment mention of dismissal ("content canvas blocks distance/scroll dismissal and non-Esc keys"). Remove the `contentBlocksDismiss` computed property (lines 37-39) — it is now unused.

- [ ] **Step 2: Rewrite the dismissal matrix**

- `.mouseMoved` (lines 471-483): distance dismissal suspends for both `.search` and `.content`:

```swift
            // Distance dismissal suspends in search mode (typing elsewhere must not dismiss the
            // palette) and while a content canvas is open (modal); it is active otherwise.
            let distanceDismissActive = modeStore.mode != .search && modeStore.mode != .content
            if distanceDismissActive, let panel = panel {
                let frame = panel.frame
                let dx = max(0, max(frame.minX - cursorLoc.x, cursorLoc.x - frame.maxX))
                let dy = max(0, max(frame.minY - cursorLoc.y, cursorLoc.y - frame.maxY))
                if hypot(dx, dy) > Constants.popupDismissalDistance {
                    hide()
                }
            }
```

- `.scrollWheel` (lines 493-498): content suspends like search:

```swift
        case .scrollWheel:
            // Search mode scrolls the results list (panel key); a content canvas is modal and
            // scrolls its own scrollable content, never dismisses.
            if modeStore.mode == .search || modeStore.mode == .content { break }
            hide()
```

- `.keyDown` (lines 499-513): non-Esc keys in content are **never** a dismissal — before Task 14 the panel is non-key so the key lands in the source app (observed only); after Task 14 it goes to the focused canvas component:

```swift
        case .keyDown:
            // Actions mode: any keystroke (including Escape) dismisses the popup; the panel is
            // never key here, so keys land in the source app and are merely observed.
            // Search mode: keys go to the search field (panel is key); Escape is handled there.
            // Content mode: modal — Escape collapses the canvas to the bar; any other key is
            // ignored (it belongs to the focused canvas component, or pre-Task-14 to the source
            // app) and never dismisses.
            if modeStore.mode == .search { break }
            if modeStore.mode == .content {
                if event.keyCode == 53 { // Esc
                    exitContent()
                }
                return
            }
            hide()
```

- `.leftMouseDown` (lines 484-492) is unchanged: click outside the bar hides, **even when the panel is key and a text field is focused** (spec §7: "first click outside hides even when textField focused").

- [ ] **Step 3: Extend the tests**

Add to `Tests/OpenClipTests/PopupCanvasTests.swift`:

```swift
    private func keyDown(_ keyCode: UInt16) -> NSEvent? {
        NSEvent.keyEvent(with: .keyDown, location: .zero, modifierFlags: [], timestamp: 0,
                         windowNumber: 0, context: nil, characters: "x",
                         charactersIgnoringModifiers: "x", isARepeat: false, keyCode: keyCode)
    }

    private func scrollEvent() -> NSEvent? {
        NSEvent.scrollWheelEvent(with: .scrollWheel, location: .zero, modifierFlags: [],
                                 timestamp: 0, windowNumber: 0, context: nil,
                                 deltaX: 0, deltaY: 5, deltaZ: 0)
    }

    func testNonEscKeystrokeInContentModeDoesNotDismiss() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        controller.handleActionResult(.showContent(makeResultContent()))
        let panel = try visiblePanel()

        controller.handleEvent(try XCTUnwrap(keyDown(7))) // 'x'

        XCTAssertTrue(panel.isVisible, "a non-Esc key in content mode must not dismiss")
        XCTAssertEqual(controller.modeStore.mode, .content)
    }

    func testEscInContentModeCollapsesToBar() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        controller.handleActionResult(.showContent(makeResultContent()))
        let panel = try visiblePanel()

        controller.handleEvent(try XCTUnwrap(keyDown(53))) // Esc

        XCTAssertTrue(panel.isVisible, "Esc in content collapses, never hides")
        XCTAssertEqual(controller.modeStore.mode, .actions)
    }

    func testKeystrokeInActionsModeDismisses() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        let panel = try visiblePanel()

        controller.handleEvent(try XCTUnwrap(keyDown(7)))

        XCTAssertFalse(panel.isVisible, "actions mode: any keystroke dismisses")
    }

    func testKeystrokeInSearchModeIsIgnored() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        controller.enterSearch()
        let panel = try visiblePanel()

        controller.handleEvent(try XCTUnwrap(keyDown(7)))

        XCTAssertTrue(panel.isVisible)
        XCTAssertEqual(controller.modeStore.mode, .search)
    }

    func testScrollWheelSuspendedInContentAndSearch() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        let panel = try visiblePanel()

        controller.handleActionResult(.showContent(makeResultContent()))
        controller.handleEvent(try XCTUnwrap(scrollEvent()))
        XCTAssertTrue(panel.isVisible, "scroll must not dismiss a content canvas")

        controller.exitContent()
        controller.enterSearch()
        controller.handleEvent(try XCTUnwrap(scrollEvent()))
        XCTAssertTrue(panel.isVisible, "scroll must not dismiss search mode")
    }

    func testScrollWheelInActionsModeDismisses() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        let panel = try visiblePanel()

        controller.handleEvent(try XCTUnwrap(scrollEvent()))

        XCTAssertFalse(panel.isVisible, "scroll away from an actions-mode popup dismisses")
    }
```

Keep `testContentModeKeepsPanelNonKey` as-is for now (it still holds — Task 14 inverts it). Keep `testStatusBadgeWithOpenCanvas` as-is (status behavior is unchanged until Task 13).

- [ ] **Step 4: Run the tests**

Run: `timeout -k 10 60 ./scripts/test.sh PopupCanvasTests`
Expected: PASS (all old + new). Then the quick build gate:
`timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add Sources/OpenClip/UI/Popup/PopupWindowController.swift Tests/OpenClipTests/PopupCanvasTests.swift
git commit -m "feat(popup): treat content canvas as modal in the dismissal matrix"
```

**Done with key-mode primitives.** Next: `03-session-renderer.md` (Tasks 11–16).
