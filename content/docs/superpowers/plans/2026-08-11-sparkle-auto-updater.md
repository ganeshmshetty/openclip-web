# Sparkle 2 Auto-Updater Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Sparkle 2 auto-updater into OpenClip for background update checks and manual user update triggers.

**Architecture:** Add Sparkle SPM package in `project.yml`, configure Info.plist feed keys, implement `UpdaterManager` wrapper around Sparkle 2's `SPUStandardUpdaterController`, add menu bar & preferences UI triggers, and establish root `appcast.xml`.

**Tech Stack:** Swift 6, macOS 14+, Sparkle 2 (SPM: `https://github.com/sparkle-project/Sparkle`), XcodeGen.

## Global Constraints

- Xcode project generated strictly by XcodeGen from `project.yml`.
- Pure Swift 6 concurrency (`SWIFT_STRICT_CONCURRENCY: complete`).
- No raw `print()`, route all logging through `Log.swift`.
- `SUFeedURL`: `https://raw.githubusercontent.com/ganeshmshetty/openclip/main/appcast.xml`
- `SUPublicEDKey`: `PLACEHOLDER_SPARKLE_PUBLIC_ED25519_KEY`

---

### Task 1: Add Sparkle SPM Package & Info.plist Keys

**Files:**
- Modify: `project.yml`
- Modify: `Sources/OpenClip/Info.plist`

**Interfaces:**
- Produces: `Sparkle` package dependency linked to `OpenClip` target; `SUFeedURL` and `SUPublicEDKey` in `Info.plist`.

- [ ] **Step 1: Add Sparkle SPM package to project.yml**

```yaml
packages:
  Sparkle:
    url: https://github.com/sparkle-project/Sparkle
    from: 2.6.0
```

Add `Sparkle` package dependency under `OpenClip` target in `project.yml`.

- [ ] **Step 2: Add Sparkle configuration to Info.plist**

Add `SUFeedURL`, `SUPublicEDKey`, `SUEnableAutomaticChecks`, `SUScheduledCheckInterval` to `Sources/OpenClip/Info.plist`.

- [ ] **Step 3: Regenerate Xcode project**

Run: `xcodegen generate`
Expected: Xcode project generated with Sparkle dependency linked.

- [ ] **Step 4: Commit**

```bash
git add project.yml Sources/OpenClip/Info.plist
git commit -m "feat(updater): add Sparkle SPM package and Info.plist settings"
```

---

### Task 2: Create UpdaterManager & Wire UI Triggers

**Files:**
- Create: `Sources/OpenClip/Platform/UpdaterManager.swift`
- Modify: `Sources/OpenClip/UI/Preferences/AboutTabView.swift`
- Create: `appcast.xml`

**Interfaces:**
- Produces: `UpdaterManager.shared.checkForUpdates()` method and root `appcast.xml` template.

- [ ] **Step 1: Create UpdaterManager.swift**

Create `@MainActor final class UpdaterManager: NSObject, ObservableObject` wrapping `SPUStandardUpdaterController`.

- [ ] **Step 2: Add Check for Updates button to About tab**

In `AboutTabView.swift`, add a "Check for Updates..." button invoking `UpdaterManager.shared.checkForUpdates()`.

- [ ] **Step 3: Create initial root appcast.xml**

Create root `appcast.xml` with channel header and feed structure.

- [ ] **Step 4: Verify build and unit test suite**

Run: `./scripts/test.sh --unit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/Platform/UpdaterManager.swift Sources/OpenClip/UI/Preferences/AboutTabView.swift appcast.xml
git commit -m "feat(updater): implement UpdaterManager and add UI check for updates button"
```
