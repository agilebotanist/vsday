# ADR-0007 — Fallback baselines for surfaces that inherit nothing, and writes that remove themselves

- **Status**: Accepted
- **Date**: 2026-09-09
- **Relates to**: FR-18, FR-19
- **Supersedes part of**: the ad-hoc "remove a zero zoom level" rule in
  [ADR-0002](0002-ui-zoom-nudge.md)

## Context

0.1.0 shipped with a reported gap: scaling did not change the text in an extension's chat
panel (the Claude Code panel). Reading the extension's own webview code showed why:

```js
// the extension host, on every relevant configuration change
editorFontSize = workspace.getConfiguration('chat.editor').get('fontSize') || 12;
chatFontSize = workspace.getConfiguration('chat').get('fontSize') || 13;
```

```css
/* the webview */
body {
  font-size: var(--vscode-chat-font-size, 13px);
}
.code {
  font-size: var(--app-monospace-font-size);
} /* ← --vscode-editor-font-size */
```

Two facts fell out of that, each with a wider consequence than the one panel:

1. **`chat.fontSize` drives chat body text; `chat.editor.fontSize` drives only code blocks
   inside it.** VSDay scaled the latter and not the former, so code blocks in the chat grew
   while the conversation itself did not — a partial change that reads worse than no change.
2. **Some font settings have no registered default and nothing derives them from
   `editor.fontSize`.** `chat.fontSize` is unset out of the box, and each consumer
   substitutes its own hardcoded size (13px above). VSDay's rule of "leave a `0`/unset
   setting alone so it keeps inheriting" — right for `notebook.output.fontSize`,
   `editor.suggestFontSize` and friends — is precisely wrong here: leaving it unset means
   the surface never scales at all.

A third problem was already latent. At step 0 VSDay wrote the baseline value back to every
target, so a user who had never set `editor.fontSize` ended up with `"editor.fontSize": 14`
pinned in their `settings.json` after a reset. Effectively harmless, but it means "reset"
did not return surfaces to _their own_ defaults — and for a setting like `chat.fontSize`,
pinning 13 also freezes a value that each consumer might otherwise choose for itself.

## Decision

**1. `baselineFallback` on a font target.** A target may declare the size its consumers
substitute when the setting carries no value. Baseline resolution becomes three cases, in
order:

| Current value | `inheritsWhenZero` | Baseline                                   |
| ------------- | ------------------ | ------------------------------------------ |
| a real size   | —                  | that size                                  |
| unset or `0`  | yes                | none — skip, keep inheriting               |
| unset or `0`  | no                 | the declared `baselineFallback`, else skip |

`chat.fontSize` declares `13`, `chat.editor.fontSize` declares `12` — the numbers their
consumers actually use. A target may not declare both rules; a unit test enforces that.

**2. A write that changes nothing removes itself instead.** Every size write compares
against _the value the surface would use if the setting carried nothing_ — its registered
default, or the target's `baselineFallback` when it has no default:

```
naturalValue = defaultValue(key) ?? baselineFallback
value === naturalValue  →  remove the user-level value
otherwise               →  write it
```

The effective size is identical either way, so this is free, and it makes reset mean what
it says: every surface — the workbench's own and any extension reading these settings —
goes back to its own default, and a `settings.json` VSDay found clean is left clean. A size
the user chose themselves (17px where the default is 14px) still differs from the natural
value, so it is written back and preserved.

This generalises the special case ADR-0002 introduced for `window.zoomLevel`, whose
default is `0`; that rule is now simply an instance of this one.

**3. Two further surfaces.** `notebook.markup.fontSize` (notebook Markdown cells) joins the
registry as an inheriting target. `screencastMode.fontSize` and
`interactiveSession.editor.fontSize` were considered and rejected: a presentation overlay
is not a reading surface, and the latter is not registered in current VS Code.

## Consequences

**Good.** Chat panels scale as a whole. Any extension that reads the standard VS Code font
settings is covered, including ones written after VSDay. Reset genuinely restores defaults
everywhere and leaves no residue.

**Cost.** `baselineFallback` values are transcribed from another extension's fallback
constants, so they can drift if that extension changes its default — the effect of drift is
a slightly wrong 100%, not a broken surface, and `vsday.captureBaseline` corrects it. The
registry now carries two mutually exclusive rules whose distinction has to be understood
when adding a target; the table above and the guard test are there to make it hard to get
wrong.

**Open.** Surfaces with _no_ setting at all — an extension webview that hardcodes its font
size — remain out of reach for any extension, VSDay included. `window.zoomLevel` is the
only lever for those, which is why `vsday.uiZoom.perStep` exists and can be raised.
