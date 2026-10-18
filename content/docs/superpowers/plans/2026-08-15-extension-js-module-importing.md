# Extension JS Module Importing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let OpenClip JS extensions split logic across files via host-side CommonJS `require`, and bundle npm libraries (with minimal TypeScript support) through an author-side esbuild scaffold — without changing the manifest schema or breaking existing extensions.

**Architecture:** A pure-Swift `OpenClipModuleLoader` does resolution + containment + file IO (no JSContext). The JS host threads a `packageDirectory` through `Request` → `JavaScriptAction` → `DefaultActionFactory`, installs one `openclip.__resolveModule` bridge block, and wraps file-script bodies in module scaffolding (per-run cache, three entry forms) for both sync and async modes. Authoring tooling (`new_extension.sh --with-npm`, `validate_extension.sh`) is updated to match. Keychain/`secret` options are untouched (kept as-is per the final scope decision).

**Tech Stack:** Swift 6 (AppKit app, XcodeGen-generated project), JavaScriptCore, Foundation, bash scripts, esbuild + TypeScript (author-side only, never embedded).

## Global Constraints

- Swift 6 with `SWIFT_STRICT_CONCURRENCY: complete` — no new `nonisolated(unsafe)` unless unavoidable.
- **Core target stays pure** — no AppKit/SwiftUI. `OpenClipModuleLoader` lives in `Sources/OpenClip/` and may import Foundation + Core (`Constants.isPathSafe`) only.
- No raw `UserDefaults.standard` in new code.
- New `.swift` file under `Sources/OpenClip/` → **run `xcodegen generate`** before building/testing (`./scripts/dev_run.sh` does it automatically; `./scripts/test.sh` does not).
- Inline `scriptCode` behavior must stay **byte-for-byte identical** (regression). Modules only engage when `packageDirectory != nil`.
- No new manifest keys; the loader works through the existing `script:` field. Unknown keys are ignored; do not invent any.
- The **authoritative manifest / JS-bridge spec is `docs/developer-guide/AGENTS.md`** — read it before touching anything extension-related.
- No subprocess spawning from the app; esbuild runs author-side via `npm` (never from the app).
- Commits follow repo style (`feat(scope): …`, `fix(scope): …`, `docs(scope): …`).
- Run targeted tests with `./scripts/test.sh <TestClassName>` (note: does not auto-run `xcodegen`).
- The specs/plans directory is gitignored; the plan lives in `docs/superpowers/plans/`.

**Design note (deviation from spec pseudocode):** the spec's wrapper pseudocode captured the *parent's* `__dirname` in the single `require` closure, which would resolve nested `require('./x')` inside child modules against the wrong directory. This plan binds a per-directory require (`__require.bind(null, r.dir)`), matching Node semantics. Task 3 implements the corrected version.

---

### Task 1: `OpenClipModuleLoader` (pure resolution + containment + IO)

**Files:**
- Create: `Sources/OpenClip/Platform/Runtimes/OpenClipModuleLoader.swift`
- Create: `Tests/OpenClipTests/OpenClipModuleLoaderTests.swift`

**Interfaces:**
- Consumes: `Constants.isPathSafe(destinationURL:baseDirectory:)` (Core, `Sources/Core/Selection/Constants.swift:119`).
- Produces: `ModuleResolutionError` (cases `outsidePackage(String)`, `absolutePath(String)`, `bareSpecifier(String)`, `notFound(String, [String])` + `var message: String`), `ResolvedModule` (`url: URL`, `source: String`, `directoryURL: URL`), and `OpenClipModuleLoader.load(specifier:requiringDirectory:packageRoot:) throws -> ResolvedModule`. Used by Task 3's bridge block.

- [ ] **Step 1: Write the failing test**

`Tests/OpenClipTests/OpenClipModuleLoaderTests.swift`:

```swift
import XCTest
@testable import OpenClip

final class OpenClipModuleLoaderTests: XCTestCase {
    /// Creates a temp "package root" plus a sibling temp dir (for outside-package fixtures).
    private func makeScratch() throws -> (root: URL, outside: URL) {
        let base = FileManager.default.temporaryDirectory.appendingPathComponent("loader-\(UUID().uuidString)")
        let root = base.appendingPathComponent("package")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        addTeardownBlock { try? FileManager.default.removeItem(at: base) }
        return (root, base)
    }

    private func write(_ text: String, to relativePath: String, in root: URL) throws {
        let url = root.appendingPathComponent(relativePath)
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try text.write(to: url, atomically: true, encoding: .utf8)
    }

    func testResolvesExplicitExtension() throws {
        let (root, _) = try makeScratch()
        try write("module.exports = 'hi';", to: "lib/helper.js", in: root)
        let module = try OpenClipModuleLoader.load(specifier: "./lib/helper.js", requiringDirectory: root, packageRoot: root)
        XCTAssertEqual(module.source, "module.exports = 'hi';")
        // Loader normalizes via resolvingSymlinksInPath (like isPathSafe), which rewrites
        // /var -> /private/var on macOS, so compare path suffixes, not URL equality.
        XCTAssertTrue(module.directoryURL.path.hasSuffix("/package/lib"))
    }

    func testAppendsJSExtension() throws {
        let (root, _) = try makeScratch()
        try write("module.exports = 'x';", to: "lib/helper.js", in: root)
        let module = try OpenClipModuleLoader.load(specifier: "./lib/helper", requiringDirectory: root, packageRoot: root)
        XCTAssertEqual(module.source, "module.exports = 'x';")
    }

    func testResolvesDirectoryToIndexJS() throws {
        let (root, _) = try makeScratch()
        try write("module.exports = 'indexed';", to: "lib/index.js", in: root)
        let module = try OpenClipModuleLoader.load(specifier: "./lib", requiringDirectory: root, packageRoot: root)
        XCTAssertEqual(module.source, "module.exports = 'indexed';")
    }

    func testResolvesNestedRelativeToRequiringDirectory() throws {
        let (root, _) = try makeScratch()
        try write("module.exports = 'sib';", to: "sub/sibling.js", in: root)
        let module = try OpenClipModuleLoader.load(specifier: "./sibling.js", requiringDirectory: root.appendingPathComponent("sub"), packageRoot: root)
        XCTAssertEqual(module.source, "module.exports = 'sib';")
    }

    func testRejectsParentEscape() throws {
        let (root, outside) = try makeScratch()
        try write("secret", to: "secret.txt", in: outside)
        do {
            _ = try OpenClipModuleLoader.load(specifier: "../secret.txt", requiringDirectory: root, packageRoot: root)
            XCTFail("Expected outsidePackage")
        } catch let error as ModuleResolutionError {
            XCTAssertEqual(error, .outsidePackage("../secret.txt"))
        }
    }

    func testRejectsAbsolutePath() throws {
        let (root, _) = try makeScratch()
        do {
            _ = try OpenClipModuleLoader.load(specifier: "/etc/passwd", requiringDirectory: root, packageRoot: root)
            XCTFail("Expected absolutePath")
        } catch let error as ModuleResolutionError {
            XCTAssertEqual(error, .absolutePath("/etc/passwd"))
        }
    }

    func testRejectsNodeBuiltinWithExplicitMessage() throws {
        let (root, _) = try makeScratch()
        do {
            _ = try OpenClipModuleLoader.load(specifier: "fs", requiringDirectory: root, packageRoot: root)
            XCTFail("Expected bareSpecifier")
        } catch let error as ModuleResolutionError {
            XCTAssertEqual(error, .bareSpecifier("fs"))
            XCTAssertTrue(error.message.contains("Node builtin"))
            XCTAssertTrue(error.message.contains("fs"))
        }
    }

    func testRejectsBareSpecifierWithBundleHint() throws {
        let (root, _) = try makeScratch()
        do {
            _ = try OpenClipModuleLoader.load(specifier: "lodash", requiringDirectory: root, packageRoot: root)
            XCTFail("Expected bareSpecifier")
        } catch let error as ModuleResolutionError {
            XCTAssertEqual(error, .bareSpecifier("lodash"))
            XCTAssertTrue(error.message.contains("bundle"))
        }
    }

    func testRejectsSymlinkEscape() throws {
        let (root, outside) = try makeScratch()
        try write("secret", to: "secret.txt", in: outside)
        let link = root.appendingPathComponent("leak.js")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: outside.appendingPathComponent("secret.txt"))
        do {
            _ = try OpenClipModuleLoader.load(specifier: "./leak.js", requiringDirectory: root, packageRoot: root)
            XCTFail("Expected outsidePackage")
        } catch let error as ModuleResolutionError {
            XCTAssertEqual(error, .outsidePackage("./leak.js"))
        }
    }

    func testNotFoundReportsTriedCandidates() throws {
        let (root, _) = try makeScratch()
        do {
            _ = try OpenClipModuleLoader.load(specifier: "./nope", requiringDirectory: root, packageRoot: root)
            XCTFail("Expected notFound")
        } catch let error as ModuleResolutionError {
            guard case .notFound(_, let tried) = error else { return XCTFail("Expected notFound, got \(error)") }
            XCTAssertTrue(tried.contains { $0.hasSuffix("package/nope") })
            XCTAssertTrue(tried.contains { $0.hasSuffix("package/nope.js") })
        }
    }

    func testEmptyFileIsValidModule() throws {
        let (root, _) = try makeScratch()
        try write("", to: "empty.js", in: root)
        let module = try OpenClipModuleLoader.load(specifier: "./empty.js", requiringDirectory: root, packageRoot: root)
        XCTAssertEqual(module.source, "")
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodegen generate && ./scripts/test.sh OpenClipModuleLoaderTests`
Expected: FAIL — `cannot find 'OpenClipModuleLoader' in scope` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

`Sources/OpenClip/Platform/Runtimes/OpenClipModuleLoader.swift`:

```swift
// OpenClipModuleLoader.swift
// OpenClip
//
// Host-side CommonJS loader for OpenClip JS extension packages. Resolves `require('./x')` calls
// inside a package directory at run time: pure Swift resolution + containment + file IO (no
// JSContext involvement). The JS host owns wrapping/caching; this type owns the filesystem rules.
import Foundation
import Core

public enum ModuleResolutionError: Error, Equatable, Sendable {
    /// Specifier resolved outside the package (../ escape or symlink escape).
    case outsidePackage(String)
    /// `require("/…")` — absolute paths are not allowed.
    case absolutePath(String)
    /// Bare specifier (`fs`, `lodash`) — npm libraries must be bundled; Node builtins never run.
    case bareSpecifier(String)
    /// No candidate file exists; carries the tried candidate paths.
    case notFound(String, [String])

    /// Node's builtin module names — the only bare specifiers that get the explicit builtin message.
    static let nodeBuiltins: Set<String> = [
        "assert", "buffer", "child_process", "cluster", "console", "constants", "crypto",
        "dgram", "dns", "domain", "events", "fs", "http", "https", "module", "net", "os",
        "path", "perf_hooks", "process", "punycode", "querystring", "readline", "repl",
        "stream", "string_decoder", "sys", "timers", "tls", "trace_events", "tty", "url",
        "util", "v8", "vm", "worker_threads", "zlib"
    ]

    public var message: String {
        switch self {
        case .outsidePackage(let specifier):
            return "require(\"\(specifier)\") resolves outside the extension package; modules cannot read outside the package directory"
        case .absolutePath(let specifier):
            return "require(\"\(specifier)\") must be a relative path (./ or ../); absolute paths are not supported"
        case .bareSpecifier(let name):
            if Self.nodeBuiltins.contains(name) {
                return "Node builtin \"\(name)\" is not available to OpenClip extensions; it cannot run in the sandboxed runtime"
            }
            return "Bare specifier \"\(name)\" is not supported; bundle npm libraries with esbuild (see docs/developer-guide/extensions-modules.md)"
        case .notFound(let specifier, let tried):
            let candidates = tried.isEmpty ? "" : " (tried: \(tried.joined(separator: ", ")))"
            return "Cannot find module \"\(specifier)\"\(candidates)"
        }
    }
}

public struct ResolvedModule: Equatable, Sendable {
    public let url: URL
    public let source: String
    public let directoryURL: URL

    public init(url: URL, source: String, directoryURL: URL) {
        self.url = url
        self.source = source
        self.directoryURL = directoryURL
    }
}

public enum OpenClipModuleLoader {
    /// Resolves `require(specifier)` from `requiringDirectory` within `packageRoot`, or throws a
    /// `ModuleResolutionError`. Node-style resolution: exact file → `<candidate>.js` →
    /// `<candidate>/index.js`.
    public static func load(
        specifier: String,
        requiringDirectory: URL,
        packageRoot: URL
    ) throws -> ResolvedModule {
        guard specifier.hasPrefix("./") || specifier.hasPrefix("../") else {
            if specifier.hasPrefix("/") {
                throw ModuleResolutionError.absolutePath(specifier)
            }
            let firstComponent = specifier.split(separator: "/").first.map(String.init) ?? specifier
            throw ModuleResolutionError.bareSpecifier(firstComponent)
        }

        let candidate = requiringDirectory
            .appendingPathComponent(specifier)
            .resolvingSymlinksInPath()
            .standardizedFileURL

        let canonicalRoot = packageRoot.resolvingSymlinksInPath().standardizedFileURL
        guard Constants.isPathSafe(destinationURL: candidate, baseDirectory: canonicalRoot) else {
            throw ModuleResolutionError.outsidePackage(specifier)
        }

        func isFile(_ url: URL) -> Bool {
            var isDir: ObjCBool = false
            return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) && !isDir.boolValue
        }
        func isDir(_ url: URL) -> Bool {
            var isDir: ObjCBool = false
            return FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir) && isDir.boolValue
        }
        func resolved(_ url: URL, tried: [String]) throws -> ResolvedModule {
            guard let source = try? String(contentsOf: url, encoding: .utf8) else {
                throw ModuleResolutionError.notFound(specifier, tried + [url.path])
            }
            return ResolvedModule(
                url: url,
                source: source,
                directoryURL: url.deletingLastPathComponent()
            )
        }

        var tried: [String] = [candidate.path]
        if isFile(candidate) {
            return try resolved(candidate, tried: tried)
        }

        let withJS = candidate.appendingPathExtension("js")
        tried.append(withJS.path)
        if isFile(withJS) {
            return try resolved(withJS, tried: tried)
        }

        if isDir(candidate) {
            let index = candidate.appendingPathComponent("index.js")
            tried.append(index.path)
            if isFile(index) {
                return try resolved(index, tried: tried)
            }
        }

        throw ModuleResolutionError.notFound(specifier, tried)
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh OpenClipModuleLoaderTests`
Expected: PASS (all 11 tests).

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/Runtimes/OpenClipModuleLoader.swift Tests/OpenClipTests/OpenClipModuleLoaderTests.swift
git commit -m "feat(js): add host-side OpenClipModuleLoader (resolution + containment)"
```

---

### Task 2: Thread `packageDirectory` through `Request`, `JavaScriptAction`, `DefaultActionFactory`

**Files:**
- Modify: `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift:30-62` (`Request` + `init`)
- Modify: `Sources/OpenClip/Platform/Runtimes/JavaScriptAction.swift` (stored property + both inits + `perform`)
- Modify: `Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift:327-341,386-396` (inline vs file JS branches)
- Test: `Tests/OpenClipTests/NewExtensionKindTests.swift`

**Interfaces:**
- Consumes: nothing new.
- Produces: `OpenClipJSHost.Request.packageDirectory: URL?` (default nil) and `JavaScriptAction.packageDirectory: URL?` (default nil). Task 3 reads `request.packageDirectory`; Task 3's tests build `Request`s with it.

- [ ] **Step 1: Write the failing test**

Add to `Tests/OpenClipTests/NewExtensionKindTests.swift`:

```swift
// MARK: - JS module package directory

func testFactoryRoutesScriptFileToJavaScriptActionWithPackageDirectory() async throws {
    let factory = DefaultActionFactory()
    let meta = ExtensionActionMetadata(title: "File", script: "main.js", type: "js")
    let manifest = ExtensionMetadata(identifier: "com.test.file", name: "File Test", actions: [meta])

    let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tempDir) }
    try "function action(){ return 'x'; }".write(to: tempDir.appendingPathComponent("main.js"), atomically: true, encoding: .utf8)

    let action = await factory.createAction(metadata: meta, manifest: manifest, directoryURL: tempDir, index: 0)
    guard let js = action as? JavaScriptAction else {
        return XCTFail("Expected JavaScriptAction, got \(String(describing: action))")
    }
    XCTAssertEqual(js.packageDirectory, tempDir)
}

func testFactoryInlineScriptCodeHasNilPackageDirectory() async throws {
    let factory = DefaultActionFactory()
    let meta = ExtensionActionMetadata(title: "Inline", type: "javascript", scriptCode: "function action(){ return 'x'; }")
    let manifest = ExtensionMetadata(identifier: "com.test.inline", name: "Inline Test", actions: [meta])

    let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tempDir) }

    let action = await factory.createAction(metadata: meta, manifest: manifest, directoryURL: tempDir, index: 0)
    guard let js = action as? JavaScriptAction else {
        return XCTFail("Expected JavaScriptAction, got \(String(describing: action))")
    }
    XCTAssertNil(js.packageDirectory)
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh NewExtensionKindTests`
Expected: FAIL — `value of type 'JavaScriptAction' has no member 'packageDirectory'`.

- [ ] **Step 3: Write minimal implementation**

`JavaScriptAction.swift` — add the stored property next to `isAsync` (after line 26) and the `packageDirectory: URL? = nil` param to **both** inits (before `isAsync`), assigning in the initializer bodies:

```swift
    /// The extension package directory. When non-nil the JS host runs in module mode
    /// (`require`/multi-file); nil means inline `scriptCode` keeps the legacy single-file behavior.
    public let packageDirectory: URL?
```

```swift
    nonisolated public init(
        id: String,
        title: String,
        icon: ActionIcon = .symbol("terminal"),
        scriptCode: String,
        options: [ExtensionOption] = [],
        chrome: ActionChrome? = nil,
        optionStore: any ActionOptionReading = SettingsActionOptionStore(),
        rules: ExtensionActionRules? = nil,
        isAsync: Bool = false,
        packageDirectory: URL? = nil
    ) {
        ...
        self.isAsync = isAsync
        self.packageDirectory = packageDirectory
    }
```

and the same `packageDirectory: URL? = nil` param on the `iconSymbol:` convenience init, forwarded through:

```swift
        self.init(id: id, title: title, icon: .symbol(iconSymbol), scriptCode: scriptCode, options: options, chrome: chrome, optionStore: optionStore, rules: rules, isAsync: isAsync, packageDirectory: packageDirectory)
```

`JavaScriptAction.perform` — pass it into the request:

```swift
        let request = OpenClipJSHost.Request(
            actionID: id,
            scriptCode: scriptCode,
            context: context,
            options: actionOptions,
            optionStore: optionStore,
            rules: rules ?? ExtensionActionRules(),
            isAsync: isAsync,
            packageDirectory: packageDirectory
        )
```

`OpenClipJSHost.swift` — add the field to `Request` (after `timeout`, line 41) and the defaulted param to `init` (after `timeout`, line 51):

```swift
        /// Extension package directory. When non-nil the host enables the module bridge and wraps
        /// the script in module scaffolding; nil preserves the legacy single-file behavior.
        public var packageDirectory: URL?
```

```swift
            timeout: TimeInterval? = nil,
            packageDirectory: URL? = nil
        ) {
            ...
            self.timeout = timeout
            self.packageDirectory = packageDirectory
        }
```

`DefaultActionFactory.swift`:
- **File branch** (`case "js"`, line ~386) — add `packageDirectory: directoryURL,` to the `JavaScriptAction(...)` call.
- **Inline branch** (`case "js", "javascript"`, line ~331) — leave as-is; `packageDirectory` defaults to nil.

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh NewExtensionKindTests`
Expected: PASS (both new tests; existing tests still pass).

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift Sources/OpenClip/Platform/Runtimes/JavaScriptAction.swift Sources/OpenClip/Platform/Extensions/DefaultActionFactory.swift Tests/OpenClipTests/NewExtensionKindTests.swift
git commit -m "feat(js): thread extension package directory through JS action + factory"
```

---

### Task 3: JS host module bridge + module-aware wrappers

**Files:**
- Modify: `Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift` (bridge block in `evaluate`, wrapper selection at `:269`, new wrapper/prelude functions)
- Test: `Tests/OpenClipTests/OpenClipJSHostTests.swift`

**Interfaces:**
- Consumes: Task 1's `OpenClipModuleLoader` / `ModuleResolutionError`; Task 2's `Request.packageDirectory`.
- Produces: the `openclip.__resolveModule(dir, specifier)` bridge returning `{ ok, path, dir, source }` / `{ ok: false, message }`, and module-aware sync/async wrappers implementing the three entry forms. No public API changes beyond Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `Tests/OpenClipTests/OpenClipJSHostTests.swift`:

```swift
    // MARK: - JS modules (packageDirectory != nil)

    /// Writes a temp package and returns its URL; files map "rel/path" -> content.
    private func makeModulePackage(_ files: [String: String]) throws -> URL {
        let package = FileManager.default.temporaryDirectory.appendingPathComponent("host-module-\(UUID().uuidString)")
        for (path, content) in files {
            let url = package.appendingPathComponent(path)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try content.write(to: url, atomically: true, encoding: .utf8)
        }
        addTeardownBlock { try? FileManager.default.removeItem(at: package) }
        return package
    }

    private func makeModuleRequest(script: String, package: URL, isAsync: Bool = false, timeout: TimeInterval? = nil) -> OpenClipJSHost.Request {
        OpenClipJSHost.Request(
            actionID: "test.action",
            scriptCode: script,
            context: makeContext(),
            options: [],
            optionStore: optionStore,
            rules: ExtensionActionRules(),
            isAsync: isAsync,
            timeout: timeout,
            packageDirectory: package
        )
    }

    func testModulePackageRequiresLocalHelper() async throws {
        let package = try makeModulePackage([
            "lib/helper.js": "module.exports = { upper: function(s) { return s.toUpperCase(); } };"
        ])
        let script = "function action(text) { return require('./lib/helper.js').upper(text); }"
        let result = try await host.run(makeModuleRequest(script: script, package: package))
        guard case .copy(let text) = result else {
            return XCTFail("Expected .copy, got \(result)")
        }
        XCTAssertEqual(text, "HELLO")
    }

    func testCJSModuleExportsActionEntryForm() async throws {
        let package = try makeModulePackage([:])
        let script = "module.exports = { action: function(selection, options) { return 'cjs'; } };"
        let result = try await host.run(makeModuleRequest(script: script, package: package))
        guard case .copy(let text) = result else {
            return XCTFail("Expected .copy, got \(result)")
        }
        XCTAssertEqual(text, "cjs")
    }

    func testDirectFunctionExportEntryForm() async throws {
        let package = try makeModulePackage([:])
        let script = "module.exports = function action() { return 'direct'; };"
        let result = try await host.run(makeModuleRequest(script: script, package: package))
        guard case .copy(let text) = result else {
            return XCTFail("Expected .copy, got \(result)")
        }
        XCTAssertEqual(text, "direct")
    }

    func testModuleCacheAndSingletonAcrossRequires() async throws {
        let package = try makeModulePackage([
            "libB.js": "var n = (globalThis.__loads = (globalThis.__loads || 0) + 1); module.exports = { n: n };",
            "libA.js": "module.exports = { b: require('./libB.js') };"
        ])
        let script = """
        var a = require('./libA.js');
        var a2 = require('./libA.js');
        var b = require('./libB.js');
        function action() { return a.b.n + '|' + b.n + '|' + (a === a2) + '|' + (a.b === b); }
        """
        let result = try await host.run(makeModuleRequest(script: script, package: package))
        guard case .copy(let text) = result else {
            return XCTFail("Expected .copy, got \(result)")
        }
        XCTAssertEqual(text, "1|1|true|true")
    }

    func testModuleCycleResolvesWithPartialExports() async throws {
        let package = try makeModulePackage([
            "a.js": "module.exports.fromB = require('./b.js').name;",
            "b.js": "module.exports.name = 'bee'; module.exports.aLoaded = (typeof require('./a.js') === 'object');"
        ])
        let script = """
        var a = require('./a.js');
        function action() { return a.fromB + '|' + require('./b.js').aLoaded; }
        """
        let result = try await host.run(makeModuleRequest(script: script, package: package))
        guard case .copy(let text) = result else {
            return XCTFail("Expected .copy, got \(result)")
        }
        XCTAssertEqual(text, "bee|true")
    }

    func testMissingModuleShowsErrorStatus() async throws {
        let package = try makeModulePackage([:])
        let script = "function action() { require('./nope.js'); return 'x'; }"
        let result = try await host.run(makeModuleRequest(script: script, package: package))
        guard case .showStatus(let feedback) = result else {
            return XCTFail("Expected .showStatus, got \(result)")
        }
        XCTAssertEqual(feedback.style, .error)
        XCTAssertTrue(feedback.message.contains("Cannot find module"))
        XCTAssertTrue(feedback.message.contains("nope.js"))
    }

    func testNodeBuiltinRequireShowsErrorStatus() async throws {
        let package = try makeModulePackage([:])
        let script = "function action() { require('fs'); }"
        let result = try await host.run(makeModuleRequest(script: script, package: package))
        guard case .showStatus(let feedback) = result else {
            return XCTFail("Expected .showStatus, got \(result)")
        }
        XCTAssertEqual(feedback.style, .error)
        XCTAssertTrue(feedback.message.contains("Node builtin"))
        XCTAssertTrue(feedback.message.contains("fs"))
    }

    func testAsyncModulePackageResolvesHelper() async throws {
        let package = try makeModulePackage([
            "lib/up.js": "module.exports = { up: function(s) { return s.toUpperCase(); } };"
        ])
        let script = "module.exports = { action: async function(text) { return require('./lib/up.js').up(text); } };"
        let result = try await host.run(makeModuleRequest(script: script, package: package, isAsync: true))
        guard case .copy(let text) = result else {
            return XCTFail("Expected .copy, got \(result)")
        }
        XCTAssertEqual(text, "HELLO")
    }

    func testJavaScriptActionPerformThreadsPackageDirectory() async throws {
        let package = try makeModulePackage([
            "u.js": "module.exports = function(s) { return s.toUpperCase(); };"
        ])
        let action = JavaScriptAction(
            id: "pkg.main",
            title: "Pkg",
            iconSymbol: "terminal",
            scriptCode: "function action(t) { return require('./u.js')(t); }",
            options: [],
            chrome: nil,
            optionStore: MemoryOptionStore(),
            rules: nil,
            isAsync: false,
            packageDirectory: package
        )
        let result = try await action.perform(makeContext())
        guard case .copy(let text) = result else {
            return XCTFail("Expected .copy, got \(result)")
        }
        XCTAssertEqual(text, "HELLO")
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh OpenClipJSHostTests`
Expected: FAIL — `require` is not defined (`ReferenceError: Can't find variable: require`) surfaced as `.showStatus(.error)` for the module tests; `testJavaScriptActionPerformThreadsPackageDirectory` returns the error status instead of `.copy`.

- [ ] **Step 3: Write minimal implementation**

In `OpenClipJSHost.swift` `evaluate`, install the bridge block right after the existing effect blocks (after line 255, before `jsContext.setObject(openclip, ...)` at line 257):

```swift
        if let packageDirectory = request.packageDirectory {
            let resolveModuleBlock: @convention(block) (String, String) -> [String: Any] = { dirString, specifier in
                let requiringDirectory = URL(fileURLWithPath: dirString, isDirectory: true)
                do {
                    let resolved = try OpenClipModuleLoader.load(
                        specifier: specifier,
                        requiringDirectory: requiringDirectory,
                        packageRoot: packageDirectory
                    )
                    return [
                        "ok": true,
                        "path": resolved.url.path,
                        "dir": resolved.directoryURL.path,
                        "source": resolved.source
                    ]
                } catch let error as ModuleResolutionError {
                    return ["ok": false, "message": error.message]
                } catch {
                    return ["ok": false, "message": (error as NSError).localizedDescription]
                }
            }
            openclip.setObject(resolveModuleBlock, forKeyedSubscript: "__resolveModule" as NSString)
        }
```

> If JSC rejects the `[String: Any]` block return type at runtime (bridging to a JS object), fall back to returning a `JSValue` built with `JSValue(object:in:)` using a weakly-captured `jsContext`.

Replace the wrapper selection at line 269:

```swift
        let wrappedScript: String
        if let packageDirectory = request.packageDirectory {
            wrappedScript = request.isAsync
                ? asyncModuleWrappedScript(request.scriptCode, entryDirectory: packageDirectory.path)
                : syncModuleWrappedScript(request.scriptCode, entryDirectory: packageDirectory.path)
        } else {
            wrappedScript = request.isAsync ? asyncWrappedScript(request.scriptCode) : syncWrappedScript(request.scriptCode)
        }
        let jsResult = jsContext.evaluateScript(wrappedScript)
```

Add the wrapper functions next to `syncWrappedScript`/`asyncWrappedScript` (after line 451):

```swift
    /// Module-mode sync wrapper. The prelude runs at wrapper top level so `module`/`require` are
    /// visible to the entry `scriptCode`; dispatch prefers `module.exports` (function or
    /// `.action`/`.main`) and falls back to in-scope `action`/`main` for legacy single-file scripts.
    private static func syncModuleWrappedScript(_ scriptCode: String, entryDirectory: String) -> String {
        """
        \(modulePrelude(entryDirectory: entryDirectory))
        var selection = openclip.input.text;
        var options = openclip.options;
        \(scriptCode)
        (function() {
            var __entry;
            if (typeof module.exports === 'function') __entry = module.exports;
            else if (typeof module.exports.action === 'function') __entry = module.exports.action;
            else if (typeof module.exports.main === 'function') __entry = module.exports.main;
            else if (typeof action === 'function') __entry = action;
            else if (typeof main === 'function') __entry = main;
            if (__entry) return __entry(selection, options);
            return null;
        })();
        """
    }

    /// Module-mode async wrapper: same prelude/dispatch as the sync variant, but routes the entry
    /// through `__openclip_dispatch` so promise returns settle the bridge promise.
    private static func asyncModuleWrappedScript(_ scriptCode: String, entryDirectory: String) -> String {
        """
        var __openclip_dispatch = function(fn, selection, options) {
            var result;
            try {
                result = fn(selection, options);
            } catch (e) {
                openclip.__reject(e);
                return null;
            }
            if (result !== null && result !== undefined && typeof result.then === 'function') {
                result.then(
                    function(value) { openclip.__resolve(value); },
                    function(error) { openclip.__reject(error); }
                );
                return null;
            }
            openclip.__resolve(result);
            return null;
        };
        \(modulePrelude(entryDirectory: entryDirectory))
        var selection = openclip.input.text;
        var options = openclip.options;
        \(scriptCode)
        (function() {
            var __entry;
            if (typeof module.exports === 'function') __entry = module.exports;
            else if (typeof module.exports.action === 'function') __entry = module.exports.action;
            else if (typeof module.exports.main === 'function') __entry = module.exports.main;
            else if (typeof action === 'function') __entry = action;
            else if (typeof main === 'function') __entry = main;
            if (__entry) return __openclip_dispatch(__entry, selection, options);
            openclip.__resolve(null);
            return null;
        })();
        """
    }

    /// Module scaffolding: per-run cache (cache-first so cycles get partial exports) and a
    /// per-directory `require` bound via `__require.bind(null, dir)` so nested requires resolve
    /// relative to the requiring file (Node semantics). `__dirname` is the entry directory.
    private static func modulePrelude(entryDirectory: String) -> String {
        let escaped = entryDirectory
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
        return """
        var __moduleCache = {};
        var __require = function(dir, specifier) {
            var r = openclip.__resolveModule(dir, specifier);
            if (!r.ok) throw new Error(r.message);
            if (__moduleCache[r.path] !== undefined) return __moduleCache[r.path];
            var m = { exports: {} };
            __moduleCache[r.path] = m.exports;
            (new Function('require', 'module', 'exports', '__dirname', r.source))(__require.bind(null, r.dir), m, m.exports, r.dir);
            return m.exports;
        };
        var require = __require.bind(null, "\(escaped)");
        var module = { exports: {} };
        var exports = module.exports;
        var __dirname = "\(escaped)";
        """
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh OpenClipJSHostTests`
Expected: PASS (all module tests + existing host tests). Then run `./scripts/test.sh NewExtensionKindTests` to confirm Task 2 still passes.

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/Runtimes/OpenClipJSHost.swift Tests/OpenClipTests/OpenClipJSHostTests.swift
git commit -m "feat(js): module bridge + wrappers for require() in file scripts"
```

---

### Task 4: `validate_extension.sh` — require-target and npm-build checks

**Files:**
- Modify: `scripts/validate_extension.sh` (after the missing-script-file loop at line ~162, before the final `echo` at line 164)

**Interfaces:**
- Consumes: nothing from earlier tasks (mirrors the loader's rules best-effort).
- Produces: exit-1 errors for missing require targets and unbuilt npm packages; a warning for stale builds. Consumed by Task 5's scaffold smoke check.

- [ ] **Step 1: Write the failing check** (this task's "test" is a shell invocation)

Build throwaway fixtures under `/var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures`:

```bash
mkdir -p /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/badrequire
cat > /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/badrequire/openclip.json <<'EOF'
{ "identifier": "com.test.badreq", "name": "BadReq", "action": { "title": "B", "type": "javascript", "script": "main.js" } }
EOF
cat > /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/badrequire/main.js <<'EOF'
function action(t) { return require('./missing.js').x(t); }
EOF
mkdir -p /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/unbuilt
cat > /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/unbuilt/openclip.json <<'EOF'
{ "identifier": "com.test.unbuilt", "name": "Unbuilt", "action": { "title": "U", "type": "javascript", "script": "dist/main.js" } }
EOF
echo '{}' > /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/unbuilt/package.json
mkdir -p /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/stale
cat > /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/stale/openclip.json <<'EOF'
{ "identifier": "com.test.stale", "name": "Stale", "action": { "title": "S", "type": "javascript", "script": "dist/main.js" } }
EOF
cat > /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/stale/package.json <<'EOF'
{ "name": "stale", "private": true }
EOF
mkdir -p /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/stale/dist
cat > /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/stale/dist/main.js <<'EOF'
function action(t) { return t; }
EOF
touch /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/stale/package.json
sleep 1
touch -t 202001010000 /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/stale/dist/main.js
./scripts/validate_extension.sh /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/badrequire
./scripts/validate_extension.sh /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/unbuilt
./scripts/validate_extension.sh /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/stale
```

Expected (before the change): `badrequire` and `stale` both exit 0 — the require target `missing.js` and the stale `dist/main.js` go unnoticed. `unbuilt` already exits 1 via the pre-existing missing-script-file loop (not the new check). **The plan's "failing test" is this current (wrong) behavior for `badrequire`/`stale`.**

- [ ] **Step 2: Run to confirm current behavior**

Run the commands above. Expected: `validate_extension: OK (…)` for `badrequire` and `stale`; `unbuilt` exits 1 with `references missing script file(s): dist/main.js` (pre-existing check, not the new npm check).

- [ ] **Step 3: Write the implementation**

In `scripts/validate_extension.sh`, insert before the final success `echo` (line 164):

```bash
# require() targets referenced by package .js files must exist inside the package.
# Best-effort: only string-literal './' / '../' specifiers are scanned; the host loader remains
# authoritative for resolution and containment.
MISSING_REQ=""
while IFS= read -r js_file; do
    [ -n "$js_file" ] || continue
    [ -f "$SRC_DIR/$js_file" ] || continue
    script_dir="$(dirname "$js_file")"
    while IFS= read -r spec; do
        [ -n "$spec" ] || continue
        target="$SRC_DIR/$script_dir/$spec"
        if [ -f "$target" ] || [ -f "$target.js" ] || { [ -d "$target" ] && [ -f "$target/index.js" ]; }; then
            continue
        fi
        MISSING_REQ="$MISSING_REQ $js_file -> require(\"$spec\")"
    done < <(grep -oE 'require\(\s*["'"'"']\.\.?/[^"'"'"']*["'"'"']' "$SRC_DIR/$js_file" | sed -E -e 's/^require\(\s*["'"'"']//' -e 's/["'"'"']\)?$//')
done < <(jq -r '[.. | objects | .script?] | map(select(type == "string" and length > 0)) | unique[]' "$MANIFEST")

if [ -n "$MISSING_REQ" ]; then
    echo "validate_extension: $MANIFEST references missing require() targets:$MISSING_REQ" >&2
    exit 1
fi

# npm bundles: package.json implies a build contract — dist/main.js must exist (error) and be
# newer than package.json / src/ (warning, hot-edit workflows exist).
if [ -f "$SRC_DIR/package.json" ]; then
    if [ ! -f "$SRC_DIR/dist/main.js" ]; then
        echo "validate_extension: $MANIFEST requires a build — run 'npm install && npm run build' in $SRC_DIR" >&2
        exit 1
    fi
    if [ "$SRC_DIR/dist/main.js" -ot "$SRC_DIR/package.json" ]; then
        echo "validate_extension: WARNING: dist/main.js is older than package.json — rebuild with 'npm run build'" >&2
    fi
    if find "$SRC_DIR/src" -type f \( -name '*.js' -o -name '*.ts' \) -newer "$SRC_DIR/dist/main.js" -print -quit 2>/dev/null | grep -q .; then
        echo "validate_extension: WARNING: src/ is newer than dist/main.js — rebuild with 'npm run build'" >&2
    fi
fi
```

- [ ] **Step 4: Run to verify it passes**

Run the same fixture commands again. Expected:
- `badrequire` exits 1 with `references missing require() targets ... require("missing.js")`.
- `unbuilt` exits 1 with `references missing script file(s): dist/main.js` — still the pre-existing missing-script check; the npm `requires a build` error branch is shadowed for manifest-referenced scripts and only fires for package.json-only packages with no dist/main.js.
- `stale` exits 0 and prints `WARNING: dist/main.js is older than package.json`.

Re-run a known-good package (`./scripts/validate_extension.sh Extensions/raw/…` or a scratch copy) — must still exit 0 with no warnings. Clean up the fixtures.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate_extension.sh
git commit -m "feat(scripts): validate require() targets and npm build state in validate_extension.sh"
```

---

### Task 5: `new_extension.sh --with-npm` scaffold (TypeScript + esbuild)

**Files:**
- Modify: `scripts/new_extension.sh`

**Interfaces:**
- Consumes: Task 4's validator (scaffold's post-write self-check).
- Produces: the `--with-npm` scaffold — `openclip.json`, `package.json`, `tsconfig.json`, `src/main.ts`, `src/openclip.d.ts`, `.gitignore`, `README.md`. Verified manually via `npm install && npm run build` + `validate_extension.sh`.

- [ ] **Step 1: Write the failing behavior** (scaffold flag does not exist)

Run: `./scripts/new_extension.sh Smoke --with-npm`
Expected (before the change): `Error: unknown flag: --with-npm`.

- [ ] **Step 2: Run to confirm current behavior**

Run the command above. Expected: the error above — the flag is missing.

- [ ] **Step 3: Write the implementation**

Update the header comment and `usage()` to document `--with-npm`. Add a flag variable near the top and parse it:

```bash
WITH_NPM=""
```

In the argument loop, before the `-h|--help` case:

```bash
        --with-npm)
            WITH_NPM="1"
            shift
            ;;
```

After the type/name validation and before the `case "$TYPE"` dispatch, enforce the flag contract:

```bash
if [[ -n "$WITH_NPM" ]]; then
    [[ -z "$TYPE" || "$TYPE" == "js" ]] || { echo "Error: --with-npm implies --type js (got '$TYPE')" >&2; exit 1; }
    TYPE="js"
fi
```

Replace the existing `js)` branch of the `case "$TYPE"` dispatch (currently lines 97-115) with a `js)` branch that dispatches to a plain or npm scaffold. Keep the plain `js` output byte-for-byte the same, and add the npm branch:

```bash
    js)
        if [[ -n "$WITH_NPM" ]]; then
            write_manifest <<EOF
{
  "identifier": "$IDENTIFIER",
  "name": "$NAME",
  "action": {
    "title": "$NAME",
    "icon": "function",
    "type": "javascript",
    "script": "dist/main.js"
  }
}
EOF
            write_file "package.json" <<EOF
{
  "name": "com-example-$SLUG",
  "version": "1.0.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "build": "esbuild src/main.ts --bundle --format=cjs --platform=browser --target=es2020 --outfile=dist/main.js",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "esbuild": "^0.28.0",
    "typescript": "^5.0.0"
  }
}
EOF
            write_file "tsconfig.json" <<'EOF'
{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "lib": ["es2020"],
    "skipLibCheck": true
  },
  "include": ["src"]
}
EOF
            write_file "src/main.ts" <<'EOF'
// OpenClip extension entry point. Build with: npm run build
// The bridge types (openclip, OpenClipAction) come from openclip.d.ts in this folder.
export const action: OpenClipAction = (selection, options) => {
  return selection.trim().toUpperCase();
};
EOF
            write_file "src/openclip.d.ts" <<'EOF'
// openclip.d.ts — Ambient type declarations for OpenClip JS extension authoring.
// The runtime does NOT consume this file; it exists so editors and `tsc --noEmit` understand
// the `openclip.*` bridge and the entry signature.

interface OpenClipApp {
  bundleID: string;
  name: string;
}

interface OpenClipInput {
  text: string;
  matchedText: string;
  captures: string[];
  app: OpenClipApp;
  isSecondaryClick: boolean;
}

type OpenClipOptionValue = string | boolean;

interface OpenClipOptions {
  [identifier: string]: OpenClipOptionValue;
}

interface OpenClipStatusRequest {
  reason?: string;
  missing?: string[];
}

interface OpenClipFetchResponse {
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

interface OpenClipBridge {
  readonly input: OpenClipInput;
  readonly options: OpenClipOptions;
  option(id: string): OpenClipOptionValue | undefined;
  paste(text: string): void;
  copy(text: string): void;
  cut(): void;
  openURL(url: string): void;
  keyPress(key: string, modifiers?: string[]): void;
  runShortcut(name: string, input?: string): void;
  notify(title: string, body: string): void;
  shareService(identifier: string, text?: string): void;
  showStatus(message: string, style?: 'success' | 'error' | 'info'): void;
  requireConfiguration(request: OpenClipStatusRequest): void;
  fetch(url: string, options?: Record<string, unknown>): Promise<OpenClipFetchResponse>;
}

declare const openclip: OpenClipBridge;

type OpenClipAction = (selection: string, options: OpenClipOptions) => string | void | Promise<string | void>;
EOF
            write_file ".gitignore" <<'EOF'
node_modules/
EOF
            write_file "README.md" <<EOF
# $NAME

OpenClip extension scaffolded with \`--with-npm\`. TypeScript entry at \`src/main.ts\`; the
manifest points at the bundled \`dist/main.js\`.

## Build contract

The shipped artifact is \`dist/main.js\` (the manifest's \`script\`). Always rebuild before installing:

    npm install        # once
    npm run build      # after every edit to src/

Install (after build):

    ./scripts/install_extension.sh <this-folder>
EOF
            echo "note: npm scaffold is validated post-build — run 'npm install && npm run build' before install_extension.sh"
        else
            write_manifest <<EOF
{
  "identifier": "$IDENTIFIER",
  "name": "$NAME",
  "action": {
    "title": "$NAME",
    "icon": "function",
    "type": "javascript",
    "script": "main.js"
  }
}
EOF
            write_file "main.js" <<'EOF'
function action(text) {
  return text.trim().toUpperCase();
}
EOF
        fi
        ;;
```

The npm scaffold must **skip the script's own post-write validation** (it would fail the new Task 4 `dist/main.js` check before a build exists). Change the final self-check (currently lines 159-162) to run only for non-npm scaffolds:

```bash
if [[ -z "$WITH_NPM" ]] && ! "$BASE_DIR/scripts/validate_extension.sh" "$DEST_DIR"; then
    rm -rf "$DEST_DIR"
    exit 1
fi
```

- [ ] **Step 4: Run to verify it passes**

```bash
./scripts/new_extension.sh Smoke --with-npm
ls -R Extensions/raw/Smoke.openclipext
( cd Extensions/raw/Smoke.openclipext && npm install && npm run build )
./scripts/validate_extension.sh Extensions/raw/Smoke.openclipext
# esbuild safety guarantee still holds: a Node builtin import must hard-fail the browser build
( cd /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures \
  && printf "import fs from 'fs'; export const action = (s) => fs.readFileSync('/etc/hosts', 'utf8');" > node_test.ts \
  && /Users/ganesh/dev/openclip/Extensions/raw/Smoke.openclipext/node_modules/.bin/esbuild node_test.ts --bundle --format=cjs --platform=browser --target=es2020 --outfile=node_test.js 2>&1 | grep -q "Could not resolve" \
  && echo "builtin import rejected: OK" )
# cleanup
rm -rf Extensions/raw/Smoke.openclipext \
  /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/node_test.ts \
  /var/folders/td/vbvs8w_52435tfxh8tbw1fj80000gn/T/opencode/validate-fixtures/node_test.js
```

Expected: scaffold succeeds with all files (`package.json`, `tsconfig.json`, `src/main.ts`, `src/openclip.d.ts`, `.gitignore`, `README.md`, manifest pointing at `dist/main.js`), `npm run build` emits `dist/main.js`, `validate_extension.sh` exits 0, and the `fs` import fails esbuild with "Could not resolve".

> Note: the smoke command is long; if it's awkward in one invocation, run the scaffold, the npm build, the validate, and the esbuild negative check as separate commands, then clean up. Do not commit `Extensions/raw/Smoke.openclipext`.

- [ ] **Step 5: Commit**

```bash
git add scripts/new_extension.sh
git commit -m "feat(scripts): scaffold npm + TypeScript extensions with --with-npm"
```

---

### Task 6: Docs

**Files:**
- Modify: `docs/developer-guide/AGENTS.md`
- Create: `docs/developer-guide/extensions-modules.md`
- Modify: `docs/architecture/extensions.md`
- Modify: `docs/architecture/known-debt.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5 (the final behavior to document).
- Produces: nothing code depends on; this is the author-facing contract.

- [ ] **Step 1: Write `docs/developer-guide/extensions-modules.md`**

Cover, per the spec §5:
- The npm workflow: `./scripts/new_extension.sh Demo --with-npm`, `npm install`, `npm run build`, `./scripts/install_extension.sh …`.
- The build contract (dist/main.js is the shipped artifact; rebuild before install).
- TypeScript: supported in the **bundle path only** (esbuild transpiles `.ts`; the host loader runs `.js` only); optional `npm run typecheck`; `openclip.d.ts` lives in `src/`.
- A known-good pure-JS library list (lodash-style utilities, markdown/html parsers, slugify, date libs) — authors must bundle them.
- Explicit limitations box: no Node builtins (rejected at esbuild build); no `.node` native bindings; no DOM; mind the 30s watchdog; JSC's global set (`setTimeout`/`Buffer`) is not Node's — verify during implementation.
- esbuild shims section: `--define:process.env.NODE_ENV='"production"'`, `--external`, `--inject`/`--alias`.
- The local multi-file path (no build step): `require('./x.js')`, three entry forms, in-scope `module`/`exports`/`require`/`__dirname`, containment (package directory only), no bare/Node-builtin requires, no modules for inline `scriptCode`.

- [ ] **Step 2: Update `docs/developer-guide/AGENTS.md`**

Per spec §5:
- §3b javascript: multi-file via `require`, the three entry forms, in-scope `module`/`exports`/`require`/`__dirname`, package containment, no bare/Node-builtin requires, no modules for inline `scriptCode`.
- §7: note `require` availability for file scripts.
- §10: add the `--with-npm` workflow and the rebuild-before-install contract.
- §11: add "no `require` of bare/Node-builtin specifiers".
- §12: add `OpenClipModuleLoader` to the source-of-truth list.

- [ ] **Step 3: Update `docs/architecture/extensions.md` and `docs/architecture/known-debt.md`**

- `extensions.md`: note module containment — a script's filesystem reach is the package directory only (enforced by `OpenClipModuleLoader` + `Constants.isPathSafe`).
- `known-debt.md`: current-state note that JS file scripts now support CommonJS `require` for local files (npm via author-side esbuild), host loader is `.js`-only (TS is bundle-path only), and that the capability-gating sandbox remains future work.

- [ ] **Step 4: Verify**

Run `./scripts/test.sh --unit` to confirm the full suite still passes after the docs round (docs are not code, but this guards the previous tasks' changes as a whole).

- [ ] **Step 5: Commit**

```bash
git add docs/developer-guide/AGENTS.md docs/developer-guide/extensions-modules.md docs/architecture/extensions.md docs/architecture/known-debt.md
git commit -m "docs(js): document module importing, --with-npm scaffold, and TypeScript support"
```

---

## Verification

1. Full unit suite: `./scripts/test.sh --unit`
2. Targeted: `./scripts/test.sh OpenClipModuleLoaderTests` · `./scripts/test.sh NewExtensionKindTests` · `./scripts/test.sh OpenClipJSHostTests`
3. Build gate: `./scripts/dev_run.sh` (Debug build + launch; logs at /tmp/openclip.log)
4. Manual (local modules): author a two-file package (e.g. `main.js` requiring `./lib/helper.js`), `validate_extension.sh` then `install_extension.sh`, confirm hot reload and correct output.
5. Manual (npm): `./scripts/new_extension.sh Demo --with-npm`, `npm install && npm run build`, validate + install, confirm the bundled action runs; confirm a package importing `fs` fails `npm run build`.