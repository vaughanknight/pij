# Phase 2c item 6b execution log

## 2026-08-28 — dlg-0012

### T001 — isolated matrix

- Verified branch `s391/item6b-flash-ui-server` at base `73f4a90ceaf530b886180f9608a5b4c947c8fecb`.
- Ran Copilot CLI 1.0.81-14 in a standalone Terminal.app process with `TMUX` and `TMUX_PANE` unset, an empty scratch cwd, and a fresh `PIJ_HOME`.
- Did not invoke `pij spawn`, create a pane-less pij seat, open a Copilot tmux pane, or contact/restart the live daemon.
- Completed all eight rows for both `gemini-3.6-flash` and `gpt-5.6-sol`.
- Observed Flash return HTTP 400 `invalid request body` in all eight rows; observed Sol return `ok` in all eight corresponding rows.
- Recorded the full matrix, environment controls, Copilot version, and verbatim Flash error lines in `isolation.md`.

### Ruling deviation

The packet's `copilot -p` remedy was based on the o-prime's earlier same-version success at about 07:33Z. The isolated matrix later observed `-p` and every interactive variant fail at about 16:0xZ. The o-prime ruled that both observations are real and identify upstream instability, not an interactive request-path property.

The implementation therefore does not recommend `-p`, does not add an interactive-only field, and does not alter item 6's argv gate. It records both observations as `copilotInstability`, warns without blocking spawn, and recommends `gpt-5.6-terra` or `gpt-5.6-sol` until a fresh Flash probe passes.

### T002b — catalog mark and warning

- RED: added registry, resolver, and spawn-warning tests; 7 tests failed before implementation.
- GREEN: added structured instability metadata for `gemini-3.6-flash`, annotated all Copilot projections, resolved bare/provider-qualified ids, and emitted the ruled warning from `buildSpawnWarning`.
- Focused result: 97 tests passed across `registry.test.ts`, `validate.test.ts`, and `spawn-validation.test.ts`.
- A read-only `loadModels()` composition probe showed both `github-copilot` and `copilot` Flash projections carrying the same instability record and produced the exact warning.
- Warning remains advisory; existing spawn callers print it and continue.

### T003 — documentation

- Updated `docs/how/pij-models-discovery.md` with the measured pass/fail observations, catalog field, warn-don't-block behavior, alternatives, and isolation record.

### T004 — gates and delivery

- Targeted model tests: 97 passed, 0 failed.
- Typecheck: `npx tsc --noEmit -p .` passed.
- Scoped Biome check for all changed TypeScript files passed.
- Authoritative extension suite: 171 files passed, 2 skipped; 3,994 tests passed, 15 skipped; 0 failed.
- Authoritative log: `.harness/temp/s391/vitest-phase2c.log`.
- `just lint` remains red only in unrelated pre-existing files, including OSC producer/control-character and assignment-expression diagnostics; no changed file is listed.
- `harness checks --quick` passes local paths, typecheck, package audit, and snapshots. It reproduces the same unrelated lint failure, the existing `spawnSync pwsh ENOENT` test baseline, and the derived Windows compatibility failure; smoke is intentionally skipped in quick mode.
- Completion is reported as `PARTIAL` with `gatesClean:false` solely because those repository-wide baselines remain outside this delegation's file fence.
