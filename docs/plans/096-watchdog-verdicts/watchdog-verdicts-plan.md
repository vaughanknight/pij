# Watchdog verdicts: three values, four meanings

**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-08-08
**Status**: READY
**Spec source**: unified (this file)
**Stream**: s096 `watchdog-verdicts` · wave `w1-hardening` · prime `pij-continuing-ermine`
**Branch**: `s096/watchdog-verdicts`
**Issues**: pij#161, pij#148

---

## Business Specification

### Research Context

ℹ️ No `research-dossier.md` — the explore pass was done live against the source and is
recorded here as § Key Findings. Every `file:line` in this document was opened and verified
in this worktree at `0842380`; the fleet rule *assert nothing you have not run* applies to
each one.

### Summary

The watchdog reports the health of a peer to its watcher using a three-value verdict —
`responsive`, `suspect`, `stalled`. **The type has three values but carries four meanings.**
`responsive` is currently returned for three unrelated claims with different truth
conditions:

1. *measured-alive* — independent work was observed;
2. *supervision is off* — the peer is paused or exempt;
3. *nothing was examined* — the fire gathered no evidence at all.

Only the first is what a consumer reads it as. Meaning (3) is the initialisation value at
`watchdog-manager.ts:449`, and it is delivered verbatim on any fire where no response is
outstanding — notably the first fire after a daemon restart, when the runtime state is
rebuilt fresh. **The moment supervision matters most is the moment its state is emptiest.**

The mirror image is pij#148. Activity the peer produced *in answer to a nudge* is
disqualified as **recovery** evidence — correctly, per pij#136, because the observer's own
injected turn must not fabricate recovery. But that same disqualification also discards it
as **liveness** evidence, so a seat that is supervised, honest and unemployed climbs
`suspect` → `stalled` and cannot get back, and its only self-service escape is to
misreport its own state.

**Liveness evidence and recovery evidence are different questions. The whole defect is that
one answer serves both.** This plan separates them and gives "I examined nothing" its own
token, so no consumer can read absence as health.

### Goals

- A fire that examined no evidence can never emit a healthy token.
- A seat that answers every nudge can never be labelled `stalled`.
- Absence of a reading (an empty capture, a vanished pane) is reported as absence, never
  as corroboration and never as recovery.
- The recovery disqualification (pij#136) survives **completely unweakened**.
- Both fixes proven by tests that **fail without the fix**.

### Non-Goals

- **Changing how `terminal` is set or cleared** — that latch is stream s095's
  (`core/state.ts`, `core/platform/types.ts`). This plan does **not** make eligibility
  consult it. (pij#155 is not ours.)

  > **Correction of record (prime, 2026-08-08).** An earlier version of this stream's
  > four-point proposal — *"eligibility should consult `terminal`, not just `lifecycle`"* —
  > was relayed to stream s095 as a statement of **current behaviour**. It is not. Verified:
  > `terminal` appears **zero** times in `eligible()` (`watchdog-manager.ts:190-207`). It was
  > a proposal, and it stays a proposal; see KF-12. What eligibility actually consumes is the
  > blind pid probe (KF-11), which is a stronger and more damaging seam than `terminal` ever
  > was.

- **Fixing the blind pid probe** (KF-11/KF-12). The probe is stream s095's; this stream is
  its *consumer*. The consumption is documented here so the coupling is visible, but the
  probe is not touched.
- **Rendering `unknown` in `pij list` or the status surfaces** — a wider render change
  across files this stream does not own. Consumers that would silently mis-render the new
  value are **reported**, not fixed here (the pij#153 shape).
- **Touching `core/anomalies.ts`** — stream 6 is repairing five detectors in it, including
  `status-stale` and `axis-disagreement`, which reason about the same parked-state axis.
- Renaming `consecutiveSilentFires`, reshaping the sidecar, or any drive-by refactor of the
  watchdog beyond the two defects.

### Testing Strategy

- **Approach**: **Full TDD**. The charter's definition of done is *"proven by tests that
  fail without the fix"*, which is a test-first bar, not a test-after one. Every behavioural
  task writes the failing assertion first, observes it fail against the pre-fix build, then
  makes it pass.
- **Rationale**: this is a *classification* defect — the code already runs and already
  returns a value. Nothing here is caught by types or by a crash; only an assertion about
  which token comes out can catch it. A test written after the fix cannot distinguish a
  fixed defect from a decorative assertion.
- **Both-ways rule (prime's ruling, applies to every changed assertion)**: any assertion this
  PR **edits** must be run against the pre-fix build and shown to fail *for the opposite
  reason*. An assertion that passes both before and after has stopped proving anything.
- **Focus areas**: the verdict emitted for a fire with no response outstanding; watcher
  notice text and capture policy; the pane-evidence path; the silent-vs-answered climb.
- **Excluded**: live tmux end-to-end behaviour (covered by the existing smoke composite);
  daemon bootstrap wiring (not owned).

**Mock usage**: **B — targeted only.** Reuse the existing `managerHarness()` fakes at
`watchdog-manager.test.ts:114` (in-memory store, `FakeDelivery`, injected `capturePane`,
controllable clock). No new mocking library, no mocking of the unit under test.

### Documentation Strategy

- **D — no new documentation**, plus two mandated appends that are not "new docs":
  - `docs/how/fleet/ledger.md` — the `F-500` / `W-500` / `S-500` block this stream owns.
  - The PR body — the disclosure the prime requires for every edited assertion.
- **Rationale**: the behaviour change is internal to the watchdog and is documented by the
  code comments already dense in these two files, which this plan extends in the same voice.

### Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=1, I=2, D=1, N=1, F=0, T=2 → 7
- **Confidence**: 0.85
- **Assumptions**: the two owned files are not concurrently edited by another stream (the
  partition guarantees this); the pre-fix build can be produced by `git stash` of the
  source hunk while retaining the new tests.
- **Dependencies**: none on other streams. `RuntimeState` is declared **inside**
  `watchdog-manager.ts:54`, not in `core/state.ts` — verified — so pij#148's counter needs
  no cross-stream coordination.
- **Risks**: see § Risks.
- **Phases**: 3.

### Acceptance Criteria

**Every criterion is labelled by kind** (fleet practice correction, 2026-08-08). Only one
kind can serve as evidence of the fix:

- **Behavioural** — must **FAIL** on pre-fix code, and fail as a *failure*, not as a crash.
- **New-API** — cannot fail first (it will not compile); declared as a compile-time exception.
- **Preserved-property** — must pass **before and after**; a regression guard, **never**
  evidence of the fix.

> **Gate, before any implementation begins**: every *behavioural* criterion is **run against
> the pre-fix tree and watched to fail**, with the failure output recorded in the execution
> log. Not reasoned about — run. A behavioural criterion that passes on the unfixed tree is
> testing something that was already true and must be rewritten or discarded.

| AC | Kind | Criterion |
|----|------|-----------|
| AC-01 | **Behavioural** | A watchdog fire on which no response was outstanding emits a notice that **positively identifies** `unknown` — and the notice is delivered, so the criterion cannot be met by absence. |
| AC-02 | Structural | No verdict reaches a consumer from a variable initialiser — every emitted verdict comes from a branch that examined something. Proven by construction (no initialiser exists), not chiefly by a harness test. |
| AC-03 | **New-API** (compile-time) | `unknown` **structurally cannot** reach `daemon.pushWatchdogResponse` or the `failureReason: "stalled"` latch. Proven by a deliberate temporary violation failing to compile, then reverted. |
| AC-04 | **MUTATION-ONLY** | A no-evidence fire does not trip anomaly-mode watcher capture, **proven selectively**: on the same fire an `always`-policy watcher receives exactly one notice while the anomaly-policy watcher receives none. *(Relabelled twice. First from behavioural → preserved-property after the pre-fix gate showed it could not fail. Then → **mutation-only** (s100's fourth label): pre-fix there **is no no-evidence verdict** — the fire emits `responsive` — so the claim has no pre-fix form at all. Its pre-fix pass and its post-fix pass are **different propositions**, which is why the pre-fix run tells us nothing about the mechanism. Its **sole** proof is the named mutant: force the anomaly predicate true for every verdict; AC-04 must go RED.)* |
| AC-05 | **Behavioural** | An empty capture from a session that *has* a `paneId` is reported to the watcher as unavailable, never rendered as a capture with content. |
| AC-06 | **Behavioural** | A pane whose capture transitions non-empty → empty is never read as recovery: no `responsive` reaches `onResponse`. *(The manager-level harness observes the absence of the event; it cannot inspect the daemon's persisted latch — the latch consequence is documented via KF-02's `file:line` trace, not claimed as harness-proven.)* |
| AC-07 | **Behavioural** | A seat whose `statusAt` advances after every fire never reaches `stalled`; it caps at `suspect`, indefinitely. |
| AC-08 | **Preserved-property** | The recovery disqualification is unchanged: watchdog-attributed activity still never yields `responsive`. Existing pij#136 assertions pass untouched. |
| AC-09 | **Preserved-property** | An **alive** peer whose only activity is watchdog-caused — an injected pane redraw *and* a delivery receipt advancing `lastEventAt` — but which never writes a status card, still reaches `stalled`. *(A peer whose **process** is gone never reaches this state machine at all — it is disposed at `:238`; see KF-16.)* |
| AC-10 | Process | Every assertion this PR edits (**1.1b, 1.8, 2.5, 3.5**) is run against the pre-fix build, fails there for the opposite reason, and that result is stated in the PR body naming the assertion and why its premise changed. |
| AC-11 | Process | Every consumer and every **document** stating the old behaviour that this PR does not fix is reported to the prime as a pij#153-shape finding — including KF-17's two docs. |
| AC-12 | Process | `docs/how/fleet/ledger.md` carries this stream's `F-500` / `W-500` / `S-500` rows, each with evidence and cost. |
| AC-13 | Process | `npm run typecheck`, `npm run lint`, `npm test` green; PR open; **not merged**. |

### Risks & Assumptions

See § Risks in the implementation half.

### Open Questions

| # | Question | Status |
|---|----------|--------|
| OQ-1 | May this stream edit `docs/plans/055-pij-watchdog/proofs/run-proofs.ts:922`, outside its owned set? | **Resolved** — prime ruled yes, conditional on the both-ways bar and PR disclosure. See § Clarifications. |
| OQ-2 | Should the pane-existence check call `tmux list-panes` through a new injected dep? | **Resolved** — prime ruled: take the in-bounds version, do not wire the dep. State the residual (a genuinely-empty live pane would be misread) in the PR. See KF-04. |
| OQ-3 | Should eligibility consult `terminal` as well as `lifecycle` (the original item 4)? | **Out of scope, and explicitly a proposal — not current behaviour.** See KF-12 and the correction-of-record in § Non-Goals. The real seam is the blind pid probe (KF-11), owned by s095. |

### Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Should `suspect` mean "alive but unemployed" permanently, or should an answered-but-idle seat eventually reach a distinct fourth state? | State Machine | This plan caps the climb at `suspect` forever for an honest idle seat. That is correct against pij#148 but leaves `suspect` doing double duty (*climbing toward stalled* vs *alive but idle*) — arguably the same conflation one axis over. | Does a permanently-`suspect` seat need its own token? Does the board render it distinguishably? |

**Not workshopped in this PR** — the charter fixes the target (`cap the climb at suspect`)
and the prime approved the four-point plan as written. Recorded as a genuine follow-on.

### Clarifications

#### Session 2026-08-08

- **Q (Round 1, all four standard questions)** — Workflow Mode, Testing Strategy, Mock
  Usage, Documentation Strategy.
  **A**: **Agent-defaulted, not asked.** A PM seat in this fleet never uses a modal question
  UI, and the onboarding brief's §5 is explicit: *"Do not block on non-blocking questions. If
  you can proceed on a reasonable default and the answer only affects polish, proceed and
  mention it."* All four are determined by the charter and repo doctrine: Full mode (three
  provable outcomes with review checkpoints), Full TDD (the charter's *"fail without the
  fix"* bar), targeted mocks (the existing harness already injects every port), no new docs
  (plus the mandated ledger append). Mentioned to the prime rather than asked.
- **Q**: May this stream edit `docs/plans/055-pij-watchdog/proofs/run-proofs.ts:922`, which
  asserts `startsWith("watchdog responsive:")` on the *first* daemon tick's always-mode
  notice — a file outside the owned set, whose premise this fix invalidates?
  **A (prime, verbatim in substance)**: Yes — nobody in the wave owns
  `docs/plans/055-pij-watchdog/proofs/`, and sequencing a one-line assertion to another seat
  would cost more than it protects. **But not as a flip.** The assertion's *intent* — that
  always-mode capture delivers a notice for a fire — survives the fix; only its *premise* —
  that a first fire is healthy — does not. The updated assertion **must fail against the old
  code for the opposite reason**; if it passes against both builds it has become decoration.
  **Prefer strengthening over retargeting**: the proof currently cannot distinguish *a
  healthy fire emitted a notice* from *a no-evidence fire emitted a healthy notice* — which
  is precisely the defect being fixed — so after the change it should be two assertions
  where there was one. Name it in the PR: which assertion changed, what it proved, why its
  premise changed, and the both-ways result.
- **Q**: Is the charter's *"resolve the pane against `tmux list-panes` before grading"*
  achievable inside the owned files?
  **A**: Not as literally stated — `WatchdogManager` has no tmux access beyond the injected
  `capturePane`, and adding a dep means wiring it in `daemon.ts`, which this stream does not
  own. An in-bounds mechanism with the same force exists and is used instead (KF-04);
  reported to the prime as a deviation in mechanism, not in outcome.

---

## Planning Seam

_Refinement opportunities still open — recorded as evidence; none gate:_

- Open Workshop Opportunities: **one** — whether a permanently-`suspect` idle seat needs its
  own token (recorded above, deliberately not workshopped in this PR).

| Artifact | Present? | Effect on the plan |
|----------|----------|--------------------|
| research-dossier.md | n | Explore was done live against source; findings recorded as § Key Findings with verified `file:line`. |
| workshops/*.md | n | None for this stream. |
| Fleet briefs (`00-fleet-onboarding.md`, `05-watchdog-verdicts.md`) | y | **Authoritative** — file ownership, scope bounds, the four approved points, the both-ways bar. |
| pij#161 / pij#148 issue bodies | y | Cited `file:line` re-verified in this worktree; drift noted in KF-08. |
| `.harness/records/retro/2026-07-29/005.md` | y | Pre-existing record of the exact stale-proof hazard this PR walks into (KF-03). |

---

## Implementation Plan

### Gate Matrix

| Gate | Check | Status | Notes |
|------|-------|--------|-------|
| G1 | Clarify | PASS | No `[NEEDS CLARIFICATION]` markers remain; OQ-1 and OQ-2 both resolved. |
| G2 | Constitution | N/A | No `docs/project-rules/constitution.md` (only `harness.md`, `agent-harness.md`). |
| G3 | Architecture | N/A | No `docs/project-rules/architecture.md`. |
| G4 | ADR Compliance | N/A | No `docs/adr/` in this repo. |
| G5 | Structure | PASS | All required sections present and populated. |
| G6 | Testing Alignment | PASS | Full TDD declared; every criterion labelled behavioural / new-API / preserved-property; every behavioural criterion gated on a recorded pre-fix failure **run, not reasoned**; assertions bound by § Assertion discipline (positive identification, never existence or a bare negative). |
| G7 | Domain Completeness | N/A (domains off) | Domain mode OFF — not requested, `HARNESS_DOMAINS` unset. Task-table Domain columns carry `—`. |

### Summary

Give "I examined nothing" its own verdict token, remove the initialiser that lets it
masquerade as health, and make the compiler prove that token can never reach the failure
latch. Then stop treating an unreadable pane as a reading: an empty capture is reported as
unavailable, and a pane that vanishes is not recovery. Finally, split liveness evidence from
recovery evidence using the one signal the observer cannot fabricate — **`statusAt`, which
moves only when the peer itself runs `pij report`** — so a seat that answers every nudge caps
at `suspect` instead of climbing to `stalled`, leaving `stalled` meaning *silent*, which is
what it should always have meant. The pij#136 recovery disqualification is preserved exactly.

> **The first design of Phase 3 was refuted by independent validation before implementation.**
> It keyed on `lastEventAt`, which the *delivery plumbing itself* advances (KF-13) — so the
> obvious fix for pij#148 would have made `stalled` **unreachable** for a wedged peer,
> converting a false negative into a false positive, and it would have shipped green. The
> refutation and the replacement signal are recorded as KF-13/KF-14 rather than quietly
> corrected, because the next person to fix a watchdog will reach for `lastEventAt` too.

### Assertion discipline — discriminate on content, never on existence

> Fleet relay from s097, and it applies to this stream by construction.

**An assertion over a set is not evidence about a member.** s097 had a criterion pass on
pre-fix code because its fixture also tripped a *neighbouring* row of the same kind — it
measured a row it did not write, in a test named for the row it did.

**Any fix that adds a member to an existing set makes set-level assertions uninformative by
construction**, and this plan adds `unknown` to `WatchdogResponse` — a new member of an
existing enum whose consumers branch on it, emitting into a channel that already carries
`responsive` / `suspect` / `stalled` notices. Two consequences, binding on every test here:

1. **Never assert "a notice was emitted" or "the watcher received something."** Those cannot
   distinguish the new case from the three that already existed.
2. **Never rest on a bare negative** (*"the notice does not say `responsive`"*). A negative is
   satisfied by **absence** — no notice, a delivery failure, an unrelated early return — so it
   passes for reasons that have nothing to do with the fix. Every no-evidence assertion must
   **positively identify** the `unknown` verdict by its distinguishing content, *and*
   separately assert the notice was delivered at all.

The same fact seen from the source side is KF-05: `response !== "responsive"` is a
**set-level predicate**, which is precisely why adding a member silently changed its meaning.
The stale-consumer defect and this testing trap are one fact viewed from two directions.

### Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| KF-01 | **Critical** | **The no-evidence verdict reaches the watcher notice only — it never reaches the failure latch.** `onResponse` is invoked *only* inside `if (state.awaitingResponse)` (`watchdog-manager.ts:469`) and from the two deliberate paths `reportSustainedLiveness` (`:557`) and `reportRealRecovery` (`:568`). The initialised value at `:449` flows solely into `notifyWatchers`. So `daemon.ts:800`'s `if (event.response === "responsive")` is never reached with it. | pij#161 is a **watcher-notice** defect, not state corruption. Fix is smaller and lower-risk than the issue implies — but the severity is unchanged: a watcher told a dead seat is healthy is the failure the watchdog exists to prevent. |
| KF-02 | **Critical** | **A pane that disappears is currently read as pane activity, and that path *does* corrupt state.** `watchdog-manager.ts:443-447`: `paneChanged` is a raw string inequality, so a capture going `"…text…"` → `""` (a dead pane — see KF-04) sets `paneChanged = true`; with no fire outstanding `paneChangeWasWatchdog` is `false`, so `reportRealRecovery` fires, which calls `onResponse` with `"responsive"` (`:568`), which **clears `failureReason: "stalled"`** at `daemon.ts:800-806`. | Phase 2. This is a **second, distinct instance of the #161 family that KF-01 does not cover** — here absence-as-health does reach the latch. Its own failing test. |
| KF-03 | **High** | **A real stale consumer exists outside the owned set, and TypeScript cannot catch it.** `docs/plans/055-pij-watchdog/proofs/run-proofs.ts:922` asserts the first daemon tick's always-mode notice `startsWith("watchdog responsive:")` — and that first fire is exactly the no-evidence case. **Not run by CI** (vitest `include` is `.pi/extensions/**`, `harness/**`, `skills/**`; the GitHub workflow runs typecheck/lint/`npm test`/audit only) and **not run by `harness checks`** (`harness/scripts/smoke.ts:313` invokes `run-proofs.ts --smoke`, which dispatches only `runSmokeComposite` at `:1335-1349`, never the `SCENARIOS` list containing `:922`). So the fix would leave the full 055 proof silently stale while every gate stays green — the exact hazard already recorded in `.harness/records/retro/2026-07-29/005.md`. | Phase 2, under the prime's ruling: **strengthen into two assertions**, prove both-ways, disclose in the PR. |
| KF-04 | **High** | **An unreadable pane already reads as an empty capture, in-bounds — no new dep needed.** `daemon-real-adapter.test.ts:130-136` proves `ScanFreeDaemonTmux.capturePane("%99999")` returns `""` and never throws for a pane that does not exist; `adapters/daemon-tmux.ts:231-236` maps capture failure to `""`. The manager receives this through the injected `capturePane` (`daemon.ts:253`). | Phase 2. `""` means **"no usable pane evidence"** — *not* proof the pane is gone, since a genuinely blank live pane is indistinguishable. Treating it conservatively as *unavailable* is the correct and honest reading, and satisfies the charter's point 2 **without** touching `daemon.ts` or the ports. **Residual stated in the PR.** |
| KF-05 | **High** | **The anomaly flag is computed as `response !== "responsive"`** (`watchdog-manager.ts:483`). Adding a fourth member silently makes every no-evidence fire an "anomaly", which would trigger anomaly-policy watcher captures on every first fire after a daemon restart — new noise, caused by the fix. | Phase 1. Recompute as an explicit positive test (`suspect` or `stalled`), never as `!== responsive`. This is the pij#153 shape **inside the owned file**; AC-04 pins it. |
| KF-06 | **High** | **`WatchdogResponseEvent.response` is typed as the full `WatchdogResponse`** (`watchdog-manager.ts:32-35`), and `daemon.pushWatchdogResponse` handles it as `responsive` → clear, `stalled` → latch, anything else → silent no-op (`daemon.ts:797-819`). Widening the union makes `unknown` a silent no-op there — a stale consumer in a file this stream does not own. | Phase 1. Fix **in-bounds** by narrowing the event field to `Exclude<WatchdogResponse, "unknown">`. `daemon.ts` needs no change and the compiler proves AC-03 rather than a comment asserting it. |
| KF-07 | Medium | **`evaluateResponse`'s paused/exempt early return (`watchdog.ts:194`) is dead code from the manager**: the fire path returns at `!isFireDue(...)` (`watchdog-manager.ts:412`), and `isFireDue` is `false` whenever `!cfg.enabled \|\| cfg.pausedBy !== undefined` (`watchdog.ts:164`). It is reachable only from direct unit calls — including `watchdog.test.ts:247`, *"excludes exempt peers from unresponsive derivation"*, which asserts `responsive` for a peer with 99 silent fires. | Phase 1. Meaning (2) of the four is therefore **latent, not live** — but it is the identical defect shape and a loaded gun. Change it to `unknown` and strengthen that test to the prime's bar (it is in an owned file, but the same disclosure applies). |
| KF-08 | Medium | **Issue citations verified; minor drift.** pij#148's cited `watchdog-manager.ts:508-514` is now `:507-513`; `reportSustainedLiveness` cited at `:539` is at `:541`. `watchdog.ts:194-204`, `:225`, the attribution sites `:360/:387/:445`, and pij#161's `:449` all hold exactly. | No action — recorded because the onboarding brief warns citations have drifted, and these were checked rather than assumed. |
| KF-09 | Medium | **`watchdog.test.ts:230`, *"does not let any watchdog-attributable activity mask a frozen peer"*, encodes the pij#148 defect as desired behaviour.** It asserts `stalled` for a peer with `eventAdvanced: true, eventAdvanceWasWatchdog: true` — i.e. a seat that **answered**. Its name describes pij#136 (a peer must not be masked by the observer's own traffic), but its body conflates two different signals. | Phase 3. **Split it into the two questions it conflates** — the same defect this whole plan is about, now in the test. See the Phase 3 design note. |
| KF-10 | Low | The token `"unknown"` is already this repo's word for *no positive identification* — `DeathReason` uses it as its fallback member (`core/types.ts:71`, *"fallback when no pattern matched"*). | Use `"unknown"`; it is consistent with established vocabulary, not a new coinage. |
| KF-11 | **Critical** | **The blind pid probe is an active generator of the very no-evidence fires this plan fixes.** `watchdog-manager.ts:238`: `if (!eligible(session) \|\| !this.deps.isAlive(session.pid)) this.disposeSession(session.id)`. `disposeSession` (`:254-258`) **deletes the `RuntimeState`**. So any tick where the pid probe reads absent silently drops all watchdog memory for that seat; when it reads present again the state is rebuilt fresh with `awaitingResponse: false`, and **the next fire emits the initialised `responsive`**. The file's own comment at `:524` already names the state loss (*"a tick where the peer was briefly ineligible"*) without connecting it to the verdict. | **No new work** — it is the strongest argument for Phase 1 and is recorded as such. A pid flap currently produces a health certificate; after Phase 1 it produces `unknown`, which is the honest answer. Cite in the PR. |
| KF-12 | High | **Eligibility does not consult `terminal` today — that was a proposal, never a fact.** Verified: the word `terminal` appears **zero** times in `eligible()` (`watchdog-manager.ts:190-207`). What eligibility actually consumes is the **blind pid probe** (KF-11), which has two live failure modes: a seat whose registry pid reads absent is silently **unwatched**, and a seat whose pid was **recycled** to an unrelated process is watched forever (live example: `pij-weak-gurgeh`, registry pid 952, now owned by an unrelated system process started after a reboot, so `isAlive(952)` is permanently true). | This stream's real dependency on s095 is on their **pid-probe phase**, not on `terminal`. Item 4 (*eligibility consults `terminal`*) remains a **proposal**, explicitly out of scope here, and must never be stated as current behaviour. **If it is ever done, justify it on CORRECTNESS only** — s098's profile refutes any performance argument: `eligible()` does no I/O and never appears in the tick profile; `isAlive(pid)` already retires 511 of 549 descriptors (only 2 are recycled-pid survivors), and the 507 terminal-stamped seats are retained by every consumer of `registry.list()`, not by the watchdog. The real tick cost is `daemon.ts:292` (52.5%) and `runtime-axis.ts:116` (26.2%), neither of them this stream's. Recorded so no downstream reader inherits the error. |
| KF-13 | **Critical — refuted this plan's first Phase 3 design** | **Delivering a watchdog turn makes the target's own `lastEventAt` advance, with zero model involvement.** `core/session.ts` `onInbound` injects the free-text message and then calls `emitReceipt(receipt)` unconditionally; `emitReceipt` calls `this.capture("receipt", …)`; `capture()` appends to the event log **and** `persist({ lastEventAt: … })` (`:530-536`). The receipt is authored by the **pij plumbing**, not by the peer's model. **The act of supervising writes the field supervision reads.** | **Do not** admit `lastEventAt` movement as liveness evidence. Had this plan shipped its first design, a pi peer with a live inbox receiver and a wedged model would have emitted a receipt on every nudge, been read as "answered", and made `stalled` **unreachable** — converting pij#148's false-negative into a false-positive, which for a supervision instrument is strictly worse. Phase 3 rebuilt on KF-14. **Wave convergence**: s097 independently found `lastEventAt` has **three writers and none of them means "did work"** (dominant one: the daemon observing a busy pane on a 10s throttle), and pij#172 confirms a **dead** seat's `lastEventAt` advancing every ~13s via a live seat that inherited its recycled pane id. Three contamination paths, found from three directions in one day. |
| KF-14 | **Critical** | **`statusAt` is the peer-authored signal, and it is already in the owned file.** `SessionDescriptor.statusAt` (`core/types.ts:344`) is written **only** by the CLI path — `registry-write.ts:90` maps `statusAt` to the `"cli"` writer — so it moves only when the peer itself runs `pij report`. Neither the daemon nor the delivery path can fabricate it. The manager **already tracks** it as `state.lastStatusAt` (`watchdog-manager.ts:371`), currently used only to re-anchor the schedule. | Phase 3's answered-fire signal. Not a proxy: `buildWatchdogTurn` literally instructs the peer to run `pij report now …`, so *"`statusAt` advanced since the fire"* **is** the definition of answering. Costs no new plumbing and crosses no boundary. |
| KF-15 | High | **`consecutiveSilentFires` increments on every non-`responsive` verdict** (`watchdog-manager.ts:451-468`): `state.consecutiveSilentFires = response === "responsive" ? 0 : nextSilent`. So an *answered* fire returning `suspect` would still increment the **silent** counter, and one later genuine silence could jump straight to `stalled`. | Phase 3 must specify the transition explicitly: an answered fire does **not** count as silent. Task 3.7 writes the full transition table and pins the no-op rows with a two-consecutive-fires test. |
| KF-16 | Medium | **A genuinely dead process never reaches watchdog `stalled` at all.** `watchdog-manager.ts:238` disposes any session failing `isAlive(session.pid)` *before* evaluation, and `dissolved` is ineligible (`:201-207`). Death is handled by the terminal/death machinery, not by this verdict state machine. | Wording fix throughout: the claim is *"an **alive** process that produces no response still reaches `stalled`"*, never *"a dead peer still reaches `stalled`"*. AC-09 reworded. |
| KF-17 | Medium | **Two documents state the semantics Phase 3 changes**, and neither is owned by this stream: `docs/how/pij-watchdog.md:221-228` (*"Two consecutive silent delivered fires make the peer `stalled`"* + *"no real descriptor `lastEventAt` advance"*) and `skills/pij/references/00-routing.md:179`. | **Report, do not touch** (AC-11). This is the *files-the-work-invalidates* category in its documentation form. `snapshots-check` will **not** catch it — that sensor only hashes package-vetter briefing snapshots (`harness/scripts/snapshot-check.ts:13-45`). |

### Design note — why `unknown` and not "suppress the notice"

pij#161 suggests either *"add a fourth value"* or *"suppress the notice"*. This plan takes the
fourth value, deliberately:

- Suppression makes a watcher's silence ambiguous — it would then mean *nothing happened*
  **or** *something happened that I could not grade*. That is the same absence-renders-as-
  something defect one level up, and it is the harder one to notice because there is nothing
  to look at.
- `always`-mode watchers exist precisely to receive a notice on **every** fire
  (`watchdog.ts` capture policy; proven at `run-proofs.ts:922`). Suppression would silently
  break that contract.
- A named token is greppable, testable, and shows up in the capture pointer trail. Silence
  is none of those.

### Design note — liveness vs recovery, and what actually counts as an answer

> **This section was rewritten after independent validation refuted its first version.**
> The original claim — *an event advance requires the peer to process a turn* — is **false**,
> and building on it would have been a catastrophe. See KF-13.

The separation this plan draws is **authorship**: who wrote the evidence, the peer or the
observer. Three candidate signals, and only one survives:

| Signal | Written by | Usable as liveness evidence? |
|---|---|---|
| Pane change | **The observer.** The watchdog injects text; the pane redraws with no peer involvement. | **No** — pij#136's lesson, fully in force. |
| `lastEventAt` advance | **The pij plumbing.** Delivering a turn makes the target's own session emit a *receipt* event, which persists `lastEventAt` — with **zero** model involvement (KF-13). | **No** — this was the original design's fatal error. |
| `statusAt` advance | **The peer's model.** Only the CLI writer moves it (`registry-write.ts:90` maps `statusAt` to `"cli"`), i.e. the peer ran `pij report`. Neither the daemon nor the delivery path can fabricate it. | **Yes** — KF-14. |

So `statusAt` is the answered-fire signal. It is not a proxy for *"the peer answered"*: the
watchdog turn **literally instructs the peer to run** `pij report now "<what I just did>"
"<what's next>"` (`buildWatchdogTurn`, snapshotted at `watchdog.test.ts:262`), so *"statusAt
advanced since the fire"* **is** the definition of answering.

Consequences that make this the right signal rather than merely a working one:

- A **wedged pi peer** — inbox receiver alive, model dead — emits a receipt on every nudge
  but never a status card. It still climbs to `stalled`. This is the case the original design
  would have made unreachable, and AC-09 now pins it.
- The **recovery** disqualification is untouched: watchdog-attributed activity still never
  yields `responsive`. This plan admits `statusAt` movement as proof of **life**, never as
  proof of **independent work**.
- `state.lastStatusAt` is **already tracked** in the owned file (`watchdog-manager.ts:371`,
  currently used only to re-anchor the schedule), so the signal costs no new plumbing and no
  boundary crossing.

### Phases

#### Phase Index

| Phase | Title | Primary Domain | Objective (1 line) | Depends On |
|-------|-------|---------------|-------------------|------------|
| 1 | The verdict cannot be initialised | — | Give "examined nothing" its own token and make it structurally unable to reach the failure latch or fabricate watcher noise. | None |
| 2 | Absence of a reading is not a reading | — | An empty capture is reported as unavailable, and a pane that vanishes is never recovery. | Phase 1 |
| 3 | Answered is not silent | — | A seat that answers every nudge caps at `suspect`; `stalled` comes to mean *silent*. | Phase 1 |

> **Why three and not one.** All three edit the same verdict block, which is precisely why
> they are sequenced rather than merged: each has its own *"fails without the fix"* proof, and
> landing them together makes it impossible to say which test proves which defect. Phase 2
> additionally carries the only out-of-bounds edit in this PR (KF-03), which the prime wants
> visible on its own rather than buried in a larger diff.

---

#### Phase 1: The verdict cannot be initialised

**Objective**: `unknown` exists, no verdict survives from an initialiser, and the compiler —
not a comment — proves `unknown` cannot reach the stalled latch.
**Domain**: —
**Delivers**:
- `WatchdogResponse` widened with `unknown`
- the initialiser at `watchdog-manager.ts:449` removed entirely
- `WatchdogResponseEvent.response` narrowed so `unknown` is unrepresentable there
- anomaly computed positively, not as `!== "responsive"`
- an exhaustive verdict renderer that fails to compile on a future fifth member
- `evaluateResponse`'s paused/exempt return corrected

**Depends on**: None
**Key risks**: the anomaly recomputation (KF-05) is the one place this fix could *create*
watcher noise; AC-04 exists solely to pin it.

| # | Task | Domain | Success Criteria | Kind | Notes |
|---|------|--------|-----------------|------|-------|
| 1.1a | Write the failing test: on a due fire with **no response outstanding**, the `always`-mode watcher's notice must **positively identify** the `unknown` verdict by its distinguishing content — and the test must **separately assert the notice was delivered at all**, so the criterion cannot be satisfied by absence. Use `managerHarness()` (`watchdog-manager.test.ts:114`), one tick, assert on `delivery.outbox`. | — | **Fails** against unmodified source, showing the literal `watchdog responsive:` that is the defect. Record the failure output. | **Behavioural** | AC-01. Written per § Assertion discipline — positive identification, never a bare negative. |
| 1.1b | **Strengthen the existing assertion at `watchdog-manager.test.ts:599-616`** — *"writes an always-mode capture on a healthy first due fire"*, which asserts `watchdog responsive: peer` on a **first** fire. Its premise (a first fire is healthy) is exactly the defect; its intent (always-mode delivers a notice + capture for every fire) survives. Split into: (a) the notice **and** the capture are still delivered — the surviving intent; (b) the delivered notice **is** the `unknown` verdict, identified positively by content. | — | (a) passes both builds; (b) **fails pre-fix** for the opposite reason. Record both-ways output. | (a) preserved-property, (b) **behavioural** | AC-10. **The fourth edited assertion** — found by independent validation, not by the author. Same premise as `run-proofs.ts:922`. |
| 1.2 | Write the guard: a fire that *did* examine evidence still emits `responsive` when it should, and a silent one still climbs — i.e. Phase 1 changes nothing for fires that examined something. | — | Passes before **and** after. | **Preserved-property** | AC-08. Declared as a regression guard; **never** evidence of the fix. |
| 1.3 | Add `"unknown"` to `WatchdogResponse` (`watchdog.ts:173`) with a comment stating it means *no evidence was examined* and is **never** a health claim. | — | `npm run typecheck` surfaces every non-exhaustive consumer; each is triaged into 1.4/1.5/1.6 or into the AC-11 report. | New-API | KF-10 — vocabulary matches `DeathReason.unknown`. |
| 1.4 | Remove the initialiser at `watchdog-manager.ts:449`. The verdict becomes a `const` assigned from a branch: `awaitingResponse` → `evaluateResponse(…)`, else `"unknown"`. No declaration path leaves a value unassigned. | — | `let response = "responsive"` no longer appears in the file; test 1.1a passes. | — | AC-01, AC-02. |
| 1.5 | Narrow `WatchdogResponseEvent.response` to `Exclude<WatchdogResponse, "unknown">` (`watchdog-manager.ts:32-35`) **and add the explicit narrowing branch before the event is constructed at `:469`** — TypeScript will *not* infer that `awaitingResponse` makes `"unknown"` impossible, so the guard must be written, not assumed. | — | Typecheck green with **no change to `daemon.ts`**; a deliberate temporary attempt to pass `unknown` to `onResponse` fails to compile — observe the error, then revert. | **New-API** (compile-time) | AC-03, KF-06. Compiler proves it; no comment required. *Qualification added by independent validation.* |
| 1.6 | Replace the anomaly computation `response !== "responsive"` (`:482`) with an explicit positive predicate over `suspect`/`stalled`, written as an exhaustive `switch` with a `satisfies never` default in the same style as `mutesWatchdogNudge` (`watchdog.ts:210+`). | — | A future fifth union member **fails to compile** here rather than defaulting into anomaly. Test: on one no-evidence fire, the **anomaly**-policy watcher receives nothing **while an `always`-policy watcher on the same fire receives exactly one notice** — so the absence is proven *selective*, not global. | **Behavioural** | AC-04, KF-05. The paired always-watcher exists solely to stop this passing by absence (§ Assertion discipline). |
| 1.7 | Render `unknown` in the watcher notice as an explicit no-evidence line — it must not read as a grade. Notice states that no response was outstanding and therefore nothing was examined. | — | An `always`-mode watcher on a no-evidence fire receives a notice containing neither `responsive` nor a capture presented as corroboration. | **Behavioural** | AC-01, AC-05 (partly; completed in Phase 2). |
| 1.8 | Change `evaluateResponse`'s paused/exempt early return (`watchdog.ts:194`) from `"responsive"` to `"unknown"`, and **strengthen** `watchdog.test.ts:247` (*"excludes exempt peers from unresponsive derivation"*) into two assertions: an exempt peer is never *classified* (not `suspect`, not `stalled`) **and** is never certified healthy. | — | Updated assertion **fails against pre-fix source for the opposite reason** (pre-fix returns `responsive`, so the "never certified healthy" half goes red). Record both-ways output. | **Behavioural** | AC-10, KF-07. Owned file, but same disclosure bar. |
| 1.9 | Sweep every consumer of the widened enum repo-wide **with `rg --hidden`** (the `.pi/` trap, pij#144) and classify each: compile-loud, silently mis-rendering, or unaffected. Include **documentation** (KF-17). | — | A written list with `file:line` per consumer, delivered **in the PR body**. Anything mis-rendering and not owned by this stream is reported to the prime, not fixed. | Process | AC-11, pij#153 shape. |

---

#### Phase 2: Absence of a reading is not a reading

**Objective**: an unreadable pane is reported as unread, and a pane that disappears never
produces recovery.
**Domain**: —
**Delivers**:
- empty-capture-from-a-paned-session treated as no evidence, in the grade and in the notice
- the pane-death-as-recovery path (KF-02) closed
- `run-proofs.ts:922` strengthened from one assertion into two, both-ways proven

**Depends on**: Phase 1 (needs `unknown` to exist)
**Key risks**: KF-02's path clears a real `stalled` latch today, so the fix changes
persisted state behaviour — the one place in this PR where a mistake is not merely cosmetic.
The out-of-bounds edit lands here and must be disclosed.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Write the failing test: a session **with** a `paneId` whose `capturePane` returns `""` must not have that empty read graded as health, and its watcher notice must say the capture was unavailable rather than presenting empty content. Use `setPane(id, "")`. | — | Fails against pre-fix source (which today emits a health verdict plus an empty capture pointer). | AC-05. Reproduces pij#161's live instance exactly: 0-byte capture, dead pane. |
| 2.2 | Write the failing test for KF-02: drive a capture transition non-empty → `""` with **no** fire outstanding; assert `reportRealRecovery` does **not** fire, i.e. no `responsive` lands in `responses[]`. | — | Fails against pre-fix source, where the string inequality makes a vanished pane look like activity. | AC-06. This is the state-corrupting half of the family. |
| 2.3 | Treat `paneAvailable && capture === ""` as **pane unreadable** in the manager: exclude it from `paneChanged` (so it can never be recovery) and from the evidence passed to `evaluateResponse`. | — | Tests 2.1 and 2.2 pass; existing pane-delta recovery tests still pass unchanged. | AC-05, AC-06, KF-04. In-bounds — no new dep, no `daemon.ts` change. |
| 2.4 | Make the watcher notice distinguish *capture unavailable* from *capture disabled by policy* and from *paneless target* (`watchdog-manager.ts:590-604` currently has two branches; this needs a third). | — | Three distinct notice lines, one test each. | AC-05. |
| 2.5 | **Strengthen** `docs/plans/055-pij-watchdog/proofs/run-proofs.ts:922` into **two** assertions per the prime's ruling: (a) a real fire still delivers its always-mode notice — the intent that survives; (b) a **no-evidence** fire delivers a notice that **positively identifies** the `unknown` verdict — the distinction the proof could not previously make. | — | (a) passes both builds; (b) **fails against pre-fix** for the opposite reason. Run the **full** `run-proofs.ts` (no `--smoke`) both ways and record output. | (a) preserved-property, (b) **behavioural** | AC-10, KF-03. **The only out-of-bounds edit in this PR** — approved by the prime, disclosed in the PR body. |
| 2.6 | Verify the full `run-proofs.ts` suite is green post-fix and that `harness/scripts/smoke.ts`'s `--smoke` path is unaffected. | — | Full proof run exits 0; `just smoke` unaffected. | KF-03. Guards against fixing the assertion and breaking a sibling scenario. |

---

#### Phase 3: Answered is not silent

**Objective**: a seat that answers every nudge cannot reach `stalled`; `stalled` comes to
mean *silent*.
**Domain**: —
**Delivers**:
- an answered-fire signal derived from **`statusAt`** (KF-14) on `RuntimeState`
- `evaluateResponse` capping the climb at `suspect` when the peer answered
- an explicit silent/answered transition table, with the no-op rows pinned
- `watchdog.test.ts:230` split into the two questions it conflates

**Depends on**: Phase 1
**Key risks**: over-application. The first design of this phase keyed on `lastEventAt` and
was **refuted** (KF-13) — it would have made `stalled` unreachable for a wedged peer. AC-09
is the guard against that whole class and is written **first**.

| # | Task | Domain | Success Criteria | Kind | Notes |
|---|------|--------|-----------------|------|-------|
| 3.1 | Write the AC-09 guard **before** the fix: a peer whose only activity is watchdog-caused — an injected **pane redraw** *and* a delivery **receipt** advancing `lastEventAt` — but which never writes a status card, still reaches `stalled`. | — | **Passes pre-fix and post-fix.** | **Preserved-property** | The anti-over-application guard. Directly encodes the KF-13 refutation as a permanent test. **Never evidence of the fix.** |
| 3.2 | Write the AC-07 test: a seat whose `statusAt` advances after every fire never returns `stalled` across many consecutive fires. | — | **Fails pre-fix** (returns `stalled` at `consecutiveSilentFires >= 2`); passes post-fix as `suspect`. Record the pre-fix failure output. | **Behavioural** | The load-bearing test of pij#148. |
| 3.3 | Extend `RuntimeState` (`watchdog-manager.ts:54`) with an answered-since-last-fire flag driven by the **existing** `session.statusAt !== state.lastStatusAt` comparison at `:371`; pass it into `evaluateResponse` as a new input. | — | Typecheck green; **no** change to `core/state.ts`, `core/platform/types.ts`, or `session.ts`. | — | KF-14. `RuntimeState` and `lastStatusAt` are both already local to the owned file — boundary verified. |
| 3.4 | In `evaluateResponse` (`watchdog.ts:193-204`), gate the `stalled` return on the peer having produced **no** answering status advance. Leave the recovery block at `:194-198` **byte-for-byte unchanged**. | — | Test 3.2 passes; every existing `evaluateResponse` test except the one split in 3.5 passes untouched. | — | AC-07, AC-08. pij#136 explicitly not weakened. |
| 3.5 | **Split** `watchdog.test.ts:230` (KF-09) into the two questions it conflates: (a) watchdog-caused activity **without** a status advance → still `stalled` (its true pij#136 intent, now stated precisely); (b) a peer that **answered** (status advance) → `suspect`, never `stalled`. | — | (a) passes both builds; (b) **fails pre-fix** for the opposite reason. Record both-ways output. | (a) preserved-property, (b) **behavioural** | AC-10. Disclose with 1.1b, 1.8 and 2.5. |
| 3.6 | Confirm `suspect` remains a no-op in `daemon.pushWatchdogResponse` (`daemon.ts:797-819`), so an answered-but-idle seat never acquires `failureReason`. Read-only verification, recorded **in the PR body**. | — | Stated with `file:line` evidence. | — | **No edit to `daemon.ts`.** Boundary respected. |
| 3.7 | Write the explicit **silent/answered transition table** and fix KF-15: an answered fire must **not** increment `consecutiveSilentFires` (`:451-468` currently increments on every non-`responsive` verdict). Pin the no-op rows with a *many answered fires, then one genuine silence* test, asserting the peer resumes the climb at `suspect` rather than jumping to `stalled`. | — | Transition table in the plan; test fails pre-fix. | **Behavioural** | KF-15, and the prime's *"the states you did not think about are where the storm lives"*. |

**Silent/answered transition table** (task 3.7 — the no-op rows are the ones that bite):

| Fire outcome | `statusAt` advanced? | Verdict | `consecutiveSilentFires` |
|---|---|---|---|
| Real (non-watchdog) activity | any | `responsive` | reset to 0 |
| No real activity, peer answered | yes | `suspect` (capped — never climbs) | **unchanged** (not silent) |
| No real activity, no answer, 1st | no | `suspect` | 1 |
| No real activity, no answer, 2nd+ | no | `stalled` | increments |
| Many answered, then one silence | no (this fire) | `suspect`, **not** `stalled` | 1 (first genuine silence) |
| No response outstanding | n/a | `unknown` (Phase 1) | **unchanged** |

---

### Cross-phase closing tasks

| # | Task | Domain | Success Criteria | Kind | Notes |
|---|------|--------|-----------------|------|-------|
| C.1 | `npm run typecheck` · `npm run lint` · `npm test` all green. | — | Zero failures. Use `gh pr view <n> --json statusCheckRollup` (never `gh pr checks`) to read CI against the current head. | Process | AC-13, onboarding trap 2. |
| C.2 | Append this stream's `F-500` / `W-500` / `S-500` rows to `docs/how/fleet/ledger.md`, each with evidence and cost. **Must include**: (a) the prime's ruling that partition has a **third category — the files the work invalidates** (after *touches* and *creates*/F-013): tests, proofs **and documents** asserting old behaviour, owned by nobody, surfacing only when a fix makes them fail — this stream hit **six** (`run-proofs.ts:922`, `watchdog-manager.test.ts:616`, `watchdog.test.ts:230`, `watchdog.test.ts:247`, and KF-17's two docs); (b) **the tooling fights the rule** — `harness plan new` gives no control over the plan ordinal (it produced `docs/plans/watchdog-verdicts` with no `096`, exactly the collision the onboarding brief warns six PMs about), and the `builder/plan` dd schema resolves nowhere in this repo (`harness dd schema list` → `[]`), so the dd path degrades while every existing pij plan is markdown anyway; (c) **the win**: independent validation refuted the obvious fix for pij#148 before a line was written (KF-13). | — | Rows present, append-only, ids from the 500 block. | Process | AC-12. **Boundary note**: this file is outside the *source* ownership set, but the onboarding brief §6 explicitly mandates the append *"in your own PR"* and designs it to be append-only so six PMs merge cleanly. Sanctioned by the brief, not an exception this stream took. |
| C.3 | Open the PR with the disclosure section: **every** edited assertion (**1.1b, 1.8, 2.5, 3.5**) named, what it proved, why its premise changed, and the both-ways result; the AC-11 stale-consumer + stale-document report; the **KF-04 residual** (a genuinely-empty live pane would be misread — practically unreachable, stated rather than hidden); the **KF-12 correction of record** (eligibility does not consult `terminal`; item 4 was a proposal); and **KF-13** (the refuted first design, recorded so the next reader does not re-derive it). **Do not merge.** | — | PR open, CI green, merge left to the prime. | Process | AC-10, AC-11, AC-13. |

### Acceptance Coverage Map

| AC | Covered by | Verified in |
|----|-----------|-------------|
| AC-01 | 1.1a, 1.1b, 1.4, 1.7 | Notice positively identifies `unknown`, and is delivered |
| AC-02 | 1.4 | Absence of any verdict initialiser in the file |
| AC-03 | 1.5 | Compile error on a deliberate temporary violation |
| AC-04 | 1.6 | Anomaly watcher silent **while** always watcher notified on the same fire |
| AC-05 | 2.1, 2.3, 2.4 | Notice says unavailable; no empty capture rendered |
| AC-06 | 2.2, 2.3 | No `responsive` in `responses[]` on pane disappearance |
| AC-07 | 3.2, 3.3, 3.4, 3.7 | Repeated `statusAt`-answered fires never yield `stalled` |
| AC-08 | 1.2, 3.1, 3.4 | Existing pij#136 assertions pass untouched |
| AC-09 | 3.1 | Watchdog-caused pane redraw **and** receipt advance still reach `stalled` |
| AC-10 | 1.1b, 1.8, 2.5, 3.5, C.3 | Both-ways runs recorded; PR disclosure |
| AC-11 | 1.9, C.3 | Consumer **and document** list with `file:line`; report to prime |
| AC-12 | C.2 | Ledger rows present |
| AC-13 | C.1, C.3 | Green CI on current head; PR open, unmerged |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| The fix creates new watcher noise: `unknown` counts as an anomaly and triggers captures on every first fire after a daemon restart. | **High** if unguarded | High — a fix for a false-health defect that spams every watcher would be worse than the defect | KF-05 / task 1.6: compute anomaly as an explicit positive predicate with `satisfies never`, plus AC-04 as a dedicated test. |
| Over-applying the pij#148 cap to observer-fabricable activity would resurrect pij#136 and mask a genuinely frozen peer. | Medium | **Critical** — reintroduces the exact defect the disqualification exists to prevent | AC-09 / task 3.1 written **first** and passing both builds; the cap keys strictly on **`statusAt`** (peer-authored, CLI-written), never on pane signals and never on `lastEventAt` (KF-13). |
| An edited assertion silently becomes decoration — passing before and after, proving nothing. | Medium | High — an assertion edited inside a fix PR is the easiest place to hide a regression | The prime's both-ways bar on all three edited assertions (1.8, 2.5, 3.5), each run against the pre-fix build, results stated in the PR. |
| A stale consumer outside the owned files mis-renders `unknown` and nobody notices, because TypeScript cannot see a string parser. | Medium | Medium | Task 1.9's `rg --hidden` sweep; KF-03 already found the one in `run-proofs.ts`. Anything unowned is reported to the prime (pij#153), not silently fixed. |
| A boundary violation into `core/anomalies.ts`, `core/state.ts`, or `daemon.ts` creates a merge conflict for a stream that does not know this one exists. | Low | High | Every task names its file; KF-04 and KF-06 were both re-designed specifically to stay in-bounds; 3.6 is explicitly read-only. |
| A **live** pane that renders genuinely empty is misread as unreadable (the KF-04 residual). | Low | Medium | Practically unreachable — a live pane carries a prompt, and pij#161's live instance was a 0-byte capture from a pane that did not exist. **Stated explicitly in the PR body** rather than left for a reviewer to find. |
| A reader inherits the corrected claim that eligibility consults `terminal`, and builds on it. | Medium | Medium | KF-12 records the correction with the zero-occurrence verification; the Non-Goals carry an explicit correction-of-record block. Item 4 is labelled a proposal everywhere it appears. |
| `git stash`-based pre-fix builds accidentally revert the new tests too, making the both-ways run meaningless. | Medium | Medium | Revert only the **source** hunk, keep the test file, and record the exact command used in the execution log. |

---

## Notes for the implementing pair

- **Owned files, exclusively**: `.pi/extensions/pij/core/watchdog.ts`,
  `.pi/extensions/pij/core/daemon/watchdog-manager.ts` (and their `.test.ts` siblings).
  One approved exception: `docs/plans/055-pij-watchdog/proofs/run-proofs.ts` (task 2.5 only).
- **Never** touch `core/anomalies.ts`, `core/state.ts`, `core/platform/types.ts`,
  `core/cli.ts`, `cli.ts`, `pa-capability.ts`, `daemon.ts`, or the daemon bootstrap. If a fix
  seems to require it, stop and ask the prime.
- **Search with `rg --hidden`** — the entire extension source is under `.pi/` and a plain
  `rg` reports it as absent (pij#144).
- **Read CI with `gh pr view <n> --json statusCheckRollup`**, never `gh pr checks` (reports
  superseded results after a re-run).
- **Assert nothing you have not run.**
