# ADR-0002 — Fonts carry the scale; `window.zoomLevel` gets a small nudge

- **Status**: Accepted
- **Date**: 2026-09-09
- **Relates to**: FR-5, constraint C-1

## Context

The request was that text be readable "in all windows" on a large monitor. That splits into
two territories with different mechanisms:

- **Text surfaces** — editor, terminal, debug console, markdown preview, SCM input, chat,
  notebook output — each have a font-size setting.
- **Workbench chrome** — tabs, side bar, activity bar, status bar, menus — have **none**.
  VS Code exposes no UI font size. The only lever is `window.zoomLevel`, which scales the
  entire renderer: text, icons, padding, everything.

Three options:

1. **Font settings only.** Text gets bigger; tabs and the side bar stay small. Half the
   problem on a large display.
2. **`window.zoomLevel` only.** Everything scales uniformly. But it is a blunt instrument:
   it magnifies padding and icons at the same rate, wastes screen area, and offers no way
   to make _just_ the text bigger. It is also merely a rebind of the built-in `Ctrl+=`.
3. **Both.** Font settings do the work; zoom keeps chrome from falling behind.

Option 3 has a trap: zoom magnifies text too, so a 10%-per-step font increase paired with a
full 20%-per-step zoom level compounds to ~32% per press. Four presses would be a 3× jump.

## Decision

Both, weighted: font settings are the primary scale (`ratio`, default 1.1 per step), and
`window.zoomLevel` moves by `vsday.uiZoom.perStep` — default **0.1** zoom levels per step,
about +2% — purely so chrome does not fall behind. Users who want the chrome to track the
text more closely raise `perStep`; users who want no zoom at all set
`vsday.uiZoom.enabled: false`.

Two details that matter more than they look:

- The level is computed as `baseline + step × perStep`, from the user's **own**
  pre-existing zoom. Someone who already ran at `window.zoomLevel: 1` must land back on 1
  after a reset, not on 0.
- When the computed level is exactly `0`, the key is _removed_ rather than written, so
  VSDay does not leave a redundant entry in a `settings.json` it otherwise did not touch.
- The level is clamped to ±5. VS Code permits more, but a runaway zoom leaves the workbench
  hard to recover with the mouse alone.

## Consequences

**Good.** Text scales at a sensible rate; chrome keeps up; both aspects are tunable; a
reset restores the user's own zoom exactly.

**Cost.** Two knobs instead of one, and the interaction between them needs explaining — the
setting descriptions and the README do that. Chrome grows more slowly than text by default,
which is a deliberate compromise rather than a neutral outcome.
