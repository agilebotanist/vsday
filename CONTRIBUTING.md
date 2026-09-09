# Contributing to VSDay

## Setup

```bash
npm install
npm run test:unit     # ~20 ms — the fast loop
```

Press `F5` in VS Code for the **Run Extension** launch configuration, which bundles and
opens an Extension Development Host.

Requirements: Node 18+ and VS Code 1.85+. The integration suite downloads its own VS Code
build on first run.

## Commands

| Command                           | Purpose                                    |
| --------------------------------- | ------------------------------------------ |
| `npm run compile`                 | `tsc` → `out/` (what the tests run from)   |
| `npm run bundle`                  | esbuild → `dist/extension.js` (what ships) |
| `npm run typecheck`               | Types only, no emit                        |
| `npm run lint` / `npm run format` | ESLint / Prettier                          |
| `npm run test:unit`               | Unit tests                                 |
| `npm run test:integration`        | Compiles, bundles, runs in a real VS Code  |
| `npm run test:coverage`           | Unit tests with the `c8` gate              |
| `npm run verify`                  | Everything CI runs                         |
| `npm run icon`                    | Regenerates `media/icon.png`               |
| `npm run package`                 | `.vsix` into `dist/`                       |

## Where code goes

The project is deliberately split on one question: **does this need a real VS Code?**

- **Pure modules** — `fontScale.ts`, `fontTargets.ts`, `appearanceModes.ts`, `config.ts`,
  `logging.ts`. No `vscode` import, ever. All the logic that can be wrong in an interesting
  way belongs here, because it is unit-testable in milliseconds.
- **Host modules** — `settingsService.ts`, `logger.ts`, `statusBar.ts`, `commands.ts`,
  `extension.ts`, and the interactive parts of `appearanceController.ts`.

If you find yourself wanting `vscode` inside a pure module, that is usually a sign the
logic should be a pure function taking data, called from a host module.

Read [docs/design.md](docs/design.md) before a substantial change, and the
[ADRs](docs/adr/) before changing how scaling or theme resolution works — several of those
decisions exist because the obvious approach failed.

## House rules

1. **Never read-modify-write a font size.** Sizes are recomputed from
   `vsday.fontScale.baselines` ([ADR-0001](docs/adr/0001-baseline-relative-scaling.md)).
   Incrementing the current value reintroduces drift and breaks exact reset.
2. **Never re-read a setting VSDay is already tracking.** Its current value is ours;
   re-reading it would enshrine our own override as the user's preference.
3. **Write through `SettingsService`**, never `vscode.workspace.getConfiguration()`
   directly. That seam is what keeps the logic testable
   ([ADR-0005](docs/adr/0005-settings-service-seam.md)).
4. **Check `isRegistered` before writing** a setting we do not own. Writing an
   unregistered setting throws.
5. **Only use codicons that exist.** An unknown `$(name)` renders as literal text in the
   status bar. There is no `sun`, `moon` or `contrast` codicon — the unit test in
   `appearanceModes.test.ts` pins the verified list.
6. **Do not hardcode theme names.** VS Code renames its default themes between releases;
   go through the candidate lists
   ([ADR-0006](docs/adr/0006-theme-resolution.md)).
7. **Add a test at the layer that can see the bug.** New arithmetic or bookkeeping → unit.
   New VS Code assumption (a setting exists, a theme resolves, a command is registered) →
   integration.

## Adding things

**A new font surface**: add an entry to `BUILT_IN_FONT_TARGETS` in `fontTargets.ts`, with
`min`, `max` and `inheritsWhenZero` where `0` means "inherit". Extend the coverage test in
`fontTargets.test.ts` and the surface list in `fontScale.test.ts` (integration).

**A new appearance mode**: extend `ModeId` and `MODE_IDS`, add a `MODE_DESCRIPTORS` entry
(codicon from the verified list) and a `THEME_FALLBACKS` entry, add
`vsday.mode.<id>.theme` / `.settings` plus the `mode.active` and `cycleOrder` enum members
to `package.json`, register a `vsday.set<Id>Mode` command, and add it to the integration
tests' expected command list.

**A new bundled theme**: a JSON file in `themes/` and a `contributes.themes` entry with the
right `uiTheme` (`vs`, `vs-dark`, `hc-light`, `hc-black`).

## Tests

Integration tests write **User (Global)** settings, which is the behaviour under test. They
run against an isolated profile pinned in `.vscode-test.mjs` with **absolute** paths — the
test host resolves relative ones against its own working directory
(`C:\Windows\system32` on Windows). Do not make those paths relative, and do not remove the
`resetSettings()` hooks.

See [docs/testing.md](docs/testing.md), including the manual checklist that covers what
automation cannot: multi-window propagation, physical keybindings, and how the themes
actually look.

## Commits and releases

- Conventional-style subjects (`feat:`, `fix:`, `docs:`, `test:`, `chore:`) are preferred.
- Update [CHANGELOG.md](CHANGELOG.md) under `Unreleased` in the same change.
- To release: bump `version` in `package.json`, move the changelog entries under the new
  version, tag `v<version>` and push. The release workflow packages the `.vsix` and
  attaches it to a GitHub Release.
