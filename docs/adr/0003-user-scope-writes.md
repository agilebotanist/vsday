# ADR-0003 — Write only to User (Global) settings

- **Status**: Accepted
- **Date**: 2026-09-09
- **Relates to**: FR-4

## Context

VS Code configuration can be written at User (Global), Workspace, or Workspace Folder
scope. The original request said the font change should apply "in all windows".

Notably, there is no API to broadcast a change to other windows. But a User-scope setting
_is_ shared state: every open window observes the same `settings.json` and applies changes
live. So the scope choice is also the multi-window mechanism.

Options:

1. **User (Global) always.** One preference for the person, effective everywhere.
2. **Workspace when a folder is open.** Per-project sizing.
3. **Configurable, defaulting to User.**

## Decision

User (Global), always.

Reading comfort is a property of the person and their monitor, not of the repository they
happen to have open. Option 2 would also fail in windows with no folder open, and would
write accessibility preferences into project files that get committed and shared — an
outcome nobody asks for. Option 3 adds a setting, a code path and a test surface for a
case that has not been requested; it can be added later without breaking anything if it
ever is.

Every mode override is written at the same scope, for the same reason and so that reverting
is symmetric.

## Consequences

**Good.** One keypress reaches every window with no extra machinery. Nothing VSDay writes
can leak into a repository. Reverting is unambiguous — there is exactly one place a value
could have come from.

**Cost.** Someone who genuinely wants a different size per project cannot have it. VS Code
Settings Sync will also carry these values to their other machines, which is usually
desirable but is a behaviour worth documenting.
