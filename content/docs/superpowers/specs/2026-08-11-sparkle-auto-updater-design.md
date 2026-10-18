# Sparkle 2 Auto-Updater Integration Design

## Overview
Integrate Sparkle 2 framework (`sparkle-project/Sparkle`) into OpenClip to provide automatic background update checks and manual "Check for Updates..." user triggers.

## Components & Configuration

### 1. SPM Dependency & XcodeGen (`project.yml`)
- Add SPM package `Sparkle` from `https://github.com/sparkle-project/Sparkle` (`from: 2.6.0`).
- Add target dependency `Sparkle` to `OpenClip` app target.

### 2. Info.plist Settings (`Sources/OpenClip/Info.plist`)
- `SUFeedURL`: `https://raw.githubusercontent.com/ganeshmshetty/openclip/main/appcast.xml`
- `SUPublicEDKey`: `PLACEHOLDER_SPARKLE_PUBLIC_ED25519_KEY`
- `SUEnableAutomaticChecks`: `true`
- `SUScheduledCheckInterval`: `86400`

### 3. Swift Manager (`Sources/OpenClip/Platform/UpdaterManager.swift`)
- Implement `@MainActor final class UpdaterManager: NSObject, ObservableObject` wrapping `SPUStandardUpdaterController`.
- Expose `checkForUpdates()` for manual user action.
- Expose `canCheckForUpdates: Bool`.
- Integrate into status menu bar item and Preferences → About tab.

### 4. Appcast Template & Workflow Integration
- Create root `appcast.xml` feed template.
- Update `.github/workflows/release.yml` to package and support Sparkle appcast updates on tag pushes (`v*`).
