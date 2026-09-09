# VSDay — Test Strategy

## 1. Approach

Two layers, split on one line: **does this need a real VS Code?**

| Layer           | Runner                                       | Scope                                                                          | Cost   |
| --------------- | -------------------------------------------- | ------------------------------------------------------------------------------ | ------ |
| **Unit**        | mocha over `out/test/unit`                   | The pure modules plus `FontScaleController` through the `SettingsService` seam | ~20 ms |
| **Integration** | `@vscode/test-cli` + `@vscode/test-electron` | Real configuration writes, real theme contributions, real command registration | ~50 s  |

The seam described in [ADR-0005](adr/0005-settings-service-seam.md) is what makes the split
possible: the arithmetic and bookkeeping — where the bugs live — are unit-testable, so the
host suite only has to prove that the wiring and the VS Code assumptions hold.

Both layers deliberately cover the same requirements from different sides. Unit tests can
stage situations a host cannot easily reach (a VS Code build missing a setting, a user who
already had `window.zoomLevel: 1`); integration tests catch anything where the fake and the
real API disagree.

## 2. Running the tests

```bash
npm run test:unit          # fast; run this constantly
npm run test:integration   # compiles, bundles, downloads VS Code on first run
npm test                   # both
npm run test:coverage      # unit tests with the c8 gate
npm run verify             # lint + typecheck + both suites
```

> **Safety requirement.** The integration tests write **User (Global)** settings — that is
> the behaviour under test (FR-4). They must never run against a real profile.
> `.vscode-test.mjs` pins `--user-data-dir` and `--extensions-dir` to
> `.vscode-test-profile/`, and both paths are **absolute**: the test host resolves relative
> paths against its own working directory, which on Windows is `C:\Windows\system32` —
> where it fails with permission errors. Do not change these to relative paths.

## 3. What is covered

### 3.1 Unit — invariants worth naming

| Invariant                                               | Why it matters                                          |
| ------------------------------------------------------- | ------------------------------------------------------- |
| Reset is bit-exact                                      | Users must get their own sizes back, not approximations |
| N increases then N decreases returns to the baseline    | The core promise of a +/- pair                          |
| Each step moves at least 1px, until a bound             | Otherwise a keypress reads as broken                    |
| Repeated identical calls never drift                    | Proves the recompute-from-baseline design (ADR-0001)    |
| A captured baseline is never re-captured                | Prevents a scaled size becoming the new 100%            |
| `inheritsWhenZero` targets stay unset                   | Prevents freezing a size the user never chose           |
| Unregistered settings are skipped                       | Writing one throws                                      |
| Zoom offsets from the user's own level and clamps       | A reset must restore _their_ zoom                       |
| Mode overrides restore the user's prior value, or unset | Modes must not silt up `settings.json`                  |
| A tracked key is never re-read                          | Prevents our override becoming the "original"           |
| Mode glyphs are real codicons                           | An unknown `$(name)` renders as literal text            |
| Theme candidate lists cover the renamed built-ins       | See ADR-0006                                            |

### 3.2 Integration — what needs a real host

- Activation, API export, and every contributed command being registered.
- Every font target being a **real** setting in the running VS Code build — this is the
  test that turns a future VS Code rename into a visible failure rather than a feature
  that quietly stops working.
- Sizes actually landing at User scope (`inspect().globalValue`), which is the mechanism
  behind "all windows".
- `window.zoomLevel` nudged and given back.
- Inheriting surfaces left both unchanged _and_ unpinned.
- A size typed into `settings.json` mid-session not corrupting the next keypress.
- The status bar's text and the reset dot's `auto`/`always`/`never` visibility.
- Each mode resolving to an installed theme, and applying the expected **theme class**
  (`vs`, `vs-dark`, `hc-light`) rather than a specific name.
- Eye-Saving ↔ High Contrast swaps leaving no settings behind.
- Reserved settings being refused to modes.
- `vsday.resetAll` clearing both dimensions.

### 3.3 Coverage

`npm run test:coverage` runs `c8` with a **90%** gate on lines, statements, functions and
branches (`.c8rc.json`). Current state: 100% of lines, statements and functions, 97% of
branches.

The gate is scoped to the logic layer — `fontScale.ts`, `fontTargets.ts`,
`appearanceModes.ts` and `fontScaleController.ts`. Everything else is excluded for one of
two reasons: it needs a real extension host (`settingsService.ts`,
`appearanceController.ts`, `statusBar.ts`, `commands.ts`, `extension.ts`, `logger.ts`) or
it is declarative plumbing with no behaviour to get wrong (`config.ts`, `logging.ts`).
Those are covered by the integration suite instead. Scoping the gate this way keeps it
meaningful: a number diluted by wiring files can be met while the arithmetic goes untested.

## 4. Manual test checklist

Automation cannot see pixels or press physical keys. Run this before a release.

### 4.1 Multi-window propagation (FR-4)

1. Open two VS Code windows on different folders.
2. In window A, press `Ctrl+Alt+=` three times.
3. **Window B's editor, terminal and side bar must grow too**, with no reload.
4. Press `Ctrl+Alt+0` in window B; both windows return to normal.

### 4.2 Reset dot (FR-13)

1. At 100%, confirm **no dot** is shown next to the VSDay status bar item.
2. Press `Ctrl+Alt+=` once — the dot appears.
3. Click the dot — sizes return to normal and the dot disappears.
4. Set `vsday.statusBar.showResetDot` to `always`, then `never`, and confirm both.

### 4.3 Keyboard layout (known issue)

On AZERTY and QWERTZ layouts `Ctrl+Alt` is `AltGr`, so `Ctrl+Alt+=`, `Ctrl+Alt+-` and
`Ctrl+Alt+0` may not fire.

1. Confirm the numpad alternates work: `Ctrl+Alt+NumPad +` / `NumPad -`.
2. Confirm every action is reachable from the status bar menu and the Command Palette.
3. Confirm rebinding through **Preferences: Open Keyboard Shortcuts** works.

### 4.4 OS colour scheme conflict (constraint C-3)

1. Set `window.autoDetectColorScheme: true`.
2. Run **VSDay: Switch to Night Mode**.
3. A modal must explain the conflict and offer _Disable and continue_ / _Apply anyway_.
4. Choose _Disable and continue_: the setting is turned off and the theme applies.

### 4.5 Themes by eye

1. Apply each mode and check the three bundled themes render sensibly: editor, terminal,
   side bar, tabs, status bar, quick pick, notifications, a diff, and a Markdown preview.
2. In **High Contrast**, confirm widgets have visible outlines (this is what declaring
   `hc-light` buys) and text is noticeably heavier.

### 4.6 Hand-edited settings

1. Scale up, then type a different `editor.fontSize` into `settings.json`.
2. Press increase: the size must jump to the correct _baseline-relative_ value, not
   compound off the typed number.
3. Reset: the original pre-VSDay size must come back.

### 4.7 Packaged extension

1. `npm run package`, then install the `.vsix` into a clean profile:
   `code --profile vsday-test --install-extension dist/vsday-<version>.vsix`
2. Repeat §4.1 and §4.2 against the packaged build — this catches anything that only works
   from source, such as a file excluded by `.vscodeignore`.

## 5. Continuous integration

`.github/workflows/ci.yml` runs on Windows and Linux for every push and pull request:
lint → typecheck → unit → integration (under `xvfb-run` on Linux) → `vsce package`, with
the `.vsix` kept as a build artifact.

## 6. Known gaps

| Gap                                           | Mitigation                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rendered appearance is not asserted           | Manual checklist §4.5                                                                                                                                                   |
| Physical keybindings are not exercised        | Manual checklist §4.3                                                                                                                                                   |
| Only one VS Code version is tested per CI run | Theme resolution (ADR-0006) and the target-registration test are designed to fail loudly on drift; `version` in `.vscode-test.mjs` can be pinned to test an older build |
| macOS is not in CI                            | Same code paths as Linux; no platform-specific logic beyond keybinding declarations                                                                                     |
