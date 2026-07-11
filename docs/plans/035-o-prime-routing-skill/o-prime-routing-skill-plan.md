# o-prime routing skill — govern many agents in one repo via /pij prime
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-11
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context

📚 Incorporates findings from `research-dossier.md` (11 findings, 5 historical). Requirements are frozen in `requirements-spine.md` (**r4 — VALIDATED, CONVERGED** with the run-01 o-prime, pij-uec99o; seed-coverage map complete E×16/P×8/H×6). Architecture is fixed by `workshops/001-prime-route-architecture.md` (Contract Ready; o-prime **AGREED** on R1.2 fidelity, three notes folded; **Jordan's ack still pending — flips it to Approved**; validation finding M5). Workshop decisions are authoritative for this plan. Independent validation: `validations/o-prime-routing-skill-plan-validation.md` (Fable cold critic, 2026-07-11) — 1H/4M, four findings applied in-place (red-baseline repair → T003, war-stories path → workshop table, sibling-blindness exemption → T011, receipts.ts manifest row), M5 awaits Jordan.

### Summary

Implement the o-prime governance concept (proven in SecondCrack run-01) into the pij skill as one new progressive-disclosure route: a `prime` registry row whose module triages role by deterministic probes and hands each session exactly one rung of the route→role→ritual→reference ladder. Ship the portable payload (levers, ritual pages, templates, prime-flow schema, rewritten protocol) inside `skills/pij/references/prime/`, vendor the run-01 evidence base into this repo (the source repo becomes unavailable — standing ruling), and close the four SHIP-035 pij tooling gaps (P-01 dissolved lifecycle, P-02 spawn pinning, P-03 delivery-health, P-04 verify FX002) that a cold agent would otherwise hit undiagnosed.

### Goals

- A cold agent can stand up a working o-prime in an arbitrary repo using only what `/pij prime` routes it to (spine AC-0 — the governing outcome).
- The disclosure ladder exists as files with load rules; no session ever receives the whole doctrine (spine R1.3 anti-goal).
- The registry tells the truth about peers: dissolved ≠ crashed, pinned model+effort readable, wedged daemon distinguishable from busy peer, stale panes can't block delivery.
- Every run-01 receipt this work rests on survives in this repo (spine R8.5).

### Non-Goals

- P-07 baton primitive and P-08 deliver-to-seat: **own future ordinals** (spine R9 dispositions); the route teaches the convention + mandatory mitigations meanwhile.
- P-05 typing-aware buffering, P-06 control-command receipts: deferred with named mitigations.
- No changes to the-flow/builder (prime-flow sits above it), no new messaging fabric, no harness-repo (H-xx) fixes.
- No `pair`/`peer` route changes: workers ride them unchanged (R1.4).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-skill | existing | **modify** | New `prime` registry row + route module + `references/prime/` payload; `pij-skill-check` extension |
| pij-control-plane | existing | **modify** | P-01 close idempotency (daemon queue drain), P-02 spawn pinning surface, P-03 daemon-tick liveness, P-04 FX002 commit |
| pij-messaging | existing | **modify** | P-01 `dissolved` state in core types, P-03 delivery-health receipt field (extends plan-032 `ReceiptState`) |

### Testing Strategy

- **Approach**: Hybrid — TDD for all extension code changes (P-01/02/03/04; the repo's per-module `.test.ts` convention, fakes from `adapters/fakes.ts`); gate/checklist verification for skill text and payload (`pij-skill-check` pointer-integrity extension + the AC-0 cold-agent run as the end-to-end proof).
- **Rationale**: daemon/receipt code has live-incident regression history (FX001/FX002) — test-first there; markdown payload correctness is a parity/pointer property, not a unit-test property.
- **Focus Areas**: close/queue-drain idempotency, receipt staleness signal, spawn output contract, pointer integrity of the payload tree.
- **Excluded**: no unit tests for prose; no live-tmux tests beyond the existing integration smoke + one manual live smoke.
- **Mock Usage**: targeted — existing fake tmux runner/registry only (the FX002 regression pattern); no new mocking.

### Documentation Strategy

- **Location**: docs/how/ only — new `docs/how/pij-prime.md` (operator guide pointing into the payload) + a pointer row in `docs/how/pij.md`. The protocol reference itself ships inside the skill payload (`references/prime/protocol.md`, workshop D5-A).
- **Rationale**: matches the repo convention (every shipped feature has a docs/how entry); README does not document individual routes.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=1, N=1, F=0, T=1
- **Confidence**: 0.85
- **Assumptions**: plan 019's working tree lands (or is fenced) before extension edits begin; the o-prime peer stays reachable for the route-text review during this plan's execution window (conversation-time only — nothing shipped depends on it).
- **Dependencies**: `harness flow` CLI ambient (for the prime-flow schema's consumer); plan-032 receipt contract; FX001/FX002 invariants.
- **Risks**: see § Risks & Assumptions.
- **Phases**: 1 (Simple mode — Jordan's ruling, Clarifications 2026-07-11).

### Acceptance Criteria

1. **AC-01 (= spine AC-0) Cold-agent run**: a fresh agent in a neutral scratch repo (not this repo, not SecondCrack), given only `/pij prime` and a human naming one work item, stands up a government and takes the item to a briefed, canaried, preamble-ready orchestrator. Evidence is on-disk artifacts audited by a second cold reader: government scaffold, **canary record written at pass time**, **baton book whose first grant-log entry is real**, brief with structure-tree field, roster row (spine AC-0.1–0.4). The audit freezes+hashes its targets (R5.4).
2. **AC-02 Payload parity**: `just pij-skill-check` (extended) exits 0 — registry row ↔ `routes/prime.md` ↔ every pointer target under `references/prime/` exists; zero references to `/Users/jordanknight/games/SecondCrack` anywhere in `skills/pij/**` (R8.5 severance).
3. **AC-03 P-01**: a closed descriptor stays closed across a queued-event drain (regression test); `pij state` distinguishes `dissolved` from `dead`; re-close after resurrection is idempotent. Tests green.
4. **AC-04 P-02**: `pij spawn` output and the registry row carry the pinned model **and** effort; canary leg (b) is satisfiable by `pij list`/`state` read alone for model+effort (pane-footer probe demoted to fallback in `rituals/kickoff.md`). Tests green.
5. **AC-05 P-03**: a send receipt (or `pij state`) exposes daemon-tick staleness such that "queued >Ns with stale tick" is mechanically distinguishable from "queued, daemon ticking, peer busy" (INC-001 discriminator). Test simulates a wedged daemon. Tests green.
6. **AC-06 P-04**: FX002 changes committed; its named regressions (non-throwing stale-pane send, per-session tick isolation, honest unverified receipt) pass in CI.
7. **AC-07 Drift resolved**: `references/prime/protocol.md` describes the one-seat model (overseer optional), roles table has NEW rows (no run-01 content ported), and carries the R2.6 top-layer evidence rule; a grep for "overseer" as a required layer returns only the optional framing.
8. **AC-08 Evidence vendored**: every artifact in workshop § disposition table exists at its target; `vendored/` holds the frozen convergence record; levers byte-identical to upstream at vendor time (recorded hashes).
9. **AC-09 Fidelity review folded**: the o-prime's route-text review verdict (R1.2 standing engagement) is recorded in the plan folder and its blocking findings (if any) are resolved.
10. **AC-10 Operator docs**: `docs/how/pij-prime.md` exists and routes an operator to bootstrap/kickoff/batons/reports without restating them.

### Risks & Assumptions

| Risk | Notes |
|------|-------|
| 019 working-tree collision on `daemon.ts`/`cli.ts`/`types.ts` | T001 gates extension edits behind a recorded sequencing decision (land vs fence) |
| Distillation fidelity loss (bootstrap/kickoff → rituals) | o-prime R1.2 review (T018) is the check; frozen sources in `vendored/` enable diffing |
| Daemon staleness after extension edits | C6 rule: restart daemon post-edit (T016 smoke includes it) |
| P-03 signal shape bikeshed | Decision pre-made here: expose `lastTickAt` via the receipt/`state` surface; smallest honest signal (workshop Q-class decision, not a new workshop) |
| AC-01 needs a human in the loop | The validation run is conversation-time with Jordan naming the work item; scriptable parts (artifact audit) are mechanical |

### Open Questions

None blocking. (P-01 graceful-degrade clause exists if scope pressure demands — spine R9.1; invoke only with a recorded ruling.)

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| prime route & payload architecture | Storage Design + Integration Pattern | ✅ **Complete** — `workshops/001-prime-route-architecture.md` (Contract Ready, o-prime agreed) | resolved |

No further workshops: P-03's signal shape is decided above; everything else is mechanical against the workshop's tree.

### Clarifications

#### Session 2026-07-11

- Q: Workflow Mode? → A: **Simple** (Jordan — single-phase inline tasks; ceremony kept down despite CS-3/two-domain span).
- Q: Testing strategy? → A: **Hybrid** (TDD for extension code, gates/checklists for skill text).
- Q: Mock usage? → A: **Targeted** (existing fakes only).
- Q: Documentation? → A: **docs/how/ only**.
- Standing rulings inherited: SecondCrack unavailable post-035 (spine header ruling → R8.5); workshop decisions authoritative; o-prime engaged for route-text review + AC-0 questions only.

## Planning Seam

_Refinement opportunities still open — recorded as evidence; none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings + task surfaces |
| workshops/001-prime-route-architecture.md | y | **authoritative**: tree, disposition table, load rules, gates |
| requirements-spine.md (r4) | y | requirements + AC-0; seed-coverage map is the traceability anchor |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | Round-1 answered; no critical markers |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all required sections present |
| G6 | Testing Alignment | PASS | Hybrid: P-fix tasks are test-first; skill tasks carry gate/checklist criteria |
| G7 | Domain Completeness | PASS | 3 existing domains mapped; manifest covers all task files |

### Summary

One phase, four fronts, strict internal ordering: (1) vendor the run-01 payload + evidence per the workshop's disposition table; (2) write the route text (rung 1 module, rituals, templates, protocol rewrite) against the fixed tree, gate-checked by the extended `pij-skill-check`; (3) close the four registry-truth gaps in the extension (test-first, after the 019 sequencing decision); (4) prove it — o-prime fidelity review, then the AC-0 cold-agent run as the terminal acceptance. Expected outcome: `/pij prime` ships as the eighth route and a cold agent can bootstrap governance anywhere.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| skills/pij/SKILL.md | pij-skill | contract | +`prime` registry row, aliases, CLI-verb coverage |
| skills/pij/references/routes/prime.md | pij-skill | internal | rung-1 triage module (new) |
| skills/pij/references/prime/** | pij-skill | internal | payload: levers, schema, rituals/, templates/, protocol.md, exemplars/ (new) |
| harness/scripts/pij-skill-check.sh | pij-skill | internal | pointer-integrity + prime-row parity extension |
| docs/plans/035-o-prime-routing-skill/vendored/** | pij-skill | internal | frozen evidence base (R8.5) |
| .pi/extensions/pij/core/types.ts | pij-messaging | contract | +`dissolved`, +effort field, +receipt staleness (additive, migration-safe) |
| .pi/extensions/pij/core/session.ts | pij-messaging | internal | close-path idempotency |
| .pi/extensions/pij/daemon.ts | pij-control-plane | internal | queue-drain close guard, tick-liveness surface |
| .pi/extensions/pij/core/receipts.ts | pij-messaging | internal | P-03 staleness field on the receipt path (extends plan-032 contract) |
| .pi/extensions/pij/core/spawn.ts | pij-control-plane | internal | effort pinning + spawn report |
| .pi/extensions/pij/cli.ts | pij-control-plane | internal | spawn/list/state output: model+effort+staleness |
| .pi/extensions/pij/adapters/fs-registry.ts | pij-messaging | internal | dissolved persistence |
| docs/how/pij-prime.md | pij-skill | internal | operator guide (new) |
| docs/how/pij.md | pij-skill | internal | pointer row |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Plan 019 mid-build shares `daemon.ts`/`cli.ts`/`types.ts` with the P-fixes (~1,850 uncommitted lines) | T001 sequencing gate before any extension edit |
| 02 | High | P-04 already fixed (FX002 complete + regressions) but uncommitted | T015 verify-and-commit, not re-implement |
| 03 | High | P-03 half-shipped: plan-032 `ReceiptState` exists; missing only daemon-tick staleness | T014 extends receipts, does not redesign them |
| 04 | High | P-02 half-shipped: `boundModel` captured post-inference; no effort field anywhere | T013 adds effort pin + surfaces both pre-inference |
| 05 | High | `pij-skill-check` + symlink deploy already exist (plan 030) | T003/T012 extend, never rebuild |
| 06 | Medium | Builder skill ships its schema via references + `--schema` | T002 copies the pattern for prime-flow.schema.json |

### Implementation

**Objective**: ship `/pij prime` end-to-end — payload, route text, registry-truth fixes, cold-agent proof — in one phase.
**Testing Approach**: Hybrid (per business half): T013–T016 test-first with fakes; skill/payload tasks verified by the extended parity gate; AC-01 run is the terminal proof.

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | 019 sequencing gate: land/commit plan-019 tree or record a fence ruling in the execution log; snapshot `git status` of shared files | pij-control-plane | (repo) | Shared files clean OR ruling recorded; no extension edit before this closes | Finding 01 |
| [ ] | T002 | Vendoring sweep per workshop § disposition table (now 14 rows incl. war-stories testimony): verbatim levers+schema, frozen sources+convergence record+`pij-prime-war-stories.md` → `vendored/`, hashes recorded | pij-skill | skills/pij/references/prime/, docs/plans/035-…/vendored/ | Every row's target exists; levers byte-identical (hashes in execution log) | AC-08; do FIRST — source repo is transitional |
| [ ] | T003 | `SKILL.md`: +`prime` registry row, aliases ("stand up an o-prime", "govern this repo"), CLI-verb coverage note. **Repair the RED baseline first**: `pij-skill-check` is exit 1 today — the `watch` registry row (SKILL.md:29) has no module and its "(shipped… no route module)" marker misses the script's pending-row regex (`pij-skill-check.sh:18`); teach the script the marker or move watch out of the table | pij-skill | skills/pij/SKILL.md, harness/scripts/pij-skill-check.sh | `pij-skill-check` exit 0 incl. watch-row handling AND new prime row; registry row renders per workshop D1-A | Validation HIGH: baseline was already red; record pre-fix exit 1 in execution log |
| [ ] | T004 | `routes/prime.md` rung-1 module per workshop contract table (job line, deterministic role-triage probes, ritual index, prime invariants incl. R9.8 mitigation, preconditions, failure modes) | pij-skill | skills/pij/references/routes/prime.md | ≤90 lines; every pointer resolves; carries NO doctrine (load rule 2) | Workshop § prime.md contract |
| [ ] | T005 | `rituals/bootstrap.md`: distill upstream bootstrap (seat → per-repo derivation table → scaffold → levers incl. lever-2 generation → intake → steady state → recovery) | pij-skill | skills/pij/references/prime/rituals/bootstrap.md | ≤90 lines; derivation table + recovery playbook intact; SecondCrack column labeled as worked example | |
| [ ] | T006 | `rituals/kickoff.md`: distill runbook steps 1–16 + deviations + E-16 yield rules; teardown (13) + adoption (16) inline; canary leg (b) = registry read with pane-footer fallback | pij-skill | skills/pij/references/prime/rituals/kickoff.md | ≤90 lines; steps 1–16 + 3-leg canary + E-16 all present | Updated by T013's new surface |
| [ ] | T007 | `rituals/batons.md` (book-as-convention lifecycle + reclaim/self-grant/breach handling) and `rituals/reports.md` (contract fields, verify-one-hop-up, digest channel R2.6) | pij-skill | skills/pij/references/prime/rituals/ | ≤90 lines each; grant-log line format specified; report fields = spine R5.1 | P-07 meanwhile-convention |
| [ ] | T008 | `templates/`: spine.md (roster+fences shapes+sequencing-watch), baton-book.md, stream-brief.md (+structure-tree field), orient-local.md (authoring checklist incl. mandatory-orient-reads block) | pij-skill | skills/pij/references/prime/templates/ | 4 skeletons; zero run-01 content rows; o-prime fidelity notes 2+3 satisfied | Workshop load rule 5 |
| [ ] | T009 | `protocol.md`: rewrite o-prime.md — one-seat model, overseer-optional, NEW roles rows, escalation/report/window-naming shapes kept, R2.6 evidence rule | pij-skill | skills/pij/references/prime/protocol.md | ≤170 lines; AC-07 grep clean; shapes-not-rows verified against R10.3 | |
| [ ] | T010 | `exemplars/`: canary-record.md (from canary-s017) + grant-log.md (first grant, self-grant, reclaim, breach — labeled history) + mine war-stories for 2–3 short story-excerpts attached to the rules they paid for (stories 1/3/8/9 map to canary-at-pass-time, dissolved-state, seat-not-persona, compile-at-yield) | pij-skill | skills/pij/references/prime/exemplars/ | Files exist; ids intact + labeled; each excerpt cites its rule | AC-0.4 teaching aids; tone source for T004–T009: "the rules read arbitrary without the stories" |
| [ ] | T011 | Extend `pij-skill-check`: prime row ↔ module ↔ payload pointer-integrity sweep + SecondCrack-path severance grep + soft line-budget warn. Includes a **scoped sibling-blindness exemption**: `prime.md`'s worker-redirect row (workshop probe ④ mandates naming `pair`/`peer`) is allowed; sibling references anywhere else in the module still error | pij-skill | harness/scripts/pij-skill-check.sh | Exit 0 on complete tree; deliberately broken pointer → exit 1 (negative test); redirect row passes, a second sibling ref fails | AC-02; validation M3 — T004 authors the redirect knowing the exemption exists |
| [ ] | T012 | Wire T002–T011 checks: run extended gate + fix all findings | pij-skill | (gate) | `just pij-skill-check` exit 0 | Checkpoint before code work |
| [ ] | T013 | **TDD** P-02: effort field on descriptor + spawn pins/reports model+effort + `pij list`/`state`/spawn output carry both | pij-control-plane / pij-messaging | core/types.ts, core/spawn.ts, cli.ts + tests | Tests first (spawn output contract, registry row); AC-04 criteria green | Additive, migration-safe |
| [ ] | T014 | **TDD** P-03: daemon-tick `lastTickAt` surfaced; receipts/`pij state` expose staleness; wedged-daemon simulation test | pij-control-plane / pij-messaging | .pi/extensions/pij/daemon.ts, .pi/extensions/pij/core/receipts.ts, .pi/extensions/pij/cli.ts + tests | AC-05 discriminator test green; extends (never breaks) plan-032 contract | Fakes only |
| [ ] | T015 | **TDD** P-01: `dissolved` state + close idempotency across queue drain; `pij state` reads dissolved ≠ dead | pij-messaging / pij-control-plane | core/types.ts, core/session.ts, daemon.ts, fs-registry.ts + tests | AC-03 regression (s019 resurrection scenario) green | Pairs with T014 (registry-truth class) |
| [ ] | T016 | P-04 verify-and-close: commit FX002 (+FX001 doc set), confirm named regressions in suite, restart daemon (C6), live smoke: spawn→send→close round-trip | pij-control-plane | git, live tmux | AC-06; smoke transcript in execution log | Commit message cites FX002 |
| [ ] | T017 | `docs/how/pij-prime.md` + pointer row in `docs/how/pij.md` | pij-skill | docs/how/ | AC-10; routes without restating (grep: no duplicated ritual prose) | |
| [ ] | T018 | o-prime route-text fidelity review (R1.2): send payload pointers to pij-uec99o, fold verdict, record in plan folder | pij-skill | reviews/ | AC-09; blocking findings resolved or ruled | Standing engagement |
| [ ] | T019 | AC-0 cold-agent validation run: neutral scratch repo, fresh agent, Jordan names one item; freeze+hash audit of resulting government by a second cold reader | pij-skill | scratch repo + reviews/ | AC-01 evidence bundle in plan folder (scaffold, canary-at-pass-time, real grant-log entry, brief w/ tree, roster) | Terminal acceptance |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T019 (enabled by T002–T017) | frozen+hashed audit bundle, second cold reader |
| AC-02 | T011, T012 | `just pij-skill-check` exit 0 + negative test |
| AC-03 | T015 | resurrection regression test |
| AC-04 | T013 | spawn/list output contract tests |
| AC-05 | T014 | wedged-daemon simulation test |
| AC-06 | T016 | CI suite + commit |
| AC-07 | T009 | grep + R10.3 checklist in execution log |
| AC-08 | T002 | disposition-table sweep + recorded hashes |
| AC-09 | T018 | review record in plan folder |
| AC-10 | T017 | file exists + no-restatement grep |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 019 collision on shared extension files | Medium | High | T001 hard-gates extension edits; skill-text tasks (T002–T012) proceed regardless |
| Distillation loses a load-bearing rule | Medium | High | Frozen sources in `vendored/` + T018 o-prime review + line budgets force selection, not truncation |
| AC-01 run stalls on an unshipped P-gap | Low | Medium | P-01..P-04 land before T019; P-07/P-08 mitigations are IN the rituals text |
| Descriptor schema change breaks existing peers | Low | High | Additive-only fields (repo convention, types.ts:109); migration-safe tests in T013/T015 |
| o-prime unavailable at T018 | Low | Low | Review is non-blocking after one nudge; Jordan may waive (recorded ruling) |
