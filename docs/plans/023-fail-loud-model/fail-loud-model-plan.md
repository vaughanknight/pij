# Fail-Loud Model Resolution
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-06-28
**Status**: READY
**Spec source**: unified (this file)

📚 Incorporates findings from `research-dossier.md`

## Business Specification

### Research Context
Research (`research-dossier.md`, Deep / 3 workers) established: no model validation exists today (`--model` passes straight through — `cli.ts:88-90` admits it); the bad-model error surface is **non-uniform** (claude fails at spawn-stderr; pi/codex/copilot only on first inference); only **pi** has a clean registry (`~/.pi/agent/models.json` + `pi --list-models`); the daemon **already** pushes creator notices on boot (`buildBoundNotice`/`buildFailedNotice`/`notify`/`fail`) but goes **mute post-bind** (`observeActivity` @`loop.ts:97-111`); and deterministic-bind binds without proving the first inference (`loop.ts:185-200`). Prior dogfood feedback (`019/control-plane-feedback.md`) already named all three asks the **#1 theme** and added the requirement to surface the **bound** model, not the requested one.

### Summary
Make pij's model handling **fail loud instead of silent**. Three layers: (1) `pij models` discovers valid model ids so agents stop grepping config; (2) spawn-time validation warns + suggests on an unknown `--model` (never blocking the spawn); (3) the daemon extends its existing boot-phase creator-notify across the **whole life** of a session — pushing a stalled/dead transition (including the bad-model first-inference 400) to the creator (`spawnedBy`/`PIJ_PARENT_ID`) with a machine-stable reason. Truly-dead routes to the human; **no auto-heal**.

### Goals
- An agent/human can discover a valid model id (`pij models`) without grepping `~/.pi/agent/models.json`.
- A typo'd/unknown `--model` produces a loud warning + closest suggestion at spawn — not a silent default.
- A bound session that dies or stalls **tells its creator** with a machine-stable reason, so agents never poll or canary to find out.
- The **bound** model (what's actually running) is visible in `pij state`/`list`, not just the requested one.

### Non-Goals
- **No auto-heal**: no restart, no fallback-model substitution, no retry budget — truly-dead is a human decision.
- No blocking spawn on validation or network (spawn returns the pij-id immediately — invariant).
- No reverse-engineering claude's opaque `models_cache.json`; no live network model-list fetch for copilot/codex in this plan.
- Not full per-harness discovery parity — pi-first, others best-effort with an honest "unverified" fallback.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| `pij-control-plane` | existing | **modify** | Model-registry adapter, spawn-time validation, daemon whole-life detection + creator push, first-inference bind gate, `pij models` verb, bound-model capture |
| `pij-messaging` | existing | **modify** | `SessionDescriptor` schema extension (`boundModel?`, `failureReason?`); reuses the shipped `liveness()` primitive |

### Testing Strategy
- **Approach**: Full TDD — tests precede implementation for every pure unit.
- **Rationale**: the repo is hexagonal (pure core + injected fakes, 891 vitest tests); research mandates pure classifiers.
- **Focus Areas**: fuzzy match, registry parse, `validateModel`, per-harness bad-model detectors, death-reason classifier, notice builders, daemon push-on-transition + bind-gate (via fakes).
- **Excluded**: live harness inference (cost); the real `~/.pi/agent/models.json` is read via an injected fs seam in unit tests (fixtures), real file only in the smoke.
- **Mock Usage**: targeted fakes at the existing ports/seams (`DeliveryPort`, `RegistryPort`, `DaemonPorts`) — no ad-hoc mocking.

### Documentation Strategy
- **Location**: `docs/how/pij.md` (the established pij guide).
- **Rationale**: documents the new `pij models` verb, the validation warning, and the fail-loud heartbeat alongside existing pij CLI docs.

### Complexity
- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=1, F=0, T=2 (sum 7)
- **Confidence**: 0.80
- **Assumptions**: pi's `models.json` shape is stable; the bad-model error is matchable by a broad pattern (status 400/429 + error/`isError`) without a golden string; `liveness()`/notify pattern are reused as-is.
- **Dependencies**: shipped `liveness()` (`state.ts:33-42`); existing `notify`/`buildFailedNotice` (`binding.ts`, `loop.ts`); `PIJ_PARENT_ID` (already wired).
- **Risks**: see Risks table. **Phases**: 1 (Simple — user-elected lean ceremony; CS-3 keeps it single-phase with grouped tasks).

### Acceptance Criteria
- **AC-01**: `pij models [--harness <h>] [filter] [--json]` lists pi's models (id/name/provider) and fuzzy-resolves `"fugu ultra"` → `fugu-ultra`; best-effort harnesses (claude/copilot/codex) return what they can and **honestly label unverified** rather than fabricating.
- **AC-02**: spawning with an unknown `--model` prints the closest suggestion + a warning **and still returns a pij-id** (spawn never blocks).
- **AC-03**: a bound session that goes **dead** (pid gone) or **stalled** (working + quiet > `STALE_AFTER_MS`) pushes a notice to its creator (`spawnedBy`) **exactly once per transition**, carrying a machine-stable `failureReason`.
- **AC-04**: a bad-model failure is detected from the **pane** per-harness (claude's `API Error` shows in-pane → `classifyReadiness "dead"`; pi/codex/copilot 400 on the **init-inject turn**, `loop.ts:168-174`) and surfaced to the creator as a death with reason `model-not-supported`; on the deterministic-bind path the bound-notice is **gated on the init-inject turn not erroring**, so such a session is no longer reported healthy.
- **AC-05**: `pij state`/`pij list` (and `--json`) show the **bound** model and any `failureReason`; a requested≠bound mismatch surfaces a warning.
- **AC-06**: no auto-heal — the daemon never restarts/substitutes; truly-dead is only ever relayed to the human via the creator push.
- **AC-07**: all pure classifiers (fuzzy match, `validateModel`, death-reason, per-harness detectors, notice builders) are unit-tested with fakes; the spawn-returns-id-immediately invariant is unchanged.

### Risks & Assumptions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| No golden "model not supported" string captured live | Med | Med | Match broadly (status 400/429 + error/`isError`/error-event) per harness; POC by inducing one bad spawn (AC-04 smoke) |
| codex/copilot have no registry → discovery stale | Med | Low | pi-first; copilot seeded from pi's `github-copilot` provider section; others labelled best-effort/unverified |
| First-inference gate regresses fast-bind for good models | Low | High | Gate is additive + cheap; tested via fakes that a good model still binds immediately (AC-07) |
| Duplicate creator notices (push spam) | Med | Low | Once-per-transition latch (mirror the `settled` flag pattern in `fail()`) |

### Open Questions
_None blocking — the five "decisions still required" from research are resolved by the Round-1 answers (Simple, pi-first best-effort, warn-don't-block, TDD)._

### Workshop Opportunities
_None — the design is settled by the dossier + clarifications; no topic needs a separate workshop before building._

### Clarifications
#### Session 2026-06-28
- **Workflow Mode** → Simple (lean ceremony; single-phase grouped tasks).
- **Harness scope** → pi-first, others best-effort (honest "unverified" fallback).
- **Validation posture** → warn + suggest, never block spawn.
- **Testing** → Full TDD. **Mock usage** → targeted fakes at existing seams. **Docs** → `docs/how/pij.md`.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings 01–07 |
| workshops/*.md | n | — |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | All Round-1 questions answered; no `[NEEDS CLARIFICATION]` remain |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` |
| G3 | Architecture | PASS | Honors the hexagonal pure-core/impure-adapter split per `docs/project-rules/harness.md` |
| G4 | ADR Compliance | N/A | No `docs/adr/` |
| G5 | Structure | PASS | All required sections present + populated |
| G6 | Testing Alignment | PASS | TDD: every test task precedes its impl task; ACs are measurable |
| G7 | Domain Completeness | PASS | Both domains existing in registry; manifest covers all referenced files; no NEW domains |

### Summary
Add a model-registry/fuzzy-match core + `pij models` verb (pi-first), wire warn-don't-block validation into the spawn path, and extend the daemon's existing boot-phase creator-notify into a whole-life stalled/dead push — including a per-harness bad-model detector and a functional first-inference bind gate — persisting the bound model and a machine-stable failure reason on the descriptor. One Simple-mode phase, TDD, grouped by the three layers.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/models/registry.ts` (NEW) | pij-control-plane | internal | Pure per-harness model-registry read (pi JSON; claude aliases; copilot seed-from-pi; codex snapshot) |
| `.pi/extensions/pij/core/models/match.ts` (NEW) | pij-control-plane | internal | Pure fuzzy closest-id match |
| `.pi/extensions/pij/core/models/validate.ts` (NEW) | pij-control-plane | internal | Pure `validateModel` → ok \| {unknown, suggestion} |
| `.pi/extensions/pij/core/models/*.test.ts` (NEW) | pij-control-plane | internal | TDD units (fixtures via injected fs) |
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | `SessionDescriptor` gains `boundModel?`, `failureReason?` |
| `.pi/extensions/pij/core/binding.ts` | pij-control-plane | internal | `buildStalledNotice`/`buildDeadNotice` + reason (beside `buildFailedNotice`) |
| `.pi/extensions/pij/core/harness/*.ts` | pij-control-plane | internal | Pure per-harness bad-model detectors (claude spawn-stderr; others first-inference) |
| `.pi/extensions/pij/core/daemon/loop.ts` | pij-control-plane | internal | Functional first-inference gate on the deterministic-bind path (anchored on the init-inject turn); machine-stable reason on the `fail()`/dead-pane path; bound-model capture (pure parts stay pure) |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | **Impure tick: the whole-life stalled/dead push** — compute `liveness()`/`isStalled()` on bound sessions, `notify(spawnedBy,…)` once per transition (the push location F3 requires; `observeActivity` stays pure) |
| `.pi/extensions/pij/core/spawn.ts` | pij-control-plane | internal | Validation hook at parse (warn + continue) |
| `.pi/extensions/pij/core/cli.ts` | pij-control-plane | internal | `pij models` verb; surface bound model + reason in `state`/`list` |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | Impure bin: wire `pij models`, spawn validation warning |
| `docs/how/pij.md` | (doc) | — | Document `pij models`, validation, fail-loud heartbeat |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | High | Bad-model error surface is non-uniform (claude=spawn-stderr; pi/codex/copilot=first-inference) [F-07] | Per-harness pure detectors, not one detector (T009/T010) |
| 02 | High | Only pi has a clean registry; copilot seedable from pi's `github-copilot` section; codex/claude best-effort [F-02..06] | pi-first registry adapter; honest unverified fallback (T001/T002) |
| 03 | High | Surface the **bound** model, not requested (else amplifies the bug) [H-02] | Add `boundModel?`; capture footer→bound; mismatch warn (T007/T008, T011/T012) |
| 04 | High | Spawn must return id immediately — never block on validation [H-03] | Warn + suggest, continue (T005/T006) |
| 05 | Med | Deterministic-bind binds without proving first inference [F-10] | Functional first-inference gate (T009/T010) |
| 06 | Med | No `reason` field on descriptor [F-12] | Add `failureReason?` + machine-stable classifier (T007/T008) |
| 07 | Med | Daemon already notifies creator on boot; `liveness()` shipped [F-08, F-11] | Reuse notify pattern. **Push lives in the IMPURE daemon tick (`daemon.ts:96`), NOT pure `observeActivity`** — that function has no delivery port and returns `null` for non-busy/ready, so it can't push and can't see a dead session (validate finding F3) (T011/T012) |
| 08 | High | Deterministic-bind binds before any turn; the **init-inject turn** (`loop.ts:168-174`) is the real first inference where a bad model 400s | Gate the deterministic-bind *bound-notice* on the init-inject turn not erroring (pane-detected); plain claude already routes bad-model `API Error` → `classifyReadiness "dead"` → existing `fail()` (validate finding F1/F2) (T009/T010) |

### Implementation

**Objective**: Ship the three fail-loud layers (discovery · spawn validation · daemon whole-life push) as one TDD phase, reusing the existing notify/liveness machinery.
**Testing Approach**: Full TDD — each test task lands (and fails) before its impl task; pure units use injected fs/ports fakes.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Test: pure model-registry read + fuzzy match (pi JSON parse → `{id,name,provider}[]`; `"fugu ultra"`→`fugu-ultra`; claude alias list; copilot seed-from-pi `github-copilot` section; codex snapshot; best-effort labelled) | pij-control-plane | `core/models/registry.test.ts`, `core/models/match.test.ts` | Tests written + red | Per finding 01, 02 |
| [ ] | T002 | Impl: `registry.ts` (pure parse, harness-aware) + `match.ts` (pure closest-id) | pij-control-plane | `core/models/registry.ts`, `core/models/match.ts` | T001 green | Pure; fs injected by caller |
| [ ] | T003 | Test: `pij models [--harness <h>] [filter] [--json]` output contract (table + json; fuzzy filter; unverified labelling) | pij-control-plane | `core/cli.test.ts` | Tests red | Per finding 02 |
| [ ] | T004 | Impl: wire `pij models` verb (core formatting + impure file read in bin) | pij-control-plane | `core/cli.ts`, `cli.ts` | T003 green; AC-01 | |
| [ ] | T005 | Test: pure `validateModel(model, known)` → `ok` \| `{unknown, suggestion}`; spawn with unknown model warns + suggests but still returns id | pij-control-plane | `core/models/validate.test.ts`, `core/spawn.test.ts` | Tests red | Per finding 04 |
| [ ] | T006 | Impl: `validate.ts` + wire warn-and-continue into the spawn path (never block) | pij-control-plane | `core/models/validate.ts`, `core/spawn.ts`, `cli.ts` | T005 green; AC-02 | |
| [ ] | T007 | Test: `SessionDescriptor` `boundModel?`/`failureReason?` + pure death-reason classifier (`model-not-supported`/`auth`/`quota`/`stalled`/`dead`/`unknown`) | pij-messaging | `core/state.test.ts` (or new) | Tests red | Per finding 03, 06 |
| [ ] | T008 | Impl: add descriptor fields (additive) + pure `classifyDeathReason` | pij-messaging | `core/types.ts`, `core/state.ts` | T007 green | No regression to existing fields |
| [ ] | T009 | Test: per-harness bad-model detectors (pure, on **pane text** — `capturePane`, not process stderr) — claude `API Error` (→ also a `classifyReadiness "dead"` case); pi/codex/copilot first-inference 400/`isError`; + the gate leaves a good model binding immediately | pij-control-plane | `core/harness/*.test.ts`, `core/daemon/loop.test.ts` | Tests red | Per finding 01, 05, 08; AC-04, AC-07 |
| [ ] | T010 | Impl: pure detectors + functional first-inference gate on the **deterministic-bind path, anchored on the init-inject turn** (`loop.ts:168-174`): defer the bound-notice until that turn completes without a model-error in the pane; on error → `fail()` with reason `model-not-supported` instead of binding. Plain claude already reaches `fail()` via the dead-pane/`readiness "dead"` path — give it the machine-stable reason | pij-control-plane | `core/harness/*.ts`, `core/daemon/loop.ts` | T009 green; AC-04 | Gate is async (daemon-side) — never blocks the spawn call |
| [ ] | T011 | Test: `buildStalledNotice`/`buildDeadNotice` (pure, keyed on `spawnedBy` + reason); the **impure daemon tick** (`daemon.ts`) computes `liveness()`/`isStalled()` on bound sessions and pushes once per transition (latch); bound-model capture (footer→bound; mismatch warns) | pij-control-plane | `core/binding.test.ts`, `daemon.ts` (or a thin pure helper it calls) | Tests red | Per finding 03, 07; AC-03, AC-05 |
| [ ] | T012 | Impl: notice builders (pure) + wire the stalled/dead push into the **impure `daemon.ts` tick** (it holds the delivery port; `observeActivity` stays pure) with a **per-bound-session latch** (descriptor `lastFailurePushAt?` **or** a daemon-side `Set<SessionId>`) so each transition pushes exactly once; + bound-model capture | pij-control-plane | `core/binding.ts`, `core/types.ts`, `.pi/extensions/pij/daemon.ts` | T011 green; AC-03, AC-06 | No auto-heal — push only |
| [ ] | T013 | Impl: surface `boundModel` + `failureReason` in `pij state`/`pij list` (+ `--json`) | pij-control-plane | `core/cli.ts` | AC-05 met in output | |
| [ ] | T014 | Docs + smoke: update `docs/how/pij.md` (pij models, validation, fail-loud heartbeat); extend integration smoke — **mock `capturePane`/transcript to surface a model-error line** (no live harness), assert the daemon reaches `fail()` with reason `model-not-supported` and pushes to the creator | pij-control-plane | `docs/how/pij.md`, smoke test | Docs updated; smoke asserts AC-04 push via mocked pane | Real `~/.pi/agent/models.json` only in the discovery smoke |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T001, T002, T003, T004 | `pij models` output + fuzzy unit tests |
| AC-02 | T005, T006 | spawn-unknown-model warns + returns id |
| AC-03 | T011, T012 | once-per-transition creator push (fakes) |
| AC-04 | T009, T010, T014 | per-harness detector units + bad-model smoke |
| AC-05 | T011, T012, T013 | bound-model surfaced in state/list |
| AC-06 | T012 | push-only (no restart/substitute path exists) |
| AC-07 | T001, T005, T007, T009, T011 | pure-unit coverage; bind-fast unchanged |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| No golden 400 string | Med | Med | Broad pattern per harness; induce-bad-spawn smoke (T014) |
| Discovery staleness (codex/copilot) | Med | Low | pi-first; seed copilot from pi; label unverified |
| Bind-gate regresses fast-bind | Low | High | Additive gate; AC-07 test proves good models still bind |
| Duplicate creator notices | Med | Low | Once-per-transition latch (T012) |
