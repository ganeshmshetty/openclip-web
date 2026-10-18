# 03 — Session + Renderer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution preference:** inline (no implementation subagents).

**Goal:** Build the live canvas — `CanvasSession` + `CanvasSessionController` (dispatch serialization, state write-back, focus restore), the one-view-per-node `CanvasComponentView` renderer + chrome `CanvasHeaderView` + `CanvasSessionView`, swap `PopupModeStore.content` to `CanvasSession?` and `preview` to `CanvasComponent?`, add `deliverKeyboardEffect`, delete `PopupContentView`/`StatusBadgeModel` behind a temporary `LegacyContentBridge` (legacy producers keep working), then flip content mode to **key** exactly like search and land the renderer/key/effect-delivery/sizing/a11y and session-lifecycle test surfaces.

**Architecture:** Everything renders inside the single `PopupPanel`. A `CanvasSession` is the observable unit the view renders; the `CanvasSessionController` owns the one active session, serializes dispatches, writes state back, restores focus, and routes collected effects. Legacy `PopupContent` producers are kept alive by `LegacyContentBridge` converting `PopupContent` → `CanvasComponent` tree until Tasks 17–21 migrate them off and delete the bridge. Content-is-key lands in Task 14 using the Task 9 primitives.

**Tech Stack:** Swift 6, SwiftUI, AppKit. No new dependencies. Core types consumed: `CanvasComponent`+props, `CanvasEffect`, `CanvasHandler`, `CanvasEvent`, `CanvasSessionState`, `CanvasSize`, `CanvasHeader`, `CanvasScripting`, `CanvasLimits`, `CanvasComponent.firstInteractiveID()`, `Constants.popupMaxHeight`.

## Global Constraints

(From the plan README — every task here inherits them.) `xcodegen generate` after any `.swift` add/remove/rename; `Self.<static>` never inside `Task.detached`; canvas effects never dismiss (collapse only via Esc → bar / click-outside / `appDidDeactivate` / `hide()`); status never renders inside a canvas — `.showStatus` while a canvas is open surfaces after collapse, on the bar banner; one active session, replaced on new mount, `hide()` cancels in-flight; `deliverKeyboardEffect` resigns key → activates source app → posts → restores; the renderer applies `.id(node.id)` only when non-nil; theme colors come from `PopupThemeModel` tokens. All tests live in `Tests/OpenClipTests/` (single test target — see note in `02-key-mode.md`). Spec: `docs/superpowers/specs/2026-08-07-component-canvas-design.md` §4.2, §5.2, §7, §7.1, §7.2, §7.3, §11, §12.

---

### Task 11: CanvasSession + CanvasSessionController

**Files:**
- Create: `Sources/OpenClip/UI/Popup/CanvasSession.swift`
- Create: `Sources/OpenClip/UI/Popup/CanvasSessionController.swift`
- Create: `Tests/OpenClipTests/CanvasSessionControllerTests.swift`

**Interfaces:**
- Consumes: `CanvasSessionState`, `CanvasSize`, `CanvasHeader`, `CanvasComponent`, `CanvasEvent`, `CanvasEffect`, `CanvasScripting`, `CanvasMountRequest`, `CanvasMountResult`, `CanvasDispatchRequest`, `CanvasDispatchResult`, `firstInteractiveID()` (all Core).
- Produces (used by Tasks 12–17, 23):

```swift
// CanvasSession.swift — the observable unit the renderer draws; @MainActor.
@MainActor public final class CanvasSession: ObservableObject {
    public let id: UUID
    public let header: CanvasHeader                       // chrome title/icon = the running action
    public let input: String                              // the selection text (ActionContext.selection.text)
    public let preferredSize: CanvasSize?                 // fixed for the session; nil → fitting-size
    public let scripting: (any CanvasScripting)?          // nil for native/static sessions (.showContentTree)
    public let isAsync: Bool
    @Published public var tree: CanvasComponent
    @Published public var state: CanvasSessionState
    @Published public private(set) var focusedComponentID: String?   // nil = canvas root
    @Published public private(set) var focusGeneration: Int = 0      // bumped → view re-applies focus next run loop
    public init(id: UUID = UUID(), header: CanvasHeader, input: String, preferredSize: CanvasSize?,
                scripting: (any CanvasScripting)?, isAsync: Bool,
                tree: CanvasComponent, state: CanvasSessionState = CanvasSessionState())
    public func apply(state: CanvasSessionState, tree: CanvasComponent)   // state write-back after a dispatch
    public func requestFocus(_ id: String?)                                // sets focusedComponentID + bumps generation
}

// CanvasSessionController.swift — one active session; serialized dispatch; effect routing; focus restore.
@MainActor public final class CanvasSessionController {
    public private(set) var session: CanvasSession?
    public var onEffects: (@MainActor ([CanvasEffect]) -> Void)?      // collected leaf effects (never dismiss)
    public var onSessionError: (@MainActor (Error) -> Void)?          // mount/dispatch failure → presenter collapses
    public init()
    public func replace(with session: CanvasSession)                   // discards old session + any in-flight dispatch
    public func clear()                                                // hide()/collapse: cancel in-flight, drop session
    public func mount(_ request: CanvasMountRequest, scripting: any CanvasScripting, header: CanvasHeader) // Task 23 wires JS
    public func dispatch(_ event: CanvasEvent)                         // serialized; write-back; focus restore
    public func requestFocus(_ id: String?)                            // forwards to session
    public func refocus()                                              // re-apply focus after a key-restore cycle
}
```

- [ ] **Step 1: Write the failing tests**

`Tests/OpenClipTests/CanvasSessionControllerTests.swift` uses a controllable fake engine:

```swift
import XCTest
import Core
@testable import OpenClip

/// Records mount/dispatch calls; a gate suspends the fake until released so tests can drive
/// serialization and replacement/cancellation races deterministically.
@MainActor
final class GatedScripting: CanvasScripting {
    struct Call: Equatable { let event: CanvasEvent?; let mount: Bool }
    private(set) var calls: [Call] = []
    private(set) var dispatchedStates: [CanvasSessionState] = []   // each request's state snapshot (asserts in-chain freshness)
    var mountResult: CanvasMountResult = CanvasMountResult(state: CanvasSessionState(), tree: .text(CanvasTextProps(content: "hi")))
    var dispatchResults: [CanvasDispatchResult] = []
    var error: Error?
    private var gate: AsyncStream<Void>.Continuation?
    private var gateStream: AsyncStream<Void>? = AsyncStream { self.gate = $0.yield }
    func release() { gate?.yield(); gate = nil }

    func mount(_ request: CanvasMountRequest) async throws -> CanvasMountResult {
        calls.append(Call(event: nil, mount: true))
        await gateStream?.first { _ in true }
        if let error { throw error }
        return mountResult
    }
    func dispatch(_ request: CanvasDispatchRequest) async throws -> CanvasDispatchResult {
        calls.append(Call(event: request.event, mount: false))
        dispatchedStates.append(request.state)
        await gateStream?.first { _ in true }
        if let error { throw error }
        return dispatchResults.removeFirst()
    }
}

@MainActor
final class CanvasSessionControllerTests: XCTestCase {
    private func makeController() -> (CanvasSessionController, GatedScripting) {
        let scripting = GatedScripting()
        let controller = CanvasSessionController()
        return (controller, scripting)
    }

    private func textTree(_ content: String, id: String? = nil) -> CanvasComponent {
        .text(CanvasTextProps(id: id, content: content))
    }
```

Test methods (write each, assert, then implement):

- `testNativeSessionDispatchIsNoop` — arm a session with `scripting: nil` (native), call `controller.dispatch(.tap...)`; pump; assert the fake (a separate gated fake wired nowhere) never sees a call, tree/state unchanged.
- `testDispatchWritesBackStateAndTree` — arm with a gated fake; fake's `dispatchResults = [CanvasDispatchResult(state: CanvasSessionState(["n": .number(2)]), tree: textTree("2"))]`; `dispatch(.tap)`; release; pump; assert `session.state.number("n") == 2` and `session.tree == .text(CanvasTextProps(content: "2"))`.
- `testDispatchFiresCollectedEffects` — fake returns `effects: [.paste("x")]`; assert `onEffects` received `[.paste("x")]` exactly once.
- `testDispatchSerializes` — fake suspends on gate; fire two dispatches; release; assert `calls` has both events and the second started only after the first completed (the fake records call order; assert `calls.map(\.event.handler)` == the two handlers in order).
- `testRapidDoubleTapSecondDispatchReadsFreshState` — the serialized chain builds each `CanvasDispatchRequest` **inside** its task, reading `session.state` at execution time (never at enqueue time), so a second rapid tap must carry the first dispatch's write-back — a counter tapped twice reaches 2, never 1. Arm a session with state `["count": .number(0)]`; fake's `dispatchResults = [CanvasDispatchResult(state: CanvasSessionState(["count": .number(1)]), tree: textTree("1")), CanvasDispatchResult(state: CanvasSessionState(["count": .number(2)]), tree: textTree("2"))]`; fire two `.tap` events; release; pump; assert the fake's `dispatchedStates` == `[.number(0), .number(1)]` (the second request snapshot happened after the first result's `apply`) and `session.state.number("count") == 2`. Ordering-only assertions (`testDispatchSerializes`) cannot catch an enqueue-time snapshot — this test is the plan's rapid-double-tap regression.
- `testSubmitRestoresFocusToTarget` — returned tree contains `textField(id: "field")`; dispatch `.submit` with `targetID: "field"`; assert `session.focusedComponentID == "field"` after pump.
- `testBlurChangeSkipsFocusRestore` — returned tree contains `textField(id: "field")`; dispatch `.change` with `targetID: "field"` (a blur-triggered change); assert `focusedComponentID` did not become "field" (unchanged / nil).
- `testToggleChangeRestoresFocus` — returned tree contains `toggle(id: "tog")`; dispatch `.change` with `targetID: "tog"`; assert `focusedComponentID == "tog"`.
- `testToggleFlipsStateBeforeDispatchRequest` — arm a session whose tree has a `toggle(id: "tog")` and state `["tog": .bool(false)]`; dispatch `.change(targetID: "tog")` (no gate); assert the fake's recorded `CanvasDispatchRequest` carried `state.bool("tog") == true` (post-flip) and the session state was flipped before the request was built (H3).
- `testMissingTargetFallsBackToFirstInteractive` — returned tree has a `textField(id: "new")` but event targetID "gone"; dispatch `.submit`; assert `focusedComponentID == "new"`.
- `testNewMountReplacesSessionAndDiscardsInflight` — mount A (gated, slow); mount B; release A's gate; assert the armed session is B's (A's late result discarded, `calls` recorded, `controller.session?.id != A.id`).
- `testClearCancelsInflightAndLateResultIgnored` — dispatch a gated call; `clear()`; release; pump; assert no write-back (state unchanged), no `onEffects`, `session == nil`.
- `testMountArmsSessionAndRequestsFocus` — mount via fake with a tree whose `firstInteractiveID() == "field"`; release; assert `session?.focusedComponentID == "field"` and `focusGeneration` bumped.
- `testMountErrorSurfacesOnSessionError` — fake throws; `onSessionError` records; assert `session == nil` and error delivered.

- [ ] **Step 2: Run to verify they fail**

Run: `timeout -k 10 60 ./scripts/test.sh CanvasSessionControllerTests`
Expected: FAIL (types missing).

- [ ] **Step 3: Implement `CanvasSession.swift`**

Straightforward `ObservableObject` as specified. `requestFocus(_:)` sets `focusedComponentID` and increments `focusGeneration` (every call must bump so the renderer re-applies even for the same id). `apply(state:tree:)` writes both. File doc comment notes the "one active session; state written back only by the controller" contract and that `scripting == nil` marks a native/static session whose dispatches are no-ops in v1.

- [ ] **Step 4: Implement `CanvasSessionController.swift`**

Key internals:

```swift
@MainActor public final class CanvasSessionController {
    public private(set) var session: CanvasSession?
    public var onEffects: (@MainActor ([CanvasEffect]) -> Void)?
    public var onSessionError: (@MainActor (Error) -> Void)?
    private var dispatchChain: Task<Void, Never>?
    private var generation = 0

    public func replace(with session: CanvasSession) {
        generation += 1
        dispatchChain?.cancel()
        dispatchChain = nil
        self.session = session
    }

    public func clear() {
        generation += 1
        dispatchChain?.cancel()
        dispatchChain = nil
        session = nil
    }

    public func mount(_ request: CanvasMountRequest, scripting: any CanvasScripting, header: CanvasHeader) {
        generation += 1
        let myGeneration = generation
        let previous = dispatchChain
        dispatchChain = Task { @MainActor [weak self] in
            await previous?.value
            guard let self, self.generation == myGeneration else { return }
            do {
                let result = try await scripting.mount(request)
                guard self.generation == myGeneration else { return }
                let session = CanvasSession(header: header, input: request.input,
                                            preferredSize: request.preferredSize, scripting: scripting,
                                            isAsync: request.isAsync, tree: result.tree, state: result.state)
                self.session = session
                // No onEffects at mount: CanvasMountResult carries state+tree only (spec §5.2).
                let firstInteractive = session.tree.firstInteractiveID()
                Task { @MainActor in await Task.yield(); session.requestFocus(firstInteractive) }
            } catch {
                guard self.generation == myGeneration else { return }
                self.session = nil
                self.onSessionError?(error)
            }
        }
    }

    public func dispatch(_ event: CanvasEvent) {
        guard let session, let scripting = session.scripting else { return } // native v1: no named handlers
        let myGeneration = generation
        let previous = dispatchChain
        dispatchChain = Task { @MainActor [weak self] in
            await previous?.value
            guard let self, self.generation == myGeneration, let session = self.session else { return }
            // Pre-flip write + request snapshot happen INSIDE the serialized chain — never at
            // enqueue time. A `.change` commits the new value into session state BEFORE the request
            // is built so the receiving handler reads post-flip state (a toggle flip toggles the
            // stored value; a textField blur-change commits the draft string the view is carrying).
            // Building the request here also means a second rapid tap reads the state left by the
            // first dispatch: an enqueue-time snapshot would carry stale pre-dispatch state and lose
            // updates (a counter tapped twice must reach count 2, not 1).
            if event.kind == .change, let id = event.targetID {
                if session.tree.isToggleNodeID(id) {
                    let flipped = !(session.state.bool(id) ?? false)
                    session.state.values[id] = .bool(flipped)
                } else if session.tree.isTextFieldNodeID(id) {
                    session.state.values[id] = .string(event.value ?? "")
                }
            }
            let request = CanvasDispatchRequest(event: event, state: session.state)
            do {
                let result = try await scripting.dispatch(request)
                guard self.generation == myGeneration, self.session?.id == session.id else { return }
                session.apply(state: result.state, tree: result.tree)
                self.onEffects?(result.effects)
                self.restoreFocus(after: event, in: session)
            } catch {
                guard self.generation == myGeneration else { return }
                self.session = nil
                self.onSessionError?(error)
            }
        }
    }

    /// Focus restore (§4.2): submit → re-focus targetID; change from a textField (blur) → skip;
    /// change from a toggle → keep focus on the toggle; missing target → firstInteractiveID.
    private func restoreFocus(after event: CanvasEvent, in session: CanvasSession) {
        switch event.kind {
        case .submit:
            let target = event.targetID.flatMap { session.tree.containsNodeID($0) ? $0 : nil }
                ?? session.tree.firstInteractiveID()
            session.requestFocus(target)
        case .change:
            guard let target = event.targetID, session.tree.containsNodeID(target) else {
                session.requestFocus(session.tree.firstInteractiveID())
                return
            }
            if !session.tree.isTextFieldNodeID(target) { session.requestFocus(target) } // toggle keeps focus
        case .tap:
            break
        }
    }
}
```

- `containsNodeID(_:)` / `isTextFieldNodeID(_:)` / `isToggleNodeID(_:)` are small private depth-first walkers on the tree (App-side; fine to add `CanvasComponent.containsNodeID(_:)` in Core later if reused).
- Chaining serialization: each `dispatch`/`mount` creates a `Task { @MainActor ... }` that first awaits the previous chain task's `.value`. All on `@MainActor`, no `Task.detached`, no `Self.` static references (AGENTS rule). The `generation` guard is what discards a replaced/cleared session's late result.

- [ ] **Step 5: Run tests**

Run: `timeout -k 10 60 ./scripts/test.sh CanvasSessionControllerTests`
Expected: PASS. Then the quick build gate (`xcodegen generate` first).

- [ ] **Step 6: Commit**

```bash
xcodegen generate
git add Sources/OpenClip/UI/Popup/CanvasSession.swift Sources/OpenClip/UI/Popup/CanvasSessionController.swift Tests/OpenClipTests/CanvasSessionControllerTests.swift
git commit -m "feat(popup): add CanvasSession + CanvasSessionController (dispatch serialization, state write-back, focus restore)"
```

---

### Task 12: CanvasComponentView renderer + CanvasHeaderView + CanvasSessionView + sizing

**Files:**
- Create: `Sources/OpenClip/UI/Popup/CanvasComponentView.swift` (11 component renderers + `CanvasTextFieldView` subview)
- Create: `Sources/OpenClip/UI/Popup/CanvasHeaderView.swift` (chrome header ported from `PopupContentView.resultHeader`)
- Create: `Sources/OpenClip/UI/Popup/CanvasSessionView.swift` (surface + `ScrollView` body + focus plumbing + Esc + `kRootFocusID`)

**Interfaces:**
- Consumes: `CanvasSession`, `CanvasComponent` + all props, `CanvasEffect`, `CanvasEvent`, `CanvasHandler`, `PopupThemeModel`, `CanvasLimits`, `Constants.popupMaxHeight`, `PopupHoverState` (for the Esc keycap hover via the existing `CanvasHoverSupport` pattern).
- Produces:
  - `let kRootFocusID = "__canvas_root__"` (App constant in `CanvasSessionView.swift`).
  - `struct CanvasComponentView: View` — `init(tree: CanvasComponent, focusID: FocusState<String?>.Binding, onEvent: (CanvasEvent) -> Void, onEffect: (CanvasEffect) -> Void)`.
  - `struct CanvasHeaderView: View` — `init(title: String?, icon: String?, onBack: (() -> Void)?, searchResultsAbove: Bool, hoverState: PopupHoverState, isStatic: Bool = false)`.
  - `struct CanvasSessionView: View` — `init(session: CanvasSession, onExitContent: () -> Void, onEvent: (CanvasEvent) -> Void, onEffect: (CanvasEffect) -> Void)`; owns `@FocusState private var focusID: String?` and `@FocusState private var rootFocused: Bool`, `@State private var fieldDrafts: [String: String]`, hover state via `.onReceive(hoverState.$location)` (unobserved stored `hoverState`, same pattern as the bar).

- [ ] **Step 1: `CanvasComponentView` — the 11 renderers**

One `@ViewBuilder func render(_ node: CanvasComponent)` switch over the cases. Theme lookups: `PopupThemeModel.restForeground(for: effectiveTheme)`, `.restSecondary`, `.dividerColor`; accent via `.accentColor`. `effectiveTheme`/`effectiveColorScheme` derive from `PopupThemeModel` exactly as `PopupView` does (`selectedTheme`/`themeColor` `@AppStorage` + `@Environment(\.colorScheme)`).

Per component:
- `.stack(props, children)` — `orientation == .horizontal ? HStack(spacing: props.spacing ?? 8) : VStack(spacing: props.spacing ?? 8)`; children rendered recursively.
- `.divider` — `Rectangle().fill(PopupThemeModel.dividerColor(for: effectiveTheme)).frame(height: 1)`.
- `.spacer(props)` — `Spacer(minLength: props.minLength.map(CGFloat.init) ?? 0)` (vertical stacks only; horizontal Spacer inside HStack also works).
- `.text(props)` — `Text(props.content)` with fonts: title `.system(size: 13, weight: .semibold)`, body `.system(size: 13)`, caption `.system(size: 11)`, monospaced `.system(size: 12, design: .monospaced)`; color `.primary`/`.secondary`/`.accentColor` from token; `.textSelection(.enabled)` when `selectable`; `.frame(maxWidth: .infinity, alignment: .leading)`; `.lineSpacing(2)`.
- `.icon(props)` — reuse the app's existing icon pipeline (same as `PopupView.iconView`/`ActionIconView`): SF Symbol via `Image(systemName:)`, iconify/local/URL via SDWebImage + SVGCoder + `LocalIconCache`, `.resizable().aspectRatio(contentMode: .fit)`, `circle.dashed` placeholder, `exclamationmark.triangle` on error; `font(.system(size: props.size))`.
- `.image(props)` — `AsyncImage` for `url`, `LocalIconCache` for `local`; honours `props.size` (clamped to the column/stage as §7.1 — `maxWidth`, or fixed `frame(width:height:)` when the size is provided); bounded to the column (`maxWidth`), `.clipShape(RoundedRectangle(cornerRadius: props.cornerRadius ?? 0))`; local `file:`/icon path outside the extension directory via `Constants.isPathSafe` renders the error placeholder (no arbitrary-file reads).
- `.button(props)` — styles: accent = `Color.accentColor` background + white text (`.buttonStyle(.borderedProminent).controlSize(.small)` or a custom accent capsule matching the palette look); plain = theme foreground, accent on hover. `disabled` → `.disabled(true)` + `.opacity(0.5)` and no handler. `icon` (`props.icon`) renders when set (same icon pipeline as `.icon(props)`, small `font(.system(size: 14))`, aligned leading). Handler resolution: `.effect(e)` → `onEffect(e)`; `.dispatch(name)` → `onEvent(CanvasEvent(kind: .tap, handler: name, value: nil, targetID: props.id))`; nil handler → static. `.focusable()` + `.focused($focusID, equals: props.id)` when `props.id != nil`.
- `.list(props, sections)` — `VStack(alignment: .leading, spacing: 2)` per `CanvasListSection`; each section header (when non-nil) renders as `Text(header)` with `.font(.caption).foregroundStyle(PopupThemeModel.restSecondary)` + a full-width hairline divider below; then the section's rows. Row = icon (16pt, accent) + `VStack(title:subtitle)` + `Spacer()` + optional badge text; `.accessibilityLabel("\(title): \(subtitle)" ?? title)`; disabled rows dimmed and inert; rows with `.effect`/`.dispatch` handlers fire via `onEvent`/`onEffect` with `targetID: item.id`; `.focusable()` + `.focused` when `item.id != nil`.
- `.textField(props)` — a dedicated `CanvasTextFieldView` subview: `TextField("", text: draftBinding)` with placeholder, `.textFieldStyle(.plain)`, `.focusable()`, `.focused($focusID, equals: props.id)`, `.onSubmit { commit(.submit) }`, Esc via `.onKeyPress(.escape) { onExitContent(); return .handled }`. `draftBinding` reads `fieldDrafts[id] ?? props.value` and writes `fieldDrafts[id]` — `fieldDrafts` is an **edit-buffer, not a value store**: after a dispatch re-render the authoritative value is the tree's `props.value`, so a leftover draft for a field the user isn't editing would show stale text (e.g. a "Clear" button emptying the field through another control). `CanvasSessionView` drops drafts for non-focused fields on `.onChange(of: session.tree)` (below), so only in-progress typing in the focused field ever masks the tree. Draft commits on blur (focus loss) via `CanvasSessionView`'s `.onChange(of: focusID)` handler (below) or a local `.onExitCommand`. Submit → `onEvent(CanvasEvent(kind: .submit, handler: onSubmit, value: draft, targetID: props.id))`; blur → `.change`. `onSubmit`/`onChange` nil handlers still commit state but fire no event. Explicit `.accessibilityLabel(props.placeholder?.isEmpty == false ? props.placeholder! : "Text field \(props.id)")` (matching the explicit `listItem`/`link` labels — the value is exposed via `accessibilityValue`).
- `.toggle(props)` — `Toggle(isOn:)` bound to a local `@State` seeded from `props.value` (the tree's authoritative value — the renderer sees only the tree, not `session.state`, which the controller keeps in agreement via its pre-flip write + the handler's echo), with `.onChange(of: props.value)` resyncing the local state on every dispatch re-render. Without the resync the local `@State` goes stale when a dispatch changes the toggle through a different control (e.g. a "select all" button flips it): the tree re-renders with the new value but the `@State` still shows the old one. The local state exists only for immediate tap feedback in native (non-dispatch) sessions. `.toggleStyle(.switch).controlSize(.mini)`; on tap: commit the **already-flipped** value to state and fire `onEvent(CanvasEvent(kind: .change, handler: onToggle, value: "\(flipped)", targetID: props.id))`. `.focusable()` + `.focused($focusID, equals: props.id)`; explicit `.accessibilityLabel("Toggle \(props.id)")`.
- `.link(props)` — `Button { NSWorkspace.shared.open(props.url) }` — but as a canvas effect, route through `onEvent(CanvasEvent(kind: .tap, handler: "link", ...))`? No — link is a leaf action, not a dispatch. Use `onEffect(.openURL(props.url))` so it flows through the effect door and respects `deliverKeyboardEffect` semantics (non-keyboard, handled directly). Render as accent-colored text with underline on hover; `.focusable()` + `.focused` when id non-nil; `.accessibilityLabel(props.title)`.

Apply `.id(node.id)` on each rendered component **only when** `node.id != nil` (identity-matched implicit animations; nil → full replacement). Wrap the whole tree in `.accessibilityElement(children: .contain)` at the root container (Task 12 root, applied in `CanvasSessionView`).

- [ ] **Step 2: `CanvasHeaderView` — port the chrome verbatim**

Port `PopupContentView.resultHeader` (title + optional icon + `Spacer` + hover-capable Esc keycap + full-width hairline divider, `.overlay(alignment: searchResultsAbove ? .top : .bottom)`). `title`/`icon` come from `CanvasSession.header` (the running action) — the tree carries no root title. Keep the hover mechanism: `CanvasHoverTarget.esc` registration via `CanvasHoverSupport.swift`, `updateHoveredTarget(for:)`, `useLocalHoverFallback`, `.onReceive(hoverState.$location)` (unobserved `hoverState`). Accessibility: `.accessibilityLabel("Back")` on the keycap.

- [ ] **Step 3: `CanvasSessionView` — surface + body + focus plumbing**

```swift
public struct CanvasSessionView: View {
    @ObservedObject public var session: CanvasSession
    public let onExitContent: () -> Void
    public let onEvent: (CanvasEvent) -> Void
    public let onEffect: (CanvasEffect) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @AppStorage(SettingKey.popupTheme.name) private var selectedTheme = SettingKey.popupTheme.defaultValue
    @AppStorage(SettingKey.popupThemeColor.name) private var themeColor = SettingKey.popupThemeColor.defaultValue
    @FocusState private var focusID: String?
    @FocusState private var rootFocused: Bool
    @State private var fieldDrafts: [String: String] = [:]
    private let hoverState: PopupHoverState = .shared   // unobserved; only .onReceive($location)

    public var body: some View {
        let surface = VStack(spacing: 0) {
            if session.preferredSize == nil {
                // no producer size: fitting-size; header pinned when searchResultsAbove
                // (mirrors PopupContentView.resultContent order swap)
            }
            // order header/body by modeStore.searchResultsAbove via an explicit bool param
        }
        // card surface styling ported from PopupContentView.cardContainer:
        //   .frame(minWidth: CanvasLimits.canvasMinWidth, idealWidth: CanvasLimits.canvasIdealWidth,
        //          maxWidth: CanvasLimits.canvasMaxWidth) + glass (.ultraThinMaterial/.glassEffect(.clear)/shadow)
        //   or classic opaque fill + .environment(\.colorScheme, effectiveColorScheme)
        surface
            .id(session.id)                                  // wholesale replace on new mount
            .onChange(of: session.focusGeneration) { _, _ in
                Task { @MainActor in await Task.yield(); applyFocus() }
            }
            .onChange(of: session.tree) { _, _ in
                // A dispatch re-render makes the tree authoritative: drop drafts for fields that
                // are no longer the focus target so a changed value re-renders correctly (an
                // external control updating a field's value must not show stale text). The focused
                // field keeps its draft — in-progress typing survives an unrelated dispatch.
                let focused = focusID
                for id in Array(fieldDrafts.keys) where id != focused {
                    fieldDrafts.removeValue(forKey: id)
                }
            }
            .onAppear { Task { @MainActor in await Task.yield(); applyFocus() } }
            .onChange(of: focusID) { _, new in
                // commit the field we just left (blur-triggered change, never per-keystroke)
                commitFocusedFieldIfNeeded(old: new)
            }
    }

    private var bodyScroll: some View {
        ScrollView(.vertical, showsIndicators: true) {
            CanvasComponentView(tree: session.tree, focusID: $focusID, onEvent: onEvent, onEffect: onEffect)
        }
.frame(minHeight: 40, maxHeight: Constants.popupMaxHeight - 36)  // §7.1: header chrome fills 36pt
                                                                           // above the body scroll box; the
                                                                           // panel's resizePanel still caps the
                                                                           // whole surface at
                                                                           // Constants.popupMaxHeight (240) —
                                                                           // the single sizing funnel
        .focusable()
        .focused($rootFocused)
        .onKeyPress(.escape) { onExitContent(); return .handled }
        .accessibilityElement(children: .contain)
    }

    private func applyFocus() {
        if let id = session.focusedComponentID {
            focusID = id            // root focus is only requested with id == nil
        } else {
            rootFocused = true
        }
    }
}
```

Sizing contract (§7.1): width column `min 220 / ideal 300 / max 360` from `CanvasLimits`, clamped to `screen visibleFrame.width − 2 × popupPadding`; body scroll box `maxHeight` is `Constants.popupMaxHeight - 36` (240 − 36 accounts for the `CanvasHeader` chrome, see M1); the panel's `resizePanel` (height cap `Constants.popupMaxHeight`) stays the single sizing funnel and is untouched here. A producer-set `preferredSize` (non-nil) renders the surface at that clamped size and is **fixed for the session** — the view uses it for the outer frame, and dispatches never change it (the session's `preferredSize` is immutable). When nil, the hosting view auto-sizes to fitting size as today.

- [ ] **Step 4: Build gate**

Run: `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
Expected: PASS. `CanvasSessionView`/`CanvasComponentView` compile but are not yet wired into `PopupView` (that is Task 13) — an unused-view warning is acceptable, not an error.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add Sources/OpenClip/UI/Popup/CanvasComponentView.swift Sources/OpenClip/UI/Popup/CanvasHeaderView.swift Sources/OpenClip/UI/Popup/CanvasSessionView.swift
git commit -m "feat(popup): add canvas component renderer, chrome header, and session view with focus/sizing"
```

---

### Task 13: PopupModeStore swap + PopupView wiring + deliverKeyboardEffect + delete PopupContentView/StatusBadgeModel (bridge keeps legacy producers alive)

**Files:**
- Edit: `Sources/OpenClip/UI/Popup/PopupModeStore.swift`
- Edit: `Sources/OpenClip/UI/Popup/PopupView.swift`
- Edit: `Sources/OpenClip/UI/Popup/PopupPreviewStrip.swift`
- Edit: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Create: `Sources/OpenClip/UI/Popup/LegacyContentBridge.swift`
- Delete: `Sources/OpenClip/UI/Popup/PopupContentView.swift` (holds `PopupContentView` **and** `StatusBadgeModel`)
- Edit: `Tests/OpenClipTests/PopupCanvasTests.swift`

**Interfaces:**
- Consumes: everything from Tasks 11–12; the existing `PopupContent`/`ContentOption`/`ContentRow`/`ContentEmphasis` model (still alive until Task 21).
- Produces:
  - `PopupModeStore.content: PopupContent?` → `CanvasSession?`; `preview: PopupContent?` → `CanvasComponent?`.
  - `PopupView` gains `onCanvasEvent: (CanvasEvent) -> Void` and `onCanvasEffect: (CanvasEffect) -> Void` init params (defaulted to no-ops); `contentCanvas` renders `CanvasSessionView`.
  - `PopupPreviewStrip` renders `component: CanvasComponent?` (non-keyed `text` snapshot).
  - `PopupWindowController`: owns a `CanvasSessionController`, `armCanvas(tree:header:preferredSize:)`, `enterContent(_ content: PopupContent)` through `LegacyContentBridge`, `exitContent()` clears the session + flushes pending status, `pendingStatus` queueing in `presentStatus`, and `deliverKeyboardEffect(_:)`.
  - `LegacyContentBridge` (temporary, deleted in Task 21): `static func header(for content: PopupContent) -> CanvasHeader`, `static func tree(for content: PopupContent) -> CanvasComponent`.

- [ ] **Step 1: Write `LegacyContentBridge.swift`**

Conversions (all `@MainActor`-free pure functions over Core types):
- `header(for:)` → `CanvasHeader(title: content.title, icon: content.icon)`.
- `tree(for:)` → for `.info`: `.text(CanvasTextProps(content: content.subtitle ?? content.title ?? ""))`; for `.result`: `.stack(vertical, [titleText?, subtitleText?, bodyText?, footerStack?])` where the body `text` uses `CanvasTextProps(content: rowsText, selectable: true)`, and footer options become `.button` nodes with `.effect` handlers mapping `ContentOption.outcome`:
  - `.perform(.paste(t))` → `.effect(.paste(t))`
  - `.perform(.copy(t))` → `.effect(.copy(t))`
  - `.perform(.cut(t))` → `.effect(.cut(t))`
  - `.perform(.openURL(u))` → `.effect(.openURL(u))`
  - `.perform(.keyPress(s))` → `.effect(.keyPress(s))`
  - other leaf → `.effect` mapping via `CanvasEffect` equivalents; `.run`/`.showSubMenu`/`.perform(.showContent...)`/presentation results → drop the option (these are dead producers in the bridged path; note in a comment that Task 19 fully removes `ContentOutcome`).
- `.menu` → a `.stack(vertical)` of `.button` rows (icon + title + subtitle).

Every node in the bridged tree has `id: nil` (no identity matching needed for legacy content — full replacement on re-render, matching today's behavior).

- [ ] **Step 2: Swap `PopupModeStore` types + `PopupPreviewStrip`**

`PopupModeStore.swift`: `content: CanvasSession? = nil`, `preview: CanvasComponent? = nil`; update the doc comments (content is now a live session; preview is a non-keyed text component).

`PopupPreviewStrip.swift`: `public let component: CanvasComponent?`; `init(component: CanvasComponent?)`; when non-nil render a single non-keyed, non-focusable text node (the controller always supplies `.text(...)`); nil renders `EmptyView()` and zero height. **Never** a session, never enters key mode (hovering a bar row never steals focus — confirmed decision).

- [ ] **Step 3: Wire `PopupView`**

- Add `onCanvasEvent`/`onCanvasEffect` params (stored, defaulted) after `onContentOutcome`.
- `contentCanvas` (lines 228–239) becomes:

```swift
    @ViewBuilder
    private var contentCanvas: some View {
        if let session = modeStore.content {
            CanvasSessionView(
                session: session,
                onExitContent: { onExitContent() },
                onEvent: onCanvasEvent,
                onEffect: onCanvasEffect
            )
        }
    }
```

- `actionsStack` (lines 372–383) passes `PopupPreviewStrip(component: preview)`.
- `PopupContentView` import/reference removed.

- [ ] **Step 4: Wire `PopupWindowController`**

- Add `private let canvasSessionController = CanvasSessionController()`; in `show(for:)` after building `modeStore`, wire:

```swift
        canvasSessionController.onEffects = { [weak self] effects in
            self?.handleCanvasEffects(effects)
        }
        canvasSessionController.onSessionError = { [weak self] error in
            self?.failCanvas(error)
        }
```

- Wire the view's `onCanvasEvent`/`onCanvasEffect` closures the controller passes into `PopupView`. **Both doors route into the same keep-open `handleCanvasEffects` path as dispatch-collected effects.** A rendered `.button`/`.link` node is a *live canvas action*, not a legacy artifact: a keyboard-delivered effect (`.paste`/`.cut`/`.keyPress`/`.simulatePaste`) must get the `deliverKeyboardEffect` resign→activate→post→restore dance — without it, once Task 14 makes the panel key, the synthetic Cmd+V lands in the keyed canvas itself instead of the source app. Non-keyboard leaf effects execute with `dismissesPopup` suppressed. There is **no legacy `handleEffect` special-case**: `handleEffect` never calls `hide()` (dismissal lives in `onResult`'s `dismissesPopup` check and the old `onContentOutcome`'s explicit `hide()`/`exitContent()` — neither is reachable from a canvas effect), and the pre-canvas "footer paste dismisses" behavior was an `onContentOutcome` artifact retired with `ContentOutcome` in Task 21, not a `handleEffect` behavior worth preserving:

```swift
        // Every canvas effect — dispatch-collected AND view-driven — is a keep-open effect: keyboard
        // ones get deliverKeyboardEffect, leaf ones run without dismissal. Never handleEffect.
        onCanvasEvent = { [weak self] event in
            self?.canvasSessionController.dispatch(event)
        }
        onCanvasEffect = { [weak self] effect in
            self?.handleCanvasEffects([effect])   // same door as dispatch-collected effects (§1, §6)
        }
```

- Replace `enterContent(_ content: PopupContent)`:

```swift
    private func enterContent(_ content: PopupContent) {
        guard panel?.isVisible == true else { return }
        armCanvas(tree: LegacyContentBridge.tree(for: content),
                  header: LegacyContentBridge.header(for: content))
    }

    /// Arms a native (non-scripting) canvas session and enters content mode. Task 14 makes it key.
    private func armCanvas(tree: CanvasComponent, header: CanvasHeader, preferredSize: CanvasSize? = nil) {
        let session = CanvasSession(
            header: header,
            input: currentActionContext?.selection.text ?? "",
            preferredSize: preferredSize,
            scripting: nil,               // native/static in v1; Task 17 routes .showCanvas through mount
            isAsync: false,
            tree: tree
        )
        canvasSessionController.replace(with: session)
        modeStore.content = session
        modeStore.mode = .content
        panel?.pinBottomEdgeOnResize = modeStore.searchResultsAbove
    }
```

- `exitContent()` becomes:

```swift
    public func exitContent() {
        guard modeStore.mode == .content else { return }
        canvasSessionController.clear()
        modeStore.content = nil
        modeStore.mode = .actions
        panel?.pinBottomEdgeOnResize = modeStore.searchResultsAbove
        flushPendingStatus()
    }
```

- `hide()`: add `canvasSessionController.clear()` near the top (after cancelling status timers); keep clearing `modeStore.content = nil`/`preview = nil`.
- `toggleMode()` content case (lines 151–155): replace the direct mutation with `exitContent()`.
- `updateHoveredAction` preview (lines 298–303): become a non-keyed text component:

```swift
            self.modeStore.preview = .text(CanvasTextProps(content: line ?? action.displayTitle(using: ActionCustomizationManager.shared), style: .caption))
```

  (a single `text` node per the confirmed hover-preview decision; `line` is `PreviewProviding.previewLine`.)
- `presentStatus` (lines 588–603): drop the `currentStatusBadge` branch; when `modeStore.mode == .content` queue `pendingStatus = feedback` instead of showing a banner; otherwise show the banner as today. Add `private var pendingStatus: StatusFeedback?`. Add `flushPendingStatus()`: if `pendingStatus != nil`, show it as a banner (`statusBanner = pendingStatus`, auto-dismiss task as today) and clear it. Call `flushPendingStatus()` from `exitContent()` and from `hide()` **after** the mode reset (hide shows it briefly? No — hide() must NOT surface a banner after dismissal; hide clears `pendingStatus = nil`). So: `hide()` clears `pendingStatus`; `exitContent()` flushes it.
- `handleCanvasEffects(_ effects: [CanvasEffect])` — **canvas-session effects never dismiss** (§1, §6). Keyboard-delivered effects go through `deliverKeyboardEffect`; every other leaf (`.copy`, `.openURL`, `.runShortcut`, `.showServices`, `.notify`) is executed **without honouring `dismissesPopup`** — never `hide()`. This is the **single effect door for the whole canvas**: dispatch-collected effects (`canvasSessionController.onEffects`) **and** view-driven effects (`onCanvasEffect`) both route here, so a rendered `.button`/`.link` gets the identical keep-open/keyboard-delivery treatment as a JS-collected effect. There is no legacy `handleEffect` special-case — H6 is obsolete (routing a bridged footer paste through `handleEffect` never preserved dismissal, because `handleEffect` doesn't `hide()`; the old footer-paste dismissal was an `onContentOutcome` artifact retired in Task 21), so the bridge lifetime needs no scoping and Task 21 needs no re-wiring:

```swift
    /// Canvas leaf effects never dismiss the popup (§1, §6). Single door for dispatch-collected AND
    /// view-driven canvas effects (onCanvasEffect routes here too): keyboard-delivered effects go
    /// through deliverKeyboardEffect; every other leaf executes with dismissal suppressed — never
    /// hide(). There is no legacy handleEffect path — see the onCanvasEffect wiring above.
    private func handleCanvasEffects(_ effects: [CanvasEffect]) {
        for effect in effects {
            switch effect {
            case .paste, .cut, .keyPress, .simulatePaste:
                Task { await self.deliverKeyboardEffect(effect) }
            default:
                Task { @MainActor in
                    await resultHandler.handleWithoutDismissal(effect.asActionResult)
                }
            }
        }
    }
```

  (Task 13 adds `handleWithoutDismissal(_ result: ActionResult)` to `ActionResultHandler` — the side-effect execution of `handleEffect` with `dismissesPopup` forced false, i.e. it never calls `hide()`. `DefaultActionResultHandler` implements it by delegating to the same body `handleEffect` uses but skipping the dismissal step; the `handleEffect`-returns-`Task<Void,Never>` change below applies to both.)

- `failCanvas(_ error: Error)`:

```swift
    /// Mount/dispatch failure (§11): collapse to the bar and show the error on the bar banner.
    private func failCanvas(_ error: Error) {
        Log.extensions.error("canvas session error: \(error)")
        exitContent()          // clears the session; flushes pending status (which we then override)
        modeStore.statusBanner = StatusFeedback(error: error)
        startStatusDismissal()
    }
```

  (extract the auto-dismiss task body in `presentStatus` into `startStatusDismissal()` so both share it.)

- `handleEffect` (lines 574–583) stays the generic effect door for **non-canvas flows** — bar results and `handleActionResult` leaves routed through the `default:` case — and is the inner poster for `deliverKeyboardEffect`. The canvas keep-open path (`handleCanvasEffects`) does NOT use it: it uses `resultHandler.handleWithoutDismissal` (H1) and `deliverKeyboardEffect` (which awaits `handleEffect`). `onCanvasEffect` no longer routes here, so there is **no canvas path that posts a keyboard effect without the resign/activate dance** (the Task 14 keyed-canvas paste regression). Keyboard effects from the bar (`.paste` via a legacy footer button) are unaffected (panel not key → `deliverKeyboardEffect` no-ops its resign/restore).
- `deliverKeyboardEffect(_ effect: CanvasEffect)`:

```swift
    /// A keyboard-delivered effect (.paste/.cut/.keyPress/.simulatePaste) is posted via CGEvent to the
    /// frontmost key window — which is the canvas itself while key. Resign key, activate the source app,
    /// post, then restore key + refocus when the canvas stays open (§7).
    private func deliverKeyboardEffect(_ effect: CanvasEffect) async {
        let wasKey = panel?.allowsKey == true
        let wasContent = modeStore.mode == .content
        if wasKey {
            panel?.allowsKey = false
            previousFrontmostApp?.activate(options: [.activateAllWindows])
        }
        await handleEffect(effect.asActionResult).value
        if wasKey, wasContent, panel?.isVisible == true {
            panel?.allowsKey = true
            panel?.makeKeyAndOrderFront(nil)
            canvasSessionController.refocus()
        }
    }
```

  (change `handleEffect` to return its `Task<Void, Never>` so `deliverKeyboardEffect` can await it.)
- Delete the `currentStatusBadge` computed property (lines 41–46) and its uses (`presentStatus`, `hide`). Delete `PopupContentView.swift` (contains `PopupContentView` + `StatusBadgeModel` + the `statusBadgeOverlay`).

- [ ] **Step 5: Update `PopupCanvasTests`**

- `setUp()`: remove `StatusBadgeModel.shared.currentStatusBadge = nil`.
- `testShowContentEntersContentModeAndGrowsPanel` (lines 52–73): `controller.modeStore.content?.title` no longer exists — replace with `controller.modeStore.content?.header.title == "AI Result"`; drop the `.emphasis == .result` assertion (emphasis is gone; add `XCTAssertNil(controller.modeStore.content?.scripting, "bridged content is a native session")`).
- `testStatusBadgeWithOpenCanvas` (lines 123–137) → `testStatusWithOpenCanvasQueuesUntilCollapse`: `.showStatus` while a canvas is open must not set `statusBanner`; after `exitContent()`, `statusBanner?.message == "Done"`.
- `testExitContentReturnsToActionsAndShrinksPanel` (lines 75–95): unchanged (mode/content checks still work with `CanvasSession?`).

- [ ] **Step 6: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh PopupCanvasTests`, then the quick build gate.
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
xcodegen generate
git add -A Sources/OpenClip/UI/Popup Tests/OpenClipTests/PopupCanvasTests.swift
git commit -m "feat(popup): render legacy content through CanvasSession via LegacyContentBridge; drop PopupContentView/StatusBadgeModel"
```

---

### Task 14: Content-is-key swap + focusFirstInteractive + invert the non-key test

**Files:**
- Edit: `Sources/OpenClip/UI/Popup/PopupWindowController.swift`
- Edit: `Tests/OpenClipTests/PopupCanvasTests.swift`
- (No new files.)

**Interfaces:**
- Consumes: Task 9 primitives (`enterKeyMode`/`exitKeyMode`, capture-once/clear-on-hide), Task 13 `armCanvas`.
- Produces: content mode is now **key** — one uniform key mode with search.

- [ ] **Step 1: `enterContent`/`exitContent` funnel through the key primitives**

- `armCanvas` (Task 13) gains, at its end:

```swift
        enterKeyMode()
        // Focus the first interactive element (or the canvas root) on the next run-loop turn — a
        // @FocusState request issued during the mode-change render can be silently dropped on macOS.
        Task { @MainActor in
            await Task.yield()
            canvasSessionController.requestFocus(session.tree.firstInteractiveID())
        }
```

  (`requestFocus(nil)` means "focus the root" — `CanvasSessionView.applyFocus` maps nil → `rootFocused = true`.)
- `exitContent()` adds `exitKeyMode()` after `canvasSessionController.clear()`:

```swift
    public func exitContent() {
        guard modeStore.mode == .content else { return }
        canvasSessionController.clear()
        modeStore.content = nil
        modeStore.mode = .actions
        panel?.pinBottomEdgeOnResize = modeStore.searchResultsAbove
        exitKeyMode()
        flushPendingStatus()
    }
```

- `hide()` already ends with `exitKeyMode()` + `previousFrontmostApp = nil` (Task 9); ensure `canvasSessionController.clear()` runs **before** `exitKeyMode()`.

- [ ] **Step 2: `handleEvent` keyDown in content mode — Esc owned by SwiftUI, controller path removed**

A focused `textField`'s typing is owned by SwiftUI (`.onKeyPress` on the field + focusable root). **M8:** now that content mode is key, Esc must be handled exactly once — SwiftUI's `.onKeyPress(.escape)` on the root (`bodyScroll`) and on each focused field already calls `onExitContent()`. The controller-level NSEvent monitor Esc branch would fire a **second** time on top of SwiftUI's handling, so it must be removed in Task 14 (leave the NSEvent monitor observation-only for non-Esc keys):

```swift
            if modeStore.mode == .content {
                return   // Esc + all keys belong to the canvas component (SwiftUI .onKeyPress);
                         // the global monitor stays observation-only — do NOT handle Esc here (M8)
            }
```

- [ ] **Step 3: Invert `testContentModeKeepsPanelNonKey`**

In `PopupCanvasTests.swift` replace the test with:

```swift
    func testContentModeMakesPanelKey() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        let panel = try visiblePanel()

        pump()
        controller.handleActionResult(.showContent(makeResultContent()))
        pump()

        XCTAssertTrue(panel.allowsKey, "content mode is key exactly like search (rule 10 exception)")
        XCTAssertTrue(panel.isKeyWindow)
        controller.exitContent()
        pump()
        XCTAssertFalse(panel.allowsKey, "collapse restores the never-key invariant")
    }

    func testEscFromFocusedTextFieldCollapsesCanvas() throws {
        guard let screen = NSScreen.main else { throw XCTSkip("no screen") }
        let controller = try shownController(for: CGPoint(x: screen.visibleFrame.midX, y: screen.visibleFrame.maxY - 200))
        defer { controller.hide() }
        controller.armCanvasForTesting(tree: .stack(.init(), [
            .textField(CanvasTextFieldProps(id: "field", value: "x", onSubmit: nil)),
            .button(CanvasButtonProps(title: "Go", handler: .effect(.paste("y"))))
        ]), header: CanvasHeader(title: "Form", icon: nil))
        let panel = try visiblePanel()
        pump()

        XCTAssertTrue(panel.allowsKey, "a canvas with a textField becomes key")
        // M8: Esc collapse is owned by SwiftUI `.onKeyPress(.escape)` on the field/root, NOT the
        // controller-level NSEvent monitor (removed in Task 14) — so drive the SwiftUI responder
        // path: post the Esc keyDown into the keyed panel's content view's key event pipeline.
        let escEvent = try XCTUnwrap(keyDown(53))
        panel.sendEvent(escEvent)   // reaches the focused field's .onKeyPress(.escape) → onExitContent()
        pump()
        XCTAssertEqual(controller.modeStore.mode, .actions, "Esc collapses even from a focused textField")
        XCTAssertFalse(panel.isKeyWindow, "collapse restores the never-key invariant")
    }
```

  (`armCanvasForTesting` is an internal test helper on `PopupWindowController` that calls `armCanvas` — add it in Task 14 since `armCanvas` is private; it mirrors the real arm path. Assert Esc collapse via the SwiftUI `.onKeyPress` responder path, matching the M8 fix — the controller-level monitor must NOT handle Esc in content mode.)

- [ ] **Step 4: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh PopupCanvasTests`, `timeout -k 10 60 ./scripts/test.sh PopupKeyModeTests`, then the quick build gate.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add Sources/OpenClip/UI/Popup/PopupWindowController.swift Tests/OpenClipTests/PopupCanvasTests.swift
git commit -m "feat(popup): content mode becomes key via enterKeyMode; focus first interactive on mount"
```

---

### Task 15: Renderer / key / effect-delivery / sizing / accessibility tests

**Files:**
- Create: `Tests/OpenClipTests/CanvasRendererTests.swift` (integration, live panel)
- Create: `Tests/OpenClipTests/CanvasKeyBehaviorTests.swift` (integration, live panel + synthetic events)
- Create: `Tests/OpenClipTests/CanvasEffectDeliveryTests.swift` (unit: `deliverKeyboardEffect` ordering with injected seams)
- (No new source files unless the seams below require them.)

**Interfaces:**
- Consumes: Tasks 11–14 source; `PopupWindowController`, `CanvasSession`, `CanvasComponent`, `CanvasLimits`, `Constants.popupMaxHeight`.

- [ ] **Step 1: Add the two test seams (small, justified)**

- `PopupWindowController`: change `private let resultHandler: ActionResultHandler = DefaultActionResultHandler()` to an internal `var resultHandler: ActionResultHandler` settable in `init` (default unchanged) so `CanvasEffectDeliveryTests` can inject a recording handler.
- `PopupWindowController` keyboard posting: `deliverKeyboardEffect` currently posts via `resultHandler`. To assert ordering without posting real keystrokes into the test host, introduce `protocol KeyboardEventPosting { func postKey(keyCode: CGKeyCode, flags: CGEventFlags) }` + `struct SessionEventTapPoster: KeyboardEventPosting` (delegates to the existing `CGEvent.post(tap: .cgSessionEventTap)` code — the actual posting lives in `DefaultActionResultHandler`; the poster seam only guards *additional* ordering work). Simpler alternative: assert only that `deliverKeyboardEffect` resigns key → activates → calls `handleEffect` → restores key, using a recording `resultHandler` whose `.paste` does nothing (it must not actually post). Document that real `CGEvent` posting is exercised only by the manual smoke test / `GoldenExtensionPlatformTests` (Task 20/26). **Preferred:** make the ordering test inject a recording `ActionResultHandler` and a recording `KeyboardEventPosting`, and have `deliverKeyboardEffect` call the poster for the keycode only when the panel was key. Keep `DefaultActionResultHandler` as the default poster.

- [ ] **Step 2: `CanvasRendererTests` — renderer smoke + sizing**

Helpers: `shownController(for:)`/`visiblePanel()`/`pump()` copied from `PopupCanvasTests`. Tests:

- `testArmsNativeTreeAndGrowsPanel` — arm a stack of text+button via `armCanvasForTesting`; assert `modeStore.mode == .content`, panel height grew beyond the bar.
- `testRendersEveryComponentWithoutCrashing` — arm a tree containing one of each of the 11 components (incl. a list with 2 items, a toggle, a textField, a link); pump; assert panel visible, mode `.content`, no crash.
- `testWidthColumnClampsToLimits` — arm a tree with a wide `image`; assert the panel width ≤ `min(CanvasLimits.canvasMaxWidth, screen.width − 2 × Constants.popupPadding) + tolerance`.
- `testHeightCappedAtPopupMaxHeight` — arm a very long text (well past 240pt); pump until stable; assert `panel.frame.height ≤ Constants.popupMaxHeight + chromeTolerance + 1` (chrome header + padding accounted for; the body scrolls).
- `testPreferredSizeIsFixedAcrossDispatch` — arm with `preferredSize: CanvasSize(width: 320, height: 220)`; run a dispatch that shortens the tree (via a gated fake, see Task 11 fake) — assert the panel does not shrink below the mounted size.
- `testNilPreferredSizeUsesFittingSize` — arm without a size; assert panel sized to content (smaller than the cap).
- `testDividerAndSpacerRender` — stack with a divider + spacer + two texts; no crash; panel present.

- [ ] **Step 3: `CanvasKeyBehaviorTests` — key behavior matrix**

- `testPanelKeyWithFocusedTextFieldAndTypingDoesNotDismiss` — arm tree with a textField; assert panel `isKeyWindow`; send `keyDown(7)` via `controller.handleEvent`; assert panel still visible + `.content` (typing in a focused field never dismisses).
- `testDistanceDismissalSuspendedInContent` — (scroll path already covered in Task 10; here assert the `scrollWheel` case again with a keyed canvas) send a `scrollWheel` event; panel still visible.
- `testClickOutsideHidesEvenWithFocusedTextField` — (covered by existing `leftMouseDown` behavior; add an assertion that a click outside the panel frame hides it while a canvas is key) — use `NSEvent.mouseEvent(with: .leftMouseDown, ...)` at a point outside the panel, delivered through `handleEvent`; assert hidden.
- `testAppDidDeactivateHidesWhileCanvasKey` — post `NSApplication.didResignActiveNotification`; assert hidden (mirrors search-mode behavior).
- `testFirstInteractiveFocusLandsOnTextField` — arm a tree with a button then a textField; pump; assert the panel's first responder is the textField (walk `panel.contentView` for an `NSTextView` first responder) — or assert `session.focusedComponentID == "field"`.
- `testFocusFallsBackToRoot` — arm a tree with no ids (plain text only); assert focus lands on the focusable root (panel remains key; `session.focusedComponentID == nil`).
- `testToggleCommitsAndDispatchesChange` — arm a tree with a toggle (`onToggle: "flip"`) + a gated fake scripting session via `mount` (see Task 11 fake); tap the toggle (drive `controller.dispatch(CanvasEvent(kind: .change, handler: "flip", value: "true", targetID: "tog"))`); release; assert session state bool flipped and the fake received the `change` event. (Tap-driven events from the real SwiftUI `Toggle` are covered by the e2e tests in Task 26.)

- [ ] **Step 4: `CanvasEffectDeliveryTests` — deliverKeyboardEffect ordering**

- `testKeyboardEffectResignsActivatesPostsRestores` — arm a keyed canvas; call `await controller.deliverKeyboardEffect(.paste("x"))`; assert the recording `KeyboardEventPosting` saw the post, the panel ended `allowsKey == true` and still `.content`; assert the recording result handler received `.paste("x")`.
- `testNonKeyboardEffectDoesNotResign` — `deliverKeyboardEffect` never called; instead assert `handleCanvasEffects([.copy("x")])` routes through `resultHandler` with `.copy` and the panel never resigned (wasKey false path only affects `.paste`/`.cut`/`.keyPress`/`.simulatePaste`).
- `testKeyboardEffectWithNoKeyPanelSkipsResign` — canvas not key (panel `allowsKey == false`); deliver `.keyPress`; assert no resign occurred and the poster posted directly.

- [ ] **Step 5: Accessibility assertions (lightweight)**

In `CanvasRendererTests`:
- `testInteractiveNodesExposeLabels` — for a tree with a button titled "Paste", a toggle, a link "Docs", a textField with placeholder — assert the rendered view's accessibility labels contain "Paste"/"Docs" (walk the accessibility tree via `NSAccessibility` on the hosting view; keep the walk shallow and tolerant — if the AX tree is not queryable in CI, assert via `.accessibilityLabel` usage at compile time instead and note it).

- [ ] **Step 5b: Spec §12 edge scenarios (L8) — theming / path safety / disabled nodes / distance / hover**

Add to `CanvasRendererTests` and `CanvasKeyBehaviorTests`:

- `testThemingGlassVsClassicDoesNotRemountCanvas` — arm the same canvas tree once under the Classic theme and once under Glass; assert the panel stays in `.content`, the tree renders identically (assert `session.tree` untouched and no second mount fired), and only the container chrome (`PopupThemeModel` tokens) differs — the canvas content is theme-independent (spec §7.1/§12).
- `testUnsafeImagePathRejectedWithPlaceholder` — arm a tree with an `.image(local:)` pointing at a path outside the extension directory (`Constants.isPathSafe == false`); assert the error placeholder renders (never attempts to read the arbitrary file) and the panel stays up without a session error.
- `testDisabledNodeDoesNotFireOrFocus` — arm a tree with a disabled button and a disabled `listItem`; tap/`onEvent` on the disabled ids; assert no effect/dispatch fired and focus never lands on a disabled id (both firstInteractiveID and explicit `requestFocus` skip them).
- `testDistanceDismissalClosesCanvas` — with a keyed canvas open, synthesize a pointer/scroll event farther than the dismissal distance (the Task 10 scroll distance path); assert the panel dismisses (canvas closes via the normal content-dismissal path).
- `testHoverLongPressStaysInert` — hover over a canvas node and hold (simulate the long-press x-bubble gesture) — assert the canvas stays inert (no long-press context, no hover-preview popover, no focus change; only the normal hover affordance, since hover is observation-only here).

- [ ] **Step 6: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh CanvasRendererTests`, `CanvasKeyBehaviorTests`, `CanvasEffectDeliveryTests`; then the quick build gate.

- [ ] **Step 7: Commit**

```bash
xcodegen generate
git add -A Sources/OpenClip Tests/OpenClipTests/CanvasRendererTests.swift Tests/OpenClipTests/CanvasKeyBehaviorTests.swift Tests/OpenClipTests/CanvasEffectDeliveryTests.swift
git commit -m "test(popup): renderer, key-behavior, effect-delivery, sizing, and accessibility test surfaces"
```

---

### Task 16: Session lifecycle + integration tests

**Files:**
- Create: `Tests/OpenClipTests/CanvasSessionLifecycleTests.swift`
- Edit (only if a gap is found): `Sources/OpenClip/UI/Popup/PopupWindowController.swift`

**Interfaces:**
- Consumes: Tasks 11–15; the gated fake `CanvasScripting` from Task 11.

- [ ] **Step 1: Lifecycle tests (unit, controller-level)**

- `testNewMountReplacesSession` — arm session A; arm session B; assert `controller.session === B`, A's state/tree discarded.
- `testInflightDispatchDiscardedOnReplacement` — dispatch gated on A; `replace(with: B)`; release A's gate; pump; assert B's state untouched, no effects from A's result.
- `testHideCancelsInflightDispatchAndIgnoresLateResult` — dispatch gated; `clear()`; release; pump; assert no write-back, no effects, `session == nil`.
- `testLateMountResultAfterClearIsIgnored` — `mount` gated; `clear()`; release; pump; assert `session == nil` (the armed session from the late mount never appears).
- `testDispatchErrorCollapsesViaOnSessionError` — fake throws on dispatch; assert `onSessionError` fired, `controller.session == nil`.
- `testEffectsFromDispatchNeverDismiss` — drive `onEffects` with `[.paste("x")]`; assert it routes through the window controller's `handleCanvasEffects` and the panel remains `.content` (integration — see Step 2).

- [ ] **Step 2: Integration tests (controller + panel)**

- `testScriptedDispatchReRendersPanelAndKeepsCanvasOpen` — mount a scripting session (gated fake returning a counter tree: text "Count: N"); pump; assert `.content`; `dispatch(.tap)`; release; pump; assert `session.tree` shows "Count: 1" (identity-matched text updated in place — verify `.id` identity kept the same node).
- `testCanvasEffectKeepsCanvasOpen` — fake returns `effects: [.paste("x")]`; after dispatch, assert `modeStore.mode == .content` and panel visible (leaf effects never dismiss, §7).
- `testEscCollapsesAndClearsSession` — arm a session; `controller.handleEvent(keyDown(53))`; pump; assert `modeStore.mode == .actions`, `canvasSessionController.session == nil` (via a test accessor or the mode/content assertions).
- `testMountErrorCollapsesAndShowsErrorBanner` — fake throws on mount; pump; assert mode back to `.actions`, `statusBanner` is an error feedback (`.error` style) — canvas errors surface on the bar banner (§11).
- `testStatusWhileCanvasOpenSurfacesAfterCollapse` — (already covered in Task 13 step 5; keep here as the canonical assertion that `.showStatus` during content queues and flushes on `exitContent`).
- `testHideClearsSessionAndCancelsInflight` — arm gated scripting session; `controller.hide()`; release; pump; assert `modeStore.content == nil`, `controller.session == nil`, no late re-render.

- [ ] **Step 3: Run the full popup test surface**

Run: `timeout -k 10 60 ./scripts/test.sh PopupCanvasTests`, `CanvasSessionLifecycleTests`, `CanvasSessionControllerTests`, `CanvasKeyBehaviorTests`, `CanvasRendererTests`, `CanvasEffectDeliveryTests`; then the quick build gate.

- [ ] **Step 4: Commit**

```bash
xcodegen generate
git add Tests/OpenClipTests/CanvasSessionLifecycleTests.swift
git commit -m "test(popup): canvas session lifecycle + integration coverage"
```

**Done with session + renderer.** Next: `04-migration.md` (Tasks 17–21).
