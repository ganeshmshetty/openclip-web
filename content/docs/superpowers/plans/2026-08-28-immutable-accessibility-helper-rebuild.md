# Immutable Accessibility Helper — Rebuild (One Honest Commit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This plan is **plan-only** — it must not be executed until the human confirms.

**Goal (restated from the real motivation):** Never re-prompt the user for macOS Accessibility permission again after a Sparkle update, despite the main app being ad-hoc signed (no Developer ID). TCC binds the grant to the binary's `cdhash` + bundle id, so the grant must live on a **byte-stable, separately-launched daemon** that never changes across app releases, and **every** Accessibility operation must run in that daemon — not in the main app.

## Why the previous commit (HEAD) fails and must be rebuilt

The existing commit `fef03eb` ("feat(helper): implement Immutable Accessibility Helper") was reviewed and found non-functional against this goal:

- **Unreachable at runtime.** It launches the helper with `NSWorkspace.openApplication(...)` but connects with `NSXPCConnection(machServiceName:)`. A GUI-opened `.app` is not registered as a Mach service with launchd, so the listener registration is denied and `isHelperAvailable()` silently returns false → the client falls back to *in-process* AX, i.e. it behaves exactly as if the commit didn't exist.
- **Not isolated.** The main app still performs all real AX reads (`AXElementInspector`, `AXTextControlStrategy`, `AXWebAreaStrategy`, `AXMenuNavigator`, `PasteAvailabilityProbe`) and all `CGEventPost` key injection (`ActionResultHandler.SessionEventTapPoster`) in-process. Those calls are what need the TCC grant, so the main app still loses its grant on every update. The daemon's `retrieveSelectedText` / `postKey` endpoints are **never called**.
- **Dead code / smells.** `AXKeyCommandPayload` is defined but unused; `AXHelperClient` duplicates the same `OnceResume` + `remoteObjectProxyWithErrorHandler` scaffolding across four methods; `PermissionManager.resetTCCAndRelaunch` still resets bundle `com.openclip.OpenClip` (the wrong target now that the grant must live on the helper).

## Chosen strategy (Option A, confirmed)

1. **Soft-reset the two unpushed commits** (`git reset --soft HEAD~2`) so the working tree keeps all +863/−30 changes staged, then rebuild the feature **coherently and land a single honest commit**. The old scaffolding is largely discarded; reusable pieces (the AX read/key-post bodies, `AXSelectionPayload`, `AXHelperServiceProtocol`, `OnceResume`, tests) are kept.
2. **Make the daemon a byte-stable LaunchAgent** installed at a stable, non-app-bundle path, registered with launchd via `SMAppService`, so (a) launchd resolves the XPC mach name and (b) the daemon's binary identity never changes across app updates.
3. **Route ALL Accessibility work through the daemon** — permission checks, selection reads, and key injection — so the main app performs **zero** AX/CGEvent calls in production and never needs its own TCC grant. On first run, OpenClip transfers the grant to the daemon; the user is prompted once for `OpenClipAXHelper` and never again.
## Global Constraints

- Swift 6 strict concurrency (`SWIFT_STRICT_CONCURRENCY: complete`) in all targets.
- `Core` stays pure domain — no AppKit/SwiftUI/ApplicationServices imports in `Sources/Core/`. The `@objc` XPC protocol and `Codable` models may live in Core (they import only Foundation).
- No direct `UserDefaults.standard` in new code — route through `SettingsStore` + `SettingKey`.
- `ActionCoordinator` remains the composition root.
- All XPC calls honor strict scheduling limits: 500ms per AX call, 2s connection handshake; never block the main thread. Reuse `OnceResume`/`TaskBox` and add a per-call watchdog so a hung daemon never hangs the popup.
- Existing selection strategy chain (web-area settle-retry, text-marker fallback, deadline-capped inspect) must keep its behavior/fallbacks; only the *process* that runs the AX reads changes.
- Headless / unit-test environments with no daemon must still pass and must still fall back to in-process execution **only for tests/dev**, never in production routing.
- Docs in `AGENTS.md`, `docs/architecture/`, `docs/architecture/known-debt.md`, `docs/logging.md` updated in step with the code.

## File Structure Map (target)

| File | Target | Responsibility |
| :--- | :--- | :--- |
| `Sources/Core/Helper/AXHelperProtocol.swift` | Core | `@objc` XPC protocol + `AXHelperConstants` (keep, extend) |
| `Sources/Core/Helper/AXHelperModels.swift` | Core | `Codable` payloads; remove `AXKeyCommandPayload` or genuinely use it |
| `Sources/OpenClipHelper/AXHelperService.swift` | Helper | AX read/key-post/`SMAppService` daemon implementation |
| `Sources/OpenClipHelper/ServiceLifecycle.swift` | Helper | `SMAppService`/LaunchAgent registration + mach name listener bootstrap |
| `Sources/OpenClip/Platform/Helper/AXHelperClient.swift` | OpenClip | Single **generic** connection helper: one connection, `isHelperAvailable` with timeout, wrappers |
| `Sources/OpenClip/Platform/Helper/AXHelperHost.swift` | OpenClip | First-run **install** of daemon to stable path + `SMAppService` registration/observation; remove `NSWorkspace` launch |
| `Sources/OpenClip/Platform/PermissionManager.swift` | OpenClip | Route check/request through `AXHelperClient`; fix `resetTCC` target to the daemon |
| `Sources/OpenClip/Platform/Selection/*` | OpenClip | Selection read routed through daemon (keeps retry/fallback orchestration) |
| `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift` | OpenClip | `KeyboardEventPosting` becomes XPC-backed (daemon `postKey`); keep interface |
| `Sources/OpenClip/AppDelegate.swift` | OpenClip | Call `installIfNeeded()`/`startHelperIfNeeded()`; remove direct AX usage |
| bundled `LA-helper.plist` | Helper | embedded launchd plist: `MachServices` + `ProgramArguments` stable path |
| `project.yml`, `scripts/package_app.sh` | build | Remove embedded `.app` copy; build + place helper + plist for install step |
| `docs/**` | repo | Accuracy update: launch-agent presence, no-grant-in-main-app, reset target |

---

## Task 1 — Soft-reset + recon baseline (prerequisite, no new features)

**Files:** git-only; capture a baseline diff.

- [ ] **Step 1:** Run `git reset --soft HEAD~2` from `main` (re-parents working tree onto `origin/main` = `5976b75`), keeping the +863/−30 staged.
- [ ] **Step 2:** Save a staged diff to `.superpowers/sdd/2026-08-28-immutable-accessibility-helper-rebuild/base-diff.txt` for review-package tooling.
- [ ] **Step 3:** Create the SDD ledger `progress.md` for this plan.

**Gate:** `git status` shows feature changes staged on top of `5976b75`; no net loss; old history no longer contains `fef03eb`.

---

## Task 2 — Byte-stable LaunchAgent daemon (packaging/host, TDD)

**Files:** `project.yml`, `Sources/OpenClipHelper/*`, `Sources/OpenClip/Platform/Helper/AXHelperHost.swift`, `scripts/package_app.sh`, new tests.

**Goal:** Replace the broken `NSWorkspace.openApplication` embedded-`.app` scheme. Ship the helper, then on first run `AXHelperHost.installIfNeeded()` copies it to a stable user path and registers a LaunchAgent via `SMAppService`, so launchd advertises the mach name and the daemon starts before the client connects.

- [ ] **Step 1 (test):** `HelperInstallTests`: install path resolves outside the bundle; helper copied only-if-absent (cdhash preserved); `SMAppService.agent(plistName:)` outcome surfaced, non-fatal.
- [ ] **Step 2:** `AXHelperHost.installIfNeeded()` (copy-if-absent + `SMAppService` register). Remove `openApplication`/`NSWorkspace`.
- [ ] **Step 3:** Bundled `LA-helper.plist`: `ProgramArguments` (stable path) + `MachServices` (`com.openclip.OpenClip.helper`); helper binds `NSXPCListener(machServiceName:)`.
- [ ] **Step 4:** `scripts/package_app.sh`: build+embed helper, inside-out signing, `codesign --verify --deep --strict`.
- [ ] **Step 5:** Commit a coherent checkpoint (not final).

**Gate:** `./scripts/test.sh` green; smoke probe shows a live daemon answers `ping()` (no silent fallback).

---

## Task 3 — Reachability + full isolation of selection-read & key-injection (TDD)

**Objective:** the client trusts only a live, connected daemon (never silent local fallback in production), and the two genuine TCC consumers (selection reads, key posts) move into the daemon.

**Files:**
- `Sources/OpenClip/Platform/Helper/AXHelperClient.swift` — `isHelperAvailable()` gated on `SMAppService.agent.status == .enabled` **and** a live `ping()` with a 2s timeout via `OnceResume`+`TaskBox`.
- `Sources/OpenClip/Platform/Effects/ActionResultHandler.swift` — `KeyboardEventPosting` becomes XPC-backed (`postKey` via client); production-injectable; tests use an in-process double.
- `Sources/OpenClip/Platform/Selection/*` — `SelectionRetrievalCoordinator` + strategies call `AXHelperClient.retrieveSelectedText`/batched request; keep retry/web-area settle orchestration, only the process changes.
- `Sources/OpenClip/Platform/PermissionManager.swift` — via `AXHelperClient`; `resetTCCAndRelaunch()` targets **helper** id `com.openclip.OpenClip.helper`, not `com.openclip.OpenClip`.
- `Sources/Core/Helper/AXHelperModels.swift` — remove `AXKeyCommandPayload` if still unused, or route `postKey` through it.
- Remove remaining straight `AX`/`CGEvent`/`AXIsProcessTrustedWithOptions` from production `Sources/OpenClip`.

**Gate:** app binary makes no direct AX/CGEvent calls at runtime (only via XPC/daemon); dead model retired.

---

## Task 4 — Deduplicate client + finalize docs + single honest commit

**Files:** `AXHelperClient.swift`, docs, `project.yml`, `scripts/package_app.sh`.

- [ ] **Step 1:** Extract one private generic `withProxy<T>(... body:)` owning `OnceResume` + error-handler + timeout; all public methods call it.
- [ ] **Step 2:** Update docs (AGENTS rule, `accessibility-helper.md`, `known-debt.md`, `text-selection.md`, `logging.md`); drop stale "AX still in main app".
- [ ] **Step 3:** `./scripts/test.sh` (full, 0 skips) + `./scripts/package_app.sh`; `codesign --verify --deep --strict`.
- [ ] **Step 4:** Commit **once**, honest message ("isolate all Accessibility ops into a byte-stable LaunchAgent daemon").

---

## Final review gate (broad whole-branch code review)

Confirm every Accessibility call in the app target routes through the daemon; the daemon is `SMAppService`-registered and reachable (not `NSWorkspace`); no dead payload; `resetTCC` targets the helper; docs match; headless suite 0 skips.

## Open questions (note, don't rubber-stamp during implementation)
- `SMAppService`/launchd availability on macOS 14 vs 15; helper must be a code-signed standalone bundle.
- Exact `MachServices`/`ProgramArguments` key layout the helper needs.
- Onboarding/Re-check UX copy for the one-time "grant the helper" prompt.