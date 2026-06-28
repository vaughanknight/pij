# Execution Log — 021 unify-spawn-harness (Simple, single phase)

**Testing approach**: Full TDD (pure seams). **Started**: 2026-06-28.

## T001 — Test: parseSpawnArgs accepts pi; planBranch rejects pi-branch ✅
- Flipped the former "rejects pi" assertion in `core/spawn.test.ts` to **accepts pi**
  (`--harness pi` → ok; with `--task`/`--model` too); kept the `bogus` rejection.
- Added a `planBranch("pi", …)` → `E-BRANCH` case (the semantic the bin's pi+`--branch`
  guard mirrors). RED against pre-change code.

## T002 — Impl: widen spawnable harnesses ✅
- `core/spawn.ts`: added `SPAWNABLE_HARNESSES = {pi, claude, copilot}` (distinct from
  `CONTROL_HARNESSES = {claude, copilot}` — the daemon-bound set). `parseSpawnArgs` now
  validates against `SPAWNABLE_HARNESSES`; error + usage text → `pi|claude|copilot`.
- `parseAdoptArgs` left on `CONTROL_HARNESSES` (non-goal: no `adopt --harness pi`).

## T003/T005 — Tests for the bin dispatch + regression
- **Discovery D-01 (Noteworthy)**: `runSpawn` lives in the **impure bin** (`cli.ts`); it
  `new TmuxAdapter()`s directly and `process.exit`s — it is **not** unit-testable without
  a port-injection refactor (out of KISS scope). The plan assumed a `cli.test.ts`; none
  exists. Resolution: test the **pure seams** thoroughly (`parseSpawnArgs`,
  `buildSpawnCommand` [pre-existing], `planBranch`) and cover the impure wiring with a
  **live smoke** (the flow-pair reviewer spawn doubles as it). Regression for AC-04 is the
  full suite staying green (claude/copilot pure paths untouched).

## T004 — Impl: pi dispatch in runSpawn ✅
- `cli.ts`: imported `buildSpawnCommand`; added a `harness === "pi"` branch **before**
  `ensureDaemonRunning` (so pi never auto-starts the daemon — AC-07). It rejects pi+
  `--branch` (`E-BRANCH`), resolves `PIJ_ANNOUNCE_TO` via `resolveSelf` (mirrors `--branch`),
  builds via the pure `buildSpawnCommand`, and reuses the **identical** registry-based
  split layout (`planControlSplit`) + `tmux.splitWindow`. Writes **no** pending descriptor,
  pre-allocates **no** pij-id, takes **no** transcript snapshot. Prints the pane id; the
  child self-registers and its pij-id arrives via the ready-ping.
- **Discovery D-02 (Noteworthy — plan correction)**: the plan's "pi = window-only, split
  deferred" non-goal (AC-08) was based on a **misread**: the *in-process* `pij_spawn` tracks
  the split cap in-session (`session.ts:103-106`), but the **CLI control-plane path tracks
  panes via the registry** (`cli.ts:394-409`). So split is **free** for pi and strictly more
  faithful to "spawn the same way". **AC-08 changed**: pi now reuses the same split layout as
  claude/copilot (no `--layout` flag exists on `pij spawn`; nothing to reject). The pi-branch
  guard now only rejects `--branch` for pi.

## T006 — Docs ✅
- `cli.ts`: `SPAWN_USAGE` + top-level `USAGE` rewritten for `pi|claude|copilot` (pi =
  self-registers/no daemon; claude/copilot = daemon-bound) + `--task` documented.
- `docs/how/pij.md`: added a `spawn` row to the CLI reference (the table predated the
  control plane — full operator docs remain the Plan 019 leftover).

## T007 — Gates ✅
- `npm run typecheck` → clean.
- `npx biome check` (spawn.ts, spawn.test.ts, cli.ts) → clean.
- `npm run test` → **882 passed**, 4 skipped (was 881; +1 planBranch pi case). spawn.test.ts:
  65 passed. claude/copilot regression green (AC-04).

## Live smoke (the impure bin wiring — covers what the unit tests can't, per D-01)

Dogfooded the new path by spawning the Plan-021 reviewer with it:
`pij spawn --harness pi --model '@preset/glm-1m' --task "…"` (from claude orchestrator
pij-5lztp8, pane %7).

- ✅ **AC-01**: child self-registered as `pij-yjwp09` in pane %24 — the spawn touched no
  daemon and wrote no pending descriptor (the bin returned right after `splitWindow`).
- ✅ **AC-02**: the review task was delivered (reviewer began working) via `PIJ_SPAWN_TASK`
  — no "Agent is already processing" race.
- ✅ **AC-03**: ready-ping body `{"model":"@preset/glm-1m",…}`; pane footer shows `1.0M`
  context — model threaded correctly.
- ✅ **AC-05**: the child ready-pinged **pij-5lztp8** (me) → `PIJ_ANNOUNCE_TO` resolved via
  `resolveSelf` from a control-plane (claude) caller.
- ✅ **AC-07**: no daemon auto-start from the pi spawn; child self-registers.
- Canary: footer model = glm `@pre`(set), 1.0M ctx, **no 400** on first inference; registry
  shows `pij-yjwp09 working active`.

## Deferred & Noteworthy (this phase)

| Tag | Item | Detail |
|-----|------|--------|
| Noteworthy | D-01 | `runSpawn` bin is impure → pi wiring covered by pure-seam tests + live smoke, not a unit test (no bin refactor; KISS). |
| Noteworthy | D-02 | Plan AC-08 corrected: pi **reuses the split layout** (registry-tracked), not window-only. More uniform than planned. |
| Deferred | --provider | `pij spawn --harness pi --model <m>` threads `--model` only, not `--provider`. A pi model needing a non-default provider (e.g. an openrouter preset) may need the session's configured default or a future `--provider` passthrough. Follow-up if it bites. |
