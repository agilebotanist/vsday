# ADR-0008 — Scale by window zoom by default; keep font scaling as a choice

- **Status**: Accepted
- **Date**: 2026-09-09
- **Relates to**: FR-22, FR-23, constraint C-1
- **Revises**: [ADR-0002](0002-ui-zoom-nudge.md), which chose fonts as the primary scale

## Context

0.2.0 was reported as scaling unevenly, with a screenshot: the Claude Code side bar was
huge and its labels clipped ("New grou…", "VS C…"), while the Extensions view beside it was
barely changed. The Explorer behaved like the Extensions view. The measured state was:

| Surface                                            | Setting                | Value          | Scale               |
| -------------------------------------------------- | ---------------------- | -------------- | ------------------- |
| Editor, terminal, previews                         | `editor.fontSize` etc. | 23px (from 14) | **+64%**            |
| Chat side bar                                      | `chat.fontSize`        | 21px (from 13) | **+62%**            |
| Explorer, Extensions view, Settings UI, tab labels | _none exists_          | —              | **+10%** (zoom 0.5) |

Both halves of that are the direct consequence of ADR-0002's choice:

1. **Font scaling cannot reach most of VS Code.** The Explorer, the Extensions view, the
   Settings UI, tab labels, notifications, menus and most extension views have no
   font-size setting at all. `window.zoomLevel` is the only lever (constraint C-1), and
   ADR-0002 deliberately kept it to a ~2%-per-step nudge to avoid compounding. Two thirds
   of the workbench therefore stayed small — which is precisely the complaint the product
   exists to fix.
2. **Font scaling breaks layouts that zoom does not.** A webview styled for 13px text and
   given 21px overflows its own containers — hence the clipped labels. Zoom scales the
   whole renderer, containers included, so proportions are preserved by construction.

The "compounding" problem ADR-0002 was avoiding is real but has a clean solution: if zoom
carries the scale, the font settings should not scale _at all_.

## Decision

Introduce `vsday.scaleStrategy` with two values, and default to `uniform`.

**`uniform` (default).** `window.zoomLevel` carries the whole scale; font settings stay at
their baseline. Per-step zoom is derived from `vsday.fontScale.ratio` by solving
`1.2 ** x === ratio` (one zoom level is a factor of 1.2), so a step feels the same size
under either strategy and the percentage on the status bar stays truthful. Everything
scales together — editor, terminal, Explorer, Extensions view, Settings UI, tab labels,
extension webviews — and no layout can break. The cost is that padding and icons grow too,
so slightly less fits on screen.

**`textFirst`.** The 0.2.0 behaviour, unchanged: font settings carry the scale with a small
zoom nudge. Sharper text and precise per-surface control, for users who would rather have
that than uniformity.

Switching is a single command (`vsday.toggleScaleStrategy`, also in the status bar menu),
which re-applies the current step so nothing from the previous strategy is left behind.

**Reconciliation (FR-23).** Because a step now _means_ something different depending on the
strategy, `reconcile()` runs on activation: it computes the writes the recorded step implies
and applies them only if the current settings differ. That covers three cases which would
otherwise leave a half-applied state — an upgrade that changes the default strategy or adds
a target, a strategy edited directly in `settings.json`, and a hand-edited size. When
nothing has drifted it writes nothing, which is the common case.

One hazard found while testing: reacting to a strategy _change_ by writing sizes can catch
a bulk settings reset part-way through and re-pin values someone is trying to clear. So the
listener acts only when the strategy has been **set**, never when it has been cleared.

## Consequences

**Good.** The default now delivers what the product is for: text that is readable
_everywhere_, with no pane left behind and no clipped labels. Extension views are covered
without knowing anything about them — including extensions written after VSDay. Reset
remains exact, and the status bar percentage means the same thing under both strategies.

**Cost.** Zoom is a blunter instrument: icons, padding and spacing grow with the text, so
a heavily zoomed window fits less. Font sizes no longer change under the default, which
will surprise anyone who inspects `settings.json` expecting to see them move — the status
bar tooltip and the log say which strategy is in force. And `window.zoomLevel` is a single
global dial, so VSDay's scale and any manual `Ctrl+=` share it; VSDay measures from the
user's own baseline zoom, so a manual change before scaling is preserved, but one made
_while_ scaled is absorbed into the baseline on the next re-capture.

**Rejected.** Making `uniform` a mere opt-in: the default would keep failing the stated
goal for most of the UI. Raising `uiZoom.perStep` under `textFirst` instead: that
compounds font and zoom growth on the surfaces that _do_ have a font setting, so text runs
away from chrome at ~1.2× per step.
