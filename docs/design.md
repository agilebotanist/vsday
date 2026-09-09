# VSDay — Design

Companion to [requirements.md](requirements.md). Decisions with alternatives considered are
recorded separately as [ADRs](adr/).

## 1. Overview

VSDay is a settings orchestrator. It owns no UI beyond a small status bar toolbar and a
quick pick, and it holds no runtime state that matters: everything it does is expressed as
writes to VS Code's User (Global) configuration. That is a deliberate architecture
choice — it makes the extension's whole effect inspectable in `settings.json`, gives
multi-window propagation for free, and means "uninstall and forget" is a matter of
resetting a handful of keys.

```
                          ┌────────────────────────────────┐
  keybinding / palette ──►│           commands.ts          │
  status bar click     ──►│  error boundary + quick picks   │
                          └───────┬────────────────┬───────┘
                                  │                │
                    ┌─────────────▼──────┐  ┌──────▼───────────────┐
                    │ fontScaleController│  │ appearanceController │
                    │  baselines, steps  │  │ themes, overrides    │
                    └──────┬──────┬──────┘  └──────┬────────┬──────┘
                           │      │                │        │
              ┌────────────▼──┐ ┌─▼────────────────▼──┐ ┌───▼──────────┐
              │  fontScale.ts │ │   settingsService   │ │appearanceModes│
              │  fontTargets  │ │ (the only vscode    │ │  (pure)       │
              │    (pure)     │ │  configuration seam)│ └───────────────┘
              └───────────────┘ └──────────┬──────────┘
                                           │
                                  VS Code User settings
                                  (propagates to all windows)
```

`statusBar.ts` reads the two controllers' state and renders it; `extension.ts` wires
everything and refreshes the status bar after commands and on configuration changes.

## 2. Modules

| File                      | Role                                                            | Depends on `vscode`?           |
| ------------------------- | --------------------------------------------------------------- | ------------------------------ |
| `fontTargets.ts`          | Registry of scalable settings, bounds, inheritance rules        | No                             |
| `fontScale.ts`            | Scale arithmetic: step → size, zoom level, labels               | No                             |
| `appearanceModes.ts`      | Mode catalogue, cycle order, theme candidates, override diffing | No                             |
| `logging.ts`              | `Logger` contract, null and in-memory implementations           | No                             |
| `config.ts`               | Every setting key and state key in one place                    | No                             |
| `settingsService.ts`      | The configuration seam: read, inspect, write Global             | Yes                            |
| `logger.ts`               | Output-channel logger                                           | Yes                            |
| `fontScaleController.ts`  | Baseline capture and step application                           | No (via seam)                  |
| `appearanceController.ts` | Mode application, theme lookup, prompts                         | Yes (prompts, theme discovery) |
| `statusBar.ts`            | Status bar items and their visibility rules                     | Yes                            |
| `commands.ts`             | Command registration, quick picks, error boundary               | Yes                            |
| `extension.ts`            | Activation wiring                                               | Yes                            |

The four pure modules hold all of the logic that can be wrong in an interesting way, which
is why they carry the bulk of the unit tests.

## 3. Font scaling

### 3.1 The state

Three settings describe the whole scale:

| Setting                     | Meaning                                              |
| --------------------------- | ---------------------------------------------------- |
| `vsday.fontScale.baselines` | `{ "editor.fontSize": 14, … }` — the user's own 100% |
| `vsday.fontScale.step`      | Integer position, `0` = baseline                     |
| `vsday.fontScale.ratio`     | Growth per step, default `1.1`                       |

Every scaled value is **recomputed from the baseline**:

```
size(target) = clamp(walk(baseline, ratio, step), target.min, target.max)
```

Never `size += 1`. See [ADR-0001](adr/0001-baseline-relative-scaling.md) — the short
version is that incremental read-modify-write accumulates rounding error, is corrupted by
a hand edit to `settings.json`, and cannot reset exactly.

`walk` is the one wrinkle. Rounding `baseline * ratio ** step` can produce the same integer
for two adjacent steps (5px at ratio 1.05 rounds to 5 twice), which reads as a dead
keybinding. So the value is walked step by step from the baseline, forcing at least 1px of
movement per step until a bound is reached. It remains a pure function of
`(baseline, ratio, step, min, max)`, so there is still no state to drift.

### 3.2 Baseline capture

Baselines are captured lazily, on the first scaling action, from the currently effective
values. A target that already has a baseline is **never** re-read — by then its current
value is one _we_ wrote, and adopting it would ratchet the user's 100% upward on every
keypress. `vsday.captureBaseline` is the explicit way to re-baseline.

### 3.2b Surfaces that inherit nothing

Some font settings are unset by default and their consumers substitute a hardcoded size of
their own rather than deriving one from `editor.fontSize`. Chat webviews are the case that
matters in practice: the body text reads `chat.fontSize` and falls back to 13px, while code
blocks inside the chat read `chat.editor.fontSize` and fall back to 12px.

For those, "leave an unset setting alone so it keeps inheriting" is exactly wrong — nothing
inherits, so the surface never scales. A target may therefore declare a
`baselineFallback`, and baseline resolution is three cases in order (`resolveBaseline`):

| Current value | `inheritsWhenZero` | Baseline                                   |
| ------------- | ------------------ | ------------------------------------------ |
| a real size   | —                  | that size                                  |
| unset or `0`  | yes                | none — skip, keep inheriting               |
| unset or `0`  | no                 | the declared `baselineFallback`, else skip |

A target must not declare both rules; a unit test enforces that. See
[ADR-0007](adr/0007-chat-surfaces-and-clean-resets.md).

### 3.2c Writes that remove themselves

Every size write goes through one rule: if the value equals _what the surface would use
with nothing set_ — the registered default, or the declared `baselineFallback` for settings
VS Code registers without a default — the user-level value is **removed** instead of
written.

The effective size is identical either way, so this costs nothing and buys two things: a
reset hands every surface back to its own default rather than to a number VSDay pinned, and
a `settings.json` that VSDay found clean is left clean. A size the user chose themselves
differs from the natural value, so it is written back and preserved. The `window.zoomLevel`
rule from ADR-0002 is now just an instance of this.

### 3.3 The target registry

`fontTargets.ts` lists each setting with `min`, `max`, and an `inheritsWhenZero` flag.
Two behaviours come out of it:

- **Unregistered settings are skipped** (FR-7). Writing a setting no installed extension
  contributed throws, and the set of built-in font settings differs across the supported
  `^1.85.0` range.
- **Inheriting targets are left alone** (FR-8). `notebook.output.fontSize`,
  `editor.suggestFontSize`, `editor.codeLens.fontSize` and `editor.inlayHints.fontSize`
  follow `editor.fontSize` when they are `0` or unset. Pinning them would freeze a size
  the user never chose, and would also stop them tracking future scale changes.

### 3.3b Two ways to deliver a step

`vsday.scaleStrategy` decides what a step actually does. This is the most consequential
setting in the extension, and the default changed in 0.3.0 — see
[ADR-0008](adr/0008-uniform-zoom-by-default.md).

|                                                                  | `uniform` (default)                                          | `textFirst`               |
| ---------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------- |
| Carries the scale                                                | `window.zoomLevel`                                           | the font settings         |
| Font settings                                                    | left at baseline                                             | scaled by `ratio ** step` |
| Zoom per step                                                    | `log(ratio) / log(1.2)` — derived, so a step matches `ratio` | `uiZoom.perStep` (0.1)    |
| Editor, terminal, previews, chat                                 | ✅                                                           | ✅                        |
| Explorer, Extensions view, Settings UI, tabs, extension webviews | ✅                                                           | ~2% per step only         |
| Can overflow a webview layout                                    | no — containers scale too                                    | yes, above ~16px          |
| Icons and padding                                                | grow with the text                                           | unchanged                 |

The reason `uniform` exists is constraint C-1: most of VS Code has no font-size setting, so
no amount of font scaling reaches it. The reason it leaves fonts alone is compounding — zoom
already magnifies text, so scaling both would give ~1.2× _per step_ on the surfaces that do
have a setting.

Implementation is one line of branching in `applyStep`: `uniform` computes the font writes
at **step 0** — which is what returns them to baseline when switching strategies — and hands
the step to zoom instead.

### 3.3c Reconciliation on activation

A step means different things under the two strategies, so the recorded step and the actual
settings can fall out of line: an upgrade changes the default strategy or adds a target, or
someone edits `settings.json` between sessions. `reconcile()` computes the writes the
recorded step implies and applies them **only if something differs**; at step 0 with nothing
captured it returns immediately without writing.

It also runs when the strategy setting _changes_ — but only when the strategy has been set,
never when it has been cleared. A cleared value is what a bulk settings reset looks like
part-way through, and writing sizes back into the middle of one fights whoever is clearing.

### 3.4 Workbench chrome

Chrome has no font-size setting, so `window.zoomLevel` is the only lever (constraint C-1).
It is treated as a _secondary_ nudge — `baseline + step × perStep`, default `0.1` zoom
levels per step — because zoom magnifies text as well, and a full zoom level per step
would compound with the font increase. Offsetting from the user's own pre-existing zoom is
what lets a reset put them back on it. At a computed level of `0` the key is removed rather
than pinned, so an untouched `settings.json` stays untouched.
See [ADR-0002](adr/0002-ui-zoom-nudge.md).

## 4. Appearance modes

### 4.1 A mode is data

```
mode := { theme: string, settings: Record<string, unknown> }
```

read from `vsday.mode.<id>.theme` and `vsday.mode.<id>.settings`. Adding a fifth mode is a
manifest change plus one entry in `MODE_DESCRIPTORS` and `THEME_FALLBACKS`.

### 4.2 Theme resolution

An empty theme setting means "choose for me", and VSDay walks a candidate list per mode,
keeping the first theme actually installed. This is not a nicety: `workbench.colorTheme`
takes a theme's contributed **id**, and VS Code has renamed its own defaults more than once
(`Default Dark Modern` → `Dark Modern`, with `Dark 2026` shipping in 1.136). A hardcoded
name silently fails on part of the supported version range — the failure mode we actually
hit while building this. Lookups match on `id` first because built-in theme manifests
expose unresolved NLS placeholders (`%darkModernThemeLabel%`) as their label.

A configured theme that is not installed is **not** written: VSDay logs a warning, offers
the theme picker, and leaves the current theme alone. Writing it would leave the user on a
broken theme setting.

### 4.3 Override bookkeeping

The subtle part of a mode is leaving it. `computeOverrideTransition` produces:

- **restores** — keys the outgoing mode owned that the incoming one does not, set back to
  the tracked original (or removed, when the original was "unset").
- **applies** — the incoming mode's overrides.
- **nextOriginals** — what to remember, persisted in `globalState` under
  `vsday.modeOverrideOriginals`. `null` records "the user had no value here".

The rule that keeps this honest: a key already being tracked is **never** re-read from the
configuration. Its current value is ours, and re-reading would enshrine our override as the
user's preference — permanently, since it would then be what a revert restores.

`isReservedOverrideKey` refuses a mode's attempt to set font targets, `window.zoomLevel`,
`workbench.colorTheme` or `vsday.*`. Those either belong to the font scaler — a mode
setting `editor.fontSize` would fight it on every keypress — or to the mode machinery
itself.

### 4.4 Interaction pitfalls handled

| Pitfall                                                         | Handling                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `window.autoDetectColorScheme: true` overrides the theme we set | Detected on apply; modal offers "Disable and continue" / "Apply anyway" / cancel |
| Theme named but not installed                                   | Warning + theme picker; current theme untouched                                  |
| Mode declares a reserved setting                                | Ignored, listed in the log                                                       |
| Same mode applied twice                                         | Transition is idempotent; no churn                                               |

## 5. Status bar

A five-item toolbar, right-aligned. Priority orders the items, higher first, so the
priorities below read left to right.

```
  −   $(text-size) 110%   +   ●   $(eye) Eye-Saving
  ↑          ↑            ↑   ↑         ↑
smaller    menu        bigger reset  next mode
```

| Item             | Priority | Text                | Command                     | Visibility                           |
| ---------------- | -------- | ------------------- | --------------------------- | ------------------------------------ |
| `vsday.decrease` | 105      | `$(dash)`           | `vsday.decreaseFontSize`    | `showStepButtons`                    |
| `vsday.main`     | 104      | `$(text-size) 110%` | `vsday.showMenu`            | always                               |
| `vsday.increase` | 103      | `$(add)`            | `vsday.increaseFontSize`    | `showStepButtons`                    |
| `vsday.reset`    | 102      | `$(circle-filled)`  | `vsday.resetFontSize`       | `auto` (step ≠ 0), `always`, `never` |
| `vsday.mode`     | 101      | `$(eye) Eye-Saving` | `vsday.cycleAppearanceMode` | `showModeButton`                     |

Three choices are deliberate:

- **The reset dot's `auto` visibility does double duty.** It is the fast way back to 100%,
  and its presence is the signal that you are scaled at all. At 100% it disappears rather
  than sitting there inert.
- **The mode button cycles; it does not open a picker.** One click, next mode. A picker
  would add a decision every time to a control whose whole point is being quick, and the
  mode _menu_ is still one click away on the main item. The tooltip and the accessibility
  label both name the mode the click will apply, so the destination is discoverable without
  trial and error.
- **The `−`/`+` buttons duplicate the keybindings on purpose.** `Ctrl+Alt` is `AltGr` on
  AZERTY and QWERTZ layouts, so for a good share of users the keys are the _unreliable_
  path and the buttons are the primary one.

`vsday.statusBar.enabled` hides all five; the two visibility settings hide the pairs
individually.

Only codicon names that exist may be used — an unknown `$(name)` renders as literal text in
the status bar. There is no `sun`, `moon` or `contrast` codicon; the mode glyphs are
`lightbulb`, `circle-large-filled`, `eye` and `color-mode`, and a unit test pins them
against a verified list.

Because VS Code offers no way to read the workbench back, `VSDayStatusBar.snapshot()`
reports what the items were last set to, which is what the integration tests assert on.

## 6. Error handling

Every command runs inside one boundary in `commands.ts`: log, show a message naming the
output channel, and refresh the status bar in a `finally` so the indicator can never be
left describing a state that no longer exists. Individual override writes are additionally
guarded, so one rejected setting cannot abort a mode switch halfway.

## 7. Settings matrix

| Key                               | Type     | Default        | Scope       |
| --------------------------------- | -------- | -------------- | ----------- |
| `vsday.scaleStrategy`             | enum     | `uniform`      | application |
| `vsday.fontScale.step`            | integer  | `0`            | application |
| `vsday.fontScale.ratio`           | number   | `1.1`          | application |
| `vsday.fontScale.baselines`       | object   | `{}`           | application |
| `vsday.fontScale.extraTargets`    | string[] | `[]`           | application |
| `vsday.uiZoom.enabled`            | boolean  | `true`         | application |
| `vsday.uiZoom.perStep`            | number   | `0.1`          | application |
| `vsday.mode.active`               | enum     | `none`         | application |
| `vsday.mode.cycleOrder`           | string[] | all four modes | application |
| `vsday.mode.<id>.theme`           | string   | see manifest   | application |
| `vsday.mode.<id>.settings`        | object   | see manifest   | application |
| `vsday.statusBar.enabled`         | boolean  | `true`         | application |
| `vsday.statusBar.showStepButtons` | boolean  | `true`         | application |
| `vsday.statusBar.showModeButton`  | boolean  | `true`         | application |
| `vsday.statusBar.showResetDot`    | enum     | `auto`         | application |

All are `application` scope: this is a property of the person, not of the project
([ADR-0003](adr/0003-user-scope-writes.md)).

## 8. Extension points

- **A new surface**: add an entry to `BUILT_IN_FONT_TARGETS`. Everything else follows.
- **A third-party surface**: the user adds it to `vsday.fontScale.extraTargets` — no code.
- **A new mode**: add the id to `ModeId`/`MODE_IDS`, a `MODE_DESCRIPTORS` entry (with a
  codicon from the verified list), a `THEME_FALLBACKS` entry, manifest settings, a command,
  and the enum members.
- **A new bundled theme**: a JSON file in `themes/` plus a `contributes.themes` entry.
