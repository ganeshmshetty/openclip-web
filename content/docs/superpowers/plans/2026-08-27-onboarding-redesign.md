# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the first-launch onboarding into a 4-step flow (Welcome & Access → Interactive Sandbox → Extensions → You're All Set) with a live text-selection playground that teaches contextual actions.

**Architecture:** The existing `OnboardingView.swift` is fully rewritten with a new 4-case `OnboardingStep` enum. A new `SandboxTextView` (`NSViewRepresentable` wrapping `NSTextView`) provides a selectable text area inside the onboarding window, letting the real `MacSelectionMonitor` trigger the actual popup bar. The `OnboardingWindowController` grows slightly to accommodate the sandbox. `RecommendedExtensionsView` is reused as-is. Distance-dismissal is suppressed while the onboarding window is visible so the popup doesn't auto-dismiss during the sandbox experience.

**Tech Stack:** Swift 6, SwiftUI + AppKit (`NSViewRepresentable`), macOS 14+

## Global Constraints

- Swift 6 with `SWIFT_STRICT_CONCURRENCY: complete`
- No AppKit/SwiftUI imports in `Sources/Core/`
- No direct `UserDefaults.standard` — use `SettingsStore` + `SettingKey`
- After adding new `.swift` files, run `xcodegen generate`
- All tests must pass: `./scripts/test.sh`
- Core tests must pass: `./scripts/test.sh core`

---

### Task 1: Rewrite OnboardingStep Enum + View Skeleton with Step Navigation

**Files:**
- Modify: `Sources/OpenClip/UI/Onboarding/OnboardingView.swift` (full rewrite)

**Interfaces:**
- Consumes: `PermissionManager.shared`, `DefaultSettingsStore.shared`, `AppIcon.image`
- Produces: `OnboardingStep` enum (`.welcome`, `.sandbox`, `.extensions`, `.done`), `OnboardingView` with 4-step navigation, shared header/footer, slide transitions

- [ ] **Step 1: Rewrite the OnboardingStep enum**

Replace the existing `OnboardingStep` enum and `OnboardingView` skeleton in `Sources/OpenClip/UI/Onboarding/OnboardingView.swift`:

```swift
// OnboardingView.swift
// OpenClip
//
// Renders the multi-step first-launch onboarding flow: Welcome (accessibility),
// Interactive Sandbox (live popup experience), Recommended Extensions, then
// completion summary. Drawn as a solid rounded card (border + shadow) on a
// transparent borderless window.
import SwiftUI
import AppKit
import Core

public enum OnboardingStep: Int, CaseIterable, Identifiable, Sendable {
    case welcome = 0
    case sandbox = 1
    case extensions = 2
    case done = 3

    public var id: Int { rawValue }

    var title: String {
        switch self {
        case .welcome: return "Welcome"
        case .sandbox: return "Try It"
        case .extensions: return "Extensions"
        case .done: return "Ready"
        }
    }
}
```

- [ ] **Step 2: Write the OnboardingView skeleton with navigation**

Replace the entire `OnboardingView` struct body with the new 4-step skeleton:

```swift
@MainActor
public struct OnboardingView: View {
    @ObservedObject private var permissionManager = PermissionManager.shared
    public var onComplete: @MainActor () -> Void

    @State private var step: OnboardingStep = .welcome

    public init(onComplete: @escaping @MainActor () -> Void) {
        self.onComplete = onComplete
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // ── Header: App icon + name + step indicator ──────────────
            HStack(alignment: .top, spacing: 14) {
                Image(nsImage: AppIcon.image)
                    .resizable()
                    .frame(width: 48, height: 48)

                VStack(alignment: .leading, spacing: 2) {
                    Text("OpenClip")
                        .font(.system(size: 18, weight: .semibold))
                    Text("Turn selected text into instant actions")
                        .font(.system(size: 13))
                        .foregroundColor(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 8) {
                    HStack(spacing: 12) {
                        HStack(spacing: 6) {
                            ForEach(OnboardingStep.allCases) { s in
                                Circle()
                                    .fill(step == s ? Color.accentColor : Color.primary.opacity(0.15))
                                    .frame(width: 8, height: 8)
                            }
                        }
                        Button {
                            completeOnboarding()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundColor(.secondary.opacity(0.6))
                                .font(.system(size: 14))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Close")
                    }
                    Text("Step \(step.rawValue + 1) of \(OnboardingStep.allCases.count)")
                        .font(.system(size: 11))
                        .foregroundColor(.secondary)
                }
            }
            .padding(.bottom, 18)

            // ── Step content with slide transition ────────────────────
            Group {
                switch step {
                case .welcome: welcomeContent
                case .sandbox: sandboxContent
                case .extensions: extensionsContent
                case .done: doneContent
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .transition(.push(from: step.rawValue > 0 ? .trailing : .leading))

            // ── Footer ────────────────────────────────────────────────
            Divider()
                .padding(.top, 14)
                .padding(.bottom, 14)

            HStack {
                if step != .welcome {
                    Button("← Back") {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            step = OnboardingStep(rawValue: step.rawValue - 1) ?? .welcome
                        }
                    }
                    .buttonStyle(.bordered)
                }

                Spacer()

                Button {
                    if step == .done {
                        completeOnboarding()
                    } else {
                        withAnimation(.easeInOut(duration: 0.3)) {
                            step = OnboardingStep(rawValue: step.rawValue + 1) ?? .done
                        }
                    }
                } label: {
                    Text(step == .done ? "Get Started" : "Continue →")
                        .font(.system(size: 13, weight: .medium))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 5)
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(28)
        .frame(width: 560, height: 680)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(Color(nsColor: .windowBackgroundColor))
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.10), lineWidth: 1)
                )
                .shadow(color: Color.black.opacity(0.15), radius: 16, x: 0, y: 6)
        )
        .onAppear { permissionManager.startMonitoring() }
        .onDisappear { permissionManager.stopMonitoring() }
    }

    private func completeOnboarding() {
        DefaultSettingsStore.shared.set(.hasCompletedOnboarding, value: true)
        onComplete()
    }

    // MARK: - Placeholder step views

    private var welcomeContent: some View {
        Text("Welcome placeholder")
    }

    private var sandboxContent: some View {
        Text("Sandbox placeholder")
    }

    private var extensionsContent: some View {
        RecommendedExtensionsView()
    }

    private var doneContent: some View {
        Text("Done placeholder")
    }
}
```

- [ ] **Step 3: Remove old StepRow helper**

Delete the `StepRow` struct at the bottom of the file (it is no longer used).

- [ ] **Step 4: Build and verify**

```bash
xcodegen generate
./scripts/test.sh core
```

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/UI/Onboarding/OnboardingView.swift
git commit -m "refactor(onboarding): rewrite to 4-step flow skeleton with slide transitions"
```

---

### Task 2: Welcome & Accessibility Step

**Files:**
- Modify: `Sources/OpenClip/UI/Onboarding/OnboardingView.swift` (implement `welcomeContent`)

**Interfaces:**
- Consumes: `PermissionManager.shared.isAccessibilityGranted`, `PermissionManager.shared.requestAccessibilityPermission()`
- Produces: `welcomeContent` view with hero, how-it-works strip, and live permission card

- [ ] **Step 1: Implement the welcomeContent view and howItWorksItem**

Replace `welcomeContent` with:

```swift
// MARK: - Welcome

private var welcomeContent: some View {
    VStack(alignment: .leading, spacing: 0) {
        // How it works strip
        Text("How it works")
            .font(.system(size: 11, weight: .semibold))
            .foregroundColor(.secondary)
            .padding(.bottom, 8)

        HStack(spacing: 16) {
            howItWorksItem(icon: "textformat.abc", text: "Select text anywhere")
            howItWorksItem(icon: "rectangle.badge.plus", text: "An action bar appears")
            howItWorksItem(icon: "bolt.fill", text: "Translate, search, calculate & more")
        }
        .padding(.bottom, 20)

        Spacer(minLength: 16)

        Divider()
            .padding(.bottom, 20)

        // Permission card
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "hand.raised.fill")
                    .font(.system(size: 24))
                    .foregroundColor(permissionManager.isAccessibilityGranted ? .green : .secondary)

                VStack(alignment: .leading, spacing: 2) {
                    Text("Accessibility Access")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Needed to detect text you select in any app and place the action bar by your cursor.")
                        .font(.system(size: 12))
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if permissionManager.isAccessibilityGranted {
                Label("Access Granted", systemImage: "checkmark.circle.fill")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(.green)
                    .transition(.scale.combined(with: .opacity))
            } else {
                Button("Grant Access") {
                    permissionManager.requestAccessibilityPermission()
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.primary.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(permissionManager.isAccessibilityGranted ? Color.green.opacity(0.3) : Color.primary.opacity(0.08), lineWidth: 1)
        )
        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: permissionManager.isAccessibilityGranted)
    }
}

private func howItWorksItem(icon: String, text: String) -> some View {
    VStack(spacing: 6) {
        Image(systemName: icon)
            .font(.system(size: 20))
            .foregroundColor(.accentColor)
            .frame(width: 36, height: 36)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.accentColor.opacity(0.1))
            )
        Text(text)
            .font(.system(size: 11))
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
    }
    .frame(maxWidth: .infinity)
}
```

- [ ] **Step 2: Build and verify**

```bash
xcodegen generate
./scripts/test.sh core
```

- [ ] **Step 3: Commit**

```bash
git add Sources/OpenClip/UI/Onboarding/OnboardingView.swift
git commit -m "feat(onboarding): implement Welcome step with permission card"
```

---

### Task 3: Interactive Sandbox Step (SandboxTextView + Multi-Trigger Text)

**Files:**
- Create: `Sources/OpenClip/UI/Onboarding/SandboxTextView.swift`
- Modify: `Sources/OpenClip/UI/Onboarding/OnboardingView.swift` (implement `sandboxContent`)

**Interfaces:**
- Consumes: `PermissionManager.shared.isAccessibilityGranted`
- Produces: `SandboxTextView` (`NSViewRepresentable`), `sandboxContent` view with multi-trigger text (`https://getopenclip.app`) + discovery hints

- [ ] **Step 1: Create SandboxTextView.swift**

Create `Sources/OpenClip/UI/Onboarding/SandboxTextView.swift`:

```swift
// SandboxTextView.swift
// OpenClip
//
// NSViewRepresentable wrapping an NSTextView for the onboarding sandbox.
// Provides a selectable text area so MacSelectionMonitor can detect selections
// and trigger the real popup bar during the first-launch experience.
import SwiftUI
import AppKit

struct SandboxTextView: NSViewRepresentable {
    let text: String

    func makeNSView(context: Context) -> NSScrollView {
        let scrollView = NSTextView.scrollableTextView()
        guard let textView = scrollView.documentView as? NSTextView else {
            return scrollView
        }

        textView.string = text
        textView.isEditable = false
        textView.isSelectable = true
        textView.isRichText = false
        textView.font = .systemFont(ofSize: 14)
        textView.textColor = .labelColor
        textView.backgroundColor = .clear
        textView.textContainerInset = NSSize(width: 12, height: 12)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.textContainer?.widthTracksTextView = true
        textView.textContainer?.lineFragmentPadding = 4

        scrollView.drawsBackground = false
        scrollView.hasVerticalScroller = false
        scrollView.hasHorizontalScroller = false
        scrollView.borderType = .noBorder

        return scrollView
    }

    func updateNSView(_ nsView: NSScrollView, context: Context) {}
}
```

- [ ] **Step 2: Implement sandboxContent in OnboardingView.swift**

Add `@State private var hasDetectedSelection = false` to `OnboardingView`, and implement `sandboxContent` with `sandboxHint`:

```swift
// MARK: - Sandbox

private var sandboxContent: some View {
    VStack(alignment: .leading, spacing: 16) {
        if !permissionManager.isAccessibilityGranted {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                    .font(.system(size: 13))
                Text("Enable Accessibility to try live text selection.")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                Spacer()
                Button("Grant Access") {
                    permissionManager.requestAccessibilityPermission()
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
            }
            .padding(10)
            .background(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(Color.orange.opacity(0.08))
            )
        }

        VStack(alignment: .leading, spacing: 4) {
            Text("Try It Right Now")
                .font(.system(size: 20, weight: .bold))
            Text("Select any text in the box below")
                .font(.system(size: 13))
                .foregroundColor(.secondary)
        }

        SandboxTextView(
            text: "Our next meeting is Friday at 2pm — the project budget is 1250 + 340. Check https://getopenclip.app for details."
        )
        .frame(height: 80)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.primary.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

        if hasDetectedSelection {
            Label("Nice! Different text → different actions.", systemImage: "checkmark.circle.fill")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.green)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }

        VStack(alignment: .leading, spacing: 8) {
            Label("Try selecting different parts:", systemImage: "lightbulb.fill")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.secondary)

            HStack(spacing: 16) {
                sandboxHint(icon: "calendar.badge.plus", label: "\"Friday at 2pm\"", action: "Add Event")
                sandboxHint(icon: "equal.circle", label: "\"1250 + 340\"", action: "Calculate")
            }
            HStack(spacing: 16) {
                sandboxHint(icon: "link", label: "The URL", action: "Open Link")
                sandboxHint(icon: "character.book.closed", label: "A single word", action: "Define")
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(Color.primary.opacity(0.03))
        )
    }
    .onReceive(NotificationCenter.default.publisher(for: NSTextView.didChangeSelectionNotification)) { notification in
        guard let textView = notification.object as? NSTextView else { return }
        let range = textView.selectedRange()
        if range.length > 0 && !hasDetectedSelection {
            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                hasDetectedSelection = true
            }
        }
    }
}

private func sandboxHint(icon: String, label: String, action: String) -> some View {
    HStack(spacing: 6) {
        Image(systemName: icon)
            .font(.system(size: 11))
            .foregroundColor(.accentColor)
            .frame(width: 18, height: 18)
        VStack(alignment: .leading, spacing: 0) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
            Text("→ \(action)")
                .font(.system(size: 10))
                .foregroundColor(.secondary)
        }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
}
```

- [ ] **Step 3: Regenerate project and test**

```bash
xcodegen generate
./scripts/test.sh core
```

- [ ] **Step 4: Commit**

```bash
git add Sources/OpenClip/UI/Onboarding/SandboxTextView.swift Sources/OpenClip/UI/Onboarding/OnboardingView.swift
git commit -m "feat(onboarding): add interactive sandbox with multi-trigger text"
```

---

### Task 4: Completion Step + Distance-Dismissal Suspension

**Files:**
- Modify: `Sources/OpenClip/UI/Onboarding/OnboardingView.swift` (implement `doneContent`)
- Modify: `Sources/OpenClip/UI/Popup/PopupWindowController.swift` (add `isOnboardingVisible`)
- Modify: `Sources/OpenClip/AppDelegate.swift` (set `isOnboardingVisible`)

**Interfaces:**
- Consumes: `PopupWindowController.handleEvent`
- Produces: `doneContent` view, `PopupWindowController.isOnboardingVisible` flag to keep popup active during sandbox

- [ ] **Step 1: Implement doneContent in OnboardingView.swift**

```swift
// MARK: - Done

private var doneContent: some View {
    VStack(spacing: 20) {
        Spacer()

        Image(systemName: "checkmark.seal.fill")
            .font(.system(size: 48))
            .foregroundColor(.green)

        Text("You're All Set!")
            .font(.system(size: 24, weight: .bold))

        VStack(alignment: .leading, spacing: 12) {
            cheatSheetRow(icon: "cursor.rays", what: "Open Actions", how: "Select text in any app")
            Divider()
            cheatSheetRow(icon: "command", what: "Global Shortcut", how: "⌥⌘C to trigger the popup anytime")
            Divider()
            cheatSheetRow(icon: "gearshape", what: "Preferences", how: "Menu bar icon → Preferences")
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .fill(Color.primary.opacity(0.04))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(Color.primary.opacity(0.08), lineWidth: 1)
        )

        HStack(spacing: 6) {
            Image(systemName: "menubar.arrow.up.rectangle")
                .foregroundColor(.secondary)
                .font(.system(size: 12))
            Text("OpenClip lives in your menu bar")
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }

        Spacer()
    }
}

private func cheatSheetRow(icon: String, what: String, how: String) -> some View {
    HStack(spacing: 12) {
        Image(systemName: icon)
            .font(.system(size: 14))
            .foregroundColor(.accentColor)
            .frame(width: 24)
        VStack(alignment: .leading, spacing: 1) {
            Text(what)
                .font(.system(size: 13, weight: .medium))
            Text(how)
                .font(.system(size: 12))
                .foregroundColor(.secondary)
        }
    }
}
```

- [ ] **Step 2: Add isOnboardingVisible to PopupWindowController.swift**

In `Sources/OpenClip/UI/Popup/PopupWindowController.swift`:

Add property:
```swift
/// When true, distance-based auto-dismiss is suppressed so the popup stays visible
/// during the onboarding sandbox experience.
public var isOnboardingVisible: Bool = false
```

Update distance dismissal line (around line 568):
```swift
let distanceDismissActive = modeStore.mode != .search && modeStore.mode != .content && !modeStore.isProcessingAI && !isOnboardingVisible
```

- [ ] **Step 3: Update AppDelegate.swift showOnboarding**

In `Sources/OpenClip/AppDelegate.swift`:
```swift
private func showOnboarding() {
    popupController?.isOnboardingVisible = true
    onboardingWindowController = OnboardingWindowController { [weak self] in
        self?.popupController?.isOnboardingVisible = false
        if DefaultSettingsStore.shared.get(.isAppEnabled) {
            self?.selectionMonitor?.start()
        }
        self?.showPostOnboardingCoachMark()
    }
    onboardingWindowController?.showWindow(nil)
}
```

- [ ] **Step 4: Build and test**

```bash
xcodegen generate
./scripts/test.sh core
```

- [ ] **Step 5: Commit**

```bash
git add Sources/OpenClip/UI/Onboarding/OnboardingView.swift Sources/OpenClip/UI/Popup/PopupWindowController.swift Sources/OpenClip/AppDelegate.swift
git commit -m "feat(onboarding): add completion step and distance dismissal suspension"
```

---

### Task 5: Window Controller Sizing + Test Updates

**Files:**
- Modify: `Sources/OpenClip/UI/Onboarding/OnboardingWindowController.swift`
- Modify: `Tests/OpenClipTests/OnboardingWindowControllerTests.swift`

**Interfaces:**
- Consumes: `OnboardingView`, `OnboardingStep`
- Produces: Updated window size (560×680), unit tests verifying 4-step onboarding

- [ ] **Step 1: Update window frame size in OnboardingWindowController.swift**

In `Sources/OpenClip/UI/Onboarding/OnboardingWindowController.swift`, update the initial content rect to `560, 680`:

```swift
let window = KeyableWindow(
    contentRect: NSRect(x: 0, y: 0, width: 560, height: 680),
    styleMask: [.borderless],
    backing: .buffered,
    defer: false
)
```

- [ ] **Step 2: Update OnboardingWindowControllerTests.swift**

Add test for 4 steps:

```swift
func testOnboardingHasFourSteps() {
    XCTAssertEqual(OnboardingStep.allCases.count, 4)
    XCTAssertEqual(OnboardingStep.allCases.map(\.title),
                   ["Welcome", "Try It", "Extensions", "Ready"])
}
```

- [ ] **Step 3: Run full test suite**

```bash
xcodegen generate
./scripts/test.sh
```

- [ ] **Step 4: Commit**

```bash
git add Sources/OpenClip/UI/Onboarding/OnboardingWindowController.swift Tests/OpenClipTests/OnboardingWindowControllerTests.swift
git commit -m "feat(onboarding): update window size and add 4-step test coverage"
```
