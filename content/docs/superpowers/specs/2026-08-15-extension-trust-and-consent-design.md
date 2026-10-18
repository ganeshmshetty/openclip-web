# Extension Trust & Consent (Security)

Date: 2026-08-15 · Status: Draft — awaiting review

This spec adds a fail-closed consent gate for extensions: nothing an extension does runs until the
user has seen what it is and explicitly enabled it. It also adds a tamper-watch so a trusted
extension that is edited on disk (or a planted package) is flagged instead of silently run. It adds
two companion features: a **manual-only store update flow** (Reload button + per-package Update +
Update All) and a **`minOpenClipVersion` compatibility declaration** (load but mark incompatible).

The capability model (enforcement) is **explicitly out of scope** — this spec only *surfaces* a
manifest's declared capabilities on the review screen. Seeding `ManifestCapabilityGate` and gating
the JS bridge behind declared capabilities is a follow-up spec (it is what the module-importing
spec already flagged as future work).

---

## Problem

OpenClip scans `~/.openclip/extensions` at startup and registers every valid package as a runnable
action. A package is just a folder on disk — there is no approval step, no signing, and no runtime
sandbox. An extension with a `shell` or `applescript` action executes arbitrary code with **full
user privileges** on the selected text, the moment it is registered:

1. **Planting.** Anything that can write to `~/.openclip/extensions` (a malicious installer, a
   dropped file, a compromised process) silently adds a package that auto-runs on the next
   launch/reload.
2. **Tampering.** A trusted package's script files can be edited on disk and the changed code runs
   on the next hot reload with no signal to the user.
3. **Transparency.** There is currently no screen that tells the user what an installed extension
   does, so an approving user has no basis for a trust decision.

Users of a new open-source macOS tool inherit Gatekeeper/Raycast muscle memory: *code does not run
until I say yes, and I'm shown what it is first.*

## Goals

1. **Fail-closed consent.** An extension that has not been explicitly enabled never executes
   anything. Newly detected packages start "untrusted" and stay inactive until reviewed and enabled
   in Preferences. **Exception:** packages installed from the official store are auto-trusted at
   install (the store click is the consent) — the hybrid rule, §4.
2. **An informed decision.** The review/enable surface shows, per package: name, identifier,
   declared capabilities, and a type-derived risk summary ("runs shell code", "makes network
   requests", "types for you", "drives other apps").
3. **Tamper detection.** The files of a *trusted* package are fingerprinted at enable time and
   re-checked on every load; a changed package auto-disables with a notification and is treated as
   untrusted again — it never runs silently, and **Reload never re-trusts**. Only an explicit Enable
   through the trust model restores it.
4. **Zero regression for existing users.** Packages already present at upgrade time are migrated to
   trusted once, so nothing disappears.
5. **No enforcement, no breakage.** This spec changes what *runs* (only gating + display), never
   what a trusted extension can do. No manifest is rejected for lack of a capability declaration.
6. **Manual-only updates.** No background update checks. The user triggers a check by clicking
   **Reload** (which also re-scans local files); per-package **Update** and **Update All** apply
   found updates. §10.
7. **App-version compatibility.** A manifest may declare `minOpenClipVersion`; an extension for a
   newer app loads but is marked incompatible (registered, not performable), never rejected. §11.

## Non-goals

- Seeding `ManifestCapabilityGate.knownCapabilities` or gating runtime behavior on declared
  capabilities (JIT prompts, blocked `fetch`, etc.) — the follow-up enforcement spec.
- Code signing / notary / author identity.
- An OS-level sandbox (sandbox-exec/seatbelt) for scripts.
- Static analysis of shell/AppleScript payloads.

---

## Design

### 1. Trust model — one package = one decision

Trust is a per-**package** (identifier) decision, matching how uninstall already groups actions
(`InstalledExtensionsView` flattens a group + sub-actions into one package row).

A package is in one of three states:

| State | Meaning | Behavior |
| :--- | :--- | :--- |
| `.untrusted` | Never enabled; or its files changed since enable | Registered but **never performed**; shown in Preferences with a review prompt. |
| `.trusted` | Enabled (and files unchanged since) | Runs normally. |
| `.revoked` | User turned it off (an explicit disable) | Not performed; shown as off. |

New package → `.untrusted`, **except** store installs, which start `.trusted` (§4 — store-install
*is* the consent). Enable → `.trusted`. Disable → `.revoked`. Enable again → `.trusted`
(fingerprint re-taken).

A `.revoked` state is distinct from `.untrusted` so a user's explicit "no" is not re-prompted as if
it were new; a file change still flips `.trusted` → `.untrusted` (the "review this again" case),
never `.revoked`.

These three states are derived from the persisted trust record (§2): `.untrusted` = no record, or
`"seen"`, or a `"trusted"` entry whose hash no longer matches; `.trusted` = `"trusted"` with a
matching hash; `.revoked` = `"revoked"`.

**The trust model is the single consent surface.** Every path that needs consent funnels into one
review screen (name, capabilities, risk rows, Enable/Disable). How a path reaches it differs; the
screen itself is the same everywhere:
- **Manual install** (files dropped/copied into `~/.openclip/extensions`) → a one-time notification;
  clicking it opens the trust model.
- **App "Install File…" button** → the trust model opens immediately after install (the user is
  already in the app — no notification).
- **Deferred enable** — the user didn't enable at install time, or later clicks Enable/Review on the
  Installed tab → the trust model re-opens. This is not a separate flow; it is the same screen
  reached later. Enable → `.trusted`.
- **Revoked** → Enable re-opens the trust model to re-confirm.
- **Tamper-disabled** → re-enabling opens the trust model with a "files changed since you enabled
  it" warning.
- **Store install** → no trust model at all (store-install already granted consent).

A gated action clicked in the popup bar shows a "not enabled — review" toast whose action opens the
trust model.

### 2. Where the state lives

New Core settings, routed through `SettingsStore` (no raw `UserDefaults`, per AGENTS.md):

```swift
// SettingKey.swift
static var extensionTrust: SettingKey<[String: String]>      // packageID -> "seen" | "trusted" | "revoked"
static var extensionTrustHashes: SettingKey<[String: String]> // packageID -> content hash recorded at enable time
static var extensionSources: SettingKey<[String: String]>    // packageID -> "store" | "local"
```

`extensionTrust` keyed by manifest `identifier` (survives folder renames). Value states:
- **"seen"** — a new package was detected and its notification already fired (never enabled).
  Distinct from "no record at all", which is what triggers the one-time notification (§5).
- **"trusted"** — user enabled it; `extensionTrustHashes` holds the content hash taken at enable.
- **"revoked"** — user explicitly disabled it; re-prompting is suppressed.

`extensionTrustHashes` stores the tamper-watch digest (§7) — a plain derived value, so
`SettingsStore` is appropriate (Keychain stays reserved for secrets, per the existing rule).

`extensionSources` records how a package arrived: `"store"` for `RemoteExtensionInstaller`
installs, `"local"` for everything else. It drives two behaviors: store packages start `.trusted`
without a trust-model step (§4), and only store packages participate in update checks (§9). The
source is set at install time and never changes afterward.

### 3. Risk derivation — types are ground truth, capabilities are a claim

The review screen shows two independent layers, per the design conversation:

- **Type-derived risk (structural, cannot lie).** Computed from the package's action kinds via
  `ExtensionActionKind`:
  - `runsCode` — any `shell`/`applescript`/`javascript` action (inline `scriptCode` or script file).
  - `scriptNetwork` — any `javascript` action with `async: true` (the `fetch` polyfill is the only
    JS network path).
  - `opensURLs` — any `url`/`websearch` action (opens a URL in the browser; lower severity than
    script-network but shown for transparency).
  - `keyboard` — any `keypress`/`shortcut` action.
  - `appAutomation` — any `applescript` action (drives other apps) or `service` action.
  - `urlOnly` — none of `runsCode`/`scriptNetwork`/`keyboard`/`appAutomation` (only
    `url`/`websearch`/`textsnippet`/`group` with only those).
- **Declared capabilities (author's promise).** The manifest's `capabilities` array, displayed
  verbatim when present ("none declared" when absent).

These are independent: a shell action is a red "runs code" row whether or not the manifest declares
a capability, so a bad/absent declaration can never make a dangerous package look safe.

The JS honesty-scan (tokenizing for `fetch(`, `openclip.openURL`, etc.) is deferred — it adds
marginal value over the type-derived row for the trust decision and is best bundled with the
enforcement spec that actually acts on mismatches.

### 4. Load-time gating — where the hook goes

`ExtensionManager.loadExtensions` (`Sources/Core/Extensions/ExtensionManager.swift`) is the single
registration point. After `loadManifestExtension` produces a package's actions, the manager:

1. Reads the package's trust state (`SettingsStore.extensionTrust`) and source
   (`SettingsStore.extensionSources`).
2. Computes the package's current content hash (manifest bytes + referenced script files).
3. If state is `.trusted` **and** the content hash matches the hash recorded at enable time →
   register the actions as today.
4. Otherwise → register a **trust-gated placeholder** (see below) instead of the real actions.

**Store installs auto-trust.** When `extensionSources[packageID] == "store"` and the package has
**no trust record at all** (a fresh store install), the manager writes `"trusted"` + records the
content hash before the gating check, so the package registers and runs immediately with no
trust-model step. The user's click on "Install" in the store *is* the consent, and the download
already passed the host allowlist + redirect checks in `RemoteExtensionInstaller`. This is the only
path that auto-trusts; `"local"` packages always start `.untrusted`. An update applied later is also
a store action and re-trusts (§9).

The placeholder is a passive `Action` (same shape as the existing `menuRelevance` decorator pattern)
that forwards the package's identity/chrome so the package still **appears** in the bar/menu and in
Preferences — but its `perform` surfaces a toast ("This extension isn't enabled yet — Review") whose
action opens the trust model, and it is never delivered a real run. This keeps discovery ("there's a
new extension, click to review") while honoring fail-closed.

Standalone script files (no manifest) get the same treatment keyed by the synthesized package id
(`Constants.customIdentifierPrefix` + filename).

### 5. New-package notification — per install path

How a new untrusted package surfaces depends on how it arrived (all from §1's single consent
surface):

- **Manual install** (files dropped/copied into the folder): when the load pass sees a package
  whose identifier has **no record at all** in `extensionTrust`, post a local notification ("New
  extension: *Word Tools*") using the existing `.notify`-style surface and immediately write the
  identifier as `"seen"`. The notification's action **opens the trust model**. Because the entry is
  written on first sight, the notification fires once, not on every poll.
- **App "Install File…" button**: the install panel's success path opens the trust model directly —
  no notification, because the user is already in the app doing the install. The package is recorded
  as `"seen"` and `.untrusted`; the trust model lets them enable immediately.
- **Store install**: no notification and no trust model — the package auto-trusts (§4).

### 6. Trust model / review UI — the single consent surface

New SwiftUI surface in `Sources/OpenClip/UI/Preferences/` (a sheet presented from the Installed tab,
the notification action, and the popup-bar "not enabled" toast action), reusing
`InstalledExtensionsView`'s package-row model. The sheet shows:

- Name, identifier, version (from the manifest).
- The risk rows from §3 (type-derived, with icons).
- Declared capabilities (verbatim).
- List of the package's actions (titles + kinds).
- **Enable** / **Disable** buttons.
- A warning line when the package was tamper-disabled: "Files changed since you enabled it."

`.untrusted` packages get a visible "New / Changed — not enabled" badge in the Installed list, and
clicking the row (or its Review link) opens this sheet — the deferred-enable path. The sheet's
Enable is the only way to go `.untrusted`/`.revoked` → `.trusted`; the Reload button never re-trusts.

### 7. Tamper-watch — hash at enable, verify at load

At **enable time**, record the package's content hash in `extensionTrustHashes`:
`SHA-256(manifest bytes + each referenced script/asset file's bytes)` — a single digest over the
package tree (reuse the validator's existing `sha256Hex`; extend it to cover the package, not just
the manifest).

At **every load** (startup, watcher-triggered hot reload, or manual Reload), recompute and compare.
On mismatch:
- The package flips to `.untrusted` (stays registered-but-gated) and its trust entry is downgraded
  to `"seen"`.
- A notification fires: "*Word Tools* was disabled — its files changed." Its action opens the trust
  model with the "files changed since you enabled it" warning.
- Log under the `extensions` category.

**The Reload button never re-trusts.** Re-enabling is always an explicit Enable through the trust
model. A user who manually edited an extension during development therefore follows this loop per
edit: edit files → click Reload (picks up the change) → the package auto-disables with a
notification → Enable in the trust model to restore. This is deliberately two steps, not one —
"Reload" is a re-scan + update check, never a trust grant — so an attacker who swaps a file on disk
cannot piggyback on a reload to re-grant trust.

This catches both *edits to a trusted package* and *replacement of a whole package folder* (a new
folder under the same identifier is a hash mismatch). It is not cryptographic defense against an
attacker who can write the trust state itself — it is a cheap integrity signal for the common
"something swapped a file" case, consistent with the existing snapshot-diff watcher philosophy.

### 8. Migration for existing installs

On first launch of the new build, every currently-registered package that has no record in
`extensionTrust` is set to `.trusted` and its content hash recorded in `extensionTrustHashes`, so
the ~6 existing installed extensions keep working with zero user action. Source is best-effort
recorded: packages whose manifest identifier appears in the store's listing are marked `"store"`,
the rest `"local"` — so pre-existing installs get update buttons where the store knows them. Only
*newly appearing* packages (no record) start `.untrusted` and get the "seen" notification.

### 9. Update checks — manual only, store packages only

Update detection is **manual-only** and covers **store-sourced packages only** (`extensionSources
== "store"`). No background/periodic polling.

**Trigger:** the **Reload button** in the Installed tab (and the Store tab's fetch, when opened).
Reload does two things in one pass:
1. **Re-scans all extension files** (picks up edits — see §7; this is the dev escape hatch) and
   reapplies the tamper check.
2. **Asks the store** for each store-sourced package's latest version and compares it against the
   installed manifest's `version`.

**Comparison:** the store listing's `version` (new `ExtensionItem` field) vs the installed
manifest's `version`. Semver comparison; if either side has no version, the package is not
updatable via the button. A newer store version → the package is "updatable".

**UI (Installed tab and Store tab):**
- Each updatable package shows an **Update** button next to its Delete/Uninstall button (Installed
  tab) and on its store card.
- An **Update All** button updates every store-sourced package with a pending update in one pass.
- Clicking Update downloads via the existing `RemoteExtensionInstaller.installFromRemoteURL` (the
  same host allowlist + redirect checks apply), which replaces the package folder.

**Update = fresh store install, re-trust.** Because an update is a store action, it re-trusts: the
package is written `"trusted"` with a new content hash, even if it had drifted to `.untrusted`
(tamper). The UI notes that an update overwrites any local edits before applying. A `.revoked`
package is **not** auto-re-enabled by an update — it stays revoked (an update applies the new
files, but consent remains the user's).

### 10. App-version requirement — `minOpenClipVersion`

New optional manifest key (manifest-level, not per-action):

```jsonc
{ "identifier": "com.example.words", "name": "Word Tools", "minOpenClipVersion": "1.5.0", "actions": [ … ] }
```

Semantics:
- **Min version only** (no max). If the running OpenClip version is **older** than the declared
  minimum, the package still loads and validates, but its actions are marked **incompatible** in
  the UI (grayed, "needs OpenClip x.y.z or newer") and excluded from the menu.
- **Load, don't reject.** An incompatible package is not dropped at load (unlike an unknown
  `type`); it is registered-but-marked, so the user sees why it's unavailable rather than a silently
  missing action. It can be enabled once the app is updated.
- Absent `minOpenClipVersion` → compatible with everything (backward compatible with all existing
  manifests).
- The running app version comes from the bundle (`CFBundleShortVersionString`); comparison is
  semver.
- This key is **display + enablement only** — it does not change the trust model. An incompatible
  package's trust state is tracked normally; it is simply not runnable until the app version
  satisfies the minimum.

### 11. Manifest validation — capabilities and version stay permissive

No validation change beyond the new `minOpenClipVersion` field (decoded like `version`, any
non-semver value is treated as absent). `ManifestCapabilityGate` still uses the empty known set (so
a declared capability still rejects, as today), and a missing/invalid `capabilities` array is
displayed as "none declared" — never a load failure. This keeps the hard rule "don't invent
manifest keys / don't reject on capability absence" intact; the enforcement spec later decides what
declared capabilities *mean*.

---

## Files touched

- `Sources/Core/Settings/SettingKey.swift` — `extensionTrust`, `extensionTrustHashes`,
  `extensionSources` keys.
- `Sources/Core/Extensions/ExtensionManager.swift` — trust-gated registration in
  `loadExtensions`; package hashing; placeholder action for untrusted packages; store auto-trust on
  first load; Reload entry point.
- `Sources/Core/Extensions/Manifest/ExtensionManifest.swift` — decode `minOpenClipVersion`.
- `Sources/Core/Extensions/Manifest/ManifestValidation.swift` (or a sibling) — package-level
  content hash helper (reuses `sha256Hex`); semver compare helper.
- `Sources/Core/Extensions/ExtensionsModels.swift` — add `version` to `ExtensionItem` (store API
  dependency).
- `Sources/OpenClip/Platform/Extensions/` — notification on new package detection; trust-model
  presentation; Reload + update orchestration (reusing `RemoteExtensionInstaller`).
- `Sources/OpenClip/UI/Preferences/InstalledExtensionsView.swift` (+ a new trust-model sheet) —
  badges, review surface, Enable/Disable, Update + Update All buttons.
- `Sources/OpenClip/UI/Preferences/ExtensionsStoreView.swift` — per-card Update button; version
  display.
- `docs/developer-guide/AGENTS.md` — document the trust lifecycle, `minOpenClipVersion`, the
  manual-only update flow, and the new manifest key; note the enforcement follow-up.
- `docs/architecture/known-debt.md` — replace the "capability-gating sandbox remains future work"
  note with: consent gate landed; capability *enforcement* still future.
- `web/` store API — add a `version` to each `ExtensionItem` listing (needed for update checks).

## Tests

- `ExtensionManager` gating (Core, temp-dir fixtures):
  - untrusted package → placeholder registered, real actions never perform.
  - trusted package with matching hash → actions register and perform.
  - trusted package with changed script file → flips to untrusted, gated, notification fired.
  - store-sourced package with no record → auto-trusted on first load.
  - local package with no record → stays untrusted (never auto-trusted).
  - migration path: existing packages with no record become trusted once.
  - standalone script file gating (keyed by synthesized id).
- Trust state (Core): `MemorySettingsStore`-backed round-trip of `extensionTrust` /
  `extensionSources`; enable→revoked→enable transitions; deferred-enable path.
- Risk derivation (Core): pure function over action kinds → expected risk rows for a shell package,
  an async-JS package, a url-only package, a group.
- Updates (Core, fixture store API): store package newer version → updatable; equal/missing version
  → not updatable; update re-trusts a drifted package; update does not re-enable a revoked package.
- `minOpenClipVersion` (Core): older app → marked incompatible but loaded; newer/absent → normal;
  non-semver value treated as absent.
- UI (existing snapshot/golden surface if present): untrusted badge renders; enable button flips
  state; Update button appears next to Delete for updatable packages. Otherwise manual.
- Scripts: `validate_extension.sh` unaffected (no manifest rules changed).

## Out of scope

- **Capability enforcement** (JIT prompts, gating `fetch`/`keyPress`/`runShortcut`, seeding
  `ManifestCapabilityGate`, JS honesty-scan acting on mismatches) — follow-up spec.
- Code signing / notary / author identity.
- OS sandboxing (sandbox-exec/seatbelt).
- Per-action (vs per-package) trust granularity.
- Automatic/periodic update polling (deliberately manual-only).
- Store-side version API design beyond adding `version` to the listing (a `web/` change, spec'd in
  the web repo).

## Verification

1. Build gate: `./scripts/dev_run.sh`.
2. `./scripts/test.sh` — full suite (new gating/trust/risk/update/version tests).
3. Manual, each install path:
   - Drop a folder into `~/.openclip/extensions` → notification → trust model → Enable → runs.
   - "Install File…" → trust model opens after install → Enable → runs.
   - Store install → auto-trusted, runs immediately, no trust model.
   - Edit a trusted package's script, click Reload → auto-disabled + notification → Enable in trust
     model (with "files changed" warning) → runs.
   - Store package with a newer listing version → Update button next to Delete; Update All updates
     it; drifted package is re-trusted on update.
   - Existing extensions migrate to trusted on first launch; store-known ones get update buttons.