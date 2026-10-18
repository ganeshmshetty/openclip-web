# Debug Log Store + `--dump-logs` CLI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an App-target ring-buffer store fed by `com.openclip` unified-log readback, plus a minimal `--dump-logs` CLI and tests, so agents and developers can inspect recent OpenClip logs (`Log` output) deterministically from a terminal or the test suite — with zero changes to `Sources/Core/`.

**Architecture:** A background poller reads the process's own unified log via `OSLogStore(scope: .currentProcessIdentifier)`, filters `subsystem == "com.openclip"`, maps `OSLogEntryLog` → `DebugLogEntry`, and appends to a thread-safe 500-entry ring buffer. `--dump-logs` cold-launches the app, runs the normal startup (extension load/rejections), collects for a few seconds, prints the filtered buffer to stdout, and exits. All new code lives in `Sources/OpenClip/`; `Log` and all its call sites are untouched.

**Tech Stack:** Swift 6 (strict concurrency complete), AppKit/SwiftUI app target, `os` / `OSLog` framework readback, `DispatchSourceTimer` polling, XCTest.

## Global Constraints

- **No changes to `Sources/Core/`** — `Log.swift` and all `Log.<category>.level(...)` call sites are byte-identical. Verified mechanism: `OSLogStore(scope: .currentProcessIdentifier)` readback works on this machine (~1.2 s latency, zero drops, privacy fidelity); in-process `os.Logger` interception is compiler-impossible.
- **Deployment target macOS 14.0+**; Swift 6.0; `SWIFT_STRICT_CONCURRENCY: complete`. `@unchecked Sendable` only on the buffer/reader/store, documented inline.
- **Never poll/read on the main thread.** The poll runloop lives on a dedicated serial `DispatchQueue`.
- **`xcodegen generate` is mandatory** after adding/removing any `.swift` file in `Sources/` or `Tests/` (AGENTS.md §5.1).
- **Log through `Log`, never `print()` in app code** (the CLI dump is the one intentional stdout write — it is the feature).
- **No `.shared` use in tests**; tests construct stores with injected fakes (`no TestIsolation` coupling).
- **Readback privacy is preserved**: `privacy: .public`/`.auto` values read in full; `.private` shows as `<private>` (intended, same as external tooling).
- Every code task ends with a **commit** (frequent commits; small, focused).

---

### Task 1: `DebugLogLevel` + `DebugLogEntry` — domain model

**Files:**
- Create: `Sources/OpenClip/Platform/DebugLogging/DebugLogLevel.swift`, `Sources/OpenClip/Platform/DebugLogging/DebugLogEntry.swift`
- Test: `Tests/OpenClipTests/DebugLogEntryTests.swift`

**Interfaces:**
- Consumes: `OSLogEntryLog.Level` (OSLog framework).
- Produces:
  - `DebugLogLevel: Int, CaseIterable, Comparable, Equatable` — cases `undefined, debug, info, notice, error, fault`; `init(_ level: OSLogEntryLog.Level)`; `var displayName: String`.
  - `DebugLogEntry: Equatable` — `let id: Int`, `let date: Date`, `let category: String`, `let level: DebugLogLevel`, `let message: String`; `init(id: Int = 0, date: Date, category: String, level: DebugLogLevel, message: String)`.

- [ ] **Step 1: Write the failing tests**

`Tests/OpenClipTests/DebugLogEntryTests.swift`:

```swift
import XCTest
import OSLog
@testable import OpenClip

final class DebugLogEntryTests: XCTestCase {
    func testLevelMapsFromOSLogEntryLevel() {
        XCTAssertEqual(DebugLogLevel(OSLogEntryLog.Level(rawValue: 0) ?? .undefined), .undefined)
        XCTAssertEqual(DebugLogLevel(OSLogEntryLog.Level(rawValue: 1) ?? .undefined), .debug)
        XCTAssertEqual(DebugLogLevel(OSLogEntryLog.Level(rawValue: 2) ?? .undefined), .info)
        XCTAssertEqual(DebugLogLevel(OSLogEntryLog.Level(rawValue: 3) ?? .undefined), .notice)
        XCTAssertEqual(DebugLogLevel(OSLogEntryLog.Level(rawValue: 4) ?? .undefined), .error)
        XCTAssertEqual(DebugLogLevel(OSLogEntryLog.Level(rawValue: 5) ?? .undefined), .fault)
        XCTAssertEqual(DebugLogLevel(OSLogEntryLog.Level(rawValue: 99) ?? .undefined), .undefined)
    }

    func testLevelDisplayNames() {
        XCTAssertEqual(DebugLogLevel.error.displayName, "error")
        XCTAssertEqual(DebugLogLevel.debug.displayName, "debug")
    }

    func testLevelIsComparableBySeverity() {
        XCTAssertLessThan(DebugLogLevel.debug, DebugLogLevel.error)
        XCTAssertLessThan(DebugLogLevel.notice, DebugLogLevel.fault)
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogEntryTests`
Expected: FAIL — `DebugLogLevel` / `DebugLogEntry` not found.

- [ ] **Step 3: Write the implementation**

`Sources/OpenClip/Platform/DebugLogging/DebugLogLevel.swift`:

```swift
// DebugLogLevel.swift
// OpenClip
//
// Severity level of a captured debug log entry, mirrored from OSLogEntryLog.Level.
import OSLog

/// Severity of a captured `Log` entry. `rawValue` matches `OSLogEntryLog.Level`.
enum DebugLogLevel: Int, CaseIterable, Comparable, Equatable {
    case undefined
    case debug
    case info
    case notice
    case error
    case fault

    init(_ level: OSLogEntryLog.Level) {
        self = DebugLogLevel(rawValue: level.rawValue) ?? .undefined
    }

    static func < (lhs: DebugLogLevel, rhs: DebugLogLevel) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    var displayName: String {
        switch self {
        case .undefined: return "undefined"
        case .debug: return "debug"
        case .info: return "info"
        case .notice: return "notice"
        case .error: return "error"
        case .fault: return "fault"
        }
    }
}
```

`Sources/OpenClip/Platform/DebugLogging/DebugLogEntry.swift`:

```swift
// DebugLogEntry.swift
// OpenClip
//
// One captured log line: timestamp, subsystem category, level, and decoded message.
import Foundation

/// A single captured `Log` line. `id` is a per-process sequential index assigned at
/// append time by `DebugLogBuffer`; readers pass `id: 0`.
struct DebugLogEntry: Equatable {
    let id: Int
    let date: Date
    let category: String
    let level: DebugLogLevel
    let message: String

    init(id: Int = 0, date: Date, category: String, level: DebugLogLevel, message: String) {
        self.id = id
        self.date = date
        self.category = category
        self.level = level
        self.message = message
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogEntryTests`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/DebugLogging/DebugLogLevel.swift Sources/OpenClip/Platform/DebugLogging/DebugLogEntry.swift Tests/OpenClipTests/DebugLogEntryTests.swift
git commit -m "feat: add debug log entry model and level types"
```

---

### Task 2: `DebugLogBuffer` — thread-safe capacity-capped ring buffer

**Files:**
- Create: `Sources/OpenClip/Platform/DebugLogging/DebugLogBuffer.swift`
- Test: `Tests/OpenClipTests/DebugLogBufferTests.swift`

**Interfaces:**
- Consumes: `DebugLogEntry` (Task 1).
- Produces: `DebugLogBuffer` — `init(capacity: Int)`, `@discardableResult func append(_ entry: DebugLogEntry) -> DebugLogEntry`, `func append(contentsOf: [DebugLogEntry])`, `func snapshot() -> [DebugLogEntry]`, `func clear()`, `var count: Int`.

- [ ] **Step 1: Write the failing test**

`Tests/OpenClipTests/DebugLogBufferTests.swift`:

```swift
import XCTest
@testable import OpenClip

private func makeEntry(_ n: Int) -> DebugLogEntry {
    DebugLogEntry(id: 0, date: Date(timeIntervalSince1970: Double(n)), category: "test", level: .info, message: "m\(n)")
}

final class DebugLogBufferTests: XCTestCase {
    func testAppendsStayChronological() {
        let buffer = DebugLogBuffer(capacity: 10)
        buffer.append(makeEntry(1))
        buffer.append(makeEntry(2))
        buffer.append(makeEntry(3))
        XCTAssertEqual(buffer.snapshot().map(\.message), ["m1", "m2", "m3"])
    }

    func testCapacityEvictsOldest() {
        let buffer = DebugLogBuffer(capacity: 3)
        for n in 1...5 { buffer.append(makeEntry(n)) }
        XCTAssertEqual(buffer.snapshot().map(\.message), ["m3", "m4", "m5"])
        XCTAssertEqual(buffer.count, 3)
    }

    func testAppendAssignsStableSequentialIDs() {
        let buffer = DebugLogBuffer(capacity: 10)
        buffer.append(makeEntry(1))
        buffer.append(makeEntry(2))
        buffer.append(makeEntry(3))
        XCTAssertEqual(buffer.snapshot().map(\.id), [0, 1, 2])
    }

    func testClearEmpties() {
        let buffer = DebugLogBuffer(capacity: 10)
        buffer.append(makeEntry(1))
        buffer.clear()
        XCTAssertTrue(buffer.snapshot().isEmpty)
    }

    func testAppendContentsOf() {
        let buffer = DebugLogBuffer(capacity: 10)
        let batch = [DebugLogEntry(date: .distantPast, category: "t", level: .debug, message: "a"),
                     DebugLogEntry(date: .distantPast, category: "t", level: .debug, message: "b")]
        buffer.append(contentsOf: batch)
        XCTAssertEqual(buffer.snapshot().map(\.message), ["a", "b"])
    }

    func testConcurrentAppendsAreSafe() {
        let buffer = DebugLogBuffer(capacity: 10_000)
        let group = DispatchGroup()
        let queue = DispatchQueue(label: "concurrent.buffer.test", attributes: .concurrent)
        for t in 0..<8 {
            queue.async(group: group) {
                for n in 0..<100 { buffer.append(makeEntry(t * 100 + n)) }
            }
        }
        group.wait()
        XCTAssertEqual(buffer.count, 800)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogBufferTests`
Expected: compile failure — `DebugLogBuffer` type not found.

- [ ] **Step 3: Write minimal implementation**

`Sources/OpenClip/Platform/DebugLogging/DebugLogBuffer.swift`:

```swift
// DebugLogBuffer.swift
// OpenClip
//
// Thread-safe fixed-capacity ring buffer for recent UnifiedLog entries.
// Sole storage for the in-process debug log store (App target only).
import Foundation

/// Thread-safe, capacity-capped log entry store. Oldest entries are evicted on overflow.
/// Safe to call from any queue (NSLock-guarded).
final class DebugLogBuffer: @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [DebugLogEntry] = []
    private var nextID = 0
    private let capacity: Int

    init(capacity: Int) {
        self.capacity = max(1, capacity)
    }

    /// Appends an entry, assigning a stable sequential `id`, evicting the oldest beyond capacity.
    @discardableResult
    func append(_ entry: DebugLogEntry) -> DebugLogEntry {
        lock.lock(); defer { lock.unlock() }
        let ided = DebugLogEntry(
            id: nextID,
            date: entry.date,
            category: entry.category,
            level: entry.level,
            message: entry.message
        )
        nextID += 1
        storage.append(ided)
        if storage.count > capacity {
            storage.removeFirst(storage.count - capacity)
        }
        return ided
    }

    func append(contentsOf entries: [DebugLogEntry]) {
        for entry in entries { append(entry) }
    }

    /// Chronological snapshot (oldest → newest).
    func snapshot() -> [DebugLogEntry] {
        lock.lock(); defer { lock.unlock() }
        return storage
    }

    func clear() {
        lock.lock(); defer { lock.unlock() }
        storage.removeAll()
    }

    var count: Int {
        lock.lock(); defer { lock.unlock() }
        return storage.count
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogBufferTests`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/DebugLogging/DebugLogBuffer.swift Tests/OpenClipTests/DebugLogBufferTests.swift
git commit -m "feat: add thread-safe ring-buffer log store (DebugLogBuffer)"
```

---

### Task 3: `DebugLogFilter` — pure filtering

**Files:**
- Create: `Sources/OpenClip/Platform/DebugLogging/DebugLogFilter.swift`
- Test: `Tests/OpenClipTests/DebugLogFilterTests.swift`

**Interfaces:**
- Consumes: `DebugLogEntry`, `DebugLogLevel` (Task 1).
- Produces: `struct DebugLogFilter: Equatable` — `var category: String?`, `var level: DebugLogLevel?`, `var count: Int?`; `func apply(to entries: [DebugLogEntry]) -> [DebugLogEntry]`.

- [ ] **Step 1: Write the failing tests**

`Tests/OpenClipTests/DebugLogFilterTests.swift`:

```swift
import XCTest
@testable import OpenClip

final class DebugLogFilterTests: XCTestCase {
    private func entry(_ n: Int, category: String, level: DebugLogLevel) -> DebugLogEntry {
        DebugLogEntry(id: 0, date: Date(timeIntervalSince1970: Double(n)), category: category, level: level, message: "m\(n)")
    }

    func testEmptyFilterIsIdentityOldestToNewest() {
        let entries = [entry(1, category: "a", level: .info), entry(2, category: "b", level: .error)]
        let out = DebugLogFilter().apply(to: entries)
        XCTAssertEqual(out, entries) // no category/level/count filter + empty input order preserved
    }

    func testFilterByCategory() {
        let entries = [
            entry(1, category: "extensions", level: .info),
            entry(2, category: "ai", level: .info),
            entry(3, category: "extensions", level: .error),
        ]
        let out = DebugLogFilter(category: "extensions").apply(to: entries)
        XCTAssertEqual(out.count, 2)
        XCTAssertTrue(out.allSatisfy { $0.category == "extensions" })
    }

    func testFilterByLevel() {
        let entries = [
            entry(1, category: "a", level: .info),
            entry(2, category: "b", level: .error),
            entry(3, category: "c", level: .error),
        ]
        let out = DebugLogFilter(level: .error).apply(to: entries)
        XCTAssertEqual(out.count, 2)
        XCTAssertTrue(out.allSatisfy { $0.level == .error })
    }

    func testNewestFirstOrdering() {
        let entries = [entry(1, category: "a", level: .info),
                       entry(2, category: "a", level: .info),
                       entry(3, category: "a", level: .info)]
        let out = DebugLogFilter().apply(to: entries)
        XCTAssertEqual(out.map(\.message), ["m3", "m2", "m1"])
    }

    func testCountCap() {
        let entries = (1...10).map { entry($0, category: "a", level: .info) }
        let out = DebugLogFilter(count: 3).apply(to: entries)
        XCTAssertEqual(out.map(\.message), ["m10", "m9", "m8"])
    }

    func testCountZeroMeansNoCap() {
        let entries = (1...10).map { entry($0, category: "a", level: .info) }
        let out = DebugLogFilter(count: 0).apply(to: entries)
        XCTAssertEqual(out.count, 10)
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogFilterTests`
Expected: FAIL — `DebugLogFilter` not found.

- [ ] **Step 3: Write the implementation**

`Sources/OpenClip/Platform/DebugLogging/DebugLogFilter.swift`:

```swift
// DebugLogFilter.swift
// OpenClip
//
// Pure filter over captured log entries: category, level, and newest-first count cap.
import Foundation

/// Newest-first filter for the debug log store. `nil` fields mean "no constraint";
/// `count == nil || count == 0` means "no cap".
struct DebugLogFilter: Equatable {
    var category: String?
    var level: DebugLogLevel?
    var count: Int?

    func apply(to entries: [DebugLogEntry]) -> [DebugLogEntry] {
        var result = entries.filter { entry in
            (category == nil || entry.category == category) &&
            (level == nil || entry.level == level)
        }
        result.reverse()
        if let count, count > 0, result.count > count {
            result.removeSubrange(count...)
        }
        return result
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogFilterTests`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/DebugLogging/DebugLogFilter.swift Tests/OpenClipTests/DebugLogFilterTests.swift
git commit -m "feat: add pure debug-log filter"
```

---

### Task 4: `LogReading` protocol + `UnifiedLogReader`

**Files:**
- Create: `Sources/OpenClip/Platform/DebugLogging/DebugLogReader.swift`
- (No dedicated unit test — the reader is thin over `OSLogStore`; it is covered end-to-end by Task 8.)

**Interfaces:**
- Consumes: `DebugLogEntry`, `DebugLogLevel` (Task 1); `Log.subsystem` (Core, existing).
- Produces:
  - `protocol LogReading: Sendable { func read(after cursor: Date?, limit: Int) throws -> [DebugLogEntry] }`
  - `final class UnifiedLogReader: LogReading` (internally `@unchecked Sendable`), `init()` non-throwing (degrades to empty reads if `OSLogStore` can't open), reads own-process `com.openclip` entries strictly after `cursor`, oldest→newest, capped at `limit`.

- [ ] **Step 1: Write the implementation**

`Sources/OpenClip/Platform/DebugLogging/DebugLogReader.swift`:

```swift
// DebugLogReader.swift
// OpenClip
//
// Reads the current process's own unified-log entries for subsystem `com.openclip`
// (the `Log` surface) via OSLogStore, mapping them to DebugLogEntry values.
// Verified mechanism: OSLogStore(scope: .currentProcessIdentifier) readback returns
// the process's live log stream (~1.2 s latency, no drops, privacy fidelity).
import Core
import Foundation
import OSLog

/// Abstraction over a source of `com.openclip` log entries, so callers and tests never
/// touch OSLogStore directly.
protocol LogReading: Sendable {
    /// Returns entries strictly newer than `cursor` (nil = all available since process start),
    /// oldest → newest, capped at `limit`. Returned entries carry `id: 0` (buffer reassigns).
    /// `limit` has a default at the protocol level so callers through `any LogReading`
    /// (e.g. `DebugLogStore.poll`) can omit it — class-level defaults don't apply to protocol calls.
    func read(after cursor: Date?, limit: Int = 2000) throws -> [DebugLogEntry]
}

/// Production `LogReading` backed by OSLogStore scoped to this process.
/// `@unchecked Sendable` is sound: `store` is created once and only read from the store's
/// single poll queue.
final class UnifiedLogReader: LogReading, @unchecked Sendable {
    private let store: OSLogStore?

    /// Non-throwing: a nil store degrades to empty reads rather than crashing the app.
    init() {
        store = try? OSLogStore(scope: .currentProcessIdentifier)
    }

    func read(after cursor: Date?, limit: Int = 2000) throws -> [DebugLogEntry] {
        guard let store else { return [] }
        let position = store.position(date: cursor ?? .distantPast)
        let predicate = NSPredicate(format: "subsystem == %@", Log.subsystem)
        let entries = try store.getEntries(with: [], at: position, matching: predicate)
        var result: [DebugLogEntry] = []
        for entry in entries {
            guard let log = entry as? OSLogEntryLog else { continue }
            if let cursor, log.date <= cursor { continue }
            result.append(DebugLogEntry(
                date: log.date,
                category: log.category,
                level: DebugLogLevel(log.level),
                message: log.composedMessage
            ))
            if result.count >= limit { break }
        }
        return result
    }
}
```

- [ ] **Step 2: Build gate — the reader compiles**

Run: `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Commit**

```bash
git add Sources/OpenClip/Platform/DebugLogging/DebugLogReader.swift
git commit -m "feat: add OSLogStore-backed unified-log reader"
```

---

### Task 5: `DebugLogStore` — polling store + `.shared`

**Files:**
- Create: `Sources/OpenClip/Platform/DebugLogging/DebugLogStore.swift`
- Test: `Tests/OpenClipTests/DebugLogStoreTests.swift`

**Interfaces:**
- Consumes: `LogReading`, `UnifiedLogReader` (Task 4), `DebugLogBuffer` (Task 2), `DebugLogFilter` (Task 3).
- Produces:
  - `final class DebugLogStore: @unchecked Sendable`
  - `static let shared: DebugLogStore` (production: `UnifiedLogReader` + 500-capacity buffer, 1.0 s poll)
  - `init(reader: any LogReading, buffer: DebugLogBuffer, pollInterval: TimeInterval = 1.0)`
  - `func start()`, `func stop()`, `func snapshot() -> [DebugLogEntry]`, `func entries(matching filter: DebugLogFilter) -> [DebugLogEntry]`, `func clear()`

- [ ] **Step 1: Write the failing tests**

`Tests/OpenClipTests/DebugLogStoreTests.swift`:

```swift
import XCTest
@testable import OpenClip

/// Scripted LogReading whose returns are queued; can inject a throw on a chosen call index
/// (0-based). A failing call does NOT consume a batch slot, so a later poll still returns it.
private final class ScriptedLogReader: LogReading, @unchecked Sendable {
    private let lock = NSLock()
    private let batches: [[DebugLogEntry]]
    private let failOnCall: Int?
    private var calls = 0
    private var nextBatch = 0

    init(batches: [[DebugLogEntry]], failOnCall: Int? = nil) {
        self.batches = batches
        self.failOnCall = failOnCall
    }

    func read(after cursor: Date?, limit: Int) throws -> [DebugLogEntry] {
        lock.lock(); defer { lock.unlock() }
        defer { calls += 1 }
        if calls == failOnCall { throw NSError(domain: "ScriptedLogReader", code: 1) }
        guard nextBatch < batches.count else { return [] }
        let batch = batches[nextBatch]
        nextBatch += 1
        return batch
    }
}

private func makeEntry(_ n: Int) -> DebugLogEntry {
    DebugLogEntry(id: 0, date: Date(timeIntervalSince1970: Double(n)), category: "test", level: .notice, message: "m\(n)")
}

final class DebugLogStoreTests: XCTestCase {
    func testPollCollectsEntriesFromReader() {
        let reader = ScriptedLogReader(batches: [[makeEntry(1), makeEntry(2)], [makeEntry(3)]])
        let store = DebugLogStore(reader: reader, buffer: DebugLogBuffer(capacity: 100), pollInterval: 0.05)
        store.start()
        defer { store.stop() }

        // Wait until all three entries have landed (poll 0 → [1,2], poll 1 → [3]).
        let deadline = Date().addingTimeInterval(2)
        while store.snapshot().count < 3 && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.01)
        }
        XCTAssertEqual(store.snapshot().map(\.message), ["m1", "m2", "m3"])
    }

    func testReaderErrorDoesNotKillPolling() {
        let reader = ScriptedLogReader(batches: [[makeEntry(1)], [makeEntry(2)]], failOnCall: 1)
        let store = DebugLogStore(reader: reader, buffer: DebugLogBuffer(capacity: 100), pollInterval: 0.05)
        store.start()
        defer { store.stop() }

        // poll 0 → [m1], poll 1 → throws, poll 2 → [m2]; wait until both have landed.
        let deadline = Date().addingTimeInterval(2)
        while store.snapshot().count < 2 && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.01)
        }
        XCTAssertEqual(store.snapshot().map(\.message), ["m1", "m2"])
    }

    func testStopHaltsFurtherReads() {
        let reader = ScriptedLogReader(batches: [[makeEntry(1)], [makeEntry(2)]])
        let store = DebugLogStore(reader: reader, buffer: DebugLogBuffer(capacity: 100), pollInterval: 0.1)
        store.start()
        defer { store.stop() }

        // Wait deterministically until the first poll has landed (first tick at ~0.1s), then stop.
        let deadline = Date().addingTimeInterval(2)
        while store.snapshot().isEmpty && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.01)
        }
        store.stop()

        Thread.sleep(forTimeInterval: 0.25) // a second tick (0.2s cadence) would have read batch 2
        XCTAssertEqual(store.snapshot().map(\.message), ["m1"])
    }

    func testEntriesMatchingAppliesFilter() {
        let reader = ScriptedLogReader(batches: [[makeEntry(1), makeEntry(2)]])
        let store = DebugLogStore(reader: reader, buffer: DebugLogBuffer(capacity: 100), pollInterval: 0.05)
        store.start()
        defer { store.stop() }

        let deadline = Date().addingTimeInterval(2)
        while store.snapshot().count < 2 && Date() < deadline {
            Thread.sleep(forTimeInterval: 0.01)
        }
        let errorOnly = store.entries(matching: DebugLogFilter(level: .error))
        XCTAssertTrue(errorOnly.isEmpty)
        let noticeOnly = store.entries(matching: DebugLogFilter(level: .notice))
        XCTAssertEqual(noticeOnly.map(\.message), ["m2", "m1"]) // newest first
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogStoreTests`
Expected: FAIL — `DebugLogStore` not found.

- [ ] **Step 3: Write the implementation**

`Sources/OpenClip/Platform/DebugLogging/DebugLogStore.swift`:

```swift
// DebugLogStore.swift
// OpenClip
//
// Polls the LogReading source on a background serial queue and accumulates entries
// into a small ring buffer. Production instance: .shared (own-process unified-log
// readback). No UI observes it today; the CLI and tests read snapshots directly.
import Foundation

/// Background-collecting debug log store. `@unchecked Sendable` is sound:
/// `buffer` and `reader` are thread-safe, `cursor` is confined to the poll queue,
/// and `timer` is only touched from the owner (start/stop).
final class DebugLogStore: @unchecked Sendable {
    static let shared: DebugLogStore = DebugLogStore(
        reader: UnifiedLogReader(),
        buffer: DebugLogBuffer(capacity: 500)
    )

    private let reader: any LogReading
    private let buffer: DebugLogBuffer
    private let pollInterval: TimeInterval

    private let queue = DispatchQueue(label: "com.openclip.debuglog.poll")
    private var timer: DispatchSourceTimer?
    private var cursor: Date?

    init(reader: any LogReading, buffer: DebugLogBuffer, pollInterval: TimeInterval = 1.0) {
        self.reader = reader
        self.buffer = buffer
        self.pollInterval = pollInterval
    }

    func start() {
        let newTimer = DispatchSource.makeTimerSource(queue: queue)
        newTimer.schedule(deadline: .now() + pollInterval, repeating: pollInterval)
        newTimer.setEventHandler { [weak self] in
            self?.poll()
        }
        newTimer.resume()
        timer = newTimer
    }

    func stop() {
        timer?.cancel()
        timer = nil
    }

    /// Chronological snapshot (oldest → newest).
    func snapshot() -> [DebugLogEntry] {
        buffer.snapshot()
    }

    func entries(matching filter: DebugLogFilter) -> [DebugLogEntry] {
        filter.apply(to: buffer.snapshot())
    }

    func clear() {
        buffer.clear()
    }

    /// Runs on `queue` only. A transient reader error must not kill the loop.
    private func poll() {
        do {
            let newEntries = try reader.read(after: cursor)
            if let lastDate = newEntries.last?.date {
                cursor = lastDate
            }
            buffer.append(contentsOf: newEntries)
        } catch {
            // keep polling on the next tick
        }
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogStoreTests`
Expected: PASS (all 4 tests). If `testReaderErrorDoesNotKillPolling` proves flaky under load, raise its sleep to 0.6.

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/DebugLogging/DebugLogStore.swift Tests/OpenClipTests/DebugLogStoreTests.swift
git commit -m "feat: add background polling debug log store"
```

---

### Task 6: `--dump-logs` CLI parsing + formatting

**Files:**
- Create: `Sources/OpenClip/Platform/DebugLogging/DebugLogCommand.swift`
- Test: `Tests/OpenClipTests/DebugLogCommandTests.swift`

**Interfaces:**
- Consumes: `DebugLogLevel`, `DebugLogEntry`, `DebugLogFilter` (Tasks 1–3).
- Produces:
  - `enum DebugLogCommand` with `enum Mode: Equatable { case none, dumpLogs(DumpOptions), showHelp, usageError(String) }`
  - `struct DumpOptions: Equatable { var category: String?; var level: DebugLogLevel?; var count: Int? = 500; var collectSeconds: Double = 4; var filter: DebugLogFilter }`
  - `static func parse(_ arguments: [String]) -> Mode`
  - `static var usage: String`
  - `static func formattedLine(_ entry: DebugLogEntry) -> String`

- [ ] **Step 1: Write the failing tests**

`Tests/OpenClipTests/DebugLogCommandTests.swift`:

```swift
import XCTest
@testable import OpenClip

final class DebugLogCommandTests: XCTestCase {
    func testNoArgsIsNone() {
        XCTAssertEqual(DebugLogCommand.parse([]), .none)
        XCTAssertEqual(DebugLogCommand.parse(["OpenClip"]), .none)
    }

    func testBareDumpDefaults() {
        guard case .dumpLogs(let opts) = DebugLogCommand.parse(["OpenClip", "--dump-logs"]) else {
            return XCTFail("expected dumpLogs")
        }
        XCTAssertNil(opts.category)
        XCTAssertNil(opts.level)
        XCTAssertEqual(opts.count, 500)
        XCTAssertEqual(opts.collectSeconds, 4)
    }

    func testDumpWithOptions() {
        guard case .dumpLogs(let opts) = DebugLogCommand.parse([
            "OpenClip", "--dump-logs",
            "--category=extensions", "--level=error", "--count=20", "--collect=3"
        ]) else {
            return XCTFail("expected dumpLogs")
        }
        XCTAssertEqual(opts.category, "extensions")
        XCTAssertEqual(opts.level, .error)
        XCTAssertEqual(opts.count, 20)
        XCTAssertEqual(opts.collectSeconds, 3)
    }

    func testHelp() {
        XCTAssertEqual(DebugLogCommand.parse(["OpenClip", "--help"]), .showHelp)
    }

    func testUnknownFlagIsUsageError() {
        guard case .usageError(let message) = DebugLogCommand.parse(["OpenClip", "--bogus"]) else {
            return XCTFail("expected usageError")
        }
        XCTAssertFalse(message.isEmpty)
    }

    func testBadLevelIsUsageError() {
        guard case .usageError = DebugLogCommand.parse(["OpenClip", "--dump-logs", "--level=nope"]) else {
            return XCTFail("expected usageError")
        }
    }

    func testFormattedLine() {
        let entry = DebugLogEntry(
            date: Date(timeIntervalSince1970: 1_700_000_000),
            category: "extensions",
            level: .error,
            message: "Extension manifest rejected at /tmp/x"
        )
        let line = DebugLogCommand.formattedLine(entry)
        XCTAssertTrue(line.contains("error"))
        XCTAssertTrue(line.contains("extensions"))
        XCTAssertTrue(line.contains("Extension manifest rejected at /tmp/x"))
    }

    func testUsageIsNonEmpty() {
        XCTAssertFalse(DebugLogCommand.usage.isEmpty)
    }
}
```

- [ ] **Step 2: Run to verify they fail**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogCommandTests`
Expected: FAIL — `DebugLogCommand` not found.

- [ ] **Step 3: Write the implementation**

`Sources/OpenClip/Platform/DebugLogging/DebugLogCommand.swift`:

```swift
// DebugLogCommand.swift
// OpenClip
//
// Parses command-line arguments for the minimal `--dump-logs` CLI surface and formats
// dump lines. Output goes to stdout; the process exits via the AppDelegate glue.
import Foundation

enum DebugLogCommand {
    struct DumpOptions: Equatable {
        var category: String? = nil
        var level: DebugLogLevel? = nil
        var count: Int? = 500
        var collectSeconds: Double = 4

        var filter: DebugLogFilter {
            DebugLogFilter(category: category, level: level, count: count)
        }
    }

    enum Mode: Equatable {
        case none
        case dumpLogs(DumpOptions)
        case showHelp
        case usageError(String)
    }

    static func parse(_ arguments: [String]) -> Mode {
        var sawDump = false
        var options = DumpOptions()
        let args = Array(arguments.dropFirst()) // drop executable path
        var index = 0
        while index < args.count {
            let arg = args[index]
            if arg == "--dump-logs" {
                sawDump = true
            } else if arg == "--help" {
                return .showHelp
            } else if let (key, value) = splitFlag(arg) {
                switch key {
                case "category": options.category = value
                case "level":
                    guard let level = DebugLogLevel.allCases.first(where: { $0.displayName == value }) else {
                        return .usageError("Unknown level '\(value)'. Valid: debug, info, notice, error, fault")
                    }
                    options.level = level
                case "count":
                    guard let count = Int(value), count >= 0 else {
                        return .usageError("Invalid count '\(value)'. Expected a non-negative integer")
                    }
                    options.count = count
                case "collect":
                    guard let seconds = Double(value), seconds >= 0 else {
                        return .usageError("Invalid collect '\(value)'. Expected a number of seconds")
                    }
                    options.collectSeconds = seconds
                default:
                    return .usageError("Unknown flag '\(arg)'")
                }
            } else {
                return .usageError("Unknown flag '\(arg)'")
            }
            index += 1
        }
        return sawDump ? .dumpLogs(options) : .none
    }

    /// Splits `--name=value` into (name, value).
    private static func splitFlag(_ argument: String) -> (String, String)? {
        guard argument.hasPrefix("--") else { return nil }
        let body = argument.dropFirst(2)
        guard let eq = body.firstIndex(of: "=") else { return nil }
        return (String(body[..<eq]), String(body[body.index(after: eq)...]))
    }

    static var usage: String {
        """
        Usage: OpenClip --dump-logs [options]

        Prints recent OpenClip log entries (subsystem com.openclip) from this process
        and exits. Run the app binary directly (not via dev_run.sh).

        Options:
          --category=<name>      Only entries from this Log category (e.g. extensions)
          --level=<level>        Only entries at this severity: debug, info, notice, error, fault
          --count=<N>            Max number of lines (default 500)
          --collect=<seconds>    Collect window before dumping (default 4)
          --help                 Show this help

        Examples:
          OpenClip --dump-logs --category=extensions --level=error
          OpenClip --dump-logs --count=20 --collect=5
        """
    }

    static func formattedLine(_ entry: DebugLogEntry) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return "\(formatter.string(from: entry.date)) \(entry.level.displayName) \(entry.category) \(entry.message)"
    }
}
```

> Note: the `DateFormatter` is created per call (not a `static let`) to stay Swift-6 strict-concurrency-clean; the CLI dump and tests call it few enough times for that to be irrelevant.

- [ ] **Step 4: Run tests to verify they pass**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogCommandTests`
Expected: PASS (all 8 tests)

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/DebugLogging/DebugLogCommand.swift Tests/OpenClipTests/DebugLogCommandTests.swift
git commit -m "feat: add --dump-logs CLI parsing and formatting"
```

---

### Task 7: AppDelegate wiring (start store + CLI mode)

**Files:**
- Modify: `Sources/OpenClip/AppDelegate.swift`
- Test: none (covered by the build gate + Step 3 sanity run + Task 9 verification).

**Interfaces:**
- Consumes: `DebugLogStore` (Task 5), `DebugLogCommand` (Task 6).
- Produces: CLI mode handled at `applicationDidFinishLaunching`; store started in all modes.

- [ ] **Step 1: Modify `AppDelegate.swift`**

Changes to `Sources/OpenClip/AppDelegate.swift` (`class AppDelegate: NSObject, NSApplicationDelegate`, `@MainActor`):

1. Insert at the **very top** of `applicationDidFinishLaunching(_:)`, before the SVG coder registration:

```swift
switch DebugLogCommand.parse(CommandLine.arguments) {
case .showHelp:
    print(DebugLogCommand.usage)
    exit(0)
case .usageError(let message):
    FileHandle.standardError.write(Data("error: \(message)\n\n\(DebugLogCommand.usage)\n".utf8))
    exit(2)
case .dumpLogs(let options):
    runDumpLogsCommand(options)
    return
case .none:
    break
}

DebugLogStore.shared.start()
```

2. The `.showHelp` / `.usageError` / `.dumpLogs` branches exit or return **before** the normal launch code (SVG coder, status bar, hotkey, selection monitor, onboarding) — none of it runs in CLI mode. The normal path continues unchanged, now starting `DebugLogStore.shared.start()` (which preserves ability to capture startup logs from the first poll onward).

3. Add this private method to the class:

```swift
/// Runs the app in `--dump-logs` mode: start the store, run the normal startup action load
/// (this is where extension load/rejection lines are logged), wait the collect window, print
/// the filtered snapshot, and exit.
private func runDumpLogsCommand(_ options: DebugLogCommand.DumpOptions) {
    DebugLogStore.shared.start()

    Task {
        ExtensionManager.shared.actionFactory = DefaultActionFactory(optionStore: KeychainActionOptionStore())
        await ActionCoordinator.shared.loadInitialState()
        ActionCoordinator.shared.register(action: CompletionAction())
        ActionCoordinator.shared.register(action: OpenURLAction())
        ActionCoordinator.shared.register(action: ServicesAction())
        ActionCoordinator.shared.register(action: RevealInFinderAction())
    }

    Task {
        try? await Task.sleep(for: .seconds(options.collectSeconds))
        let entries = DebugLogStore.shared.entries(matching: options.filter)
        print("OpenClip log dump (\(entries.count) entr\(entries.count == 1 ? "y" : "ies"))")
        for entry in entries {
            print(DebugLogCommand.formattedLine(entry))
        }
        exit(0)
    }
}
```

> Keep this method's startup registrations in sync with the existing startup `Task` in the normal
> launch path (`loadInitialState()` plus the four `register(action:)` calls).

- [ ] **Step 2: Build gate**

Run: `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
Expected: BUILD SUCCEEDED

- [ ] **Step 3: Sanity-run the CLI**

Run the freshly built Debug binary directly (never via `dev_run.sh`):

```bash
APP="$(find ~/Library/Developer/Xcode/DerivedData/OpenClip-*/Build/Products/Debug -name OpenClip.app | head -n1)/Contents/MacOS/OpenClip"
"$APP" --help; echo "help exit: $?"
"$APP" --bogus; echo "bogus exit: $?"
```

Expected: `--help` prints usage and exits `0`; `--bogus` prints an error + usage and exits `2`.

- [ ] **Step 4: Commit**

```bash
git add Sources/OpenClip/AppDelegate.swift
git commit -m "feat: wire debug-log store and --dump-logs into app launch"
```

---

### Task 8: End-to-end capture test

**Files:**
- Create: `Tests/OpenClipTests/DebugLogEndToEndTests.swift`

**Interfaces:**
- Consumes: `Log` (Core, existing), `DebugLogStore`, `UnifiedLogReader`, `DebugLogBuffer` (Tasks 2, 4, 5).

- [ ] **Step 1: Write the test**

`Tests/OpenClipTests/DebugLogEndToEndTests.swift`:

```swift
import Core
import XCTest
@testable import OpenClip

/// Exercises the full store path deterministically inside the test runner's own process:
/// write a real line through `Log`, let the poller read it back via OSLogStore, and assert
/// the marker appears in the buffer. No `~/.openclip` or app-singleton dependency.
final class DebugLogEndToEndTests: XCTestCase {
    func testStoreCapturesRealLogLine() {
        let marker = "E2E_MARKER_\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        let store = DebugLogStore(
            reader: UnifiedLogReader(),
            buffer: DebugLogBuffer(capacity: 500),
            pollInterval: 0.5
        )
        store.start()
        defer { store.stop() }

        Log.extensions.error("\(marker, privacy: .public) e2e probe")

        let deadline = Date().addingTimeInterval(8)
        var found = false
        while Date() < deadline && !found {
            Thread.sleep(forTimeInterval: 0.5)
            found = store.snapshot().contains { $0.message.contains(marker) }
        }
        XCTAssertTrue(found, "store should capture the E2E marker line within 8s")
    }
}
```

- [ ] **Step 2: Run to verify it passes**

Run: `timeout -k 10 60 ./scripts/test.sh DebugLogEndToEndTests`
Expected: PASS. Confirms the real os-write → OSLogStore-readback → buffer path works under the test
host. If it fails, note `docs/logging.md` §“In-process debug log (experimental)” (readback requires
the owning process to be alive) and retry once — a single timeout under machine load is possible;
sustained failure means the mechanism needs review before proceeding.

- [ ] **Step 3: Commit**

```bash
git add Tests/OpenClipTests/DebugLogEndToEndTests.swift
git commit -m "test: add end-to-end store capture test"
```

---

### Task 9: Docs + full verification

**Files:**
- Modify: `docs/logging.md`
- Modify: `docs/architecture/directory-structure.md`

**Interfaces:**
- Consumes: final shapes of the store/CLI from Tasks 1–8.

- [ ] **Step 1: Update `docs/logging.md`** — append a section after “Filtering workflow”:

```markdown
## In-process debug log (experimental)

OpenClip keeps a small in-memory ring buffer of recent `com.openclip` entries in the App
target (`DebugLogStore`, `Sources/OpenClip/Platform/DebugLogging/`) so agents and developers
can read recent logs without Console.app. It is fed by reading the current process's own
unified-log stream via `OSLogStore(scope: .currentProcessIdentifier)` — `Log` itself is
untouched. Noteworthy behaviours:

- **Readback requires a live process.** Entries are only readable while the owning process is
  running; after it exits the unified log may not persist them (this is why `log show` after
  process termination can print nothing). The CLI dump therefore captures the *current* process.
- **Privacy is preserved.** `privacy: .public`/`.auto` values show in full; `.private` shows as
  `<private>` — same as external tooling.

### `--dump-logs` CLI

Run the app binary directly (not via `dev_run.sh`):

```sh
"/path/to/OpenClip.app/Contents/MacOS/OpenClip" --dump-logs --category=extensions --level=error
```

Flags: `--category=`, `--level=`, `--count=`, `--collect=` (seconds, default 4), `--help`.
It cold-launches the app, runs extension loading (so load/reject lines are produced), waits,
then prints the last N lines to stdout and exits 0 (`2` on usage errors). This is the quickest
agent check for “did my extension load or reject?”.
```

- [ ] **Step 2: Update `docs/architecture/directory-structure.md`** — add under the `Sources/OpenClip/` tree, directly below the `Platform/` entries:

```markdown
    ├── Platform/DebugLogging/                 # In-process debug log store + --dump-logs CLI (App target)
    │   ├── DebugLogEntry.swift                # Captured log entry model + DebugLogLevel
    │   ├── DebugLogBuffer.swift               # Thread-safe capacity-capped ring buffer
    │   ├── DebugLogReader.swift               # LogReading protocol + OSLogStore-backed UnifiedLogReader
    │   ├── DebugLogStore.swift                # 1s background poller + .shared
    │   ├── DebugLogFilter.swift               # Pure category/level/count filter
    │   └── DebugLogCommand.swift              # --dump-logs arg parsing + line formatting
```

(Match the surrounding indentation and annotation style of the existing tree.)

- [ ] **Step 3: Full build gate + full suite**

Run: `xcodegen generate`
Run: `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
Expected: BUILD SUCCEEDED
Run: `timeout -k 10 60 ./scripts/test.sh`
Expected: whole suite SUCCEEDED (including the new `DebugLog*Tests`).

- [ ] **Step 4: Manual/Final agent verification (the spec's verification)**

```bash
# 1) Install a deliberately broken extension so validation fails at load:
#    e.g. create ~/.openclip/extensions/Broken/ with a manifest that fails validation
#    (missing a required field). Remove/rename it afterward.

# 2) Dump logs for the extensions category across a collect window that covers startup.
APP="$(find ~/Library/Developer/Xcode/DerivedData/OpenClip-*/Build/Products/Debug -name OpenClip.app | head -n1)/Contents/MacOS/OpenClip"
"$APP" --dump-logs --category=extensions --collect=5
```

Expected stdout to include a line like:
`... error extensions Extension manifest rejected at /Users/<you>/.openclip/extensions/Broken/manifest.json: <details>`

Also sanity-check narrowing: `--level=error` excludes notice lines; `--count=10` emits at most 10
entry lines (ignoring the header line); `--collect=5` waits ~5 s before dumping.

- [ ] **Step 5: Commit**

```bash
git add docs/logging.md docs/architecture/directory-structure.md
git commit -m "docs: document debug-log store and --dump-logs CLI"
```