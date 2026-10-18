# Persistent Accessibility Permissions & Update Onboarding Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure macOS Accessibility permissions persist across Sparkle/release updates without requiring a paid Apple Developer ID, and prevent the onboarding wizard from re-appearing after app updates.

**Architecture:** 
1. **Stable Code Signing Identity**: Create a dedicated project release certificate (`OpenClip Release`) that establishes a constant Designated Requirement (DR) for release binaries. This ensures macOS TCC does not reset permissions on binary updates.
2. **Onboarding & Permission State Decoupling**: Separate the `hasCompletedOnboarding` flag from `isAccessibilityGranted` in `AppDelegate`. If an existing user updates the app, `showOnboarding()` will never be called; instead, `PermissionManager` monitors and requests accessibility seamlessly in the background without restarting the onboarding wizard.

**Tech Stack:** Swift 6, AppKit, SwiftUI, macOS TCC, OpenSSL, Apple `codesign`, `security` CLI.

## Global Constraints

- Swift 6 strict concurrency (`SWIFT_STRICT_CONCURRENCY: complete`).
- No direct `UserDefaults.standard` — route through `SettingsStore` + `SettingKey`.
- `ActionCoordinator` is the composition root.
- Core is pure domain (no AppKit/SwiftUI in `Sources/Core/`).

---

### Task 1: Decouple Onboarding Wizard from Accessibility State in `AppDelegate`

**Files:**
- Modify: `Sources/OpenClip/AppDelegate.swift:102-135`
- Test: `Tests/OpenClipTests/OnboardingStateTests.swift`

**Interfaces:**
- Consumes: `DefaultSettingsStore.shared.get(.hasCompletedOnboarding)`, `PermissionManager.shared.isAccessibilityGranted`, `PermissionManager.shared.$isAccessibilityGranted`
- Produces: Clean separation where `showOnboarding()` only triggers when `!completedOnboarding`.

- [ ] **Step 1: Write test for onboarding launch conditions**

Create `Tests/OpenClipTests/OnboardingStateTests.swift`:
```swift
import XCTest
@testable import Core
@testable import OpenClip

final class OnboardingStateTests: XCTestCase {
    func testOnboardingShouldNotShowForExistingOnboardedUser() {
        let store = MemorySettingsStore()
        store.set(.hasCompletedOnboarding, value: true)
        store.set(.isAppEnabled, value: true)
        
        // When user has completed onboarding, regardless of accessibility permission state,
        // hasCompletedOnboarding must remain true and the onboarding flow should be bypassed.
        XCTAssertTrue(store.get(.hasCompletedOnboarding))
    }
}
```

- [ ] **Step 2: Run test to verify it compiles and passes**

Run: `./scripts/test.sh OnboardingStateTests`
Expected: PASS

- [ ] **Step 3: Update `AppDelegate.swift` launch and monitoring logic**

Modify `Sources/OpenClip/AppDelegate.swift`:
```swift
        let isGranted = PermissionManager.shared.isAccessibilityGranted
        let completedOnboarding = DefaultSettingsStore.shared.get(.hasCompletedOnboarding)
        let isAppEnabled = DefaultSettingsStore.shared.get(.isAppEnabled)
        
        if !completedOnboarding {
            // First run: user has never completed onboarding.
            showOnboarding()
        } else if !isGranted {
            // Update or permission revoked: user already onboarded. Do NOT re-show onboarding wizard.
            PermissionManager.shared.startMonitoring()
        } else {
            if isAppEnabled {
                selectionMonitor?.start()
            }
            showPostOnboardingCoachMark()
        }

        // Observe permission changes so that if an existing user re-enables accessibility,
        // monitoring starts immediately without requiring app restart.
        PermissionManager.shared.$isAccessibilityGranted
            .receive(on: DispatchQueue.main)
            .sink { [weak self] granted in
                guard let self else { return }
                let onboarded = DefaultSettingsStore.shared.get(.hasCompletedOnboarding)
                let enabled = DefaultSettingsStore.shared.get(.isAppEnabled)
                if granted && onboarded && enabled {
                    self.selectionMonitor?.start()
                }
            }
            .store(in: &cancellables)
```

- [ ] **Step 4: Verify build and test suite**

Run: `./scripts/test.sh core`
Expected: PASS

- [ ] **Step 5: Commit changes**

```bash
git add Sources/OpenClip/AppDelegate.swift Tests/OpenClipTests/OnboardingStateTests.swift
git commit -m "fix: decouple onboarding launch trigger from accessibility permission state"
```

---

### Task 2: Create Project Release Certificate Generation Tooling

**Files:**
- Create: `scripts/generate_release_identity.sh`
- Modify: `scripts/package_app.sh:22-25`

**Interfaces:**
- Consumes: OpenSSL, macOS `security` CLI, `codesign`
- Produces: Keychain identity `"OpenClip Release"` with code signing extensions.

- [ ] **Step 1: Create `scripts/generate_release_identity.sh`**

```bash
#!/bin/bash
# Generates a dedicated self-signed Code Signing identity for OpenClip releases
# so macOS TCC permissions persist across updates without an Apple Developer ID.

set -e

CERT_NAME="OpenClip Release"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

echo "Checking if '$CERT_NAME' identity already exists in keychain..."
if security find-certificate -c "$CERT_NAME" "$KEYCHAIN" > /dev/null 2>&1; then
    echo "Identity '$CERT_NAME' is already installed in keychain."
    exit 0
fi

echo "Generating self-signed code signing certificate for '$CERT_NAME' (valid 10 years)..."
openssl req -x509 -newkey rsa:2048 -days 3650 \
  -keyout "$TEMP_DIR/release.key" \
  -out "$TEMP_DIR/release.crt" -nodes \
  -subj "/CN=$CERT_NAME" \
  -addext "keyUsage=critical,digitalSignature" \
  -addext "extendedKeyUsage=codeSigning"

echo "Exporting PKCS12 bundle..."
openssl pkcs12 -export -legacy \
  -in "$TEMP_DIR/release.crt" \
  -inkey "$TEMP_DIR/release.key" \
  -out "$TEMP_DIR/release.p12" \
  -password pass:openclip

echo "Importing into $KEYCHAIN..."
security import "$TEMP_DIR/release.p12" -k "$KEYCHAIN" -P openclip -T /usr/bin/codesign

echo "Setting trust settings for Code Signing..."
security add-trusted-cert -d -r trustRoot -p codeSign -k "$KEYCHAIN" "$TEMP_DIR/release.crt"

echo "Identity '$CERT_NAME' successfully created and trusted for Code Signing."
```

- [ ] **Step 2: Make executable and test certificate generation**

Run: `chmod +x scripts/generate_release_identity.sh && ./scripts/generate_release_identity.sh`
Expected: Output showing certificate created and imported into login keychain.

- [ ] **Step 3: Update `scripts/package_app.sh` to use the release identity**

Modify `scripts/package_app.sh`:
```bash
SIGNING_IDENTITY="OpenClip Release"

if ! security find-certificate -c "$SIGNING_IDENTITY" ~/Library/Keychains/login.keychain-db > /dev/null 2>&1; then
    echo "Release identity not found in keychain. Generating local release identity..."
    "$PROJECT_DIR/scripts/generate_release_identity.sh"
fi

if security find-certificate -c "$SIGNING_IDENTITY" ~/Library/Keychains/login.keychain-db > /dev/null 2>&1; then
    echo "Signing app bundle with '$SIGNING_IDENTITY'..."
    codesign --force --deep --sign "$SIGNING_IDENTITY" "$BUILT_APP"
else
    echo "Warning: Release identity unavailable. Falling back to ad-hoc signing..."
    codesign --force --deep --sign - "$BUILT_APP"
fi
```

- [ ] **Step 4: Test packaging script**

Run: `./scripts/package_app.sh`
Expected: Successfully generates `build/OpenClip.zip` and `build/OpenClip.dmg` signed with `OpenClip Release`.

- [ ] **Step 5: Verify designated requirement on built app**

Run: `codesign -d -r- build/DerivedData/Build/Products/Release/OpenClip.app` (or from zip)
Expected: Designated requirement contains `certificate leaf[subject.CN] = "OpenClip Release"`.

- [ ] **Step 6: Commit changes**

```bash
git add scripts/generate_release_identity.sh scripts/package_app.sh
git commit -m "feat: add persistent release signing identity for TCC update continuity"
```

---

### Task 3: Permission Recovery and Verification Flow

**Files:**
- Modify: `Sources/OpenClip/Platform/PermissionManager.swift`
- Modify: `Sources/OpenClip/UI/Onboarding/OnboardingView.swift`

**Interfaces:**
- Consumes: `PermissionManager.shared`
- Produces: Reliable permission re-check and TCC status reporting.

- [ ] **Step 1: Add re-authorization helper to `PermissionManager.swift`**

Add convenience method in `Sources/OpenClip/Platform/PermissionManager.swift`:
```swift
    /// Prompts TCC to re-evaluate the running application and opens Accessibility settings if not granted.
    public func promptAndOpenAccessibilitySettings() {
        requestAccessibilityPermission()
    }
```

- [ ] **Step 2: Ensure `hasCompletedOnboarding` is set whenever onboarding is dismissed or finished**

Verify in `Sources/OpenClip/UI/Onboarding/OnboardingView.swift` that skipping or finishing sets `.hasCompletedOnboarding` to `true`.

- [ ] **Step 3: Run full test suite**

Run: `./scripts/test.sh`
Expected: All tests pass (0 failures).

- [ ] **Step 4: Commit changes**

```bash
git add Sources/OpenClip/Platform/PermissionManager.swift Sources/OpenClip/UI/Onboarding/OnboardingView.swift
git commit -m "fix: streamline permission recovery and onboarding completion persistence"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-27-persistent-accessibility-and-onboarding-fix.md`.
