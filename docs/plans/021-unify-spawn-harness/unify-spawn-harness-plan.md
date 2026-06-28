# Unify pij spawn across pi / claude / copilot

**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-06-28
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from `research-dossier.md`.

## Business Specification

### Research Context

The dossier (`research-dossier.md`) found pij has **two disjoint spawn front doors** — the in-process `pij_spawn` tool (pi only) and the `pij spawn --harness` CLI (claude/copilot only, pi hard-rejected at `core/spawn.ts:387`). The asymmetry is historical: both already emit the same `SpawnCommand` shape (F-06), both brief race-free via `PIJ_SPAWN_TASK` (F-05), and transport is already polymorphic on `HarnessKind` (F-04). The one real difference is that **pi self-registers at boot and needs no daemon bind** (F-03), whereas claude/copilot need the daemon. Plan 020's `supportsBranching` + `planBranch` is the precedent for per-harness dispatch in `runSpawn` (F-07/H-01).

### Summary

Make `pij spawn --harness pi|claude|copilot` the single, uniform way to spawn any harness from the CLI. Today the CLI rejects `pi`. This brings pi onto the same surface by dispatching on `HarnessKind` inside `runSpawn`: pi reuses the existing **pure** `buildSpawnCommand` + `TmuxAdapter.newWindow` and lets the child self-register (no daemon, no bind); claude/copilot keep their existing daemon-bound path untouched.

### Goals

- One CLI verb spawns all three harnesses with the same surface (`--harness`, `--task`, `--model`).
- pi joins as just another `HarnessKind` — no new command, no new architecture.
- Adding a future harness = add an adapter branch + a union entry, not a parallel door.
- Zero regression to claude/copilot spawn + bind.

### Non-Goals

- ~~No `--layout split` for CLI pi spawn~~ — **superseded during impl (D-02)**: the CLI tracks the split cap via the **registry**, not in-session, so pi reuses the same split layout as claude/copilot. More uniform; no deferral needed.
- **No `pij adopt --harness pi`** — pi self-adopts in-process; CLI-adopting an existing pi pane stays out of scope.
- **Not removing the in-process `pij_spawn` tool** — it stays for pi-mode; both doors share the pure builder.
- No copilot/pi branch-mode, no daemon changes for pi (pi never touches the daemon).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-control-plane` | existing | **modify** | Widen the spawn surface to accept pi; dispatch the pi launch (pure builder + tmux window, no bind) |
| `pij-messaging` | existing | **consume** | Reuse `resolveSelf` (caller pij-id → `PIJ_ANNOUNCE_TO`) and the registry; no contract change |

### Testing Strategy

- **Approach**: Full TDD on the **pure seams** (`core/spawn.test.ts` — vitest). NOTE (D-01): the bin `runSpawn` is impure and has **no** unit test (`cli.test.ts` does not exist); its wiring is covered by a **live smoke** (execution.log § Live smoke), not unit tests.
- **Rationale**: the change is pure-core argument parsing + a CLI dispatch branch — both unit-testable with the existing Fake ports.
- **Focus Areas**: `parseSpawnArgs` accepting pi; the `runSpawn` harness dispatch (pi path sets no `plannedHarnessSessionId`/snapshot); claude/copilot regression.
- **Excluded**: live tmux spawn (covered by existing integration smokes, not re-implemented here).
- **Mock Usage**: avoid mocks — use the existing in-memory Fake adapters (`FakeTmux`, in-memory registry), real fixtures.

### Documentation Strategy

- **Location**: in-code `SPAWN_USAGE` + control-plane help string; one line in `docs/how/pij.md`. No new doc files (auto-selected; KISS).
- **Rationale**: the surface change is a single new accepted value + usage text.

### Complexity

- **Score**: CS-2 (small)
- **Breakdown**: S=1, I=1, D=0, N=0, F=1, T=1
- **Confidence**: 0.85
- **Assumptions**: the pure `buildSpawnCommand` is reusable verbatim from the CLI; `resolveSelf` works from a control-plane caller (proven by Plan 020 `--branch`).
- **Dependencies**: `TmuxAdapter.newWindow` (already imported in `cli.ts:222`), `buildSpawnCommand`, `resolveSelf`, `filterByFolder`.
- **Risks**: see Risks table.
- **Phases**: 1 (Simple).

### Acceptance Criteria

- **AC-01**: `pij spawn --harness pi` opens a new tmux window running `pi`; the child self-registers and ready-pings — no daemon bind occurs, no `plannedHarnessSessionId` is set, no transcript snapshot is taken.
- **AC-02**: `pij spawn --harness pi --task "<t>"` delivers the task via `PIJ_SPAWN_TASK` env (never a positional prompt) — no "Agent is already processing" race.
- **AC-03**: `pij spawn --harness pi --model <m>` threads `PIJ_SPAWN_MODEL`; omitted → default model.
- **AC-04**: claude and copilot spawn paths are byte-for-byte unchanged — existing bind/regression tests stay green (copilot still sets `plannedHarnessSessionId`; claude still snapshots transcripts).
- **AC-05**: a CLI-spawned pi peer's `PIJ_ANNOUNCE_TO` is the resolved caller pij-id (via `resolveSelf`); an unresolved caller → empty (child fresh-boot announces).
- **AC-06**: `--harness pi` no longer errors; `SPAWN_USAGE` + the control-plane help advertise `pi|claude|copilot`.
- **AC-07**: a pi spawn creates **no** pending daemon descriptor and does **not** auto-start the daemon (pi never needs it).
- **AC-08** *(revised during impl — discovery D-02)*: pi reuses the **same split layout** as claude/copilot (registry-tracked pane cap; `cli.ts:394-409`), so the fleet shares one window. The original "window-only, reject split" framing was based on a misread of the *in-process* path; split is free here and more uniform. `pij spawn` has no `--layout` flag, so there is nothing to reject; the pi-branch guard rejects only `--branch` (pi cannot fork).

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Widening the accepted harness set accidentally routes pi into the daemon bind branch (regression / orphaned pending descriptor) | Med | High | Keep `CONTROL_HARNESSES` (daemon-bound) separate from a new `SPAWNABLE_HARNESSES`; the pi branch in `runSpawn` returns before any daemon/descriptor code (AC-07 test asserts no `plannedHarnessSessionId`). |
| `resolveSelf` returns nothing from a non-pi caller | Low | Low | Mirror `--branch`: unresolved → empty `PIJ_ANNOUNCE_TO`, child fresh-boots (AC-05). |

### Open Questions

None — the four dossier decisions are locked in Non-Goals + the task table.

### Workshop Opportunities

None — scope is settled by the dossier; no design exploration needed.

### Clarifications

#### Session 2026-06-28

- **Mode**: Simple (`--simple`; user: "kiss, dont boil ocean").
- **Round 1 auto-selected** (user delegated: "do explore and plan and validate then report ready"), grounded in repo convention — revisit any if desired:
  - Testing Strategy → **Full TDD** (pure core + existing vitest suites).
  - Mock Usage → **Avoid mocks** (use existing Fake ports).
  - Documentation Strategy → **No new doc files** (update in-code `SPAWN_USAGE` + one line in `docs/how/pij.md`).

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings + locked decisions |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No `[NEEDS CLARIFICATION]`; Round 1 recorded |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | No `docs/adr/` |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | TDD; test tasks precede impl tasks |
| G7 | Domain Completeness | PASS | Both domains existing; manifest covers all files |

### Summary

Add `pi` to the CLI's spawnable-harness set and dispatch on `HarnessKind` in `runSpawn`: pi builds the pure `buildSpawnCommand` and opens a tmux window via `TmuxAdapter.newWindow` (self-registering, no daemon/bind/descriptor); claude/copilot keep the existing daemon path. Brief via `PIJ_SPAWN_TASK`, model via `PIJ_SPAWN_MODEL`, announce-to via `resolveSelf`. Tests first, with claude/copilot regression locked.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/spawn.ts` | pij-control-plane | internal | `SPAWNABLE_HARNESSES` set + `parseSpawnArgs` accept pi + split-reject |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | `runSpawn` harness dispatch (pi branch) + `SPAWN_USAGE`/help text |
| `.pi/extensions/pij/core/spawn.test.ts` | pij-control-plane | internal (test) | parse + dispatch unit tests |
| `docs/how/pij.md` | pij-control-plane | internal (doc) | one-line: spawn now accepts pi |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | pi self-registers at boot; needs no daemon bind (`core/session.ts:147-159`, daemon binds only when `plannedHarnessSessionId` set, `daemon/loop.ts:191`) | pi branch must set no `plannedHarnessSessionId`, take no snapshot, create no pending descriptor, not auto-start the daemon |
| 02 | High | The CLI is not a live `PijSession`, so `session.spawn()` is unavailable | Reuse the **pure** `buildSpawnCommand` + `TmuxAdapter.newWindow` (already in `cli.ts:222`) |
| 03 | Med | Both builders share `SpawnCommand`; both brief via `PIJ_SPAWN_TASK` | No new builder; pi branch is ~a dozen lines |
| 04 | Med | `resolveSelf` already used from a control-plane caller in Plan 020 `--branch` | Reuse it for `PIJ_ANNOUNCE_TO` |

### Implementation

**Objective**: `pij spawn --harness pi` works through the same CLI surface as claude/copilot, with pi self-registering and claude/copilot unchanged.
**Testing Approach**: Full TDD — write/extend the failing unit test, then implement, per task.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | Test: `parseSpawnArgs` accepts `--harness pi` (ok) and still rejects unknown harnesses; `--layout split` with `--harness pi` → typed reject | pij-control-plane | `.pi/extensions/pij/core/spawn.test.ts` | New tests fail against current code | AC-06, AC-08 |
| [x] | T002 | Impl: introduce `SPAWNABLE_HARNESSES = {pi, claude, copilot}`; `parseSpawnArgs` validates against it (keep `CONTROL_HARNESSES` for the daemon branch only); add the split-reject for pi | pij-control-plane | `.pi/extensions/pij/core/spawn.ts` | T001 green; claude/copilot parse unchanged | Per finding 01 — keep the two sets distinct |
| [x] | T003 | Test: `runSpawn` pi-branch builds via `buildSpawnCommand`, opens a window, sets `PIJ_ANNOUNCE_TO` (resolveSelf), `PIJ_SPAWN_TASK`, `PIJ_SPAWN_MODEL`; asserts **no** `plannedHarnessSessionId`, **no** pending descriptor, **no** daemon auto-start | pij-control-plane | `.pi/extensions/pij/cli.test.ts` | Tests fail against current code | AC-01,02,03,05,07 — use Fake ports |
| [x] | T004 | Impl: in `runSpawn`, dispatch on `HarnessKind` — `pi` → `buildSpawnCommand` + `TmuxAdapter.newWindow` (announceTo via `resolveSelf`+`filterByFolder`), return paneId/spawnId, skip daemon/descriptor entirely; claude/copilot → existing path unchanged | pij-control-plane | `.pi/extensions/pij/cli.ts` | T003 green | Per findings 02–04 |
| [x] | T005 | Test: regression — claude builds control command + snapshots; copilot sets `plannedHarnessSessionId` (existing assertions stay green) | pij-control-plane | `.pi/extensions/pij/cli.test.ts`, `core/spawn.test.ts` | Existing + new regression tests green | AC-04 |
| [x] | T006 | Update `SPAWN_USAGE` + control-plane help to `--harness pi\|claude\|copilot` (note pi = window-only); one line in `docs/how/pij.md` | pij-control-plane | `.pi/extensions/pij/cli.ts`, `docs/how/pij.md` | Help shows pi; doc mentions it | AC-06 |
| [x] | T007 | Gate: `harness checks` (typecheck → lint → test) all green | pij-control-plane | — | All sensors pass | KISS done-gate |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC | Covered by | Verified in (unit | smoke) |
|----|-----------|---------------------------|
| AC-01 (pi self-registers, no bind) | T004 | **smoke** — execution.log § Live smoke (pij-yjwp09 self-registered, no descriptor). Bin is impure (D-01). |
| AC-02 (task via PIJ_SPAWN_TASK) | T004 | **unit** `buildSpawnCommand` env test (pre-existing) + **smoke** (reviewer received task) |
| AC-03 (model threaded) | T004 | **unit** `buildSpawnCommand` env test (pre-existing) + **smoke** (ready-ping model=`@preset/glm-1m`) |
| AC-04 (claude/copilot unchanged) | T005 | **unit** — full suite green; pure paths untouched |
| AC-05 (announceTo via resolveSelf) | T004 | **smoke** — reviewer ready-pinged the orchestrator. `resolveSelf` itself unit-tested in discovery suite. |
| AC-06 (pi accepted, usage) | T001, T002, T006 | **unit** `parseSpawnArgs` accepts pi + usage text |
| AC-07 (no descriptor / no daemon) | T004 | **smoke** — no descriptor written, daemon not auto-started by the pi spawn (D-01: no unit). |
| AC-08 (pi reuses split layout) | T002, livePeerPanes test | **unit** `livePeerPanes` + `planControlSplit` tests |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| pi accidentally routed into daemon bind | Med | High | Distinct `SPAWNABLE_HARNESSES` vs `CONTROL_HARNESSES`; AC-07 asserts no bind artifacts |
| `resolveSelf` empty from non-pi caller | Low | Low | Empty `PIJ_ANNOUNCE_TO` → child fresh-boots (mirrors `--branch`) |
