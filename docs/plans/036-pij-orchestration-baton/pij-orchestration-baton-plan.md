# pij orchestration baton — registry-backed lease primitive
**Mode**: Simple
**Plan Version**: 1.0.0
**Created**: 2026-07-11
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

📚 Incorporates findings from research-dossier.md

### Summary

Mechanize the baton convention (`skills/pij/references/prime/rituals/batons.md`) as a first-class CLI primitive: `pij orchestration baton <verb>` — a registry-backed lease with one holder, pushed grants, a purpose-carrying queue, explicit reclaim, holder-liveness alerts, stale-SHA re-pin, and blocked-time measurement. Batons are the first inhabitant of the `pij orchestration <primitive>` verb family (ruling #2, settled). The hand-written baton book remains the human evidence layer; the primitive emits machine records and never touches the book.

**Posture (ruling #7): honor system.** No ACLs — any peer may grant or reclaim; the prime keeps order socially. The primitive's rules are *firm guides*: it records, pushes, warns, and demands explicit acks — the only hard mechanics are single-holder atomicity and argument validity. Nothing else blocks.

### Goals

- One holder per baton, enforced atomically (the lease is a fact, not a claim).
- Grants/returns/requests are **pushed** to the affected peer with delivery receipts surfaced to the sender (run-01 magic wand: "the grantee actually knows, now").
- The queue holds **requests-with-purposes**; granting is discretionary, never positional (run-01: DAG, not FIFO).
- Dead/stalled holders produce **one pushed alert per transition** — never an auto-reclaim (run-01: the one real reclaim needed human judgment).
- A request may pin a SHA; granting against a moved HEAD demands an explicit `--repin` ack (run-01: "the one rule I'd ship tomorrow").
- Blocked time (request→grant) is measured for free (spine R4.4 worktree-split signal).
- Every action appends a machine line to a grant log; the keeper's book stays hand-written on top.

### Non-Goals

- No enforcement of who may grant/reclaim (honor system, ruling #7).
- No `with` wrapper, no mid-hold windows / sub-leases (ruled out of v1).
- No auto-reclaim, no breach detection, no queue auto-ordering (human judgment — interview §5).
- Never writes `government/baton-book.md` (single-writer = the keeper seat).
- No git introspection beyond `rev-parse HEAD` for pin checks (E-22: make lease state visible, don't re-implement git).

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-orchestration | **NEW** | **create** | Lease semantics, baton store, machine grant-log, future orchestration primitives |
| pij-control-plane | existing | **modify** | Bin CLI intercept for the `orchestration` verb family; daemon sweep wiring |
| pij-messaging | existing | **consume** | Delivery/receipts for pushed grants, notices, alerts |
| pij-skill | existing | **modify** | `rituals/batons.md` gains the primitive's usage at ship (fenced — o-prime grant) |
| extension-authoring-harness | existing | **consume** | TDD/fakes discipline, `harness checks` gate |

#### New Domain Sketches

##### pij-orchestration [NEW]
- **Purpose**: Orchestration primitives that serialize/govern multi-agent work — batons (exclusive-resource leases) first; the verb family is deliberately future-facing.
- **Boundary Owns**: baton definitions, lease lifecycle decisions (pure), the baton store layout under `PIJ_HOME/orchestration/`, the machine grant-log, blocked-time accounting, pin/re-pin semantics.
- **Boundary Excludes**: message transport + receipts (→ pij-messaging), CLI arg entry + daemon process (→ pij-control-plane), the human baton book + grant judgment (→ government layer, out of code entirely).

### Testing Strategy

- **Approach**: Full TDD (house law: every module has a `.test.ts` sibling; tests target stores/core, not wiring — P8).
- **Mock Usage**: targeted fakes implementing the ports (house `adapters/fakes.ts` pattern); real fs in tmpdirs only where the adapter itself is under test.
- **Focus Areas**: single-holder atomicity under concurrent acquire; lifecycle decisions (request/grant/return/reclaim); pin-mismatch; alert-once-per-transition; log append integrity.
- **Excluded**: tmux/daemon end-to-end (covered by existing smoke patterns; live verify at implement time under the daemon-restart baton).

### Documentation Strategy

- **Location**: `docs/how/` only — new `docs/how/pij-orchestration-baton.md` + a verb-family row in `docs/how/pij.md`. Ritual update rides ship (fenced).
- **Rationale**: matches watch-family precedent (plan 033).

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=1, N=1, F=1, T=1 (sum 7)
- **Confidence**: 0.8
- **Assumptions**: existing delivery/receipt path carries new notice kinds without transport changes; `PIJ_HOME` is the machine-wide scope root.
- **Dependencies**: daemon-restart baton (o-prime) for every live daemon verify; code-fence grant at SW-1 before implement.
- **Risks**: see § Risks & Assumptions.
- **Phases**: 1 (Simple)

### Acceptance Criteria

1. **AC-01 single holder, atomically**: two concurrent `request`+immediate-grant attempts on a free baton yield exactly one holder; the loser lands in the queue (store test over the `wx` no-replace lease file).
2. **AC-02 delivery-verified grant push**: `grant` pushes a notice to the holder; the sender sees the receipt state (`queued|delivered|unverified`) in the command output.
3. **AC-03 stale-pin firm guide**: `grant` of a request pinned to a SHA ≠ current HEAD (of the baton's repo) exits `E-PIN` with the mismatch shown, unless `--repin` is passed; a `--repin` grant records the re-pin in the log.
4. **AC-04 alert-never-auto-reclaim**: a holder whose session goes dead/stalled produces exactly one pushed alert per transition to the granter; the lease is unchanged until an explicit `reclaim`.
5. **AC-05 discretionary queue**: `grant` may target ANY queued request by id; queue listing shows purposes, never positions-as-promises.
6. **AC-06 blocked time**: `show --json` exposes per-lease `requestedAt`/`grantedAt` and the delta; historical deltas recoverable from the log.
7. **AC-07 machine log, book untouched**: every verb appends one `log.ndjson` line (ISO · baton · actor · verb · lease-id · purpose/evidence); no code path references `government/baton-book.md`.
8. **AC-08 regression floor**: `npx vitest run .pi/extensions/pij/` green incl. FX001/FX002 + 035 suites; `just pij-skill-check` green; `harness checks` green.
9. **AC-09 daemon-less honesty**: read verbs (`list`/`show`) and store mutations work without the daemon; push paths degrade to an honest `unverified` receipt, never a fake success.

### Risks & Assumptions

- **Daemon-restart recursion** (dossier F-09): live-verifying the sweep requires restarting the shared daemon — every restart needs the daemon-restart baton from the o-prime and interrupts all live peers. Mitigation: batch daemon edits; verify sweep logic with fakes first; one restart window.
- **Metadata race** (accepted): baton JSON (definition/queue) uses tmp+rename last-writer-wins — racy under concurrent writes, acceptable for honor-system metadata; the *lease* itself is the atomic `wx` file, never the JSON.
- **Notice fan-out**: alerts target `grantedBy`; if the granter is itself dead, the alert lands in its inbox/log only (accepted for v1).

### Open Questions

None — rulings #2/#7 + clarification sessions below settle scope.

### Workshop Opportunities

None open — all resolved via clarifications (queue/pin/return semantics ruled 2026-07-11).

### Clarifications

#### Session 2026-07-11

- Q: Workflow mode? → A: **Simple** (Jordan).
- Q: Testing strategy? → A: **Full TDD**, house fakes pattern.
- Q: Mock usage? → A: **Targeted fakes** (ports; real fs only for adapter-under-test).
- Q: Documentation? → A: **docs/how/ only**.
- Q: Keeper/granter model? → A: **Any-peer grants — honor system**; "firm guides", never hard blocks; the prime keeps order socially (ruling #7).
- Q: `return` semantics? → A: **Free + notify** — frees the lease, logs evidence, pushes notice; verification stays human/book-layer.
- Q: v1 extras? → A: **`--pin` re-verify + blocked-time IN**; `with` wrapper + mid-hold windows OUT.
- Q: Domain home? → A: **NEW `pij-orchestration` domain**.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: none — all resolved.

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings (F-01..F-09) |
| workshops/*.md | n | — |
| research/interview-uec99o-answers.vendored.md | y | run-01 field evidence: queue/pin/automation-boundary requirements |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | all markers resolved in Session 2026-07-11 |
| G2 | Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 | Architecture | N/A | no `docs/project-rules/architecture.md` |
| G4 | ADR Compliance | N/A | no `docs/adr/` |
| G5 | Structure | PASS | all contract sections present |
| G6 | Testing Alignment | PASS | TDD: every impl task preceded by its test task |
| G7 | Domain Completeness | PASS | NEW domain has setup task T001; manifest covers all files |

### Summary

Build the baton primitive as a hexagonal slice mirroring the watch family (plan 033): a pi-free pure core (`core/orchestration/`) making lease decisions, an fs store adapter using the house atomic no-replace claim for the lease file, a bin CLI intercept for the `orchestration` verb family, notices over the existing delivery/receipt path, and a daemon sweep hook for holder-liveness alerts. Honor-system posture throughout: mechanics guarantee single-holder truth and honest delivery states; judgment (who grants, when to reclaim) stays human.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/orchestration/baton.ts` (+`.test.ts`) | pij-orchestration | contract | pure lease lifecycle decisions + types + local ports |
| `.pi/extensions/pij/core/orchestration/cli.ts` (+`.test.ts`) | pij-orchestration | internal | verb-family parse + pure dispatch |
| `.pi/extensions/pij/adapters/baton-store.ts` (+`.test.ts`) | pij-orchestration | internal | fs store: `wx` lease file, JSON swap, ndjson log |
| `.pi/extensions/pij/core/daemon/baton-sweep.ts` (+`.test.ts`) | pij-orchestration | internal | pure holder-liveness transition → alert decision |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | cross-domain | bin intercept `orchestration` + USAGE row |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | cross-domain | wire sweep into the tick loop |
| `.pi/extensions/pij/adapters/fakes.ts` | pij-messaging | cross-domain | add baton-store/delivery fakes beside existing ones |
| `docs/domains/pij-orchestration/domain.md` | pij-orchestration | contract | NEW domain doc |
| `docs/domains/registry.md` · `docs/domains/domain-map.md` | (registry) | cross-domain | registry row + map node/edges |
| `docs/how/pij-orchestration-baton.md` · `docs/how/pij.md` | pij-orchestration | internal | how-doc + verb row |
| `skills/pij/references/prime/rituals/batons.md` | pij-skill | cross-domain | ship-time ritual update (fenced — o-prime per-path grant) |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Atomic no-replace publish already house idiom (`fs-registry.ts:329` — tmp `wx`+fsync+`linkSync`) | Lease file = this exact pattern; the lease IS the lock |
| 02 | Critical | Honor-system ruling (#7): no ACLs; firm guides never hard-block | Only atomicity + `E-PIN`-without-`--repin` exit non-zero; everything else warns/records |
| 03 | High | Watch family (plan 033) is the complete verb-family template (bin intercept → core → adapter → daemon component) | Mirror its file/test topology |
| 04 | High | Receipt vocabulary `queued\|delivered\|unverified` + push transport exist (`core/receipts.ts`) | Reuse for grant/notice push; AC-02/AC-09 ride it |
| 05 | High | Daemon edits invisible until restart; restart hits every live peer (C6) | Fakes-first sweep tests; single restart window under the daemon-restart baton |
| 06 | Medium | Queue must be requests-with-purposes, granter-discretion (run-01 §6) | Store queue as id-keyed records; `grant --to <request>` takes any id |

### Implementation

**Objective**: Ship `pij orchestration baton define|list|show|request|grant|return|reclaim` end-to-end with pushed notices, liveness alerts, pin re-verify, blocked-time, and the machine grant-log — TDD throughout.
**Testing Approach**: Full TDD (tests precede impl per module; fakes for ports; real fs tmpdir for the store adapter).

**Store layout** (machine-wide, `PIJ_HOME/orchestration/`): `batons/<name>.json` (definition: resource, probe?, repo?, createdBy + queue of `{id, requester, purpose, pin?, declaredEvidence?, requestedAt}` + lease metadata) · `batons/<name>.lease` (atomic `wx` no-replace file = the single-holder truth: `{leaseId, holder, purpose, pin?, grantedBy, requestedAt, grantedAt}`) · `log.ndjson` (append-only machine lines).

#### Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Domain setup: domain.md, registry row, domain-map node/edges | pij-orchestration | `docs/domains/pij-orchestration/domain.md`, `docs/domains/registry.md`, `docs/domains/domain-map.md` | registry + map reference the new domain; boundaries match § New Domain Sketches | |
| [ ] | T002 | Core tests: lease lifecycle decisions — request→queue, grant (free/held/pin-mismatch/repin), return, reclaim, blocked-time calc, alert-once-per-transition input shaping | pij-orchestration | `core/orchestration/baton.test.ts` | failing suite covers AC-01/03/04/05/06 decision logic | tests first (TDD) |
| [ ] | T003 | Core impl: pure module — tagged-union results, injected clock, local ports (`BatonStorePort`, notice sink) | pij-orchestration | `core/orchestration/baton.ts` | T002 green; no `@earendil-works/*` imports (P2) | mirrors `lock.ts` shape |
| [ ] | T004 | Store adapter tests: `wx` lease create/race (two writers → one wins), JSON tmp+rename swap, ndjson append, corrupt-file tolerance | pij-orchestration | `adapters/baton-store.test.ts` | failing suite proves AC-01 atomicity + AC-07 log lines on real fs (tmpdir) | |
| [ ] | T005 | Store adapter impl | pij-orchestration | `adapters/baton-store.ts` | T004 green | claim pattern per Finding 01 |
| [ ] | T006 | Verb-family parse tests: full arg grammar, `--json`, E-ARG arity/flag cases, exit codes | pij-orchestration | `core/orchestration/cli.test.ts` | failing suite enumerates every verb's grammar | |
| [ ] | T007 | Parse + dispatch impl + bin intercept + USAGE block row | pij-orchestration / pij-control-plane | `core/orchestration/cli.ts`, `.pi/extensions/pij/cli.ts` | T006 green; `pij orchestration baton --help` prints family usage | intercept mirrors `agent` |
| [ ] | T008 | Notice tests: grant/request/return/alert pushes via fake delivery; receipt state surfaced in command output; daemon-down → `unverified`, never fake success | pij-orchestration | `core/orchestration/baton.test.ts` (extend), `adapters/fakes.ts` | failing suite covers AC-02/AC-09 | |
| [ ] | T009 | Notice impl: wire delivery/receipts through the existing channel | pij-orchestration / pij-messaging | `core/orchestration/baton.ts`, `adapters/baton-store.ts` (log), channel wiring in `cli.ts` | T008 green | reuse, no new transport |
| [ ] | T010 | Sweep tests: holder pid/session dead or stalled → exactly one alert decision per transition; healthy/unknown → no-op | pij-orchestration | `core/daemon/baton-sweep.test.ts` | failing suite covers AC-04 | pure, injected liveness |
| [ ] | T011 | Sweep impl + daemon wiring; live verify under a granted daemon-restart baton window | pij-orchestration / pij-control-plane | `core/daemon/baton-sweep.ts`, `daemon.ts` | T010 green; one live restart shows an alert push end-to-end | request baton from o-prime |
| [ ] | T012 | Docs: how-doc + verb row | pij-orchestration | `docs/how/pij-orchestration-baton.md`, `docs/how/pij.md` | verbs, store layout, honor-system posture, book interplay documented | |
| [ ] | T013 | Gate sweep: full regression + skill-check + `harness checks` | (all) | — | AC-08 green across the board | |
| [ ] | T014 | Ritual update: `rituals/batons.md` teaches the primitive alongside the book | pij-skill | `skills/pij/references/prime/rituals/batons.md` | ritual names the verbs; book stays the evidence layer | ship-time; needs o-prime per-path fence grant |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | T002/T003, T004/T005 | store race test (two writers, one lease) |
| AC-02 | T008/T009 | notice test: receipt state in output |
| AC-03 | T002/T003, T006/T007 | pin-mismatch decision + `E-PIN` exit-code test |
| AC-04 | T010/T011 | transition test: one alert, lease untouched |
| AC-05 | T002/T003, T006/T007 | grant-by-request-id test |
| AC-06 | T002/T003 | blocked-time calc + `show --json` fields |
| AC-07 | T004/T005 | log-append test + grep: no `baton-book` reference in `.pi/extensions/pij/**` |
| AC-08 | T013 | full gate sweep |
| AC-09 | T008/T009 | daemon-down receipt test |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Daemon restart window disrupts live peers | Certain (1 restart) | Medium | Single batched window under the daemon-restart baton; fakes-first so one restart suffices |
| Metadata JSON race under concurrent grant chatter | Low | Low | Lease truth is the `wx` file; JSON is advisory metadata (accepted, documented) |
| Notice targets a dead granter | Low | Low | Alert also logged; honor-system tolerance |
| Fence expansion needed mid-build (unforeseen file) | Medium | Low | Escalate to o-prime per-path (never a judgment call) |
