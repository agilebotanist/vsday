# ADR-0004 — Bundle the warm themes rather than depend on installed ones

- **Status**: Accepted
- **Date**: 2026-09-09
- **Relates to**: FR-9b, FR-17

## Context

Eye-Saving and High Contrast modes need warm, low-blue-light colours. Three ways to get
them:

1. **Map to a third-party theme** (Solarized Light, Gruvbox, …). Zero authoring, but the
   mode is broken until the user installs the right extension, and its exact colours are
   outside our control.
2. **Map to a VS Code built-in.** Always present, but the light built-ins are blue-white,
   not warm; the closest fit is the high-contrast pair, which is not a "long reading"
   theme. Their names have also churned across versions (see ADR-0006).
3. **Bundle our own themes.**

## Decision

Bundle three themes, and prefer them for the reading modes:

| Theme                     | `uiTheme`  | Purpose                                                                     |
| ------------------------- | ---------- | --------------------------------------------------------------------------- |
| VSDay Sepia (Warm Light)  | `vs`       | Warm paper ground, reduced blue, softened contrast — the Eye-Saving default |
| VSDay Warm Dark           | `vs-dark`  | Low-blue-light dark, for eye-saving after dark                              |
| VSDay Sepia High Contrast | `hc-light` | Warm ground, near-black text, hard borders — the High Contrast default      |

The high-contrast theme is declared `hc-light`, not `vs`. That matters: VS Code treats
high-contrast themes specially, honouring `contrastBorder`/`contrastActiveBorder` so
widgets get real outlines instead of relying on background differences alone. A warm theme
that merely used dark text would look high-contrast without behaving so.

Every mode still resolves through the candidate list (ADR-0006), so a user can point any
mode at any installed theme, and the modes degrade to VS Code's own themes if ours were
ever unavailable.

## Consequences

**Good.** The reading modes work on a fresh install with nothing else present. The colours
are ours to tune against actual complaints. High Contrast gets genuine high-contrast
behaviour, not an imitation.

**Cost.** Three theme files to maintain, and the extension now appears in the Themes
category, which sets an expectation of theme quality that we have to keep meeting. The
extension is also a little larger — negligible for JSON.
