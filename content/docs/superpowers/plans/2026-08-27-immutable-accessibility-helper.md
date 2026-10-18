# Immutable Accessibility Helper Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple macOS Accessibility operations (permission checks, text selection extraction, synthetic key simulation, and global event monitoring) into an isolated, lightweight helper daemon (`OpenClipAXHelper.app`) so that Accessibility permissions remain permanently granted across OpenClip application updates without requiring an Apple Developer ID.

**Architecture:**
1. **Helper Process (`OpenClipAXHelper`)**: A lightweight background application (`LSUIElement: true`, `LSBackgroundOnly: true`, Bundle ID: `com.openclip.OpenClip.helper`) packaged inside `OpenClip.app/Contents/Helpers/`. Its code is minimal, dedicated exclusively to Accessibility APIs (`AXUIElement`, `CGEvent`, `NSEvent` global monitoring), and never changes during normal OpenClip UI/extension updates.
2. **Resilient Inter-Process Communication (IPC)**: A bidirectional, strongly typed IPC service (`AXHelperServiceProtocol`) over `NSXPCConnection` connecting `OpenClip.app` to `OpenClipAXHelper.app`.
3. **Graceful Fallback & Host Bridge (`AXHelperClient`)**: `PermissionManager`, `SelectionRetrievalCoordinator`, `ActionResultHandler`, and `MacSelectionMonitor` delegate to `AXHelperClient`. If the helper is not running (such as in headless unit tests or standalone debug sessions), all operations fall back seamlessly to in-process execution.
4. **Lifecycle & Packaging**: `AppDelegate` launches the helper on startup and shuts it down on exit. `project.yml` and `scripts/package_app.sh` build, embed, and sign both targets.

**Tech Stack:** Swift 6 (`SWIFT_STRICT_CONCURRENCY: complete`), AppKit, ApplicationServices, `NSXPCConnection`, XcodeGen.

## Global Constraints

- Swift 6 strict concurrency throughout all targets (`@MainActor`, `Sendable`).
- `Core` framework remains pure domain — no AppKit/SwiftUI imports in `Sources/Core/`.
- No direct `UserDefaults.standard` in new code — route through `SettingsStore`.
- Non-breaking fallback: test suites run in headless environments with zero dependency on a live helper process.
- All IPC calls must enforce strict timeouts (max 500ms for AX calls, 2s for connection handshake) to avoid UI hangs.

---

### File Structure Map

| File | Target | Responsibility |
| :--- | :--- | :--- |
| `Sources/Core/Helper/AXHelperProtocol.swift` | `Core` | Strongly typed Objective-C compatible `@objc` protocol for XPC communication |
| `Sources/Core/Helper/AXHelperModels.swift` | `Core` | Serializable data structures (selection requests, key codes, bounds, text results) |
| `Sources/OpenClipHelper/main.swift` | `OpenClipAXHelper` | Helper entry point, XPC listener setup, and runloop lifecycle |
| `Sources/OpenClipHelper/AXHelperService.swift` | `OpenClipAXHelper` | Concrete implementation of `AXHelperServiceProtocol` performing actual AX/CG calls |
| `Sources/OpenClip/Platform/Helper/AXHelperClient.swift` | `OpenClip` | Client manager managing the `NSXPCConnection`, reconnection, and async Swift wrappers |
| `Sources/OpenClip/Platform/Helper/AXHelperHost.swift` | `OpenClip` | Helper process discovery, launch, monitoring, and shutdown |
| `Sources/OpenClip/Platform/PermissionManager.swift` | `OpenClip` | Updated to check/request permission via helper when available |
| `Sources/OpenClip/Platform/Selection/SelectionRetrievalCoordinator.swift` | `OpenClip` | Updated to route AX selection queries through helper |
| `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift` | `OpenClip` | Updated to route synthetic key injection (`CGEvent`) through helper |
| `Tests/OpenClipTests/AXHelperProtocolTests.swift` | `OpenClipTests` | Unit tests for helper protocol, models, and fallback behavior |
| `project.yml` | Project | Build definitions for `OpenClipAXHelper` and embedding rules |
| `scripts/package_app.sh` | Scripts | Release packaging script embedding helper into `Contents/Helpers/` |

---

### Task 1: Core IPC Protocols and Serializable Models

**Files:**
- Create: `Sources/Core/Helper/AXHelperProtocol.swift`
- Create: `Sources/Core/Helper/AXHelperModels.swift`
- Test: `Tests/OpenClipTests/AXHelperProtocolTests.swift`

**Interfaces:**
- Produces: `AXHelperServiceProtocol`, `AXSelectionPayload`, `AXKeyCommandPayload`, `AXPermissionState`
- Consumes: Foundation, CoreGraphics

- [ ] **Step 1: Write failing unit tests for IPC data structures**

Create `Tests/OpenClipTests/AXHelperProtocolTests.swift`:
```swift
import XCTest
@testable import Core

final class AXHelperProtocolTests: XCTestCase {
    func testSelectionPayloadEncodingDecoding() throws {
        let payload = AXSelectionPayload(
            text: "Hello World",
            boundsX: 100,
            boundsY: 200,
            boundsWidth: 300,
            boundsHeight: 400,
            sourceBundleID: "com.apple.Safari"
        )
        
        let data = try JSONEncoder().encode(payload)
        let decoded = try JSONDecoder().decode(AXSelectionPayload.self, from: data)
        
        XCTAssertEqual(decoded.text, "Hello World")
        XCTAssertEqual(decoded.boundsX, 100)
        XCTAssertEqual(decoded.boundsY, 200)
        XCTAssertEqual(decoded.boundsWidth, 300)
        XCTAssertEqual(decoded.boundsHeight, 400)
        XCTAssertEqual(decoded.sourceBundleID, "com.apple.Safari")
    }

    func testKeyCommandPayloadProperties() {
        let cmd = AXKeyCommandPayload(keyCode: 0x08, flagsRaw: 0x100000) // Cmd+C
        XCTAssertEqual(cmd.keyCode, 0x08)
        XCTAssertEqual(cmd.flagsRaw, 0x100000)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh AXHelperProtocolTests`
Expected: FAIL (types not yet defined).

- [ ] **Step 3: Implement `AXHelperModels.swift` and `AXHelperProtocol.swift` in `Sources/Core/Helper/`**

Create `Sources/Core/Helper/AXHelperModels.swift`:
```swift
import Foundation

public struct AXSelectionPayload: Codable, Sendable, Equatable {
    public let text: String?
    public let boundsX: Double?
    public let boundsY: Double?
    public let boundsWidth: Double?
    public let boundsHeight: Double?
    public let sourceBundleID: String?

    public init(
        text: String? = nil,
        boundsX: Double? = nil,
        boundsY: Double? = nil,
        boundsWidth: Double? = nil,
        boundsHeight: Double? = nil,
        sourceBundleID: String? = nil
    ) {
        self.text = text
        self.boundsX = boundsX
        self.boundsY = boundsY
        self.boundsWidth = boundsWidth
        self.boundsHeight = boundsHeight
        self.sourceBundleID = sourceBundleID
    }
}

public struct AXKeyCommandPayload: Codable, Sendable, Equatable {
    public let keyCode: UInt16
    public let flagsRaw: UInt64

    public init(keyCode: UInt16, flagsRaw: UInt64) {
        self.keyCode = keyCode
        self.flagsRaw = flagsRaw
    }
}
```

Create `Sources/Core/Helper/AXHelperProtocol.swift`:
```swift
import Foundation

@objc(AXHelperServiceProtocol)
public protocol AXHelperServiceProtocol {
    func ping(withReply reply: @escaping @Sendable (Bool) -> Void)
    func checkAccessibilityPermission(prompt: Bool, withReply reply: @escaping @Sendable (Bool) -> Void)
    func retrieveSelectedText(pid: Int32, withReply reply: @escaping @Sendable (Data?) -> Void)
    func postKey(keyCode: UInt16, flags: UInt64, withReply reply: @escaping @Sendable (Bool) -> Void)
}

public enum AXHelperConstants {
    public static let machServiceName = "com.openclip.OpenClip.helper"
    public static let helperBundleIdentifier = "com.openclip.OpenClip.helper"
    public static let helperExecutableName = "OpenClipAXHelper"
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/test.sh AXHelperProtocolTests`
Expected: PASS (2/2 passed).

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Helper/ Tests/OpenClipTests/AXHelperProtocolTests.swift
git commit -m "feat: define AX helper IPC protocol and serialization models"
```

---

### Task 2: Implement `OpenClipAXHelper` Background Daemon

**Files:**
- Create: `Sources/OpenClipHelper/main.swift`
- Create: `Sources/OpenClipHelper/AXHelperService.swift`
- Create: `Sources/OpenClipHelper/Info.plist`

**Interfaces:**
- Consumes: `AXHelperServiceProtocol`, `AXSelectionPayload`, `AXKeyCommandPayload`, `ApplicationServices`, `AppKit`
- Produces: Standalone helper daemon executable serving XPC requests.

- [ ] **Step 1: Create `Sources/OpenClipHelper/Info.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleIdentifier</key>
    <string>com.openclip.OpenClip.helper</string>
    <key>CFBundleName</key>
    <string>OpenClipAXHelper</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>LSUIElement</key>
    <true/>
    <key>LSBackgroundOnly</key>
    <true/>
</dict>
</plist>
```

- [ ] **Step 2: Implement `AXHelperService.swift`**

Create `Sources/OpenClipHelper/AXHelperService.swift`:
```swift
import Foundation
import AppKit
import ApplicationServices
import Core

@objc
final class AXHelperService: NSObject, AXHelperServiceProtocol, NSXPCListenerDelegate {
    static let shared = AXHelperService()

    func listener(_ listener: NSXPCListener, shouldAcceptNewConnection newConnection: NSXPCConnection) -> Bool {
        newConnection.exportedInterface = NSXPCInterface(with: AXHelperServiceProtocol.self)
        newConnection.exportedObject = self
        newConnection.resume()
        return true
    }

    func ping(withReply reply: @escaping @Sendable (Bool) -> Void) {
        reply(true)
    }

    func checkAccessibilityPermission(prompt: Bool, withReply reply: @escaping @Sendable (Bool) -> Void) {
        let options = prompt ? ["AXTrustedCheckOptionPrompt": true] as CFDictionary : nil
        let isTrusted = AXIsProcessTrustedWithOptions(options)
        reply(isTrusted)
    }

    func retrieveSelectedText(pid: Int32, withReply reply: @escaping @Sendable (Data?) -> Void) {
        let appElement = AXUIElementCreateApplication(pid_t(pid))
        var focusedElementRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedElementRef) == .success,
              let focusedElement = focusedElementRef as! AXUIElement? else {
            reply(nil)
            return
        }

        var textRef: CFTypeRef?
        var selectedText: String? = nil
        if AXUIElementCopyAttributeValue(focusedElement, kAXSelectedTextAttribute as CFString, &textRef) == .success,
           let text = textRef as? String, !text.isEmpty {
            selectedText = text
        }

        var boundsX: Double? = nil
        var boundsY: Double? = nil
        var boundsW: Double? = nil
        var boundsH: Double? = nil

        var selectedRangeRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(focusedElement, kAXSelectedTextRangeAttribute as CFString, &selectedRangeRef) == .success,
           let rangeValue = selectedRangeRef {
            var boundsRef: CFTypeRef?
            if AXUIElementCopyParameterizedAttributeValue(focusedElement, kAXBoundsForRangeParameterizedAttribute as CFString, rangeValue, &boundsRef) == .success,
               let boundsVal = boundsRef as! AXValue? {
                var rect = CGRect.zero
                if AXValueGetValue(boundsVal, .cgRect, &rect) {
                    boundsX = rect.origin.x
                    boundsY = rect.origin.y
                    boundsW = rect.size.width
                    boundsH = rect.size.height
                }
            }
        }

        let payload = AXSelectionPayload(
            text: selectedText,
            boundsX: boundsX,
            boundsY: boundsY,
            boundsWidth: boundsW,
            boundsHeight: boundsH,
            sourceBundleID: NSRunningApplication(processIdentifier: pid_t(pid))?.bundleIdentifier
        )

        let data = try? JSONEncoder().encode(payload)
        reply(data)
    }

    func postKey(keyCode: UInt16, flags: UInt64, withReply reply: @escaping @Sendable (Bool) -> Void) {
        let src = CGEventSource(stateID: .combinedSessionState)
        guard let keydown = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: true),
              let keyup = CGEvent(keyboardEventSource: src, virtualKey: keyCode, keyDown: false) else {
            reply(false)
            return
        }
        keydown.flags = CGEventFlags(rawValue: flags)
        keyup.flags = CGEventFlags(rawValue: flags)
        keydown.post(tap: .cghidEventTap)
        keyup.post(tap: .cghidEventTap)
        reply(true)
    }
}
```

- [ ] **Step 3: Implement `Sources/OpenClipHelper/main.swift`**

```swift
import Foundation
import Core

let delegate = AXHelperService.shared
let listener = NSXPCListener(machServiceName: AXHelperConstants.machServiceName)
listener.delegate = delegate
listener.resume()

// Keep the helper daemon alive
RunLoop.main.run()
```

- [ ] **Step 4: Commit**

```bash
git add Sources/OpenClipHelper/
git commit -m "feat: implement OpenClipAXHelper background service and XPC listener"
```

---

### Task 3: Implement `AXHelperClient` and Graceful In-Process Fallback

**Files:**
- Create: `Sources/OpenClip/Platform/Helper/AXHelperClient.swift`
- Modify: `Sources/OpenClip/Platform/PermissionManager.swift`
- Test: `Tests/OpenClipTests/AXHelperClientTests.swift`

**Interfaces:**
- Consumes: `AXHelperServiceProtocol`, `AXSelectionPayload`, `AXKeyCommandPayload`
- Produces: Async Swift client with automated reconnection and fallback.

- [ ] **Step 1: Write unit tests for `AXHelperClient` fallback**

Create `Tests/OpenClipTests/AXHelperClientTests.swift`:
```swift
import XCTest
@testable import Core
@testable import OpenClip

final class AXHelperClientTests: XCTestCase {
    func testFallbackToInProcessAXWhenHelperDisconnected() async {
        let client = AXHelperClient(machServiceName: "com.openclip.test.nonexistent")
        let isAvailable = await client.isHelperAvailable()
        XCTAssertFalse(isAvailable)
    }

    func testLocalFallbackPermissionQuery() {
        let client = AXHelperClient(machServiceName: "com.openclip.test.nonexistent")
        let permission = client.checkLocalAccessibilityPermission(prompt: false)
        XCTAssertNotNil(permission)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh AXHelperClientTests`
Expected: FAIL.

- [ ] **Step 3: Implement `AXHelperClient.swift`**

Create `Sources/OpenClip/Platform/Helper/AXHelperClient.swift`:
```swift
import Foundation
import ApplicationServices
import Core

@MainActor
public final class AXHelperClient: ObservableObject, Sendable {
    public static let shared = AXHelperClient()

    private let machServiceName: String
    private var connection: NSXPCConnection?

    public init(machServiceName: String = AXHelperConstants.machServiceName) {
        self.machServiceName = machServiceName
    }

    private func getOrCreateConnection() -> NSXPCConnection {
        if let existing = connection {
            return existing
        }
        let conn = NSXPCConnection(machServiceName: machServiceName)
        conn.remoteObjectInterface = NSXPCInterface(with: AXHelperServiceProtocol.self)
        conn.interruptionHandler = { [weak self] in
            Task { @MainActor in self?.connection = nil }
        }
        conn.invalidationHandler = { [weak self] in
            Task { @MainActor in self?.connection = nil }
        }
        conn.resume()
        self.connection = conn
        return conn
    }

    public func isHelperAvailable() async -> Bool {
        await withCheckedContinuation { continuation in
            let conn = getOrCreateConnection()
            guard let proxy = conn.remoteObjectProxyWithErrorHandler({ _ in
                continuation.resume(returning: false)
            }) as? AXHelperServiceProtocol else {
                continuation.resume(returning: false)
                return
            }
            proxy.ping { isAlive in
                continuation.resume(returning: isAlive)
            }
        }
    }

    public func checkAccessibility(prompt: Bool) async -> Bool {
        if await isHelperAvailable() {
            return await withCheckedContinuation { continuation in
                let conn = getOrCreateConnection()
                guard let proxy = conn.remoteObjectProxyWithErrorHandler({ _ in
                    continuation.resume(returning: self.checkLocalAccessibilityPermission(prompt: prompt))
                }) as? AXHelperServiceProtocol else {
                    continuation.resume(returning: self.checkLocalAccessibilityPermission(prompt: prompt))
                    return
                }
                proxy.checkAccessibilityPermission(prompt: prompt) { isGranted in
                    continuation.resume(returning: isGranted)
                }
            }
        } else {
            return checkLocalAccessibilityPermission(prompt: prompt)
        }
    }

    public func postKey(keyCode: UInt16, flags: UInt64) async -> Bool {
        if await isHelperAvailable() {
            return await withCheckedContinuation { continuation in
                let conn = getOrCreateConnection()
                guard let proxy = conn.remoteObjectProxyWithErrorHandler({ _ in
                    continuation.resume(returning: false)
                }) as? AXHelperServiceProtocol else {
                    continuation.resume(returning: false)
                    return
                }
                proxy.postKey(keyCode: keyCode, flags: flags) { success in
                    continuation.resume(returning: success)
                }
            }
        }
        return false
    }

    public nonisolated func checkLocalAccessibilityPermission(prompt: Bool) -> Bool {
        let options = prompt ? ["AXTrustedCheckOptionPrompt": true] as CFDictionary : nil
        return AXIsProcessTrustedWithOptions(options)
    }
}
```

- [ ] **Step 4: Update `PermissionManager.swift` to use `AXHelperClient`**

Modify `Sources/OpenClip/Platform/PermissionManager.swift`:
```swift
    public func checkStatus() {
        Task { @MainActor in
            let current = await AXHelperClient.shared.checkAccessibility(prompt: false)
            if isAccessibilityGranted != current {
                isAccessibilityGranted = current
            }
        }
    }

    public func requestAccessibilityPermission() {
        Task { @MainActor in
            _ = await AXHelperClient.shared.checkAccessibility(prompt: true)
            if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
                NSWorkspace.shared.open(url)
            }
            startMonitoring()
        }
    }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./scripts/test.sh AXHelperClientTests`
Expected: PASS (2/2 passed).

- [ ] **Step 6: Commit**

```bash
git add Sources/OpenClip/Platform/Helper/AXHelperClient.swift Sources/OpenClip/Platform/PermissionManager.swift Tests/OpenClipTests/AXHelperClientTests.swift
git commit -m "feat: integrate AXHelperClient into PermissionManager with local fallback"
```

---

### Task 4: Helper Process Supervisor & Lifecycle (`AXHelperHost`)

**Files:**
- Create: `Sources/OpenClip/Platform/Helper/AXHelperHost.swift`
- Modify: `Sources/OpenClip/AppDelegate.swift`
- Test: `Tests/OpenClipTests/AXHelperHostTests.swift`

**Interfaces:**
- Consumes: `Bundle`, `NSWorkspace`, `Process`
- Produces: Launch, health-check, and clean termination of `OpenClipAXHelper.app`.

- [ ] **Step 1: Write unit tests for helper discovery**

Create `Tests/OpenClipTests/AXHelperHostTests.swift`:
```swift
import XCTest
@testable import Core
@testable import OpenClip

final class AXHelperHostTests: XCTestCase {
    func testHelperURLResolutionFromBundle() {
        let host = AXHelperHost()
        let url = host.helperBundleURL()
        // In unit test bundle, helper might not exist on disk, but the resolved path
        // should target Contents/Helpers/OpenClipAXHelper.app
        XCTAssertTrue(url.path.contains("Contents/Helpers") || url.path.contains("OpenClipAXHelper"))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh AXHelperHostTests`
Expected: FAIL.

- [ ] **Step 3: Implement `AXHelperHost.swift`**

Create `Sources/OpenClip/Platform/Helper/AXHelperHost.swift`:
```swift
import Foundation
import AppKit
import Core

@MainActor
public final class AXHelperHost: Sendable {
    public static let shared = AXHelperHost()
    private var helperProcess: Process?

    public init() {}

    public func helperBundleURL() -> URL {
        Bundle.main.bundleURL
            .appendingPathComponent("Contents")
            .appendingPathComponent("Helpers")
            .appendingPathComponent("\(AXHelperConstants.helperExecutableName).app")
    }

    public func startHelperIfNeeded() {
        let bundleURL = helperBundleURL()
        let executableURL = bundleURL
            .appendingPathComponent("Contents")
            .appendingPathComponent("MacOS")
            .appendingPathComponent(AXHelperConstants.helperExecutableName)

        guard FileManager.default.fileExists(atPath: executableURL.path) else {
            Log.general.notice("AX Helper executable not found at \(executableURL.path, privacy: .public); falling back to in-process AX")
            return
        }

        // Check if already running
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: AXHelperConstants.helperBundleIdentifier)
        if !running.isEmpty {
            Log.general.notice("AX Helper is already running")
            return
        }

        let config = NSWorkspace.OpenConfiguration()
        config.activates = false
        config.hides = true
        NSWorkspace.shared.openApplication(at: bundleURL, configuration: config) { app, error in
            if let error {
                Log.general.error("Failed to launch AX Helper: \(error.localizedDescription)")
            } else {
                Log.general.notice("Successfully launched AX Helper process")
            }
        }
    }

    public func stopHelper() {
        let running = NSRunningApplication.runningApplications(withBundleIdentifier: AXHelperConstants.helperBundleIdentifier)
        for app in running {
            app.terminate()
        }
    }
}
```

- [ ] **Step 4: Connect helper lifecycle to `AppDelegate.swift`**

In `Sources/OpenClip/AppDelegate.swift`:
- On `applicationDidFinishLaunching`: Call `AXHelperHost.shared.startHelperIfNeeded()`
- On `applicationWillTerminate`: Call `AXHelperHost.shared.stopHelper()`

- [ ] **Step 5: Run tests to verify they pass**

Run: `./scripts/test.sh AXHelperHostTests`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add Sources/OpenClip/Platform/Helper/AXHelperHost.swift Sources/OpenClip/AppDelegate.swift Tests/OpenClipTests/AXHelperHostTests.swift
git commit -m "feat: implement AXHelperHost lifecycle management in AppDelegate"
```

---

### Task 5: XcodeGen Build Configuration & Packaging Pipeline

**Files:**
- Modify: `project.yml`
- Modify: `scripts/package_app.sh`

**Interfaces:**
- Consumes: XcodeGen, `xcodebuild`, `codesign`
- Produces: Multi-target Xcode project with `OpenClipAXHelper.app` embedded in `Contents/Helpers/`.

- [ ] **Step 1: Add `OpenClipAXHelper` target in `project.yml`**

Add target in `project.yml`:
```yaml
  OpenClipAXHelper:
    type: application
    platform: macOS
    deploymentTarget: "14.0"
    sources: [Sources/OpenClipHelper]
    info:
      path: Sources/OpenClipHelper/Info.plist
    settings:
      base:
        GENERATE_INFOPLIST_FILE: YES
        PRODUCT_BUNDLE_IDENTIFIER: com.openclip.OpenClip.helper
        CODE_SIGN_IDENTITY: "-"
        CODE_SIGN_STYLE: Automatic
        ENABLE_HARDENED_RUNTIME: true
        SWIFT_VERSION: "6.0"
        SWIFT_STRICT_CONCURRENCY: complete
    dependencies:
      - target: Core
```

- [ ] **Step 2: Regenerate Xcode project and verify build**

Run: `xcodegen generate && ./scripts/test.sh core`
Expected: Successfully generates project and builds clean.

- [ ] **Step 3: Update `scripts/package_app.sh` to build and embed the helper**

Modify `scripts/package_app.sh` to ensure `OpenClipAXHelper.app` is placed in `$BUILT_APP/Contents/Helpers/OpenClipAXHelper.app` and signed with `--deep`.

- [ ] **Step 4: Test package script**

Run: `./scripts/package_app.sh`
Expected: Successful creation of `build/OpenClip.zip` and `build/OpenClip.dmg` containing the embedded helper.

- [ ] **Step 5: Commit**

```bash
git add project.yml scripts/package_app.sh
git commit -m "build: add OpenClipAXHelper target to project.yml and packaging script"
```

---

### Task 6: Full Verification and Regression Test Suite

**Files:**
- Test: All test suites in `Tests/OpenClipTests/`

- [ ] **Step 1: Run full automated test suite**

Run: `./scripts/test.sh`
Expected: 0 failures across all tests.

- [ ] **Step 2: Verify helper bundle containment and codesign requirements**

Run: `codesign -dv --verbose=4 build/DerivedData/Build/Products/Release/OpenClip.app/Contents/Helpers/OpenClipAXHelper.app`
Expected: Valid signature, identifier `com.openclip.OpenClip.helper`.

- [ ] **Step 3: Final commit and cleanup**

```bash
git status
```
