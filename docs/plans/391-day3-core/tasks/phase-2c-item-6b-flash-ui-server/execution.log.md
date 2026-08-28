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

The packet's `copilot -p` remedy was based on the o-prime's relayed same-version success at about 2026-08-27 07:33Z; it was not instrumented in this run. The isolated matrix instrumented `-p` and every interactive variant failing at about 2026-08-27 16:0xZ. The o-prime ruled that both observations are real and identify upstream instability, not an interactive request-path property.

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
- Authoritative log: `docs/plans/391-day3-core/kept-logs/vitest-phase2c.log.txt`.
- `just lint` remains red only in unrelated pre-existing files, including OSC producer/control-character and assignment-expression diagnostics; no changed file is listed.
- `harness checks --quick` passes local paths, typecheck, package audit, and snapshots. It reproduces the same unrelated lint failure, the existing `spawnSync pwsh ENOENT` test baseline, and the derived Windows compatibility failure; smoke is intentionally skipped in quick mode.
- Completion is reported as `PARTIAL` with `gatesClean:false` solely because those repository-wide baselines remain outside this delegation's file fence.

## 2026-08-28 — dlg-0012 FX-01

- Corrected the failure stamp from the future-dated local-date/UTC-time hybrid to `2026-08-27 ~16:0xZ`, matching the request-ID epochs.
- Dated the relayed pass `2026-08-27 ~07:33Z` and recorded that it came from the o-prime rather than this run's instrumentation.
- Replaced the object catalog with a `Map`, so Object.prototype keys such as `constructor` reach normal unknown-model validation.
- Made `resolveCopilotInstability` consume only the annotated catalog entry. The annotation provider guard and `loadModels()` wiring are now load-bearing.
- Added literal warning/record assertions, a composed-catalog warning case, an OpenRouter exclusion, and an explicit ban on a `copilot -p` remedy.
- Corrected scope record: `core/spawn.ts` and `core/models/validate.test.ts` were authorized for the mark-path implementation even though the original task table omitted them.
- Focused result: 102 tests passed across the three model test files.
- M2 proof: removing the annotation provider guard failed `registry.test.ts:343` (`does not annotate a non-Copilot provider with the same bare model id`).
- M4 proof: removing `annotateCopilotInstability` from `loadModels()` failed `spawn-validation.test.ts:109` (`reads the Flash mark through the composed catalog without injecting metadata`).
- M6b proof: appending a `copilot -p` remedy failed the literal warning at `spawn-validation.test.ts:94` and the explicit negative at `spawn-validation.test.ts:110`.
- Typecheck and scoped Biome passed.
- Authoritative extension suite: 171 files passed, 2 skipped; 3,999 tests passed, 15 skipped; 0 failed.
- Authoritative log: `docs/plans/391-day3-core/kept-logs/vitest-phase2c-fx01.log.txt`.
- `just lint` remains red only in unrelated pre-existing files; no FX-01 file is listed.
- `harness checks --quick` passes local paths, typecheck, package audit, and snapshots. It reproduces only the unrelated OSC lint baseline, missing `pwsh`, and the derived Windows compatibility failure; smoke is skipped in quick mode.
- FX-01 is reported `PARTIAL` with `gatesClean:false` solely for those repository-wide baseline failures.
