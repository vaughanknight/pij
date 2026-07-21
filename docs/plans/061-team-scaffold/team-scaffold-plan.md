# Team-scaffold building blocks — deterministic stream, dispatch & canary verbs
**Mode**: Full
**Plan Version**: 1.1.0 — folds cold-validation findings V-01 (platform coupled-write law) + V-02 (canary wrong-arg coverage)
**Created**: 2026-07-20
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

### Research Context
📚 Incorporates findings from research-dossier.md (F-01..F-12, H-01..H-05) and the two-government prime survey (`inputs/team-scaffold-survey-synthesis-2026-07-20.md`). Workshops 001/002 are authoritative (provisional pending Jordan's review).

### Summary
Team formation today is prose ritual: worktree/branch/base-SHA setup is 5+ hand steps repeated per stream (with an observed stale-SHA bug class), briefs are delivered with no proof of parse, canary is unenforceable prose, and allocations/fences live in hand-edited tables that diverge (INS-004). This plan ships the **building-block verbs** that make stream stand-up deterministic, evidenced, and queryable: `pij stream create/close`, `pij fence set/show`, `pij dispatch`/`pij ack` (brief-ack receipts), `pij canary`, plus `Project.autonomy` — so a prime constructs streams mechanically and a PM inhabits them (original-ask ruling 5), with `pij team scaffold` composition following in a v2 plan once the blocks are proven.

### Goals
- One evidenced verb replaces the hand-typed worktree/branch/SHA/allocation sequence; base SHA resolved at create-time
- "I sent it" becomes an artifact: dispatch receipts prove delivery + parse + declared runtime
- Canary legs (a)+(b) become a recorded, refusing verb; leg (c) stays judgment
- Allocations and fences become queryable store records with spine attribution
- Autonomy policy (`power-through | gated`) inherited as data, not brief prose
- Every verb is fail-loud and self-evidencing — no exit-0 no-op path (the 036 lesson as design law)

### Non-Goals
- `pij team scaffold --manifest` composition verb (v2 plan, after blocks prove out — W-01 D1-A)
- Deps boot / `/builder` flow setup inside pij (PM's job — ruling 5)
- Canary leg (c) automation (comprehension test stays human/agent judgment)
- Model *choice* automation (Jordan's standing ruling: varies by task)
- Fixing the s051 twin-identity bug (separate stream; we consume its contract and record defensively)
- Enforcement of fences/batons (descriptive-sensor law stands; safety stays derived)

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-orchestration | existing | **modify** | Allocation/Fence record stores + stream/fence verb semantics (baton family precedent) |
| pij-messaging | existing | **modify** | brief-ack receipt kind alongside `send-delivered-receipt`; dispatch records |
| pij-control-plane | existing | **modify** | CLI verb registration (three-table + switch), canary identity reads |
| pij-skill | existing | **modify** | `/pij` route + prime ritual updates referencing the new verbs; manifest template doc |

### Testing Strategy
- **Approach**: Hybrid — tests-first (TDD) for store/record logic, receipt state machine, canary refusal paths, and transaction journal; lightweight (targeted tests, no test-first ceremony) for CLI table wiring, help output, docs.
- **Rationale**: matches repo precedent (2,900-test vitest suite; s056 "tests-first, mutation-verify" for guard logic) while not ritualizing table registration.
- **Focus Areas**: wrong-arg fail-loud paths (every verb), phantom-peer guard, `send --wait` regression, journal resume idempotency, sha-mismatch ack refusal.
- **Excluded**: tmux end-to-end spawn flows (covered by existing integration smoke); load/perf.
- **Mock Usage**: targeted — real fs fixtures (temp `PIJ_HOME`) per repo convention; mock only tmux/harness process boundaries.

### Documentation Strategy
- **Location**: docs/how/ only (`docs/how/pij-team-scaffold.md`), matching `pij-peer-watch.md` precedent. Skill-side guidance lands in `skills/pij` (Phase 3).
- **Rationale**: operator/agent-facing CLI surface; README stays lean.

### Complexity
- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=1, T=2 (total 9)
- **Confidence**: 0.75
- **Assumptions**: workshop decisions survive Jordan's review with at-most naming changes; s051 lands independently
- **Dependencies**: existing receipt machinery (F-04), platform store adapters (F-06), resolveActor (F-09)
- **Risks**: see § Risks
- **Phases**: 3

### Acceptance Criteria
1. **AC-01**: `pij stream create --project <p> --slug <s>` produces worktree + branch + allocation record with base SHA resolved at create-time and a step journal; any step failure → named error, prior steps recorded, no dispatch-class side effects have occurred.
2. **AC-02**: every new verb, on wrong/missing args or unmet preconditions, exits non-zero with a named `E-*` error; test suite proves no exit-0 no-op path exists (grant-class regression).
3. **AC-03**: `pij fence show --path <p>` answers "who owns this path" from fence records across allocations; overlap is reported, never blocked.
4. **AC-04**: `Project.autonomy` round-trips through interface + guard + field-order (three-place lockstep); spine event prev/next byte-comparability preserved (existing canonicalization tests stay green).
5. **AC-05**: a dispatch yields exactly one of three distinguishable states — `acked` (delivery receipt + brief-ack with matching sha), `delivered-unacked`, `undelivered`; an ack with mismatched packet sha is refused with a named error.
6. **AC-06**: existing `pij send --wait` behavior is byte-unchanged (regression test on delivery receipts).
7. **AC-07**: `pij canary <id>` completes leg (a) nonce round-trip + leg (b) registry/descriptor identity read (declared vs pinned model compare), writes its record at pass time, and refuses (named error) on any mismatch or timeout.
8. **AC-08**: new store subdirs (`allocations/`, `fences/`, `dispatches/`) never surface in `registry.list()` (phantom-peer guard test, 056 precedent).
9. **AC-09**: `resolveActor` attribution with provenance on every record write; spine events emitted for allocation/fence/dispatch mutations.
10. **AC-10**: `skills/pij` prime kickoff ritual references the new verbs for the steps they replace; `docs/how/pij-team-scaffold.md` documents the verb family + a worked stream stand-up; a stock team-manifest template example ships in the doc (consumption in v2).
11. **AC-11**: every new record write (allocation/fence/dispatch) is crash-consistent and serialized through `withPlatformWriteLock` + op-journal (journal-first, `spineLog.appendOnce(opId)`, exactly-once); a simulated crash between record write and spine append is healed by the next platform write's `recoverPendingOps` pass; existing project/assignment recovery tests remain green.

### Risks & Assumptions
- s051 identity fix in flight — canary records pane+pid+native-id defensively; twins degrade attribution, not correctness of refusal paths.
- Workshop decisions are provisional; event-kind *names* are Jordan's (single-constant change if renamed).
- `spine append` stdin claim (survey) unreproduced — not designed around (F-12).

### Open Questions
- Spine event kind names (`allocation` / `fence` / `dispatch`) — **final** (2026-07-21); shipped as constants, naming was never a reserved gate.
- Dispatch-record GC/retention (W-02 Q2) — defaulting to age-gated standing-hold rules; revisit at review.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions | Status |
|-------|------|--------------|---------------|--------|
| Team-manifest schema + verb vocabulary | Data Model + CLI Flow | human-ruled contract territory (054 precedent) | verb family, records, event kinds, transactionality | ✅ workshops/001 (provisional) |
| Receipt/parse-ack vocabulary | API Contract | shipped consumer surface | extend state vs new kind | ✅ workshops/002 (provisional) |

### Clarifications
#### Session 2026-07-20
Answered by PM seat (pij-ancient-rhinoceros) under Jordan's power-through ruling (original-ask §Follow-up rulings 4); modal question UI forbidden by pij invariant 9; **all four pending Jordan's ratification at plan review**:
- Q: Workflow Mode? → **Full** (CS-4, four domains, three real dependency-ordered phases).
- Q: Testing Strategy? → **Hybrid** (TDD for record/receipt/canary logic; lightweight for wiring) — repo precedent.
- Q: Mock Usage? → **B, targeted** (real fs fixtures; mock tmux/harness boundaries only) — repo convention.
- Q: Documentation Strategy? → **B, docs/how/** — `pij-peer-watch.md` precedent.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — both workshopped (001, 002; provisional pending Jordan review)

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings; substituted for B2 research subagents (dossier's store-trace worker was implementation-focused) |
| workshops/*.md | y (2) | authoritative design decisions (provisional) |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | no critical markers; Round-1 answered under power-through ruling, recorded for ratification |
| G2 | Constitution | N/A | no docs/project-rules/constitution.md |
| G3 | Architecture | N/A | no docs/project-rules/architecture.md |
| G4 | ADR Compliance | N/A | no docs/adr/ |
| G5 | Structure | PASS | all required sections present |
| G6 | Testing Alignment | PASS | TDD-flagged areas order test tasks before impl in every phase |
| G7 | Domain Completeness | PASS | 4 existing domains, all in registry; manifest covers all phase files |

### Summary
Three phases ship the scaffold building blocks bottom-up: (1) records + stream/fence verbs on the platform store, (2) dispatch receipts on the messaging seam, (3) the canary verb + derived-safety queries + skill/doc integration. Each verb is independently testable and fail-loud; composition (`team scaffold`) is deferred to v2 on proven blocks. Expected outcome: a prime stands up a governed stream with three commands and receipts for every step.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/platform/types.ts` | pij-orchestration | contract | Allocation/Fence/Dispatch types; Project.autonomy (lockstep w/ guard) |
| `.pi/extensions/pij/core/platform/allocation.ts` (new) | pij-orchestration | internal | canonical JSON + field order + journal semantics |
| `.pi/extensions/pij/core/platform/fence.ts` (new) | pij-orchestration | internal | fence record + overlap query |
| `.pi/extensions/pij/adapters/allocation-store.ts` (new) | pij-orchestration | internal | `~/.pij/allocations/` (subdir law) |
| `.pi/extensions/pij/adapters/fence-store.ts` (new) | pij-orchestration | internal | `~/.pij/fences/` |
| `.pi/extensions/pij/adapters/dispatch-store.ts` (new) | pij-messaging | internal | `~/.pij/dispatches/` |
| `.pi/extensions/pij/core/worktree.ts` (new) | pij-orchestration | internal | git worktree add/verify/remove-safe (greenfield, F-05) |
| `.pi/extensions/pij/core/stream.ts` (new) | pij-orchestration | internal | stream create/close orchestration + transaction journal |
| `.pi/extensions/pij/core/canary.ts` (new) | pij-control-plane | internal | nonce round-trip + identity read + refusal |
| `.pi/extensions/pij/core/inbox.ts` | pij-messaging | cross-domain | brief-ack receipt emission beside send-delivered-receipt (W-02 seam) |
| `.pi/extensions/pij/core/message.ts` | pij-messaging | contract | BriefAckReceipt type (additive) |
| `.pi/extensions/pij/core/cli.ts` | pij-control-plane | contract | three-table registration + parse/execute for stream/fence/dispatch/ack/canary; + thread new stores through `platformWritePorts`/`recoverPendingOps` at all existing write call sites (re-verify NEW-2 sizing note) |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | internal | bin dispatch cases |
| `.pi/extensions/pij/core/anomalies.ts` | pij-orchestration | internal | new derived classes: delivered-unacked-stale, allocation-half-open |
| `.pi/extensions/pij/core/platform/journal.ts` | pij-orchestration | cross-domain | `recoverPendingOps` intent adjudication extended to allocation/fence/dispatch record types (Finding 09; the op-journal *store* at `adapters/op-journal.ts` is consumed, likely unchanged) |
| `.pi/extensions/pij/core/platform/project.ts` | pij-orchestration | internal | PROJECT_FIELD_ORDER + autonomy |
| `skills/pij/references/prime/rituals/kickoff.md` | pij-skill | contract | steps 2/6/10/11 reference the new verbs |
| `skills/pij/references/routes/node.md` | pij-skill | contract | new verb rows |
| `docs/how/pij-team-scaffold.md` (new) | pij-skill | contract | operator/agent doc + manifest template example |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Silent no-op is the substrate's native failure style (H-01; F-07 silent E-ARG) | AC-02 wrong-arg tests per verb; evidence-line on success is part of each verb's contract |
| 02 | Critical | Top-level `~/.pij` JSON reads as peer descriptors (F-06) | subdir-only stores + AC-08 phantom guard test |
| 03 | High | Receipts prove delivery, not parse (F-04) | W-02: new `brief-ack` kind at inbox consume seam; `ReceiptState` untouched (AC-05/06) |
| 04 | High | `boundModel` is self-report (F-02); canary is prose (F-03) | canary verb compares declared vs pinned, refuses on mismatch; records at pass time |
| 05 | High | Worktree management is greenfield (F-05) | new `core/worktree.ts`; interacts with `gitCommonDir`; never removes trees with WIP |
| 06 | High | Project canonicalization is three-place lockstep (F-11) | AC-04 single task touching interface+guard+field-order together |
| 07 | Medium | Two arg resolvers drift (F-08) | all verbs on platform parser tables (W-01 D2-A) |
| 08 | Medium | Closed state vocabularies (H-02) | no new semantic states; new *record* states only (allocation/dispatch), which are outside the WS-6 node vocabularies |
| 09 | Critical | Platform coupled-write law (cold-validation V-01): every record+spine-event write runs inside `withPlatformWriteLock` → `recoverPendingOps` → journal-first `opJournal.record`/store write/`markCommitted`/`spineLog.appendOnce(opId)`/`clear` (`core/cli.ts:1244-1270,2217-2304`; `adapters/op-journal.ts:1-17`, hardened over 5 review rounds) | ALL new write verbs (stream/fence/dispatch/ack) route through `platformWritePorts`; `recoverPendingOps` extended to adjudicate allocation/fence/dispatch intents (tasks 1.9, 2.4; AC-11) — never a bare spine append |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Records + stream/fence verbs | pij-orchestration | Allocations/fences as store records; `stream create/close`, `fence set/show`; autonomy field | None |
| 2 | Dispatch receipts | pij-messaging | `dispatch`/`ack` + brief-ack receipt kind; three distinguishable dispatch states | Phase 1 (event kinds, store patterns) |
| 3 | Canary + derived safety + integration | pij-control-plane | `canary` verb; new anomaly classes; skill/doc integration | Phase 2 (nonce rides dispatch machinery) |

#### Phase 1: Records + stream/fence verbs

**Objective**: allocations and fences become attributed store records, and stream stand-up becomes one evidenced transactional verb.
**Domain**: pij-orchestration (+ pij-control-plane wiring)
**Delivers**: `Allocation`/`Fence` types + stores; `core/worktree.ts`; `pij stream create/close`, `pij fence set/show`; `Project.autonomy`; spine event kinds; verb-table registration
**Depends on**: None
**Key risks**: worktree edge cases (existing dir, dirty tree, ordinal collision) — journal + named errors cover each.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Tests: Allocation/Fence record round-trip, canonical JSON, journal append, subdir law + phantom guard | pij-orchestration | red tests naming AC-01/08/09 behaviors | TDD |
| 1.2 | `platform/types.ts` + `allocation.ts` + `fence.ts` + stores (schemas per workshop 001) | pij-orchestration | 1.1 green; `isAllocation`/`isFence` guards + field order | |
| 1.3 | Tests+impl: `Project.autonomy` three-place lockstep | pij-orchestration | AC-04; existing canonicalization tests green | Finding 06 |
| 1.4 | Tests: worktree create/verify/safe-remove (existing-dir, dirty-tree, bad-base refusals) | pij-orchestration | red tests for each named `E-*` path | TDD |
| 1.5 | `core/worktree.ts` (execFile git; SHA resolved at create; never removes WIP) | pij-orchestration | 1.4 green | Finding 05 |
| 1.6 | `core/stream.ts`: create/close with step journal (persist-before-mutate, resume-idempotent) | pij-orchestration | AC-01; re-run resumes, completed steps verified-then-skipped | |
| 1.7 | CLI registration: `stream`/`fence` families in three tables + parse/execute + bin cases; spine events via `resolveActor` | pij-control-plane | `--help` free; AC-09 | Finding 07 |
| 1.8 | Wrong-arg fail-loud tests for all four verbs (grant-class regression) | pij-control-plane | AC-02 for phase-1 verbs | Finding 01 |
| 1.9 | Tests+impl: stream/fence writes through `platformWritePorts` (lock + `recoverPendingOps` + journal-first coupled write); extend recovery adjudication to allocation/fence intents; crash-window replay test (kill between record write and spine append → next write heals exactly-once). **Lock scope**: the lock + op-journal wrap ONLY the spine-event-emitting record commits (allocation create-event; stream-close event); git subprocess steps and intermediate `steps[]` appends are plain updates to the uniquely-keyed allocation record OUTSIDE the lock — never hold the platform lock across a subprocess | pij-orchestration | AC-11 for phase-1 verbs; existing project/assignment recovery tests stay green | Finding 09; TDD; re-verify NEW-1 |

#### Phase 2: Dispatch receipts

**Objective**: brief delivery becomes a receipted, three-state artifact.
**Domain**: pij-messaging
**Delivers**: `BriefAckReceipt` kind; `pij dispatch --packet [--wait]`; `pij ack`; `dispatches/` store; regression-locked `send --wait`
**Depends on**: Phase 1
**Key risks**: touching the shipped receipt path — regression test first.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Regression test freezing current `send --wait` + delivery-receipt behavior | pij-messaging | AC-06 red-proof (test passes on HEAD, guards the seam) | TDD |
| 2.2 | Tests: brief-ack emission, sha mismatch refusal, three dispatch states | pij-messaging | red tests naming AC-05 | TDD |
| 2.3 | `message.ts` BriefAckReceipt (additive) + `inbox.ts` emission + `dispatch-store.ts` | pij-messaging | 2.2 green | W-02 |
| 2.4 | `pij dispatch` / `pij ack` verbs (platform tables) + packet header contract + spine `dispatch` events **through `platformWritePorts`** (lock + journal-first; recovery adjudication for dispatch intents; crash-window replay test) | pij-control-plane | AC-05/09/11; `--wait` resolves on ack not delivery | Finding 09 |
| 2.5 | Wrong-arg + timeout-path tests (`delivered-unacked` never conflated) | pij-messaging | AC-02/05 | Finding 01 |

#### Phase 3: Canary + derived safety + integration

**Objective**: mechanical canary legs; half-done states visible as anomalies; the ritual layer points at the verbs.
**Domain**: pij-control-plane (+ pij-skill)
**Delivers**: `pij canary`; anomaly classes `delivered-unacked-stale` + `allocation-half-open`; `docs/how/pij-team-scaffold.md`; skill updates; manifest template example
**Depends on**: Phase 2
**Key risks**: canary against a busy peer — timeout is a named refusal, never a hang.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Tests: canary pass/refuse matrix (nonce timeout, identity mismatch, model-compare incl. UNPINNED honest-default) **plus wrong/missing-arg fail-loud suite mirroring 1.8/2.5** (grant-class E-ARG paths, distinct from precondition refusals) | pij-control-plane | red tests naming AC-07 + AC-02 for canary | TDD; survey kickoff leg-(b) law; V-02 |
| 3.2 | `core/canary.ts` + `pij canary` verb; record written at pass time (pane+pid+native-id defensive triple) | pij-control-plane | 3.1 green; AC-07 | s051 defensive |
| 3.3 | Anomaly classes over dispatch/allocation records (derived, evidence-ref'd) | pij-orchestration | `pij anomalies` surfaces stale-unacked + half-open; 0 false positives on clean fixtures | F-10 pattern |
| 3.4 | `docs/how/pij-team-scaffold.md`: verb family, worked stream stand-up, manifest template example | pij-skill | AC-10; doc's commands run verbatim against a scratch project | lightweight |
| 3.5 | `skills/pij` updates: kickoff steps 2/6/10/11 cite verbs; node route rows; skill-check green | pij-skill | AC-10; `pij-skill-check` passes | lightweight |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.4–1.6 | 1.6 journal/resume tests |
| AC-02 | 1.8, 2.5, 3.1 | wrong-arg suites per verb |
| AC-03 | 1.1–1.2, 1.7 | fence query tests |
| AC-04 | 1.3 | lockstep + canonicalization suite |
| AC-05 | 2.2–2.5 | three-state + sha-mismatch tests |
| AC-06 | 2.1 | frozen regression test |
| AC-07 | 3.1–3.2 | pass/refuse matrix |
| AC-08 | 1.1 | phantom-guard test |
| AC-09 | 1.7, 2.4 | spine event assertions |
| AC-10 | 3.4–3.5 | doc walkthrough + skill-check |
| AC-11 | 1.9, 2.4 | crash-window replay tests + existing recovery suite |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Jordan renames event kinds / amends workshop decisions at review | Medium | Low | names isolated to constants; workshops are the single amend point |
| s051 lands mid-build changing identity surface | Medium | Medium | canary records defensive triple; only leg-(b) read touches identity |
| Receipt seam regression breaks external `send --wait` consumers | Low | High | 2.1 freeze-test first; additive-only kind |
| Worktree edge cases on shared checkouts | Medium | Medium | named refusals; never destructive; `gitCommonDir` interaction tested |
| `recoverPendingOps` adjudication extension regresses existing project/assignment recovery | Low | High | journal-first pattern copied verbatim from the hardened path; existing recovery tests pinned green in AC-11 |
