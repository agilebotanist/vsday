# VSDay — User Guide

## 1. The two things it does

**Text size, everywhere at once.** One keystroke enlarges **all of VS Code** — editor,
terminal, Explorer, Extensions view, Settings UI, tab labels, chat panels, extension
views — and another puts it back exactly as it was.

### How "everywhere" works, and why it matters

VS Code gives a font-size setting to only a handful of surfaces. The Explorer, the
Extensions view, the Settings UI, tab labels, menus and most extension panels have **none**;
the only lever that reaches them is window zoom. So VSDay has two strategies, and
`vsday.scaleStrategy` picks between them:

|                                                           | **`uniform`** (default) | **`textFirst`**       |
| --------------------------------------------------------- | ----------------------- | --------------------- |
| Editor, terminal, previews, chat                          | ✅                      | ✅                    |
| Explorer, Extensions, Settings UI, tabs, extension panels | ✅                      | barely (~2% per step) |
| Layouts can break at large sizes                          | no                      | yes — labels can clip |
| Icons and padding                                         | grow too                | unchanged             |
| Text crispness                                            | rendered at zoom        | native font size      |

**`uniform` is the default** because it is the only one that actually reaches everything:
window zoom scales the whole interface, containers included, so nothing is left behind and
nothing overflows. Font sizes in your `settings.json` stay where they are — the zoom does
the work.

Prefer sharper text and don't mind the Explorer staying small? Run **VSDay: Switch Scaling
Strategy**, or pick it from the status bar menu. It switches instantly and carries your
current scale across.

**Appearance modes.** Day, Night, Eye-Saving and High Contrast, each a colour theme plus a
few comfort settings that are cleaned up when you leave the mode.

Because VSDay writes your **User** settings, a change in one window applies to every open
window immediately — no reload.

## 2. Everyday use

| Action       | Keys                                | Command Palette                                 |
| ------------ | ----------------------------------- | ----------------------------------------------- |
| Bigger       | `Ctrl+Alt+=` or `Ctrl+Alt+NumPad +` | VSDay: Increase Font Size Everywhere            |
| Smaller      | `Ctrl+Alt+-` or `Ctrl+Alt+NumPad -` | VSDay: Decrease Font Size Everywhere            |
| Back to 100% | `Ctrl+Alt+0`, or click the `●` dot  | VSDay: Reset Font Size to 100%                  |
| Next mode    | `Ctrl+Alt+M`                        | VSDay: Cycle Appearance Mode                    |
| Everything   | —                                   | VSDay: Show Menu (or click the status bar item) |

On macOS the same bindings use `Cmd+Alt`.

### The status bar

```
   −    A 110%    +    ●    ☾ Night
   │      │       │    │       │
   │      │       │    │       └── click: switch to the next mode
   │      │       │    └────────── click: back to 100%
   │      │       └─────────────── click: bigger
   │      └─────────────────────── click: the full VSDay menu
   └────────────────────────────── click: smaller
```

- **`−` and `+`** step the size down and up — the same as the keybindings, and reliable on
  every keyboard layout. Hide them with `vsday.statusBar.showStepButtons: false`.
- **The percentage** opens the full menu.
- **The `●` dot** appears **only while you are away from 100%**, so its presence tells you
  that you are scaled, and clicking it puts you back. Set
  `vsday.statusBar.showResetDot` to `always` or `never` if you prefer.
- **The mode button** names the mode you are in, and clicking it moves to the **next** mode
  in the cycle — its tooltip tells you which one that will be. Hide it with
  `vsday.statusBar.showModeButton: false`. (For a specific mode rather than the next one,
  use the menu or **VSDay: Set Appearance Mode…**.)

### ⚠ If the keybindings do nothing

On **AZERTY, QWERTZ and other layouts where `Ctrl+Alt` acts as `AltGr`**, the
`Ctrl+Alt+=`, `Ctrl+Alt+-` and `Ctrl+Alt+0` bindings may never reach VS Code. Options:

- Use the numpad alternates: `Ctrl+Alt+NumPad +` / `NumPad -`.
- Use the status bar menu or the Command Palette — everything is available there.
- Rebind: **Preferences: Open Keyboard Shortcuts**, search `vsday`, and pick keys that suit
  your layout (`Ctrl+Shift+Alt+A` and friends are usually free).

## 3. Appearance modes

| Mode              | Default theme                                                          | Also sets                                            |
| ----------------- | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| **Day**           | the best light theme your VS Code ships                                | —                                                    |
| **Night**         | the best dark theme your VS Code ships                                 | —                                                    |
| **Eye-Saving**    | VSDay Sepia (Warm Light) — warm paper, reduced blue                    | roomier line height, solid cursor, no line highlight |
| **High Contrast** | VSDay Sepia High Contrast — warm ground, near-black text, hard borders | heavier text weight, solid wide cursor               |

Three themes ship with VSDay and can also be chosen directly from
**Preferences: Color Theme**:

- **VSDay Sepia (Warm Light)** — for long reading in daylight.
- **VSDay Warm Dark** — low-blue-light dark. Set `vsday.mode.night.theme` to
  `VSDay Warm Dark` if you want Night mode to be warm too.
- **VSDay Sepia High Contrast** — a true high-contrast (`hc-light`) theme, so VS Code draws
  real outlines around widgets rather than relying on background shades.

**Leaving a mode is clean.** Whatever a mode changed is put back to what you had before —
including "you had nothing set", in which case the setting is removed rather than pinned to
a default.

To retarget a mode at any installed theme, set `vsday.mode.<mode>.theme` to the theme's
name as it appears in **Preferences: Color Theme**. To skip a mode when cycling, remove it
from `vsday.mode.cycleOrder`.

### If a mode seems to do nothing

You probably have `window.autoDetectColorScheme` enabled, which makes VS Code follow your
OS colour scheme and overrides any theme VSDay sets. VSDay detects this and offers to turn
it off.

## 4. Tuning

| Setting                           | Default   | What it does                                                                 |
| --------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `vsday.scaleStrategy`             | `uniform` | `uniform` scales everything by window zoom; `textFirst` scales font settings |
| `vsday.fontScale.ratio`           | `1.1`     | How much each step grows. `1.05` for finer steps, `1.2` for coarser          |
| `vsday.fontScale.baselines`       | captured  | Your 100% per surface. Managed for you                                       |
| `vsday.fontScale.extraTargets`    | `[]`      | Extra font-size settings to scale, e.g. from another extension               |
| `vsday.uiZoom.enabled`            | `true`    | Whether chrome is scaled at all                                              |
| `vsday.uiZoom.perStep`            | `0.1`     | Zoom levels per step. Raise to `0.2` to make chrome track the text closely   |
| `vsday.statusBar.enabled`         | `true`    | Show the status bar controls                                                 |
| `vsday.statusBar.showStepButtons` | `true`    | Show the `−` and `+` buttons                                                 |
| `vsday.statusBar.showModeButton`  | `true`    | Show the mode button (click = next mode)                                     |
| `vsday.statusBar.showResetDot`    | `auto`    | `auto` / `always` / `never`                                                  |
| `vsday.mode.cycleOrder`           | all four  | Which modes `Ctrl+Alt+M` visits, in order                                    |

### Why "baselines"?

VSDay records your own font sizes once, as 100%, and recomputes from there every time. That
is why reset is exact rather than approximate, and why pressing increase five times and
decrease five times leaves you precisely where you began.

If your baseline is wrong — say you installed VSDay while already zoomed in — set the sizes
you want and run **VSDay: Use Current Font Sizes as the New 100%**.

## 5. Undoing everything

- **Reset Font Size** (`Ctrl+Alt+0`, or the `●` dot) puts every surface back on its **own
  default** — including extension panels — rather than pinning VSDay's numbers. A size you
  had chosen yourself before installing VSDay is restored as you had it.
- **VSDay: Reset Everything** does that and also clears the active mode, reverting its
  comfort settings. Your theme is left as-is, since that is a choice, not a side effect.
- To remove every trace, delete the `vsday.*` keys from your `settings.json` along with any
  font sizes you no longer want.

## 6. Troubleshooting

| Symptom                                       | Cause and fix                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keybinding does nothing                       | `AltGr` layout — see §2                                                                                                                                                                                                                                                                                           |
| Explorer / Extensions view / tabs do not grow | You are on the `textFirst` strategy, and VS Code gives those panes no font size. Run **VSDay: Switch Scaling Strategy** for `uniform` (see §1)                                                                                                                                                                    |
| An extension panel's labels are clipped       | The same cause in reverse: `textFirst` grows text but not the containers around it. `uniform` scales both                                                                                                                                                                                                         |
| Font sizes in `settings.json` never change    | Expected under `uniform` — zoom carries the scale. The status bar tooltip names the strategy in force                                                                                                                                                                                                             |
| Sizes change but tabs/side bar do not         | Under `textFirst`: `vsday.uiZoom.enabled` is `false`, or `perStep` is `0`                                                                                                                                                                                                                                         |
| Everything grows too fast                     | Lower `vsday.uiZoom.perStep`, or `vsday.fontScale.ratio`                                                                                                                                                                                                                                                          |
| A mode does not change the theme              | `window.autoDetectColorScheme` (see §3), or the configured theme is not installed — VSDay warns and offers the picker                                                                                                                                                                                             |
| One surface stayed small                      | It may have no font-size setting in your VS Code version, or it is one of the inherit-from-editor settings that VSDay intentionally leaves alone. Check **VSDay: Show Log**                                                                                                                                       |
| An extension's panel stayed small             | If it reads VS Code's standard font settings it is already covered. If it has a font-size setting of its own, add that setting id to `vsday.fontScale.extraTargets`. If it hardcodes its size, no extension can change it — raise `vsday.uiZoom.perStep` (say to `0.3`) so window zoom carries that panel instead |
| I want to know what VSDay did                 | **VSDay: Show Log** lists every write, skip and warning                                                                                                                                                                                                                                                           |
