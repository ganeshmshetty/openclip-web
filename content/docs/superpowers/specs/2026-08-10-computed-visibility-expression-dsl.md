# Computed Visibility via a Pure-Swift Expression DSL

Date: 2026-08-10 · Status: **Design** (not yet reviewed)

## Problem

`ActionVisibility.isEnabled` (ActionVisibility.swift:21) is the single visibility
evaluator for extension actions, but it is **purely declarative**: `requiresSelection`,
app allow/deny by bundle ID, and one regex. Regex cannot express multi-predicate,
numeric, or semantic conditions ("selected number > 100", "is a URL", "valid email",
"text AND app both match at once").

Options considered and rejected before this spec:

- **JS `validate` via the existing bridge.** `OpenClipJSHost` runs on a `Task.detached`
  background thread with a watchdog (OpenClipJSHost.swift:11-19, 116-139), but
  `Action.isEnabled` is a **synchronous `@MainActor -> Bool`** (Action.swift:23). The
  bridge is `async`, off-main, and sync JS cannot be interrupted (no
  `JSVirtualMachine.invalidate()`). Threading it into a per-mousemove hot path forces
  either a main-thread JSCore eval (forbidden by the runtime threading model) or an
  async `isEnabled` refactor across `ActionRegistry`/`searchCatalog`. Also adds a
  cross-module seam (Core boxed-callable → App JSCore), breaking Core purity.
- **"Extract the JS function and evaluate natively"**: equivalent to writing a
  JavaScript interpreter in Swift — unbounded, worse than calling JSCore. Rejected.
- **Declarative predicate fields only** (`minLength`, `isEmail`, …): fast and pure but
  a finite list; the same wall reappears at the next condition.

Decision: **a small pure-Swift expression DSL, evaluated natively in Core**, extending
the existing `requirements` envelope. Regex stays as the fast first pass; the DSL adds
bounded computed predicates.

## Goal

Let extension authors gate an action on computed properties of the selection by adding
one manifest field — `"expression"` — alongside the existing `regex`/`apps` gates,
evaluated by a pure-Swift, parse-once-eval-many evaluator in Core. Keep everything the
popup does per mousemove cheap, bounded, and timeout-free.

## Design

### 1. Manifest surface — `Sources/Core/Extensions/Manifest/ActionRequirements.swift`

Add one field to `ActionRequirements` (ActionRequirements.swift:9):

```swift
public var expression: String?   // e.g. `length(text) >= 10 && isEmail(text)`
```

CamelCase key `"expression"` only (no legacy dash variant — this is a new field).
`Codable`/`Equatable` synthesis unchanged.

Composition rules with existing gates:

- `requiresSelection` **AND** `apps` **AND** `regex` **AND** `expression` — every present
  gate must pass.
- **Regex stays the fast first pass.** If a regex (or legacy regex) is present and it
  fails, `isEnabled` returns before the DSL evaluates. If no regex, the DSL gates alone.

### 2. New pure-Core module — `Sources/Core/Extensions/Manifest/ValidateExpression.swift`

Tokeniser → recursive-descent parser → immutable AST → synchronous evaluator. Pure
Foundation only: **no AppKit/SwiftUI/JavaScriptCore** (Core purity hard rule).

Interface (deliberately tiny — a deep module):

```swift
public struct ValidateExpression: Sendable, Equatable {
    public let source: String

    public enum ParseError: Error, Equatable, Sendable { ... }
    public enum EvalError: Error, Equatable, Sendable { ... }

    public static func parse(_ source: String) -> Result<ValidateExpression, ParseError>
    public func evaluate(_ context: ActionContext, match: ActionMatchInfo?) -> Result<Bool, EvalError>
}
```

Grammar (bounded — no loops, assignments, or closures):

- **Literals:** `"str"`, numbers, `true` / `false` / `null`
- **Vars:** `text`, `matched`, `app` (bundle id `String?` → `""` when nil), `appName`,
  `hasSelection`, `captures` (array, via `length(captures)` / `contains(...)`)
- **Functions:** `length(x)`, `isEmail(x)`, `isURL(x)`, `contains(x, s)`,
  `startsWith(x, s)`, `endsWith(x, s)`, `matches(x, pattern)`, `trim(x)`, `lower(x)`,
  `upper(x)`, `number(x)` (→ `null` when not numeric)
- **Operators:** `&&`, `||`, `!`, `==`, `!=`, `<`, `<=`, `>`, `>=`, parentheses
- **Depth cap** on parse and eval (e.g. 200) so even a hostile manifest is bounded.

`isEmail`/`isURL` are pure Core predicates defined here — reusable later as declarative
fields without changing anything else.

`Sendable` + `Equatable` by construction (pure enum AST): a program compiled on the
loader's background thread crosses cleanly to the `@MainActor` `isEnabled` path. Regex
is **not** precompiled into this bundle because `NSRegularExpression` is not `Sendable`.

### 3. Failure semantics (chosen, documented)

- **Parse error at load:** the factory logs `Log.js.error(...)` and sets
  `compiledExpression = nil` → the action behaves exactly as today (defensive fail-open,
  mirroring the malformed-regex stance at ActionVisibility.swift:81). A bad expression
  never hides an action.
- **Runtime eval error** (e.g. `length(text) == "x"` on this input): **fail-closed** →
  disabled + `Log.js.error`. Rationale: a type-mismatched condition is unsatisfiable
  as-written for this cell of text; enabling would show an action that looks applicable
  but is not. Logged so nothing disappears silently.

### 4. Single owner preserved — `Sources/Core/Actions/ActionVisibility.swift`

Extend the existing static function with a defaulted parameter (zero churn for the 24
existing tests):

```swift
public static func isEnabled(
    requirements: ActionRequirements?,
    legacyRegex: String?,
    expression: ValidateExpression? = nil,
    context: ActionContext
) -> (enabled: Bool, match: ActionMatchInfo)
```

New step 4, computed after the regex block (which already built the `ActionMatchInfo`):

- `evaluate` `.success(true)` → continue
- `.success(false)` → `(false, match)`
- `.failure` → `Log.js.error(...)`; `(false, match)`

The returned `ActionMatchInfo` is unchanged: the DSL only flips `enabled`; `matchedText`
and `captures` remain regex-owned.

### 5. Carrier + deepening — `Sources/Core/Actions/ExtensionActionRules.swift`

Add a derived field and a centralising helper. The 9 extension action structs already
hold `rules: ExtensionActionRules?` and each forwards `requirements` + `legacyRegex` to
`ActionVisibility` (a pass-through smell — e.g. CustomAction.swift:53, GroupAction.swift:37).

```swift
public struct ExtensionActionRules: Codable, Sendable, Equatable {
    public let requirements: ActionRequirements?
    public let legacyRegex: String?
    public let after: ActionAfterBehavior
    public let stayVisible: Bool
    public let compiledExpression: ValidateExpression?   // derived, default nil
    ...
}

@MainActor
public func resolveVisibility(for context: ActionContext) -> (enabled: Bool, match: ActionMatchInfo) {
    ActionVisibility.isEnabled(requirements: requirements, legacyRegex: legacyRegex,
                               expression: compiledExpression, context: context)
}
```

- **Codable:** the AST is derived data — write manual `encode`/`decode` that skips it
  (source survives inside `requirements.expression`; the factory recompiles). Decoded-only
  `CustomAction`s (a cold patch, not used in production — the factory builds all actions)
  simply have no expression gate until rebuilt.
- **Memberwise `init(... compiledExpression: ValidateExpression? = nil)`** — non-breaking;
  existing factory + test call sites compile unchanged.
- **Interface knowledge concentrates here** — the DSL param would otherwise leak into 9
  call sites. Deletion test: without this helper, the change re-appears across 9 actions;
  with it, the whole change is contained in one file.

Every one of the 9 actions' `isEnabled`/`matchInfo` becomes
`rules.resolveVisibility(for:).enabled` / `.match`.

### 6. Parse once, eval many — `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift`

Both `makeAction` (:148) and the group-row builder in `createActions` (:102) compile
`metadata.requirements?.expression` once at load:

```swift
let compiled = (metadata.requirements?.expression).flatMap { src in
    switch ValidateExpression.parse(src) {
    case .success(let e): e
    case .failure(let err): Log.js.error("\(actionId) expression parse failed: \(err)"); nil
    }
}
```

The compiled AST **is** the performance story: what would have been "one JSCore eval per
action per mousemove" becomes a µs pure-Swift AST walk. No JSContext, no context-hash
cache, no regex-gate-then-JS protocol.

## Out of scope

- **JS `validate` escape hatch.** If power users later need unbounded logic, it slots
  behind `requirements.expression` as a separate concern — not this spec.
- **Regex precompilation.** `NSRegularExpression` is not `Sendable`; keeping the regex
  path exactly as-is both bounds scope and keeps `ExtensionActionRules` a pure value.
- **Manifest validation changes.** `ManifestValidator` is all-or-nothing (it rejects the
  whole manifest); a bad expression must not reject the package, so validation stays out
  and the factory logs instead.
- **Builtins / AI tools / `searchCatalog` enablement semantics.** Unaffected: they do not
  cross `ActionVisibility`.

## Verification

1. `xcodegen generate` (new Swift files under `Sources/Core/` and `Tests/`).
2. Build gate:
   `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
3. Full suite: `timeout -k 10 60 ./scripts/test.sh`
4. Target classes in the suite:
   - `ValidateExpressionTests` (new)
   - `ActionVisibilityTests` (additions — existing 24 must still pass)