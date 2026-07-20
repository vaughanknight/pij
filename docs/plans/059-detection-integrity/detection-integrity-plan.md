# Detection Integrity
**Mode**: Full
**Plan Version**: 1.2.0
**Created**: 2026-07-20
**Status**: IMPLEMENTED — CONVERGENCE/ACTIVATION HELD
**Spec source**: unified (this file)

## Business Specification

### Research Context

Source mapping is recorded in `reports/preamble-checkpoint.md` and derives from the live feature-round mandate, `government/briefs/feature-round-2026-07-19.md`, `government/briefs/prime-feedback-triage-2026-07-18.md`, current code at `fb1bfbd`, and Pi's `tool_call` interception contract.

Three mandate items are already present at the pinned base and are regression obligations, not implementation work:

- poll-primary Pi inbox delivery + `inbox-poll-stalled` observability (`870c3a7`, `11bf186`);
- axis-disagreement age from live `lastEventAt`, bounded by node age (`ab16cfb`, `0e8b360`);
- the axis-disagreement remedy inline in anomaly output (`0ac2f2e`).

**Live specimen, 2026-07-20 @ `fb1bfbd`**: cross-provider reviewer spawn `s1784501879414-2` returned pane `%1978`, then vanished before ready/canary/self-registration. Global all-tree contained no descriptor and tmux reported the pane absent; the existing spawn-limbo sensor emitted no observable alert. The requested model provider was Claude, but the launch used `pij_spawn`'s Pi harness and no descriptor survived, so runtime harness identity/cause are unavailable. Evidence: `reports/reviewer-canary-no-show-001.md`.

### Summary

A pij-managed seat must not disappear, wedge on a forbidden modal, or remain permanently unsupervised without a machine-visible signal. This stream closes the remaining silent-loss seams: bounded watchdog exemptions, a mechanical Pi `ask_user_question` refusal, and request-aware death reconciliation for daemon-bound and self-registering Pi harnesses. It reports observed state and request provenance, never an inferred cause.

### Goals

- Re-arm watchdog supervision automatically after a bounded exemption.
- Block `ask_user_question` before execution in a live pij Pi peer and direct the agent to ask inline through pij.
- Distinguish pij-requested closure from an observed absence/death.
- Stamp an unrequested disposition with observation time when no pij close request exists.
- Detect both daemon-bound death and Pi pre-registration/no-show or post-registration death.
- Keep death notices temporally honest across daemon restart/reconciliation.
- Activate all daemon-side behavior in one coordinated restart window after review.

### Non-Goals

- Determine why a process died or attribute human/platform/provider causality.
- Rebuild poll-primary delivery, `lastEventAt` anomaly logic, or anomaly remedy text already present.
- Add observed runtime-model provenance (Stream 3).
- Change identity/re-key semantics beyond consuming the existing descriptor identity.
- Modify Pi itself or the pi-mono checkout.
- Add a permanent watchdog-disable mechanism under a new name.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|----------------------|
| `pij-messaging` | existing | modify | Additive descriptor/sidecar provenance, Pi peer guard decision, and self-registering spawn expectation contract. |
| `pij-control-plane` | existing | modify | Cross-harness death reconciliation, creator notices, daemon sweep, CLI close intent, and coordinated activation. |
| `extension-authoring-harness` | existing capability | consume | Unit/integration/smoke, mutation, and disposable-`PIJ_HOME` proof. |

### Testing Strategy

- **Approach**: Hybrid — TDD for pure state transitions and stores; integration tests for Pi tool interception, close paths, daemon reconciliation, and notices; isolated runtime smoke only after cold approval.
- **Focus Areas**: expiry boundaries; restart persistence; requested/unrequested classification; stale replay; pre-register Pi no-show; graceful replacement vs terminal absence; legacy descriptors.
- **Excluded**: provider root-cause diagnosis and model-dependent idle-reaper experiments.
- **Mock Usage**: targeted fakes only at clock, process, tmux, registry, delivery, and Pi event boundaries; real temporary filesystem adapters for durable sidecars.

### Documentation Strategy

Update `docs/how/pij-watchdog.md` for exemption expiry/re-arm and `docs/how/pij.md` for modal refusal and requested/unrequested exit semantics. Update existing domain docs; no README duplication.

### Complexity

- **Score**: CS-5 (epic)
- **Breakdown**: S=2, I=2, D=2, N=2, F=2, T=2 (12)
- **Confidence**: 0.82
- **Assumptions**: a default one-hour exemption TTL is conservative and operator-visible; exact duration remains one named constant and may be re-ruled without schema change. `tool_call` blocking is available in installed Pi and yields an error result to the model.
- **Dependencies**: existing watchdog sidecar/store, daemon whole-life detector, close/session paths, poll-primary/limbo anomaly work, Pi extension `tool_call` event.
- **Risks**: lifecycle races, duplicate/replayed notices, legacy descriptor migration, and shared daemon restart blast radius.
- **Phases**: 3.

### Acceptance Criteria

- **AC-01 — Exemptions expire**: `pij watchdog exempt <id>` records a bounded expiry; scheduler/status agree before and after expiry; restart does not reset or extend the deadline.
- **AC-02 — Explicit re-arm**: `reset` clears exemption metadata immediately; real working transition may re-arm early, and expired exemption state is normalized rather than rendered as active.
- **AC-03 — Modal guard**: a Pi peer with pij active blocks tool name `ask_user_question` before its implementation runs, returns an actionable reason naming inline `pij_send`, and records the blocked attempt without blocking unrelated tools.
- **AC-04 — Guard scope**: subagent-child and non-pij contexts remain unaffected; no modal/UI fallback is invoked by the guard itself.
- **AC-05 — Requested closure provenance**: every pij-owned close path persists request actor/time/kind before pane termination or descriptor dissolution; historical projection reports `requested`.
- **AC-06 — Daemon-bound unrequested death**: a bound Claude/Copilot/Codex descriptor whose process/pane disappears without a persisted close request is terminalized as `unrequested` with `observedAt`, regardless of a harness `ROUTINE` label.
- **AC-07 — Pi post-register death**: a registered Pi peer that disappears without a persisted close request is detected by the cross-harness reconciler and reported `unrequested`.
- **AC-08 — Pre-register no-show**: every spawn path persists an expectation before launch; a vanished or expired expected pane that never registers/binds emits one creator alert and leaves a durable unrequested no-show record, even when no descriptor exists to identify the runtime harness.
- **AC-09 — Temporal honesty**: death notices include observation/last-seen time and identify boot reconciliation as historical; daemon restart never presents old absence as a new live death.
- **AC-10 — Per-harness honesty**: output distinguishes descriptor-backed death, expectation-backed no-show, and `unavailable(reason)` evidence; it never claims a cause.
- **AC-11 — No duplicate alert**: request/disposition evidence keys a once-per-transition latch across ticks and restart-safe persisted terminal state.
- **AC-12 — Landed detector regression**: focused tests retain poll-primary delivery, `inbox-poll-stalled`, live-`lastEventAt` axis disagreement, node-age bound, and self-remedy behavior unchanged.
- **AC-13 — Activation**: reviewed code passes targeted gates and `harness checks`; one granted daemon restart activates daemon changes, followed by disposable and live read-only canaries for each observable harness class.

### Risks & Assumptions

| Risk | Treatment |
|------|-----------|
| A close crashes between request persistence and pane kill | Request record is authoritative intent; later reconciliation may report requested-but-incomplete, never unrequested. |
| Direct human harness exit is intentional but not requested through pij | Label `unrequested-by-pij`, not “crash”; cause remains unknown. |
| Pi `/reload`/`/new`/`/resume`/`/fork` resembles shutdown | Treat Pi replacement reasons separately; a successful successor boot consumes/reconciles the predecessor, while terminal quit/absence remains observable. |
| Expectation store invents a second identity | Key by spawn id/pane and link to final descriptor via persisted spawn id; never mint a peer descriptor placeholder. |
| Old sidecars have permanent `exempt` with no expiry | Migration assigns expiry from persisted `pausedAtMs`; absent/invalid time expires immediately with an honest status note. |
| Daemon restart interrupts live peers | Batch all daemon activation into one C6 baton window after cold review. |

### Open Questions

None blocking. The one-hour default exemption TTL is a plan assumption, isolated behind a tested constant and CLI-visible output.

**Carry-forward (non-blocking)**: persist a separate terminal-notice delivery-failed marker so an at-most-once push loss is actively discoverable without retrying into duplicate incident notices; see `reports/carry-forward-notice-delivery-failure.md`.

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Death disposition lifecycle | State Machine | Multiple close/replacement/death paths converge on one terminal record. | Which transitions consume expectations; how do requested, unrequested, and unavailable compose without replay? |
| Pi spawn expectation | Storage Design | Pi has no pending descriptor before self-registration. | Minimal sidecar schema, consume key, retention, and historical projection. |

### Clarifications

#### Session 2026-07-20

- **Workflow Mode**: Full — cross-harness persistence, daemon reconciliation, and live activation need separate reviewable phases.
- **Testing**: Hybrid with TDD for pure/store logic and isolated runtime proof for daemon/Pi integration.
- **Mocks**: Targeted boundary fakes; real temporary filesystem adapters for persistence.
- **Documentation**: Existing `docs/how/` and domain docs only.
- **Binding rulings**: Stream 1 first; one batched daemon restart; no implementation before an explicit phase grant; report observed state without cause attribution.
- **Grant re-cut (Dove)**: Phase 1 is modal guard only; Phase 2 is watchdog exemption re-arm; Phase 3 is death observability. Phase 2 is accepted; Phase 3 implementation is granted in `reports/phase-grant-003.md`. Restart/activation task 3.7 remains held until batched convergence.

## Planning Seam
_Refinement opportunities still open — recorded as evidence; the flow surfaces and offers these, none gate:_
- Open Workshop Opportunities: Death disposition lifecycle; Pi spawn expectation

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | no | Mandate, evidence briefs, source mapping, and preamble checkpoint are the authoritative research inputs. |
| workshops/*.md | no | State/storage decisions are specified here and remain reviewable before implementation. |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical ambiguity; TTL assumption is isolated and explicit. |
| G2 | Constitution | N/A | No project constitution file. |
| G3 | Architecture | PASS | Pi-free decisions/stores; side effects remain injected/wiring-owned; additive descriptor fields only. |
| G4 | ADR Compliance | N/A | No accepted ADR contradicts the plan. |
| G5 | Structure | PASS | Both halves, manifest, phases, tasks, coverage, risks present. |
| G6 | Testing Alignment | PASS | Tests precede implementation in each phase; runtime proof follows cold review. |
| G7 | Domain Completeness | PASS | All referenced files map to existing registered domains. |

### Summary

Three reviewable implementation phases are complete. Phase 1 is the restart-free mechanical modal guard. Phase 2 re-arms watchdog exemptions. Phase 3 adds durable request/expectation provenance and a single cross-harness death reconciler. Activation task 3.7, merge-time independent review, and the coordinated restart/per-harness proof remain held for o-prime-owned convergence. Existing thread-1 detector changes are regression-tested, not rewritten.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | Additive watchdog expiry and exit/spawn provenance shapes. |
| `.pi/extensions/pij/core/watchdog.ts` | pij-messaging | internal | Pure expiry/re-arm/effective-state transitions. |
| `.pi/extensions/pij/core/watchdog.test.ts` | pij-messaging | internal | Boundary/migration transition proof. |
| `.pi/extensions/pij/core/daemon/watchdog-manager.ts` | pij-control-plane | internal | Expiry normalization and scheduler integration. |
| `.pi/extensions/pij/core/daemon/watchdog-manager.test.ts` | pij-control-plane | internal | Restart/expiry/scheduler proof. |
| `.pi/extensions/pij/adapters/watchdog-store.ts` | pij-control-plane | internal | Validate and persist additive expiry metadata. |
| `.pi/extensions/pij/adapters/watchdog-store.test.ts` | pij-control-plane | internal | Legacy/new sidecar filesystem proof. |
| `.pi/extensions/pij/core/invariant-guard.ts` (new) | pij-messaging | internal | Pi-free decision for forbidden modal tool names. |
| `.pi/extensions/pij/core/invariant-guard.test.ts` (new) | pij-messaging | internal | Guard scope and reason proof. |
| `.pi/extensions/pij/index.ts` | pij-messaging | cross-domain | Pi `tool_call` block wiring and spawn-id handoff. |
| `.pi/extensions/pij/index.test.ts` | pij-messaging | cross-domain | Event interception and lifecycle proof. |
| `.pi/extensions/pij/core/cli.ts` | pij-messaging | contract | Exemption duration/status and exit projections. |
| `.pi/extensions/pij/core/cli.test.ts` | pij-messaging | internal | Parser/dispatch/status compatibility. |
| `.pi/extensions/pij/cli.ts` | pij-control-plane | contract | Help, close-intent persistence, and spawn-expectation composition. |
| `.pi/extensions/pij/cli.integration.test.ts` | pij-control-plane | internal | Real CLI/disposable-home lifecycle proof. |
| `.pi/extensions/pij/core/close.ts` | pij-messaging | internal | Close request decision/provenance plan. |
| `.pi/extensions/pij/core/close.test.ts` | pij-messaging | internal | Ownership/request ordering proof. |
| `.pi/extensions/pij/core/session.ts` | pij-messaging | internal | Pi close/request/replacement and spawn expectation handoff. |
| `.pi/extensions/pij/core/session.test.ts` | pij-messaging | internal | Pi lifecycle and persist-before-mutate proof. |
| `.pi/extensions/pij/core/spawn-expectation.ts` (new) | pij-control-plane | internal | Pure expectation lifecycle and reconciliation decisions. |
| `.pi/extensions/pij/core/spawn-expectation.test.ts` (new) | pij-control-plane | internal | No-show, bind, timeout, and replay proof. |
| `.pi/extensions/pij/adapters/spawn-expectation-store.ts` (new) | pij-control-plane | internal | Atomic durable expectation sidecars. |
| `.pi/extensions/pij/adapters/spawn-expectation-store.test.ts` (new) | pij-control-plane | internal | Filesystem/migration/idempotence proof. |
| `.pi/extensions/pij/core/daemon/death-reconciler.ts` (new) | pij-control-plane | internal | Cross-harness requested/unrequested/unknown reducer. |
| `.pi/extensions/pij/core/daemon/death-reconciler.test.ts` (new) | pij-control-plane | internal | Per-harness transition and stale replay proof. |
| `.pi/extensions/pij/core/binding.ts` | pij-control-plane | internal | Timestamped, historical creator notice rendering. |
| `.pi/extensions/pij/core/binding.test.ts` | pij-control-plane | internal | Notice wording/time/capability proof. |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | cross-domain | Reconciler/store wiring and once-per-transition delivery. |
| `.pi/extensions/pij/daemon.test.ts` | pij-control-plane | internal | Tick/restart/activation proof. |
| `.pi/extensions/pij/core/anomalies.test.ts` | pij-control-plane | internal | Landed thread-1 regression matrix. |
| `.pi/extensions/pij/adapters/channel.test.ts` | pij-messaging | internal | Poll-primary regression only. |
| `.pi/extensions/pij/acceptance-sweep.test.ts` | pij-control-plane | internal | Cross-feature acceptance projection. |
| `docs/how/pij-watchdog.md` | pij-control-plane | contract | Operator TTL/re-arm behavior. |
| `docs/how/pij.md` | pij-messaging | contract | Guard and death disposition semantics. |
| `docs/domains/pij-messaging/domain.md` | pij-messaging | contract | New descriptor/guard/expectation contracts. |
| `docs/domains/pij-control-plane/domain.md` | pij-control-plane | contract | Reconciler and notice ownership. |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | `pausedBy:"exempt"` is explicitly non-expiring; `applyWatchdogResume` cannot clear it and status calls it `exempt`. | Add expiry metadata, pure effective normalization, visible deadline, and explicit reset/early re-arm. |
| 02 | Critical | Pi exposes a pre-execution `tool_call` hook that can return `{block:true, reason}`; pij currently only captures tool calls. | Add a pure guard and have the existing single handler block `ask_user_question` before capture/execute. |
| 03 | Critical | Whole-life death push runs only inside daemon-owned bound tmux delivery; registered Pi peers are excluded, and no request-side close marker exists. | Move terminal observation into one cross-harness reconciler keyed by persisted close intent. |
| 04 | Critical | Live reproduction `s1784501879414-2` returned pane `%1978`, then vanished before ready/self-registration with no descriptor or spawn-limbo alert; no surviving instrument can determine runtime harness or cause. | Generalize spawn expectations across all launch paths, keyed by spawn id/pane and persisted before launch; consume on registration/bind and alert on no-show. |
| 05 | High | `buildDeadNotice` says “has exited” without observation time; daemon restart latches are in-memory. | Persist terminal disposition/time and render live vs boot-reconcile historical wording from durable evidence. |
| 06 | High | Pi `session_shutdown` currently dissolves every reason uniformly; replacement lifecycles can be mistaken for terminal exits. | Pass shutdown reason into the pure lifecycle reducer and reconcile successful successor boot separately. |
| 07 | High | Poll-primary, stalled-poll, `lastEventAt` anomaly age, node-age bound, and self-remedy already landed. | Lock them with focused regression tests; exclude duplicate implementation. |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective | Depends On |
|-------|-------|----------------|-----------|------------|
| 1 | Mechanical modal-tool guard | pij-messaging | Refuse the known Pi modal wedge for managed pij peers only, without daemon restart. | None |
| 2 | Watchdog exemption re-arm | pij-messaging | Make safety-off bounded and visible. | Phase 1 |
| 3 | Request-aware cross-harness death reconciliation | pij-control-plane | Persist close/expectation evidence, classify absences honestly, and activate once under a restart baton. | Phase 2 |

#### Phase 1: Mechanical modal-tool guard

**Objective**: Mechanically prevent the forbidden Pi modal tool for managed pij peers without affecting generic Pi sessions.
**Domain**: `pij-messaging`
**Delivers**:
- one Pi-free managed-peer/tool decision;
- failing-then-green guard and wiring tests;
- composition into the existing `tool_call` handler before execution;
- no watchdog, daemon, close, or spawn changes.
**Depends on**: None
**Key risks**: The guard must block only exact `ask_user_question` and only when the Pi descriptor proves structural/orchestration management; it must never invoke UI.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Add failing pure tests for exact tool matching and the managed-Pi predicate, including generic auto-loaded Pi sessions. | pij-messaging | Current source is RED; managed parent/spawn/prime peers block while unmanaged Pi and non-Pi descriptors pass. | TDD first. |
| 1.2 | Add failing Pi event tests for actionable inline reason, blocked-attempt capture, and unrelated-tool pass-through. | pij-messaging | Tests prove the modal implementation never runs and no modal fallback is called. | Pi contract verified in installed docs/source. |
| 1.3 | Implement the pure guard and compose it into the one existing `tool_call` handler before execution; run focused tests/typecheck/diff checks. | pij-messaging | Block reason names invariant #9, inline `pij_send`, persisted pending decision, and dependent-only blocking; allowed paths only. | Restart-free grant 001. |

#### Phase 2: Watchdog exemption re-arm

**Objective**: Make watchdog exemptions bounded, restart-stable, and mechanically visible.
**Domain**: `pij-messaging`
**Delivers**:
- expiry-aware watchdog sidecar and effective state;
- CLI-visible exemption deadline, duration grammar, reset/early re-arm;
- operator docs and daemon scheduler integration.
**Depends on**: Phase 1
**Key risks**: Legacy exemptions have no expiry and scheduler/status must never disagree.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Add RED-first, value-pinned pure/store/manager tests for exempt immediately before/at/after expiry, restart persistence, legacy timestamps, and status/scheduler agreement; pin self/compact/reset non-regression. | pij-messaging | Boundary matrix fails against permanent exemption; restart retains the exact deadline; self remains explicit-resume-only and compact remains working-transition-only. | Grant 002. |
| 2.2 | Implement additive durable expiry metadata, injected-clock normalization/reconciliation, optional/default duration parsing, reset, and text/JSON deadline/effective-state projection. | pij-messaging | Expired exemption is persisted cleared before scheduler/effective active use; legacy sidecars load honestly; no `any` or inline imports. | Default TTL constant: 1h unless re-ruled. |
| 2.3 | Update watchdog operator/domain contracts; run focused tests, boundary/removal mutations, full tests, quick checks, typecheck, and lint. | extension-authoring-harness | Docs match human/JSON output; expiry/persist-order mutations go RED→restore→GREEN. | No daemon restart; activation waits for batched convergence. |

#### Phase 3: Request-aware cross-harness death reconciliation

**Objective**: Reconcile what pij requested against what each harness observably did, with durable timestamps and no cause claim.
**Domain**: `pij-control-plane`
**Delivers**:
- additive close-request and terminal-disposition descriptor fields;
- atomic cross-harness spawn-expectation store and registration/bind consume key;
- one cross-harness death/absence reducer and daemon sweep;
- timestamped live-vs-historical notices;
- thread-1 regression matrix and one coordinated restart/canary window.
**Depends on**: Phase 2
**Key risks**: request-before-kill ordering, replacement lifecycle false positives, stale restart replay, and expectation/descriptor double alerts.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Add failing pure/store tests for close intent, requested/unrequested/unavailable terminal states, cross-harness expectation create→register-or-bind/no-show, replacement reasons, and idempotent restart reconciliation. | pij-control-plane | Three-state requested/unrequested/unavailable matrix fails on current code; every case has observed/request time expectations. | Grant 003; RED first. |
| 3.2 | Add failing integration tests for CLI close, in-process `pij_close`, once-mode close, direct tmux death, registered Pi death, and descriptor-free pre-register pane disappearance matching specimen `s1784501879414-2`. | pij-control-plane | Each path proves persist-before-mutate and exactly one creator notice with temporal wording. | Disposable PIJ_HOME/tmux only. |
| 3.3 | Implement additive descriptor fields and spawn-expectation port/store; persist intent before spawn/kill and consume by spawn id on Pi child boot. | pij-messaging | Legacy descriptors load; no placeholder peer identity; known spawn failure cleans only its expectation. | Persist-before-mutate. |
| 3.4 | Implement the pure death reconciler and replace harness-specific tmux-only terminal logic with one daemon sweep over descriptors + expectations. | pij-control-plane | Daemon-bound, registered Pi, and Pi no-show cases classify correctly; no request means `unrequested-by-pij`, never inferred cause. | Provider-stuck remains non-terminal. |
| 3.5 | Render timestamps and boot-reconcile historical notices; persist terminal latch/disposition so restart cannot replay as new. | pij-control-plane | T10 stale-death tests distinguish historical from live and suppress duplicates. | `lastEventAt` may be last-seen, never fabricated death time. |
| 3.6 | Run landed thread-1 regression matrix, targeted suites, reversible mutations, `harness checks`, and cold review. | extension-authoring-harness | Poll/anomaly behavior unchanged; all gates green or failures reported before restart. | Review before live. |
| 3.7 | Acquire daemon-restart baton, send machine-wide heads-up, restart once from reviewed code, run per-harness canaries, return baton, and persist evidence. | pij-control-plane | Daemon source/pid recorded; delivery recovers; requested close stays requested; one controlled unrequested/no-show specimen alerts once with time. | **HELD until merge/convergence**; no restart in implementation worktree. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01–02 | 2.1–2.3 | watchdog/store/CLI tests + docs |
| AC-03–04 | 1.1–1.3 | invariant-guard + index tests and mutation |
| AC-05 | 3.1–3.3 | close/session/CLI unit + integration tests |
| AC-06–08 | 3.1–3.4 | reconciler, expectation store, daemon integration |
| AC-09–11 | 3.1, 3.4, 3.5 | restart/idempotence/notice tests |
| AC-12 | 3.6 | anomalies/channel/acceptance regression suites |
| AC-13 | 3.6–3.7 | harness checks, cold review, baton receipt, live canary report |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Legacy permanent exemptions become surprising | Medium | Medium | Visible migration status, conservative default, explicit reset, docs. |
| Close intent is mistaken for completed close | Medium | High | Separate request from observed disposition; incomplete requested close stays distinct. |
| Replacement session emits a false death | Medium | Critical | Reason-aware reducer + successor correlation tests before daemon wiring. |
| Pi expectation leaks forever | Medium | High | Bounded TTL, terminal retention policy, bind/failure cleanup, sweep tests. |
| Old death alerts replay after restart | High | High | Persist terminal disposition/latch and render historical reconciliation explicitly. |
| Shared daemon activation disrupts peers | Medium | Critical | One C6 baton window, heads-up, reviewed code, rollback source recorded. |
| Per-phase reviewer independence unavailable | High | High | Lead mutation/boundary proof + Dove compensating review now; before batched P2+P3 merge, attempt one genuine cross-provider review if fd/quota recover, otherwise declare unavailable. |
| Plan 060 overlaps core/top-level CLI files | High | Medium | Same worktree, orchestrator-owned serialization; Stream 1 Phase 1 first, then reconcile before any convergence. |
