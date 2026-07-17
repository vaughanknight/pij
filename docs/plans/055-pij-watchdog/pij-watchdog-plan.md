# First-Class Daemon-Owned Watchdogs (pij supervision)
**Mode**: Full
**Plan Version**: 1.0.1
**Created**: 2026-07-17
**Status**: READY
**Spec source**: unified (this file)

## Business Specification

📚 Incorporates findings from research-dossier.md

### Research Context

The dossier (`research-dossier.md`) proved the 7.5h freeze was invisible **by
design twice over**: liveness gates staleness on `state==="working"` (F-01), and
transient usage-limit pane patterns deliberately classify to `"unknown"`, which
never fires a push (F-06). It also found the machinery to build on: per-tick pane
capture + pane-signature heartbeat (F-03), the `paneWentBusy` not-busy→busy
oracle (F-04), the `PeerWatchManager` subscription-manager template (F-07), and
the `compact` remote-command choke points (F-08). The frozen s054 proposal is
vendored at `vendored/watchdog-enhancement-proposal.md` (sha-pinned,
`vendored/PROVENANCE.md`); its limits-banner-parsing sections are **superseded**
by Jordan's 2026-07-17 preamble ruling (blind fire; emergent resume;
deterministic unresponsive detection).

### Summary

Every pij session automatically gets a daemon-owned supervision watchdog: a
20-minute default heartbeat turn that teaches its own pause/resume etiquette,
pauses when the peer is compacted, keeps firing blind through usage-limit
freezes (resume is emergent — the session simply processes the next turn when it
thaws), and gives the daemon a deterministic **unresponsive/stalled** derivation:
watchdog turns delivered but no observable output (no busy transition, no pane
change, no new events). Supervisors can subscribe to a peer's watchdog and
receive cost-bounded tmux pane-text captures — the ground truth pij's own logs
cannot see (canonical case: agent out of credits).

### Goals

- No pij session can freeze or die silently for hours again: the fabric, not
  per-orchestrator hand-rolls, owns supervision (two orchestrators hand-rolled
  detection the same night — the demand evidence).
- `liveness=active` stops lying: an idle-frozen peer becomes deterministically
  `stalled` from delivered-but-unanswered watchdog turns.
- Usage-limit freezes need zero special handling: fires continue, resume is
  emergent, and the pane capture shows the human/supervisor *why* it was quiet.
- Supervision costs approximately nothing at steady state; capture cost is
  explicitly bounded and defaulted to anomaly-only.

### Non-Goals

- No thaw detection, limit-banner parsing, or reset-time scheduling (superseded
  proposal § Limits auto-resume items 2–3; Jordan ruling 2026-07-17).
- No change to the spawn-binding phone-home watchdog (`evaluateWatchdog`, 20s).
- No re-litigation of WS-6 state vocabulary (human-ruled, s054 workshop 001).
- No live-daemon restart as part of this stream's proofs (baton-gated; temp-daemon
  isolation per s051 precedent). Rollout restart is an ops action after merge.
- No dependency on s054 P2's unlanded `system_state`; convergence is planned, not
  presumed.

### Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| pij-control-plane | existing | **modify** | WatchdogManager in the daemon tick; delivery of watchdog turns; compact auto-pause hook; capture slices |
| pij-messaging | existing | **modify** | Additive types (watchdog sidecar, descriptor fields); pure fire/pause/unresponsive derivations beside `state.ts` |
| pij-skill | existing | **consume** | `/pij` route docs gain the watchdog etiquette (docs task only) |

### Testing Strategy

- **Approach**: Hybrid — full TDD for the pure core (scheduler, pause semantics,
  unresponsive derivation, capture policy), fake-port integration tests for the
  daemon manager, one tmux smoke scenario for end-to-end.
- **Rationale**: exactly the repo's shipped convention — every daemon feature
  (binding, watch, baton-sweep) is a TDD'd pure core + injected-ports manager +
  fakes; smoke drives real tmux.
- **Focus areas**: fire scheduling vs pause tiers; delivered-but-no-output
  derivation (including the self-masking trap); compact auto-pause on both
  harness paths; capture caps.
- **Excluded**: live-daemon restart tests (baton-gated); real provider freezes
  (simulated via fakes + a frozen-pane fixture).
- **Mock usage**: targeted fakes at the existing port seams only (`DaemonPorts`,
  `RegistryPort`, `DeliveryPort`) — the repo's injected-ports pattern; no ad-hoc
  mocking inside pure code.

### Documentation Strategy

- **Location**: `docs/how/pij-watchdog.md` (mirrors `docs/how/pij-peer-watch.md`,
  the plan-033 precedent) + pij-skill route note.
- **Rationale**: peers must be able to *discover* the pause/resume etiquette the
  turns teach.

### Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=2, D=1, N=1, F=2, T=2 (sum 10)
- **Confidence**: 0.75
- **Assumptions**: s054 P1 merges before s055 and does not touch these seams
  (takin interview, prime-verified); WS-6 vocabulary stands.
- **Dependencies**: existing daemon tick, delivery split, sidecar-store pattern;
  s054 convergence at P2-complete (re-sync agreed).
- **Risks**: see § Risks & Assumptions.
- **Phases**: 3.

### Acceptance Criteria

1. **AC-01 Universal default**: a session spawned with no watchdog configuration
   receives its first watchdog turn within interval+one tick of 20 minutes of
   quiet (no config file needed; absence of sidecar = default-on).
2. **AC-02 Self-teaching turn**: every watchdog turn body names the exact pause
   and resume commands and the "pause me if your work is done" etiquette.
3. **AC-03 Pause/resume verbs**: `pij watchdog pause [id]` stops subsequent
   fires; `pij watchdog resume [id]` restarts them; both visible in
   `pij watchdog list` and `pij state <id> --json` (a `watchdog` block).
4. **AC-04 Compact auto-pause**: delivering the `compact` remote command (either
   `--command compact` or a bare `/compact` body) auto-pauses the target's
   watchdog with `pausedBy:"compact"` on BOTH harness paths (tmux inject + pi
   command context), and that pause auto-resumes on the peer's next observed
   working transition.
5. **AC-05 Blind fire through freezes**: a frozen peer (pid alive, no output)
   keeps receiving fires on schedule; no fire is skipped, no thaw logic runs;
   when the peer produces output again the unresponsive flag clears without
   operator action.
6. **AC-06 Deterministic unresponsive**: two consecutive delivered fires with
   zero observable output (no not-busy→busy transition, no pre-injection pane
   change, no event advance; pi peers: event-advance-only per D7) mark the
   session `stalled` (`failureReason`, WS-6-aligned) and notify the
   owner/watchers exactly once via the shared stall latch (D8); recovery
   clears the latch and the reason.
7. **AC-07 Cost-bounded capture**: a watcher subscribed with default policy
   receives pane text only on anomaly fires, as a pointer file plus ≤5 inline
   head lines; captured slice is the pane tail capped at 40 lines AND 4096
   bytes (tunable per watcher, hard ceiling 200 lines/16 KiB). Tmux-paned
   peers only: watching a pi peer yields the notice without a capture slice
   (D7), stated in the notice body.
8. **AC-08 First-class exemption**: an exempt session (spawn flag or
   `pij watchdog exempt`) never receives fires and is excluded from
   watchdog-driven unresponsive derivation; exemption is visible in state/list.
9. **AC-09 Isolated proof**: every AC above is demonstrated against a temp
   daemon (isolated PIJ_HOME + fake/real-tmux mix per s051 precedent) without
   restarting the live daemon.
10. **AC-10 Delivery-split parity**: watchdog turns ride the existing ownership
    split — daemon `sendText` for bound tmux peers, durable inbox for pi/pull
    peers; pre-bind sessions are not fired at.

### Risks & Assumptions

| Item | Kind | Notes |
|------|------|-------|
| Watchdog turn masks the freeze it probes (injected text changes the pane; `lastEventAt` refresh) | risk | Pre-injection captures + excluding daemon-injected turns from activity refresh are a P1 design invariant (dossier trap) |
| s054 P2 lands `system_state` mid-stream | risk | Additive-only fields here; convergence task at P3; re-sync at takin's P2-complete checkpoint |
| Two "watchdogs" in one codebase | risk | Public surface owns the name (`pij watchdog`); the binding one is referred to as the spawn phone-home watchdog in docs; no code rename (churn + s054 overlap) |
| Turn spam on busy fleets | assumption | 20-min default ≈ 3 turns/hour/session ≈ ~60 tokens each; sessions doing active work are told to keep going (AC-02 etiquette) |
| Descriptor field ownership | risk | New fields ride the sidecar (CLI-owned, daemon-read) or are added to `writeMerged` ownership lists explicitly (F-11) |

### Open Questions

1. **Pause verb shape confirmed?** Plan assumes explicit `pij watchdog
   pause/resume` (Jordan's wording implies explicit; awaiting confirm — plan
   default stands unless overridden).
2. **Exemption mechanics**: plan assumes spawn flag `--no-watchdog` +
   `pij watchdog exempt <id>` settable any time, non-expiring. Confirm.
3. **Capture defaults**: 40 lines/4 KiB anomaly-only tail — Jordan steer
   requested; defaults chosen from the cost model in § Key decisions (D3).

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Watchdog pause-tier state machine | State Machine | Three pause tiers (self/compact/exempt) × auto-resume rules interact with WS-6 vocabulary; a wrong default silences real supervision | Does compact-pause auto-resume on working-transition hold for pi peers? Is `exempt` a fourth tier or a sidecar flag? |
| s054 `system_state` convergence | Integration Pattern | P2 unlanded but ruled; watchdog must consume, not compete (proposal § Relation to s054) | Which side owns the `stalled` stamp post-P2? Adapter now vs wait? |

### Clarifications

#### Session 2026-07-17

Recorded under pij no-modal-questions doctrine (global invariant 9): Round-1
answers were **derived from repo convention + Jordan's in-pane preamble** and
flagged inline for override rather than asked via a modal UI.

- Q: Workflow mode? → A: **Full** (CS-4; three-phase daemon feature; stream
  doctrine expects phase checkpoints + `WAITING_FOR_BUILD_CONFIG`).
- Q: Testing strategy? → A: **Hybrid** (repo convention: TDD pure cores +
  injected-port fakes + tmux smoke — the shipped shape of binding/watch/baton).
- Q: Mock usage? → A: **Targeted fakes at port seams only** (repo's
  injected-ports pattern; no mocking inside pure code).
- Q: Documentation? → A: **docs/how/pij-watchdog.md** (plan-033 precedent).
- Preamble rulings folded in (see `.harness/temp/s055/preamble-notes-jordan.md`):
  requirement #4 needs no special handling (blind fire, emergent resume);
  deterministic unresponsive detection replaces limits classification; s054
  interview authorized and completed.

## Planning Seam

_Refinement opportunities still open — recorded as evidence; the flow surfaces
and offers these, none gate:_
- Open Workshop Opportunities: Watchdog pause-tier state machine · s054
  `system_state` convergence

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | y | informs Key Findings F-01..F-11 |
| workshops/*.md | n | none yet — two opportunities tabled above |
| vendored/watchdog-enhancement-proposal.md | y | demand evidence + CLI shape; § Limits auto-resume 2–3 superseded by preamble ruling |

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No critical [NEEDS CLARIFICATION]; 3 Open Questions carry plan defaults |
| G2 | Constitution | N/A | No docs/project-rules/constitution.md |
| G3 | Architecture | N/A | No docs/project-rules/architecture.md |
| G4 | ADR Compliance | N/A | No docs/adr/ |
| G5 | Structure | PASS | All required sections present |
| G6 | Testing Alignment | PASS | Hybrid: TDD-first task ordering in P1/P2; smoke + proof in P3 |
| G7 | Domain Completeness | PASS | All three target domains existing; manifest covers all files |

### Summary

Build supervision as the repo already builds daemon features: a TDD'd pure core
(fire scheduling, pause tiers, unresponsive derivation, capture policy), a
`WatchdogManager` mirroring `PeerWatchManager` mounted in the daemon tick, a
CLI-owned sidecar so absence-means-default-on, and delivery over the existing
ownership split. Prove it end-to-end against a temp daemon (s051 precedent);
converge vocabulary with s054 at its P2-complete checkpoint.

### Key decisions (bind the phases)

- **D1 — Default-on via absent sidecar**: no per-session provisioning; the
  daemon assumes `{intervalMs: 1_200_000}` when `~/.pij/<id>/watchdog.json` is
  absent. The sidecar (CLI-owned, daemon read-only — the `WatchSidecar` pattern)
  stores only deviations: pause state, interval, exemption, watchers.
- **D2 — Three pause tiers**: `pausedBy:"self"` (explicit verb; resumes only by
  verb) · `pausedBy:"compact"` (auto; auto-resumes on next observed working
  transition) · `exempt` (never fires, excluded from derivation; spawn flag or
  verb; non-expiring). Paused is the session's **claim**, not proof — a paused
  session still gets dead/provider-failure coverage from the existing pushes.
- **D3 — Capture policy (the brief's mandatory answer)**:
  - *tail vs diff*: **tail** — a frozen pane's diff is empty; the diagnostic
    signal (limits banner, credit error) lives in the last screenful.
  - *how much*: default **40 lines ∧ 4096 bytes**, per-watcher tunable, hard
    ceiling 200 lines/16 KiB.
  - *always vs anomaly*: **anomaly-only by default** (fire flagged
    unresponsive-suspect, or a stall/dead/provider transition); `--capture
    always` opt-in per watcher.
  - *transport*: pointer file under `~/.pij/<watcher>/watchdog-captures/` + ≤5
    inline head lines (pij pointer doctrine). Steady-state inline cost ≈ 0; the
    watchdog turn itself is one short paragraph (~60 tokens) per fire.
- **D4 — Self-masking guard**: unresponsive derivation compares **pre-injection**
  pane captures fire-to-fire and ignores activity attributable to the daemon's
  own injected text; watchdog fires never refresh `lastEventAt`.
- **D5 — Vocabulary**: the derivation stamps the existing `failureReason:
  "stalled"` (already in `DeathReason`, WS-6-aligned); no new state words. Post
  s054-P2, the stamp becomes a `system_state` consumer (P3 convergence note).
- **D6 — Naming**: public surface is `pij watchdog …`; the spawn-binding
  watchdog keeps its code untouched and is disambiguated in docs as the spawn
  phone-home watchdog.
- **D7 — Paneless (pi) peers degrade deterministically** *(validation-001 M2)*:
  pi peers have no pane, so for them the unresponsive derivation collapses to
  **event-advance-only** (fires delivered via inbox + no `events.ndjson`
  advance across 2 consecutive fires ⇒ stalled; `preCaptures`/busy inputs are
  absent, never faked) and pane capture is **not applicable** — a watcher
  subscribing to a pi peer gets the notice without a capture slice, stated in
  the turn body. `evaluateResponse` takes an explicit input-availability shape
  so the split is typed, not implied.
- **D8 — One stall story, one latch** *(validation-001 M3)*: the existing
  whole-life working-gated stalled push (`daemon.ts` `pushWholeLifeTransition`)
  and the new watchdog-driven derivation share the **same per-session
  transition latch and the same `failureReason:"stalled"`** — whichever fires
  first claims the latch, so at most one stalled notice per episode; recovery
  (any real output) clears the shared latch and the reason for both. The
  `DeathReason` doc comment ("working but silent", `types.ts:55`) is updated to
  the broadened meaning: *should be responding but demonstrably isn't* —
  vocabulary unchanged (WS-6), semantics widened.

### Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `.pi/extensions/pij/core/watchdog.ts` (new) | pij-messaging | internal | Pure core: sidecar types, fire scheduling, pause tiers, unresponsive derivation, turn builder, capture policy |
| `.pi/extensions/pij/core/watchdog.test.ts` (new) | pij-messaging | internal | TDD suite for the pure core |
| `.pi/extensions/pij/core/types.ts` | pij-messaging | contract | Additive: `WatchdogSidecar`, descriptor `lastWatchdogFireAt?` |
| `.pi/extensions/pij/core/daemon/watchdog-manager.ts` (new) | pij-control-plane | internal | Manager mirroring `PeerWatchManager`: reconcile, fire, capture, notify |
| `.pi/extensions/pij/core/daemon/watchdog-manager.test.ts` (new) | pij-control-plane | internal | Fake-port integration tests |
| `.pi/extensions/pij/daemon.ts` | pij-control-plane | internal | Mount manager in `tick()`; compact auto-pause at inject seam; exclude watchdog turns from activity refresh |
| `.pi/extensions/pij/core/daemon/router.ts` | pij-control-plane | internal | Compact-command pause hook (tmux path) |
| `.pi/extensions/pij/core/session.ts` | pij-messaging | internal | pi-path compact auto-pause: the `compact` command executes in `onInbound` → `ports.pi.compact()` (~line 376) — hook `applyCompactPause` there (validation-001 M1) |
| `.pi/extensions/pij/index.ts` | pij-control-plane | internal | watchdog turn framing for pi peers |
| `.pi/extensions/pij/core/cli.ts` | pij-messaging | contract | `pij watchdog status/pause/resume/exempt/watch/unwatch/list` + spawn `--no-watchdog` |
| `.pi/extensions/pij/core/state.ts` | pij-messaging | internal | Additive: watchdog-aware stall inputs (delivered-fire evidence) |
| `docs/how/pij-watchdog.md` (new) | pij-skill | contract | Etiquette + verbs + capture policy doc |
| `docs/domains/pij-control-plane/domain.md`, `docs/domains/pij-messaging/domain.md`, `docs/domains/domain-map.md` | (registry) | cross-domain | Contract updates for the new surface |
| `harness/scripts/smoke.ts` (extend) | pij-control-plane | internal | One end-to-end watchdog smoke scenario |

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | Freeze invisible by design: working-gated staleness (F-01) + transient-quota→`unknown` (F-06) | Unresponsive derivation keyed on delivered fires, not state or banners |
| 02 | Critical | Observer can mask the freeze: injected turns change pane + could refresh activity (dossier trap) | D4 pre-injection captures; fires never refresh `lastEventAt` |
| 03 | High | `PeerWatchManager` + `WatchSidecar` is the shipped template (F-07) | Mirror it exactly: store/reconcile/deliver/dispose + CLI-owned sidecar |
| 04 | High | `paneWentBusy` (F-04) + `paneSig` (F-03) already give delivered-but-no-output primitives | Compose, don't reinvent; capture text is already in hand per tick |
| 05 | High | Compact has exactly two execution seams (F-08: router inject; pi command context) | Hook both; one shared pure `applyCompactPause` |
| 06 | Medium | `writeMerged` ownership semantics (F-11) | Watchdog state lives in the sidecar; only `lastWatchdogFireAt` joins the descriptor, daemon-owned |
| 07 | Medium | s054 P1 clear of these seams; P2 `system_state` is the future consumption seam (H-02/H-03) | Additive now; convergence note + re-sync at P2-complete |

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | Pure watchdog core | pij-messaging | TDD the sidecar types, fire scheduler, pause tiers, unresponsive derivation, turn builder, capture policy | None |
| 2 | Daemon manager + CLI surface | pij-control-plane | Mount a `WatchdogManager` in the tick, hook compact both paths, ship the verbs and state surfaces | Phase 1 |
| 3 | Isolated proof, parity & docs | pij-control-plane | Temp-daemon end-to-end proof of every AC, smoke scenario, docs, s054 convergence notes | Phase 2 |

#### Phase 1: Pure watchdog core

**Objective**: Everything decidable without I/O exists as TDD'd pure functions.
**Domain**: pij-messaging
**Delivers**: `core/watchdog.ts` + tests; additive types
**Depends on**: None
**Key risks**: pause-tier semantics subtleties (D2); self-masking guard correctness (D4)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Tests: sidecar defaults + tiers — absent sidecar ⇒ default-on 20 min; self/compact/exempt tier transitions; compact auto-resume on working transition; exempt excluded everywhere | pij-messaging | Failing suite enumerating D1/D2 semantics | TDD first |
| 1.2 | `WatchdogSidecar` type + pure config resolution (`effectiveWatchdog(sidecar?)`) | pij-messaging | 1.1 type/config cases green | Additive to `types.ts` |
| 1.3 | Tests+impl: fire scheduler `isFireDue(cfg, lastFireAt, lastEventAt, now)` — anchored to activity, never skips during freezes, no drift | pij-messaging | Property: frozen peer gets every fire; active peer's clock re-anchors | |
| 1.4 | Tests+impl: unresponsive derivation `evaluateResponse(inputs)` → `responsive \| suspect \| stalled` with a typed input-availability shape (pane inputs optional — pi peers are event-advance-only, D7) — 2 consecutive silent fires ⇒ stalled; recovery clears; watchdog-injected text excluded (D4) | pij-messaging | Frozen-pane fixture reads stalled; paneless fixture reads stalled from event silence alone; self-masking case reads responsive only on REAL output | Finding 02; validation-001 M2 |
| 1.5 | Tests+impl: self-teaching turn builder — body carries pause/resume verbs, fire ordinal, etiquette line (AC-02) | pij-messaging | Snapshot test; body ≤ ~400 chars | |
| 1.6 | Tests+impl: capture policy `captureSlice(pane, policy)` — tail, line ∧ byte caps, hard ceiling, anomaly gating decision fn (D3) | pij-messaging | Caps enforced at boundaries (0, exact cap, over-cap, multibyte) | |
| 1.7 | Tests+impl: `applyCompactPause(sidecar, now)` shared pure hook | pij-messaging | Used by both seams in P2 unchanged | Finding 05 |

#### Phase 2: Daemon manager + CLI surface

**Objective**: The daemon fires, pauses, derives, captures, and the CLI exposes it.
**Domain**: pij-control-plane
**Delivers**: `WatchdogManager` mounted in `tick()`; compact hooks; verbs; state surfaces
**Depends on**: Phase 1
**Key risks**: tick-cost regression on large fleets; descriptor ownership (Finding 06)

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Tests: manager behaviour with fake ports — reconcile against registry, fire → deliver (tmux sendText / pi inbox split, AC-10), pre-bind skip, dispose on close | pij-control-plane | Failing fake-port suite mirroring watch.test.ts shape | TDD first |
| 2.2 | `FsWatchdogStore` (sidecar read/write + revision) + `WatchdogManager` passing 2.1 | pij-control-plane | Suite green; store is CLI-owned/daemon-read like `FsWatchStore` | Finding 03 |
| 2.3 | Mount in `daemon.ts tick()`: pre-injection capture, fire, `lastWatchdogFireAt` via `writeMerged`; watchdog turns excluded from `paneSig` activity refresh (D4) | pij-control-plane | Existing daemon tests unbroken; new tick tests green | Finding 02/06 |
| 2.4 | Unresponsive wiring: manager feeds `evaluateResponse`; stalled ⇒ `failureReason:"stalled"` + owner/watcher notice through the SHARED whole-life stall latch (D8 — at most one stalled notice per episode across both detectors); recovery clears latch + reason; broaden the `DeathReason` "stalled" doc comment in `types.ts` (AC-05/06) | pij-control-plane | Frozen-peer fake scenario: exactly one notice even when both detectors trip; clean recovery | D5/D8; validation-001 M3 |
| 2.5 | Compact auto-pause at both seams (tmux: router inject path; pi: `core/session.ts` `onInbound` → `ports.pi.compact()`) using 1.7 (AC-04) | pij-control-plane | Both-path tests: `--command compact` and bare `/compact` pause with `pausedBy:"compact"` | Finding 05; validation-001 M1 |
| 2.6 | Watcher captures: anomaly gating, pointer file `~/.pij/<watcher>/watchdog-captures/` + ≤5-line inline head, per-watcher policy (AC-07) | pij-control-plane | Capture lands as pointer + head; caps from 1.6 enforced end-to-end | D3 |
| 2.7 | CLI verbs `pij watchdog status\|pause\|resume\|exempt\|watch\|unwatch\|list` + spawn `--no-watchdog`; `pij state/list --json` watchdog block (AC-03/08) | pij-messaging | CLI tests; envelope shape documented | |

#### Phase 3: Isolated proof, parity & docs

**Objective**: Prove every AC against a temp daemon; ship discoverability.
**Domain**: pij-control-plane
**Delivers**: proof report, smoke scenario, docs, convergence notes
**Depends on**: Phase 2
**Key risks**: tmux flake in smoke (fix-or-remove doctrine); s054 P2 timing

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Temp-daemon proof harness (isolated `PIJ_HOME`, s051 precedent): scripted scenarios for AC-01..AC-08 incl. frozen-pane simulation | pij-control-plane | Proof log with per-AC verdicts committed to plan folder (AC-09) | No live daemon touched |
| 3.2 | Smoke scenario in `harness/scripts/smoke.ts`: spawn → first fire → pause → resume → compact-pause → capture | pij-control-plane | `just smoke` green locally; tmux-gated like existing scenarios | |
| 3.3 | `docs/how/pij-watchdog.md` + pij-skill route note + domain.md/domain-map contract updates | pij-skill | Docs name every verb + etiquette + capture defaults; `just local-path-check` green | |
| 3.4 | s054 convergence note: `system_state` consumption plan post-P2, recorded for the re-sync at takin's P2-complete checkpoint | pij-messaging | One-page note in plan folder reports/ | Finding 07 |
| 3.5 | Full gate: `just self-check` + `harness checks` green | pij-control-plane | Composite gate green in the worktree | |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.2, 1.3, 2.2, 2.3 | 3.1 scenario 1 |
| AC-02 | 1.5 | 3.1 scenario 1; 3.2 |
| AC-03 | 2.7 | 3.1 scenario 2; 3.2 |
| AC-04 | 1.7, 2.5 | 3.1 scenario 3; 3.2 |
| AC-05 | 1.3, 2.4 | 3.1 scenario 4 (frozen-pane sim) |
| AC-06 | 1.4, 2.4 | 3.1 scenario 4 |
| AC-07 | 1.6, 2.6 | 3.1 scenario 5; 3.2 |
| AC-08 | 1.2, 2.7 | 3.1 scenario 6 |
| AC-09 | 3.1 | proof log artifact |
| AC-10 | 2.1, 2.2 | 3.1 scenarios 1+7 (pi + tmux peers) |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Self-masking derivation bug (observer refreshes what it probes) | Medium | High | D4 invariant TDD'd in 1.4 before any daemon wiring; review focus |
| Tick cost regression on large fleets | Low | Medium | Manager reuses the tick's existing pane capture; no extra tmux calls on the happy path |
| s054 P2 lands mid-stream with different `system_state` write ownership | Medium | Medium | Additive-only; D5 keeps `failureReason` semantics; convergence task 3.4 + agreed re-sync |
| tmux smoke flake | Medium | Low | Jordan's fix-or-remove doctrine; scenario gated like existing smoke |
| Turn injected mid-user-typing (tmux) | Low | Medium | Reuse existing send settle + readiness gating (only inject on ready/busy panes per current router rules) |
