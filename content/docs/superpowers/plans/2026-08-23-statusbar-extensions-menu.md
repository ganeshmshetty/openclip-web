# Status Bar Extensions Submenu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Extensions ▸" native submenu with checkmarks to the OpenClip status-bar menu, allowing users to view and toggle installed extension packages at whole-package granularity.

**Architecture:** Pure `Core` resolver model (`ExtensionPackageInfo` and `ExtensionPackageResolver`) extracts unique installed packages, display names, and enabled states from action lists; AppKit `StatusBarController` adopts `NSMenuDelegate` on the submenu to build the menu dynamically and handle toggle actions via `DefaultSettingsStore` and `ExtensionManager`.

**Tech Stack:** Swift 6, AppKit (`NSMenu`, `NSMenuItem`, `NSMenuDelegate`), Core architecture.

## Global Constraints

- Swift 6 with complete concurrency checking (`SWIFT_STRICT_CONCURRENCY: complete`).
- Core is pure (no AppKit/SwiftUI imports in `Sources/Core/`).
- State mutations route through `DefaultSettingsStore` and `SettingKey.disabledPackages`.
- No hotkeys or shortcuts for menu items.
- Full test suite must pass with 0 skips.

---

### Task 1: Core Extension Package Resolver Model

**Files:**
- Create: `Sources/Core/Extensions/ExtensionPackageInfo.swift`
- Test: `Tests/OpenClipTests/ExtensionPackageResolverTests.swift`

**Interfaces:**
- Produces: `ExtensionPackageInfo` (`id: String`, `displayName: String`, `isEnabled: Bool`), `ExtensionPackageResolver.resolvePackages(from: [any Action], disabledPackages: Set<String>) -> [ExtensionPackageInfo]`

- [ ] **Step 1: Write the failing unit test**
Create `Tests/OpenClipTests/ExtensionPackageResolverTests.swift` testing:
- Empty action list returns empty packages.
- Resolves single and multi-action packages correctly with deduplication.
- Extracts display name from `chrome.badge` (`.extensionPkg(name)`), falling back to `packageID`.
- Computes `isEnabled` based on presence in `disabledPackages`.
- Sorts packages alphabetically by display name.

- [ ] **Step 2: Run test to verify it fails**
Run: `./scripts/test.sh ExtensionPackageResolverTests`
Expected: FAIL (missing `ExtensionPackageResolver` / `ExtensionPackageInfo`)

- [ ] **Step 3: Write minimal implementation in Core**
Create `Sources/Core/Extensions/ExtensionPackageInfo.swift` with `ExtensionPackageInfo` and `ExtensionPackageResolver`.

- [ ] **Step 4: Run test to verify it passes**
Run: `./scripts/test.sh ExtensionPackageResolverTests`
Expected: PASS

---

### Task 2: Notification Name Additions

**Files:**
- Modify: `Sources/OpenClip/Notifications/Notification.Name+OpenClip.swift`

- [ ] **Step 1: Add typed Notification names**
Add `openClipExtensionsDidChange` and `openClipEnabledStateChanged` to `Notification.Name+OpenClip.swift`.

- [ ] **Step 2: Verify compilation**
Run: `./scripts/test.sh core`
Expected: PASS

---

### Task 3: Status Bar Extensions Submenu Presentation & Toggle Handling

**Files:**
- Modify: `Sources/OpenClip/StatusBarController.swift`

- [ ] **Step 1: Adopt `NSMenuDelegate` and build submenu**
- Make `StatusBarController` conform to `NSObject` and `NSMenuDelegate`.
- In `setupMenu()`, create the "Extensions" `NSMenuItem` and submenu, setting `extensionsMenu.delegate = self`.
- Implement `menuNeedsUpdate(_ menu: NSMenu)` to populate dynamic package items (or "No Extensions Installed" placeholder when empty).
- Implement `@objc private func toggleExtensionPackage(_ sender: NSMenuItem)` to toggle `disabledPackages`, call `ExtensionManager.shared.enablePackage(packageID:)` or `disablePackage(packageID:)`, and broadcast `openClipExtensionsDidChange`.

- [ ] **Step 2: Run full test suite to verify no regressions**
Run: `./scripts/test.sh`
Expected: PASS with 0 failures

---
