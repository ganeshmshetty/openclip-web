# Canvas `fetch()` via a Shared Network Bridge

Date: 2026-08-11 · Status: Approved for implementation

## Problem

Async JS actions (`OpenClipJSHost`, `"async": true`) get a `fetch(url, options)`
polyfill bridged to URLSession (`OpenClipJSHost.swift:343`, polyfill at `:500`).
Interactive canvases (`JavaScriptCanvasEngine`) do not — `CanvasScriptBox`
installs no `openclip.fetch`, no `__nativeFetch`, and no promise-settlement
bridge into the canvas context.

Canvas handlers **can already return a promise and have it pumped to completion**
(`JavaScriptCanvasEngine.swift:328-356`), so the await machinery exists — what is
missing is any way to drive real async I/O. The `isAsync` flag is parsed, threaded
into `CanvasMountRequest`, stored on the engine (`JavaScriptCanvasEngine.swift:31`,
set at `:235`), and **never read** — it is dead.

`docs/architecture/extensions.md:103` already lists canvas in the L2+ tier "plus
network `fetch`" — the implementation never shipped it. And `.showContent` from a
JS action arms a *static* (non-scripting) session (`PopupWindowController.swift:703`,
`armCanvas` scripting nil at `:301`), so "fetch in JS then `showContent`" is not a
workaround for an *interactive* canvas.

## Goal

When a canvas action declares `"async": true`, its **handlers** may call
`openclip.fetch(url, options)` with the same contract as JS actions:

- `options` = `{ method, headers, body }` (default GET)
- response = `{ status, ok, text(): Promise<string>, json(): Promise<any> }`
- network errors reject the handler's promise (surfaced as an error status)
- the existing 30 s watchdog (`Constants.scriptTimeout`) covers a never-settling fetch

`ui()` and mount stay synchronous — no loading UI in v1. The dead `isAsync` flag
becomes meaningful, gating dispatch-time fetch availability.

## Design

### 1. Shared network bridge — new `Sources/OpenClip/Actions/JSNativeFetch.swift`

Move the URLSession fetch glue out of `OpenClipJSHost` into one
`public enum JSNativeFetch` (same target — both hosts share it):

- `installNativeFetch(in context: JSContext, session: URLSession, fetchTasks: FetchTaskBox)` —
  looks `openclip` up from the context, installs the `__nativeFetch` block, then
  evaluates the `openclip.fetch` polyfill script. Either host calls it *after*
  installing its own bridge.
- `makeURLRequest(url:options:)` — moved from `OpenClipJSHost.swift:381`.
- `fetchResponse(status:body:context:)` — moved from `OpenClipJSHost.swift:413`.
- `jsError(_:in:)` — moved from `OpenClipJSHost.swift:441`.
- `fetchPolyfillScript` — moved from `OpenClipJSHost.swift:500`.
- `FetchTaskBox` stays in `OpenClipJSHostSupport.swift` (already shared infra).

`OpenClipJSHost.registerAsyncBridge` keeps its promise settlement
(`__resolve`/`__reject`) but the `__nativeFetch` part delegates to
`JSNativeFetch`. JS-action behavior must stay byte-identical (the existing
`OpenClipJSHostTests` suite is the regression net).

### 2. Canvas engine wiring — `JavaScriptCanvasEngine.swift`

- Add `public let session: URLSession` with init
  `init(session: URLSession = .shared, timeout: TimeInterval? = nil)` — parallel to
  `OpenClipJSHost(session:)` so tests inject a `MockURLProtocol` session.
- **`executeDispatch` only** (not mount): after `installCanvasBridge`, when
  `engine._isAsync` is true, create a per-dispatch `FetchTaskBox` and call
  `JSNativeFetch.installNativeFetch(in: jsContext, session: engine.session, fetchTasks: fetchTasks)`.
- Hold the box for the whole evaluation (including the promise pump); call
  `fetchTasks.cancelAll()` in the watchdog branches (mirror `OpenClipJSHost.swift:275,288`)
  and `defer { fetchTasks.cancelAll() }` so a fire-and-forget fetch started by a
  handler is cancelled when the dispatch ends.
- Not installing at mount: `ui()` must stay synchronous, and an install there
  would only let mount-time top-level code start an orphaned URLSession task with
  nothing pumping it.
- Gating on `isAsync` means an `"async"`-less canvas calling `openclip.fetch`
  fails loudly with `"openclip.fetch is not a function"` — matching JS actions.
- No changes to `CanvasScriptBox.installCanvasBridge`.

### 3. Behavior contract (documented)

A handler may now be async and await a fetch:

```js
const handlers = {
  async load(state, event, input) {
    const r = await openclip.fetch('https://api.example.com/items');
    const items = await r.json();
    return { ...state, items };   // ui(state) re-renders with the data
  }
};
```

The handler's returned promise is settled by the existing dispatch pump
(`JavaScriptCanvasEngine.swift:328-356`); a rejection throws a
`CanvasJSRuntimeError.scriptException`, failing the dispatch and surfacing an
error status (existing behavior). Timeouts cancel in-flight tasks via the
`FetchTaskBox` before throwing.

### 4. Docs

- `docs/developer-guide/AGENTS.md` §7a (canvas bridge): document `openclip.fetch`
  availability in handlers when `"async": true`, the response shape, rejection on
  network error, the watchdog, and that `ui()` stays synchronous. The §7a intro
  already notes `"async": true` is optional and never-settling promises hit the
  watchdog — expand it to mention fetch.
- `docs/runtimes/javascript.md`: add the same notes to its canvas/`showContent`
  section.
- `docs/architecture/extensions.md`: the L2+ row already claims canvas fetch —
  now accurate; no edit required (optional one-line note).
- `docs/architecture/known-debt.md`: record that canvas `isAsync` was dead and
  now gates dispatch fetch; mount-time async is deferred.

### 5. Tests — `Tests/OpenClipTests/JavaScriptCanvasEngineTests.swift`

Reuse `MockURLProtocol`/`LockedArray` (internal to the test target, defined in
`OpenClipJSHostTests.swift:25/54`); set a mocked `requestHandler`, build a
`URLSession(configuration: .ephemeral)` with `protocolClasses =
[MockURLProtocol.self]`, pass `session:` to `JavaScriptCanvasEngine`.

- **Handler fetch resolves**: `isAsync: true`, a handler that does
  `await openclip.fetch(...)` + `await r.json()`, returns `{...state, title: j.title}`;
  assert the returned `state["title"]` equals the canned payload and the tree
  re-renders with it.
- **Method/headers/body captured**: a POST fetch; assert
  `MockURLProtocol.capturedRequests` shows `httpMethod == "POST"`, the
  `Content-Type` header, and the body.
- **Network error rejects**: `requestHandler` throws; assert dispatch throws a
  `CanvasJSRuntimeError.scriptException`.
- **No `"async"` → loud failure**: `isAsync: false`, a handler referencing
  `openclip.fetch`; assert dispatch throws a `scriptException`.
- **Regression**: `OpenClipJSHostTests` stay green after the extraction; the full
  existing `JavaScriptCanvasEngineTests` stay green.

## Out of scope

- **Mount-time async** (async `ui()` / a `beforeMount` hook) plus loading UI —
  deferred; see `docs/architecture/known-debt.md`.
- **Busy indicator** while a handler fetch is in-flight — deferred (the canvas
  shows the pre-fetch tree until the dispatch applies).
- **Cancelling a mid-dispatch fetch on popup collapse** — session `clear()` /
  `replace()` cancels the dispatch task chain, but the engine's detached
  evaluation finishes under its own watchdog (existing behavior for any long
  dispatch; `JSVirtualMachine` cannot be interrupted).
- **Network policy** beyond `URLSession.shared` / injected test sessions.

## Verification

1. Regenerate the Xcode project (new `.swift` file): `xcodegen generate`.
2. Scripts re-run it automatically; build via `./scripts/dev_run.sh` or the
   package script.
3. Target test classes:
   `./scripts/test.sh JavaScriptCanvasEngineTests`
   `./scripts/test.sh OpenClipJSHostTests`
   `./scripts/test.sh`