# Custom Action Groups Reimplementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reimplement user-created Custom Action Groups so users can organize actions into collapsible group folders across the popup and preferences without mutating action IDs, breaking extensions, creating 1-item zombie groups, or desyncing group metadata.

**Architecture:** A clean domain model built on `ActionGroupDef` and `CustomGroupAction: Action, SubActionProviding`. Grouped actions retain their canonical, immutable IDs (`builtin.copy`, `com.user.myscript`) and are resolved dynamically by catalog lookup. `ActionCoordinator` acts as the single source of truth for group definitions, strictly enforcing the $\ge 2$ member invariant and atomic reordering. The Preferences UI provides dedicated `CreateGroupSheet` and `EditGroupSheet` modals with clear eligibility gating.

**Tech Stack:** Swift 6 (`SWIFT_STRICT_CONCURRENCY: complete`), SwiftUI, AppKit, Combine, XcodeGen.

---

## Lessons Learned & Addressed Defects

1. **No ID Mutation**: Retired `VirtualGroupAction` and prefixing (`vgroup.<id>.<originalID>`). Actions keep their canonical ID everywhere (uninstallation, usage store, toggles, options).
2. **No Zombie 1-Item Groups**: Strict $\ge 2$ member invariant. If removing a member or uninstalling an extension drops a group below 2 members, `ActionCoordinator` automatically dissolves the group.
3. **No Broken Native Extension Groups**: Only top-level standalone actions are eligible for grouping. Sub-actions of native extension packages and existing custom group members cannot be nested.
4. **Unified Source of Truth for Group Metadata**: Group title and icon live in `ActionGroupDef` and are edited via `EditGroupSheet`, not `ActionCustomizationManager`.
5. **Accurate Context Menu & Selection**: Preferences list explicitly validates selected candidate actions, ensuring right-click and toolbar actions operate on the correct items.

---

## Global Constraints

- Swift 6 strict concurrency (`SWIFT_STRICT_CONCURRENCY: complete`) across all targets.
- **Core is pure** — no AppKit/SwiftUI imports in `Sources/Core/`.
- No direct `UserDefaults.standard` — route through `SettingsStore` (`.actionGroups`, `.actionOrder`, `.disabledActionIDs`).
- `ActionCoordinator` is the composition root.
- All actions have immutable, canonical IDs.
- Group invariant: every user group must contain $\ge 2$ registered member actions.
- All test suites must be isolated using in-memory test doubles (`MemorySettingsStore`, `TestIsolation.reset()`) with zero skips.
- Re-run `xcodegen generate` whenever `.swift` files are added or removed.

---

## File Structure Map

| File | Target | Responsibility |
| :--- | :--- | :--- |
| `Sources/Core/Actions/ActionGroupDef.swift` | Core | Codable definition of user-created group (`id`, `title`, `iconName`, `memberActionIDs`). |
| `Sources/Core/Actions/CustomGroupAction.swift` | Core | `Action` & `SubActionProviding` representing a user group; dynamically resolves members from catalog. |
| ~~`Sources/Core/Actions/VirtualGroupAction.swift`~~ | Core | **DELETE** — retired wrapper that mutated action IDs. |
| `Sources/Core/Settings/SettingKey.swift` | Core | Declares `SettingKey.actionGroups: SettingKey<Data?>` (already exists in working tree). |
| `Sources/Core/Actions/ActionCoordinator.swift` | Core | Manages `actionGroupDefs`, enforces $\ge 2$ invariant, handles orphan pruning on uninstalls. |
| `Sources/Core/Actions/ActionRegistry.swift` | Core | Materializes `CustomGroupAction` into `actions`, keeps grouped members with canonical IDs, hides members of disabled groups. |
| `Sources/Core/Actions/ActionCustomizationManager.swift` | Core | **Revert** `effectiveID(for:)` VirtualGroupAction unwrapping — no longer needed. |
| `Sources/Core/Extensions/Manifest/ExtensionManifestStore.swift` | Core | **Revert** `effectiveAction`/`effectiveID` VirtualGroupAction unwrapping. |
| `Sources/OpenClip/UI/Preferences/CreateGroupSheet.swift` | OpenClip | Modal sheet to create a new group from selected candidate action IDs. |
| `Sources/OpenClip/UI/Preferences/EditGroupSheet.swift` | OpenClip | Dedicated modal sheet to edit group name/icon, manage/remove members, or disband group. |
| `Sources/OpenClip/UI/Preferences/EditActionSheet.swift` | OpenClip | **Revert** `effectiveAction`/`effectiveActionID` VirtualGroupAction unwrapping. |
| `Sources/OpenClip/UI/Preferences/ActionsTabView.swift` | OpenClip | Preferences table displaying groups, disclosure states, selection validation, and gear routing. |
| `Sources/OpenClip/UI/Popup/PopupWindowController.swift` | OpenClip | **Revert** VirtualGroupAction right-click handling. |
| `Tests/OpenClipTests/ActionGroupDefTests.swift` | Tests | Unit tests for `ActionGroupDef` and `CustomGroupAction` serialization and invariants. |
| `Tests/OpenClipTests/ActionCoordinatorGroupTests.swift` | Tests | Unit tests for coordinator group lifecycle, auto-disbanding, and orphan pruning. |
| `Tests/OpenClipTests/ActionRegistryGroupTests.swift` | Tests | Unit tests for registry sorting, subaction hiding, search catalog inclusion, and reordering. |
| `Tests/OpenClipTests/ActionGroupIntegrationTests.swift` | Tests | End-to-end tests for extension uninstallation within groups, toggles, and popup scoped search. |
| ~~`Tests/OpenClipTests/VirtualGroupTests.swift`~~ | Tests | **DELETE** — tests for the retired VirtualGroupAction. |

---

## Tasks

### Task 0: Clean Up VirtualGroupAction Code

**Rationale:** The first implementation used a `VirtualGroupAction` wrapper that prefixed action IDs (`vgroup.<id>.<originalID>`), causing cascading bugs in uninstall, customization, and options. Before reimplementing, revert/delete all traces of this approach so we start clean.

- [ ] **Step 1: Delete retired files**

```bash
rm Sources/Core/Actions/VirtualGroupAction.swift
rm Tests/OpenClipTests/VirtualGroupTests.swift
```

- [ ] **Step 2: Revert VirtualGroupAction unwrapping from existing files**

Revert the `effectiveID(for:)` / `effectiveAction` / `VirtualGroupAction` type-checks from these files (restore them to their pre-group-feature state):

- `Sources/Core/Actions/ActionCustomizationManager.swift` — remove `effectiveID(for:)` that unwraps `VirtualGroupAction.originalActionID`
- `Sources/Core/Extensions/Manifest/ExtensionManifestStore.swift` — remove `effectiveAction`/`effectiveID` unwrapping
- `Sources/OpenClip/UI/Preferences/EditActionSheet.swift` — remove `effectiveAction`/`effectiveActionID` unwrapping
- `Sources/OpenClip/UI/Popup/PopupWindowController.swift` — remove `VirtualGroupAction` right-click handling

- [ ] **Step 3: Re-generate project and verify existing tests pass**

```bash
xcodegen generate
./scripts/test.sh
```
Expected: PASS (existing non-group tests; group tests removed in Step 1).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove VirtualGroupAction and all ID-prefixing code"
```

---

### Task 1: Core Domain Model (`ActionGroupDef` & `CustomGroupAction`)

**Files:**
- Create: `Sources/Core/Actions/ActionGroupDef.swift`
- Create: `Sources/Core/Actions/CustomGroupAction.swift`
- Modify: `Sources/Core/Settings/SettingKey.swift`
- Test: `Tests/OpenClipTests/ActionGroupDefTests.swift`

**Interfaces:**
- `ActionGroupDef`: `id: String`, `title: String`, `iconName: String`, `memberActionIDs: [String]`
- `CustomGroupAction`: Conforms to `Action`, `SubActionProviding`, `Sendable`. `subActions(in catalog: [any Action]) -> [any Action]`
- `SettingKey.actionGroups`: `SettingKey<Data?>("action.groups", defaultValue: nil)`

- [ ] **Step 1: Write failing unit tests for `ActionGroupDef` and `CustomGroupAction`**

```swift
import XCTest
@testable import Core

final class ActionGroupDefTests: XCTestCase {
    func testRoundTripSerialization() throws {
        let def = ActionGroupDef(
            id: "vgroup.test",
            title: "My Group",
            iconName: "folder",
            memberActionIDs: ["builtin.copy", "builtin.paste"]
        )
        let data = try ActionGroupDef.encode([def])
        let decoded = try ActionGroupDef.decode(from: data)
        XCTAssertEqual(decoded, [def])
    }

    func testCustomGroupActionResolvesSubActionsFromCatalogByCanonicalID() {
        let action1 = DummyAction(id: "builtin.copy", title: "Copy")
        let action2 = DummyAction(id: "builtin.paste", title: "Paste")
        let action3 = DummyAction(id: "builtin.cut", title: "Cut")
        let catalog: [any Action] = [action1, action2, action3]

        let group = CustomGroupAction(
            id: "vgroup.test",
            title: "Clipboard",
            iconName: "doc.on.clipboard",
            memberActionIDs: ["builtin.copy", "builtin.paste"]
        )

        let resolved = group.subActions(in: catalog)
        XCTAssertEqual(resolved.map(\.id), ["builtin.copy", "builtin.paste"])
    }
}

private struct DummyAction: Action, Sendable {
    let id: String
    let title: String
    var icon: ActionIcon { .symbol("star") }
    var chrome: ActionChrome { ActionChrome(badge: .none, rowStyle: .standard, popupBehavior: .perform, source: .builtin) }
    @MainActor func isEnabled(for context: ActionContext) -> Bool { true }
    @MainActor func perform(_ context: ActionContext) async throws -> ActionResult { .none }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/test.sh ActionGroupDefTests`
Expected: FAIL (types not found)

- [ ] **Step 3: Implement `ActionGroupDef`, `CustomGroupAction`, and `SettingKey.actionGroups`**

`Sources/Core/Actions/ActionGroupDef.swift`:
```swift
import Foundation

public struct ActionGroupDef: Codable, Sendable, Equatable, Hashable {
    public let id: String
    public var title: String
    public var iconName: String
    public var memberActionIDs: [String]

    public init(id: String, title: String, iconName: String, memberActionIDs: [String]) {
        self.id = id
        self.title = title
        self.iconName = iconName
        self.memberActionIDs = memberActionIDs
    }

    public static func encode(_ groups: [ActionGroupDef]) throws -> Data {
        try JSONEncoder().encode(groups)
    }

    public static func decode(from data: Data) throws -> [ActionGroupDef] {
        guard !data.isEmpty else { return [] }
        return try JSONDecoder().decode([ActionGroupDef].self, from: data)
    }

    public static func decodeOrEmpty(from data: Data?) -> [ActionGroupDef] {
        guard let data, !data.isEmpty else { return [] }
        return (try? decode(from: data)) ?? []
    }
}
```

`Sources/Core/Actions/CustomGroupAction.swift`:
```swift
import Foundation

public struct CustomGroupAction: Action, SubActionProviding, Sendable {
    public let id: String
    public let title: String
    public let icon: ActionIcon
    public let chrome: ActionChrome
    public let memberActionIDs: [String]

    public init(id: String, title: String, iconName: String, memberActionIDs: [String]) {
        self.id = id
        self.title = title
        self.icon = .symbol(iconName)
        self.chrome = ActionChrome(
            badge: .none,
            rowStyle: .actionGroup,
            popupBehavior: .showSubActions,
            source: .builtin
        )
        self.memberActionIDs = memberActionIDs
    }

    @MainActor
    public func isEnabled(for context: ActionContext) -> Bool {
        !context.selection.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    @MainActor
    public func matchInfo(for context: ActionContext) -> ActionMatchInfo? {
        nil
    }

    @MainActor
    public func perform(_ context: ActionContext) async throws -> ActionResult {
        .none
    }

    public func subActions(in catalog: [any Action]) -> [any Action] {
        let catalogByID = Dictionary(catalog.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return memberActionIDs.compactMap { catalogByID[$0] }
    }
}
```

`Sources/Core/Settings/SettingKey.swift` — this key already exists in the working tree. Verify it matches:
```swift
static var actionGroups: SettingKey<Data?> { SettingKey<Data?>("action.groups", defaultValue: nil) }
```

- [ ] **Step 4: Re-generate project and verify tests pass**

Run:
```bash
xcodegen generate
./scripts/test.sh ActionGroupDefTests
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Actions/ActionGroupDef.swift Sources/Core/Actions/CustomGroupAction.swift Sources/Core/Settings/SettingKey.swift Tests/OpenClipTests/ActionGroupDefTests.swift OpenClip.xcodeproj
git commit -m "feat(core): add ActionGroupDef and CustomGroupAction with canonical ID subaction resolution"
```

---

### Task 2: ActionCoordinator Group Lifecycle & Invariants

**Files:**
- Modify: `Sources/Core/Actions/ActionCoordinator.swift`
- Test: `Tests/OpenClipTests/ActionCoordinatorGroupTests.swift`

**Requirements:**
- `createGroup(title:iconName:memberActionIDs:)`: Validates $\ge 2$ unique IDs. Removes members from any existing custom group. Appends group def and persists.
- `updateGroup(groupID:title:iconName:memberActionIDs:)`: Updates title, icon, and members. If members count $< 2$, auto-disbands group.
- `ungroup(groupID:)`: Drops group def, restoring members to top-level.
- `removeFromGroup(actionID:groupID:)`: Drops member from group. If remaining members $< 2$, auto-disbands group.
- `pruneOrphans()`: Runs when extensions are loaded or uninstalled (`onUnregister(actionID)`). Removes missing IDs. Auto-disbands groups with $< 2$ members.
- `reset()`: Clears in-memory defs and resets `.actionGroups` setting.

- [ ] **Step 1: Write failing unit tests for ActionCoordinator group lifecycle**

`Tests/OpenClipTests/ActionCoordinatorGroupTests.swift`:
```swift
import XCTest
@testable import Core

@MainActor
final class ActionCoordinatorGroupTests: XCTestCase {
    private var settingsStore: MemorySettingsStore!
    private var coordinator: ActionCoordinator!
    private var registry: ActionRegistry!

    override func setUp() {
        super.setUp()
        settingsStore = MemorySettingsStore()
        registry = ActionRegistry(settingsStore: settingsStore)
        coordinator = ActionCoordinator(registry: registry, settingsStore: settingsStore)
        coordinator.register(action: DummyAction(id: "action.1", title: "Action 1"))
        coordinator.register(action: DummyAction(id: "action.2", title: "Action 2"))
        coordinator.register(action: DummyAction(id: "action.3", title: "Action 3"))
    }

    func testCreateGroupEnforcesMinimumTwoMembers() {
        coordinator.createGroup(title: "Invalid", iconName: "folder", memberActionIDs: ["action.1"])
        XCTAssertTrue(coordinator.actionGroupDefs.isEmpty)

        coordinator.createGroup(title: "Valid", iconName: "folder", memberActionIDs: ["action.1", "action.2"])
        XCTAssertEqual(coordinator.actionGroupDefs.count, 1)
        XCTAssertEqual(coordinator.actionGroupDefs.first?.memberActionIDs, ["action.1", "action.2"])
    }

    func testRemoveMemberAutoDisbandsWhenCountDropsBelowTwo() {
        coordinator.createGroup(title: "Valid", iconName: "folder", memberActionIDs: ["action.1", "action.2", "action.3"])
        XCTAssertEqual(coordinator.actionGroupDefs.count, 1)

        coordinator.removeFromGroup(actionID: "action.1", groupID: coordinator.actionGroupDefs[0].id)
        XCTAssertEqual(coordinator.actionGroupDefs.count, 1)
        XCTAssertEqual(coordinator.actionGroupDefs[0].memberActionIDs, ["action.2", "action.3"])

        // Removing another member leaves 1 member -> auto disband
        coordinator.removeFromGroup(actionID: "action.2", groupID: coordinator.actionGroupDefs[0].id)
        XCTAssertTrue(coordinator.actionGroupDefs.isEmpty, "Group must auto-disband when < 2 members remain")
    }

    func testUnregisterExtensionPrunesMemberAndAutoDisbandsDegenerateGroup() {
        coordinator.createGroup(title: "Valid", iconName: "folder", memberActionIDs: ["action.1", "action.2"])
        coordinator.unregister(actionID: "action.1")

        XCTAssertTrue(coordinator.actionGroupDefs.isEmpty, "Group must auto-disband when member uninstalled")
    }
}

private struct DummyAction: Action, Sendable {
    let id: String
    let title: String
    var icon: ActionIcon { .symbol("star") }
    var chrome: ActionChrome { ActionChrome(badge: .none, rowStyle: .standard, popupBehavior: .perform, source: .builtin) }
    @MainActor func isEnabled(for context: ActionContext) -> Bool { true }
    @MainActor func perform(_ context: ActionContext) async throws -> ActionResult { .none }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `./scripts/test.sh ActionCoordinatorGroupTests`
Expected: FAIL

- [ ] **Step 3: Implement ActionCoordinator group management and pruning**

`Sources/Core/Actions/ActionCoordinator.swift`:
```swift
    // MARK: - Custom Action Groups

    @Published public private(set) var actionGroupDefs: [ActionGroupDef] = []

    public func loadGroupDefs() {
        let data = settingsStore.get(.actionGroups)
        var defs = ActionGroupDef.decodeOrEmpty(from: data)
        let pruned = pruneOrphans(in: defs)
        if pruned != defs {
            defs = pruned
            saveGroupDefs(defs)
        }
        actionGroupDefs = defs
        registry.setGroupDefs(actionGroupDefs)
    }

    private func pruneOrphans(in defs: [ActionGroupDef]) -> [ActionGroupDef] {
        let active = registry.registeredActionIDs
        guard !active.isEmpty, !defs.isEmpty else { return defs }
        return defs.compactMap { def -> ActionGroupDef? in
            var copy = def
            copy.memberActionIDs.removeAll { !active.contains($0) }
            return copy.memberActionIDs.count >= 2 ? copy : nil
        }
    }

    private func pruneGroups(removing actionID: String) {
        var updated: [ActionGroupDef] = []
        var changed = false
        for var def in actionGroupDefs {
            if def.memberActionIDs.contains(actionID) {
                def.memberActionIDs.removeAll { $0 == actionID }
                changed = true
                if def.memberActionIDs.count >= 2 {
                    updated.append(def)
                }
            } else {
                updated.append(def)
            }
        }
        if changed {
            actionGroupDefs = updated
            saveAndApplyGroupDefs()
        }
    }

    public func createGroup(title: String, iconName: String, memberActionIDs: [String]) {
        var seen = Set<String>()
        var deduped: [String] = []
        for id in memberActionIDs where !id.isEmpty {
            if seen.insert(id).inserted {
                deduped.append(id)
            }
        }
        guard deduped.count >= 2 else { return }

        // Remove members from existing groups
        let memberSet = Set(deduped)
        var updated: [ActionGroupDef] = []
        for var def in actionGroupDefs {
            def.memberActionIDs.removeAll { memberSet.contains($0) }
            if def.memberActionIDs.count >= 2 {
                updated.append(def)
            }
        }

        let newID = "vgroup.\(UUID().uuidString.prefix(8).lowercased())"
        let newDef = ActionGroupDef(id: newID, title: title, iconName: iconName, memberActionIDs: deduped)
        updated.append(newDef)
        actionGroupDefs = updated
        saveAndApplyGroupDefs()
    }

    public func updateGroup(groupID: String, title: String, iconName: String, memberActionIDs: [String]) {
        guard let index = actionGroupDefs.firstIndex(where: { $0.id == groupID }) else { return }
        var seen = Set<String>()
        let deduped = memberActionIDs.filter { seen.insert($0).inserted }
        if deduped.count < 2 {
            ungroup(groupID: groupID)
            return
        }
        actionGroupDefs[index].title = title
        actionGroupDefs[index].iconName = iconName
        actionGroupDefs[index].memberActionIDs = deduped
        saveAndApplyGroupDefs()
    }

    public func ungroup(groupID: String) {
        actionGroupDefs.removeAll { $0.id == groupID }
        saveAndApplyGroupDefs()
    }

    public func removeFromGroup(actionID: String, groupID: String) {
        guard let index = actionGroupDefs.firstIndex(where: { $0.id == groupID }) else { return }
        actionGroupDefs[index].memberActionIDs.removeAll { $0 == actionID }
        if actionGroupDefs[index].memberActionIDs.count < 2 {
            actionGroupDefs.remove(at: index)
        }
        saveAndApplyGroupDefs()
    }

    public func reset() {
        actionGroupDefs = []
        registry.setGroupDefs([])
        settingsStore.set(.actionGroups, value: nil)
    }

    private func saveGroupDefs(_ defs: [ActionGroupDef]) {
        let data = try? ActionGroupDef.encode(defs)
        settingsStore.set(.actionGroups, value: data)
    }

    private func saveAndApplyGroupDefs() {
        saveGroupDefs(actionGroupDefs)
        registry.setGroupDefs(actionGroupDefs)
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `./scripts/test.sh ActionCoordinatorGroupTests`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Actions/ActionCoordinator.swift Tests/OpenClipTests/ActionCoordinatorGroupTests.swift
git commit -m "feat(core): implement ActionCoordinator group lifecycle with strict 2-member invariant"
```

---

### Task 3: ActionRegistry Integration & Catalog Sorting

**Files:**
- Modify: `Sources/Core/Actions/ActionRegistry.swift`
- Test: `Tests/OpenClipTests/ActionRegistryGroupTests.swift`

**Requirements:**
- `setGroupDefs(_ defs: [ActionGroupDef])`: Updates group defs and triggers `sortActions()`.
- `sortActions()`:
  - Materializes `CustomGroupAction` for each valid group def.
  - Injects `CustomGroupAction` at the position of its first member.
  - **Keeps grouped member actions in `actions` with canonical IDs** — `PopupView.displayActions` already hides sub-actions from the bar via `SubActionResolver`, and `ActionsTabView.listRows` nests them using a custom group membership lookup (Task 5).
  - Members of each group are gathered contiguously after their group header.
- `availableActions(for:)`: Hides custom group members when their parent group is disabled, parallel to the existing prefix-based hiding for extension groups.
- `searchCatalog(for:)`: No special handling needed — grouped members stay in `actions` with canonical IDs, so the existing logic works.
- `moveActions(from:to:)`: Updates `.actionOrder` with canonical IDs (skipping synthetic group IDs).

> [!IMPORTANT]
> Members **must stay in `actions`** because `PopupView.displayActions` calls `SubActionResolver().subActions(of:in:)` with `actions` as the catalog. If members were removed, `CustomGroupAction.subActions(in:)` would return `[]`, breaking the popup bar and scoped search entirely.

- [ ] **Step 1: Write failing unit tests for ActionRegistry group sorting and catalog**

`Tests/OpenClipTests/ActionRegistryGroupTests.swift`:
```swift
import XCTest
@testable import Core

@MainActor
final class ActionRegistryGroupTests: XCTestCase {
    private var settingsStore: MemorySettingsStore!
    private var registry: ActionRegistry!

    override func setUp() {
        super.setUp()
        settingsStore = MemorySettingsStore()
        registry = ActionRegistry(settingsStore: settingsStore)
    }

    func testSortActionsInjectsGroupHeaderAndKeepsMembersInActions() {
        let a1 = DummyAction(id: "action.1", title: "Action 1")
        let a2 = DummyAction(id: "action.2", title: "Action 2")
        let a3 = DummyAction(id: "action.3", title: "Action 3")
        registry.register(builtIns: [a1, a2, a3])

        let def = ActionGroupDef(id: "vgroup.g1", title: "My Group", iconName: "folder", memberActionIDs: ["action.1", "action.3"])
        registry.setGroupDefs([def])

        // actions: [vgroup.g1, action.1, action.3, action.2]
        // Group header injected at first member; members gathered contiguously; ungrouped actions follow.
        let ids = registry.actions.map(\.id)
        XCTAssertEqual(ids[0], "vgroup.g1")
        XCTAssertTrue(ids.contains("action.1"), "Grouped members must stay in actions with canonical IDs")
        XCTAssertTrue(ids.contains("action.3"), "Grouped members must stay in actions with canonical IDs")
        XCTAssertTrue(ids.contains("action.2"), "Non-grouped actions must remain")

        guard let groupAction = registry.actions.first(where: { $0.id == "vgroup.g1" }) as? CustomGroupAction else {
            return XCTFail("Expected CustomGroupAction")
        }
        let subActions = groupAction.subActions(in: registry.actions)
        XCTAssertEqual(subActions.map(\.id), ["action.1", "action.3"])
    }

    func testAvailableActionsHidesCustomGroupMembersWhenGroupDisabled() {
        let a1 = DummyAction(id: "action.1", title: "Action 1")
        let a2 = DummyAction(id: "action.2", title: "Action 2")
        registry.register(builtIns: [a1, a2])

        let def = ActionGroupDef(id: "vgroup.g1", title: "My Group", iconName: "folder", memberActionIDs: ["action.1", "action.2"])
        registry.setGroupDefs([def])

        // Disable the group
        settingsStore.set(.disabledActionIDs, value: ["vgroup.g1"])

        let selection = SelectionContext(
            text: "hello",
            sourceApp: AppIdentity(bundleIdentifier: "com.test", localizedName: "Test"),
            cursorPosition: .zero,
            timestamp: Date(),
            appPolicy: .default
        )
        let context = ActionContext(selection: selection)
        let available = registry.availableActions(for: context)

        XCTAssertFalse(available.contains(where: { $0.id == "vgroup.g1" }), "Disabled group must be hidden")
        XCTAssertFalse(available.contains(where: { $0.id == "action.1" }), "Members of disabled group must be hidden")
        XCTAssertFalse(available.contains(where: { $0.id == "action.2" }), "Members of disabled group must be hidden")
    }
}

private struct DummyAction: Action, Sendable {
    let id: String
    let title: String
    var icon: ActionIcon { .symbol("star") }
    var chrome: ActionChrome { ActionChrome(badge: .none, rowStyle: .standard, popupBehavior: .perform, source: .builtin) }
    @MainActor func isEnabled(for context: ActionContext) -> Bool { true }
    @MainActor func perform(_ context: ActionContext) async throws -> ActionResult { .none }
}
```

- [ ] **Step 2: Run test to verify failure**

Run: `./scripts/test.sh ActionRegistryGroupTests`
Expected: FAIL

- [ ] **Step 3: Implement ActionRegistry group sorting and custom group member hiding**

`Sources/Core/Actions/ActionRegistry.swift`:
```swift
    private var groupDefs: [ActionGroupDef] = []

    public func setGroupDefs(_ defs: [ActionGroupDef]) {
        self.groupDefs = defs
        sortActions()
    }

    private func sortActions() {
        let order = settingsStore.get(.actionOrder)
        let orderIndexMap: [String: Int] = Dictionary(
            order.enumerated().map { ($1, $0) },
            uniquingKeysWith: { first, _ in first }
        )

        let ranked: [(action: any Action, tier: Int, rank: Int, stableOffset: Int)] = registeredActions.enumerated().map { offset, action in
            if let index = orderIndexMap[action.id] {
                return (action, 0, index, offset)
            } else if ActionIdentity.isBuiltin(action) {
                return (action, 1, 0, offset)
            } else {
                return (action, 2, 0, offset)
            }
        }

        let sortedBase = ranked
            .sorted { lhs, rhs in
                if lhs.tier != rhs.tier { return lhs.tier < rhs.tier }
                if lhs.rank != rhs.rank { return lhs.rank < rhs.rank }
                return lhs.stableOffset < rhs.stableOffset
            }
            .map(\.action)

        guard !groupDefs.isEmpty else {
            actions = sortedBase
            return
        }

        // Build a set of all grouped action IDs for fast lookup
        let allGroupedIDs = Set(groupDefs.flatMap(\.memberActionIDs))

        // Pre-collect each group's members in their sorted order so we can
        // inject them contiguously after the group header
        var groupMembers: [String: [any Action]] = [:]
        for def in groupDefs {
            let memberSet = Set(def.memberActionIDs)
            groupMembers[def.id] = sortedBase.filter { memberSet.contains($0.id) }
        }

        var result: [any Action] = []
        var injectedGroupIDs = Set<String>()

        for action in sortedBase {
            if allGroupedIDs.contains(action.id) {
                // Inject group header + all members on first member encounter
                for def in groupDefs where !injectedGroupIDs.contains(def.id) {
                    if def.memberActionIDs.contains(action.id) {
                        injectedGroupIDs.insert(def.id)
                        result.append(CustomGroupAction(
                            id: def.id,
                            title: def.title,
                            iconName: def.iconName,
                            memberActionIDs: def.memberActionIDs
                        ))
                        // Add all members contiguously after the header
                        if let members = groupMembers[def.id] {
                            result.append(contentsOf: members)
                        }
                        break
                    }
                }
                // Skip — already emitted during group injection above
                continue
            }
            result.append(action)
        }

        // Catch any remaining groups whose members weren't in sortedBase
        for def in groupDefs where !injectedGroupIDs.contains(def.id) {
            result.append(CustomGroupAction(
                id: def.id,
                title: def.title,
                iconName: def.iconName,
                memberActionIDs: def.memberActionIDs
            ))
        }

        actions = result
    }
```

Add custom group member hiding to `availableActions(for:)` — insert this **after** the existing prefix-based extension group hiding block:

```swift
    // Custom groups: hide members of a disabled custom group.
    // This parallels the prefix-based hiding above but uses the explicit
    // memberActionIDs list since custom group members keep canonical IDs.
    let customGroupMemberToGroupID: [String: String] = {
        var map: [String: String] = [:]
        for def in groupDefs {
            for memberID in def.memberActionIDs {
                map[memberID] = def.id
            }
        }
        return map
    }()

    // In the final filter, add alongside the prefix check:
    if let owningGroupID = customGroupMemberToGroupID[action.id],
       !enabledGroupIDs.contains(owningGroupID) {
        return false
    }
```

- [ ] **Step 4: Re-generate project and verify tests pass**

Run:
```bash
xcodegen generate
./scripts/test.sh ActionRegistryGroupTests
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add Sources/Core/Actions/ActionRegistry.swift Tests/OpenClipTests/ActionRegistryGroupTests.swift
git commit -m "feat(core): update ActionRegistry to materialize CustomGroupAction with canonical member IDs"
```

---

### Task 4: Preferences UI — Dedicated `CreateGroupSheet` and `EditGroupSheet`

**Files:**
- Create: `Sources/OpenClip/UI/Preferences/CreateGroupSheet.swift`
- Create: `Sources/OpenClip/UI/Preferences/EditGroupSheet.swift`
- Modify: `Sources/OpenClip/UI/Preferences/EditActionSheet.swift`

**Requirements:**
- `CreateGroupSheet`: Simple modal to input title and select icon for the candidate members. Calls `ActionCoordinator.shared.createGroup`.
- `EditGroupSheet`: Dedicated sheet for `ActionGroupDef`:
  - Modifies `title` and `iconName`.
  - Shows list of member actions with individual "Remove" buttons.
  - "Ungroup" destructive button to disband group.
  - Saves directly to `ActionCoordinator.shared.updateGroup`.
- `EditActionSheet`: Only presents for non-group actions.

- [ ] **Step 1: Create `CreateGroupSheet.swift`**

```swift
import SwiftUI
import Core

@MainActor
struct CreateGroupSheet: View {
    let memberActionIDs: [String]
    @Environment(\.dismiss) private var dismiss
    @State private var title: String = ""
    @State private var iconName: String = "folder"
    @State private var showingIconPicker = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Create Action Group")
                .font(.headline)

            HStack(spacing: 10) {
                TextField("Group Name", text: $title)
                    .textFieldStyle(.roundedBorder)

                Button {
                    showingIconPicker.toggle()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: iconName)
                            .frame(width: 16, height: 16)
                        Image(systemName: "chevron.down")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.06)))
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showingIconPicker, arrowEdge: .bottom) {
                    IconPickerPopover(selectedIcon: $iconName)
                }
            }

            Text("\(memberActionIDs.count) actions will be grouped.")
                .font(.caption)
                .foregroundColor(.secondary)

            HStack {
                Spacer()
                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)
                Button("Create") {
                    ActionCoordinator.shared.createGroup(
                        title: title.trimmingCharacters(in: .whitespaces),
                        iconName: iconName,
                        memberActionIDs: memberActionIDs
                    )
                    dismiss()
                }
                .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(width: 360)
    }
}
```

- [ ] **Step 2: Create `EditGroupSheet.swift`**

```swift
import SwiftUI
import Core

@MainActor
struct EditGroupSheet: View {
    let groupID: String
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var coordinator = ActionCoordinator.shared

    @State private var title: String = ""
    @State private var iconName: String = "folder"
    @State private var memberIDs: [String] = []
    @State private var showingIconPicker = false

    private var groupDef: ActionGroupDef? {
        coordinator.actionGroupDefs.first(where: { $0.id == groupID })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Edit Group")
                    .font(.headline)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundColor(.secondary)
                }
                .buttonStyle(.plain)
            }

            HStack(spacing: 10) {
                TextField("Group Name", text: $title)
                    .textFieldStyle(.roundedBorder)

                Button {
                    showingIconPicker.toggle()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: iconName)
                            .frame(width: 16, height: 16)
                        Image(systemName: "chevron.down")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.06)))
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showingIconPicker, arrowEdge: .bottom) {
                    IconPickerPopover(selectedIcon: $iconName)
                }
            }

            Text("MEMBERS")
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(.secondary)

            VStack(spacing: 6) {
                ForEach(memberIDs, id: \.self) { actionID in
                    let resolvedAction = coordinator.actions.first(where: { $0.id == actionID })
                    HStack {
                        if let icon = resolvedAction?.icon {
                            ActionIconView(icon: icon, size: 14)
                        }
                        Text(resolvedAction?.title ?? actionID)
                            .font(.system(size: 12))
                        Spacer()
                        Button {
                            memberIDs.removeAll { $0 == actionID }
                        } label: {
                            Image(systemName: "minus.circle")
                                .foregroundColor(.red)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(RoundedRectangle(cornerRadius: 6).fill(Color.primary.opacity(0.03)))
                }
            }

            Divider()

            HStack {
                Button("Ungroup", role: .destructive) {
                    coordinator.ungroup(groupID: groupID)
                    dismiss()
                }
                .buttonStyle(.plain)
                .foregroundColor(.red)

                Spacer()

                Button("Cancel") { dismiss() }
                    .keyboardShortcut(.cancelAction)

                Button("Save") {
                    coordinator.updateGroup(
                        groupID: groupID,
                        title: title.trimmingCharacters(in: .whitespaces),
                        iconName: iconName,
                        memberActionIDs: memberIDs
                    )
                    dismiss()
                }
                .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty || memberIDs.count < 2)
                .keyboardShortcut(.defaultAction)
            }
        }
        .padding(18)
        .frame(width: 360)
        .onAppear {
            if let groupDef {
                title = groupDef.title
                iconName = groupDef.iconName
                memberIDs = groupDef.memberActionIDs
            }
        }
    }
}
```

- [ ] **Step 3: Re-generate project and verify clean build**

Run:
```bash
xcodegen generate
./scripts/test.sh core
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add Sources/OpenClip/UI/Preferences/CreateGroupSheet.swift Sources/OpenClip/UI/Preferences/EditGroupSheet.swift OpenClip.xcodeproj
git commit -m "feat(ui): add CreateGroupSheet and EditGroupSheet for group management"
```

---

### Task 5: Preferences UI — Table Reordering, Multi-Selection & Uninstall Fix

**Files:**
- Modify: `Sources/OpenClip/UI/Preferences/ActionsTabView.swift`
- Test: `Tests/OpenClipTests/ActionGroupIntegrationTests.swift`

**Requirements:**
- Group rows open `EditGroupSheet` when the gear icon is tapped.
- Uninstall trash icon passes `action.id` (canonical ID) to `ExtensionManager.uninstallExtension`.
- Multi-selection validation: Only top-level standalone actions are candidate items. Native extension group sub-actions and existing custom group members cannot be multi-selected.
- Context menu: "Ungroup" on group parent; "Remove from Group" on group sub-action.

- [ ] **Step 1: Write integration tests for ActionsTabView interactions**

`Tests/OpenClipTests/ActionGroupIntegrationTests.swift`:
```swift
import XCTest
@testable import Core
@testable import OpenClip

@MainActor
final class ActionGroupIntegrationTests: XCTestCase {
    private var settingsStore: MemorySettingsStore!
    private var coordinator: ActionCoordinator!
    private var registry: ActionRegistry!

    override func setUp() {
        super.setUp()
        settingsStore = MemorySettingsStore()
        registry = ActionRegistry(settingsStore: settingsStore)
        coordinator = ActionCoordinator(registry: registry, settingsStore: settingsStore)
    }

    func testUninstallExtensionInsideGroupUsesCanonicalIDAndDisbandsGroup() async throws {
        let extAction1 = CustomAction(id: "com.custom.ext1", title: "Ext 1", iconName: "star", type: .textSnippet(template: "1"))
        let extAction2 = CustomAction(id: "com.custom.ext2", title: "Ext 2", iconName: "star", type: .textSnippet(template: "2"))
        coordinator.register(action: extAction1)
        coordinator.register(action: extAction2)

        coordinator.createGroup(title: "My Custom Exts", iconName: "folder", memberActionIDs: ["com.custom.ext1", "com.custom.ext2"])
        XCTAssertEqual(coordinator.actionGroupDefs.count, 1)

        // Simulating unregister of canonical ID
        coordinator.unregister(actionID: "com.custom.ext1")

        XCTAssertTrue(coordinator.actionGroupDefs.isEmpty, "Group must disband when member drops below 2")
        XCTAssertEqual(coordinator.actions.map(\.id), ["com.custom.ext2"])
    }
}
```

- [ ] **Step 2: Update `ActionsTabView.swift`**

Wire the following changes into `ActionsTabView`:

**Gear icon routing:** When the gear button is tapped on a `CustomGroupAction` row, present `EditGroupSheet(groupID: action.id)` instead of `EditActionSheet`. Use a single `action is CustomGroupAction` check in the gear button's action closure — this is the one permitted type check (it routes to a dedicated sheet, not scattered switch logic).

**List row nesting for custom groups:** `listRows` currently nests sub-actions via prefix matching (`action.id.hasPrefix(groupID + ".")`). Add a parallel lookup for custom group membership:
```swift
// Build canonical-ID → group-ID map from custom group defs
let customGroupMembership: [String: String] = {
    var map: [String: String] = [:]
    for def in coordinator.actionGroupDefs {
        for memberID in def.memberActionIDs {
            map[memberID] = def.id
        }
    }
    return map
}()

// In the iteration, after the existing prefix check:
if let nestedUnder = customGroupMembership[action.id] {
    rows.append(.action(action, nestedUnder: nestedUnder))
    continue
}
```

**Move/reorder expansion:** When moving a group row, expand the selection to include its custom group members. The existing prefix expansion handles extension groups; add a parallel expansion using `groupDefs.first(where:)?.memberActionIDs`.

**Uninstall:** Ensure the trash icon passes `action.id` (already canonical) to `ExtensionManager.uninstallExtension`, not a prefixed wrapper ID.

- [ ] **Step 3: Run full test suite to verify all tests pass**

Run: `./scripts/test.sh`
Expected: 0 failures, all green.

- [ ] **Step 4: Commit**

```bash
git add Sources/OpenClip/UI/Preferences/ActionsTabView.swift Tests/OpenClipTests/ActionGroupIntegrationTests.swift
git commit -m "feat(ui): connect EditGroupSheet, fix extension uninstallation in groups, and polish ActionsTab"
```

---

### Task 6: Documentation & Final Verification

**Files:**
- Modify: `docs/architecture/known-debt.md`
- Modify: `docs/architecture/action-coordinator.md`

- [ ] **Step 1: Update documentation**

Document the Custom Action Groups architecture, the removal of virtual ID prefixes, and the strict 2-member invariant in `docs/architecture/known-debt.md`. Update the `availableActions(for:)` code snippet in `docs/architecture/action-coordinator.md` to reflect the custom group member hiding logic alongside the existing prefix-based extension group hiding.

- [ ] **Step 2: Run full test suite**

Run: `./scripts/test.sh`
Expected: PASS (850+ tests, 0 failures).

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/known-debt.md
git commit -m "docs: document custom action groups architecture and invariants"
```
