# Extension JS Module Importing

Date: 2026-08-15 · Status: Draft — awaiting review

This spec adds CommonJS module importing to JS extensions: a host-side loader lets packages split
logic across files (`require('./x.js')`) with zero build step, and an author-side npm/esbuild
scaffold bundles third-party libraries (with minimal TypeScript support in the bundle path).

The capability-gating sandbox (seeding `ManifestCapabilityGate`, gating the JS bridge) is
**explicitly out of scope** — it is a follow-up spec that builds on the module entry format
defined here.

---

## Problem

JS extensions are a single file (or inline `scriptCode`); there is no `require`/`import`, no way to
split an action across files or share helpers between actions in a package, and no way to use
third-party npm libraries. The authoring surface is flat, and the runtime cannot consume a bundled
artifact.

## Goals

1. **Local multi-file packages** work with zero build step: a host-side CommonJS loader resolves
   `require('./x.js')` within the package directory, at run time.
2. **npm libraries** work via an author-side esbuild bundle the *same* loader executes — users never
   touch node/npm.
3. Existing extensions keep working unchanged (the entry contract stays compatible).

## Design

### 1. The loader — new `Sources/OpenClip/Platform/Runtimes/OpenClipModuleLoader.swift`

Pure Swift (Foundation only), in the OpenClip target beside `OpenClipJSHost`. It does resolution +
containment + file IO; the host does the JS-side wrapping/caching.

```swift
public enum ModuleResolutionError: Error, Equatable {
    case outsidePackage(String)      // "../.." escape or symlink escape
    case absolutePath(String)        // require("/…")
    case bareSpecifier(String)       // require("fs") — Node builtins / bare names
    case notFound(String, [String])  // specifier + tried candidate paths
}

public struct ResolvedModule: Equatable, Sendable {
    public let url: URL              // canonical file URL (cache key)
    public let source: String
    public let directoryURL: URL     // __dirname handed to the module
}

public enum OpenClipModuleLoader {
    public static func load(
        specifier: String,
        requiringDirectory: URL,
        packageRoot: URL
    ) throws -> ResolvedModule
}
```

Resolution algorithm:

1. **Specifier shape.** Must start with `./` or `../`. A bare specifier (`fs`, `lodash`) → throw
   `.bareSpecifier`; for well-known Node builtins (`fs`, `path`, `os`, `child_process`, `http`,
   `crypto`, …) the message is explicit: `"Node builtin \"fs\" is not available to OpenClip
   extensions; it cannot run in the sandboxed runtime"`. An absolute path → `.absolutePath`.
2. **Canonicalize.** `requiringDirectory.appendingPathComponent(specifier).standardizedFileURL`.
   Symlinks must be resolved (use `URL.resolvingSymlinksInPath()` / `standardizedFileURL`) so a
   symlink inside the package can't alias outside it.
3. **Containment.** The canonical result must be strictly inside the canonical `packageRoot` (path
   prefix on component boundaries, mirroring `Constants.isPathSafe`). Violation → `.outsidePackage`.
4. **File search** (Node semantics, minimal): exact file → use; else `<candidate>.js`; else if the
   candidate is a directory → `<candidate>/index.js`. First hit wins; none → `.notFound` with the
   tried candidates.
5. **Read** UTF-8; an empty file is a valid module (`module.exports = {}`).

The loader is pure and testable with temp-directory fixtures; no `JSContext` involvement.

### 2. Host integration — `OpenClipJSHost.swift` + `JavaScriptAction.swift` + `DefaultActionFactory.swift`

`OpenClipJSHost.Request` gains `packageDirectory: URL?` (nil = inline `scriptCode` → no module
support, byte-for-byte legacy behavior). `JavaScriptAction` gains `packageDirectory: URL?`. In
`DefaultActionFactory.makeAction`, the **file-based** JS branch (`:380-396`, `case "js"`) passes
`directoryURL`; the **inline** `scriptCode` branch (`:327-341`) passes `nil`.

**Module bridge block.** When `packageDirectory != nil`, the host registers one extra block on the
`openclip` object before evaluation:

- `openclip.__resolveModule(dir, specifier) -> JSValue` — calls `OpenClipModuleLoader.load`,
  returns `{ ok: true, path, dir, source }` on success or `{ ok: false, message }` on failure
  (bridging via a plain object, not a thrown ObjC exception — simpler and testable).

**Wrapper.** The current `syncWrappedScript` / `asyncWrappedScript` templates keep their shape
(`selection`/`options`, `action`/`main` dispatch, async `__openclip_dispatch`), but for
`packageDirectory != nil` the `<scriptCode>` is wrapped in module scaffolding:

```js
var module = { exports: {} };
var exports = module.exports;
var require = function(specifier) {
    var r = openclip.__resolveModule(__dirname, specifier);
    if (!r.ok) throw new Error(r.message);
    if (openclip.__moduleCache[r.path] !== undefined) return openclip.__moduleCache[r.path];
    var m = { exports: {} };
    openclip.__moduleCache[r.path] = m.exports;        // cache-first: cycles get partial exports
    (new Function('require', 'module', 'exports', '__dirname', r.source))(require, m, m.exports, r.dir);
    return m.exports;
};
var __dirname = "<entry directory>";
<scriptCode>
```

**Entry contract (all three styles resolve to a callable):**
1. Legacy bare `function action(selection, options)` — unchanged behavior (the declaration is in
   scope inside the wrapper).
2. CJS bundle: `module.exports = { action: … }` (this is exactly what esbuild emits for
   `export const action`).
3. Direct export: `module.exports = function action(selection, options) { … }`.

Dispatch order: `module.exports` if it's a function → `module.exports.action` → `module.exports.main`
→ in-scope `action` → in-scope `main`. Async mode keeps the same order through
`__openclip_dispatch`.

**Runtime properties:** the `__moduleCache` lives on the per-run context, so caching is naturally
per-perform. Resolution failures throw inside `require`; top-level throws surface through the
existing `jsContext.exception` → `.showStatus(.error)` path, nested throws through the async
dispatch's catch. `console.log` keeps working inside modules (shim is context-global).

**Sandbox note:** modules are author's-own code evaluated via `new Function` — no new capability.
Bare specifiers (the only way a Node builtin could appear) are rejected by §1 step 1, so the loader
is itself a containment point. This is what makes the future capability-gating spec's assumption
"JS cannot reach filesystem beyond its package" hold even after bundling.

### 3. npm scaffold — `scripts/new_extension.sh --with-npm`

Scaffolds the same folder as `--type js` plus:

- `package.json` with a `build` script pinned to the verified-safe config:
  `esbuild src/main.ts --bundle --format=cjs --platform=browser --target=es2020 --outfile=dist/main.js`
  and `esbuild` as a devDependency.
  - **Verified:** on `--platform=browser`, a direct *or transitive* import of `fs`/`path`/any Node
    builtin is a hard esbuild error (`Could not resolve "fs" … try --platform=node`), so a
    Node-builtin extension cannot ship. `process.env.NODE_ENV` is constant-folded by esbuild on
    browser platform (verified: no `process` reference in output).
- `src/main.ts` template (TypeScript): `export const action = (selection, options) => selection;`
  with the parameter types imported from `openclip.d.ts`. **Verified:** esbuild transpiles the `.ts`
  entry with zero config — types stripped, downleveled to `es2020`, and CJS
  `module.exports = { action }` emitted — so the §2 entry contract consumes it unchanged and the
  host never sees TypeScript.
- **TypeScript is a build-time concern, bundle-path only.** esbuild is *transpile-only* (no
  type-checking); authors who want type errors at build time add an optional
  `tsc --noEmit` (`"typecheck"` script) — scaffolded but not chained into `build` so a missing
  `typescript` install never blocks bundling.
- `openclip.d.ts` — a small declaration file shipped in the scaffold (and referenced from the docs
  repo) describing the `openclip.*` bridge surface: `input` (`text`/`matchedText`/`captures`/
  `app`/`isSecondaryClick`), `options`, `option(id)`, and the effect functions
  (`paste`/`copy`/`cut`/`openURL`/`keyPress`/`runShortcut`/`notify`/`shareService`/`showStatus`/
  `requireConfiguration`), plus the `action`/`main` entry signature. Gives authors editor
  autocomplete and real type-checking over the extension API.
- `.gitignore` with `node_modules/`.
- Manifest `script: "dist/main.js"` from day one.
- The build contract is documented in the scaffold: **rebuild before install** (`dist/main.js` is the
  shipped artifact; the catalog commits both `src/` + `package.json` and the built `dist/`).

### 4. Validation script additions — `scripts/validate_extension.sh`

Rejects bad packages at install, not load:

1. **Local require targets**: scan each `script:`-referenced `.js` file for string-literal
   `require('./…')` / `require('../…')` calls and report any target missing from the package.
   Best-effort (literal requires only); the loader remains authoritative.
2. **npm stale build**: if `package.json` exists and `dist/main.js` is absent → exit 1
   ("run `npm run build`"); if present but older than `src/**/*.{js,ts}` or `package.json` →
   warning (not an error — hot-edit workflows exist).

### 5. Docs

- `docs/developer-guide/AGENTS.md`:
  - §3b javascript: multi-file via `require`, the three entry forms, in-scope `module`/`exports`/
    `require`/`__dirname`, package containment, no bare/Node-builtin requires, no modules for inline
    `scriptCode`.
  - §7: note `require` availability for file scripts.
  - §10: add the `--with-npm` workflow and the rebuild-before-install contract.
  - §11: add "no `require` of bare/Node-builtin specifiers".
  - §12: add `OpenClipModuleLoader` to the source-of-truth list.
- New `docs/developer-guide/extensions-modules.md`: the npm workflow, a **known-good pure-JS library**
  list (lodash-style utilities, markdown/html parsers, slugify, date libs), an explicit limitations
  box (no Node builtins — rejected at build; no `.node` native bindings — impossible; no DOM; mind
  the 30s watchdog; JSC global set like `setTimeout`/`Buffer` is not Node's — verify during
  implementation), and an esbuild shims section (`--define:process.env.NODE_ENV='"production"'`,
  `--external`, `--inject`/`--alias`). A **TypeScript section**: TS is supported in the bundle path
  only (esbuild transpiles `.ts`; host loader is `.js` only); how to enable the optional
  `tsc --noEmit` type-check, and where `openclip.d.ts` lives.
- `docs/architecture/extensions.md`: note module containment (filesystem reach = package directory
  only).
- `docs/architecture/known-debt.md`: current-state note.

## Tests

New `Tests/OpenClipTests/OpenClipModuleLoaderTests.swift` (pure, temp-dir fixtures):
- resolution: `./x` → `x.js`, `./x.js`, `./lib` → `lib/index.js`, nested relative-to-requiring-file.
- containment: `../` escape, absolute path, symlink-escape → `.outsidePackage`; known Node builtin
  → `.bareSpecifier` with the builtin message.
- `notFound` reports tried candidates; empty file resolves to an empty module.

JS-host integration (extend the existing `OpenClipJSHost`/golden extension test surface):
- multi-file package end-to-end: two actions sharing a `lib/` helper via the factory path.
- module cache per run; cycle (a→b→a) resolves with partial exports, no infinite loop.
- all three entry forms invoke correctly (bare `function action`, `module.exports = { action }`,
  `module.exports = function action(){}`).
- inline `scriptCode` behaves byte-for-byte as before (regression).
- missing-require → `.showStatus(.error)` with a readable message.

`Tests/OpenClipTests/NewExtensionKindTests.swift`:
- `testFactoryRoutesScriptFileToJavaScriptActionWithPackageDirectory` — factory passes
  `directoryURL` into `JavaScriptAction.packageDirectory` for file scripts.

Scripts: a smoke check that `new_extension.sh --with-npm` output passes `validate_extension.sh`
after `npm run build`, that the TypeScript `src/main.ts` template bundles to CJS
`module.exports = { action }` (the verified esbuild behavior), and that a
`require("./missing.js")` package is rejected pre-install.

## Out of scope

- **Capability gating sandbox** (seeding `ManifestCapabilityGate`, gating `fetch`/`keyPress`/
  `runShortcut` behind declared capabilities, install-time trust warning) — a follow-up spec. It
  deliberately lands *after* this one so the gates constrain a settled entry format.
- Embedding esbuild in the app / install-time bundling.
- A curated pre-bundled npm module registry / downloads from the store.
- **Host-side TypeScript transpile for the local multi-file loader** (the host loader runs `.js`
  only; TS is supported in the bundle path via esbuild — see §3). Embedding a TS compiler in the
  app is deliberately not done.
- `import`/`export` statement parsing by the host loader (CommonJS only; esbuild handles ESM at
  bundle time).

## Verification

1. Build gate: `./scripts/dev_run.sh` (or `xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`).
2. `./scripts/test.sh OpenClipModuleLoaderTests`
3. `./scripts/test.sh NewExtensionKindTests`
4. Full suite: `./scripts/test.sh`
5. Manual (local): author the two-file example from the design conversation, `validate_extension.sh`
   then `install_extension.sh`, confirm hot reload and correct output.
6. Manual (npm): `new_extension.sh Demo --with-npm`, `npm install && npm run build`,
   validate + install, confirm bundled action runs; confirm a package importing `fs` fails `npm run build`.