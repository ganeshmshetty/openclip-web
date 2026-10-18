# Streamlined Extension Trust & Actions Preferences Design

**Date:** 2026-08-23  
**Status:** Approved  

## 1. Context & Motivation

OpenClip's original extension trust model used an intrusive consent gate: whenever a package was added or modified, OpenClip posted macOS system notifications via `UNUserNotificationCenter`, rendered gated placeholder actions in the floating popup that showed warning toasts, and presented a modal `TrustModelView` sheet full of scary risk badges.

This design created high friction for legitimate user actions (installing from store or file picker) while adding visual clutter with a redundant "Installed" sub-tab in Preferences.

## 2. Core Principles & Goals

1. **Frictionless Happy Path**:
   - In-app Store installs (from GitHub catalog) and "Install Extension…" file picker installs are explicit user actions and are **auto-trusted and enabled immediately**.
   - Developer extensions (`source == .developer` / local workspace) continue to **hot-reload silently on save** without disabling.
2. **Silent Fail-Closed Security**:
   - Files dropped into `~/.openclip/extensions` or modified externally without in-app action are **silently disabled** (hash mismatch / unknown source).
   - **No push notifications, no modal popups, no intrusive dialogs.**
   - Gated actions do not appear in the floating popup when selecting text.
3. **Intuitive In-Place Recovery**:
   - In the **Actions** tab of Preferences, disabled/gated extensions display a single red `info.circle.fill` icon next to the title.
   - Hovering over the icon shows a macOS tooltip (`.help(...)`) explaining why the extension was disabled.
   - Flipping the row's toggle switch to **ON** computes the current SHA-256 fingerprint, marks the package as trusted, clears the red badge, and enables the extension immediately.
4. **Simplified Preferences Navigation**:
   - Remove the `Installed` sub-tab from Preferences.
   - The Actions tab header becomes a 2-segment picker: `[ Actions | Store ]`.
   - All extension actions, groups, and packages are managed directly in the unified Actions list (reordering, enable toggling, uninstalling via trash button, configuration via gear button, and "Install Extension…").

## 3. Detailed Design

### 3.1 Trust Evaluation (`ExtensionTrustGate`)

- `ExtensionTrustGate.evaluate`:
  - `source == .store || source == .package` when `record == nil`: Auto-trust with current content hash (`trust[packageID] = "trusted"`), returning real actions if compatible.
  - `record == "trusted"` and matching hash: Active real actions.
  - `record == "trusted"` with `source == .developer`: Update stored hash to current hash and keep active (hot-reload).
  - `record == "trusted"` with hash mismatch (external edit): Set `trust[packageID] = "seen"`, gate with `.filesChanged`. No events or notifications emitted.
  - `record == nil` (manual drop-in after migration): Set `trust[packageID] = "seen"`, gate with `.notEnabled`. No events or notifications emitted.
  - `record == "revoked"`: Gated with `.revoked`.

### 3.2 Floating Popup Filtering (`ActionRegistry`)

- In `ActionRegistry.availableActions(for:)`:
  - Filter out `GatedExtensionAction` so gated placeholder actions do not show in the floating selection popup.

### 3.3 Actions Tab UI (`ActionsTabView`)

- Row Layout:
  ```
  [Chevron] [Icon] Title [🔴(i) Tooltip] ... [🗑 Trash] [Toggle] [⚙ Gear]
  ```
- Red Info Icon:
  - Symbol: `Image(systemName: "info.circle.fill")` in `Color.red`.
  - Displayed when the row's action is a `GatedExtensionAction` or the package is gated with reason `.filesChanged`, `.notEnabled`, or `.needsNewerApp`.
  - Tooltip (`.help`):
    - `.filesChanged`: `"This extension was modified externally. Toggle on to verify and re-enable."`
    - `.notEnabled`: `"New extension found in folder. Toggle on to enable."`
    - `.needsNewerApp(let req)`: `"Requires OpenClip \(req) or newer."`
- Toggle Binding:
  - For extension package rows / actions:
    - `get`: `action is not GatedExtensionAction && !disabledPackages.contains(packageID) && !disabledActionIDs.contains(action.id)`
    - `set`:
      - If `true`: Call `ExtensionManager.shared.enablePackage(packageID:)` (re-hashes and sets trusted), and remove from `disabledPackages` / `disabledActionIDs`.
      - If `false`: Call `ExtensionManager.shared.disablePackage(packageID:)` and add to `disabledPackages`.

### 3.4 Cleanup & Removal

- Delete `Sources/OpenClip/UI/Preferences/TrustModelView.swift`.
- Delete `Sources/OpenClip/UI/Preferences/InstalledExtensionsView.swift`.
- In `PreferencesView.swift`:
  - `ActionsSubTab` enum has cases `.actions` and `.store`.
  - Segmented control updated to 2 items.
  - Remove trust sheet presentations and `.installed` view case.
- In `AppDelegate.swift`:
  - Remove `handleTrustChange`, `postTrustNotification`, `userNotificationCenter` trust response handler, and `onTrustChange` observer.
- In `Notification.Name+OpenClip.swift`:
  - Remove `openClipOpenTrustModel`.
- In `ExtensionInstallPanel.swift`:
  - Remove `openClipOpenTrustModel` posting.

## 4. Testing Plan

- `ExtensionTrustGateTests`:
  - Test store and package installs auto-trust without gating.
  - Test file modifications on non-developer packages flip to gated without emitting notifications.
  - Test developer packages auto-update hash and stay active.
- `ExtensionManagerTrustTests`:
  - Test `enablePackage` re-hashes, marks trusted, and restores active actions.
  - Test `disablePackage` gates the package.
- Full test suite passes with 0 failures.
