# Changelog

All notable changes to VSDay are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] — 2026-09-09

### Changed

- **Scaling now reaches all of VS Code, and does so by default.** New setting
  `vsday.scaleStrategy`, defaulting to `uniform`: the scale is delivered through
  `window.zoomLevel` (at a per-step amount derived from `vsday.fontScale.ratio`, so a step
  means the same as before) and font sizes stay at their baseline.

  Why: VS Code gives a font-size setting to only a handful of surfaces. The Explorer,
  Extensions view, Settings UI, tab labels, menus and most extension panels have **none**,
  so font-based scaling left them at ~2% per step while the editor grew 10% — and a
  font-scaled webview could outgrow a layout built for 13px text, clipping its labels.
  Window zoom scales the whole interface, containers included.

  The previous behaviour is available as `vsday.scaleStrategy: "textFirst"` — sharper text
  and per-surface control, with the Explorer and extension views lagging behind. Switch
  either way with **VSDay: Switch Scaling Strategy**, or from the status bar menu; the
  current scale carries across.

### Added

- **VSDay: Switch Scaling Strategy** command, plus an entry in the status bar menu showing
  which strategy is in force. The status bar tooltip names it too.
- Settings are **reconciled on activation**: if the recorded step and the actual settings
  disagree — after this upgrade, after a hand edit, or after a strategy changed directly in
  `settings.json` — VSDay brings them into line, writing only where they differ. Upgrading
  from 0.2.x therefore clears the font sizes the old behaviour had written and moves the
  scale to zoom, with no action needed.

## [0.2.0] — 2026-09-09

### Fixed

- **Chat panels now scale in full.** Extension chat views — the Claude Code panel among
  them — take their body text size from `chat.fontSize` and their code blocks from
  `chat.editor.fontSize`. 0.1.0 scaled only the latter, so code blocks grew while the
  conversation stayed put. Both are now targets.
- Settings that are unset by default and whose consumers substitute a hardcoded size of
  their own (rather than deriving one from `editor.fontSize`) now scale from a declared
  fallback baseline instead of being left alone. Previously they never changed at all.

### Added

- **`−` and `+` buttons in the status bar**, either side of the scale percentage — reliable
  on keyboard layouts where `Ctrl+Alt` acts as `AltGr`. Hide with
  `vsday.statusBar.showStepButtons`.
- **A mode button in the status bar** that names the active mode and switches to the **next**
  mode in the cycle when clicked, with its tooltip naming where the click will take you.
  Hide with `vsday.statusBar.showModeButton`.
- `notebook.markup.fontSize` (notebook Markdown cells) as a scaled surface.

### Changed

- **Reset now returns every surface to its own default.** A size write whose value equals
  what the surface would use with nothing set removes the user-level value instead of
  writing it, so a reset leaves no VSDay values pinned in `settings.json` — extension
  panels included. A size the user had chosen themselves is still restored exactly.
  This generalises the `window.zoomLevel` handling from 0.1.0.
- `@types/vscode` is pinned to the declared engine floor (1.85), so using a newer API than
  the manifest claims to support is now a compile error.

## [0.1.0] — 2026-09-09

First release.

### Added

- **Coordinated font scaling** across every VS Code surface with a font-size setting:
  editor, terminal, debug console, Markdown preview, source-control input, chat and
  notebook output, plus the suggestion, CodeLens and inlay-hint widgets.
  - `Ctrl+Alt+=` / `Ctrl+Alt+-` / `Ctrl+Alt+0` (with `NumPad` alternates), the Command
    Palette, and a status bar menu.
  - Sizes are recomputed from a captured **baseline**, so reset is exact and repeated
    increase/decrease never drifts.
  - Settings are written at User scope, so a change applies to **every open window** with
    no reload.
  - `window.zoomLevel` receives a small, configurable nudge so workbench chrome — which has
    no font-size setting in VS Code — keeps up.
  - Settings that mean "inherit from `editor.fontSize`" are left inheriting rather than
    pinned; settings absent from the running VS Code version are skipped and logged.
  - `vsday.fontScale.extraTargets` scales additional font-size settings from other
    extensions.
- **Four appearance modes** — Day, Night, Eye-Saving, High Contrast — each a colour theme
  plus optional comfort settings that are reverted when the mode is left, back to the
  user's own prior value or to unset.
  - `Ctrl+Alt+M` cycles in a configurable order; each mode also has its own command.
  - Mode themes resolve to a theme actually installed in the running VS Code version, which
    keeps them working across VS Code's renaming of its default themes.
  - A mode cannot override the settings VSDay manages itself.
  - Conflicts with `window.autoDetectColorScheme` are detected and explained rather than
    failing silently.
- **One-click reset dot** in the status bar, shown by default only while the scale is away
  from 100%, so it also serves as the "you are zoomed" indicator
  (`vsday.statusBar.showResetDot`: `auto` / `always` / `never`).
- **Three bundled themes**: VSDay Sepia (Warm Light), VSDay Warm Dark, and VSDay Sepia
  High Contrast (a true `hc-light` theme, so VS Code draws real widget outlines).
- **Reset Everything** command, clearing both the font scale and the active mode.
- **Output channel** (`VSDay`) recording every write, skip and warning. No telemetry.
- Documentation: requirements with test traceability, design, six ADRs, test strategy with
  a manual checklist, and a user guide.

[Unreleased]: https://github.com/agilebotanist/vsday/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/agilebotanist/vsday/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/agilebotanist/vsday/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/agilebotanist/vsday/releases/tag/v0.1.0
