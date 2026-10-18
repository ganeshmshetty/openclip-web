# Computed Visibility via a Pure-Swift Expression DSL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `"expression"` field to extension requirements whose value is a small pure-Swift DSL, evaluated natively in Core, gating action visibility alongside the existing regex/app/requiresSelection gates.

**Architecture:** Tokenizer → recursive-descent parser → immutable `Sendable` AST → synchronous evaluator, all pure Foundation in Core. The factory parses the expression once at load into the AST and stores it on `ExtensionActionRules`; `ActionVisibility.isEnabled` gains a defaulted `expression:` parameter that ANDs the DSL gate after the regex first pass. The 10 extension action structs switch their duplicated `ActionVisibility.isEnabled(...)` calls to a new `ExtensionActionRules.resolveVisibility(for:)` helper. Regex stays the fast first pass and is intentionally not precompiled (`NSRegularExpression` is not `Sendable`).

**Tech Stack:** Swift 6, Foundation, Swift Package Core module, XCTest. No AppKit/SwiftUI/JavaScriptCore.

## Global Constraints

- **Regenerate the Xcode project after adding/deleting Swift files:** run `xcodegen generate` (MANDATORY per `AGENTS.md` §2) in the repo root before building/testing whenever `Sources/` or `Tests/` gained or lost files.
- **Core purity (AGENTS.md hard rule):** never `import AppKit`, `SwiftUI`, or `JavaScriptCore` in `Sources/Core/`. All new code is Foundation-only.
- **Log through `Log`, never `print()`.** Expression failures log via `Log.js` (defined in `Sources/Core/Log.swift`). Action IDs are `privacy: .public`; text/selection data is private.
- **`ActionVisibility` stays the single owner of enablement.** No `switch action.id`, no new singleton.
- **No direct `UserDefaults.standard`**, no new `UserDefaults` in Core.
- **Parse-once-eval-many:** the AST is compiled by `DefaultActionFactory` (App target) at load time; `isEnabled` never parses.
- **Failure semantics (from spec):** parse failure at load → factory logs `Log.js.error` + sets `compiledExpression = nil` → action behaves exactly as today (defensive fail-open, mirroring malformed-regex at ActionVisibility.swift:81). Runtime eval error (e.g. `length(text) == "x"`) → fail-closed (disabled) + `Log.js.error`.
- **No manifest-validation changes.** `ManifestValidator` is all-or-nothing; a bad expression must not reject the package.
- **Full-suite verification required at the end:** quick build gate first, then `timeout -k 10 60 ./scripts/test.sh` (deterministic, ~45 s).

## File Structure

**Create:**
- `Sources/Core/Extensions/Manifest/ValidateExpression.swift` — the DSL module: tokenizer, recursive-descent parser, immutable AST (`Node`/`Value`), evaluator. Public surface: `ValidateExpression` with `source`, `ParseError`, `EvalError`, `parse(_:) -> Result<..., ParseError>`, `evaluate(_:match:) -> Result<Bool, EvalError>`.
- `Tests/OpenClipTests/ValidateExpressionTests.swift` — parser + evaluator + Sendable/parse-once coverage.

**Modify:**
- `Sources/Core/Extensions/Manifest/ActionRequirements.swift` — add `expression: String?` + decode/encode/CodingKeys.
- `Sources/Core/Actions/ActionVisibility.swift` — add defaulted `expression: ValidateExpression?` param + step-4 gate (regex stays first pass).
- `Sources/Core/Actions/ExtensionActionRules.swift` — add `compiledExpression: ValidateExpression?` (default nil), manual `Codable` that skips it, and `resolveVisibility(for:)`.
- `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift` — compile the expression once (private helper), thread into both rules construction sites (`makeAction`, group row in `createActions`).
- Ten action structs → delegate enablement via `rules.resolveVisibility(for:)`: `Sources/Core/Actions/CustomAction.swift`, `Sources/Core/Actions/GroupAction.swift`, `Sources/Core/Actions/URLTemplateAction.swift` (special: keeps `rules?.legacyRegex ?? regexPattern` fallback for nil rules), `Sources/Core/Extensions/ScriptAction.swift`, and App-target `Sources/OpenClip/Actions/{JavaScriptAction, JavaScriptCanvasAction, AppleScriptAction, KeyPressAction, ShortcutAction, NamedServiceAction}.swift`.
- `Tests/OpenClipTests/ActionVisibilityTests.swift` — expression-gate cases.
- `Tests/OpenClipTests/NewExtensionKindTests.swift` — factory compile-once + action-level gate cases.

**Not touched:** `Sources/Core/Actions/MenuDecoratedAction.swift` (delegates `base.isEnabled`), builtins, AI presets, `searchCatalog`.

---

### Task 1: The `ValidateExpression` module

The whole DSL lives in one new Core file. Public interface below is the contract Tasks 3–5 depend on.

**Files:**
- Create: `Sources/Core/Extensions/Manifest/ValidateExpression.swift`
- Create: `Tests/OpenClipTests/ValidateExpressionTests.swift`
- Regenerate the project: `xcodegen generate`

**Interfaces:**
- Produces:
  - `public struct ValidateExpression: Sendable, Equatable` with `public let source: String`, `public enum ParseError: Error, Equatable, Sendable`, `public enum EvalError: Error, Equatable, Sendable`.
  - `public static func parse(_ source: String) -> Result<ValidateExpression, ValidateExpression.ParseError>`
  - `public func evaluate(_ context: ActionContext, match: ActionMatchInfo?) -> Result<Bool, ValidateExpression.EvalError>`

- [ ] **Step 1: Write the failing test**

Create `Tests/OpenClipTests/ValidateExpressionTests.swift`:

```swift
import XCTest
@testable import Core

private extension ActionContext {
    init(selectedText: String, bundleID: String? = "com.test.app", appName: String? = "TestApp", match: ActionMatchInfo? = nil) {
        let selection = SelectionContext(
            text: selectedText,
            sourceApp: AppIdentity(bundleIdentifier: bundleID, localizedName: appName),
            cursorPosition: .zero,
            timestamp: Date(),
            appPolicy: .default
        )
        self.init(selection: selection, modifiers: [], match: match)
    }
}

private func eval(_ source: String, text: String = "hello@example.com", context: ActionContext? = nil) throws -> Bool {
    let parsed = try XCTUnwrap(try ValidateExpression.parse(source).get())
    let ctx = context ?? ActionContext(selectedText: text)
    return try XCTUnwrap(try parsed.evaluate(ctx, match: nil).get())
}

@MainActor
final class ValidateExpressionTests: XCTestCase {

    // MARK: - Parsing

    func testParseAcceptsValidExpression() {
        XCTAssertNotNil(try? ValidateExpression.parse("isEmail(text) && length(text) >= 5").get())
    }

    func testParseRejectsMalformedExpression() {
        XCTAssertThrowsError(try ValidateExpression.parse("isEmail(text) &&").get())
        XCTAssertThrowsError(try ValidateExpression.parse("(text").get())
        XCTAssertThrowsError(try ValidateExpression.parse("\"unterminated").get())
        XCTAssertThrowsError(try ValidateExpression.parse("length(text").get())
    }

    // MARK: - Semantic predicates

    func testIsEmailEnabledForValidEmail() throws {
        XCTAssertTrue(try eval("isEmail(text)", text: "a@b.com"))
    }

    func testIsEmailDisabledForInvalidEmail() throws {
        XCTAssertFalse(try eval("isEmail(text)", text: "not an email"))
    }

    func testIsURLMatchesHTTPAndWww() throws {
        XCTAssertTrue(try eval("isURL(text)", text: "https://example.com"))
        XCTAssertTrue(try eval("isURL(text)", text: "www.example.com"))
        XCTAssertFalse(try eval("isURL(text)", text: "example.com"))
    }

    // MARK: - Numeric comparisons

    func testLengthGreaterThanEnables() throws {
        XCTAssertTrue(try eval("length(text) > 10", text: "12345678901"))
        XCTAssertFalse(try eval("length(text) > 10", text: "short"))
    }

    func testNumberFunctionComparesNumericSelection() throws {
        XCTAssertTrue(try eval("number(text) >= 100", text: "250"))
        XCTAssertFalse(try eval("number(text) >= 100", text: "42"))
    }

    func testNumberFunctionReturnsNullForNonNumeric() throws {
        XCTAssertTrue(try eval("number(text) == null", text: "abc"))
        XCTAssertFalse(try eval("number(text) == null", text: "12"))
    }

    // MARK: - Composition

    func testAndRequiresBothSides() throws {
        let expr = "isEmail(text) && length(text) >= 8"
        XCTAssertTrue(try eval(expr, text: "hello@example.com"))
        XCTAssertFalse(try eval(expr, text: "a@b.co"))
    }

    func testOrShortCircuits() throws {
        let expr = "isURL(text) || isEmail(text)"
        XCTAssertTrue(try eval(expr, text: "https://example.com"))
        XCTAssertTrue(try eval(expr, text: "a@b.com"))
        XCTAssertFalse(try eval(expr, text: "plain text"))
    }

    func testNotFlipsBoolean() throws {
        XCTAssertTrue(try eval("!isEmail(text)", text: "nope"))
        XCTAssertFalse(try eval("!isEmail(text)", text: "a@b.com"))
    }

    func testParenthesesGroupComparison() throws {
        XCTAssertTrue(try eval("(length(text) >= 5) && isEmail(text)", text: "a@b.co"))
    }

    // MARK: - Context variables

    func testAppVariableEquality() throws {
        let ctx = ActionContext(selectedText: "hello", bundleID: "com.safari")
        XCTAssertTrue(try eval("app == \"com.safari\"", context: ctx))
        XCTAssertFalse(try eval("app == \"com.mail\"", context: ctx))
    }

    func testAppIsEmptyStringWhenBundleNil() throws {
        let ctx = ActionContext(selectedText: "hello", bundleID: nil)
        XCTAssertTrue(try eval("app == \"\"", context: ctx))
    }

    func testHasSelection() throws {
        let empty = ActionContext(selectedText: "   ")
        let nonEmpty = ActionContext(selectedText: "hey")
        XCTAssertFalse(try eval("hasSelection", context: empty))
        XCTAssertTrue(try eval("hasSelection", context: nonEmpty))
    }

    // MARK: - String helpers

    func testStartsWithEndsWithContains() throws {
        XCTAssertTrue(try eval("startsWith(text, \"http\")", text: "https://x.com"))
        XCTAssertTrue(try eval("endsWith(text, \".com\")", text: "https://x.com"))
        XCTAssertTrue(try eval("contains(text, \"example\")", text: "https://example.com"))
        XCTAssertFalse(try eval("contains(text, \"nope\")", text: "https://example.com"))
    }

    func testTrimLowerUpper() throws {
        XCTAssertTrue(try eval("trim(text) == \"a@b.com\"", text: "  a@b.com  "))
        XCTAssertTrue(try eval("lower(text) == \"abc\"", text: "ABC"))
        XCTAssertTrue(try eval("upper(text) == \"ABC\"", text: "abc"))
    }

    func testMatchesFunctionUsesRegexSemantics() throws {
        XCTAssertTrue(try eval("matches(text, \"^[a-z]+@[a-z]+\\\\.com$\")", text: "a@b.com"))
        XCTAssertFalse(try eval("matches(text, \"^[a-z]+@[a-z]+\\\\.com$\")", text: "nope"))
    }

    // MARK: - Captures

    func testLengthOfCapturesArray() throws {
        let match = ActionMatchInfo(text: "a@b.com", matchedText: "a@b.com", captures: ["a", "b.com"], sourceBundleID: "com.test.app")
        let ctx = ActionContext(selectedText: "a@b.com", match: match)
        XCTAssertTrue(try eval("length(captures) == 2", context: ctx))
    }

    func testContainsOnCapturesArray() throws {
        let match = ActionMatchInfo(text: "a@b.com", matchedText: "a@b.com", captures: ["user", "domain.com"], sourceBundleID: "com.test.app")
        let ctx = ActionContext(selectedText: "a@b.com", match: match)
        XCTAssertTrue(try eval("contains(captures, \"user\")", context: ctx))
    }

    // MARK: - Error surfaces

    func testRuntimeTypeErrorReturnsFailure() {
        let expr = try! ValidateExpression.parse("length(text) == \"x\"").get()
        let ctx = ActionContext(selectedText: "hello")
        XCTAssertThrowsError(try expr.evaluate(ctx, match: nil).get()) { error in
            XCTAssertTrue(error is ValidateExpression.EvalError)
        }
    }

    func testUnknownFunctionAndVariableReturnFailures() {
        let ctx = ActionContext(selectedText: "hello")
        XCTAssertThrowsError(try ValidateExpression.parse("frobnicate(text)").get().evaluate(ctx, match: nil).get())
        XCTAssertThrowsError(try ValidateExpression.parse("mysteryvar == \"x\"").get().evaluate(ctx, match: nil).get())
    }

    func testNonBooleanTopLevelReturnsFailure() {
        let ctx = ActionContext(selectedText: "hello")
        XCTAssertThrowsError(try ValidateExpression.parse("length(text)").get().evaluate(ctx, match: nil).get())
    }

    // MARK: - Parse once, eval many

    func testParseOnceEvalManyReusesASTAcrossContexts() throws {
        let expr = try ValidateExpression.parse("isEmail(text) && length(text) >= 8").get()
        XCTAssertTrue(try expr.evaluate(ActionContext(selectedText: "user@example.com"), match: nil).get())
        XCTAssertFalse(try expr.evaluate(ActionContext(selectedText: "x@y.io"), match: nil).get())
        XCTAssertFalse(try expr.evaluate(ActionContext(selectedText: "plain text"), match: nil).get())
    }

    // MARK: - Sendable

    func testASTCrossesActorBoundary() async throws {
        let compiled = try await Task.detached {
            try ValidateExpression.parse("endsWith(text, \".com\")").get()
        }.value
        let ctx = ActionContext(selectedText: "https://example.com")
        XCTAssertTrue(try compiled.evaluate(ctx, match: nil).get())
    }
}
```

- [ ] **Step 2: Run it to confirm it fails to compile / no test target**

Run: `xcodegen generate && timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
Expected: FAIL — `ValidateExpression` undefined; tests don't compile.

- [ ] **Step 3: Write the minimal implementation**

Create `Sources/Core/Extensions/Manifest/ValidateExpression.swift`:

```swift
// ValidateExpression.swift
// OpenClip
//
// Pure-Core expression DSL for computed extension visibility. Tokenizes, parses, and evaluates a
// small bounded expression language (booleans, comparisons, string predicates, numeric helpers)
// without any JavaScript or AppKit. Parse-once-eval-many: DefaultActionFactory compiles the AST
// once at load; ActionVisibility evaluates it synchronously per gate. Bounded by construction
// (depth caps, no loops/assignments), so no timeout/watchdog is ever needed.
import Foundation

public struct ValidateExpression: Sendable, Equatable {
    public let source: String

    public enum ParseError: Error, Equatable, Sendable {
        case unterminatedString
        case unexpectedToken(String)
        case expectedExpression
        case expectedComma
        case expectedParen
        case tooDeep
    }

    public enum EvalError: Error, Equatable, Sendable {
        case arity(name: String, expected: Int, got: Int)
        case typeMismatch(String)
        case unknownFunction(String)
        case unknownVariable(String)
        case tooDeep
    }

    // MARK: - AST

    indirect enum Node: Equatable, Sendable {
        case literal(Value)
        case variable(String)
        case call(String, [Node])
        case not(Node)
        case and(Node, Node)
        case or(Node, Node)
        case equal(Node, Node)
        case notEqual(Node, Node)
        case less(Node, Node)
        case lessEqual(Node, Node)
        case greater(Node, Node)
        case greaterEqual(Node, Node)
    }

    enum Value: Equatable, Sendable {
        case bool(Bool)
        case number(Double)
        case string(String)
        case array([String])
        case null
    }

    private let root: Node
    private static let maxDepth = 200

    private init(source: String, root: Node) {
        self.source = source
        self.root = root
    }

    // MARK: - Public API

    public static func parse(_ source: String) -> Result<ValidateExpression, ParseError> {
        var lexer = Lexer(source: source)
        let tokens: [Token]
        do {
            tokens = try lexer.tokenize()
        } catch let error as ParseError {
            return .failure(error)
        } catch {
            return .failure(.unexpectedToken(String(describing: error)))
        }
        var parser = Parser(tokens: tokens)
        do {
            let node = try parser.parseExpression()
            return .success(ValidateExpression(source: source, root: node))
        } catch let error as ParseError {
            return .failure(error)
        } catch {
            return .failure(.unexpectedToken(String(describing: error)))
        }
    }

    public func evaluate(_ context: ActionContext, match: ActionMatchInfo?) -> Result<Bool, EvalError> {
        let evaluator = Evaluator(context: context, match: match)
        do {
            let value = try evaluator.evaluate(root)
            guard case .bool(let result) = value else {
                return .failure(.typeMismatch("expression must resolve to a boolean"))
            }
            return .success(result)
        } catch let error as EvalError {
            return .failure(error)
        } catch {
            return .failure(.typeMismatch("unexpected evaluation error"))
        }
    }

    // MARK: - Tokenizer

    private enum Token: Equatable {
        case identifier(String)
        case string(String)
        case number(Double)
        case bool(Bool)
        case null
        case not
        case and
        case or
        case equal
        case notEqual
        case less
        case lessEqual
        case greater
        case greaterEqual
        case lparen
        case rparen
        case comma
    }

    private struct Lexer {
        let characters: [Character]
        var index = 0

        init(source: String) {
            self.characters = Array(source)
        }

        mutating func tokenize() throws -> [Token] {
            var tokens: [Token] = []
            while index < characters.count {
                let c = characters[index]
                if c.isWhitespace { index += 1; continue }
                if index + 1 < characters.count, let pair = Lexer.twoCharToken([c, characters[index + 1]]) {
                    tokens.append(pair)
                    index += 2
                    continue
                }
                switch c {
                case "!": tokens.append(.not); index += 1
                case "<": tokens.append(.less); index += 1
                case ">": tokens.append(.greater); index += 1
                case "(": tokens.append(.lparen); index += 1
                case ")": tokens.append(.rparen); index += 1
                case ",": tokens.append(.comma); index += 1
                case "\"": tokens.append(try scanString())
                default:
                    if c.isNumber || c == "." {
                        tokens.append(try scanNumber())
                    } else if c.isLetter || c == "_" {
                        tokens.append(scanIdentifier())
                    } else {
                        throw ParseError.unexpectedToken(String(c))
                    }
                }
            }
            return tokens
        }

        private static func twoCharToken(_ pair: [Character]) -> Token? {
            switch String(pair) {
            case "&&": return .and
            case "||": return .or
            case "==": return .equal
            case "!=": return .notEqual
            case "<=": return .lessEqual
            case ">=": return .greaterEqual
            default: return nil
            }
        }

        private mutating func scanString() throws -> Token {
            index += 1 // opening quote
            var value = ""
            var closed = false
            while index < characters.count {
                let c = characters[index]
                if c == "\\" {
                    index += 1
                    guard index < characters.count else { throw ParseError.unterminatedString }
                    let escaped = characters[index]
                    switch escaped {
                    case "n": value.append("\n")
                    case "t": value.append("\t")
                    case "\"": value.append("\"")
                    case "\\": value.append("\\")
                    default: value.append(escaped)
                    }
                    index += 1
                } else if c == "\"" {
                    closed = true
                    index += 1
                    break
                } else {
                    value.append(c)
                    index += 1
                }
            }
            guard closed else { throw ParseError.unterminatedString }
            return .string(value)
        }

        private mutating func scanNumber() throws -> Token {
            var digits = ""
            while index < characters.count, characters[index].isNumber || characters[index] == "." {
                digits.append(characters[index])
                index += 1
            }
            guard let number = Double(digits) else { throw ParseError.unexpectedToken(digits) }
            return .number(number)
        }

        private mutating func scanIdentifier() -> Token {
            var value = ""
            while index < characters.count {
                let c = characters[index]
                if c.isLetter || c.isNumber || c == "_" {
                    value.append(c)
                    index += 1
                } else {
                    break
                }
            }
            switch value {
            case "true": return .bool(true)
            case "false": return .bool(false)
            case "null": return .null
            default: return .identifier(value)
            }
        }
    }

    // MARK: - Parser

    private struct Parser {
        let tokens: [Token]
        var index = 0

        init(tokens: [Token]) {
            self.tokens = tokens
        }

        private var current: Token { tokens[min(index, tokens.count - 1)] }

        private mutating func advance() -> Token {
            defer { if index < tokens.count { index += 1 } }
            return current
        }

        mutating func parseExpression() throws -> Node {
            let node = try orExpr(depth: 0)
            guard index == tokens.count else { throw ParseError.unexpectedToken("trailing tokens") }
            return node
        }

        private mutating func orExpr(depth: Int) throws -> Node {
            if depth > ValidateExpression.maxDepth { throw ParseError.tooDeep }
            var left = try andExpr(depth: depth + 1)
            while case .or = current {
                _ = advance()
                left = .or(left, try andExpr(depth: depth + 1))
            }
            return left
        }

        private mutating func andExpr(depth: Int) throws -> Node {
            if depth > ValidateExpression.maxDepth { throw ParseError.tooDeep }
            var left = try comparison(depth: depth + 1)
            while case .and = current {
                _ = advance()
                left = .and(left, try comparison(depth: depth + 1))
            }
            return left
        }

        private mutating func comparison(depth: Int) throws -> Node {
            let left = try primary(depth: depth + 1)
            switch current {
            case .equal: _ = advance(); return .equal(left, try primary(depth: depth + 1))
            case .notEqual: _ = advance(); return .notEqual(left, try primary(depth: depth + 1))
            case .less: _ = advance(); return .less(left, try primary(depth: depth + 1))
            case .lessEqual: _ = advance(); return .lessEqual(left, try primary(depth: depth + 1))
            case .greater: _ = advance(); return .greater(left, try primary(depth: depth + 1))
            case .greaterEqual: _ = advance(); return .greaterEqual(left, try primary(depth: depth + 1))
            default: return left
            }
        }

        private mutating func primary(depth: Int) throws -> Node {
            if depth > ValidateExpression.maxDepth { throw ParseError.tooDeep }
            switch current {
            case .not:
                _ = advance()
                return .not(try primary(depth: depth + 1))
            case .number(let n):
                _ = advance()
                return .literal(.number(n))
            case .string(let s):
                _ = advance()
                return .literal(.string(s))
            case .bool(let b):
                _ = advance()
                return .literal(.bool(b))
            case .null:
                _ = advance()
                return .literal(.null)
            case .identifier(let name):
                _ = advance()
                if case .lparen = current {
                    _ = advance()
                    var args: [Node] = []
                    if case .rparen = current {
                        _ = advance()
                    } else {
                        while true {
                            args.append(try primary(depth: depth + 1))
                            switch current {
                            case .comma:
                                _ = advance()
                                continue
                            case .rparen:
                                _ = advance()
                                break
                            default:
                                throw ParseError.expectedComma
                            }
                        }
                    }
                    return .call(name, args)
                }
                return .variable(name)
            case .lparen:
                _ = advance()
                let inner = try orExpr(depth: depth + 1)
                guard case .rparen = current else { throw ParseError.expectedParen }
                _ = advance()
                return inner
            default:
                throw ParseError.expectedExpression
            }
        }
    }

    // MARK: - Evaluator

    private struct Evaluator {
        let context: ActionContext
        let match: ActionMatchInfo?

        func evaluate(_ node: Node, depth: Int = 0) throws -> Value {
            if depth > ValidateExpression.maxDepth { throw EvalError.tooDeep }
            switch node {
            case .literal(let value):
                return value
            case .variable(let name):
                return try variable(name)
            case .call(let name, let args):
                return try call(name, args, depth: depth)
            case .not(let inner):
                let value = try evaluate(inner, depth: depth + 1)
                guard case .bool(let b) = value else { throw EvalError.typeMismatch("'!' requires a boolean") }
                return .bool(!b)
            case .and(let l, let r):
                let lv = try evaluate(l, depth: depth + 1)
                guard case .bool(let lb) = lv else { throw EvalError.typeMismatch("'&&' requires booleans") }
                if !lb { return .bool(false) }
                let rv = try evaluate(r, depth: depth + 1)
                guard case .bool(let rb) = rv else { throw EvalError.typeMismatch("'&&' requires booleans") }
                return .bool(rb)
            case .or(let l, let r):
                let lv = try evaluate(l, depth: depth + 1)
                guard case .bool(let lb) = lv else { throw EvalError.typeMismatch("'||' requires booleans") }
                if lb { return .bool(true) }
                let rv = try evaluate(r, depth: depth + 1)
                guard case .bool(let rb) = rv else { throw EvalError.typeMismatch("'||' requires booleans") }
                return .bool(rb)
            case .equal(let l, let r):
                return .bool(try equality(l, r, depth: depth))
            case .notEqual(let l, let r):
                return .bool(!(try equality(l, r, depth: depth)))
            case .less(let l, let r):
                return .bool(try compare(l, r, depth: depth) == .orderedAscending)
            case .lessEqual(let l, let r):
                return .bool(try compare(l, r, depth: depth) != .orderedDescending)
            case .greater(let l, let r):
                return .bool(try compare(l, r, depth: depth) == .orderedDescending)
            case .greaterEqual(let l, let r):
                return .bool(try compare(l, r, depth: depth) != .orderedAscending)
            }
        }

        private func variable(_ name: String) throws -> Value {
            switch name {
            case "text": return .string(context.selection.text)
            case "matched": return .string(match?.matchedText ?? context.selection.text)
            case "app": return .string(context.selection.sourceApp.bundleIdentifier ?? "")
            case "appName": return .string(context.selection.sourceApp.localizedName ?? "")
            case "hasSelection":
                return .bool(!context.selection.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            case "captures": return .array(match?.captures ?? [])
            default: throw EvalError.unknownVariable(name)
            }
        }

        private func call(_ name: String, _ args: [Node], depth: Int) throws -> Value {
            switch name {
            case "length":
                try arity(name, 1, args.count)
                let value = try evaluate(args[0], depth: depth + 1)
                switch value {
                case .string(let s): return .number(Double(s.count))
                case .array(let a): return .number(Double(a.count))
                default: throw EvalError.typeMismatch("length() requires a string or array")
                }
            case "isEmail":
                try arity(name, 1, args.count)
                return .bool(Self.isEmail(try stringArg(name, args[0], depth: depth)))
            case "isURL":
                try arity(name, 1, args.count)
                return .bool(Self.isURL(try stringArg(name, args[0], depth: depth)))
            case "contains":
                try arity(name, 2, args.count)
                let needle = try stringArg(name, args[1], depth: depth)
                let haystack = try evaluate(args[0], depth: depth + 1)
                switch haystack {
                case .string(let s): return .bool(s.range(of: needle) != nil)
                case .array(let a): return .bool(a.contains(needle))
                default: throw EvalError.typeMismatch("contains() requires a string or array")
                }
            case "startsWith":
                try arity(name, 2, args.count)
                let s = try stringArg(name, args[0], depth: depth)
                return .bool(s.hasPrefix(try stringArg(name, args[1], depth: depth)))
            case "endsWith":
                try arity(name, 2, args.count)
                let s = try stringArg(name, args[0], depth: depth)
                return .bool(s.hasSuffix(try stringArg(name, args[1], depth: depth)))
            case "trim":
                try arity(name, 1, args.count)
                return .string(try stringArg(name, args[0], depth: depth).trimmingCharacters(in: .whitespacesAndNewlines))
            case "lower":
                try arity(name, 1, args.count)
                return .string(try stringArg(name, args[0], depth: depth).lowercased())
            case "upper":
                try arity(name, 1, args.count)
                return .string(try stringArg(name, args[0], depth: depth).uppercased())
            case "matches":
                try arity(name, 2, args.count)
                let text = try stringArg(name, args[0], depth: depth)
                let pattern = try stringArg(name, args[1], depth: depth)
                return .bool(Self.regexMatches(pattern: pattern, in: text))
            case "number":
                try arity(name, 1, args.count)
                let raw = try stringArg(name, args[0], depth: depth).trimmingCharacters(in: .whitespacesAndNewlines)
                guard let number = Double(raw) else { return .null }
                return .number(number)
            default:
                throw EvalError.unknownFunction(name)
            }
        }

        private func stringArg(_ fn: String, _ node: Node, depth: Int) throws -> String {
            let value = try evaluate(node, depth: depth + 1)
            guard case .string(let s) = value else { throw EvalError.typeMismatch("\(fn)() requires a string argument") }
            return s
        }

        private func arity(_ fn: String, _ expected: Int, _ got: Int) throws {
            guard got == expected else { throw EvalError.arity(name: fn, expected: expected, got: got) }
        }

        private func equality(_ l: Node, _ r: Node, depth: Int) throws -> Bool {
            try evaluate(l, depth: depth + 1) == evaluate(r, depth: depth + 1)
        }

        /// Returns .orderedSame / .orderedAscending / .orderedDescending. Cross-type or null
        /// operands for ordering comparisons are a type mismatch (EvalError).
        private func compare(_ l: Node, _ r: Node, depth: Int) throws -> ComparisonResult {
            let lv = try evaluate(l, depth: depth + 1)
            let rv = try evaluate(r, depth: depth + 1)
            switch (lv, rv) {
            case (.number(let a), .number(let b)):
                if a == b { return .orderedSame }
                return a < b ? .orderedAscending : .orderedDescending
            case (.string(let a), .string(let b)):
                return (a as NSString).compare(b)
            default:
                throw EvalError.typeMismatch("ordering comparison requires two numbers or two strings")
            }
        }

        // MARK: Predicates

        private static func isEmail(_ string: String) -> Bool {
            isEmailRegex.firstMatch(in: string, options: [], range: NSRange(string.startIndex..., in: string)) != nil
        }

        private static func isURL(_ string: String) -> Bool {
            isURLRegex.firstMatch(in: string, options: [], range: NSRange(string.startIndex..., in: string)) != nil
        }

        private static func regexMatches(pattern: String, in string: String) -> Bool {
            guard let regex = try? NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators, .caseInsensitive]) else {
                return false // malformed matches() pattern behaves like "no match"
            }
            let range = NSRange(string.startIndex..., in: string)
            return regex.firstMatch(in: string, options: [], range: range) != nil
        }

        private static let isEmailRegex = try! NSRegularExpression(
            pattern: "^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$",
            options: []
        )

        private static let isURLRegex = try! NSRegularExpression(
            pattern: "^(https?|ftp|file)://|^www\\.",
            options: [.caseInsensitive]
        )
    }
}

// MARK: - Descriptions (for Log surfaces)

extension ValidateExpression.ParseError: CustomStringConvertible {
    public var description: String {
        switch self {
        case .unterminatedString: return "unterminated string literal"
        case .unexpectedToken(let t): return "unexpected token \"\(t)\""
        case .expectedExpression: return "expected an expression"
        case .expectedComma: return "expected ',' between arguments"
        case .expectedParen: return "expected ')'"
        case .tooDeep: return "expression nesting too deep"
        }
    }
}

extension ValidateExpression.EvalError: CustomStringConvertible {
    public var description: String {
        switch self {
        case .arity(let name, let expected, let got): return "\(name)() expects \(expected) argument(s), got \(got)"
        case .typeMismatch(let message): return "type mismatch: \(message)"
        case .unknownFunction(let name): return "unknown function \"\(name)\""
        case .unknownVariable(let name): return "unknown variable \"\(name)\""
        case .tooDeep: return "evaluation nesting too deep"
        }
    }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `timeout -k 10 60 ./scripts/test.sh ValidateExpressionTests`
Expected: PASS (all new tests green).

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Extensions/Manifest/ValidateExpression.swift Tests/OpenClipTests/ValidateExpressionTests.swift
git commit -m "feat(core): add ValidateExpression DSL for computed visibility"
```

---

### Task 2: `ActionRequirements.expression` manifest field

**Files:**
- Modify: `Sources/Core/Extensions/Manifest/ActionRequirements.swift` (add field + decode/encode + CodingKey)
- Regenerate the project: `xcodegen generate` (no new file — skip if nothing changed topology)

**Interfaces:**
- Produces: `public var expression: String?` on `ActionRequirements`; decodes from JSON key `"expression"`.

- [ ] **Step 1: Add the field**

In `ActionRequirements` (ActionRequirements.swift:9):

```swift
public struct ActionRequirements: Codable, Sendable, Equatable {
    public var regex: String?
    public var regexNegated: Bool
    public var apps: [String]?
    public var appsMode: AppsMode
    public var requiresSelection: Bool
    public var requiredOptions: [String]?
    public var expression: String?

    public enum AppsMode: String, Codable, Sendable {
        case allow
        case deny
    }

    public init(
        regex: String? = nil,
        regexNegated: Bool = false,
        apps: [String]? = nil,
        appsMode: AppsMode = .allow,
        requiresSelection: Bool = true,
        requiredOptions: [String]? = nil,
        expression: String? = nil
    ) {
        self.regex = regex
        self.regexNegated = regexNegated
        self.apps = apps
        self.appsMode = appsMode
        self.requiresSelection = requiresSelection
        self.requiredOptions = requiredOptions
        self.expression = expression
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.regex = try container.decodeIfPresent(String.self, forKey: .regex)
        self.regexNegated = try container.decodeIfPresent(Bool.self, forKey: .regexNegated)
            ?? container.decodeIfPresent(Bool.self, forKey: .regexNegatedDash) ?? false
        self.apps = try container.decodeIfPresent([String].self, forKey: .apps)
        self.appsMode = try container.decodeIfPresent(AppsMode.self, forKey: .appsMode)
            ?? container.decodeIfPresent(AppsMode.self, forKey: .appsModeDash) ?? .allow
        self.requiresSelection = try container.decodeIfPresent(Bool.self, forKey: .requiresSelection)
            ?? container.decodeIfPresent(Bool.self, forKey: .requiresSelectionDash) ?? true
        self.requiredOptions = try container.decodeIfPresent([String].self, forKey: .requiredOptions)
            ?? container.decodeIfPresent([String].self, forKey: .requiredOptionsDash)
        self.expression = try container.decodeIfPresent(String.self, forKey: .expression)
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(regex, forKey: .regex)
        try container.encodeIfPresent(regexNegated, forKey: .regexNegated)
        try container.encodeIfPresent(apps, forKey: .apps)
        try container.encodeIfPresent(appsMode, forKey: .appsMode)
        try container.encodeIfPresent(requiresSelection, forKey: .requiresSelection)
        try container.encodeIfPresent(requiredOptions, forKey: .requiredOptions)
        try container.encodeIfPresent(expression, forKey: .expression)
    }

    enum CodingKeys: String, CodingKey {
        case regex
        case regexNegated = "regexNegated"
        case regexNegatedDash = "regex-negated"
        case apps
        case appsMode = "appsMode"
        case appsModeDash = "apps-mode"
        case requiresSelection = "requiresSelection"
        case requiresSelectionDash = "requires-selection"
        case requiredOptions = "requiredOptions"
        case requiredOptionsDash = "required-options"
        case expression
    }
}
```

- [ ] **Step 2: Write + run the decode/encode test**

Add to `ActionVisibilityTests.swift` (this class already covers `ActionRequirements` decoding):

```swift
func testDecodedRequirementsExpressionSurvivesRoundTrip() throws {
    let json = #"{"expression": "isEmail(text)"}"#.data(using: .utf8)!
    let requirements = try JSONDecoder().decode(ActionRequirements.self, from: json)
    XCTAssertEqual(requirements.expression, "isEmail(text)")

    let data = try JSONEncoder().encode(requirements)
    let roundTripped = try JSONDecoder().decode(ActionRequirements.self, from: data)
    XCTAssertEqual(roundTripped.expression, "isEmail(text)")
}
```

Run: `timeout -k 10 60 ./scripts/test.sh ActionVisibilityTests`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add Sources/Core/Extensions/Manifest/ActionRequirements.swift Tests/OpenClipTests/ActionVisibilityTests.swift
git commit -m "feat(core): add requirements.expression manifest field"
```

---

### Task 3: `ActionVisibility` expression gate (single owner)

**Files:**
- Modify: `Sources/Core/Actions/ActionVisibility.swift`
- Modify: `Tests/OpenClipTests/ActionVisibilityTests.swift`

**Interfaces:**
- Consumes: `ValidateExpression.parse`, `ValidateExpression.evaluate(_:match:)` (Task 1).
- Produces: `ActionVisibility.isEnabled(requirements:legacyRegex:expression:context:)` — `expression` defaulted to `nil` so all 24 existing call sites compile unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `ActionVisibilityTests.swift`:

```swift
// MARK: - expression gate

func testExpressionGateDisablesWhenEvaluatesFalse() {
    let requirements = ActionRequirements(expression: "isEmail(text)")
    let context = ActionContext(selectedText: "not an email")
    let result = ActionVisibility.isEnabled(requirements: requirements, legacyRegex: nil, expression: attemptParse("isEmail(text)"), context: context)
    XCTAssertFalse(result.enabled)
}

func testExpressionGateEnablesWhenEvaluatesTrue() {
    let requirements = ActionRequirements(expression: "isEmail(text)")
    let context = ActionContext(selectedText: "a@b.com")
    let result = ActionVisibility.isEnabled(requirements: requirements, legacyRegex: nil, expression: attemptParse("isEmail(text)"), context: context)
    XCTAssertTrue(result.enabled)
}

func testRegexAndExpressionBothMustPass() {
    let requirements = ActionRequirements(regex: "^[a-z]+@", expression: "length(text) >= 8")
    let expression = attemptParse("length(text) >= 8")

    let bothPass = ActionContext(selectedText: "user@example.com")
    XCTAssertTrue(ActionVisibility.isEnabled(requirements: requirements, legacyRegex: nil, expression: expression, context: bothPass).enabled)

    let regexPassesExpressionFails = ActionContext(selectedText: "a@b.co")
    // regex ^[a-z]+@ matches, but length < 8
    XCTAssertFalse(ActionVisibility.isEnabled(requirements: requirements, legacyRegex: nil, expression: expression, context: regexPassesExpressionFails).enabled)

    let regexFails = ActionContext(selectedText: "HEY@example.com")
    // regex first pass fails -> disabled without evaluating the expression
    XCTAssertFalse(ActionVisibility.isEnabled(requirements: requirements, legacyRegex: nil, expression: expression, context: regexFails).enabled)
}

func testLegacyRegexWithExpressionGate() {
    let context = ActionContext(selectedText: "hello world")
    let expression = attemptParse("contains(text, \"world\")")
    let passing = ActionVisibility.isEnabled(requirements: nil, legacyRegex: "^hello", expression: expression, context: context)
    XCTAssertTrue(passing.enabled)
    let failingExpr = attemptParse("contains(text, \"moon\")")
    let failing = ActionVisibility.isEnabled(requirements: nil, legacyRegex: "^hello", expression: failingExpr, context: context)
    XCTAssertFalse(failing.enabled)
}

func testExpressionRuntimeErrorDisables() {
    let requirements = ActionRequirements(expression: "length(text) == \"x\"")
    let context = ActionContext(selectedText: "hello")
    let result = ActionVisibility.isEnabled(requirements: requirements, legacyRegex: nil, expression: attemptParse("length(text) == \"x\""), context: context)
    XCTAssertFalse(result.enabled) // fail-closed on eval error
}

func testExpressionWithoutRequirementsGatesAlone() {
    let context = ActionContext(selectedText: "a@b.com")
    let passing = ActionVisibility.isEnabled(requirements: nil, legacyRegex: nil, expression: attemptParse("isEmail(text)"), context: context)
    XCTAssertTrue(passing.enabled)
}
```

Add a private helper at the top of the class:

```swift
private func attemptParse(_ source: String) -> ValidateExpression {
    // Test-only: source strings here are known-valid; parse failure would surface as a force-trap.
    try! ValidateExpression.parse(source).get()
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `timeout -k 10 60 ./scripts/test.sh ActionVisibilityTests`
Expected: FAIL — `expression:` argument not found in `isEnabled` signature.

- [ ] **Step 3: Add the gate to `ActionVisibility`**

Rewrite `isEnabled` (ActionVisibility.swift:21-89) to the version below. Behavior is unchanged for `expression == nil` (including malformed-regex fail-open returning `(true, noMatch)` and skipping the gate, exactly as today). Matched/negated regex handling is preserved:

```swift
public static func isEnabled(
    requirements: ActionRequirements?,
    legacyRegex: String?,
    expression: ValidateExpression? = nil,
    context: ActionContext
) -> (enabled: Bool, match: ActionMatchInfo) {
    let text = context.selection.text
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    let sourceBundleID = context.selection.sourceApp.bundleIdentifier
    let noMatch = ActionMatchInfo(text: text, matchedText: text, captures: [], sourceBundleID: sourceBundleID)

    // 1. requiresSelection (default true for extension actions).
    let requiresSelection = requirements?.requiresSelection ?? true
    if requiresSelection && trimmed.isEmpty {
        return (false, noMatch)
    }

    // 2. App allow/deny list vs the source app bundle identifier.
    if let apps = requirements?.apps, !apps.isEmpty {
        switch requirements?.appsMode ?? .allow {
        case .allow:
            guard let sourceBundleID, apps.contains(sourceBundleID) else {
                return (false, noMatch)
            }
        case .deny:
            if let sourceBundleID, apps.contains(sourceBundleID) {
                return (false, noMatch)
            }
        }
    }

    // 3. Regex match / negated match (unchanged). The regex is the fast first pass: a missing
    //    or failed regex gate returns before the DSL expression ever evaluates.
    let pattern = requirements?.regex ?? legacyRegex
    var matched = noMatch
    var regexEnabled: Bool? = nil
    if let pattern, !pattern.isEmpty {
        do {
            let regex = try NSRegularExpression(pattern: pattern, options: [.dotMatchesLineSeparators, .caseInsensitive])
            let range = NSRange(trimmed.startIndex..., in: trimmed)
            if let result = regex.firstMatch(in: trimmed, options: [], range: range) {
                let matchedText = Range(result.range, in: trimmed).map { String(trimmed[$0]) } ?? trimmed
                var captures: [String] = []
                if regex.numberOfCaptureGroups > 0 {
                    for group in 1...regex.numberOfCaptureGroups {
                        let groupRange = result.range(at: group)
                        if groupRange.location != NSNotFound, let swiftRange = Range(groupRange, in: trimmed) {
                            captures.append(String(trimmed[swiftRange]))
                        } else {
                            captures.append("")
                        }
                    }
                }
                matched = ActionMatchInfo(text: text, matchedText: matchedText, captures: captures, sourceBundleID: sourceBundleID)
                regexEnabled = !(requirements?.regexNegated == true)
            } else {
                regexEnabled = requirements?.regexNegated == true
            }
        } catch {
            // Defensive: a malformed regex must not hide an action (legacy URL behavior). The
            // expression gate is skipped alongside it, matching prior behavior.
            Log.coordinator.debug("Malformed enablement regex treated as non-matching: \(error.localizedDescription)")
            return (true, noMatch)
        }
    }
    if regexEnabled == false {
        return (false, matched)
    }

    // 4. Computed visibility via the expression DSL (pure Swift, parse-once-eval-many).
    if let expression {
        switch expression.evaluate(context, match: matched) {
        case .success(true):
            return (true, matched)
        case .success(false):
            return (false, matched)
        case .failure(let error):
            Log.js.error("Enablement expression evaluation failed: \(error)")
            return (false, matched)
        }
    }

    return (true, matched)
}
```

Note the comment at the top of the file still stands (pure: no UserDefaults/AppKit/Keychain). Update the file-doc block to mention the new step-4 expression gate.

- [ ] **Step 4: Run tests to verify they pass**

Run: `timeout -k 10 60 ./scripts/test.sh ActionVisibilityTests`
Expected: PASS (24 existing + 8 new).

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Actions/ActionVisibility.swift Tests/OpenClipTests/ActionVisibilityTests.swift
git commit -m "feat(core): gate ActionVisibility on the expression DSL"
```

---

### Task 4: `ExtensionActionRules.compiledExpression` + `resolveVisibility(for:)`

**Files:**
- Modify: `Sources/Core/Actions/ExtensionActionRules.swift`
- Modify: `Tests/OpenClipTests/ActionVisibilityTests.swift` (or a new small test file)

**Interfaces:**
- Consumes: `ActionVisibility.isEnabled(...expression:)` (Task 3).
- Produces: `ExtensionActionRules(requirements:legacyRegex:after:stayVisible:compiledExpression:)` (memberwise init, `compiledExpression` defaulted nil and non-breaking) and `@MainActor func resolveVisibility(for:) -> (enabled: Bool, match: ActionMatchInfo)`.

- [ ] **Step 1: Rewrite `ExtensionActionRules`**

Replace the current synthesized struct (ExtensionActionRules.swift:13-29) with:

```swift
public struct ExtensionActionRules: Codable, Sendable, Equatable {
    public let requirements: ActionRequirements?
    public let legacyRegex: String?
    public let after: ActionAfterBehavior
    public let stayVisible: Bool
    /// Derived data: the requirements.expression source compiled once by DefaultActionFactory.
    /// Skipped by Codable (decoded instances recompile via the factory); nil means no expression
    /// gate, matching pre-DSL behavior.
    public let compiledExpression: ValidateExpression?

    public init(
        requirements: ActionRequirements? = nil,
        legacyRegex: String? = nil,
        after: ActionAfterBehavior = .default,
        stayVisible: Bool = false,
        compiledExpression: ValidateExpression? = nil
    ) {
        self.requirements = requirements
        self.legacyRegex = legacyRegex
        self.after = after
        self.stayVisible = stayVisible
        self.compiledExpression = compiledExpression
    }

    /// The shared enablement entry point for extension actions. All extension action structs
    /// call this instead of reaching into ActionVisibility themselves.
    @MainActor
    public func resolveVisibility(for context: ActionContext) -> (enabled: Bool, match: ActionMatchInfo) {
        ActionVisibility.isEnabled(
            requirements: requirements,
            legacyRegex: legacyRegex,
            expression: compiledExpression,
            context: context
        )
    }

    private enum CodingKeys: String, CodingKey {
        case requirements, legacyRegex, after, stayVisible
    }

    // compiledExpression is derived data; the source string survives inside requirements.expression
    // and the factory recompiles it. Encode/decode the four declarative fields only.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.requirements = try container.decodeIfPresent(ActionRequirements.self, forKey: .requirements)
        self.legacyRegex = try container.decodeIfPresent(String.self, forKey: .legacyRegex)
        self.after = try container.decodeIfPresent(ActionAfterBehavior.self, forKey: .after) ?? .default
        self.stayVisible = try container.decodeIfPresent(Bool.self, forKey: .stayVisible) ?? false
        self.compiledExpression = nil
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(requirements, forKey: .requirements)
        try container.encodeIfPresent(legacyRegex, forKey: .legacyRegex)
        try container.encode(after, forKey: .after)
        try container.encode(stayVisible, forKey: .stayVisible)
    }
}
```

- [ ] **Step 2: Write + run the resolveVisibility test**

Append to `ActionVisibilityTests.swift`:

```swift
func testResolveVisibilityCarriesCompiledExpression() {
    let expression = try! ValidateExpression.parse("length(text) > 5").get()
    let rules = ExtensionActionRules(
        requirements: ActionRequirements(expression: "length(text) > 5"),
        compiledExpression: expression
    )
    let short = ActionContext(selectedText: "hi")
    let long = ActionContext(selectedText: "a longer selection")
    XCTAssertFalse(rules.resolveVisibility(for: short).enabled)
    XCTAssertTrue(rules.resolveVisibility(for: long).enabled)
}

func testResolveVisibilityWithoutExpressionDelegateToRegex() {
    let rules = ExtensionActionRules(requirements: ActionRequirements(regex: "^[0-9]+$"))
    XCTAssertTrue(rules.resolveVisibility(for: ActionContext(selectedText: "12345")).enabled)
    XCTAssertFalse(rules.resolveVisibility(for: ActionContext(selectedText: "abc")).enabled)
}

func testRulesRoundTripDropsCompiledExpressionButKeepsSource() throws {
    let rules = ExtensionActionRules(
        requirements: ActionRequirements(expression: "isEmail(text)"),
        compiledExpression: try! ValidateExpression.parse("isEmail(text)").get()
    )
    let data = try JSONEncoder().encode(rules)
    let decoded = try JSONDecoder().decode(ExtensionActionRules.self, from: data)
    XCTAssertEqual(decoded.requirements?.expression, "isEmail(text)")
    XCTAssertNil(decoded.compiledExpression)
}
```

Run: `timeout -k 10 60 ./scripts/test.sh ActionVisibilityTests`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add Sources/Core/Actions/ExtensionActionRules.swift Tests/OpenClipTests/ActionVisibilityTests.swift
git commit -m "refactor(core): add compiledExpression and resolveVisibility to ExtensionActionRules"
```

---

### Task 5: `DefaultActionFactory` parses the expression once

**Files:**
- Modify: `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift`
- Modify: `Tests/OpenClipTests/NewExtensionKindTests.swift`

**Interfaces:**
- Consumes: `ValidateExpression.parse` (Task 1), `ExtensionActionRules(...compiledExpression:)` (Task 4).
- Produces: every factory-built action's `rules.compiledExpression` compiles `metadata.requirements.expression` once at load.

- [ ] **Step 1: Write the failing tests**

Append to `NewExtensionKindTests.swift`:

```swift
@MainActor
func testFactoryCompilesExpressionIntoRulesAndGatesActions() async throws {
    let factory = DefaultActionFactory()
    let meta = ExtensionActionMetadata(
        title: "Exp",
        type: "url",
        url: "https://example.com/?q={text}",
        requirements: ActionRequirements(expression: "length(text) >= 5")
    )
    let manifest = ExtensionMetadata(identifier: "com.test.exp", name: "Exp Test", actions: [meta])

    let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tempDir) }

    let action = await factory.createAction(metadata: meta, manifest: manifest, directoryURL: tempDir, index: 0)
    guard let urlAction = action as? URLTemplateAction else {
        return XCTFail("Expected URLTemplateAction, got \(String(describing: action))")
    }
    XCTAssertNotNil(urlAction.rules?.compiledExpression)
    XCTAssertTrue(urlAction.isEnabled(for: makeContext(text: "12345")))
    XCTAssertFalse(urlAction.isEnabled(for: makeContext(text: "hi")))
}

@MainActor
func testFactoryMalformedExpressionFailsOpen() async throws {
    let factory = DefaultActionFactory()
    let meta = ExtensionActionMetadata(
        title: "Bad",
        type: "url",
        url: "https://example.com/?q={text}",
        requirements: ActionRequirements(expression: "isEmail(text) &&")
    )
    let manifest = ExtensionMetadata(identifier: "com.test.bad", name: "Bad Test", actions: [meta])

    let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try? FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tempDir) }

    let action = await factory.createAction(metadata: meta, manifest: manifest, directoryURL: tempDir, index: 0)
    let urlAction = action as? URLTemplateAction
    XCTAssertNotNil(urlAction)
    XCTAssertNil(urlAction?.rules?.compiledExpression) // malformed -> nil -> behaves as today
    XCTAssertTrue(urlAction?.isEnabled(for: makeContext(text: "anything")) == true)
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `timeout -k 10 60 ./scripts/test.sh NewExtensionKindTests`
Expected: FAIL — new tests red (compiledExpression nil).

- [ ] **Step 3: Add the compile helper and wire it in**

In `DefaultActionFactory`, add a private helper and use it in both rules-construction sites:

```swift
/// Compiles the manifest expression DSL once (parse-once-eval-many). On a parse failure the
/// expression is dropped and logged via Log.js: the action then behaves exactly as before the
/// DSL existed (defensive fail-open, mirroring the malformed-regex stance).
private func compiledExpression(for metadata: ExtensionActionMetadata, actionID: String) -> ValidateExpression? {
    guard let source = metadata.requirements?.expression,
          !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
        return nil
    }
    switch ValidateExpression.parse(source) {
    case .success(let expression):
        return expression
    case .failure(let error):
        Log.js.error("Enablement expression parse failed for \(actionID, privacy: .public): \(error)")
        return nil
    }
}
```

In `makeAction` (DefaultActionFactory.swift:166), replace:

```swift
let rules = ExtensionActionRules(
    requirements: metadata.requirements,
    legacyRegex: metadata.regex,
    after: metadata.after ?? .default,
    stayVisible: metadata.stayVisible ?? false
)
```

with:

```swift
let rules = ExtensionActionRules(
    requirements: metadata.requirements,
    legacyRegex: metadata.regex,
    after: metadata.after ?? .default,
    stayVisible: metadata.stayVisible ?? false,
    compiledExpression: compiledExpression(for: metadata, actionID: actionId)
)
```

In `createActions` group row (DefaultActionFactory.swift:102), replace:

```swift
let groupRules = ExtensionActionRules(
    requirements: metadata.requirements,
    legacyRegex: metadata.regex,
    after: .default,
    stayVisible: metadata.stayVisible ?? false
)
```

with:

```swift
let groupRules = ExtensionActionRules(
    requirements: metadata.requirements,
    legacyRegex: metadata.regex,
    after: .default,
    stayVisible: metadata.stayVisible ?? false,
    compiledExpression: compiledExpression(for: metadata, actionID: groupID)
)
```

(Sub-actions already flow through `makeAction`, so they compile via the `makeAction` change.)

- [ ] **Step 4: Run to verify they pass**

Run: `timeout -k 10 60 ./scripts/test.sh NewExtensionKindTests`
Expected: PASS (group flattening + existing routing tests stay green).

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift Tests/OpenClipTests/NewExtensionKindTests.swift
git commit -m "feat(factory): compile expression DSL once at load"
```

---

### Task 6: Migrate the ten action structs to `resolveVisibility(for:)`

Mechanical: every struct that currently calls
`ActionVisibility.isEnabled(requirements:legacyRegex:context:)` (or guards + calls) delegates to
`rules.resolveVisibility(for:)` instead. This deletes the duplicated pass-through and threads the
compiled expression through the single carrier.

**Files (Core):**
- Modify: `Sources/Core/Actions/CustomAction.swift` (lines 48-60)
- Modify: `Sources/Core/Actions/GroupAction.swift` (lines 32-44)
- Modify: `Sources/Core/Actions/URLTemplateAction.swift` (lines 31-47 — special case)
- Modify: `Sources/Core/Extensions/ScriptAction.swift` (lines 32-45)

**Files (App):**
- Modify: `Sources/OpenClip/Actions/JavaScriptAction.swift` (lines 70-80)
- Modify: `Sources/OpenClip/Actions/JavaScriptCanvasAction.swift` (lines 71-79)
- Modify: `Sources/OpenClip/Actions/AppleScriptAction.swift` (lines 62-70)
- Modify: `Sources/OpenClip/Actions/KeyPressAction.swift` (lines 40-49)
- Modify: `Sources/OpenClip/Actions/ShortcutAction.swift` (lines 40-49)
- Modify: `Sources/OpenClip/Actions/NamedServiceAction.swift` (lines 40-49)

**Interface:**
- Consumes: `ExtensionActionRules.resolveVisibility(for:)` (Task 4).

- [ ] **Step 1: Standard pattern — nine structs**

For each of the nine files above (all but `URLTemplateAction`), the two methods become:

```swift
@MainActor
public func isEnabled(for context: ActionContext) -> Bool {
    guard let rules else {
        return !context.selection.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    return rules.resolveVisibility(for: context).enabled
}

@MainActor
public func matchInfo(for context: ActionContext) -> ActionMatchInfo? {
    guard let rules else { return nil }
    return rules.resolveVisibility(for: context).match
}
```

Preserve each file's existing `guard let rules` default branch exactly as it is today (some use
`!context.selection.text.isEmpty`, ScriptAction uses the trimmed form — do not change it; the
`guard` return differs between files and is intentional). Only the `return
ActionVisibility.isEnabled(...).enabled` / `.match` lines change.

- [ ] **Step 2: `URLTemplateAction` — keep the nil-rules regex fallback**

`URLTemplateAction` stores `rules` and a separate `regexPattern` param. When `rules == nil` it must
still honor the legacy `regexPattern` via the direct evaluator, so keep that fallback path explicit:

```swift
@MainActor
public func isEnabled(for context: ActionContext) -> Bool {
    guard let rules else {
        return ActionVisibility.isEnabled(
            requirements: nil,
            legacyRegex: regexPattern,
            context: context
        ).enabled
    }
    return rules.resolveVisibility(for: context).enabled
}

@MainActor
public func matchInfo(for context: ActionContext) -> ActionMatchInfo? {
    guard let rules else {
        return ActionVisibility.isEnabled(
            requirements: nil,
            legacyRegex: regexPattern,
            context: context
        ).match
    }
    return rules.resolveVisibility(for: context).match
}
```

- [ ] **Step 3: Remove the `ActionVisibility` import reference if it becomes unused**

Each migrated Core/App file still needs `import Core`; `ActionVisibility` is only referenced
implicitly now. Verify compile — do not remove `import Foundation`. If any file had a direct
`import` for a now-unused symbol, leave the `import` (harmless) unless the compiler warns.

- [ ] **Step 4: Build gate**

Run: `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
Expected: PASS (all ten migrated files compile; builtins untouched).

- [ ] **Step 5: Run the affected suites**

Run: `timeout -k 10 60 ./scripts/test.sh ActionVisibilityTests`
and `timeout -k 10 60 ./scripts/test.sh NewExtensionKindTests`
Expected: PASS — existing action-level enablement tests (incl. `testGroupActionHonoursRules`,
`testURLMatchedPlaceholderIsEncoded`) prove the delegation is equivalent.

- [ ] **Step 6: Commit**

```bash
git add Sources/Core/Actions/CustomAction.swift Sources/Core/Actions/GroupAction.swift Sources/Core/Actions/URLTemplateAction.swift Sources/Core/Extensions/ScriptAction.swift Sources/OpenClip/Actions/JavaScriptAction.swift Sources/OpenClip/Actions/JavaScriptCanvasAction.swift Sources/OpenClip/Actions/AppleScriptAction.swift Sources/OpenClip/Actions/KeyPressAction.swift Sources/OpenClip/Actions/ShortcutAction.swift Sources/OpenClip/Actions/NamedServiceAction.swift
git commit -m "refactor(actions): delegate enablement through resolveVisibility(for:)"
```

---

### Task 7: Full-suite verification

**Files:** none (verification gate).

- [ ] **Step 1: Quick build gate**

Run: `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
Expected: SUCCEEDED.

- [ ] **Step 2: Full test suite**

Run: `timeout -k 10 60 ./scripts/test.sh`
Expected: all tests pass (~45 s). In particular `ValidateExpressionTests`,
`ActionVisibilityTests`, and `NewExtensionKindTests` are green and unchanged suites stay green.

- [ ] **Step 3: Sanity-check docs drift (soft AGENTS.md rule)**

Confirm nothing in `docs/architecture/` needs a line about the new `requirements.expression` /
`ExtensionActionRules.resolveVisibility`. If a reader would otherwise get the enablement story
wrong, add one line to `docs/architecture/known-debt.md` or the extension-facing doc. Do not
fabricate a doc; only touch it if it actively misleads after this change.

- [ ] **Step 4: Commit (only if files changed in step 3)**

```bash
git add docs/
git commit -m "docs: note expression DSL visibility gate"
```

## Self-Review

- **Spec coverage:** manifest `expression` field → Task 2; `ValidateExpression` module (grammar, vars, funcs, bounded depth, Sendable) → Task 1; `ActionVisibility` step-4 gate with defaulted param → Task 3; failure semantics (parse fail-open at load / eval fail-closed) → Tasks 3 & 5; carrier + helper → Task 4; parse-once in factory → Task 5; regex stays fast first pass → Task 3 (+ intentionally not precompiled, noted); tests for enabled/disabled + cache-hit (parse-once-eval-many) + Sendable → Tasks 1, 3, 5; verification (build gate + `timeout -k 10 60 ./scripts/test.sh`) → Task 7. No gaps.
- **Placeholder scan:** no TBD/TODO/“appropriate handling”; every code step carries full code. URLTemplateAction preserves its unique legacy fallback rather than hand-waving it.
- **Type consistency:** `ValidateExpression`/`ParseError`/`EvalError` names identical across Tasks 1–6; `compiledExpression` param name used consistently in Task 4 (init), Task 5 (factory), Task 3/4 (resolveVisibility body); `resolveVisibility(for:)` returns `(enabled: Bool, match: ActionMatchInfo)` everywhere. `evaluate(_ context: ActionContext, match: ActionMatchInfo?) -> Result<Bool, EvalError>` referenced identically in Task 1 tests and Task 3 call site.