# In-App Debug Log Store + `--dump-logs` CLI — Design

Status: **Design** (not yet reviewed). Date: 2026-08-09.

## 1. Overview

OpenClip already logs every subsystem through the single `Log` surface onto the unified log
(subsystem `com.openclip`). Debugging extensions currently requires external `log stream`/`log show`
tooling, which is flaky when the source process has exited, exposes privacy only partially, and is
awkward for agents. This design adds a small, in-process ring-buffer log store fed by `com.openclip`
logs, exposed to agents via a minimal `--dump-logs` CLI and to the test suite via injectable units.

**Primary goal (stated by the user): speed up agent development.** The store + tests give
deterministic, terminal-readable access to recent logs without depending on unified-log persistence;
the `--dump-logs` CLI gives a self-contained "did my extension load/reject?" check that works even
for a cold launch.

**Mechanism decision (A, not B).** The store is fed by reading the process's **own** unified log via
`OSLogStore(scope: .currentProcessIdentifier)` — *not* by hooking `Log`/`os.Logger`. Rationale,
empirically verified on this machine (Darwin, macOS 26.5 SDK):

- **In-process interception of `os.Logger` is not achievable.** `Logger` emits at the call site; the
  compiler rejects re-emitting a runtime message to any os call (`globalStringTablePointer builtin
  must be used only on string literals`), and `privacy:`-labeled interpolations like
  `\(x, privacy: .public)` type-check only directly against real `os_log`/`Logger` calls. So a
  facade that mirrors `Log`'s signature while keeping call sites byte-identical cannot forward to
  os. A `LogMessage` custom-interpolation facade compiles but restructures `Core/Log.swift`,
  changes os-emission privacy semantics, and introduces fragile machinery — rejected.
- **`OSLogStore` readback works for a live process on this machine.** A compiled, running binary
  read its own `com.openclip.*` lines at ~1.2 s latency with zero drops across 14 consecutive
  probes, preserving privacy fidelity (`privacy: .public`/`.auto` values readable, `.private`
  redacted as `<private>`). The earlier "`log show` returned zero lines" report is a post-exit
  artifact: interpreter/`swift`-script processes die before persistence, and readback fails after
  the source process is gone. Reading while the app runs works.
- Zero changes to `Sources/Core/`; call sites stay byte-identical; zero per-call overhead; the
  store is 100% App target.

**Scope decision.** No Preferences/About UI. The surface is a minimal `--dump-logs` CLI plus a
unit-testable store. (A human-facing viewer remains a possible follow-up.)

## 2. Non-goals

- **No Preferences tab, no About-tab section, no SwiftUI log viewer.**
- **No changes to `Sources/Core/`.** `Log` enum, all call sites, and privacy annotations are
  untouched.
- **No readback of other processes.** `OSLogStore(scope: .currentProcessIdentifier)` only.
- **No persistence of the buffer.** The ring buffer is session-only memory.
- **No live tail.** `--dump-logs` captures what the *current* process logs before exit. Live
  tailing a running app remains `log stream` / `log show` (documented in `docs/logging.md`).
- **No hot-path involvement.** The poller runs at 1 s cadence on a background queue; `Log` never
  logs in hot paths (unchanged), so the buffer is never fed mouse-move spam by construction.
- **No `.private` bypass.** Values the log system redacts (`<private>`) stay redacted in the
  buffer; values marked `privacy: .public` show in full — which is why extension rejection lines
  (path + details are `.public`) are visible.

## 3. Architecture

All new files live in `Sources/OpenClip/` (App target). No public API changes anywhere.

```
Platform/DebugLogging/
  DebugLogEntry.swift      # DebugLogEntry model + DebugLogLevel enum
  DebugLogBuffer.swift     # thread-safe fixed-capacity ring buffer (@unchecked Sendable + NSLock)
  DebugLogReader.swift     # protocol LogReading + UnifiedLogReader (OSLogStore impl) + cursor logic
  DebugLogStore.swift      # final class, @unchecked Sendable, owns reader+buffer+1s poll; .shared; injectable init
  DebugLogFilter.swift     # pure filter struct (category?/level?/count?), newest-first
  DebugLogCommand.swift    # CommandLine parsing for --dump-logs + formatter + exit path
Tests/OpenClipTests/
  DebugLogBufferTests.swift
  DebugLogFilterTests.swift
  DebugLogStoreTests.swift
  DebugLogEndToEndTests.swift
```

**Data flow.** `Log.extensions.error("…")` → os unified log (`com.openclip`) →
`UnifiedLogReader` polls `OSLogStore(scope: .currentProcessIdentifier)` every **1 s**, filtering
`subsystem == "com.openclip"` → maps `OSLogEntryLog` → `DebugLogEntry` → `DebugLogBuffer`
(capacity **500**, evicts oldest). The CLI (or a test) reads `DebugLogStore.snapshot()`.

### 3.1 `DebugLogEntry` / `DebugLogLevel`

- `DebugLogEntry`: `id: Int` (a per-process monotonically increasing sequential index assigned by
  the buffer at append time — stable for display keys), `date: Date`, `category: String`,
  `level: DebugLogLevel`, `message: String`. `Equatable`.
- `DebugLogLevel`: mirrors `OSLogEntryLog.Level` — `undefined, debug, info, notice, error, fault`
  — with a `rawValue: Int` mapping for direct conversion and a `displayName`/`rank` for filtering.

### 3.2 `DebugLogBuffer`

- `final class DebugLogBuffer: @unchecked Sendable`, `NSLock`-protected, fixed capacity (default
  500).
- API: `append(_ entry:)`, `snapshot() -> [DebugLogEntry]` (chronological order),
  `clear()`, `count`.
- On overflow, the oldest entries are dropped (ring semantics). Order stays chronological.
- Thread-safe by construction: any queue may call it.

### 3.3 `LogReading` protocol + `UnifiedLogReader`

```swift
protocol LogReading: Sendable {
    /// Returns entries strictly after `cursor` (nil = since last reset), oldest→newest.
    func read(after cursor: Date?, limit: Int) throws -> [DebugLogEntry]
}
```

- `UnifiedLogReader: LogReading` (`final class`, `@unchecked Sendable`), owns
  `OSLogStore(scope: .currentProcessIdentifier)` created in `init`; reads forward from a
  `position(date:)` derived from `cursor`; applies predicate `subsystem == "com.openclip"`;
  excludes entries with `entry.date <= cursor` to avoid dupes; caps at `limit`.
- Mapping: `DebugLogEntry(date: e.date, category: e.category, level: DebugLogLevel(e.level), message: e.composedMessage)`.
- Small review note: reading is I/O-light for the "since last poll" window; it runs on the store's
  background queue, never the main thread.

### 3.4 `DebugLogStore`

- `final class DebugLogStore: @unchecked Sendable`, NOT an `ObservableObject` (no UI today).
- Holds `reader: any LogReading`, `buffer: DebugLogBuffer`, `pollInterval: TimeInterval` (1 s),
  `capacity` (500), plus a repeating poll mechanism on a **dedicated serial background queue /
  dispatch source** (Swift 6 strict-concurrency-clean; no `@MainActor` requirement).
- `start()`: begins polling; each tick reads `reader.read(after:)`, appends to buffer.
- `stop()`: cancels polling.
- `snapshot() -> [DebugLogEntry]` (thread-safe), `entries(matching: DebugLogFilter) -> [DebugLogEntry]`.
- `.shared` singleton for production wiring; `init(reader:buffer:pollInterval:)` for tests so unit
  tests never touch `.shared` (no `TestIsolation` coupling).
- Polling must not run on main; appends happen through the (locked) buffer.

### 3.5 `DebugLogFilter`

- Pure value struct: `category: String?`, `level: DebugLogLevel?`, `count: Int?`
  (`count = 0/absent` means no cap).
- `apply(to: [DebugLogEntry]) -> [DebugLogEntry]`: newest-first, filtered by category (exact match)
  and level, capped at `count`.

### 3.6 `DebugLogCommand` (CLI)

Parses `CommandLine.arguments` and returns a modes enum:

- `case dumpLogs(DumpOptions)` for `--dump-logs`
- `case none` otherwise (normal app launch)

`DumpOptions`: `category: String?`, `level: DebugLogLevel?`, `count: Int?` (default 500),
`collectSeconds: Double` (default 4).

Broken flag syntax = print usage to stdout and `exit(2)`. `--help` prints usage and `exit(0)`.

## 4. CLI contract

```
OpenClip --dump-logs [--category=<name>] [--level=<error|fault|notice|info|debug>]
                     [--count=<N>] [--collect=<seconds>]
```

Behavior on `--dump-logs`:

1. `applicationDidFinishLaunching` detects the mode **before** any UI/replacement initialization.
2. Status bar, hotkey manager, selection monitor, and onboarding are all **skipped**.
3. The normal startup `Task` **still runs** `ActionCoordinator.shared.loadInitialState()` (plus the
   builtin registrations), because that is precisely where extension load/rejection lines are
   logged — the primary agent use case.
4. `DebugLogStore.shared.start()` is called before step 3's `Task`, and the poller begins.
5. Wait `collectSeconds` (default 4; the observed readback latency is ~1.2 s, so 4 s captures the
   full startup burst).
6. Print filtered snapshot: one line per entry,
   `YYYY-MM-DD HH:mm:ss.SSS <level> <category> <message>` (monospaced, `privacy`-decoded values as
   reported by `composedMessage`).
7. `exit(0)`.

Raw exit codes: `0` success, `2` usage error. No window ever appears (LSUIElement).

## 5. App wiring

- `AppDelegate.applicationDidFinishLaunching`:
  - `let mode = DebugLogCommand.parse(CommandLine.arguments)`
  - if `.none`: existing behavior (plus `DebugLogStore.shared.start()` added near the top).
  - if `.dumpLogs`: skip UI setup, run startup Task + store, schedule the delayed dump task,
    then `exit(0)`.
- `run` files are added under `Sources/OpenClip/` → **`xcodegen generate` is mandatory** after adding
  the new Swift files (AGENTS.md §5.1).

## 6. Testing

- `DebugLogBufferTests` — chronological order, capacity eviction (oldest dropped), `clear()`,
  concurrent appends from multiple queues (no crash, exact count).
- `DebugLogFilterTests` — category filter, level filter, count cap, newest-first ordering, empty
  filter = identity.
- `DebugLogStoreTests` — fake `LogReading` (scripted entries, then a thrown error mid-stream):
  poll → snapshot contents/order; a reader error does not kill the poll loop; `stop()` halts
  further reads; `.snapshot()`/`entries(matching:)` respect the buffer contents.
- `DebugLogEndToEndTests` — real `UnifiedLogReader` in the test runner's own process:
  `Log.extensions.error("E2E marker <unique>")`, wait for one poll, assert the store contains a
  line whose message contains the marker. This exercises the full store path (os write → readback
  → buffer) deterministically, with no `~/.openclip` or app-singleton dependency.
- Test isolation: store tests construct their own `DebugLogStore(reader:buffer:)`; `.shared` is
  never used by tests, so `TestIsolation.reset()` is not involved for this feature.

## 7. Verification

1. `xcodegen generate`
2. Build gate: `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
3. Full suite: `timeout -k 10 60 ./scripts/test.sh`
4. Manual/agent check (the task's verification, now CLI-based):
   - Place a manifest that fails validation (e.g. missing a required field) in
     `~/.openclip/extensions/`.
   - Run the Debug build binary directly:
     `"$(find ~/Library/Developer/Xcode/DerivedData/OpenClip-*/Build/Products/Debug -name OpenClip.app | head -n1)/Contents/MacOS/OpenClip" --dump-logs --collect=4`
   - Expect stdout to contain `Extension manifest rejected at <path>: <details>` (both fields are
     `privacy: .public`, so they read in full).
   - Also verify `--level=error`, `--category=extensions`, `--count=20` narrow output appropriately,
     and `--help` exits 0.

## 8. Risks & open items

- **OSLogStore cross-machine/live behavior.** Readback was verified on this machine (macOS 26.5
  SDK, compiled binary, live process, ~1.2 s latency, zero drops). Behavior on other macOS versions
  is unverified; the `LogReading` seam keeps a swap possible (e.g. in-process sink on a later
  iteration) without touching callers. The E2E test will catch regressions on CI machines.
- **Hardened runtime (ENABLE_HARDENED_RUNTIME) / non-sandboxed.** No entitlement should be needed
  for `.currentProcessIdentifier`; confirmed working in a plain compiled binary. If the packaged
  app exhibits a difference, the build gate + manual verification will surface it.
- **Swift 6 strict concurrency.** `@unchecked Sendable` boundaries must be minimal and documented
  (buffer, reader, store). The poll must not run on main. No `@MainActor` on the store.
- **`composedMessage` fidelity.** Readback reflects os-privacy decoding: `.public`/`.auto` values
  show in full, `.private` shows `<private>` — same as external tooling. That is intended.