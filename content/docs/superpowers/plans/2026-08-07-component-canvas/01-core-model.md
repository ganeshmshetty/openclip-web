# 01 — Core Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution preference:** inline (no implementation subagents).

**Goal:** Build the pure-Core component model, event/effect/handler types, session state, engine-agnostic dispatch seam, element parser, tree validator, focus helper, and native DSL — **additively**, touching no existing files.

**Architecture:** All new files land in `Sources/Core/Canvas/`. Everything is `Sendable + Equatable`, no closures in the tree, no AppKit/SwiftUI. The component enum carries optional node-level `id: String?` for identity-matched re-renders; `textField`/`toggle` require a non-optional `id` (state key + focus id). `CanvasElementParser` stays JavaScriptCore-free by parsing the neutral `CanvasElementSpec` (a Codable element object the JS engine produces). `CanvasTreeValidator` enforces the shared limits for both the parser and native mounts.

**Tech Stack:** Swift 6, Foundation, CoreGraphics (`CGFloat` for layout constants). No new dependencies.

## Global Constraints

(From the plan README — every task here inherits them.) Pure value types in `Sources/Core/`; `xcodegen generate` after any `.swift` add/remove/rename; `Self.<static>` never inside `Task.detached`; no hidden singletons; tests use `MemorySettingsStore`/fakes, never `UserDefaults.standard`. Spec: `docs/superpowers/specs/2026-08-07-component-canvas-design.md`.

---

### Task 1: CanvasComponent enum + props structs + effects/handlers/events

**Files:**
- Create: `Sources/Core/Canvas/CanvasComponent.swift` (the enum, all props structs, the three value enums, `CanvasEffect`, `CanvasHandler`, `CanvasEvent`)
- Test: `Tests/OpenClipTests/CanvasComponentTests.swift` (new test file in the repo's single `OpenClipTests` test target)

**Interfaces:**
- Consumes: nothing new (pure additive). Note: `CanvasComponent` is referenced only from this file; later tasks consume these types.
- Produces (used by every later task — exact signatures):
  - `public enum CanvasOrientation: String, Sendable, Equatable { case vertical, horizontal }`
  - `public enum CanvasTextStyle: String, Sendable, Equatable { case title, body, caption, monospaced }`
  - `public enum CanvasColorToken: String, Sendable, Equatable { case primary, secondary, accent }`
  - `public enum CanvasButtonStyle: String, Sendable, Equatable { case accent, plain }`
  - `public enum CanvasIconSource: Sendable, Equatable { case symbol(String), iconify(String), local(URL), url(URL) }`
  - `public enum CanvasImageSource: Sendable, Equatable { case url(URL), local(URL) }`
  - `public enum CanvasEffect: Sendable, Equatable` — leaf-only: `.paste(String)`, `.copy(String)`, `.cut(String)`, `.simulatePaste`, `.keyPress(KeyPressSpec)`, `.runShortcut(name: String, input: String?)`, `.openURL(URL)`, `.showServices(String)`, `.notify(title: String, body: String)` — plus `public var asActionResult: ActionResult` mapping each to its `ActionResult` leaf. (`simulatePaste` is bare — it maps to the payload-less `ActionResult.simulatePaste`, which just posts Cmd+V; carrying a `String` here would be silently dropped.)
  - `public enum CanvasHandler: Sendable, Equatable { case effect(CanvasEffect), dispatch(String) }`
  - `public struct CanvasEvent: Sendable, Equatable` — `kind: Kind` (`.tap`/`.change`/`.submit`), `handler: String`, `value: String?`, `targetID: String?`.
  - Props structs (all `Sendable + Equatable`, memberwise `init` with defaults, `id: String? = nil` except `CanvasTextFieldProps.id: String` and `CanvasToggleProps.id: String` which are non-optional):
    - `CanvasStackProps` (id, orientation, spacing: Double?)
    - `CanvasSpacerProps` (id, minLength: Double?)
    - `CanvasDividerProps` (id)
    - `CanvasTextProps` (id, content, style, color, selectable)
    - `CanvasIconProps` (id, source, size: Double = 14)
    - `CanvasImageProps` (id, source, cornerRadius: Double?, size: CanvasSize?) — `size` bounds an oversized image to the column (spec §7.1); the renderer (`03-session-renderer.md`, Task 12) must honor it. `CanvasSize` (width/height pair) is defined in Task 2.
    - `CanvasButtonProps` (id, title, icon, style, disabled: Bool = false, handler: CanvasHandler?)
    - `CanvasListProps` (id) — sections are carried by the `.list` case payload (`[CanvasListSection]`)
    - `CanvasListItem` (id, icon, title, subtitle, badge, disabled, handler)
    - `CanvasListSection` (id, header: String?, items: [CanvasListItem]) — section headers for `list` (spec §7 list sections)
    - `CanvasTextFieldProps` (id: String, value, placeholder, onSubmit: CanvasHandler?, onChange: CanvasHandler?)
    - `CanvasToggleProps` (id: String, value: Bool, onToggle: CanvasHandler?)
    - `CanvasLinkProps` (id, title, url: URL)
  - `public enum CanvasComponent: Sendable, Equatable` with cases `.stack(CanvasStackProps, [CanvasComponent])`, `.divider(CanvasDividerProps)`, `.spacer(CanvasSpacerProps)`, `.text(CanvasTextProps)`, `.icon(CanvasIconProps)`, `.image(CanvasImageProps)`, `.button(CanvasButtonProps)`, `.list(CanvasListProps, [CanvasListSection])`, `.textField(CanvasTextFieldProps)`, `.toggle(CanvasToggleProps)`, `.link(CanvasLinkProps)`.

- [ ] **Step 1: Confirm the `OpenClipTests` test directory exists**

```bash
ls Sources/Core/Canvas 2>/dev/null || mkdir -p Sources/Core/Canvas
ls Tests/OpenClipTests 2>/dev/null || mkdir -p Tests/OpenClipTests
```

The repo's single test target is `OpenClipTests` → `Tests/OpenClipTests/`, so new test files go straight there; `xcodegen generate` still regenerates the project to pick up new files.

- [ ] **Step 2: Write the failing test**

```swift
import XCTest
import Core

final class CanvasComponentTests: XCTestCase {
    func testComponentIsSendableAndEquatable() {
        let a = CanvasComponent.text(CanvasTextProps(content: "hi"))
        let b = CanvasComponent.text(CanvasTextProps(content: "hi"))
        XCTAssertEqual(a, b)
        XCTAssertTrue(SendableCheck(a))
    }

    func testTextSquaredEqualityIgnoresHandlersByValue() {
        let one = CanvasComponent.button(CanvasButtonProps(title: "Go", handler: .effect(.paste("x"))))
        let two = CanvasComponent.button(CanvasButtonProps(title: "Go", handler: .effect(.copy("x"))))
        XCTAssertNotEqual(one, two)
    }

    func testTextFieldRequiresIDAndEquals() {
        let f1 = CanvasComponent.textField(CanvasTextFieldProps(id: "field", value: "a"))
        let f2 = CanvasComponent.textField(CanvasTextFieldProps(id: "field", value: "a"))
        XCTAssertEqual(f1, f2)
        XCTAssertNotEqual(f1, CanvasComponent.textField(CanvasTextFieldProps(id: "other", value: "a")))
    }

    func testCanvasEffectMapsToActionResultLeaves() {
        XCTAssertEqual(CanvasEffect.paste("s").asActionResult, .paste("s"))
        XCTAssertEqual(CanvasEffect.copy("s").asActionResult, .copy("s"))
        XCTAssertEqual(CanvasEffect.cut("s").asActionResult, .cut("s"))
        XCTAssertEqual(CanvasEffect.simulatePaste.asActionResult, .simulatePaste)
        XCTAssertEqual(CanvasEffect.openURL(URL(string: "https://x")!).asActionResult, .openURL(URL(string: "https://x")!))
    }
}

/// Compile-time Sendable conformance probe (no-op at runtime).
func SendableCheck<T: Sendable>(_ value: T) -> Bool { true }
```

- [ ] **Step 3: Run to verify it fails**

Run: `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build` — or the class-scoped test once the target builds.
Expected: FAIL with "cannot find 'CanvasComponent' in scope".

- [ ] **Step 4: Implement**

Create `Sources/Core/Canvas/CanvasComponent.swift`:

```swift
// CanvasComponent.swift
// OpenClip
//
// The typed component tree that powers the interactive content canvas (spec §4). Every node is
// pure data — Sendable + Equatable, no closures, no AppKit/SwiftUI — so native actions (Task 8
// DSL) and extensions (JS h() element objects parsed via CanvasElementSpec, Task 6) build the
// same tree. Node-level `id: String?` enables identity-matched re-renders for implicit
// animations (spec §7.2); `textField`/`toggle` carry a required `id` that doubles as the state
// key and the SwiftUI focus id.
import Foundation

public enum CanvasOrientation: String, Sendable, Equatable {
    case vertical
    case horizontal
}

public enum CanvasTextStyle: String, Sendable, Equatable {
    case title
    case body
    case caption
    case monospaced
}

public enum CanvasColorToken: String, Sendable, Equatable {
    case primary
    case secondary
    case accent
}

public enum CanvasButtonStyle: String, Sendable, Equatable {
    case accent
    case plain
}

/// An icon the renderer resolves through the app's existing icon pipeline (SF Symbol, Iconify
/// "prefix:name", local file inside the extension directory, or remote URL).
public enum CanvasIconSource: Sendable, Equatable {
    case symbol(String)
    case iconify(String)
    case local(URL)
    case url(URL)
}

/// An image resolved through the existing loader pipeline (AsyncImage / LocalIconCache / SVG).
public enum CanvasImageSource: Sendable, Equatable {
    case url(URL)
    case local(URL)
}

/// A leaf effect a canvas node may carry (spec §4.1). Deliberately no `.success`/`.failure`/
/// `.none`, no presentation results, no `.sequence`/`.keepVisible` — a canvas re-renders via
/// `.dispatch`, and in-session dismissal is suppressed. Staying `Equatable + Sendable` keeps the
/// tree's conformances (an `Error` payload would break both).
public enum CanvasEffect: Sendable, Equatable {
    case paste(String)
    case copy(String)
    case cut(String)
    case simulatePaste
    case keyPress(KeyPressSpec)
    case runShortcut(name: String, input: String?)
    case openURL(URL)
    case showServices(String)
    case notify(title: String, body: String)

    /// The leaf effect as an `ActionResult` for the existing effect door.
    public var asActionResult: ActionResult {
        switch self {
        case .paste(let text): return .paste(text)
        case .copy(let text): return .copy(text)
        case .cut(let text): return .cut(text)
        case .simulatePaste: return .simulatePaste
        case .keyPress(let spec): return .keyPress(spec)
        case .runShortcut(let name, let input): return .runShortcut(name: name, input: input)
        case .openURL(let url): return .openURL(url)
        case .showServices(let text): return .showServices(text)
        case .notify(let title, let body): return .notify(title: title, body: body)
        }
    }
}

/// What a node does when activated (spec §4.1): a leaf effect, or a named handler the session
/// resolves (JS `handlers[name]`; native registration deferred in v1).
public enum CanvasHandler: Sendable, Equatable {
    case effect(CanvasEffect)
    case dispatch(String)
}

/// The event payload crossing the `CanvasScripting` dispatch seam (spec §4.1a), matching the JS
/// event payload shape one-to-one.
public struct CanvasEvent: Sendable, Equatable {
    public enum Kind: String, Sendable, Equatable {
        case tap       // button / listItem / link / toggle activation
        case change    // committed value: textField blur/submit, toggle flip
        case submit    // textField Enter (distinct from change for handler branching)
    }

    public let kind: Kind
    public let handler: String
    public let value: String?
    public let targetID: String?

    public init(kind: Kind, handler: String, value: String? = nil, targetID: String? = nil) {
        self.kind = kind
        self.handler = handler
        self.value = value
        self.targetID = targetID
    }
}

// MARK: - Props

public struct CanvasStackProps: Sendable, Equatable {
    public var id: String?
    public var orientation: CanvasOrientation
    public var spacing: Double?

    public init(id: String? = nil, orientation: CanvasOrientation = .vertical, spacing: Double? = nil) {
        self.id = id
        self.orientation = orientation
        self.spacing = spacing
    }
}

public struct CanvasSpacerProps: Sendable, Equatable {
    public var id: String?
    public var minLength: Double?

    public init(id: String? = nil, minLength: Double? = nil) {
        self.id = id
        self.minLength = minLength
    }
}

public struct CanvasDividerProps: Sendable, Equatable {
    public var id: String?

    public init(id: String? = nil) {
        self.id = id
    }
}

public struct CanvasTextProps: Sendable, Equatable {
    public var id: String?
    public var content: String
    public var style: CanvasTextStyle
    public var color: CanvasColorToken
    public var selectable: Bool

    public init(id: String? = nil, content: String, style: CanvasTextStyle = .body,
                color: CanvasColorToken = .primary, selectable: Bool = false) {
        self.id = id
        self.content = content
        self.style = style
        self.color = color
        self.selectable = selectable
    }
}

public struct CanvasIconProps: Sendable, Equatable {
    public var id: String?
    public var source: CanvasIconSource
    public var size: Double

    public init(id: String? = nil, source: CanvasIconSource, size: Double = 14) {
        self.id = id
        self.source = source
        self.size = size
    }
}

public struct CanvasImageProps: Sendable, Equatable {
    public var id: String?
    public var source: CanvasImageSource
    public var cornerRadius: Double?
    /// Optional width/height pair bounding the rendered image in the column (spec §7.1). The
    /// renderer (`03-session-renderer.md`, Task 12) caps oversized images to this. `CanvasSize`
    /// is defined in Task 2.
    public var size: CanvasSize?

    public init(id: String? = nil, source: CanvasImageSource, cornerRadius: Double? = nil, size: CanvasSize? = nil) {
        self.id = id
        self.source = source
        self.cornerRadius = cornerRadius
        self.size = size
    }
}

public struct CanvasButtonProps: Sendable, Equatable {
    public var id: String?
    public var title: String
    public var icon: CanvasIconSource?
    public var style: CanvasButtonStyle
    public var disabled: Bool
    public var handler: CanvasHandler?

    public init(id: String? = nil, title: String, icon: CanvasIconSource? = nil,
                style: CanvasButtonStyle = .plain, disabled: Bool = false, handler: CanvasHandler? = nil) {
        self.id = id
        self.title = title
        self.icon = icon
        self.style = style
        self.disabled = disabled
        self.handler = handler
    }
}

public struct CanvasListProps: Sendable, Equatable {
    public var id: String?

    public init(id: String? = nil) {
        self.id = id
    }
}

public struct CanvasListItem: Sendable, Equatable {
    public var id: String?
    public var icon: CanvasIconSource?
    public var title: String
    public var subtitle: String?
    public var badge: String?
    public var disabled: Bool
    public var handler: CanvasHandler?

    public init(id: String? = nil, icon: CanvasIconSource? = nil, title: String,
                subtitle: String? = nil, badge: String? = nil, disabled: Bool = false,
                handler: CanvasHandler? = nil) {
        self.id = id
        self.icon = icon
        self.title = title
        self.subtitle = subtitle
        self.badge = badge
        self.disabled = disabled
        self.handler = handler
    }
}

/// A `list` section: an optional header plus its items (spec §7 list sections). v1 ships on
/// `Canvas`-built/simple lists as a single implicit section; the header renders when non-nil.
public struct CanvasListSection: Sendable, Equatable {
    public var id: String?
    public var header: String?
    public var items: [CanvasListItem]

    public init(id: String? = nil, header: String? = nil, items: [CanvasListItem]) {
        self.id = id
        self.header = header
        self.items = items
    }
}

public struct CanvasTextFieldProps: Sendable, Equatable {
    public var id: String
    public var value: String
    public var placeholder: String?
    public var onSubmit: CanvasHandler?
    public var onChange: CanvasHandler?

    public init(id: String, value: String, placeholder: String? = nil,
                onSubmit: CanvasHandler? = nil, onChange: CanvasHandler? = nil) {
        self.id = id
        self.value = value
        self.placeholder = placeholder
        self.onSubmit = onSubmit
        self.onChange = onChange
    }
}

public struct CanvasToggleProps: Sendable, Equatable {
    public var id: String
    public var value: Bool
    public var onToggle: CanvasHandler?

    public init(id: String, value: Bool, onToggle: CanvasHandler? = nil) {
        self.id = id
        self.value = value
        self.onToggle = onToggle
    }
}

public struct CanvasLinkProps: Sendable, Equatable {
    public var id: String?
    public var title: String
    public var url: URL

    public init(id: String? = nil, title: String, url: URL) {
        self.id = id
        self.title = title
        self.url = url
    }
}

// MARK: - Component

public enum CanvasComponent: Sendable, Equatable {
    case stack(CanvasStackProps, [CanvasComponent])
    case divider(CanvasDividerProps)
    case spacer(CanvasSpacerProps)
    case text(CanvasTextProps)
    case icon(CanvasIconProps)
    case image(CanvasImageProps)
    case button(CanvasButtonProps)
    case list(CanvasListProps, [CanvasListSection])
    case textField(CanvasTextFieldProps)
    case toggle(CanvasToggleProps)
    case link(CanvasLinkProps)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./scripts/test.sh CanvasComponentTests`
Expected: PASS (all 4 tests).

- [ ] **Step 6: Regenerate + quick build gate**

```bash
xcodegen generate
timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build
```

- [ ] **Step 7: Commit**

```bash
git add Sources/Core/Canvas/CanvasComponent.swift Tests/OpenClipTests/CanvasComponentTests.swift project.yml
git commit -m "feat(core): add CanvasComponent tree, props, effects, handlers, events"
```

---

### Task 2: CanvasSessionState, JSONValue, CanvasSize, CanvasHeader

**Files:**
- Create: `Sources/Core/Canvas/CanvasSessionState.swift` (JSONValue + CanvasSessionState + CanvasSize + CanvasHeader)
- Test: `Tests/OpenClipTests/CanvasSessionStateTests.swift`

**Interfaces:**
- Consumes: nothing (self-contained).
- Produces:
  - `public enum JSONValue: Sendable, Equatable, Codable` — `.string(String)`, `.number(Double)`, `.bool(Bool)`, `.null`, `.array([JSONValue])`, `.object([String: JSONValue])`, with custom `init(from:)`/`encode(to:)` (single-value container), plus `public var stringValue: String?`, `public var boolValue: Bool?`, `public var numberValue: Double?`.
  - `public struct CanvasSessionState: Sendable, Equatable, Codable` — wraps `public var values: [String: JSONValue]`; `public subscript(_ key: String) -> JSONValue?`; `public func string(_ key: String) -> String?`; `public func bool(_ key: String) -> Bool?`.
  - `public struct CanvasSize: Sendable, Equatable { public var width: Double; public var height: Double }`.
  - `public struct CanvasHeader: Sendable, Equatable { public var title: String; public var icon: String? }`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import Core

final class CanvasSessionStateTests: XCTestCase {
    func testJSONValueCodableRoundTrip() throws {
        let input: JSONValue = .object([
            "count": .number(2),
            "name": .string("x"),
            "on": .bool(true),
            "nil": .null,
            "list": .array([.number(1), .number(2)])
        ])
        let data = try JSONEncoder().encode(input)
        let decoded = try JSONDecoder().decode(JSONValue.self, from: data)
        XCTAssertEqual(input, decoded)
    }

    func testJSONValueConvenience() {
        XCTAssertEqual(JSONValue.number(3).numberValue, 3)
        XCTAssertEqual(JSONValue.string("s").stringValue, "s")
        XCTAssertEqual(JSONValue.bool(true).boolValue, true)
    }

    func testSessionStateSubscriptAndString() {
        var state = CanvasSessionState()
        state["count"] = .number(1)
        state["name"] = .string("a")
        XCTAssertEqual(state["count"], .number(1))
        XCTAssertEqual(state.string("name"), "a")
        XCTAssertNil(state.string("count"))
    }

    func testSessionStateCodableRoundTrip() throws {
        var state = CanvasSessionState()
        state["a"] = .string("v")
        let data = try JSONEncoder().encode(state)
        let decoded = try JSONDecoder().decode(CanvasSessionState.self, from: data)
        XCTAssertEqual(decoded, state)
    }

    func testSizeAndHeader() {
        let size = CanvasSize(width: 300, height: 240)
        XCTAssertEqual(size.width, 300)
        let header = CanvasHeader(title: "AI Result", icon: "sparkles")
        XCTAssertEqual(header.title, "AI Result")
        XCTAssertEqual(header.icon, "sparkles")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh CanvasSessionStateTests`
Expected: FAIL with "cannot find 'JSONValue' in scope".

- [ ] **Step 3: Implement**

Create `Sources/Core/Canvas/CanvasSessionState.swift`:

```swift
// CanvasSessionState.swift
// OpenClip
//
// The app-owned, JSON-serializable session state for a canvas session (spec §4.2): a dictionary of
// JSONValue keyed by the stable textField/toggle ids. Values are injected into each JS evaluation
// and written back after a dispatch — state is never JS-heap-resident between events, which keeps
// the engine fresh-context while the canvas feels stateful. Also carries the Core value types
// CanvasSize (a width/height pair, no AppKit) and CanvasHeader (chrome title/icon supplied by the
// running action). Pure Core — no AppKit/SwiftUI.
import Foundation

/// A JSON-serializable scalar/collection value used by CanvasSessionState and CanvasElementSpec.
public enum JSONValue: Sendable, Equatable, Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    public var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }

    public var boolValue: Bool? {
        if case .bool(let value) = self { return value }
        return nil
    }

    public var numberValue: Double? {
        if case .number(let value) = self { return value }
        return nil
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode([JSONValue].self) {
            self = .array(value)
        } else if let value = try? container.decode([String: JSONValue].self) {
            self = .object(value)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid JSONValue payload"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .null: try container.encodeNil()
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}

/// App-owned session state: a JSON-serializable dictionary keyed by stable component ids (spec §4.2).
public struct CanvasSessionState: Sendable, Equatable, Codable {
    public var values: [String: JSONValue]

    public init(_ values: [String: JSONValue] = [:]) {
        self.values = values
    }

    public subscript(_ key: String) -> JSONValue? {
        get { values[key] }
        set { values[key] = newValue }
    }

    public func string(_ key: String) -> String? {
        values[key]?.stringValue
    }

    public func bool(_ key: String) -> Bool? {
        values[key]?.boolValue
    }
}

/// A Core width/height pair (no AppKit) declared once at mount (spec §7.1).
public struct CanvasSize: Sendable, Equatable {
    public var width: Double
    public var height: Double

    public init(width: Double, height: Double) {
        self.width = width
        self.height = height
    }
}

/// Chrome header (title + optional icon) for the canvas, supplied by the running action (spec §7).
/// The tree carries no root title; producers cannot override the header.
public struct CanvasHeader: Sendable, Equatable {
    public var title: String
    public var icon: String?

    public init(title: String, icon: String? = nil) {
        self.title = title
        self.icon = icon
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh CanvasSessionStateTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add Sources/Core/Canvas/CanvasSessionState.swift Tests/OpenClipTests/CanvasSessionStateTests.swift
git commit -m "feat(core): add CanvasSessionState, JSONValue, CanvasSize, CanvasHeader"
```

---

### Task 3: CanvasLimits, CanvasTreeValidator, and the popupMaxHeight rename

**Files:**
- Create: `Sources/Core/Canvas/CanvasLimits.swift` (CanvasLimits + CanvasTreeValidator + CanvasParseError)
- Modify: `Sources/Core/Selection/Constants.swift:29` (rename `searchMaxHeight` → `popupMaxHeight`)
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift:346` (the single `Constants.searchMaxHeight` call site)
- Test: `Tests/OpenClipTests/CanvasTreeValidatorTests.swift`

**Interfaces:**
- Consumes: `CanvasComponent` (Task 1), `CanvasTextFieldProps`/`CanvasTextProps`/`CanvasListProps`/`CanvasListSection`/`CanvasListItem`.
- Produces:
  - `public enum CanvasLimits { static let maxNodes = 512; static let maxDepth = 32; static let maxListItems = 64; static let maxTextLength = 32_000; static let canvasMinWidth: CGFloat = 220; static let canvasIdealWidth: CGFloat = 300; static let canvasMaxWidth: CGFloat = 360 }`
  - `public enum CanvasParseError: Error, Equatable { case tooManyNodes; case depthExceeded; case tooManyListItems; case textTooLong; case nonObjectRoot }`
  - `public enum CanvasTreeValidator { public static func validate(_ tree: CanvasComponent) throws }`
  - `Constants.popupMaxHeight: CGFloat = 240` (renamed; code value 240 wins over the stale comment).

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import Core

final class CanvasTreeValidatorTests: XCTestCase {
    private func stackOf(_ n: Int) -> CanvasComponent {
        var children: [CanvasComponent] = []
        for _ in 0..<n { children.append(.divider(CanvasDividerProps())) }
        return .stack(CanvasStackProps(), children)
    }

    func testValidTreePasses() throws {
        try CanvasTreeValidator.validate(.text(CanvasTextProps(content: "ok")))
        try CanvasTreeValidator.validate(.stack(CanvasStackProps(), [.text(CanvasTextProps(content: "a")), .divider(CanvasDividerProps())]))
    }

    func testTooManyNodesRejected() {
        let tree = stackOf(CanvasLimits.maxNodes + 1)
        XCTAssertThrowsError(try CanvasTreeValidator.validate(tree)) { error in
            XCTAssertEqual(error as? CanvasParseError, .tooManyNodes)
        }
    }

    func testDepthExceededRejected() {
        var nested: CanvasComponent = .divider(CanvasDividerProps())
        for _ in 0...CanvasLimits.maxDepth {
            nested = .stack(CanvasStackProps(), [nested])
        }
        XCTAssertThrowsError(try CanvasTreeValidator.validate(nested)) { error in
            XCTAssertEqual(error as? CanvasParseError, .depthExceeded)
        }
    }

    func testTooManyListItemsRejected() {
        var items: [CanvasListItem] = []
        for i in 0..<CanvasLimits.maxListItems + 1 {
            items.append(CanvasListItem(title: "\(i)"))
        }
        let tree = CanvasComponent.list(CanvasListProps(), [CanvasListSection(items: items)])
        XCTAssertThrowsError(try CanvasTreeValidator.validate(tree)) { error in
            XCTAssertEqual(error as? CanvasParseError, .tooManyListItems)
        }
    }

    func testTextTooLongRejected() {
        let long = String(repeating: "x", count: CanvasLimits.maxTextLength + 1)
        let tree = CanvasComponent.text(CanvasTextProps(content: long))
        XCTAssertThrowsError(try CanvasTreeValidator.validate(tree)) { error in
            XCTAssertEqual(error as? CanvasParseError, .textTooLong)
        }
    }

    func testConstantsRenamed() {
        XCTAssertEqual(Constants.popupMaxHeight, 240)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh CanvasTreeValidatorTests`
Expected: FAIL with "cannot find 'CanvasLimits' in scope" and "cannot find 'Constants.popupMaxHeight'".

- [ ] **Step 3: Implement**

Create `Sources/Core/Canvas/CanvasLimits.swift`:

```swift
// CanvasLimits.swift
// OpenClip
//
// Core constants bounding a canvas tree (spec §5.3) so a buggy or hostile extension cannot emit a
// pathological tree, plus the shared structural validator used by both CanvasElementParser (Task 6)
// and native mounts (CanvasSessionController). A violation rejects the whole canvas with an error
// status — it is never truncated or partially rendered. Pure Core — no AppKit/SwiftUI.
import Foundation
import CoreGraphics

public enum CanvasLimits {
    /// Max nodes in a canvas tree (spec §5.3).
    public static let maxNodes = 512
    /// Max nesting depth: each nested `stack` or `list` adds one level (spec §5.3).
    public static let maxDepth = 32
    /// Max list items per `list` node (spec §5.3, confirmed 2026-08-08).
    public static let maxListItems = 64
    /// Max characters per `text` node (spec §5.3, confirmed 2026-08-08: 32k because a typical AI
    /// completion runs 15–18k chars).
    public static let maxTextLength = 32_000
    /// Canvas body width constraints (spec §7.1); clamped to screen minus popup padding at render.
    public static let canvasMinWidth: CGFloat = 220
    public static let canvasIdealWidth: CGFloat = 300
    public static let canvasMaxWidth: CGFloat = 360
}

/// Structural validation failure. These reject the whole canvas (spec §5.3, §11).
public enum CanvasParseError: Error, Equatable {
    case tooManyNodes
    case depthExceeded
    case tooManyListItems
    case textTooLong
    case nonObjectRoot
}

public enum CanvasTreeValidator {
    /// Validates the whole tree against CanvasLimits. Throws CanvasParseError on the first violation.
    public static func validate(_ tree: CanvasComponent) throws {
        var nodeCount = 0
        func walk(_ node: CanvasComponent, depth: Int) throws {
            nodeCount += 1
            if nodeCount > CanvasLimits.maxNodes { throw CanvasParseError.tooManyNodes }
            if depth > CanvasLimits.maxDepth { throw CanvasParseError.depthExceeded }
            switch node {
            case .stack(_, let children):
                for child in children {
                    try walk(child, depth: depth + 1)
                }
            case .text(let props):
                if props.content.count > CanvasLimits.maxTextLength { throw CanvasParseError.textTooLong }
            case .list(_, let sections):
                let itemCount = sections.reduce(0) { $0 + $1.items.count }
                if itemCount > CanvasLimits.maxListItems { throw CanvasParseError.tooManyListItems }
            case .divider(_), .spacer, .icon, .image, .button, .textField, .toggle, .link:
                break
            }
        }
        try walk(tree, depth: 0)
    }
}
```

Modify `Sources/Core/Selection/Constants.swift` line 29:

```swift
    /// Shared height cap for the popup panel (search palette field + result rows, and the canvas
    /// body). The code value 240 wins over any stale comment.
    public static let popupMaxHeight: CGFloat = 240
```

Modify `Sources/OpenClip/UI/Popup/PopupWindowController.swift` line 346:

```swift
        size.height = min(size.height, Constants.popupMaxHeight)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh CanvasTreeValidatorTests`
Expected: PASS.

- [ ] **Step 5: Regenerate + quick build gate**

```bash
xcodegen generate
timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build
```

- [ ] **Step 6: Commit**

```bash
git add Sources/Core/Canvas/CanvasLimits.swift Sources/Core/Selection/Constants.swift Sources/OpenClip/UI/Popup/PopupWindowController.swift Tests/OpenClipTests/CanvasTreeValidatorTests.swift
git commit -m "feat(core): add CanvasLimits + CanvasTreeValidator; rename searchMaxHeight to popupMaxHeight"
```

---

### Task 4: CanvasScripting protocol + mount/dispatch requests + results

**Files:**
- Create: `Sources/Core/Canvas/CanvasScripting.swift`
- Test: `Tests/OpenClipTests/CanvasScriptingTests.swift`

**Interfaces:**
- Consumes: `CanvasEvent` (Task 1), `CanvasSessionState`, `CanvasSize`, `JSONValue` (Task 2 — `JSONValue` backs the new `optionValues` field), `CanvasComponent` (Task 1), `CanvasEffect` (Task 1).
- Produces (the engine-agnostic dispatch boundary, spec §5.2):
  - `public struct CanvasMountRequest: Sendable` — `initialState: CanvasSessionState`, `input: String`, `optionValues: [String: JSONValue]`, `preferredSize: CanvasSize?`, `scriptCode: String`, `isAsync: Bool`.
  - `public struct CanvasDispatchRequest: Sendable` — `event: CanvasEvent`, `state: CanvasSessionState`.
  - `public struct CanvasMountResult: Sendable` — `state: CanvasSessionState`, `tree: CanvasComponent`.
  - `public struct CanvasDispatchResult: Sendable` — `state: CanvasSessionState`, `tree: CanvasComponent`, `effects: [CanvasEffect]`.
  - `public protocol CanvasScripting: Sendable` — `func mount(_ request: CanvasMountRequest) async throws -> CanvasMountResult` and `func dispatch(_ request: CanvasDispatchRequest) async throws -> CanvasDispatchResult`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import Core

final class CanvasScriptingTests: XCTestCase {
    func testMountRequestFields() {
        let request = CanvasMountRequest(
            initialState: CanvasSessionState(["a": .string("v")]),
            input: "hello",
            optionValues: ["unit": .string("celsius")],
            preferredSize: CanvasSize(width: 300, height: 240),
            scriptCode: "const ui = () => h('text', {});",
            isAsync: false
        )
        XCTAssertEqual(request.input, "hello")
        XCTAssertEqual(request.initialState.string("a"), "v")
        XCTAssertEqual(request.optionValues, ["unit": .string("celsius")])
        XCTAssertEqual(request.preferredSize?.width, 300)
        XCTAssertEqual(request.scriptCode, "const ui = () => h('text', {});")
        XCTAssertFalse(request.isAsync)
    }

    func testDispatchRequestFields() {
        let event = CanvasEvent(kind: .tap, handler: "increment", value: nil, targetID: "b1")
        let request = CanvasDispatchRequest(event: event, state: CanvasSessionState())
        XCTAssertEqual(request.event.handler, "increment")
    }

    func testResultsAreSendable() {
        let result = CanvasDispatchResult(
            state: CanvasSessionState(["n": .number(1)]),
            tree: .text(CanvasTextProps(content: "hi")),
            effects: [.copy("hi")]
        )
        XCTAssertEqual(result.effects, [.copy("hi")])
        XCTAssertTrue(SendableCheck(result))
    }
}

func SendableCheck<T: Sendable>(_ value: T) -> Bool { true }
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh CanvasScriptingTests`
Expected: FAIL with "cannot find 'CanvasMountRequest' in scope".

- [ ] **Step 3: Implement**

Create `Sources/Core/Canvas/CanvasScripting.swift`:

```swift
// CanvasScripting.swift
// OpenClip
//
// The engine-agnostic dispatch boundary between the canvas session and whatever runtime evaluates
// a canvas (spec §5.2). v1 implements this as JavaScriptCanvasEngine (in-process fresh eval); a
// future bounded-session engine (persisted state, mid-flight render(), ticks) or an out-of-process
// engine implements the same protocol — the component model, renderer, and chrome never change.
//
// CanvasMountRequest carries everything the engine needs to produce the initial tree: the source
// (scriptCode) it must compile, the selection input, the producer-resolved optionValues (surfaced
// to the JS context as openclip.options; JSONValue is defined in Task 2), the initial app-owned
// state, and an optional preferredSize declared once at mount and fixed for the session.
// CanvasDispatchRequest carries the event and the current state; the mount size stays fixed across
// dispatches. Pure Core — the request structs are Sendable value types, no AppKit/SwiftUI.
import Foundation

public struct CanvasMountRequest: Sendable {
    public var initialState: CanvasSessionState
    public var input: String
    public var optionValues: [String: JSONValue]
    public var preferredSize: CanvasSize?
    public var scriptCode: String
    public var isAsync: Bool

    public init(
        initialState: CanvasSessionState = CanvasSessionState(),
        input: String,
        optionValues: [String: JSONValue] = [:],
        preferredSize: CanvasSize? = nil,
        scriptCode: String = "",
        isAsync: Bool = false
    ) {
        self.initialState = initialState
        self.input = input
        self.optionValues = optionValues
        self.preferredSize = preferredSize
        self.scriptCode = scriptCode
        self.isAsync = isAsync
    }
}

public struct CanvasDispatchRequest: Sendable {
    public var event: CanvasEvent
    public var state: CanvasSessionState

    public init(event: CanvasEvent, state: CanvasSessionState) {
        self.event = event
        self.state = state
    }
}

public struct CanvasMountResult: Sendable {
    public var state: CanvasSessionState
    public var tree: CanvasComponent

    public init(state: CanvasSessionState, tree: CanvasComponent) {
        self.state = state
        self.tree = tree
    }
}

public struct CanvasDispatchResult: Sendable {
    public var state: CanvasSessionState
    public var tree: CanvasComponent
    public var effects: [CanvasEffect]

    public init(state: CanvasSessionState, tree: CanvasComponent, effects: [CanvasEffect] = []) {
        self.state = state
        self.tree = tree
        self.effects = effects
    }
}

public protocol CanvasScripting: Sendable {
    func mount(_ request: CanvasMountRequest) async throws -> CanvasMountResult
    func dispatch(_ request: CanvasDispatchRequest) async throws -> CanvasDispatchResult
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh CanvasScriptingTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add Sources/Core/Canvas/CanvasScripting.swift Tests/OpenClipTests/CanvasScriptingTests.swift
git commit -m "feat(core): add CanvasScripting seam + mount/dispatch request/result types"
```

---

### Task 5: CanvasElementSpec + CanvasElementParser

**Files:**
- Create: `Sources/Core/Canvas/CanvasElementSpec.swift` (the Codable element object)
- Create: `Sources/Core/Canvas/CanvasElementParser.swift` (JS element object → CanvasComponent)
- Test: `Tests/OpenClipTests/CanvasElementParserTests.swift`

**Interfaces:**
- Consumes: `CanvasComponent`/props (Task 1), `JSONValue` (Task 2), `CanvasTreeValidator`/`CanvasParseError` (Task 3), `CanvasHandler`/`CanvasEffect` (Task 1).
- Produces:
  - `public struct CanvasElementSpec: Codable, Sendable, Equatable { public var type: String; public var props: [String: JSONValue]; public var children: [CanvasElementSpec] }`
  - `public enum CanvasElementParser { public static func parseTree(_ spec: CanvasElementSpec) throws -> CanvasComponent; static func parseElement(_ spec: CanvasElementSpec) -> CanvasComponent? }`
  - Recovery rules (spec §5.4): unknown `type` → nil (drop node, keep siblings); unknown/malformed handler → node renders non-interactive (handler nil); invalid `link` URL → nil; non-array `children` → ignored (empty); unknown color/style token → default; missing `textField`/`toggle` `id` → drop node. Structural violations (`CanvasParseError`) reject the whole canvas.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import Core

private extension JSONValue {
    static func str(_ s: String) -> JSONValue { .string(s) }
    static func num(_ d: Double) -> JSONValue { .number(d) }
    static func bol(_ b: Bool) -> JSONValue { .bool(b) }
}

final class CanvasElementParserTests: XCTestCase {
    private func element(_ type: String, _ props: [String: JSONValue] = [:],
                         _ children: [CanvasElementSpec] = []) -> CanvasElementSpec {
        CanvasElementSpec(type: type, props: props, children: children)
    }

    func testParsesTextNode() throws {
        let spec = element("text", ["content": .str("hello"), "style": .str("title")])
        let tree = try CanvasElementParser.parseTree(spec)
        XCTAssertEqual(tree, .text(CanvasTextProps(content: "hello", style: .title)))
    }

    func testParsesNestedStackWithButton() throws {
        let spec = element("stack", ["orientation": .str("vertical")], [
            element("button", ["title": "Go", "handler": .str("go")]),
            element("text", ["content": .str("bye")])
        ])
        let tree = try CanvasElementParser.parseTree(spec)
        guard case .stack(_, let children) = tree else {
            return XCTFail("expected stack, got \(tree)")
        }
        XCTAssertEqual(children.count, 2)
        if case .button(let props) = children[0] {
            XCTAssertEqual(props.title, "Go")
            XCTAssertEqual(props.handler, .dispatch("go"))
        } else {
            XCTFail("expected button, got \(children[0])")
        }
    }

    func testUnknownTypeDropped() throws {
        let spec = element("stack", [:], [
            element("bogus", ["title": "x"]),
            element("text", ["content": .str("kept")])
        ])
        let tree = try CanvasElementParser.parseTree(spec)
        guard case .stack(_, let children) = tree else {
            return XCTFail("expected stack, got \(tree)")
        }
        XCTAssertEqual(children.count, 1)
        XCTAssertEqual(children[0], .text(CanvasTextProps(content: "kept")))
    }

    func testMalformedHandlerRendersStatic() throws {
        let spec = element("button", ["title": "B", "handler": .num(3)])
        let tree = try CanvasElementParser.parseTree(spec)
        guard case .button(let props) = tree else {
            return XCTFail("expected button, got \(tree)")
        }
        XCTAssertNil(props.handler, "non-string handler renders the node non-interactive")
    }

    func testEffectHandlerObjectParsed() throws {
        let spec = element("button", [
            "title": "Copy",
            "handler": .object(["type": "copy", "text": "hi"])
        ])
        let tree = try CanvasElementParser.parseTree(spec)
        guard case .button(let props) = tree else {
            return XCTFail("expected button, got \(tree)")
        }
        XCTAssertEqual(props.handler, .effect(.copy("hi")), "a `{type:...}` handler object parses to an effect (H2)")
    }

    func testEffectObjectOpenURLParsed() throws {
        let spec = element("button", [
            "title": "Open",
            "handler": .object(["type": "openURL", "url": "https://example.com/a"])
        ])
        let tree = try CanvasElementParser.parseTree(spec)
        guard case .button(let props) = tree else {
            return XCTFail("expected button, got \(tree)")
        }
        XCTAssertEqual(props.handler, .effect(.openURL(URL(string: "https://example.com/a")!)))
    }

    func testMalformedEffectObjectRendersStatic() throws {
        let spec = element("button", [
            "title": "B",
            "handler": .object(["type": "copy"])   // no `text` → effect can't build → static
        ])
        let tree = try CanvasElementParser.parseTree(spec)
        guard case .button(let props) = tree else {
            return XCTFail("expected button, got \(tree)")
        }
        XCTAssertNil(props.handler, "an unbuildable effect object renders the node non-interactive")
    }

    func testTextFieldWithoutIDDropped() throws {
        let spec = element("textField", ["value": .str("v")])
        XCTAssertThrowsError(try CanvasElementParser.parseTree(spec)) { error in
            XCTAssertTrue(error is CanvasParseError)
        }
    }

    func testTooManyNodesRejects() {
        var children: [CanvasElementSpec] = []
        for _ in 0...CanvasLimits.maxNodes {
            children.append(element("divider"))
        }
        let spec = element("stack", [:], children)
        XCTAssertThrowsError(try CanvasElementParser.parseTree(spec)) { error in
            XCTAssertEqual(error as? CanvasParseError, .tooManyNodes)
        }
    }

    func testTextTooLongRejects() {
        let long = String(repeating: "x", count: CanvasLimits.maxTextLength + 1)
        let spec = element("text", ["content": .str(long)])
        XCTAssertThrowsError(try CanvasElementParser.parseTree(spec)) { error in
            XCTAssertEqual(error as? CanvasParseError, .textTooLong)
        }
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh CanvasElementParserTests`
Expected: FAIL with "cannot find 'CanvasElementParser' in scope".

- [ ] **Step 3: Implement**

Create `Sources/Core/Canvas/CanvasElementSpec.swift`:

```swift
// CanvasElementSpec.swift
// OpenClip
//
// The neutral, Codable element-object form of a canvas node (spec §5.1 / §5.4): the JS engine
// converts a JSValue from `h(type, props, children)` into this shape via JSONSerialization, and
// Core's CanvasElementParser decodes it into a CanvasComponent — keeping the parser
// JavaScriptCore-free. `props` uses JSONValue so numbers/strings/bools/arrays/objects round-trip.
import Foundation

public struct CanvasElementSpec: Codable, Sendable, Equatable {
    public var type: String
    public var props: [String: JSONValue]
    public var children: [CanvasElementSpec]

    public init(type: String, props: [String: JSONValue] = [:], children: [CanvasElementSpec] = []) {
        self.type = type
        self.props = props
        self.children = children
    }
}
```

Create `Sources/Core/Canvas/CanvasElementParser.swift`:

```swift
// CanvasElementParser.swift
// OpenClip
//
// Parses a CanvasElementSpec tree into a CanvasComponent (spec §5.4). Recovery is lenient per node
// and strict structurally: unknown element types drop the node, malformed/unknown handlers render
// the node non-interactive, invalid link URLs drop the node, missing textField/toggle ids drop the
// node, non-array children are ignored, and unknown color/style tokens fall back to the default —
// a malformed element never crashes the session. Only structural violations (limits, a non-object
// root) throw CanvasParseError and reject the whole canvas.
import Foundation

public enum CanvasElementParser {
    /// Parses a whole element tree, validating structural limits via CanvasTreeValidator.
    public static func parseTree(_ spec: CanvasElementSpec) throws -> CanvasComponent {
        guard let node = parseElement(spec) else {
            throw CanvasParseError.nonObjectRoot
        }
        try CanvasTreeValidator.validate(node)
        return node
    }

    /// Parses one element leniently. Returns nil to drop the node (spec §5.4 recovery).
    static func parseElement(_ spec: CanvasElementSpec) -> CanvasComponent? {
        let props = spec.props
        switch spec.type {
        case "stack":
            var children: [CanvasComponent] = []
            for childSpec in spec.children {
                if let node = parseElement(childSpec) { children.append(node) }
            }
            let orientation: CanvasOrientation =
                props.string("orientation") == "horizontal" ? .horizontal : .vertical
            let spacing = props.double("spacing")
            return .stack(CanvasStackProps(id: props.string("id"), orientation: orientation, spacing: spacing), children)

        case "divider":
            return .divider(CanvasDividerProps(id: props.string("id")))

        case "spacer":
            return .spacer(CanvasSpacerProps(id: props.string("id"), minLength: props.double("minLength")))

        case "text":
            let content = props.string("content") ?? ""
            let style = CanvasTextStyle(rawValue: props.string("style") ?? "body") ?? .body
            let color = CanvasColorToken(rawValue: props.string("color") ?? "primary") ?? .primary
            return .text(CanvasTextProps(
                id: props.string("id"),
                content: content,
                style: style,
                color: color,
                selectable: props.bool("selectable") ?? false
            ))

        case "icon":
            guard let source = parseIconSource(props) else { return nil }
            return .icon(CanvasIconProps(id: props.string("id"), source: source, size: props.double("size") ?? 14))

        case "image":
            guard let source = parseImageSource(props) else { return nil }
            // Size (`{ width, height }` object, spec §7.1) is left nil here; the renderer
            // (`03-session-renderer.md`, Task 12) bounds oversized images to the column.
            return .image(CanvasImageProps(
                id: props.string("id"),
                source: source,
                cornerRadius: props.double("cornerRadius")
            ))

        case "button":
            let handler = parseHandler(in: props, key: "handler")
            let style: CanvasButtonStyle =
                props.string("style") == "accent" ? .accent : .plain
            return .button(CanvasButtonProps(
                id: props.string("id"),
                title: props.string("title") ?? "",
                icon: parseIconSource(props),
                style: style,
                disabled: props.bool("disabled") ?? false,
                handler: handler
            ))

        case "list":
            var items: [CanvasListItem] = []
            for childSpec in spec.children {
                guard childSpec.type == "listItem" else { continue }
                items.append(parseListItem(childSpec))
            }
            // v1 JS: the list's collected listItems are wrapped in a single implicit
            // `CanvasListSection` — section headers are not yet exposed in the `h()` contract
            // (spec §7 list sections land with the renderer in `03-session-renderer.md`, Task 12).
            return .list(CanvasListProps(id: props.string("id")), [CanvasListSection(items: items)])

        case "textField":
            guard let id = props.string("id") else { return nil }
            return .textField(CanvasTextFieldProps(
                id: id,
                value: props.string("value") ?? "",
                placeholder: props.string("placeholder"),
                onSubmit: parseHandler(in: props, key: "onSubmit"),
                onChange: parseHandler(in: props, key: "onChange")
            ))

        case "toggle":
            guard let id = props.string("id") else { return nil }
            return .toggle(CanvasToggleProps(
                id: id,
                value: props.bool("value") ?? false,
                onToggle: parseHandler(in: props, key: "onToggle")
            ))

        case "link":
            guard let title = props.string("title"),
                  let urlString = props.string("url"),
                  let url = URL(string: urlString) else { return nil }
            return .link(CanvasLinkProps(id: props.string("id"), title: title, url: url))

        default:
            return nil // unknown element type — drop the node, keep siblings
        }
    }

    private static func parseListItem(_ spec: CanvasElementSpec) -> CanvasListItem {
        let props = spec.props
        return CanvasListItem(
            id: props.string("id"),
            icon: parseIconSource(props),
            title: props.string("title") ?? "",
            subtitle: props.string("subtitle"),
            badge: props.string("badge"),
            disabled: props.bool("disabled") ?? false,
            handler: parseHandler(in: props, key: "handler")
        )
    }

    /// A handler is either a bare `handler` string (dispatch) or an effect object (H2).
    /// `props` holds the node's props; `handlerKey` is `"handler"` for buttons/listItems,
    /// `"onSubmit"`/`"onChange"`/`"onToggle"` for fields/toggles.
    private static func parseHandler(in props: [String: JSONValue], key handlerKey: String) -> CanvasHandler? {
        if case .string(let name) = props[handlerKey], !name.isEmpty {
            return .dispatch(name)
        }
        if case .object(let dict) = props[handlerKey], let effect = parseEffect(dict) {
            return .effect(effect)
        }
        return nil
    }

    /// Parses a `{ type: "…", ... }` effect object (spec §3 `CanvasHandler.effect`).
    /// `type` is one of the 9 leaf effect names; parsing failure → nil → the node stays static.
    private static func parseEffect(_ dict: [String: JSONValue]) -> CanvasEffect? {
        guard let type = dict.string("type") else { return nil }
        switch type {
        case "paste":         return dict.string("text").map(CanvasEffect.paste)
        case "copy":          return dict.string("text").map(CanvasEffect.copy)
        case "cut":           return dict.string("text").map(CanvasEffect.cut)
        case "simulatePaste": return .simulatePaste
        case "keyPress":
            guard let key = dict.string("key") else { return nil }
            return .keyPress(KeyPressSpec(key: key))
        case "runShortcut":
            guard let name = dict.string("name") else { return nil }
            return .runShortcut(name: name, input: dict.string("input"))
        case "openURL":
            guard let urlString = dict.string("url"), let url = URL(string: urlString) else { return nil }
            return .openURL(url)
        case "showServices":  return dict.string("text").map(CanvasEffect.showServices)
        case "notify":
            guard let title = dict.string("title") else { return nil }
            return .notify(title: title, body: dict.string("body") ?? "")
        default: return nil
        }
    }

    private static func parseIconSource(_ props: [String: JSONValue]) -> CanvasIconSource? {
        if let symbol = props.string("symbol") { return .symbol(symbol) }
        if let iconify = props.string("iconify") { return .iconify(iconify) }
        if let local = props.string("local"), let url = URL(string: local) { return .local(url) }
        if let urlString = props.string("url"), let url = URL(string: urlString) { return .url(url) }
        return nil
    }

    private static func parseImageSource(_ props: [String: JSONValue]) -> CanvasImageSource? {
        if let urlString = props.string("url"), let url = URL(string: urlString) { return .url(url) }
        if let local = props.string("local"), let url = URL(string: local) { return .local(url) }
        return nil
    }
}

private extension Dictionary where Key == String, Value == JSONValue {
    func string(_ key: String) -> String? {
        if case .string(let value) = self[key] { return value }
        return nil
    }
    func bool(_ key: String) -> Bool? {
        if case .bool(let value) = self[key] { return value }
        return nil
    }
    func double(_ key: String) -> Double? {
        if case .number(let value) = self[key] { return value }
        return nil
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh CanvasElementParserTests`
Expected: PASS (adjust `testTextFieldWithoutIDDropped` if you choose drop-over-throw; the plan treats a root-level missing-id textField as a non-object root → `CanvasParseError.nonObjectRoot`, which the test already asserts via `XCTAssertTrue(error is CanvasParseError)`).

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add Sources/Core/Canvas/CanvasElementSpec.swift Sources/Core/Canvas/CanvasElementParser.swift Tests/OpenClipTests/CanvasElementParserTests.swift
git commit -m "feat(core): add CanvasElementSpec + lenient CanvasElementParser"
```

---

### Task 6: CanvasComponent.firstInteractiveID()

**Files:**
- Create: `Sources/Core/Canvas/CanvasFocus.swift`
- Test: `Tests/OpenClipTests/CanvasFocusTests.swift`

**Interfaces:**
- Consumes: `CanvasComponent`/props (Task 1).
- Produces: `public extension CanvasComponent { func firstInteractiveID() -> String? }` — a **two-pass depth-first (pre-order) walk** (spec §7 focus priority): 1) pass 1 returns the first `textField` anywhere in the tree → its `id`; 2) pass 2 (only if no textField exists) returns the first non-disabled interactive node among `button`/`toggle`/`listItem`/`link` whose node `id` is non-nil; 3) else nil (the caller focuses the canvas root under `kRootFocusID`).

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import Core

final class CanvasFocusTests: XCTestCase {
    func testTextfieldWinsAnywhereInTree() {
        let tree: CanvasComponent = .stack(CanvasStackProps(), [
            .button(CanvasButtonProps(id: "btn", title: "B", handler: .dispatch("go"))),
            .stack(CanvasStackProps(), [
                .textField(CanvasTextFieldProps(id: "field", value: ""))
            ])
        ])
        XCTAssertEqual(tree.firstInteractiveID(), "field")
    }

    func testFallsBackToButtonWhenNoTextfield() {
        let tree: CanvasComponent = .stack(CanvasStackProps(), [
            .button(CanvasButtonProps(id: "btn", title: "B", handler: .dispatch("go"))),
            .toggle(CanvasToggleProps(id: "tog", value: false))
        ])
        XCTAssertEqual(tree.firstInteractiveID(), "btn")
    }

    func testDisabledButtonSkipped() {
        let tree: CanvasComponent = .stack(CanvasStackProps(), [
            .button(CanvasButtonProps(id: "btn", title: "B", disabled: true, handler: .dispatch("go"))),
            .toggle(CanvasToggleProps(id: "tog", value: false))
        ])
        XCTAssertEqual(tree.firstInteractiveID(), "tog")
    }

    func testNilWhenNoFocusable() {
        let tree: CanvasComponent = .stack(CanvasStackProps(), [.text(CanvasTextProps(content: "static"))])
        XCTAssertNil(tree.firstInteractiveID())
    }

    func testListItemIDCounts() {
        let tree: CanvasComponent = .list(CanvasListProps(), [
            CanvasListSection(items: [CanvasListItem(title: "a")]),
            CanvasListSection(items: [CanvasListItem(id: "row2", title: "b")])
        ])
        XCTAssertEqual(tree.firstInteractiveID(), "row2")
    }

    func testLinkCountsAsInteractiveFallback() {
        let tree: CanvasComponent = .stack(CanvasStackProps(), [
            .text(CanvasTextProps(content: "static")),
            .link(CanvasLinkProps(id: "lnk", title: "Docs", url: URL(string: "https://x")!))
        ])
        XCTAssertEqual(tree.firstInteractiveID(), "lnk")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh CanvasFocusTests`
Expected: FAIL with "cannot infer... 'firstInteractiveID'".

- [ ] **Step 3: Implement**

Create `Sources/Core/Canvas/CanvasFocus.swift`:

```swift
// CanvasFocus.swift
// OpenClip
//
// Pure Core helper resolving the component that should receive initial focus when a canvas mounts
// (spec §7, focusFirstInteractive): a TWO-PASS depth-first (pre-order) walk. Pass 1 returns the
// first `textField` anywhere in the tree — a button that appears earlier never beats a field. Pass
// 2 (only when no textField exists) returns the first non-disabled interactive node among
// `button`/`toggle`/`listItem`/`link` carrying a node id; else nil — in which case the caller
// focuses the canvas root (always .focusable()). textField/toggle ids are required (state key +
// focus id); button/link/listItem need a non-nil id to be a focus target. Divider/spacer/text/icon/
// image are never focus targets; only `.stack` nodes recurse into children.
import Foundation

public extension CanvasComponent {
    /// Pre-order child components of a structural node; leaves (and `.list`) have none.
    private var subnodes: [CanvasComponent] {
        switch self {
        case .stack(_, let children): return children
        default: return []
        }
    }

    func firstInteractiveID() -> String? {
        // Pass 1 (spec step 1): the first textField anywhere in the tree.
        var stack: [CanvasComponent] = [self]
        while let node = stack.popLast() {
            if case .textField(let props) = node { return props.id }
            stack.append(contentsOf: node.subnodes.reversed())
        }

        // Pass 2 (spec step 2): the first non-disabled button/toggle/listItem/link with a node id.
        stack = [self]
        while let node = stack.popLast() {
            switch node {
            case .button(let props):
                if !props.disabled, let id = props.id { return id }
            case .toggle(let props):
                return props.id
            case .list(_, let sections):
                for section in sections.reversed() {
                    for item in section.items.reversed() {
                        if !item.disabled, let id = item.id { return id }
                    }
                }
            case .link(let props):
                if let id = props.id { return id }
            default:
                break
            }
            stack.append(contentsOf: node.subnodes.reversed())
        }
        return nil
    }
}
```

Note: the two-pass walk makes `textField` beat every interactive node regardless of position (a button that precedes a textField still loses to the field, per spec §7 priority). Pass 2 candidates are `button`/`toggle`/`listItem`/`link`; `divider`/`spacer`/`text`/`icon`/`image` and disabled nodes are never focus targets.

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh CanvasFocusTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add Sources/Core/Canvas/CanvasFocus.swift Tests/OpenClipTests/CanvasFocusTests.swift
git commit -m "feat(core): add CanvasComponent.firstInteractiveID focus helper"
```

---

### Task 7: Native DSL (Canvas.build + @CanvasBuilder + constructors)

**Files:**
- Create: `Sources/Core/Canvas/CanvasDSL.swift`
- Test: `Tests/OpenClipTests/CanvasDSLTests.swift`

**Interfaces:**
- Consumes: `CanvasComponent`/props (Task 1), `CanvasHandler`/`CanvasEffect` (Task 1), `CanvasTreeValidator` (Task 3).
- Produces:
  - `@resultBuilder public enum CanvasBuilder { ... }` — `buildBlock`, `buildExpression(CanvasComponent)`, `buildExpression([CanvasComponent])`, `buildOptional`, `buildEither(first:)`, `buildEither(second:)`, `buildArray`.
  - `public enum Canvas { public static func build(@CanvasBuilder _ content: () -> [CanvasComponent]) -> CanvasComponent }` — returns a vertical `stack` of the content.
  - Static component constructors on `Canvas` (namespaced to avoid SwiftUI `Text`/`Button` collisions in the App target): `text`, `button`, `stack`, `icon`, `image`, `textField`, `toggle`, `link`, `list`, `divider`, `spacer`.

- [ ] **Step 1: Write the failing test**

```swift
import XCTest
import Core

final class CanvasDSLTests: XCTestCase {
    func testBuildWrapsInVerticalStack() {
        let tree = Canvas.build {
            Canvas.text("2 + 2 = 4", style: .title)
            Canvas.button("Paste result", handler: .effect(.paste("4")))
            Canvas.button("Copy", handler: .effect(.copy("4")))
        }
        guard case .stack(let props, let children) = tree else {
            return XCTFail("expected stack, got \(tree)")
        }
        XCTAssertEqual(props.orientation, .vertical)
        XCTAssertEqual(children.count, 3)
    }

    func testConditionalBuilds() {
        let on = true
        let tree = Canvas.build {
            if on {
                Canvas.text("shown")
            } else {
                Canvas.divider
            }
        }
        guard case .stack(_, let children) = tree else {
            return XCTFail("expected stack")
        }
        XCTAssertEqual(children.count, 1)
        XCTAssertEqual(children[0], .text(CanvasTextProps(content: "shown")))
    }

    func testEffectButtonHandler() {
        let tree = Canvas.build {
            Canvas.button("Paste", handler: .effect(.paste("x")))
        }
        guard case .stack(_, let children) = tree, case .button(let props) = children[0] else {
            return XCTFail("expected button")
        }
        XCTAssertEqual(props.handler, .effect(.paste("x")))
    }

    func testNativeBuildValidates() throws {
        let tree = Canvas.build {
            Canvas.text(String(repeating: "x", count: CanvasLimits.maxTextLength + 1))
        }
        XCTAssertThrowsError(try CanvasTreeValidator.validate(tree)) { error in
            XCTAssertEqual(error as? CanvasParseError, .textTooLong)
        }
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `./scripts/test.sh CanvasDSLTests`
Expected: FAIL with "cannot find 'CanvasBuilder' in scope".

- [ ] **Step 3: Implement**

Create `Sources/Core/Canvas/CanvasDSL.swift`:

```swift
// CanvasDSL.swift
// OpenClip
//
// Value DSL over the same component tree (spec §6): handlers are values, not closures, so the tree
// stays Equatable + Sendable. `Canvas.build { ... }` wraps the result-builder content in a vertical
// stack. Constructors are namespaced on `Canvas` (Canvas.text(...), Canvas.button(...), ...) to
// avoid clashing with SwiftUI's Text/Button in App-target callers. Native actions needing named
// interactive handlers register them with CanvasSessionController (deferred in v1 — most native
// interactivity is .effect). Pure Core — no AppKit/SwiftUI.
import Foundation

@resultBuilder
public enum CanvasBuilder {
    public static func buildBlock(_ components: [CanvasComponent]...) -> [CanvasComponent] {
        components.flatMap { $0 }
    }

    public static func buildExpression(_ expression: CanvasComponent) -> [CanvasComponent] {
        [expression]
    }

    public static func buildExpression(_ expression: [CanvasComponent]) -> [CanvasComponent] {
        expression
    }

    public static func buildOptional(_ component: [CanvasComponent]?) -> [CanvasComponent] {
        component ?? []
    }

    public static func buildEither(first component: [CanvasComponent]) -> [CanvasComponent] {
        component
    }

    public static func buildEither(second component: [CanvasComponent]) -> [CanvasComponent] {
        component
    }

    public static func buildArray(_ components: [[CanvasComponent]]) -> [CanvasComponent] {
        components.flatMap { $0 }
    }
}

public enum Canvas {
    /// Wraps the builder content in a vertical stack — the root of a native canvas tree.
    public static func build(@CanvasBuilder _ content: () -> [CanvasComponent]) -> CanvasComponent {
        .stack(CanvasStackProps(), content())
    }

    public static var divider: CanvasComponent { .divider(CanvasDividerProps()) }

    public static func spacer(minLength: Double? = nil, id: String? = nil) -> CanvasComponent {
        .spacer(CanvasSpacerProps(id: id, minLength: minLength))
    }

    public static func text(_ content: String, id: String? = nil, style: CanvasTextStyle = .body,
                            color: CanvasColorToken = .primary, selectable: Bool = false) -> CanvasComponent {
        .text(CanvasTextProps(id: id, content: content, style: style, color: color, selectable: selectable))
    }

    public static func icon(_ source: CanvasIconSource, size: Double = 14, id: String? = nil) -> CanvasComponent {
        .icon(CanvasIconProps(id: id, source: source, size: size))
    }

    public static func image(_ source: CanvasImageSource, cornerRadius: Double? = nil, id: String? = nil) -> CanvasComponent {
        .image(CanvasImageProps(id: id, source: source, cornerRadius: cornerRadius))
    }

    public static func button(_ title: String, id: String? = nil, icon: CanvasIconSource? = nil,
                              style: CanvasButtonStyle = .plain, disabled: Bool = false,
                              handler: CanvasHandler? = nil) -> CanvasComponent {
        .button(CanvasButtonProps(id: id, title: title, icon: icon, style: style, disabled: disabled, handler: handler))
    }

    public static func stack(_ props: CanvasStackProps = CanvasStackProps(),
                             @CanvasBuilder _ content: () -> [CanvasComponent]) -> CanvasComponent {
        .stack(props, content())
    }

    public static func list(_ sections: [CanvasListSection], id: String? = nil) -> CanvasComponent {
        .list(CanvasListProps(id: id), sections)
    }

    public static func textField(_ id: String, value: String = "", placeholder: String? = nil,
                                 onSubmit: CanvasHandler? = nil, onChange: CanvasHandler? = nil) -> CanvasComponent {
        .textField(CanvasTextFieldProps(id: id, value: value, placeholder: placeholder,
                                        onSubmit: onSubmit, onChange: onChange))
    }

    public static func toggle(_ id: String, value: Bool, onToggle: CanvasHandler? = nil) -> CanvasComponent {
        .toggle(CanvasToggleProps(id: id, value: value, onToggle: onToggle))
    }

    public static func link(_ title: String, url: URL, id: String? = nil) -> CanvasComponent {
        .link(CanvasLinkProps(id: id, title: title, url: url))
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh CanvasDSLTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add Sources/Core/Canvas/CanvasDSL.swift Tests/OpenClipTests/CanvasDSLTests.swift
git commit -m "feat(core): add native Canvas DSL with @CanvasBuilder"
```

---

### Task 8: Core model self-review

**Files:**
- None (review only).

**Interfaces:**
- Consumes: all of Tasks 1–7.

- [ ] **Step 1: Review the Core surface against the spec**

Read `docs/superpowers/specs/2026-08-07-component-canvas-design.md` §4, §4.1, §4.1a, §4.2, §5.2, §5.3, §5.4, §7.2. Confirm every type defined in Tasks 1–7 has a task-owning test that exercises it, and that no Core file imports AppKit/SwiftUI:

```bash
grep -rn "import AppKit\|import SwiftUI" Sources/Core/Canvas || echo "clean: no AppKit/SwiftUI in Core/Canvas"
```

- [ ] **Step 2: Run the full Core test surface**

Run: `timeout -k 10 60 ./scripts/test.sh Canvas`
Expected: all new test classes pass (CanvasComponentTests, CanvasSessionStateTests, CanvasTreeValidatorTests, CanvasScriptingTests, CanvasElementParserTests, CanvasFocusTests, CanvasDSLTests).

- [ ] **Step 3: Commit (if any fixes were needed)**

```bash
git add -A Sources/Core/Canvas Tests/OpenClipTests
git commit -m "fix(core): tighten Canvas Core model per self-review"
```

**Done with the Core model.** Next: `02-key-mode.md` (Tasks 9–10).
