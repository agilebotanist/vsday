# ADR-0001 — Recompute sizes from a captured baseline

- **Status**: Accepted
- **Date**: 2026-09-09
- **Relates to**: FR-1, FR-2, FR-3, FR-6

## Context

Scaling has to change several font-size settings together, repeatedly, and be undoable
exactly. Two implementations are available.

**Incremental (read-modify-write).** Read the current size, write `current ± delta`. This
is what the built-in `editor.action.fontZoomIn` does, and it is the obvious approach.

**Baseline-relative.** Record the user's own size once as the 100% baseline, keep an
integer step, and recompute every size from `(baseline, ratio, step)` on each action.

The incremental form has three concrete failures:

1. **Rounding drift.** Multiplicative steps on integers are not reversible: 14 → ×1.1 →
   15 → ÷1.1 → 14 works, but 12 → 13 → 12 and 5 → 6 → 5 do not hold across longer
   sequences. After a dozen in/out presses the user's sizes have quietly moved.
2. **No exact reset.** "Back to normal" requires remembering the original values anyway —
   so the baseline exists regardless; the only question is whether it is authoritative.
3. **Hostile to hand edits.** If someone types a size into `settings.json` mid-session, the
   next increment compounds off that number, and the extension's idea of "normal" is gone.

## Decision

Recompute from the baseline. `vsday.fontScale.baselines` holds the user's 100% per target;
`vsday.fontScale.step` holds the position; sizes are a pure function of the two.
Consequently:

- Reset is `step = 0`, which reproduces the baseline exactly.
- N increases followed by N decreases is a no-op by construction, not by luck.
- A hand edit to a size is simply overwritten by the next action, which is correct
  relative to the baseline.
- A baseline is captured only once per target and never re-read afterwards; re-reading
  would adopt our own scaled value as the new 100% and ratchet it upward.

One refinement: sizes are walked step by step from the baseline rather than computed as a
single `baseline * ratio ** step`, so that each step moves at least 1px. Pure rounding can
otherwise produce the same integer twice in a row for small baselines, which the user reads
as a broken keybinding. The walk is still a pure function of its inputs, so no drift is
reintroduced.

## Consequences

**Good.** Exact reset; idempotent application; no accumulation; recoverable from external
edits; the whole scale is described by three inspectable settings.

**Cost.** An extra settings object (`baselines`) that users may see and wonder about — the
setting description explains it, and `vsday.captureBaseline` is the escape hatch when the
captured baseline is not what the user wants.

**Rejected alternative.** Incremental read-modify-write, for the three failures above.
