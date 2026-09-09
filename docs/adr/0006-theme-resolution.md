# ADR-0006 — Resolve mode themes from a candidate list, not a hardcoded name

- **Status**: Accepted
- **Date**: 2026-09-09
- **Relates to**: FR-16, constraint C-2

## Context

This decision was forced by a test failure, not foreseen. The first implementation defaulted
Day mode to `Default Light Modern` and Night mode to `Default Dark Modern` — the names VS
Code used when the `^1.85.0` engine floor was set. Under VS Code 1.136 the integration
tests showed the theme never changing.

The cause, from the shipped `theme-defaults` manifest:

| `id`           | `label` in the manifest   |
| -------------- | ------------------------- |
| `Light 2026`   | `%light2026ThemeLabel%`   |
| `Dark 2026`    | `%dark2026ThemeLabel%`    |
| `Dark Modern`  | `%darkModernThemeLabel%`  |
| `Light Modern` | `%lightModernThemeLabel%` |

Three facts fall out:

1. **`workbench.colorTheme` takes the contributed `id`** when a theme declares one. The old
   ids (`Default Dark Modern`) were renamed to `Dark Modern`, and 1.136 ships `Dark 2026`
   as the out-of-the-box default. No single name is valid across the supported range.
2. **Built-in labels are NLS placeholders** in the manifest an extension can read, so a
   lookup that matches only on `label` cannot find any built-in theme.
3. **Failing silently is the worst outcome.** VSDay wrote a nonexistent theme name, VS Code
   ignored it, and nothing appeared to happen.

## Decision

- A mode's theme setting may be left **empty**, meaning "choose for me". VSDay then walks a
  per-mode candidate list, newest name first, and keeps the first theme actually installed:

  ```
  day:          Light 2026 → Light Modern → Default Light Modern → Light+ → Visual Studio Light
  night:        Dark 2026  → Dark Modern  → Default Dark Modern  → Dark+  → Visual Studio Dark
  eyeSaving:    VSDay Sepia (Warm Light) → VSDay Warm Dark
  highContrast: VSDay Sepia High Contrast → Default High Contrast Light → Default High Contrast
  ```

- Day and Night therefore default to empty (portable across versions). Eye-Saving and High
  Contrast default to VSDay's own bundled themes, which are always present.
- Theme lookup matches **`id` or `label`**, so both built-ins and third-party themes
  (which often declare only a label — as VSDay's own do) are found.
- A configured theme that is not installed is **not written**: VSDay logs a warning and
  offers the theme picker. Writing it would leave the user pointing at a broken theme.
- Integration tests assert on a theme's **`uiTheme` class** (`vs`, `vs-dark`, `hc-light`)
  rather than its name, plus one test that every mode resolves to something installed.
  Asserting names would have re-introduced the same fragility in the test suite.

## Consequences

**Good.** Modes work on VS Code 1.85 through 1.136+ without a manifest change. Users on
newer builds get the theme VS Code itself ships as default. Missing themes fail loudly.

**Cost.** The Day/Night theme settings are empty by default, so the Settings UI does not
show which theme they will use — the description explains the fallback, and the quick pick
displays the resolved theme name. The candidate lists need a new entry whenever VS Code
renames its defaults again; the unit test documenting the known names makes that visible.
