# ADR-0005 — One configuration seam, so the logic is testable without VS Code

- **Status**: Accepted
- **Date**: 2026-09-09
- **Relates to**: NFR-6

## Context

Anything that imports `vscode` can only run inside an extension host. A host run in this
project costs ~50 seconds and needs a downloaded VS Code build; a unit test run costs ~20
milliseconds. Where the interesting logic lives therefore determines how fast the project
is to work on and how thoroughly the edge cases get covered.

The interesting logic here is arithmetic and bookkeeping: step-to-size, clamping,
inheritance rules, baseline capture, override diffing. None of it needs VS Code — it needs
_a way to read and write settings_.

## Decision

Define `SettingsService` as the single interface over VS Code configuration:

```ts
get / getOr / getUserValue / isRegistered / update;
```

`VscodeSettingsService` implements it against `workspace.getConfiguration()`, always
writing at `ConfigurationTarget.Global`. `FakeSettingsService` implements it in memory for
tests, reproducing the two distinctions that actually change behaviour:

- **defaults vs. user values** — `getUserValue` must distinguish "the user set 1.2" from
  "the default happens to be 1.2", or reverting a mode override cannot be correct;
- **registered vs. unknown settings** — the real `update` throws for an unregistered key,
  so the fake throws too. That is how FR-7 is tested without an old VS Code build.

`Logger` is likewise split: the contract and the null/in-memory implementations live in
`logging.ts` with no `vscode` import, and only `createLogger` needs the host. Without that
split, importing a logger would have dragged `vscode` into every unit test.

`FontScaleController` depends on the interface, not the implementation, so its baseline and
zoom behaviour is unit-tested. `AppearanceController` keeps its `vscode` import for user
prompts and theme discovery, so its pure parts live in `appearanceModes.ts` and the rest is
covered by integration tests.

## Consequences

**Good.** 69 unit tests run in ~20 ms and cover the cases that are tedious to stage in a
real host (a VS Code build missing a setting; a user who edited `settings.json` by hand; a
zoom level the user had already set). Integration tests are then free to check only what
genuinely needs a host.

**Cost.** One extra indirection, and a fake that has to stay faithful to the real API's
semantics — if `inspect`/`update` behaviour ever diverges, unit tests could pass while the
extension is broken. The integration suite exists to catch exactly that, and deliberately
re-checks the same requirements end to end.
