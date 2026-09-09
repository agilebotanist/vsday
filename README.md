# VSDay

**Scale the font size of every VS Code surface with one keystroke, and switch between Day,
Night, Eye-Saving and High Contrast modes.**

Built for large monitors and long days: VS Code has no single "text size" setting — the
editor, terminal, debug console, Markdown preview, source-control input, chat panels and
notebook cells each have their own (two, in the case of chat), and the workbench chrome has
none at all. VSDay moves them together, and gives you an exact way back.

## Features

### One keystroke, every surface

|              |                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Ctrl+Alt+=` | bigger — editor, terminal, debug console, Markdown preview, SCM input, chat body and code blocks, notebook cells, plus a nudge to the workbench chrome |
| `Ctrl+Alt+-` | smaller                                                                                                                                                |
| `Ctrl+Alt+0` | back to exactly the sizes you started with                                                                                                             |

Changes are written to your **User** settings, so one keypress applies to **every open
window** — no reload.

Chat panels included: extension chat views (the Claude Code panel among them) take their
body text from `chat.fontSize` and their code blocks from `chat.editor.fontSize`. VSDay
scales both, so the whole conversation grows — not just the code in it.

### A status bar toolbar

```
   −    A 110%    +    ●    ☾ Night
   │      │       │    │       └── click: next mode
   │      │       │    └────────── click: back to 100%
   │      │       └─────────────── click: bigger
   │      └─────────────────────── click: the full menu
   └────────────────────────────── click: smaller
```

The `●` appears only while you are away from 100%, so it doubles as the "you are zoomed"
indicator — and disappears once you are back. The mode button names where you are and takes
you to the next mode on click. The `−`/`+` buttons matter more than they look: `Ctrl+Alt` is
`AltGr` on AZERTY and QWERTZ keyboards, where the keybindings may never fire.

### Four appearance modes

| Mode              | Theme                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| **Day**           | the best light theme your VS Code version ships                                                  |
| **Night**         | the best dark theme your VS Code version ships                                                   |
| **Eye-Saving**    | **VSDay Sepia (Warm Light)** — warm paper ground, reduced blue, roomier line height              |
| **High Contrast** | **VSDay Sepia High Contrast** — warm ground, near-black text, real widget outlines, heavier text |

`Ctrl+Alt+M` cycles. Anything a mode changes is **put back** when you leave it — including
"you had nothing set", in which case the setting is removed rather than pinned.

Three themes ship with VSDay and can be selected directly from **Preferences: Color
Theme**: _VSDay Sepia (Warm Light)_, _VSDay Warm Dark_, _VSDay Sepia High Contrast_.

## Install

**From a release `.vsix`:**

```bash
code --install-extension vsday-0.2.0.vsix
```

**From source:**

```bash
npm install
npm run package                                   # → dist/vsday-<version>.vsix
code --install-extension dist/vsday-0.2.0.vsix
```

Requires VS Code 1.85 or newer. No runtime dependencies, no telemetry, no network access.

## Commands

All are available in the Command Palette under **VSDay**, and from the status bar menu.

| Command                                                 | Default keys                      |
| ------------------------------------------------------- | --------------------------------- |
| Increase Font Size Everywhere                           | `Ctrl+Alt+=`, `Ctrl+Alt+NumPad +` |
| Decrease Font Size Everywhere                           | `Ctrl+Alt+-`, `Ctrl+Alt+NumPad -` |
| Reset Font Size to 100%                                 | `Ctrl+Alt+0`                      |
| Set Font Scale…                                         |                                   |
| Use Current Font Sizes as the New 100%                  |                                   |
| Cycle Appearance Mode                                   | `Ctrl+Alt+M`                      |
| Switch to Day / Night / Eye-Saving / High Contrast Mode |                                   |
| Set Appearance Mode…                                    |                                   |
| Reset Everything                                        |                                   |
| Show Menu · Show Log                                    |                                   |

On macOS, `Cmd+Alt` replaces `Ctrl+Alt`.

> **⚠ AZERTY / QWERTZ keyboards:** `Ctrl+Alt` is `AltGr` on these layouts, so
> `Ctrl+Alt+=`, `Ctrl+Alt+-` and `Ctrl+Alt+0` may not fire. Use the `NumPad` alternates,
> the status bar menu, or rebind under **Preferences: Open Keyboard Shortcuts** (search
> `vsday`).

## Settings

| Setting                           | Default         | Purpose                                                                |
| --------------------------------- | --------------- | ---------------------------------------------------------------------- |
| `vsday.fontScale.ratio`           | `1.1`           | Growth per step (`1.05` finer, `1.2` coarser)                          |
| `vsday.fontScale.step`            | `0`             | Current position; `0` is 100%                                          |
| `vsday.fontScale.baselines`       | captured        | Your own sizes, recorded as 100%                                       |
| `vsday.fontScale.extraTargets`    | `[]`            | Extra font-size settings to scale                                      |
| `vsday.uiZoom.enabled`            | `true`          | Scale workbench chrome via `window.zoomLevel`                          |
| `vsday.uiZoom.perStep`            | `0.1`           | Zoom levels per step (kept small on purpose — zoom magnifies text too) |
| `vsday.mode.<mode>.theme`         | see settings UI | Theme per mode; empty = pick the best installed                        |
| `vsday.mode.<mode>.settings`      | see settings UI | Comfort settings per mode, reverted on leaving                         |
| `vsday.mode.cycleOrder`           | all four        | Which modes `Ctrl+Alt+M` visits                                        |
| `vsday.statusBar.enabled`         | `true`          | Show the status bar controls                                           |
| `vsday.statusBar.showStepButtons` | `true`          | Show the `−` and `+` buttons                                           |
| `vsday.statusBar.showModeButton`  | `true`          | Show the mode button (click = next mode)                               |
| `vsday.statusBar.showResetDot`    | `auto`          | `auto` / `always` / `never`                                            |

## How it works, briefly

VSDay records your font sizes once as a **baseline** and recomputes every scaled size from
it, rather than nudging the current value up and down. That is why reset is exact, why five
increases and five decreases land precisely where you began, and why typing a size into
`settings.json` mid-session does not confuse it.

Workbench chrome has no font size in VS Code, so `window.zoomLevel` is used for it — as a
deliberately _small_ secondary nudge, because zoom magnifies text as well and a full zoom
level per step would compound with the font increase.

Full reasoning in [docs/design.md](docs/design.md) and the
[ADRs](docs/adr/).

## Documentation

| Document                                     | Contents                                                        |
| -------------------------------------------- | --------------------------------------------------------------- |
| [docs/user-guide.md](docs/user-guide.md)     | Everyday use, tuning, troubleshooting                           |
| [docs/requirements.md](docs/requirements.md) | Requirements (FR/NFR) with traceability to tests                |
| [docs/design.md](docs/design.md)             | Architecture, modules, settings matrix, pitfalls                |
| [docs/adr/](docs/adr/)                       | Decision records, including why themes are resolved dynamically |
| [docs/testing.md](docs/testing.md)           | Test strategy, coverage, manual checklist                       |
| [CONTRIBUTING.md](CONTRIBUTING.md)           | Development setup and workflow                                  |
| [CHANGELOG.md](CHANGELOG.md)                 | Release history                                                 |

## Development

```bash
npm install
npm run test:unit          # ~20 ms
npm run verify             # lint + typecheck + unit + integration
npm run package            # → dist/*.vsix
```

Press `F5` in VS Code to launch the Extension Development Host.

## Privacy

VSDay collects nothing and contacts nothing. Its only effects are writes to your VS Code
settings and lines in its own output channel.

## License

[MIT](LICENSE)
