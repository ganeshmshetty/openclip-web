# Streamlined Extension Trust & Actions Preferences Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Streamline extension security by removing intrusive trust modals, notifications, and the Installed tab, auto-trusting store/file installs, silently failing closed on external modifications with an inline red info badge in the Actions tab, and allowing instant 1-click re-enablement via toggle.

**Architecture:** 
1. `ExtensionTrustGate` auto-trusts store and file installs, hot-reloads developer extensions, and silently gates untrusted/modified extensions without emitting user notifications.
2. `ActionRegistry` filters gated placeholder actions from the floating selection popup.
3. `ActionsTabView` renders a red `info.circle.fill` badge with hover tooltip on gated rows and connects the toggle switch to `ExtensionManager.enablePackage`/`disablePackage`.
4. Obsolete trust modal sheet (`TrustModelView`), `InstalledExtensionsView`, and `UNUserNotificationCenter` trust banners are removed.

**Tech Stack:** Swift 6, AppKit + SwiftUI, Core (pure domain framework), XCTest, XcodeGen.

## Global Constraints

- Pure Core: no AppKit or SwiftUI in `Sources/Core/`.
- Strict Concurrency: `SWIFT_STRICT_CONCURRENCY: complete`.
- Route settings through `SettingsStore` / `SettingKey`.
- Regresion-free: all unit tests pass with zero skips or failures.

---

### Task 1: Update Core Trust Gate & Action Registry Floating Popup Filtering

**Files:**
- Modify: `Sources/Core/Extensions/Trust/ExtensionTrustGate.swift`
- Modify: `Sources/Core/Actions/ActionRegistry.swift`
- Test: `Tests/OpenClipTests/ExtensionTrustGateTests.swift`

- [ ] **Step 1: Update failing tests in `ExtensionTrustGateTests.swift`**
Update `ExtensionTrustGateTests` to assert that:
- Package file installs (`source == "package"`) auto-trust on install when `record == nil`.
- File modifications on non-developer extensions flip to gated with empty events (`events.isEmpty`).
- Gated actions are excluded from `ActionRegistry.availableActions(for:)`.

- [ ] **Step 2: Run tests to verify failures**
Run: `./scripts/test.sh ExtensionTrustGateTests`

- [ ] **Step 3: Update `ExtensionTrustGate.swift` and `ActionRegistry.swift`**
In `ExtensionTrustGate.swift`:
- Change `if source == .store, record == nil` to `if (source == .store || source == .package), record == nil`.
- Do not append `.newPackage` or `.tampered` events on silent gating (keep events empty or remove).
In `ActionRegistry.swift`:
- In `passes(_ action: any Action)`, ensure `!(action is GatedExtensionAction)` so gated actions never appear in `availableActions(for:)`.

- [ ] **Step 4: Run tests to verify they pass**
Run: `./scripts/test.sh ExtensionTrustGateTests`

---

### Task 2: Remove Trust Notifications and Modal Presentation Wiring from AppDelegate & Notifications

**Files:**
- Modify: `Sources/OpenClip/AppDelegate.swift`
- Modify: `Sources/OpenClip/Notifications/Notification.Name+OpenClip.swift`
- Modify: `Sources/OpenClip/UI/Preferences/ExtensionInstallPanel.swift`
- Test: `Tests/OpenClipTests/ExtensionManagerTrustTests.swift`

- [ ] **Step 1: Clean up `AppDelegate.swift`**
- Remove `handleTrustChange`, `postTrustNotification`, and `userNotificationCenter` trust routing.
- Remove `onTrustChange` subscription in `AppDelegate`.

- [ ] **Step 2: Clean up `Notification.Name+OpenClip.swift` & `ExtensionInstallPanel.swift`**
- Remove `.openClipOpenTrustModel` notification.
- Remove post of `.openClipOpenTrustModel` in `ExtensionInstallPanel.swift`.

- [ ] **Step 3: Update `ExtensionManagerTrustTests.swift`**
Update tests for silent gating without expecting `onTrustChange` events.

- [ ] **Step 4: Run tests to verify**
Run: `./scripts/test.sh ExtensionManagerTrustTests`

---

### Task 3: Delete Obsolete Views and Simplify PreferencesView Sub-Tabs

**Files:**
- Delete: `Sources/OpenClip/UI/Preferences/TrustModelView.swift`
- Delete: `Sources/OpenClip/UI/Preferences/InstalledExtensionsView.swift`
- Modify: `Sources/OpenClip/UI/Preferences/PreferencesView.swift`

- [ ] **Step 1: Delete `TrustModelView.swift` and `InstalledExtensionsView.swift`**
Remove files from filesystem.

- [ ] **Step 2: Update `PreferencesView.swift`**
- Update `ActionsSubTab` to only contain `actions = "Actions"` and `store = "Store"`.
- Remove `.installed` picker case and view.
- Remove `.trust` sheet route from `PreferencesSheet` and sheet presenter.

- [ ] **Step 3: Re-generate Xcode project**
Run: `xcodegen generate`

---

### Task 4: Add Inline Red Info Badge and Wire Trust Toggling in ActionsTabView

**Files:**
- Modify: `Sources/OpenClip/UI/Preferences/ActionsTabView.swift`
- Test: `Tests/OpenClipTests/ExtensionManagerTrustTests.swift`

- [ ] **Step 1: Update `ActionRowView` and `PackageHeaderRowView` in `ActionsTabView.swift`**
- Check if action is `GatedExtensionAction` or if package is gated (`ExtensionGateReason`).
- Render `Image(systemName: "info.circle.fill")` in `Color.red` with `.help(...)` tooltip explaining the gate reason:
  - `.filesChanged`: `"This extension was modified externally. Toggle on to verify and re-enable."`
  - `.notEnabled`: `"New extension found in folder. Toggle on to enable."`
  - `.needsNewerApp(let req)`: `"Requires OpenClip \(req) or newer."`
- Update `enabledBinding`:
  - When turning ON a gated or extension package: call `ExtensionManager.shared.enablePackage(packageID:)` asynchronously and clear disabled states.
  - When turning OFF: call `ExtensionManager.shared.disablePackage(packageID:)` and update `disabledPackages`.

- [ ] **Step 2: Run Core and App tests**
Run: `./scripts/test.sh`

---

### Task 5: End-to-End Verification & Housekeeping

**Files:**
- Verify: Full test suite (`./scripts/test.sh`)
- Verify: Extension installation and toggling tests

- [ ] **Step 1: Run full test suite**
Run: `./scripts/test.sh`
Expected: 0 failures, all tests pass.

- [ ] **Step 2: Verify build and project generation**
Run: `./scripts/dev_run.sh` or build verification.
