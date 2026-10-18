# Canvas fetch() via a Shared Network Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `"async": true` canvas actions a `openclip.fetch()` polyfill in handlers, sharing the JS action runtime's URLSession bridge.

**Architecture:** Extract the URLSession fetch glue out of `OpenClipJSHost` into a small shared `JSNativeFetch` helper, then install it from `JavaScriptCanvasEngine.executeDispatch` when the canvas session is async. The dispatch path already pumps handler promises to completion, so fetch-in-handlers needs no new UI or pump code. `ui()`/mount stay synchronous.

**Tech Stack:** Swift 6 (strict concurrency), JavaScriptCore (`JSContext`), Foundation `URLSession`, XCTest with `MockURLProtocol`.

## Global Constraints

- Swift 6 with `SWIFT_STRICT_CONCURRENCY: complete`. Never capture a raw `JSContext`/`JSValue`/`CFRunLoop` in a `@Sendable` closure — use the existing boxes (`JSContextBox`, `JSValueBox`, `RunLoopBox`) exactly as `OpenClipJSHost` does.
- **Core stays untouched.** Every change is in `Sources/OpenClip/` or `Tests/OpenClipTests/`.
- New `.swift` file → the Xcode project must be regenerated (`xcodegen generate`; the scripts re-run it automatically).
- Tests must never hit real networking — always an ephemeral `URLSession` with `protocolClasses = [MockURLProtocol.self]`.
- Reuse `Log.js`; add no log categories, call no `print()`.
- Preserve the 30 s watchdog (`Constants.scriptTimeout`) and the `OpenClipJSHost.syncEvaluationGate` semantics — do not weaken them.
- Response contract must stay byte-identical to JS actions: `{ status, ok, text(): Promise<string>, json(): Promise<any> }`; network errors reject.
- In `Task.detached` closures, reference static members by their explicit type name (e.g. `JSNativeFetch.fetchResponse`, never `Self.fetchResponse`) — a documented Swift 6 region-based-isolation landmine.

## File Structure

- **Create:** `Sources/OpenClip/Actions/JSNativeFetch.swift` — the shared network bridge (nativeFetch block + polyfill + request/response builders). One responsibility: fetch bridging for both hosts.
- **Modify:** `Sources/OpenClip/Actions/OpenClipJSHost.swift` — delegate its native-fetch part to `JSNativeFetch`; delete the moved functions. Keeps promise settlement (`__resolve`/`__reject`).
- **Modify:** `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift` — add an injectable `URLSession` and install fetch in `executeDispatch` when `isAsync`.
- **Test:** `Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift` — add the 4 fetch tests.
- **Docs:** `docs/developer-guide/AGENTS.md` §7a, `docs/runtimes/javascript.md`, `docs/architecture/known-debt.md`.

`OpenClipJSHostSupport.swift` is unchanged — `FetchTaskBox`, `JSContextBox`, `JSValueBox`, `RunLoopBox`, `TimeoutFlag` already live there and are shared.

---

## Task 1: Extract `JSNativeFetch` and refactor `OpenClipJSHost`

**Files:**
- Create: `Sources/OpenClip/Actions/JSNativeFetch.swift`
- Modify: `Sources/OpenClip/Actions/OpenClipJSHost.swift` (the `registerAsyncBridge` body at ~`:319`; the bridge-setup section at ~`:255-269`; delete `makeURLRequest` `:379`, `fetchResponse` `:412`, `jsError` `:440`, `fetchPolyfillScript` `:500`)
- Test: `Tests/OpenClipTests/OpenClipJSHostTests.swift` (existing — regression net only, no edits)

**Interfaces:**
- Produces: `JSNativeFetch.installNativeFetch(in context: JSContext, session: URLSession, fetchTasks: FetchTaskBox)` — installs `openclip.__nativeFetch` and evaluates the `openclip.fetch` polyfill. Requires the context to already expose a global `openclip` object. Also: `JSNativeFetch.makeURLRequest(url:options:) -> URLRequest`, `JSNativeFetch.fetchResponse(status:body:context:) -> JSValue?`, `JSNativeFetch.jsError(_:in:) -> JSValue?`, `JSNativeFetch.fetchPolyfillScript: String`.

- [ ] **Step 1: Create `JSNativeFetch.swift`**

Move the network code verbatim from `OpenClipJSHost` (keep semantics identical; only `Self.` becomes `JSNativeFetch.`):

```swift
// JSNativeFetch.swift
// OpenClip
//
// Shared URLSession-backed fetch bridge for both JavaScript runtimes. Installs
// `openclip.__nativeFetch` (a URLSession dataTask) and the `openclip.fetch`
// polyfill into any JSContext that already exposes a global `openclip` object.
// OpenClipJSHost (async JS actions) and JavaScriptCanvasEngine (async canvas
// dispatches) both call installNativeFetch after installing their own bridge;
// tests route through an injected URLSession with MockURLProtocol.
import Foundation
import JavaScriptCore
import Core

enum JSNativeFetch {
    /// Installs `openclip.__nativeFetch` + the `openclip.fetch` polyfill. The
    /// context must already have a global `openclip` object (both hosts set it
    /// before calling). All JS VM access stays on the thread that created the
    /// context: the URLSession completion only schedules work back onto that
    /// thread's CFRunLoop; the host's pump loop drains it.
    static func installNativeFetch(in context: JSContext, session: URLSession, fetchTasks: FetchTaskBox) {
        guard let openclip = context.objectForKeyedSubscript("openclip" as NSString),
              !openclip.isUndefined, !openclip.isNull, openclip.isObject else { return }

        let contextBox = JSContextBox(context)
        // runLoopBox keeps CFRunLoopGetCurrent() out of the block's @Sendable
        // capture region (region-based isolation checker).
        let runLoopBox = RunLoopBox(CFRunLoopGetCurrent())

        let nativeFetchBlock: @convention(block) (String, JSValue, JSValue, JSValue) -> Void = { urlString, options, resolve, reject in
            guard let url = URL(string: urlString) else {
                guard let err = JSNativeFetch.jsError("Invalid URL: \(urlString)", in: context) else { return }
                reject.call(withArguments: [err])
                return
            }
            let request = JSNativeFetch.makeURLRequest(url: url, options: options)
            let resolveBox = JSValueBox(resolve)
            let rejectBox = JSValueBox(reject)
            var task: URLSessionDataTask?
            task = session.dataTask(with: request) { data, response, error in
                if let task {
                    fetchTasks.remove(task)
                }
                let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                let status = (response as? HTTPURLResponse)?.statusCode ?? 0
                let errorMessage = error.map { "Fetch failed: \($0.localizedDescription)" }
                CFRunLoopPerformBlock(runLoopBox.runLoop, CFRunLoopMode.defaultMode.rawValue) {
                    if let errorMessage {
                        if let err = JSNativeFetch.jsError(errorMessage, in: contextBox.context) {
                            rejectBox.value.call(withArguments: [err])
                        }
                    } else if let resp = JSNativeFetch.fetchResponse(status: status, body: body, context: contextBox.context) {
                        resolveBox.value.call(withArguments: [resp])
                    }
                }
                CFRunLoopWakeUp(runLoopBox.runLoop)
            }
            if let task {
                fetchTasks.add(task)
                task.resume()
            }
        }
        openclip.setObject(nativeFetchBlock, forKeyedSubscript: "__nativeFetch" as NSString)
        context.evaluateScript(fetchPolyfillScript)
    }

    /// Builds a URLRequest from `fetch(url, options)`: method (default GET),
    /// optional headers object, and an optional string body.
    static func makeURLRequest(url: URL, options: JSValue) -> URLRequest {
        var request = URLRequest(url: url)
        request.timeoutInterval = Constants.scriptTimeout

        let methodValue = options.objectForKeyedSubscript("method")
        if let methodValue, !methodValue.isUndefined, !methodValue.isNull {
            if let method = methodValue.toString(), !method.isEmpty {
                request.httpMethod = method.uppercased()
            }
        } else {
            request.httpMethod = "GET"
        }

        if let headersValue = options.objectForKeyedSubscript("headers"),
           headersValue.isObject,
           let headers = headersValue.toDictionary() {
            for (key, value) in headers {
                if let name = key as? String, let headerValue = value as? String {
                    request.setValue(headerValue, forHTTPHeaderField: name)
                }
            }
        }

        if let bodyValue = options.objectForKeyedSubscript("body"),
           !bodyValue.isUndefined, !bodyValue.isNull,
           let body = bodyValue.toString(), !body.isEmpty {
            request.httpBody = body.data(using: .utf8)
        }
        return request
    }

    /// Builds the JS response object: `{ status, ok, text(), json() }`.
    static func fetchResponse(status: Int, body: String, context: JSContext) -> JSValue? {
        guard let response = JSValue(newObjectIn: context) else { return nil }
        response.setObject(status, forKeyedSubscript: "status")
        response.setObject(status >= 200 && status < 300, forKeyedSubscript: "ok")

        let textBlock: @convention(block) () -> String = { body }
        response.setObject(textBlock, forKeyedSubscript: "text")

        // The json block escapes into JS, so it captures the context through a
        // Sendable box rather than the raw non-Sendable JSContext.
        let contextBox = JSContextBox(context)
        let jsonBlock: @convention(block) () -> Any = {
            if let data = body.data(using: .utf8),
               let object = try? JSONSerialization.jsonObject(with: data) {
                return object
            }
            Log.js.debug("response.json() received non-JSON body")
            if let err = JSNativeFetch.jsError("Invalid JSON response", in: contextBox.context) {
                contextBox.context.exception = err
            }
            return NSNull()
        }
        response.setObject(jsonBlock, forKeyedSubscript: "json")
        return response
    }

    /// Creates a JS `Error` value (falls back to a plain object if the Error
    /// constructor is gone).
    static func jsError(_ message: String, in context: JSContext) -> JSValue? {
        if let errorConstructor = context.objectForKeyedSubscript("Error"),
           !errorConstructor.isUndefined, !errorConstructor.isNull {
            return errorConstructor.call(withArguments: [message])
        }
        return JSValue(object: ["message": message], in: context)
    }

    static let fetchPolyfillScript = """
    openclip.fetch = function(url, options) {
        return new Promise(function(resolve, reject) {
            openclip.__nativeFetch(String(url), options || {}, resolve, reject);
        });
    };
    """
}
```

- [ ] **Step 2: Regenerate the project so the new file compiles**

Run: `xcodegen generate`
Expected: generates `OpenClip.xcodeproj` including `JSNativeFetch.swift`.

- [ ] **Step 3: Refactor `OpenClipJSHost` to delegate**

Edit `Sources/OpenClip/Actions/OpenClipJSHost.swift`:

1. **Reorder the bridge setup in `evaluate` (~lines 255-269)** so the global `openclip` is installed *before* the async bridge (the shared helper and the polyfill both resolve `openclip` from the context):

```swift
        jsContext.setObject(openclip, forKeyedSubscript: "openclip" as NSString)
        jsContext.evaluateScript("openclip.option = function(id) { return openclip.options[id]; }")
        if request.isAsync, let promiseState {
            registerAsyncBridge(
                openclip: openclip,
                context: jsContext,
                promiseState: promiseState,
                session: session,
                fetchTasks: fetchTasks
            )
        }
```

(Delete the now-redundant `if request.isAsync { jsContext.evaluateScript(fetchPolyfillScript) }` — the polyfill is evaluated inside `JSNativeFetch.installNativeFetch`.)

2. **Replace the `registerAsyncBridge` body** — keep the promise settlement blocks, drop the inline `nativeFetchBlock`, delegate to the helper. Do **not** capture `session`/`fetchTasks` in the block anymore:

```swift
    private static func registerAsyncBridge(
        openclip: JSValue,
        context: JSContext,
        promiseState: PromiseState,
        session: URLSession,
        fetchTasks: FetchTaskBox
    ) {
        let resolveBlock: @convention(block) (JSValue) -> Void = { value in
            promiseState.resolve(value)
        }
        let rejectBlock: @convention(block) (JSValue) -> Void = { error in
            promiseState.reject(error)
        }
        openclip.setObject(resolveBlock, forKeyedSubscript: "__resolve" as NSString)
        openclip.setObject(rejectBlock, forKeyedSubscript: "__reject" as NSString)

        JSNativeFetch.installNativeFetch(in: context, session: session, fetchTasks: fetchTasks)
    }
```

3. **Delete** `makeURLRequest`, `fetchResponse`, `jsError`, and `fetchPolyfillScript` from `OpenClipJSHost.swift` (all their call sites moved to the helper; `Self.jsError` was only referenced by the removed blocks).

- [ ] **Step 4: Run the JS host test suite to confirm the refactor is behavior-preserving**

Run: `./scripts/test.sh OpenClipJSHostTests`
Expected: all pass (including `testFetchBasicGet`, `testFetchPostSendsJSONBodyAndParsesResponse`, `testFetchNetworkErrorRejectsPromise`, the async/sync mode tests).

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Actions/JSNativeFetch.swift Sources/OpenClip/Actions/OpenClipJSHost.swift OpenClip.xcodeproj
git commit -m "refactor(js): extract shared JSNativeFetch bridge from OpenClipJSHost"
```

---

## Task 2: Wire `fetch` into the canvas engine (session + dispatch install)

**Files:**
- Modify: `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift` (init ~`:35`; `executeDispatch` after `installCanvasBridge` ~`:276`)
- Test: `Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift` (append)

**Interfaces:**
- Consumes: `JSNativeFetch.installNativeFetch(in:session:fetchTasks:)` from Task 1; `FetchTaskBox` from `OpenClipJSHostSupport.swift`; `MockURLProtocol` + `LockedArray` from `OpenClipJSHostTests.swift`.
- Produces: `JavaScriptCanvasEngine.init(timeout: TimeInterval? = nil, session: URLSession = .shared)` — existing `timeout:` call sites keep compiling; `JavaScriptCanvasEngine.session: URLSession`; dispatch-installed `openclip.fetch` for async sessions.

- [ ] **Step 1: Write the failing tests**

Append to `Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift` (before the final `}`):

```swift
    // 24. Async handler fetch resolves into state and re-renders (MockURLProtocol session)
    func testHandlerFetchResolvesIntoStateAndRerenders() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, Data("{\"title\":\"Open AI Alpha\"}".utf8))
        }
        defer { MockURLProtocol.requestHandler = nil }

        let script = """
        const handlers = {
            load: async (state) => {
                const r = await openclip.fetch('https://api.example.com/items');
                const j = await r.json();
                return { ...state, title: j.title };
            }
        };
        const ui = (state) => h('text', { content: 'Title: ' + (state.title || 'none') });
        """
        let engine = JavaScriptCanvasEngine(session: mockedSession())
        let mountRes = try await engine.mount(CanvasMountRequest(input: "test", scriptCode: script, isAsync: true))

        let dispatchRes = try await engine.dispatch(CanvasDispatchRequest(
            event: CanvasEvent(kind: .tap, handler: "load"),
            state: mountRes.state
        ))
        XCTAssertEqual(dispatchRes.state.string("title"), "Open AI Alpha")
        guard case .text(let props) = dispatchRes.tree else {
            return XCTFail("Expected text root")
        }
        XCTAssertEqual(props.content, "Title: Open AI Alpha")
    }

    // 25. Async handler POST fetch captures method/headers/body
    func testHandlerFetchPOSTCapturesMethodHeadersAndBody() async throws {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 201, httpVersion: nil, headerFields: nil)!
            return (response, Data())
        }
        defer { MockURLProtocol.requestHandler = nil }

        let script = """
        const handlers = {
            submit: async (state, event, input) => {
                const r = await openclip.fetch('https://api.example.com/items', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q: input })
                });
                return { ...state, status: r.status };
            }
        };
        const ui = (state) => h('text', { content: 'Status: ' + (state.status || 'none') });
        """
        let engine = JavaScriptCanvasEngine(session: mockedSession())
        let mountRes = try await engine.mount(CanvasMountRequest(input: "hi", scriptCode: script, isAsync: true))

        let dispatchRes = try await engine.dispatch(CanvasDispatchRequest(
            event: CanvasEvent(kind: .tap, handler: "submit"),
            state: mountRes.state
        ))
        XCTAssertEqual(dispatchRes.state["status"]?.numberValue, 201)

        let requests = MockURLProtocol.capturedRequests.values
        XCTAssertEqual(requests.count, 1)
        XCTAssertEqual(requests[0].httpMethod, "POST")
        XCTAssertEqual(requests[0].value(forHTTPHeaderField: "Content-Type"), "application/json")
        // URLSession moves an httpBody onto httpBodyStream before a URLProtocol sees the request.
        let bodyData = requests[0].httpBody ?? readStreamBody(requests[0])
        XCTAssertEqual(bodyData.flatMap { String(data: $0, encoding: .utf8) }, "{\"q\":\"hi\"}")
    }

    // 26. Network error inside a handler fetch rejects the dispatch with a scriptException
    func testHandlerFetchNetworkErrorRejectsDispatch() async throws {
        MockURLProtocol.requestHandler = { _ in
            throw URLError(.notConnectedToInternet)
        }
        defer { MockURLProtocol.requestHandler = nil }

        let script = """
        const handlers = {
            load: async (state) => {
                await openclip.fetch('https://api.example.com/items');
                return { ...state, reached: true };
            }
        };
        const ui = () => h('button', { title: 'Go', handler: 'load' });
        """
        let engine = JavaScriptCanvasEngine(session: mockedSession())
        let mountRes = try await engine.mount(CanvasMountRequest(input: "test", scriptCode: script, isAsync: true))

        do {
            _ = try await engine.dispatch(CanvasDispatchRequest(
                event: CanvasEvent(kind: .tap, handler: "load"),
                state: mountRes.state
            ))
            XCTFail("Expected dispatch to throw on rejected fetch")
        } catch let error as CanvasJSRuntimeError {
            if case .scriptException(let msg) = error {
                XCTAssertTrue(msg.contains("Fetch failed"), "Expected rejection message, got \(msg)")
            } else {
                XCTFail("Expected scriptException, got \(error)")
            }
        }
    }

    // 27. A non-async canvas cannot call fetch (loud failure, matching JS actions)
    func testCanvasWithoutAsyncCannotFetch() async throws {
        let script = """
        const handlers = {
            bad: () => { openclip.fetch('https://example.com'); return {}; }
        };
        const ui = () => h('button', { title: 'Go', handler: 'bad' });
        """
        let engine = JavaScriptCanvasEngine() // isAsync false; fetch polyfill not installed
        let mountRes = try await engine.mount(CanvasMountRequest(input: "test", scriptCode: script))

        do {
            _ = try await engine.dispatch(CanvasDispatchRequest(
                event: CanvasEvent(kind: .tap, handler: "bad"),
                state: mountRes.state
            ))
            XCTFail("Expected dispatch to throw when openclip.fetch is unavailable")
        } catch let error as CanvasJSRuntimeError {
            if case .scriptException(let msg) = error {
                XCTAssertTrue(msg.contains("openclip.fetch"), "Expected ReferenceError, got \(msg)")
            } else {
                XCTFail("Expected scriptException, got \(error)")
            }
        }
    }

    private func mockedSession() -> URLSession {
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        return URLSession(configuration: config)
    }

    private static func readStreamBody(_ request: URLRequest) -> Data? {
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            guard count > 0 else { break }
            data.append(buffer, count: count)
        }
        return data
    }
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `./scripts/test.sh JavaScriptCanvasEngineTests`
Expected: at least tests 24-26 FAIL. Pre-implementation, `openclip.fetch` is undefined inside the canvas context, so:
- Test 24/25: the handler's `openclip.fetch(...)` throws a JS `TypeError`, the returned promise rejects, the engine throws `scriptException("...openclip.fetch is not a function...")` instead of returning a resolved tree → the state/tree assertions never run.
- Test 26: the thrown message is `"openclip.fetch is not a function"`, so the `msg.contains("Fetch failed")` assertion fails.
- Test 27 already passes pre-implementation (the engine already surfaces the JS `TypeError` as a `scriptException`) — it is a guard, not a red-green test.

- [ ] **Step 3: Implement — add `session` and install fetch in `executeDispatch`**

Edit `Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift`:

1. **Add the session property and init param:**

```swift
    public let session: URLSession

    public init(timeout: TimeInterval? = nil, session: URLSession = .shared) {
        self.session = session
        self._sessionState = CanvasSessionState()
        self._sessionInput = ""
        self._sessionCaptures = []
        self._sessionApp = nil
        self._sessionOptionValues = [:]
        self._isAsync = false
        self._timeoutOverride = timeout
    }
```

2. **In `executeDispatch`, immediately after the `CanvasScriptBox.installCanvasBridge(...)` call** (`~:276`, before `jsContext.evaluateScript(scriptCode)`), install fetch for async sessions and cancel any in-flight tasks when the dispatch ends (all exits, including throws):

```swift
        let fetchTasks = FetchTaskBox()
        if engine._isAsync {
            JSNativeFetch.installNativeFetch(in: jsContext, session: engine.session, fetchTasks: fetchTasks)
        }
        defer { fetchTasks.cancelAll() }
```

3. **Do NOT touch `executeMount`** — `ui()` at mount must stay synchronous; the polyfill is intentionally not installed there.

- [ ] **Step 4: Run the canvas test suite to verify everything passes**

Run: `./scripts/test.sh JavaScriptCanvasEngineTests`
Expected: all 27+ tests pass — the 4 new fetch tests plus every pre-existing test (mount/dispatch/effects/watchdog/gate tests must remain green).

- [ ] **Step 5: Run the JS host suite again (shared helper touched both)**

Run: `./scripts/test.sh OpenClipJSHostTests`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add Sources/OpenClip/Actions/JavaScriptCanvasEngine.swift Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift
git commit -m "feat(canvas): install shared fetch bridge for async handler dispatches"
```

---

## Task 3: Documentation

**Files:**
- Modify: `docs/developer-guide/AGENTS.md` (§7a intro ~`:468-469`; "The `openclip` bridge inside a canvas" ~`:524-533`)
- Modify: `docs/runtimes/javascript.md` (canvas section ~`:58-65`)
- Modify: `docs/architecture/known-debt.md` ("Action Seams Already Implemented" ~`:37-55`)

`docs/architecture/extensions.md` is intentionally unchanged — its L2+ row already lists canvas "with network `fetch`", which is now accurate.

- [ ] **Step 1: Update `docs/developer-guide/AGENTS.md` §7a**

Replace the intro sentence at ~`:468-469`:

```markdown
scriptCode (required — validation rejects a canvas without it) holding the canvas script;
`"async": true` is optional — it enables `openclip.fetch` in handlers (below); a canvas
mount or dispatch whose promise never settles is killed by the same 30 s watchdog. There
```

Append to the "The `openclip` bridge inside a canvas" paragraph (~`:533`):

```markdown

With `"async": true`, handlers may call `openclip.fetch(url, options)` — the same contract
as JS actions: `options` = `{ method, headers, body }` (default GET); the response is
`{ status, ok, text() → Promise<string>, json() → Promise<any> }`; network errors reject the
handler's promise (surfaced as an error status), and a request that never settles is killed
by the 30 s watchdog (in-flight tasks are cancelled). `ui()` stays synchronous — use fetch in
handlers, never in `ui`/at mount; mount-time async rendering is not supported.
```

- [ ] **Step 2: Update `docs/runtimes/javascript.md`**

Append to the canvas paragraph (~`:65`, after the §7a cross-reference sentence):

```markdown

Async canvas actions (`"async": true`) get the same `fetch(url, options)` polyfill inside
handlers as the non-canvas JS runtime above; `ui()` remains synchronous.
```

- [ ] **Step 3: Update `docs/architecture/known-debt.md`**

Add a bullet to the "Action Seams Already Implemented" section:

```markdown
- **Canvas `fetch()` ships with a live-load gap.** `"async": true` canvas actions get
  `openclip.fetch` in handlers via the shared `JSNativeFetch` bridge
  (`Sources/OpenClip/Actions/JSNativeFetch.swift`, used by both `OpenClipJSHost` and
  `JavaScriptCanvasEngine`). The canvas `isAsync` flag — previously stored but never read —
  now gates dispatch-time fetch installation. Deferred: mount-time async rendering (async
  `ui()` / a `beforeMount` hook) and a busy indicator for in-flight handler fetches; `ui()`
  must stay synchronous.
```

- [ ] **Step 4: Verify docs only (no build needed) and commit**

```bash
git add docs/developer-guide/AGENTS.md docs/runtimes/javascript.md docs/architecture/known-debt.md
git commit -m "docs: document openclip.fetch in async canvas handlers"
```

---

## Final Verification

```bash
./scripts/test.sh          # full suite — JS host tests, canvas engine tests, and everything else
./scripts/dev_run.sh       # builds Debug + launches; add a temp "async": true canvas with a fetch handler to smoke-test
```

Smoke-test script (drop into `~/.openclip/extensions`):

```js
// openclip.json
{ "identifier": "com.example.async-canvas-demo", "name": "Async Canvas Demo",
  "actions": [{ "title": "Fetch Demo", "type": "canvas", "async": true, "script": "main.js" }] }
```

```js
// main.js
const handlers = {
  load: async (state) => {
    const r = await openclip.fetch('https://api.github.com/repos/ganeshmshetty/openclip');
    const j = await r.json();
    return { ...state, stars: '★ ' + j.stargazers_count, lang: j.language || '' };
  }
};
const ui = (state) =>
  h('stack', { spacing: 8 }, [
    h('button', { title: 'Load repo data', handler: 'load', style: 'accent' }),
    h('text', { content: state.stars || 'not loaded' }),
    h('text', { content: state.lang, style: 'caption', color: 'secondary' }),
  ]);
```