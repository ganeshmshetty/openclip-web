# Canvas Script File Validation

Date: 2026-08-09 · Status: Approved for implementation

## Problem

`ManifestValidator` rejects any `type: "canvas"` action whose inline `scriptCode`
is blank (`ManifestValidation.swift`, `.canvas` case), yet `DefaultActionFactory`
already builds a `JavaScriptCanvasAction` from either an inline `scriptCode`
(`DefaultActionFactory.swift:242`) or a separate `.js` script file
(`DefaultActionFactory.swift:309`).

The inconsistency silent-drops canvas packages that use the file form
(`"script": "main.js"`): the whole package is rejected during the validation pass
in `ExtensionManager.loadManifestExtension` (`ExtensionManager.swift:246-252`)
before the factory ever runs.

## Goal

Canvas actions must accept their JS payload in either form — inline `scriptCode`
**or** a `.js` script file — matching what the factory already materializes.

## Design

### 1. Validator change — `Sources/Core/Extensions/Manifest/ManifestValidation.swift`

Pure Core (Foundation + CryptoKit only, no AppKit/SwiftUI). No factory changes.

- Add one private helper that answers "does the action carry at least one of the
  given payload fields?", wrapping the existing `allSatisfy(isBlank)` pattern.
- Refactor the `default` branch to use the shared helper, keeping its field set
  `[url, script, scriptCode]` and message `"url/script/scriptCode"` unchanged.
- Change the `.canvas` case to use the shared helper with field set
  `[script, scriptCode]` instead of the single `isBlank(action.scriptCode)` check.
  The all-blank message for canvas becomes `"script/scriptCode"`.
- `url` is deliberately excluded for canvas: the factory never reads `url` for a
  canvas action, so treating it as a payload would re-admit the silent-drop bug.

Concrete shape of the change (exact helper signature is implementer's choice):

```swift
case .canvas:
    if !hasExecutablePayload([action.script, action.scriptCode]) {
        issues.append(ManifestValidationIssue(kind: .missingRequiredField("script/scriptCode"), path: path))
    }
default:
    if !hasExecutablePayload([action.url, action.script, action.scriptCode]) {
        issues.append(ManifestValidationIssue(kind: .missingRequiredField("url/script/scriptCode"), path: path))
    }
```

### 2. Tests

Both additions land in the two test classes that form the accept/verify surface.

`Tests/OpenClipTests/ManifestValidationTests.swift`:
- Update `testCanvasRequiresScriptCode`: a `{ "title": "Canvas", "type": "canvas" }`
  action still rejects, but with expected field `"script/scriptCode"` (was
  `"scriptCode"`).
- Add `testCanvasAcceptsScriptFile`: a
  `{ "title": "Canvas", "type": "canvas", "script": "main.js" }` action validates
  clean (`validate()` returns `[]`).

`Tests/OpenClipTests/NewExtensionKindTests.swift`:
- Add `testFactoryRoutesCanvasScriptFileToJavaScriptCanvasAction` (@MainActor):
  temp directory containing a real `main.js`, metadata `type: "canvas"`,
  `script: "main.js"` → `DefaultActionFactory().createAction` returns a
  `JavaScriptCanvasAction` whose `scriptCode` equals the file contents. Mirrors
  the existing `testFactoryRoutesCanvasToJavaScriptCanvasAction`.

## Out of scope

- **JS files imported by `main.js`.** The canvas runtime evaluates the script as
  one self-contained string (`jsContext.evaluateScript(scriptCode)` in
  `JavaScriptCanvasEngine.swift`); there is no `require`/`import` resolution, so
  validating referenced modules is not applicable.
- **File existence checks in the validator.** `ManifestValidator` is explicitly
  pure, side-effect-free metadata validation (`ManifestValidation.swift` file
  doc comment) with no directory access. Missing/unreadable script files are the
  factory's responsibility and already logged + dropped there.
- **Factory changes.** Explicitly prohibited by the task definition.

## Verification

1. Build gate:
   `timeout -k 5 60 xcodebuild -project OpenClip.xcodeproj -scheme OpenClip -destination 'platform=macOS' build`
2. Target test classes:
   `timeout -k 10 60 ./scripts/test.sh ManifestValidationTests`
   `timeout -k 10 60 ./scripts/test.sh NewExtensionKindTests`