# Validation Report 001 — pij-watchdog unified plan

**Target**: `docs/plans/055-pij-watchdog/pij-watchdog-plan.md`
**Artifact SHA-256**: `30f2b757bfece474283b3ed4cb9d917c65389917cbe312fc70738bd21dc96552` — **matches the frozen pin** (no mismatch; safe to validate)
**Vendored proposal SHA-256**: `e025161ce87930d6df6adc0c3dd2cae2efdf65c96be356ef316fc8a4982de76d` — matches `vendored/PROVENANCE.md` pin
**Validator**: cold, disk-derived, read-only through adjudication
**Date**: 2026-07-17

## Verdict

❌ **NEEDS ATTENTION** — 0 critical, 0 high, 3 medium.

The plan is fundamentally sound: every load-bearing claim it makes about the live daemon was verified against source, and all seven binding domain constraints from the brief are honored. The three findings are seam-accuracy and integration-completeness refinements that will bite the implementer, not design flaws. This is READY-quality work with correctable gaps.

## Validation Contract

- **Purpose / outcome**: No pij session freezes or dies silently for hours again — the daemon fabric (not per-orchestrator hand-rolls) owns a universal supervision watchdog. Quoted value: Jordan spine Seq 416/417 + 2026-07-17 preamble ("all pij sessions will auto get a watch dog at 20 mins … it just keeps polling blind … deterministically detected as unresponsive").
- **Promise**: A daemon-owned, default-on 20-min watchdog that self-teaches pause/resume, auto-pauses on compact, blind-fires through freezes with emergent resume, deterministically derives unresponsive/stalled from delivered-but-no-output, and ships cost-bounded pane capture — all provable against a temp daemon.
- **Proof target**: Contract + Implementation (a Full-mode plan with ACs, phased tasks, coverage map).
- **Upstream**: `research-dossier.md` (F-01..F-11, H-01..H-06), `original-ask.md`, `vendored/watchdog-enhancement-proposal.md` (§ Limits auto-resume 2–3 superseded).
- **Consumers**: s054 `system_state` (P2, unlanded — convergence planned not presumed); pij-skill route docs; `docs/how/pij-watchdog.md`.
- **Position**: additive-only to `types.ts` (`WatchdogSidecar`, `lastWatchdogFireAt?`); new `core/watchdog.ts` pure core + `core/daemon/watchdog-manager.ts`; new `pij watchdog …` CLI surface; reuses existing `DeliveryPort`, `writeMerged`, delivery split, `failureReason:"stalled"`.
- **Constraints / non-goals**: push-not-poll inviolate; no thaw/limit-banner parsing; WS-6 vocabulary not re-litigated; no live-daemon restart in proofs; no change to spawn-binding phone-home watchdog.
- **Sources**: the seven live-code files named in the brief, all read in full or at cited spans.

## Domain-constraint compliance (brief-binding)

| Constraint | Verdict | Evidence |
|---|---|---|
| push-not-poll inviolate (daemon fires, peers receive) | PASS | D1 default-on daemon fire; F-10 delivery split confirmed `daemon.ts:126,140,184-189` |
| paused is a claim not proof | PASS | D2 explicit: "Paused is the session's claim, not proof — a paused session still gets dead/provider-failure coverage from the existing pushes" |
| deliberate-silence exemption first-class | PASS | AC-08 + D2 exempt tier (spawn flag + verb, non-expiring, excluded from derivation) |
| NO thaw/limit-banner detection (human-ruled) | PASS | Non-Goals + D3 + AC-05 blind fire, emergent resume; supersession of vendored § Limits 2–3 recorded |
| WS-6 vocabulary not re-litigated | PASS | Non-Goals; D5 reuses existing `failureReason:"stalled"` — confirmed present `types.ts:55` |
| capture policy explicitly answered, coherent, cost-justified | PASS | D3: tail (frozen pane's diff is empty); 40 lines ∧ 4096 B default, ceiling 200/16 KiB; anomaly-only default; pointer + ≤5 head lines; cost model ~60 tokens/fire, ~3 fires/hr |
| daemon restarts baton-gated → temp-daemon-isolated proofs | PASS | AC-09 + task 3.1 (isolated `PIJ_HOME`, s051 precedent); Non-Goals bar live restart |

## Fresh-proof ledger (load-bearing claims verified against source)

| Plan/dossier claim | Source checked | Result |
|---|---|---|
| F-01 `liveness()` returns `stale` only when `working`; idle pid-alive reads `active` | `core/state.ts:33-42` | CONFIRMED |
| F-03 per-tick pane capture + `paneSig` heartbeat; visible change while working refreshes `lastEventAt` (the self-masking trap) | `daemon.ts:85-90,209-227` | CONFIRMED — trap is real at lines 222-227 |
| F-04 `paneWentBusy(pre,post)` not-busy→busy oracle | `core/readiness.ts:83-85` | CONFIRMED |
| F-05 once-latched stalled/dead push, creator-only, stall requires `state==="working"` | `daemon.ts:261-301` | CONFIRMED |
| F-06 `TRANSIENT_QUOTA_RE` → `"unknown"`, never fires provider push | `core/state.ts:94,133` | CONFIRMED |
| F-07 `PeerWatchManager` template: store-backed subs, reconcile, `DeliveryPort`, pointer files | `core/daemon/watch.ts:57-197` | CONFIRMED |
| F-08 `compact` in allow-list; tmux delivers `/compact` via `injectionText` | `core/commands.ts:12`, `core/daemon/router.ts:32-44` | CONFIRMED |
| F-09 `DeathReason` includes `"stalled"`; `classifyDeathReason` honors a `"stalled"` hint | `core/state.ts:118-135`, `types.ts:55` | CONFIRMED |
| F-10 delivery split: daemon owns bound tmux only; pi self-drives; pre-bind buffers | `daemon.ts:126,140,184-205` | CONFIRMED |
| F-11 descriptor writes go through `writeMerged` | `daemon.ts` (used throughout) | CONFIRMED |

No fabricated or contradicted claim was found. The self-masking trap the plan builds D4 around is demonstrably present in `daemon.ts:222-227`, so the mitigation is warranted, not speculative.

## Findings (ranked)

### M1 — Domain Manifest mis-locates the pi-path compact seam (MEDIUM, confidence high)
- **location**: plan lines 268-269 (Manifest) vs `.pi/extensions/pij/core/session.ts:369-378`
- **claim**: The manifest assigns the pi-path compact auto-pause hook to `index.ts` ("pi-path compact pause hook"), but the pi `compact` command is actually consumed and executed in `core/session.ts` `onInbound` (`this.ports.pi.compact()`, line 376). `index.ts` only registers the `pij_send` tool surface; it does not handle inbound command execution. `core/session.ts` is absent from the manifest entirely.
- **proof**: `session.ts:369-378` — `if (msg.command !== undefined) { … if (!isControlCommand(v.value)) { this.ports.pi.compact(); … } }`. `index.ts:56,75` is only tool description text.
- **impact**: AC-04 requires compact auto-pause on BOTH harness paths. An implementer following the manifest could wire the pi hook at `index.ts` and miss the real execution point in `session.ts onInbound`, leaving pi peers un-paused on compact.
- **smallest_fix**: Add `core/session.ts` to the manifest as the pi-path compact-pause seam (invoke `applyCompactPause` in `onInbound` before/around the `ports.pi.compact()` call); keep `index.ts` only if it genuinely does framing.
- **contract_ref**: AC-04; Domain Manifest.

### M2 — Unresponsive derivation + capture leave the pi (no-pane) path under-specified (MEDIUM, confidence medium)
- **location**: AC-06 (lines 124-128), AC-07 (129-132), tasks 1.4/1.6 (311,313)
- **claim**: `evaluateResponse(fires[], preCaptures[], busyTransitions, eventAdvance)` and AC-07 pane-text capture are inherently tmux-pane concepts. pi peers have no pane (F-10), so `preCaptures` and `busyTransitions` are structurally empty and capture (AC-07) is impossible for them; the derivation must collapse to `eventAdvance`-only for pi. The plan never states this split, and AC-10 asserts full delivery-split parity without qualifying that the *derivation* and *capture* degrade for pi.
- **proof**: `daemon.ts:184-189` (pi excluded from pane observation); `session.ts:346` (pi refreshes `lastEventAt` via `capture()` — the only pi liveness signal). The plan's own Workshop Opportunity 1 flags "does compact-pause auto-resume on working-transition hold for pi peers?", showing partial awareness but no resolution.
- **impact**: Risk of a healthy pi peer being mis-derived (if `evaluateResponse` treats absent pane signals as "silent") or an implementer assuming pane signals exist for pi. Capture for pi is a silent no-op the plan never acknowledges.
- **smallest_fix**: Add one line to D4/AC-06 stating the pi derivation reduces to event-advance only, and to D3/AC-07 that pane capture is tmux-only (pi peers: no capture). Resolve or explicitly defer the pi working-transition question workshopped in Opportunity 1.
- **contract_ref**: AC-06, AC-07, AC-10.

### M3 — New watchdog-`stalled` is not reconciled with the existing whole-life `stalled` push (MEDIUM, confidence medium)
- **location**: D5 (251-253), task 2.4 (329), AC-06 latch vs `daemon.ts:285-301`, `types.ts:55`
- **claim**: The plan reuses `failureReason:"stalled"` for the idle-frozen case, but the existing `pushWholeLifeTransition` already writes `failureReason:"stalled"` and pushes a once-latched creator notice for the *working-but-stale* case (`daemon.ts:289-300`), and `types.ts:55` documents `"stalled"` specifically as "working but silent past the stale threshold". Two independent code paths, two independent latches (`this.pushed` vs the plan's AC-06 latch), one shared descriptor field, two different trigger conditions, both notifying. The plan does not specify how the two coexist (double-stamp/double-notify avoidance, who clears whose latch on recovery, semantic overload of a reason documented as "working").
- **proof**: `daemon.ts:292-300` existing stalled latch+notify; `types.ts:55` reason semantics; plan D5 asserts reuse without addressing the existing writer.
- **impact**: Possible duplicate "stalled" notices or latch/field confusion across a session that transitions working-stall → idle-freeze; the reused reason's documented meaning ("working but silent") no longer matches the idle-frozen case it now also stamps.
- **smallest_fix**: Add a reconciliation note (D5 or task 2.4): define the interaction of the two latches, ensure single-notify per condition, and either broaden or subtype the `"stalled"` reason comment to cover idle-freeze.
- **contract_ref**: AC-06, D5.

## Thesis

**Advanced.** The plan fulfils its Promise and its claimed Contract/Implementation proof level: it is grounded in eleven verified source findings, honors all seven binding constraints, answers the mandatory capture-policy question coherently and with a cost model, and treats the unlanded s054 dependency honestly (additive now, convergence task + re-sync, not a presumed dependency). Target proof = actual proof. The three MEDIUM findings are seam-accuracy (M1), path-completeness (M2), and integration-reconciliation (M3) refinements — each correctable in-place without re-architecting, none blocking phase 1 (the pure core), which is where implementation starts.

## Consumers

- s054 `system_state`: not presumed; convergence deferred to P2-complete re-sync (task 3.4) — correct posture.
- pij-skill docs / `docs/how/pij-watchdog.md`: covered by task 3.3.
- No public exported shape lands before its consumer; additive-only to `types.ts`. Forward-compatibility: OK.

## Open decision (human judgment)

None blocking. Open Questions 1–3 (pause verb shape, exemption mechanics, capture defaults) carry sound plan defaults per the no-modal doctrine and need only confirmation, not resolution. The two Workshop Opportunities (pause-tier state machine; s054 convergence) remain optional per the flow.

---

## Re-check against Plan v1.0.1 — sha256 `14b03626cf3c9ddb942350d40ebb60c1b59a05dcd0c65f206142f3a1a6618345`

**SHA verification**: recomputed on disk → `14b03626…618345` — **matches** the coordinator's stated frozen sha. Safe to re-check.

**Re-check verdict**: ✅ **VALIDATED** — 0 critical, 0 high, 0 medium open. All three prior findings are genuinely resolved (fix verified against the real seam, not merely named). The two new decisions (D7, D8) introduce no contradiction with the seven binding constraints.

### Finding-by-finding

- **M1 (pi compact seam) — RESOLVED.** Domain Manifest line 289 now lists `.pi/extensions/pij/core/session.ts` with the exact seam I found: "`compact` executes in `onInbound` → `ports.pi.compact()` (~line 376) — hook `applyCompactPause` there". Task 2.5 names both seams precisely (tmux: `router.ts` inject; pi: `session.ts onInbound`); `index.ts` (line 290) is demoted to pi turn-framing only and no longer falsely owns the compact hook. This is the actual execution point (`session.ts:376`), so an implementer following the manifest now hooks the right place. Genuine fix, not a rename.

- **M2 (paneless pi derivation + capture) — RESOLVED.** New decision D7 makes the pi path explicit and *typed*: `evaluateResponse` takes an input-availability shape, pi peers collapse to event-advance-only (2 silent fires with no `events.ndjson` advance ⇒ stalled), pane inputs are "absent, never faked", and capture is N/A for pi with the notice stating so. AC-06 and AC-07 carry the qualifier; task 1.4 adds a paneless fixture ("reads stalled from event silence alone"). This is exactly the split I flagged as unspecified, now first-class and test-covered. Coherent with push-not-poll (daemon reads event advance; peer only receives) and with D3 (capture scoped to tmux panes — actually tightens D3's coherence).

- **M3 (stalled latch/field coexistence) — RESOLVED.** New decision D8 specifies the shared story: the existing `pushWholeLifeTransition` stalled push and the new derivation share one per-session transition latch (consistent with the existing `this.pushed: Map<string, Set<PushedTransition>>` structure in `daemon.ts`) and one `failureReason:"stalled"`; first-to-fire claims the latch ⇒ at most one notice per episode; recovery clears both. The semantic overload I flagged (`types.ts:55` "working but silent") is addressed by broadening the doc comment to "should be responding but demonstrably isn't" while keeping the WS-6 word unchanged. AC-06 and task 2.4 carry the shared-latch requirement with a success criterion ("exactly one notice even when both detectors trip"). Genuine reconciliation of the two writers.

### Binding-constraint re-scan (post-edit)

No new violation introduced. push-not-poll intact (D7 is daemon-side event reading). No thaw/limit-banner logic added. WS-6 vocabulary NOT re-litigated — D8 broadens a doc comment and widens semantics but adds no new state word ("stalled" is a WS-6 term). "paused is a claim not proof", first-class exemption, capture policy, and temp-daemon-isolated proofs all unchanged and intact. D7 in fact improves capture-policy coherence by explicitly scoping capture to tmux panes.

**Net**: the plan at sha `14b03626…` stands clean. No critical/high ever existed; the three mediums are closed. Ready to proceed.
