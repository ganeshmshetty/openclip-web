# Text-Selection Strategy v2

Date: 2026-08-12 · Status: Approved for implementation

## Problem

OpenClip reads the user's selection in the frontmost app and offers actions.
Today that retrieval is a 3-step fall-through chain (`strategyAXDirect` →
`strategySafariJS` → `strategyAXMenuCopy`), and the destructive step is
`useMenuCopy`: for Electron/Chromium apps (VS Code, Obsidian, …) the direct AX
read comes back empty (Chromium doesn't build its AX tree until an assistive
client requests it, and its container elements carry no text), so the app falls
back to pressing Edit ▸ Copy through AX — which writes the pasteboard and then
has to save/restore it. That is a visible, observable side effect on every
selection.

Browser and Electron selections need to be read through the selection *ranges*
the AX layer actually provides (range→string and the text-marker model), never
through a simulated copy. And per-app policy should be a graduated selection
mode, not a binary "use menu copy" switch.

## Goal

Retrieve the selected text with zero observable side effects — in particular,
**never modify the clipboard** unless every non-destructive option has been
exhausted. Concretely, for a selection in an Electron/Chromium app, the chain
must resolve through a read-only path (activated AX tree + role-guided walk +
range/marker reads) such that the clipboard's change count never moves.

## Design

### 1. Policy model — `SelectionMode` replaces `useMenuCopy` (Core)

New `Sources/Core/Rules/SelectionMode.swift`:

```swift
public enum SelectionMode: String, Codable, Sendable, CaseIterable {
    case standard   // steps 1–2 of the chain
    case lenient    // + step 3, + step 4 (manual trigger only)
    case opaque     // + step 5 (manual trigger only, clipboard grab)
}
```

- `AppPolicyContext` (`AppRule.swift`): replace `useMenuCopy: Bool` with
  `selectionMode: SelectionMode` (default `.standard`).
- `AppRule`: add `selectionMode: SelectionMode?` (CodingKey `"selection-mode"`);
  **keep** `useMenuCopy: Bool?` + CodingKey `"use-menu-copy"` for decode compat,
  so existing `~/.openclip/rules.json` files keep working.
- Resolution order in `RuleEngine.resolvePolicies`:
  `rule.selectionMode ?? (rule.useMenuCopy == true ? .lenient : nil) ?? context.selectionMode`.
  Pass both fields through `expandRules`.
- `DefaultAppRules`:
  - Rename `menuCopyApps` → `lenientSelectApps` (PopClip-informed): VSCode
    (+Insiders), Zed, Atom, Sublime, Obsidian, Notion, Figma, Slack, WhatsApp,
    JetBrains, Terminal, iTerm2, Ghostty.
  - Add `opaqueApps`: `com.apple.Spotlight`, `net.ankiweb.dtop`, Plex.
  - Add role sets — runtime AX role strings, not bundle IDs, driving the walk:
    - `textControlRoles`: `kAXTextFieldRole`, `kAXTextAreaRole`,
      `kAXStaticTextRole`, `kAXComboBoxRole`, `kAXWebAreaRole`.
    - `nonTextRoles`: buttons, checkboxes, radio buttons, sliders, menu item,
      cells, etc. (elements never probed for text).
  - Catalog: `:menu-copy-apps:` rule → `:lenient-select-apps:` with
    `selectionMode: .lenient`; add `:opaque-apps:` → `.opaque`. Keep the
    `:menu-copy-apps:` macro resolving to `lenientSelectApps` for old user rules.
  - Keep `safariGroup`/`chromiumGroup`/`firefoxGroup`/`arcGroup` — used only for
    the Safari JS read and future URL/address-bar handling, never extraction.

### 2. Caller-aware retrieval chain (App target)

- `TextRetrieving.swift`: add
  `public enum SelectionTrigger: Sendable { case passive, manual }` and add
  `trigger: SelectionTrigger` to `retrieveTextResult(for:policy:)`
  (`retrieveText(for:policy:)` default passes `.manual`).
- `MacTextRetriever.retrieveTextResult` becomes:

  ```
  1. strategyAXDirect()            // role-guided walk (§3.1)
  2. strategySafariJS(for:)        // unchanged, safariGroup only
  3. if .lenient   → strategyChromium(for:)    // NEW, read-only (§3.3)
  4. if .manual && .lenient → strategyAXMenuCopy(for:)   // refactored (§3.4)
  5. if .manual && .opaque → strategyKeyboardGrab(for:)   // re-added (§3.5)
  → nil (manual caller falls back to clipboard, unchanged)
  ```

- **Passive detection never touches the clipboard.** `MacSelectionMonitor`
  calls with `trigger: .passive`, so steps 4–5 are unreachable there per the
  strategy's §4 rule. This is a deliberate behavior change: today's
  `useMenuCopy` apps (VS Code etc.) resolved passively via menu-copy; they move
  to step 3.
- `HotkeyManager` calls with `trigger: .manual`; its clipboard fallback
  (`isClipboardFallback`, marked clipboard-derived) is untouched.

### 3. Strategy implementations

**3.1 Role-guided direct walk.** Refactor `extractFromAncestors` (currently a
blind depth-4 probe) to walk up and stop at the nearest element whose role ∈
`textControlRoles`; if the focused element's role ∈ `nonTextRoles`, skip probing
text. Keep the existing `kAXSelectedText` → `kAXValue`+`kAXSelectedTextRange`
substring fallback and `kAXBoundsForRangeParameterizedAttribute` bounds read.

**3.3 `strategyChromium`** (NEW; reuse the existing `OnceResume` +
`Constants.axReadTimeout` watchdog pattern, never the shared pool):
- (a) `AXUIElementSetAttributeValue(appElement, kAXManualAccessibilityAttribute,
  kCFBooleanTrue)` — once per PID (lock-guarded `Set<pid_t>` cache).
- (b) Role-guided ancestor walk from the focused element to the nearest text
  control / `AXWebArea`.
- (c) Read `AXSelectedTextRange` (CFRange), then
  `AXUIElementCopyParameterizedAttributeValue(element,
  kAXStringForRangeParameterizedAttribute, range, &str)` — a pure read.
- (d) If empty, prefer the text-marker model:
  `AXSelectedTextMarkerRange` → `kAXStringForTextMarkerRangeParameterizedAttribute`.
- Bounds via `kAXBoundsForRangeParameterizedAttribute` (already in use).

**3.4 `strategyAXMenuCopy` refactor.** Replace the English "Edit"/"Copy"
title walk with key-equivalent matching (`kAXMenuItemCmdChar == "C"` + no-
command modifiers), mirroring `PasteAvailabilityProbe.isPaste`. Extract a
shared `AXMenuItemMatching` helper (find menu item by predicate / press) used by
both the probe and the retriever. Still performs a real copy — keep the
`fetchPasteboardText` save/poll/restore and the 0.15 s deadline. Gated to
`.lenient` + `.manual`.

**3.5 `strategyKeyboardGrab`** (re-added, gated `.opaque` + `.manual`): the
Cmd+C CGEvent path with save/poll/restore, reusing `fetchPasteboardText`. Re-add
`Constants.cVirtualKey` (`CGKeyCode = 0x08`) and a muted-volume helper.
Opt-in per app via `:opaque-apps:` only.

### 4. Constants

`Constants.swift`: re-add `cVirtualKey: CGKeyCode = 0x08`. No other timing
changes (`axReadTimeout` 0.5 s, `pasteProbeTimeout` 0.4 s unchanged).

### 5. Docs

- `docs/text-selection.md`: rewrite the chain description to the 5-step model
  with trigger gating.
- `docs/architecture/known-debt.md`: replace the `strategyAXMenuCopy`
  concurrency note (stack removal note at known-debt.md:140) with the v2 model;
  note passive-vs-manual gating and that Chromium resolution is read-only.
- `docs/logging.md`: update if the new paths add `Log.selection` messages
  worth documenting (no new category expected).
- `todo.md`: add v2 rollout entries (or fold into existing selection items).

## Tests

- `RuleEngineTests`: VS Code/Zed resolve to `.lenient`; random app → `.standard`;
  a `:opaque-apps:` app → `.opaque`; decode-compat test — rules JSON containing
  `{"use-menu-copy": true}` on a bundle ID resolves to `.lenient`.
- `TextRetrieverTests`: keep "clipboard untouched" (passive path). Add:
  passive + `.lenient` policy leaves `NSPasteboard.general.changeCount`
  unchanged; manual + `.standard` still never touches the clipboard.
- Pure-logic tests for role classification: extract the
  `textControlRoles`/`nonTextRoles` decision and the stop-condition predicate
  of the role-guided walk as testable pure functions; assert membership and
  non-membership (e.g. `AXTextFieldRole` in, `AXButtonRole` out).
- `ActionOptionStoreTests` / `GoldenExtensionPlatformTests` compile unchanged
  (default args cover the new field).

## Verification

1. Regenerate project (new `.swift` file): `xcodegen generate` (scripts re-run
   automatically).
2. `./scripts/dev_run.sh`; then manually select text in VS Code and Obsidian,
   trigger the popup passively, and assert the clipboard change count never
   moves (log + change-count probe).
3. `./scripts/test.sh` full suite (`CanvasKeyBehaviorTests
   .testDisabledNodeDoesNotFireOrFocus` is known-flaky, unrelated).
4. Regression: non-Electron `.lenient` apps that previously resolved via passive
   menu-copy must now resolve through step 1/3; if any regress, widen step 3's
   role walk instead of re-enabling clipboard touches.

## Out of scope

- Persisting or archiving clipboard contents.
- Reading from secure text fields (the platform hides them by design).
- Per-browser extraction heuristics — browsers differ from other apps only at
  step 2 / step 3; their bundle groups exist for non-retrieval concerns.
- Mount-time async / canvas loading UI (unrelated to retrieval).