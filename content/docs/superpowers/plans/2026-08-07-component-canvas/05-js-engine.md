# 05 — JS Engine & Manifest Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution preference:** inline (no implementation subagents).

**Goal:** Wire the interactive canvas runtime. `CanvasScriptBox` (shared JSValue↔`CanvasElementSpec` conversion + `h()` + the canvas `openclip` bridge), `JavaScriptCanvasEngine` (compile-once `JSScript`, fresh-context mount/dispatch, watchdog + sync cap + async pump reusing the `OpenClipJSHost` patterns), the canvas `openclip.showContent(elementTree, {size})` + `keepVisible` unwrap, the manifest `type: "canvas"` kind (validator + factory + `JavaScriptCanvasAction`), and the end-to-end test surface.

**Architecture:** The engine implements the Core `CanvasScripting` seam (§5.2) — `mount`/`dispatch` only. It owns one `JSVirtualMachine` + one compiled `JSScript` for the session; every event evaluates the compiled bytecode in a **fresh `JSContext`**, injects session state as JSON (no live JS objects between events), and collects leaf `CanvasEffect`s. The controller serializes calls (Task 11), so the engine never runs overlapping dispatches. The factory maps `type: "canvas"` manifests to `JavaScriptCanvasAction`, whose `perform` returns `.showCanvas(request, header)` — the mount does all the work.

**Tech Stack:** Swift 6, JavaScriptCore (`JSVirtualMachine` + `JSScript` + `JSContext`), Core (`CanvasScripting`, `CanvasMountRequest`/`CanvasDispatchRequest`/`…Result`, `CanvasElementSpec`, `CanvasElementParser`, `CanvasTreeValidator`, `CanvasSessionState`, `CanvasEffect`, `CanvasHeader`), `TimeoutFlag`/`SyncEvaluationGate`/`Constants` from Core.

## Global Constraints

(From the plan README — every task here inherits them.) Watchdog = `TimeoutFlag` + `Constants.scriptTimeout` (30 s) + the shared sync-eval cap (`Constants.maxConcurrentSyncScriptEvaluations`); async canvases use the CFRunLoop promise pump from `OpenClipJSHost`; **never `Self.<static>` inside `Task.detached`** — reference `OpenClipJSHost.xxx`/the type by name; `JSScript` compiled once per session, never per event; parser stays JavaScriptCore-free (`JSValue` → `CanvasElementSpec` via `JSONSerialization`); `type: "canvas"` is **JS-only** — shell/AppleScript never produce a canvas and `output: "canvas"` is not introduced; local `file:`/icon paths stay confined via `Constants.isPathSafe`; one active session, replaced on new mount, `hide()` tears the engine down (VM + compiled script dropped). All tests live in `Tests/OpenClipTests/`. Spec: `docs/superpowers/specs/2026-08-07-component-canvas-design.md` §5, §5.1, §5.2, §5.3, §5.4, §9, §10.

---

### Task 22: JSValue→CanvasElementSpec conversion + h() helper + CanvasScriptBox

**Files:**
- Create: `Sources/OpenClip/Actions/CanvasScriptBox.swift`
- Edit: `Sources/OpenClip/Actions/OpenClipJSHost.swift` (refactor the Task 20 inline helpers onto `CanvasScriptBox`)
- Create: `Tests/OpenClipTests/CanvasScriptBoxTests.swift`

**Interfaces:**
- Consumes: `CanvasElementSpec`, `JSONValue`, `CanvasElementParser` (Core).
- Produces (shared by the one-shot host **and** the canvas engine):

```swift
/// Pure JSContext glue: element-object bridging + the h() helper the canvas contract requires.
enum CanvasScriptBox {
    /// Registers `h(type, props, children)` on the context (returns `{type, props, children}` objects).
    static func installH(in context: JSContext)

    /// Converts a bridged JS element object to the neutral Core spec; nil for a non-object root.
    static func elementSpec(from object: [String: Any]) -> CanvasElementSpec?

    /// `[String: Any]`/`[Any]`/`NSNumber`/`String`/`Bool` → `JSONValue` (CFBoolean handled).
    static func jsonValue(from value: Any) -> JSONValue?
}
```

- [ ] **Step 1: Write the failing tests**

`Tests/OpenClipTests/CanvasScriptBoxTests.swift` (a throwaway `JSContext` is fine here — no persistent session):

- `testHBuildsElementObjects` — eval `h('text', { content: 'hello', id: 't' })`; `elementSpec(from:)` yields `CanvasElementSpec(type: "text", props: ["content": .string("hello"), "id": .string("t")], children: [])`.
- `testHNestedChildren` — eval `h('stack', { direction: 'vertical' }, [h('text', { content: 'a' }), h('button', { title: 'Go' })])`; convert + `CanvasElementParser.parseTree` → a `.stack` with two children.
- `testElementSpecPropsCoerceTypes` — props `{ count: 3, on: true }` → `.number(3)`, `.bool(true)`.
- `testNonObjectRootReturnsNil` — `elementSpec(from: ["type": 42])` → nil; `elementSpec(from: ["children": "nope"])` → nil (missing type).
- `testJsonValueHandlesNSNumberBoolean` — `jsonValue(from: NSNumber(value: true))` → `.bool(true)`.

- [ ] **Step 2: Implement `CanvasScriptBox.swift`**

Port the `h` block and the `elementSpec`/`jsonValue` helpers from Task 20's inline `OpenClipJSHost` versions verbatim (they are the same logic; this is the shared home). File doc comment notes it is shared by `OpenClipJSHost` (one-shot) and `JavaScriptCanvasEngine` (session) and that the parser stays JavaScriptCore-free.

- [ ] **Step 3: Refactor `OpenClipJSHost` onto the box**

In `OpenClipJSHost.swift`:
- Replace the inline `h` registration (Task 20 Step 1) with `CanvasScriptBox.installH(in: jsContext)`.
- Delete the inline `CanvasElementSpecSpec`/`jsonValue` helpers; call `CanvasScriptBox.elementSpec(from:)`/`CanvasScriptBox.jsonValue(from:)`.

- [ ] **Step 4: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh CanvasScriptBoxTests`, `timeout -k 10 60 ./scripts/test.sh OpenClipJSHostTests`, then the quick build gate.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add -A Sources/OpenClip/Actions/CanvasScriptBox.swift Sources/OpenClip/Actions/OpenClipJSHost.swift Tests/OpenClipTests/CanvasScriptBoxTests.swift
git commit -m "refactor(js): shared CanvasScriptBox for element-object bridging + h() helper"
```

---

### Task 23: JavaScriptCanvasEngine (compile-once JSScript, mount/dispatch, watchdog)

**Files:**
- Create: `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift`
- Edit: `Sources/OpenClip/Actions/OpenClipJSHost.swift` (make the shared sync gate internal)
- Edit: `Sources/OpenClip/UI/Popup/UnavailableCanvasEngine.swift` → delete (replaced)
- Create: `Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift`

**Interfaces:**
- Consumes: `CanvasScripting` seam (Core), `CanvasScriptBox`, `TimeoutFlag` (Core), `SyncEvaluationGate` (Core), the `OpenClipJSHost` async pump patterns.
- Produces:

```swift
/// Engine-agnostic seam v1: in-process fresh-context eval. One VM + one compiled JSScript per session;
/// every event evaluates the compiled bytecode in a fresh JSContext. State is JSON-injected, never
/// JS-heap-resident between events. Assume the controller serializes mount/dispatch calls.
public final class JavaScriptCanvasEngine: CanvasScripting, @unchecked Sendable {
    public init()
    public func mount(_ request: CanvasMountRequest) async throws -> CanvasMountResult
    public func dispatch(_ request: CanvasDispatchRequest) async throws -> CanvasDispatchResult
}

/// A runtime failure during JS evaluation — distinct from the structural `CanvasParseError`
/// (non-object root, tree-limit violations). Surfaced from jsContext.exception after every call
/// and from rejection of a Promise-returning ui() in sync mode.
public enum CanvasJSRuntimeError: Error, Sendable {
    case scriptException(String)   // a JS throw during mount/dispatch evaluation or a handler/ui call
    case asyncNotSupported          // ui()/handler returned a Promise while isAsync == false
    case missingUISymbol            // no ui declaration after evaluation (spec §5.1 makes ui required)
}
```

- [ ] **Step 1: Write the failing tests**

`Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift`:

- `testSyncCounterMountAndDispatch` — script:

```js
const initialState = { count: 0 };
function ui(state, input) {
  return h('stack', { direction: 'vertical' }, [
    h('text', { id: 'count', content: 'Count: ' + state.count }),
    h('button', { title: '+1', handler: 'increment' })
  ]);
}
const handlers = {
  increment(state, event, input) { return { ...state, count: (state.count || 0) + 1 }; }
};
```

  Mount → tree contains text "Count: 0" and the increment button. Dispatch `.tap` handler "increment" → returned state `count == 1`, tree text "Count: 1". Dispatch again → `count == 2`.
- `testTextFieldSubmitAndChangeDispatch` — handlers reading `event.value`/`event.type`; assert a `.submit` event carries `value` and the state key is written back; a `.change` event for a toggle flips state. (`event.type` exercises the serialization that maps `CanvasEvent.kind` → JS key `"type"`.)
- `testEffectCollectionDuringDispatch` — handler calls `openclip.paste('x'); openclip.copy('y'); return state;` → dispatch returns `effects == [.paste("x"), .copy("y")]`.
- `testKeepVisibleUnwrapsToInnerLeaf` — handler calls `openclip.paste('z'); openclip.keepVisible(); return state;` → effects == `[.paste("z")]` (unwrapped; canvas effects never dismiss).
- `testUnknownHandlerRerendersWithUnchangedState` — dispatch `{ handler: 'nope' }` → state unchanged, tree re-rendered via `ui(state)` (deterministic, no error).
- `testMountTreeLimitRejected` — `ui` returns a stack with `CanvasLimits.maxNodes + 1` texts → mount throws `CanvasParseError.tooManyNodes` (rejection, never truncated).
- `testNonObjectUIReturnRejected` — `ui` returns `42` → mount throws (structural violation; the message is `CanvasParseError.nonObjectRoot`, NOT a JS runtime exception).
- `testMissingUIDeclarationRejected` — script declares only `const initialState`/`handlers`, no `ui` → mount throws `CanvasJSRuntimeError.missingUISymbol` (a defined mount error — never a `nonObjectRoot` crash).
- `testWatchdogTimeoutOnMount` — `ui` returns a **never-settling Promise** (`ui = function() { return new Promise(function() {}); }`) with the request marked `isAsync: true` → mount throws the timeout error. Use the test-only `timeout` override on the engine (mirror `OpenClipJSHost.Request.timeout`) — small, e.g. 2 s. **Do NOT use a sync `while(true)` busy loop here**: it blocks the JS thread, the gate/CFRunLoop pump can never run, and the suite hangs.
- `testSyncCapRespected` — 2 engines whose scripts enter with a counter-increment and loop a **bounded busy loop** (the sync cap counts **sync** evaluations, so the busy loop is correct for THIS test) — assert only `Constants.maxConcurrentSyncScriptEvaluations` run concurrently (shared bridge counter that increments on entry / decrements on exit, and never exceeds the cap), and each engine **exits cleanly**. Run both engines with the test-only `timeout` override small enough that even a stuck loop times out; this test must not drift into a hang. (The `CFRunLoop` promise pump is only for async — never rely on it to unstick a sync loop.)
- `testWatchdogSyncLoopStillExitsEventually` — a **short** sync busy loop (`while (false) {}` plus a finite self-limiting counter) under the test `timeout` override completes/errors without hanging (asserts the sync path's watchdog returns, not just the async pump's).
- `testAsyncUIRejected` — script declares `ui` that returns a Promise and `isAsync: false` → mount throws `CanvasJSRuntimeError.asyncNotSupported` (a Promise-returning `ui` is unsupported in v1 synchronous mode; never silently render nothing).
- `testGateSlotReleaseAfterWatchdogFire` — run N sequential scripts that each fire the watchdog (never-settling Promise, `isAsync: true`, test `timeout` override); assert every subsequent evaluation still acquires the gate (no leaked slots; the `defer` release ran on the throw path).
- `testDispatchContextReinstallsHelpers` — dispatch on a session whose script uses `h()` + `openclip.paste` in its handler; assert the dispatch context's script has `h` and the bridge present (i.e. `setupContext` ran for the dispatch-table context, not just mount).
- `testAsyncCanvasSettlesPromise` — `isAsync: true`, `ui` returns a promise resolved after `openclip.fetch` (use the fetch polyfill) or a `setTimeout`-free microtask; assert the mount result tree arrives and the watchdog doesn't fire.

- [ ] **Step 2: Implement the engine — mount**

Key mechanics (port the `OpenClipJSHost` patterns; **never `Self.<static>` inside `Task.detached`** — reference `OpenClipJSHost.xxx`/the engine type by name). Everything below runs **inside the watchdog gate** (see the sync-gate note at the end of Step 3).

```swift
public func mount(_ request: CanvasMountRequest) async throws -> CanvasMountResult {
    // Serialized by the controller; still guard with a per-engine actor/queue for safety.
    // Watchdog + shared sync cap: acquire the gate, then run the JS work off the main actor.
    // 1. Create a JSVirtualMachine + JSContext (on the JS thread — a Task.detached).
    // 2. setupContext(ctx, input: request.input, optionValues: request.optionValues, collector: ...)
    //      — installs h() + the openclip bridge + injected vars into THIS fresh context.
    // 3. Compile the wrapped source ONCE, INSIDE the same watchdog-bounded gate as evaluation:
    //      JSScript(source: canvasWrappedSource(request.scriptCode), virtualMachine: vm)
    // 4. Evaluate the compiled script (watchdog-bounded); check jsContext.exception → throw.
    // 5. Read the published __canvas_ui / __canvas_handlers / __canvas_initialState keys off the
    //    global object (the wrapper publishes them — see canvasWrappedSource below).
    //    M7: if __canvas_ui is absent (the wrapper's `typeof ui !== 'undefined'` publish yielded
    //    undefined — author never declared ui), throw CanvasJSRuntimeError.missingUISymbol — a
    //    DEFINED mount error, never a nonObjectRoot crash. __canvas_handlers may be absent
    //    (handlers are optional); __canvas_ui is REQUIRED (spec §5.1).
    // 6. call ui(state, input) with state = script initialState ?? request.initialState
    // 7. Convert the JSValue tree → CanvasElementSpec → CanvasElementParser.parseTree (throws → rejection).
    // 8. Return CanvasMountResult(state: effectiveInitialState, tree).
}
```

`setupContext` is the single place that **installs `h()` and the bridge into a fresh `JSContext`** — it must be called by BOTH mount and every dispatch, because a fresh context (even sharing the VM + compiled script) inherits none of the previous context's globals:

```swift
private func setupContext(_ ctx: JSContext, input: String, optionValues: [String: JSONValue], collector: CanvasBridgeCollector) {
    CanvasScriptBox.installH(in: ctx)
    CanvasScriptBox.installCanvasBridge(in: ctx, collector: collector, input: input, optionValues: optionValues)
    // (any other injected vars for this input)
}
```

Mount passes `request.optionValues`; dispatch re-passes the values stored on the session (the session carries the mount's `optionValues` — sister task). The gate acquire/release lives outside `setupContext` (see the sync-cap note in Step 3) so every evaluation is bounded, including compilation.

`canvasWrappedSource` wraps the user's script in an IIFE that preserves the script's `const`/`let` scoping (mirror `syncWrappedScript`/`asyncWrappedScript` from `OpenClipJSHost`). **A `const`/`let` inside an IIFE never attaches to `globalThis`**, so the wrapper must explicitly publish the author surface for Swift to read after evaluation (bare `const ui` inside the IIFE is invisible to `objectForKeyedSubscript`):

```js
(function () {
  // user script body — declares const initialState / function ui / const handlers
  <user code>

  globalThis.__canvas_ui = typeof ui !== 'undefined' ? ui : undefined;
  globalThis.__canvas_initialState = typeof initialState !== 'undefined' ? initialState : undefined;
  globalThis.__canvas_handlers = typeof handlers !== 'undefined' ? handlers : undefined;
})();
```

The engine reads these keys only: `ctx.objectForKeyedSubscript("__canvas_ui")`, `"__canvas_handlers"`, `"__canvas_initialState"` — never the un-published author names (`ui`/`handlers`/`initialState` are `undefined` on the global object). The engine also injects the `__openclip_state`/`__openclip_event`/`__openclip_input`/`__openclip_options` globals it uses to call `ui(state, input)` and `handlers[name](state, event, input)`.

**State injection rule (spec §4.2 + §5.1):** mount passes the **script's `initialState` constant when declared**, else `request.initialState`, as `state`; the mount result's `state` is that value (session state starts there). Dispatches pass `request.state` (app-owned session state, JSON-injected) and write the handler's return back. This keeps §4.2's "state is app-owned" invariant while matching the §5.1 mount example literally. *(Flag: if the golden tests later demand `request.initialState` on mount instead, flip Step 6's precedence — a one-line change here.)*

- [ ] **Step 3: Implement the engine — dispatch**

```swift
public func dispatch(_ request: CanvasDispatchRequest) async throws -> CanvasDispatchResult {
    // 1. Fresh JSContext in the SAME VM (the compiled JSScript is reused — no per-event re-parse).
// 2. setupContext(ctx, input: sessionInput, optionValues: sessionOptionValues, collector: ...)
//    — REINSTALL h() + the bridge in this fresh context (required: a fresh JSContext has no
//    h()/openclip globals, even though the compiled script is shared).
    // 3. Build the JS event payload: dict["type"] = .string(event.kind.rawValue) (key "type", not
    //    "kind"), plus handler/value?/targetID? — see §4.1a of the spec.
    // 4. Evaluate the SAME compiled JSScript; check jsContext.exception after each call → throw.
    // 5. Call handlers[request.event.handler]?.call([state, event, input]) — unknown handler → nil.
    // 6. If the handler returned a state object, that is newState (JSON round-trip; toggle/textField
    //    values already-flipped are written by the caller-side value model, see §4.2).
    // 7. call ui(newState, input) → tree JSValue.
    // 8. Convert + parse (throws → dispatch error → session collapses with error banner, §11).
    // 9. Collect leaf effects; unwrap keepVisible() wrappers to the inner leaf (spec §5.1/§7).
    // 10. Return CanvasDispatchResult(state: newState, tree, effects).
}
```

- `JSVirtualMachine` serializes access across threads, and the controller already serializes calls (Task 11), so fresh-context-per-event on a `Task.detached` thread is safe; keep a per-engine `DispatchQueue`/continuation guard for defense-in-depth (the controller chain alone is the primary guarantee).
- **Watchdog:** reuse `TimeoutFlag` + `Constants.scriptTimeout` (with a test-only `timeout` override). For `isAsync`, reuse the `OpenClipJSHost` promise pump (`CFRunLoopPerformBlock` + `CFRunLoopRunInMode` loop until settled). The pump applies **only to async** — a sync evaluation is run to completion under the `TimeoutFlag` and never spins a run loop.
- **Sync cap:** make `OpenClipJSHost.syncEvaluationGate` internal (drop `private`) so the engine shares it, OR extract a shared `ScriptEvaluationGates` — pick one and keep it single-sourced. The engine acquires the gate around every evaluation (mount + dispatch). **Release in a `defer` Free/Release block** that runs on EVERY exit path, including the watchdog-timeout throw — a watchdog fire must never leak the acquired slot. (Leak regression: run N sequential bad/timeout scripts; the gate must still grant evaluations afterward.)
- **Gate = compilation too (spec §5.4):** the `JSScript(source:vm:)` compile happens **inside the same watchdog gate as evaluation** — compile AND evaluate go through one bounded guard, so a hostile script can't hold the thread in an unbounded compile.
- **`jsContext.exception` after every call:** after each `evaluateScript`/`call(withArguments:)` — including the handler call and the `ui()` call — do `if let exc = jsContext.exception { throw CanvasJSRuntimeError.scriptException(exc.toString()) }`. A JS throw during `ui()`/a handler surfaces as a **runtime error**, never as the structural `CanvasParseError.nonObjectRoot` (that stays reserved for a non-object `ui()` *return value*). Mount and dispatch both apply this check.
- **Async `ui` rejected when not `isAsync`:** if `ui()`/a handler returns a Promise (detect a `.then` on the return value) while `request.isAsync == false`, throw `CanvasJSRuntimeError.asyncNotSupported` — v1 renders no async tree; never silently render nothing.

- [ ] **Step 4: Delete `UnavailableCanvasEngine`**

`Sources/OpenClip/UI/Popup/UnavailableCanvasEngine.swift` — delete; in `PopupWindowController.mountCanvas`, use `JavaScriptCanvasEngine()` instead of the stub.

- [ ] **Step 5: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh JavaScriptCanvasEngineTests`, then the quick build gate.
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
xcodegen generate
git add -A Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift Sources/OpenClip/Actions/OpenClipJSHost.swift Sources/OpenClip/UI/Popup Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift
git commit -m "feat(js): JavaScriptCanvasEngine with compile-once JSScript, fresh-context mount/dispatch, watchdog"
```

---

### Task 24: Canvas openclip.showContent(elementTree, {size}) + keepVisible unwrap + effect collection

**Files:**
- Edit: `Sources/OpenClip/Actions/CanvasScriptBox.swift` (add the canvas bridge: `installCanvasBridge(in:collector:input:optionValues:)`)
- Edit: `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift` (use the bridge)
- Edit: `Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift` (extend)

**Interfaces:**
- Consumes: `CanvasScriptBox`, `CanvasEffect`, `CanvasSize`, `CanvasElementParser`.
- Produces: the canvas bridge exposes `openclip.input`, `openclip.options`, `openclip.paste/copy/cut/openURL/keyPress/runShortcut/notify` (collect `CanvasEffect`s), `openclip.showContent(tree, {size?})` (captures the mount `preferredSize`), `openclip.keepVisible()` (marks the wrap; the collector unwraps it to the inner leaf), `openclip.showStatus(...)` (collected as a status the controller surfaces after collapse — in-session status never renders inside a canvas, §7).

- [ ] **Step 1: Add the canvas bridge to `CanvasScriptBox`**

```swift
extension CanvasScriptBox {
    /// Installs the canvas author surface on a context: the input/options objects, the leaf-effect
    /// collectors, showContent(tree, {size}), and keepVisible. Collectors append to `effects`; the
    /// preferred-size and keepVisible flags land on the collector box.
    static func installCanvasBridge(in context: JSContext,
                                    collector: CanvasBridgeCollector,
                                    input: String,
                                    optionValues: [String: JSONValue])
}
```

- The `options` object (`openclip.options`) is built **from `optionValues`** — the engine passes `request.optionValues` (a sibling 01-core change adds `optionValues: [String: JSONValue]` to `CanvasMountRequest`; populated by `JavaScriptCanvasAction.perform` — see Task 25). If `optionValues` is empty, `openclip.options` is `{}` (never `undefined`).

Define `CanvasBridgeCollector` in `CanvasScriptBox.swift`:

```swift
/// Mutable box shared with the JS blocks (each canvas evaluation owns one). `@unchecked Sendable`
/// because it is confined to the JS thread and only read back after the evaluation returns.
final class CanvasBridgeCollector: @unchecked Sendable {
    var effects: [CanvasEffect] = []
    var preferredSize: CanvasSize? = nil
    var keepVisible: Bool = false
    var status: StatusFeedback? = nil
}
```

- `showContent` block signature: `@convention(block) (JSValue, JSValue?) -> Void` — first arg the element tree, second the optional `{ size?: { width, height } }`; converts via `CanvasScriptBox.elementSpec(from:)` + `CanvasElementParser.parseTree`, storing the tree and the clamped `preferredSize`. A rejected tree (structural violation) sets a collector error flag that the engine turns into a mount/dispatch rejection.
- `keepVisible` block sets `collector.keepVisible = true`; the engine's effect-resolution **unwraps** any collected effect when `keepVisible` was called (no-op wrapper — in-session effects never dismiss anyway).

- [ ] **Step 2: Wire the engine**

`JavaScriptCanvasEngine` mount/dispatch use `CanvasScriptBox.installCanvasBridge(in:collector:input:optionValues:)` instead of ad-hoc blocks. The engine maps collected `CanvasEffect`s 1:1 into the **dispatch** result's `effects` — mount never carries effects (its `CanvasMountResult` has no `effects`; the collector's `effects` array is read back only on the dispatch path). A `status` collected mid-dispatch is returned to the controller (which queues it for the bar banner after collapse). The mount `preferredSize` from `showContent` is clamped into `CanvasLimits`/`Constants.popupMaxHeight` (the controller's `armCanvas`/`mountCanvas` path — see Task 14/17) and fixed for the session.

- [ ] **Step 3: Extend the engine tests**

- `testShowContentProvidesPreferredSize` — mount script calls `openclip.showContent(h('text', {content:'x'}), { size: { width: 340, height: 220 } })` inside a handler that returns a tree via `return ui(state, input)`; assert the mount result's tree is the `h('text')` tree and `preferredSize == CanvasSize(width: 340, height: 220)`.
- `testShowContentWithoutSize` — no second arg → `preferredSize == nil`.
- `testStatusDuringDispatchSurfacesAfterCollapse` — handler calls `openclip.showStatus('Done', 'info')`; dispatch result carries the status; (integration: assert the window controller queues it and flushes on collapse — see Task 16).
- `testKeepVisibleUnwraps` — already in Task 23; keep the canonical assertion here alongside the effect collection.

- [ ] **Step 4: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh JavaScriptCanvasEngineTests`, then the quick build gate.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add -A Sources/OpenClip/Actions/CanvasScriptBox.swift Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift
git commit -m "feat(js): canvas openclip bridge with showContent(tree,{size}) + keepVisible unwrap"
```

---

### Task 25: Manifest "canvas" kind + validator + factory + JavaScriptCanvasAction

**Files:**
- Edit: `Sources/Core/Extensions/Manifest/ExtensionActionKind.swift`
- Edit: `Sources/Core/Extensions/Manifest/ManifestValidation.swift`
- Edit: `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift`
- Edit: `Sources/Core/Actions/ActionResultAdapter.swift` (add `.showCanvas` to the passthrough list)
- Create: `Sources/OpenClip/Actions/JavaScriptCanvasAction.swift`
- Edit: `Tests/OpenClipTests/ManifestValidationTests.swift`, `Tests/OpenClipTests/ExtensionManifestTests.swift`, `Tests/OpenClipTests/NewExtensionKindTests.swift`

**Interfaces:**
- Consumes: `CanvasMountRequest`, `CanvasHeader`, `CanvasScripting` (Core), `ActionVisibility` (Core). **Sibling 01-core change:** `CanvasMountRequest` gains `optionValues: [String: JSONValue]` (default `[:]`), populated here by `perform` and consumed by the engine's bridge as `openclip.options` (Task 24). Produces: `ExtensionActionKind.canvas`; `JavaScriptCanvasAction` whose `perform` returns `.showCanvas(CanvasMountRequest(...), CanvasHeader(title:icon:))`.

- [ ] **Step 1: Add the kind**

`ExtensionActionKind.swift`: add `case canvas`; `recognizedTypeStrings` += `"canvas"`; `init(rawType:)` map `"canvas"` → `.canvas`. Update the file doc comment.

- [ ] **Step 2: Validate**

`ManifestValidation.swift`: in the per-kind switch (near the `keyPress` case at line 139), add:

```swift
        case .canvas:
            if isBlank(action.scriptCode) {
                issues.append(ManifestValidationIssue(kind: .missingRequiredField("scriptCode"), path: path))
            }
```

No `output`/`output: "canvas"` field is introduced (§10) — nothing to validate there.

- [ ] **Step 3: Factory branch**

`DefaultActionFactory.swift` `makeAction`, in the `scriptCode` branch (line 238–275), add before `case "js", "javascript":`:

```swift
            case "canvas":
                return JavaScriptCanvasAction(
                    id: actionId,
                    title: title,
                    icon: icon,
                    scriptCode: scriptCode,
                    options: options,
                    chrome: extensionChrome,
                    optionStore: optionStore,
                    rules: rules,
                    isAsync: metadata.isAsync ?? false
                )
```

Also map a `.js` **file** whose manifest type is `canvas` (the `case "js":` file branch at line 292) — check the manifest type there too: if `metadata.type` is `canvas`, build a `JavaScriptCanvasAction` from the file's code instead of `JavaScriptAction`. A canvas manifest pointing at a `.sh`/other file falls through to the shell/script branches as today (shell never produces a canvas; that combination simply isn't a canvas).

- [ ] **Step 4: `JavaScriptCanvasAction`**

Create `Sources/OpenClip/Actions/JavaScriptCanvasAction.swift` (mirrors `JavaScriptAction` structure):

```swift
// JavaScriptCanvasAction.swift
// OpenClip
//
// A `type: "canvas"` extension action (spec §5.1). perform does NOT run the script — it returns a
// .showCanvas mount request; the engine (JavaScriptCanvasEngine) evaluates it, arms the session, and
// every interactive dispatch re-renders the tree. Chrome is the standard script badge.
import Foundation
import Core

@MainActor
public struct JavaScriptCanvasAction: ConfigurableAction {
    public let id: String
    public let title: String
    public let icon: ActionIcon
    public let preferenceIconName: String
    public let scriptCode: String
    public let actionOptions: [ExtensionOption]
    public let chrome: ActionChrome
    public let optionStore: any ActionOptionReading
    public let rules: ExtensionActionRules?
    public let isAsync: Bool

    // init mirrors JavaScriptAction's (id, title, icon, scriptCode, options, chrome, optionStore, rules, isAsync).

    public func perform(_ context: ActionContext) async throws -> ActionResult {
        // Phase 7 parity: a declaratively-required option with no resolved value short-circuits to
        // configuration BEFORE we build a mount request (same as JavaScriptAction.perform — the
        // manifest `requiredOptions` auto-check must not be duplicated in the engine).
        let missing = ActionVisibility.missingRequiredOptions(
            requirements: rules?.requirements,
            options: actionOptions,
            optionStore: optionStore,
            actionID: id
        )
        if !missing.isEmpty {
            return .openConfiguration(ConfigurationRequest(
                actionID: id,
                reason: missing.count == 1 ? "Required option not set." : "Required options not set.",
                missingOptionIDs: missing
            ))
        }

        // Resolve every option value for the session's JS surface (openclip.options).
        let optionValues = Dictionary(uniqueKeysWithValues: actionOptions.map {
            ($0.identifier, optionStore.stringValue(actionID: id, option: $0).map { JSONValue.string($0) } ?? .string(""))
        })

        let request = CanvasMountRequest(
            initialState: CanvasSessionState(),
            input: context.selection.text,
            preferredSize: nil,                       // declared at runtime via openclip.showContent(tree, {size})
            scriptCode: scriptCode,
            optionValues: optionValues,               // openclip.options in the bridge (empty → {})
            isAsync: isAsync
        )
        return .showCanvas(request, CanvasHeader(title: title, icon: preferenceIconName))
    }
}
```

- `ActionResultAdapter.apply` passthrough: add `.showCanvas` to the runtime-presentation passthrough case (line 27 list) so the `.showCanvas` result is never wrapped/translated.

- [ ] **Step 5: Update the manifest tests**

- `ManifestValidationTests.swift` — add: `type: "canvas"` without `scriptCode` → `missingRequiredField("scriptCode")`; with `scriptCode` → clean.
- `ExtensionManifestTests.swift` — `ExtensionActionKind(rawType: "canvas") == .canvas`; `isRecognized(rawType: "canvas")` true.
- `NewExtensionKindTests.swift` — factory: a `type: "canvas"` metadata with inline `scriptCode` yields a `JavaScriptCanvasAction` with the right id/title/icon/scriptCode/isAsync; `perform` returns `.showCanvas(request, header)` with `request.scriptCode == scriptCode` and `header.title == title`. Add a missing-required-options case: a manifest declaring `requiredOptions` that are unset → `perform` returns `.openConfiguration(...)` (never `.showCanvas`), mirroring `JavaScriptAction.perform`.

- [ ] **Step 6: Run tests + build gate**

Run: `timeout -k 10 60 ./scripts/test.sh ManifestValidationTests`, `ExtensionManifestTests`, `NewExtensionKindTests`, then the quick build gate.

- [ ] **Step 7: Commit**

```bash
xcodegen generate
git add -A Sources/Core/Extensions/Manifest Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift Sources/Core/Actions/ActionResultAdapter.swift Sources/OpenClip/Actions/JavaScriptCanvasAction.swift Tests/OpenClipTests
git commit -m "feat(extensions): manifest type canvas + JavaScriptCanvasAction + validator/factory wiring"
```

---

### Task 26: Canvas end-to-end tests + shell non-canvas

**Files:**
- Create: `Tests/OpenClipTests/CanvasEndToEndTests.swift`
- Edit: `Tests/OpenClipTests/GoldenExtensionPlatformTests.swift` (canvas golden, if not already covered)
- Edit: `Tests/OpenClipTests/ScriptActionExecutionTests.swift` (shell non-canvas assertions)

**Interfaces:**
- Consumes: everything from Tasks 17–25; `TestIsolation.reset()`, `MemorySettingsStore`/temp extensions directory patterns.

- [ ] **Step 1: Write `CanvasEndToEndTests.swift`**

Fixtures: a temp extensions dir with a `manifest.json` declaring a `type: "canvas"` action whose inline `scriptCode` is the counter canvas (Task 23's script). Use `ActionCoordinator`'s real constructor + `loadInitialState(extensionsDirectory:rulesURL:)` (per AGENTS rule 7 — never the real `~/.openclip`).

- `testCanvasExtensionMountsThroughCoordinatorAndPanel` — load the fixture, resolve the action for a context, `perform` → `.showCanvas(request, header)`; arm it through a real `PopupWindowController` (`handleActionResult(.showCanvas(request, header))`); pump; assert `modeStore.mode == .content`, the armed session tree contains "Count: 0", panel key.
- `testButtonDispatchReRendersPanel` — dispatch `.tap` "increment" via the session controller; pump; assert the tree text reads "Count: 1" and the panel stays `.content` (effects never dismiss).
- `testEscCollapsesCanvasAction` — Esc via `handleEvent`; assert `.actions`, session cleared.
- `testNewMountReplacesCanvasSession` — perform the same action again; assert the session is replaced (fresh count).
- `testCanvasActionInSearchCatalog` — the action appears in the search catalog and (being a normal `.perform` row) never lands in the popup bar's AI section; no special-case needed — assert it resolves and runs.
- `testHoverPreviewIsNonKeyedTextSnapshot` — hovering the canvas action (via the controller's `updateHoveredAction` path) sets `modeStore.preview` to a `CanvasComponent.text`, never a session and never entering key mode (assert `panel.allowsKey == false` in actions mode with a preview up).

- [ ] **Step 2: Shell non-canvas assertions**

- `ScriptActionExecutionTests.swift:112` — the shell script emitting `{"type":"showContent",...}` now maps to `.success` (assert `case .success`); add a sibling assertion that plain-text stdout still maps to paste/copy unchanged.
- Add: a manifest with `type: "canvas"` + a `.sh` script file does **not** become a canvas action (falls through to a shell `ScriptAction`/`CustomAction` — shell never produces a canvas in v1, §10) — assert via the factory/coordinator that the loaded action is not a `JavaScriptCanvasAction`.

- [ ] **Step 3: Golden test**

Extend `GoldenExtensionPlatformTests` with the interactive golden: the counter canvas script evaluates → `.showCanvas` → mount → dispatch → re-render, asserting the compiled `JSScript` is reused (behavior parity across ≥3 dispatches — the observable contract of compile-once).

- [ ] **Step 4: Run the full suite once**

```bash
timeout -k 10 60 ./scripts/test.sh
```

Then the quick build gate. Fix stragglers until green.

- [ ] **Step 5: Commit**

```bash
xcodegen generate
git add -A Tests/OpenClipTests
git commit -m "test(canvas): end-to-end canvas extension + shell non-canvas coverage"
```

**Done with the JS engine + manifest.** Next: `06-docs.md` (Task 27).
