# VSDay — Requirements Specification

|                  |                                           |
| ---------------- | ----------------------------------------- |
| **Document**     | Software Requirements Specification (SRS) |
| **Product**      | VSDay — VS Code extension                 |
| **Version**      | 0.1.0                                     |
| **Status**       | Baselined                                 |
| **Last updated** | 2026-09-09                                |

## 1. Purpose and scope

### 1.1 Problem

On a large, high-resolution monitor VS Code's default text is too small to read
comfortably for long stretches. Two things make this hard to fix by hand:

1. **There is no single font-size setting.** Every surface owns its own
   (`editor.fontSize`, `terminal.integrated.fontSize`, `debug.console.fontSize`,
   `markdown.preview.fontSize`, `scm.inputFontSize`, `chat.editor.fontSize`,
   `notebook.output.fontSize`, and several widget sizes). Enlarging "the text" means
   editing seven or more settings consistently, and doing it again to undo.
   Workbench chrome — tabs, side bar, status bar — has **no** font-size setting at all;
   `window.zoomLevel` is the only lever that reaches it.
2. **Switching visual comfort modes is manual.** Moving between a light theme, a dark
   theme and a warm low-blue-light theme means editing `workbench.colorTheme` plus
   whatever comfort settings go with it, and remembering to put them back.

The built-in commands do not close the gap: `editor.action.fontZoomIn` affects only text
editors, and `workbench.action.zoomIn` scales the entire UI including icons and padding,
which is a blunter instrument than a reader usually wants.

### 1.2 Scope

VSDay provides two capabilities:

- **Coordinated font scaling** across every VS Code surface, from one keystroke, one
  status-bar click, or one command, with an exact way back.
- **Appearance modes** — Day, Night, Eye-Saving and High Contrast — each a colour theme
  plus a set of comfort settings that are reverted when the mode is left.

Out of scope for 0.1.0: per-workspace sizing, syncing across machines beyond VS Code's own
Settings Sync, scheduled/automatic mode switching by time of day, and localisation.

### 1.3 Stakeholders

| Stakeholder                              | Interest                                                   |
| ---------------------------------------- | ---------------------------------------------------------- |
| Reader on a large display                | Text large enough to read without editing JSON             |
| Reader with visual fatigue or low vision | Warm, low-blue-light and high-contrast presentation        |
| Presenter / pair-programmer              | One keystroke to enlarge everything, one to restore        |
| Maintainer                               | Behaviour pinned by tests; safe to change VS Code versions |

## 2. Definitions

| Term          | Meaning                                                                |
| ------------- | ---------------------------------------------------------------------- |
| **Surface**   | A part of VS Code with its own font-size setting (editor, terminal, …) |
| **Target**    | A setting VSDay scales. See `src/fontTargets.ts`                       |
| **Baseline**  | The user's own size for a target, recorded as its 100%                 |
| **Step**      | Integer scale position. `0` = baseline; each step is `ratio`× larger   |
| **Mode**      | An appearance profile: a colour theme plus revertible comfort settings |
| **Override**  | A setting a mode writes and later restores                             |
| **Reset dot** | The one-click status-bar control that returns the scale to 100%        |

## 3. Functional requirements

Each requirement names the tests that hold it. `U` = unit
(`src/test/unit`), `I` = integration (`src/test/integration`).

### 3.1 Font scaling

| ID        | Requirement                                                                                                                                                                                                                                                                                                                                                                                                          | Verified by                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| **FR-1**  | A single action SHALL increase the font size of every registered target surface in one step.                                                                                                                                                                                                                                                                                                                         | U `fontScale`, `fontTargets`, `fontScaleController`; I `fontScale`              |
| **FR-2**  | A single action SHALL decrease the font size of every registered target surface in one step.                                                                                                                                                                                                                                                                                                                         | U `fontScale`; I `fontScale`                                                    |
| **FR-3**  | Reset SHALL restore every target to exactly the value it had before VSDay first scaled it, regardless of the sequence of increases and decreases taken, and regardless of `settings.json` being edited by hand in between.                                                                                                                                                                                           | U `fontScale`, `fontScaleController`; I `fontScale`, `extension`                |
| **FR-4**  | All size changes SHALL be written at User (Global) scope, so that a change made in one window takes effect in every open window.                                                                                                                                                                                                                                                                                     | I `fontScale`                                                                   |
| **FR-5**  | Scaling SHALL also adjust `window.zoomLevel`, so workbench chrome keeps up with the text. The adjustment SHALL be configurable (`vsday.uiZoom.perStep`) and switchable off (`vsday.uiZoom.enabled`), SHALL be measured from the user's own pre-existing zoom level, and SHALL be clamped to a recoverable range.                                                                                                     | U `fontScale`, `fontScaleController`; I `fontScale`                             |
| **FR-6**  | The user SHALL be able to adopt the current sizes as the new 100% baseline.                                                                                                                                                                                                                                                                                                                                          | U `fontScaleController`; I `fontScale`                                          |
| **FR-7**  | VSDay SHALL skip any target setting not registered in the running VS Code version, and record it in its log, rather than failing.                                                                                                                                                                                                                                                                                    | U `fontScaleController`; I `extension`                                          |
| **FR-8**  | For targets where `0` or unset means "inherit from `editor.fontSize`", VSDay SHALL leave them inheriting rather than pinning a concrete size.                                                                                                                                                                                                                                                                        | U `fontScale`, `fontScaleController`; I `fontScale`                             |
| **FR-9**  | The user SHALL be able to add further font-size settings to scale (`vsday.fontScale.extraTargets`).                                                                                                                                                                                                                                                                                                                  | U `fontTargets`                                                                 |
| **FR-18** | VSDay SHALL scale chat surfaces in full: the chat body text (`chat.fontSize`) as well as code blocks within chat (`chat.editor.fontSize`). Where a target is unset by default and its consumers substitute a hardcoded size instead of deriving one from `editor.fontSize`, VSDay SHALL scale from a declared fallback baseline rather than leaving it unset.                                                        | U `fontScale`, `fontTargets`, `fontScaleController`; I `fontScale`, `extension` |
| **FR-19** | A size write whose value equals what the surface would use with nothing set — the registered default, or the declared fallback where there is no default — SHALL remove the user-level value instead of writing it. A reset therefore returns every surface, extension-provided ones included, to its own default and leaves no residue in `settings.json`; a size the user had explicitly chosen is still restored. | U `fontScaleController`; I `fontScale`                                          |

### 3.2 Appearance modes

| ID        | Requirement                                                                                                                                                                                                                                                                     | Verified by                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **FR-10** | VSDay SHALL provide Day, Night, Eye-Saving and High Contrast modes, each settable directly and reachable by cycling in a configurable order.                                                                                                                                    | U `appearanceModes`; I `appearance` |
| **FR-11** | A mode's comfort settings SHALL be reverted when the mode is left — to the user's own prior value, or to unset if they had none — and a mode SHALL never adopt VSDay's own override as if it were the user's preference.                                                        | U `appearanceModes`; I `appearance` |
| **FR-12** | A mode SHALL NOT be able to override the settings VSDay manages itself (font targets, `window.zoomLevel`, `workbench.colorTheme`, `vsday.*`); such entries SHALL be ignored and logged. Clearing the active mode SHALL revert its overrides without changing the current theme. | U `appearanceModes`; I `appearance` |
| **FR-16** | VSDay SHALL resolve each mode's theme to one actually installed in the running VS Code version, trying a list of candidates when the mode's theme setting is empty, and SHALL leave the current theme untouched (with a warning) when a configured theme is missing.            | I `appearance`                      |
| **FR-17** | High Contrast mode SHALL apply a high-contrast theme (`hc-light`/`hc-black` class) together with legibility settings, and SHALL swap cleanly with Eye-Saving mode leaving no settings behind.                                                                                   | I `appearance`                      |

### 3.3 Bundled themes

| ID        | Requirement                                                                                                                                                                | Verified by                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **FR-9b** | VSDay SHALL bundle its own warm themes so the reading modes work with no other extension installed: a warm light theme, a warm dark theme, and a warm high-contrast theme. | I `extension`, `appearance` |

### 3.4 Surface and control

| ID        | Requirement                                                                                                                                                                                                                                                                                  | Verified by                 |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **FR-13** | A status bar item SHALL show the current scale percentage and open a menu of every VSDay action. A one-click **reset dot** SHALL reset the scale to 100%; by default it SHALL be visible only while the scale is off baseline, with `always`/`never` overrides.                              | I `fontScale`               |
| **FR-20** | The status bar SHALL offer **`−` and `+` buttons** either side of the percentage, each performing one scale step, and hideable with `vsday.statusBar.showStepButtons`.                                                                                                                       | I `fontScale`               |
| **FR-21** | The status bar SHALL offer a **mode button** naming the active mode, which on click switches to the **next** mode in the configured cycle (rather than opening a picker), with its tooltip naming the mode the click will apply. It SHALL be hideable with `vsday.statusBar.showModeButton`. | I `appearance`              |
| **FR-14** | Every action SHALL be available as a Command Palette command; the frequent ones SHALL have default keybindings; the extension SHALL expose an API object for testing.                                                                                                                        | I `extension`, `appearance` |
| **FR-15** | A single action SHALL reset both the font scale and the appearance mode.                                                                                                                                                                                                                     | I `appearance`              |

## 4. Non-functional requirements

| ID        | Requirement                                                                                                                                                                                                       | How it is met / verified                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **NFR-1** | No window reload SHALL be required for any change to take effect.                                                                                                                                                 | Only configuration writes are used; VS Code applies these live. Manual checklist in `testing.md`  |
| **NFR-2** | VSDay SHALL collect no telemetry and make no network requests.                                                                                                                                                    | No telemetry API, no HTTP client; the only I/O is the configuration API and an output channel     |
| **NFR-3** | VSDay SHALL support VS Code `^1.85.0` on Windows, macOS and Linux.                                                                                                                                                | Only long-standing APIs used; theme names resolved dynamically (FR-16); CI runs Windows and Linux |
| **NFR-4** | A scale action SHALL complete without perceptible delay (target < 500 ms) on a stock configuration.                                                                                                               | ~11 sequential configuration writes; integration test durations tracked in CI                     |
| **NFR-5** | Every function SHALL be reachable by keyboard alone, and status bar items SHALL carry screen-reader labels. Meaning SHALL never be conveyed by colour alone (the reset dot is backed by a tooltip and a command). | `statusBar.ts` sets `accessibilityInformation`; commands are palette-addressable                  |
| **NFR-6** | Logic modules SHALL be unit-testable without an extension host, with ≥80% line coverage.                                                                                                                          | `SettingsService` seam (ADR-0005); `c8` gate in `.c8rc.json`                                      |
| **NFR-7** | The packaged extension SHALL have no runtime dependencies and ship as a single bundled file.                                                                                                                      | esbuild bundle; `dependencies` is empty                                                           |
| **NFR-8** | VSDay SHALL never leave settings in an unrecoverable state: a failed write SHALL be logged and reported, not swallowed, and reset SHALL always be reachable.                                                      | `commands.ts` error boundary; `appearanceController.write` catch; `vsday.resetAll`                |
| **NFR-9** | User-visible strings SHALL be centralised (manifest + a small number of source strings) to keep future localisation cheap.                                                                                        | Titles and descriptions live in `package.json`                                                    |

## 5. Constraints and assumptions

- **C-1** VS Code exposes no API to set "the UI font size"; workbench chrome can only be
  scaled through `window.zoomLevel`. FR-5 is a consequence of this constraint, not a
  preference.
- **C-2** `workbench.colorTheme` accepts a theme's contributed `id` (or its `label` when it
  declares no id). Built-in theme manifests expose unresolved NLS placeholders as labels,
  so lookups must match on `id`. VS Code has also renamed its default themes across
  releases (`Default Dark Modern` → `Dark Modern`, and 1.136 ships `Dark 2026`), which is
  why FR-16 requires resolution rather than a hardcoded name.
- **C-3** `window.autoDetectColorScheme`, when enabled, overrides `workbench.colorTheme`
  from the OS; a mode switch would silently do nothing. VSDay detects this and offers to
  disable it.
- **C-4** Writing an unregistered setting throws (`… is not a registered configuration`),
  hence FR-7.
- **A-1** The user's font sizes at the moment of first use represent their intended 100%.
  FR-6 exists for when that assumption is wrong.

## 6. Traceability summary

| Requirement         | Implementation                                                             |
| ------------------- | -------------------------------------------------------------------------- |
| FR-1, FR-2, FR-3    | `src/fontScale.ts`, `src/fontScaleController.ts`                           |
| FR-4                | `src/settingsService.ts` (`ConfigurationTarget.Global`)                    |
| FR-5                | `zoomLevelForStep` in `src/fontScale.ts`; `applyZoom` in the controller    |
| FR-6                | `FontScaleController.captureBaseline`                                      |
| FR-7                | `FontScaleController.targets`, `SettingsService.isRegistered`              |
| FR-8                | `inheritsWhenZero` in `src/fontTargets.ts`; `computeFontWrites`            |
| FR-9, FR-9b         | `resolveFontTargets`; `themes/*.json` + manifest `contributes.themes`      |
| FR-10, FR-16, FR-17 | `src/appearanceModes.ts`, `src/appearanceController.ts`                    |
| FR-11, FR-12        | `computeOverrideTransition`, `partitionOverrides`, `isReservedOverrideKey` |
| FR-13, FR-20, FR-21 | `src/statusBar.ts`                                                         |
| FR-18               | `baselineFallback` in `src/fontTargets.ts`; `resolveBaseline`              |
| FR-19               | `FontScaleController.writeSetting`; `SettingsService.getDefaultValue`      |
| FR-14, FR-15        | `src/commands.ts`, `package.json` `contributes`                            |
