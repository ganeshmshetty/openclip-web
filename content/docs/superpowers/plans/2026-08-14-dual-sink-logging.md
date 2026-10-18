# Dual-Sink Logging Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor OpenClip's logging subsystem into a zero-overhead, production-grade Dual-Sink Architecture with Apple `os.Logger`, an in-memory ring buffer for 0ms `--dump-logs`, and a rotating file appender at `~/Library/Logs/OpenClip/openclip.log`.

**Architecture:** Core provides a pure Swift `LogSink` protocol and `LogChannel` wrapping `os.Logger` that broadcasts to registered sinks without altering existing `Log.<category>` call sites. The App target registers an in-memory `DebugLogBuffer` sink and a background `RotatingFileLogSink`, eliminating `OSLogStore` polling CPU overhead and async indexing lag entirely.

**Tech Stack:** Swift 6 (`SWIFT_STRICT_CONCURRENCY: complete`), macOS 14+ Darwin `os.Logger`, AppKit/Foundation, XcodeGen, XCTest.

## Global Constraints

- **Core is pure**: No AppKit or SwiftUI imports in `Sources/Core/`. Only Foundation and Darwin system modules (like `os`).
- **Swift 6 Concurrency**: Full strict concurrency (`Sendable` annotations, actor confinement or thread-safe NSLock synchronization).
- **Zero Call-Site Breakage**: All existing `Log.<category>.<level>("...", privacy: .public)` call sites across `Sources/` must remain valid and unchanged.
- **Single Logging Surface**: All categories are owned by `Log` (`com.openclip` subsystem); no raw `Logger(...)` or `print()` in `Sources/`.
- **Log File Location**: `~/Library/Logs/OpenClip/openclip.log`, 5MB cap per file, max 3 backups (`openclip.1.log`, `openclip.2.log`, `openclip.3.log`).

---

### Task 1: Core LogSink Protocol, LogLevel, LogMessage, and LogChannel in `Sources/Core/Log.swift`

**Files:**
- Modify: `Sources/Core/Log.swift`
- Create: `Tests/OpenClipTests/LogCoreTests.swift`

**Interfaces:**
- Consumes: Foundation, `os.Logger`, `os.OSLogType`
- Produces:
  - `public enum LogLevel: String, Sendable, CaseIterable, Comparable, Equatable, CustomStringConvertible`
  - `public enum LogPrivacy: Sendable { case `public`, `private`, auto }`
  - `public struct LogMessage: ExpressibleByStringInterpolation, ExpressibleByStringLiteral, CustomStringConvertible, Sendable`
  - `public protocol LogSink: Sendable { func record(date: Date, category: String, level: LogLevel, message: String) }`
  - `public struct LogChannel: Sendable`
  - `Log.addSink(_ sink: any LogSink)`
  - `Log.removeSink(_ sink: any LogSink)` / `Log.removeAllSinks()`
  - `Log.record(date: Date, category: String, level: LogLevel, message: String)`

- [ ] **Step 1: Write the failing test for `LogChannel`, `LogLevel`, and `LogSink` in `Tests/OpenClipTests/LogCoreTests.swift`**

```swift
import XCTest
@testable import Core

private final class TestLogSink: LogSink, @unchecked Sendable {
    private let lock = NSLock()
    var records: [(date: Date, category: String, level: LogLevel, message: String)] = []

    func record(date: Date, category: String, level: LogLevel, message: String) {
        lock.lock()
        defer { lock.unlock() }
        records.append((date: date, category: category, level: level, message: message))
    }

    func getRecords() -> [(date: Date, category: String, level: LogLevel, message: String)] {
        lock.lock()
        defer { lock.unlock() }
        return records
    }
}

final class LogCoreTests: XCTestCase {
    override func setUp() {
        super.setUp()
        Log.removeAllSinks()
    }

    override func tearDown() {
        Log.removeAllSinks()
        super.tearDown()
    }

    func testLogLevelComparisonAndDisplayName() {
        XCTAssertLessThan(LogLevel.debug, LogLevel.info)
        XCTAssertLessThan(LogLevel.info, LogLevel.notice)
        XCTAssertLessThan(LogLevel.notice, LogLevel.warning)
        XCTAssertLessThan(LogLevel.warning, LogLevel.error)
        XCTAssertLessThan(LogLevel.error, LogLevel.fault)

        XCTAssertEqual(LogLevel.debug.displayName, "debug")
        XCTAssertEqual(LogLevel.error.displayName, "error")
        XCTAssertEqual(LogLevel.notice.displayName, "notice")
    }

    func testLogBroadcastsToRegisteredSinks() {
        let sink1 = TestLogSink()
        let sink2 = TestLogSink()
        Log.addSink(sink1)
        Log.addSink(sink2)

        Log.settings.info("Test settings message")
        Log.extensions.error("Test error \(123, privacy: .public)")

        let r1 = sink1.getRecords()
        let r2 = sink2.getRecords()

        XCTAssertEqual(r1.count, 2)
        XCTAssertEqual(r2.count, 2)

        XCTAssertEqual(r1[0].category, "settings")
        XCTAssertEqual(r1[0].level, .info)
        XCTAssertEqual(r1[0].message, "Test settings message")

        XCTAssertEqual(r1[1].category, "extensions")
        XCTAssertEqual(r1[1].level, .error)
        XCTAssertEqual(r1[1].message, "Test error 123")
    }

    func testRemoveAllSinksStopsBroadcasting() {
        let sink = TestLogSink()
        Log.addSink(sink)
        Log.settings.info("Before clear")
        XCTAssertEqual(sink.getRecords().count, 1)

        Log.removeAllSinks()
        Log.settings.info("After clear")
        XCTAssertEqual(sink.getRecords().count, 1)
    }
}
```

- [ ] **Step 2: Run test to verify it fails (or compile error)**

Run: `./scripts/test.sh LogCoreTests`
Expected: FAIL (types and methods not yet defined on `Log`).

- [ ] **Step 3: Implement `LogLevel`, `LogPrivacy`, `LogMessage`, `LogSink`, `LogChannel`, and `Log` in `Sources/Core/Log.swift`**

```swift
// Log.swift
// OpenClip
//
// Single logging surface for the OpenClip Core + App targets.
// Broadcasts to Apple's os.Logger and all registered LogSink instances.

import Foundation
import os

/// Severity level of a log entry.
public enum LogLevel: String, Sendable, CaseIterable, Comparable, Equatable, CustomStringConvertible {
    case debug
    case info
    case notice
    case warning
    case error
    case fault

    public var displayName: String { rawValue }
    public var description: String { rawValue }

    private var priority: Int {
        switch self {
        case .debug: return 1
        case .info: return 2
        case .notice: return 3
        case .warning: return 4
        case .error: return 5
        case .fault: return 6
        }
    }

    public static func < (lhs: LogLevel, rhs: LogLevel) -> Bool {
        lhs.priority < rhs.priority
    }

    public var osLogType: OSLogType {
        switch self {
        case .debug: return .debug
        case .info: return .info
        case .notice: return .default
        case .warning: return .default
        case .error: return .error
        case .fault: return .fault
        }
    }
}

/// Privacy specifier for string interpolations in log messages.
public enum LogPrivacy: Sendable {
    case `public`
    case `private`
    case auto
}

/// A formatted log message supporting string interpolation with optional privacy annotations.
public struct LogMessage: ExpressibleByStringInterpolation, ExpressibleByStringLiteral, CustomStringConvertible, Sendable {
    public let stringValue: String

    public init(stringLiteral value: String) {
        self.stringValue = value
    }

    public init(stringValue: String) {
        self.stringValue = stringValue
    }

    public init(stringInterpolation: StringInterpolation) {
        self.stringValue = stringInterpolation.buffer
    }

    public var description: String { stringValue }

    public struct StringInterpolation: StringInterpolationProtocol, Sendable {
        var buffer: String = ""

        public init(literalCapacity: Int, interpolationCount: Int) {
            buffer.reserveCapacity(literalCapacity + interpolationCount * 16)
        }

        public mutating func appendLiteral(_ literal: String) {
            buffer.append(literal)
        }

        public mutating func appendInterpolation<T>(_ value: T) {
            buffer.append(String(describing: value))
        }

        public mutating func appendInterpolation<T>(_ value: T, privacy: LogPrivacy) {
            buffer.append(String(describing: value))
        }
    }
}

/// Protocol for log consumers (e.g. in-memory buffer, file appender).
public protocol LogSink: Sendable {
    func record(date: Date, category: String, level: LogLevel, message: String)
}

/// A named logging channel that logs to Apple's `os.Logger` and broadcasts to `Log` sinks.
public struct LogChannel: Sendable {
    public let category: String
    private let rawLogger: os.Logger

    public init(category: String) {
        self.category = category
        self.rawLogger = os.Logger(subsystem: Log.subsystem, category: category)
    }

    public func debug(_ message: LogMessage) {
        log(level: .debug, message)
    }

    public func info(_ message: LogMessage) {
        log(level: .info, message)
    }

    public func notice(_ message: LogMessage) {
        log(level: .notice, message)
    }

    public func warning(_ message: LogMessage) {
        log(level: .warning, message)
    }

    public func error(_ message: LogMessage) {
        log(level: .error, message)
    }

    public func fault(_ message: LogMessage) {
        log(level: .fault, message)
    }

    public func log(level: LogLevel, _ message: LogMessage) {
        rawLogger.log(level: level.osLogType, "\(message.stringValue, privacy: .public)")
        Log.record(date: Date(), category: category, level: level, message: message.stringValue)
    }
}

/// Central logging surface. Add a category here (not a brand-new `Logger` instance) whenever a new
/// subsystem starts emitting logs, and keep the table in `docs/logging.md` in step.
public enum Log: Sendable {
    /// Bundle / process identifier shared by every logged message.
    public static let subsystem = "com.openclip"

    private static let lock = NSLock()
    private static var sinks: [any LogSink] = []

    public static func addSink(_ sink: any LogSink) {
        lock.lock()
        defer { lock.unlock() }
        sinks.append(sink)
    }

    public static func removeAllSinks() {
        lock.lock()
        defer { lock.unlock() }
        sinks.removeAll()
    }

    public static func record(date: Date, category: String, level: LogLevel, message: String) {
        lock.lock()
        let currentSinks = sinks
        lock.unlock()
        for sink in currentSinks {
            sink.record(date: date, category: category, level: level, message: message)
        }
    }

    // MARK: Core subsystems (settings, rules, policies)
    public static let settings = LogChannel(category: "settings")
    public static let presentation = LogChannel(category: "presentation")
    public static let chrome = LogChannel(category: "chrome")
    public static let factory = LogChannel(category: "factory")
    public static let coordinator = LogChannel(category: "coordinator")
    public static let resultHandler = LogChannel(category: "result-handler")

    // MARK: Runtime owners
    public static let shell = LogChannel(category: "shell")
    public static let js = LogChannel(category: "js")
    public static let selection = LogChannel(category: "selection")
    public static let extensions = LogChannel(category: "extensions")
    public static let ai = LogChannel(category: "ai")
    public static let permissions = LogChannel(category: "permissions")
    public static let icons = LogChannel(category: "icons")
}
```

- [ ] **Step 4: Re-generate project and run test to verify it passes**

Run: `xcodegen generate && ./scripts/test.sh LogCoreTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Log.swift Tests/OpenClipTests/LogCoreTests.swift
git commit -m "feat(core): implement LogSink protocol, LogLevel, LogMessage, and LogChannel in Core"
```

---

### Task 2: RotatingFileLogSink Implementation

**Files:**
- Create: `Sources/OpenClip/Platform/DebugLogging/RotatingFileLogSink.swift`
- Create: `Tests/OpenClipTests/RotatingFileLogSinkTests.swift`

**Interfaces:**
- Consumes: `Core.LogSink`, `Core.LogLevel`, `Foundation.FileManager`, `Foundation.FileHandle`, `Foundation.DispatchQueue`
- Produces:
  - `public final class RotatingFileLogSink: LogSink, @unchecked Sendable`
  - `init(logDirectory: URL? = nil, fileName: String = "openclip.log", maxFileSize: UInt64 = 5 * 1024 * 1024, maxBackups: Int = 3)`
  - `func record(date: Date, category: String, level: LogLevel, message: String)`
  - `func flush()`

- [ ] **Step 1: Write failing tests for `RotatingFileLogSink` in `Tests/OpenClipTests/RotatingFileLogSinkTests.swift`**

```swift
import XCTest
@testable import Core
@testable import OpenClip

final class RotatingFileLogSinkTests: XCTestCase {
    private var tempDirectory: URL!

    override func setUp() {
        super.setUp()
        tempDirectory = FileManager.default.temporaryDirectory
            .appendingPathComponent("OpenClipLogTests-\(UUID().uuidString)")
        try? FileManager.default.createDirectory(at: tempDirectory, withIntermediateDirectories: true)
    }

    override func tearDown() {
        if let tempDirectory {
            try? FileManager.default.removeItem(at: tempDirectory)
        }
        super.tearDown()
    }

    func testLogSinkCreatesFileAndWritesEntries() throws {
        let sink = RotatingFileLogSink(
            logDirectory: tempDirectory,
            fileName: "test.log",
            maxFileSize: 1024 * 1024,
            maxBackups: 2
        )

        let date = Date(timeIntervalSince1970: 1700000000)
        sink.record(date: date, category: "extensions", level: .notice, message: "Loaded extension foo")
        sink.flush()

        let logFile = tempDirectory.appendingPathComponent("test.log")
        XCTAssertTrue(FileManager.default.fileExists(atPath: logFile.path))

        let content = try String(contentsOf: logFile, encoding: .utf8)
        XCTAssertTrue(content.contains("notice extensions Loaded extension foo"))
    }

    func testLogSinkRotatesWhenSizeExceedsCap() throws {
        // Use a small cap (120 bytes) to force rotation with few lines
        let sink = RotatingFileLogSink(
            logDirectory: tempDirectory,
            fileName: "test.log",
            maxFileSize: 120,
            maxBackups: 2
        )

        for i in 1...10 {
            sink.record(
                date: Date(timeIntervalSince1970: Double(1700000000 + i)),
                category: "cat",
                level: .info,
                message: "Message number \(i) with padding to fill up the file"
            )
        }
        sink.flush()

        let currentLog = tempDirectory.appendingPathComponent("test.log")
        let backup1 = tempDirectory.appendingPathComponent("test.1.log")
        let backup2 = tempDirectory.appendingPathComponent("test.2.log")
        let backup3 = tempDirectory.appendingPathComponent("test.3.log")

        XCTAssertTrue(FileManager.default.fileExists(atPath: currentLog.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: backup1.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: backup2.path))
        XCTAssertFalse(FileManager.default.fileExists(atPath: backup3.path), "Max backups is 2, so .3 should not exist")
    }

    func testConcurrentWritesAreThreadSafe() throws {
        let sink = RotatingFileLogSink(
            logDirectory: tempDirectory,
            fileName: "concurrent.log",
            maxFileSize: 1024 * 1024,
            maxBackups: 2
        )

        let iterations = 100
        DispatchQueue.concurrentPerform(iterations: iterations) { i in
            sink.record(date: Date(), category: "thread", level: .debug, message: "Concurrent write \(i)")
        }
        sink.flush()

        let logFile = tempDirectory.appendingPathComponent("concurrent.log")
        let content = try String(contentsOf: logFile, encoding: .utf8)
        let lineCount = content.split(separator: "\n").count
        XCTAssertEqual(lineCount, iterations)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `xcodegen generate && ./scripts/test.sh RotatingFileLogSinkTests`
Expected: FAIL (RotatingFileLogSink not defined).

- [ ] **Step 3: Implement `RotatingFileLogSink` in `Sources/OpenClip/Platform/DebugLogging/RotatingFileLogSink.swift`**

```swift
// RotatingFileLogSink.swift
// OpenClip
//
// Thread-safe rotating file appender for OpenClip logs.
// Writes formatted entries to ~/Library/Logs/OpenClip/openclip.log on a serial queue.
// Rotates when file size reaches maxFileSize (default 5MB), keeping up to maxBackups files.

import Foundation
import Core

public final class RotatingFileLogSink: LogSink, @unchecked Sendable {
    public static var defaultLogDirectory: URL {
        let libraryLogs = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSHomeDirectory()).appendingPathComponent("Library")
        return libraryLogs.appendingPathComponent("Logs/OpenClip")
    }

    private let logDirectory: URL
    private let fileName: String
    private let maxFileSize: UInt64
    private let maxBackups: Int

    private let queue = DispatchQueue(label: "com.openclip.log.fileappender", qos: .utility)
    private var fileHandle: FileHandle?
    private var currentFileSize: UInt64 = 0

    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss.SSS"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    public init(
        logDirectory: URL? = nil,
        fileName: String = "openclip.log",
        maxFileSize: UInt64 = 5 * 1024 * 1024,
        maxBackups: Int = 3
    ) {
        self.logDirectory = logDirectory ?? Self.defaultLogDirectory
        self.fileName = fileName
        self.maxFileSize = maxFileSize
        self.maxBackups = maxBackups

        queue.sync {
            self.prepareLogFile()
        }
    }

    deinit {
        let handle = fileHandle
        fileHandle = nil
        try? handle?.close()
    }

    public func record(date: Date, category: String, level: LogLevel, message: String) {
        let formattedDate = dateFormatter.string(from: date)
        let line = "\(formattedDate) \(level.displayName) \(category) \(message)\n"
        guard let data = line.data(using: .utf8) else { return }

        queue.async { [weak self] in
            self?.write(data)
        }
    }

    public func flush() {
        queue.sync {
            try? fileHandle?.synchronize()
        }
    }

    private var currentFileURL: URL {
        logDirectory.appendingPathComponent(fileName)
    }

    private func backupFileURL(index: Int) -> URL {
        let baseName = (fileName as NSString).deletingPathExtension
        let ext = (fileName as NSString).pathExtension
        let backupName = ext.isEmpty ? "\(baseName).\(index)" : "\(baseName).\(index).\(ext)"
        return logDirectory.appendingPathComponent(backupName)
    }

    private func prepareLogFile() {
        let fileManager = FileManager.default
        if !fileManager.fileExists(atPath: logDirectory.path) {
            try? fileManager.createDirectory(at: logDirectory, withIntermediateDirectories: true)
        }

        let fileURL = currentFileURL
        if !fileManager.fileExists(atPath: fileURL.path) {
            fileManager.createFile(atPath: fileURL.path, contents: nil)
        }

        do {
            let handle = try FileHandle(forWritingTo: fileURL)
            handle.seekToEndOfFile()
            self.fileHandle = handle
            let attributes = try fileManager.attributesOfItem(atPath: fileURL.path)
            self.currentFileSize = attributes[.size] as? UInt64 ?? 0
        } catch {
            self.fileHandle = nil
            self.currentFileSize = 0
        }
    }

    private func write(_ data: Data) {
        if currentFileSize + UInt64(data.count) > maxFileSize {
            rotate()
        }

        guard let fileHandle else {
            prepareLogFile()
            guard let fileHandle else { return }
            fileHandle.write(data)
            currentFileSize += UInt64(data.count)
            return
        }

        fileHandle.write(data)
        currentFileSize += UInt64(data.count)
    }

    private func rotate() {
        try? fileHandle?.synchronize()
        try? fileHandle?.close()
        fileHandle = nil

        let fileManager = FileManager.default

        // Delete excess backup if exists
        let highestBackup = backupFileURL(index: maxBackups)
        if fileManager.fileExists(atPath: highestBackup.path) {
            try? fileManager.removeItem(at: highestBackup)
        }

        // Shift backups down: (maxBackups - 1) down to 1
        if maxBackups > 1 {
            for i in stride(from: maxBackups - 1, through: 1, by: -1) {
                let src = backupFileURL(index: i)
                let dst = backupFileURL(index: i + 1)
                if fileManager.fileExists(atPath: src.path) {
                    try? fileManager.moveItem(at: src, to: dst)
                }
            }
        }

        // Move current file to backup 1
        let current = currentFileURL
        if fileManager.fileExists(atPath: current.path) && maxBackups > 0 {
            let backup1 = backupFileURL(index: 1)
            try? fileManager.moveItem(at: current, to: backup1)
        }

        // Create fresh log file
        prepareLogFile()
    }
}
```

- [ ] **Step 4: Re-generate project and run test to verify it passes**

Run: `xcodegen generate && ./scripts/test.sh RotatingFileLogSinkTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/DebugLogging/RotatingFileLogSink.swift Tests/OpenClipTests/RotatingFileLogSinkTests.swift
git commit -m "feat(logging): implement RotatingFileLogSink with 5MB cap and rotation"
```

---

### Task 3: Refactor In-Memory Sink, `DebugLogBuffer`, `DebugLogLevel`, and Remove `OSLogStore` Polling

**Files:**
- Modify: `Sources/OpenClip/Platform/DebugLogging/DebugLogLevel.swift`
- Modify: `Sources/OpenClip/Platform/DebugLogging/DebugLogEntry.swift`
- Modify: `Sources/OpenClip/Platform/DebugLogging/DebugLogBuffer.swift`
- Modify: `Sources/OpenClip/Platform/DebugLogging/DebugLogStore.swift`
- Delete: `Sources/OpenClip/Platform/DebugLogging/DebugLogReader.swift`
- Modify: `Tests/OpenClipTests/DebugLogStoreTests.swift`
- Modify: `Tests/OpenClipTests/DebugLogBufferTests.swift`
- Modify: `Tests/OpenClipTests/DebugLogEntryTests.swift`

**Interfaces:**
- Consumes: `Core.Log`, `Core.LogSink`, `Core.LogLevel`
- Produces:
  - `public typealias DebugLogLevel = LogLevel`
  - `DebugLogBuffer: LogSink, @unchecked Sendable`
  - `DebugLogStore: @unchecked Sendable` (direct in-memory buffer without `OSLogStore` reader/timer)

- [ ] **Step 1: Update `DebugLogLevel.swift` and `DebugLogEntry.swift`**

In `Sources/OpenClip/Platform/DebugLogging/DebugLogLevel.swift`:
```swift
// DebugLogLevel.swift
// OpenClip
//
// Severity level of a captured debug log entry.
// Bridges to Core.LogLevel and provides OSLog compatibility initializer for tests.

import OSLog
import Core

public typealias DebugLogLevel = LogLevel

extension LogLevel {
    public init(_ level: OSLogEntryLog.Level) {
        switch level {
        case .undefined: self = .debug
        case .debug: self = .debug
        case .info: self = .info
        case .notice: self = .notice
        case .error: self = .error
        case .fault: self = .fault
        @unknown default: self = .debug
        }
    }
}
```

In `Sources/OpenClip/Platform/DebugLogging/DebugLogEntry.swift`:
```swift
// DebugLogEntry.swift
// OpenClip
//
// One captured log line: timestamp, subsystem category, level, and decoded message.
import Foundation
import Core

/// A single captured `Log` line. `id` is a per-process sequential index assigned at
/// append time by `DebugLogBuffer`; readers pass `id: 0`.
public struct DebugLogEntry: Equatable, Sendable {
    public let id: Int
    public let date: Date
    public let category: String
    public let level: DebugLogLevel
    public let message: String

    public init(id: Int = 0, date: Date, category: String, level: DebugLogLevel, message: String) {
        self.id = id
        self.date = date
        self.category = category
        self.level = level
        self.message = message
    }
}
```

- [ ] **Step 2: Update `DebugLogBuffer.swift` to conform to `LogSink`**

In `Sources/OpenClip/Platform/DebugLogging/DebugLogBuffer.swift`:
```swift
// DebugLogBuffer.swift
// OpenClip
//
// Thread-safe fixed-capacity ring buffer for recent Log entries.
// Conforms to LogSink to receive direct in-memory broadcasts from Log.

import Foundation
import Core

/// Thread-safe, capacity-capped log entry store. Oldest entries are evicted on overflow.
/// Safe to call from any queue (NSLock-guarded).
public final class DebugLogBuffer: LogSink, @unchecked Sendable {
    private let lock = NSLock()
    private var storage: [DebugLogEntry] = []
    private var nextID = 0
    private let capacity: Int

    public init(capacity: Int = 500) {
        self.capacity = max(1, capacity)
    }

    public func record(date: Date, category: String, level: LogLevel, message: String) {
        append(DebugLogEntry(id: 0, date: date, category: category, level: level, message: message))
    }

    /// Appends an entry, assigning a stable sequential `id`, evicting the oldest beyond capacity.
    @discardableResult
    public func append(_ entry: DebugLogEntry) -> DebugLogEntry {
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

    public func append(contentsOf entries: [DebugLogEntry]) {
        for entry in entries { append(entry) }
    }

    /// Chronological snapshot (oldest → newest).
    public func snapshot() -> [DebugLogEntry] {
        lock.lock(); defer { lock.unlock() }
        return storage
    }

    public func clear() {
        lock.lock(); defer { lock.unlock() }
        storage.removeAll()
    }

    public var count: Int {
        lock.lock(); defer { lock.unlock() }
        return storage.count
    }
}
```

- [ ] **Step 3: Update `DebugLogStore.swift` and delete `DebugLogReader.swift`**

Remove `Sources/OpenClip/Platform/DebugLogging/DebugLogReader.swift`.

In `Sources/OpenClip/Platform/DebugLogging/DebugLogStore.swift`:
```swift
// DebugLogStore.swift
// OpenClip
//
// In-process debug log store backed directly by an in-memory LogSink ring buffer.
// Zero OSLogStore polling, 0ms indexing delay, zero CPU overhead.

import Foundation
import Core

public final class DebugLogStore: @unchecked Sendable {
    public static let shared: DebugLogStore = {
        let buffer = DebugLogBuffer(capacity: 500)
        let store = DebugLogStore(buffer: buffer)
        Log.addSink(buffer)
        return store
    }()

    public let buffer: DebugLogBuffer

    public init(buffer: DebugLogBuffer) {
        self.buffer = buffer
    }

    /// Kept for API compatibility; no background timers are needed.
    public func start() {}
    public func stop() {}

    /// Chronological snapshot (oldest → newest).
    public func snapshot() -> [DebugLogEntry] {
        buffer.snapshot()
    }

    public func entries(matching filter: DebugLogFilter) -> [DebugLogEntry] {
        filter.apply(to: buffer.snapshot())
    }

    public func clear() {
        buffer.clear()
    }
}
```

- [ ] **Step 4: Update `Tests/OpenClipTests/DebugLogStoreTests.swift` and `DebugLogEntryTests.swift`**

In `Tests/OpenClipTests/DebugLogStoreTests.swift`:
```swift
import XCTest
@testable import Core
@testable import OpenClip

private func makeEntry(_ n: Int, level: LogLevel = .notice) -> DebugLogEntry {
    DebugLogEntry(id: 0, date: Date(timeIntervalSince1970: Double(n)), category: "test", level: level, message: "m\(n)")
}

final class DebugLogStoreTests: XCTestCase {
    func testStoreCapturesEntriesViaBuffer() {
        let buffer = DebugLogBuffer(capacity: 100)
        let store = DebugLogStore(buffer: buffer)

        buffer.record(date: Date(timeIntervalSince1970: 1), category: "test", level: .notice, message: "m1")
        buffer.record(date: Date(timeIntervalSince1970: 2), category: "test", level: .notice, message: "m2")

        XCTAssertEqual(store.snapshot().map(\.message), ["m1", "m2"])
    }

    func testEntriesMatchingAppliesFilter() {
        let buffer = DebugLogBuffer(capacity: 100)
        let store = DebugLogStore(buffer: buffer)

        buffer.record(date: Date(timeIntervalSince1970: 1), category: "cat1", level: .notice, message: "m1")
        buffer.record(date: Date(timeIntervalSince1970: 2), category: "cat2", level: .error, message: "m2")

        let errorOnly = store.entries(matching: DebugLogFilter(level: .error))
        XCTAssertEqual(errorOnly.map(\.message), ["m2"])

        let cat1Only = store.entries(matching: DebugLogFilter(category: "cat1"))
        XCTAssertEqual(cat1Only.map(\.message), ["m1"])
    }

    func testClearEmptiesBuffer() {
        let buffer = DebugLogBuffer(capacity: 100)
        let store = DebugLogStore(buffer: buffer)

        buffer.record(date: Date(timeIntervalSince1970: 1), category: "test", level: .notice, message: "m1")
        XCTAssertEqual(store.snapshot().count, 1)

        store.clear()
        XCTAssertEqual(store.snapshot().count, 0)
    }
}
```

- [ ] **Step 5: Re-generate project and run test suite**

Run: `rm -f Sources/OpenClip/Platform/DebugLogging/DebugLogReader.swift && xcodegen generate && ./scripts/test.sh`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add Sources/OpenClip/Platform/DebugLogging/ Tests/OpenClipTests/
git commit -m "refactor(logging): replace OSLogStore reader with direct LogSink in-memory buffer"
```

---

### Task 4: Integrate Sinks in `AppDelegate.swift` and Refactor `--dump-logs`

**Files:**
- Modify: `Sources/OpenClip/AppDelegate.swift`
- Modify: `Sources/OpenClip/Platform/DebugLogging/DebugLogCommand.swift`
- Modify: `Tests/OpenClipTests/DebugLogCommandTests.swift`

**Interfaces:**
- Consumes: `Core.Log`, `OpenClip.RotatingFileLogSink`, `OpenClip.DebugLogStore`, `OpenClip.DebugLogCommand`
- Produces: Instant `--dump-logs` execution with 0ms indexing delay and registered rotating file sink for app lifecycle.

- [ ] **Step 1: Update `DebugLogCommand.swift` defaults and help message**

In `Sources/OpenClip/Platform/DebugLogging/DebugLogCommand.swift`:
Ensure `collectSeconds` defaults to `0` or minimal wait, update usage help string to reflect file appender location `~/Library/Logs/OpenClip/openclip.log`.

- [ ] **Step 2: Update `Sources/OpenClip/AppDelegate.swift`**

1. In `applicationDidFinishLaunching`:
   - Initialize and register `RotatingFileLogSink` via `Log.addSink(RotatingFileLogSink())`.
   - Initialize `_ = DebugLogStore.shared` (which adds the ring buffer sink).
2. In `runDumpLogsCommand`:
   - Initialize `_ = DebugLogStore.shared`.
   - Run initial action load:
     ```swift
     private func runDumpLogsCommand(_ options: DebugLogCommand.DumpOptions) {
         _ = DebugLogStore.shared
         Task {
             let optionStore = KeychainActionOptionStore()
             ExtensionManager.shared.actionFactory = DefaultActionFactory(optionStore: optionStore)
             ExtensionManager.shared.optionWriter = optionStore
             await ActionCoordinator.shared.loadInitialState()
             ActionCoordinator.shared.register(action: OpenURLAction())
             ActionCoordinator.shared.register(action: RevealInFinderAction())
             ActionCoordinator.shared.register(action: CompletionAction())
             if options.collectSeconds > 0 {
                 try? await Task.sleep(for: .seconds(options.collectSeconds))
             }
             let entries = DebugLogStore.shared.entries(matching: options.filter)
             print("OpenClip log dump (\(entries.count) entr\(entries.count == 1 ? "y" : "ies"))")
             for entry in entries {
                 print(DebugLogCommand.formattedLine(entry))
             }
             exit(0)
         }
     }
     ```

- [ ] **Step 3: Run all unit tests and verify command argument tests**

Run: `./scripts/test.sh`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add Sources/OpenClip/AppDelegate.swift Sources/OpenClip/Platform/DebugLogging/DebugLogCommand.swift Tests/OpenClipTests/DebugLogCommandTests.swift
git commit -m "feat(app): configure dual sinks in AppDelegate and optimize --dump-logs execution"
```

---

### Task 5: Documentation Updates and End-to-End Verification

**Files:**
- Modify: `docs/logging.md`

- [ ] **Step 1: Update `docs/logging.md`**

Update `docs/logging.md` to reflect:
- Pure `LogSink` architecture with multi-sink broadcast.
- The 3 sinks:
  1. `os.Logger` (zero-cost kernel trace for Console.app & `log stream`).
  2. In-Memory Ring Buffer (`DebugLogBuffer` / `DebugLogStore`, 500 lines, 0ms latency for `--dump-logs`).
  3. Rotating File Appender (`RotatingFileLogSink` at `~/Library/Logs/OpenClip/openclip.log`, 5MB cap, max 3 backups).
- Removal of `OSLogStore` polling and elimination of `OSLogService.xpc` CPU churn.

- [ ] **Step 2: Run full test suite and clean build verification**

Run: `xcodegen generate && ./scripts/test.sh`
Expected: All tests pass, build succeeds cleanly.

- [ ] **Step 3: Commit**

```bash
git add docs/logging.md
git commit -m "docs: update logging documentation for production dual-sink architecture"
```
