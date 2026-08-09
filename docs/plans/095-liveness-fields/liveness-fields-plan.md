# Liveness fields — a blind probe whose output is latched

**Mode**: Full
**Plan Version**: 1.0.0
**Created**: 2026-08-08
**Status**: READY
**Spec source**: unified (this file)
**Stream**: s095-liveness-fields · branch `s095/liveness-fields`
**Issues**: pij#142, pij#155 · **Related, out of scope**: pij#171, pij#154, pij#141
**Research**: 📚 Incorporates findings from `research-dossier.md` (all measurements re-run locally 2026-08-08)

---

## Business Specification

### Problem

pij cannot answer "is this seat's agent alive?" — and does not know that it cannot.

Two defects compose inside a single function, `reconcileDeaths()` in
`.pi/extensions/pij/core/daemon/death-reconciler.ts`:

```ts
if (descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined) continue; // LATCH  (#155)
if (input.isAlive(descriptor.pid)) continue;                                             // PROBE  (#142)
```

- **The probe cannot return the contrary answer** (#142). `isAlive` is `process.kill(pid, 0)` —
  an existence test on a number that is not reliably the agent.
- **The latch makes its answer permanent** (#155). Once `terminal` is stamped, the descriptor
  is skipped on every subsequent tick and the observation is never revisited.

**This is not two bugs. It is a wrong answer made permanent.** Either fix alone leaves observed
behaviour unchanged: unlatching without fixing the probe re-derives the same wrong answer next
tick; fixing the probe without unlatching leaves all 15 already-stamped seats stuck forever.

### Why it matters (measured, not asserted)

| harm | evidence |
|---|---|
| A dead seat reported as actively working for 19 hours | `pij-unwilling-butterfly`: `lifecycle=bound`, `state=working`, `terminal` stamped 23:14:05Z, `status-stale` row claims "working for 1141min" |
| Live seats declared terminal | `pij-mental-dajeil`, `pij-related-koala` carry a `terminal` record while their `claude` process runs **now** |
| The wrong answer accumulates | the latched population grew **4 → 15** in ~24h; there is no clear-on-return path, so it can only grow |
| A seat that can never be declared dead | `pij-weak-gurgeh` holds pid 952, recycled to `IntuneMdmDaemon` at the reboot — `isAlive(952)` is `true` forever |
| One seat already destroyed | per #142, a supervisor read `-zsh` on a registry pid, concluded the agent was gone, and force-closed a working pane |

The last row is the class-defining harm: **the probe produced a correct answer for an invalid
reason, which validated the method**, and the method was then applied where it destroyed a live
seat. Agreement is not evidence unless disagreement was possible.

### The refutation that reshapes the fix

pij#142 proposes `pgrep -P <pid>` as the correct probe. **Measured across 23 live seats, the
agent sits AT the registry pid for 16 and one level below it for 7** — and the split tracks the
spawn path (`--session-id` fresh spawn vs `--resume` under a shell), not the harness. A probe
hardcoded at one level would be blind in exactly the opposite direction, returning false-dead
on the majority of the population.

The registry pid is therefore **neither** reliably the shell **nor** reliably the agent. The
probe must be a **bounded descendant walk, self included, matched on identity**.

### Goals

| # | Goal |
|---|---|
| G1 | A seat whose agent is running is never stamped terminal, at any tree depth |
| G2 | A seat whose pid was recycled to an unrelated process is not treated as alive |
| G3 | A seat already wrongly stamped recovers when contrary evidence appears |
| G4 | An unprobeable seat reports `unknown` — never silently coerced to dead |
| G5 | The change is one coherent edit to one function's contract, not two independent patches |

### Non-goals

- **pij#171** (tmux re-leases `paneId` after a server restart). Same root class — pij stores an
  OS-issued lease and later treats it as an identity — but a different axis and a *destructive*
  failure rather than a wrong answer. §Seams records the relationship; this plan does not fix it.
- Renaming `terminal` to `lastObservedTerminal` (#155's cheaper alternative). Rejected: s096,
  s093, s094 and s097 all read the field; a rename is a four-stream breaking change for a
  cosmetic gain. We fix the semantics instead and keep the name.
- Implementing #142's `pij close --force` liveness guard — it lives in `core/close.ts`, which is
  not this stream's file. Recorded as a negative finding with its evidence (F-401).

### Acceptance criteria

| id | criterion | proof |
|---|---|---|
| AC-1 | An agent at the registry pid (depth 0) probes `alive` | unit: fake process tree, agent at root |
| AC-2 | An agent one level below the registry pid probes `alive` | unit: fake tree, agent as child |
| AC-3 | A bare shell with no harness descendant probes `absent` | unit: `-zsh` with no children |
| AC-4 | A recycled pid holding an unrelated process probes `absent`, not `alive` | unit: `IntuneMdmDaemon` at the registry pid, reproducing gurgeh |
| AC-5 | A harness process belonging to a *different* seat does not satisfy the probe when a session id is available | unit: `copilot --session-id <other-uuid>` at the pid |
| AC-6 | A failed process listing probes `unknown`; the seat is **not** stamped terminal | unit: port throws |
| AC-7 | `reconcileDeaths` does not stamp a descriptor whose probe is `alive` | unit on `reconcileDeaths` |
| AC-8 | `reconcileDeaths` **clears** an existing `terminal` when the probe is `alive` | unit: descriptor with terminal + live agent → update with `terminal` absent |
| AC-9 | A `dissolved` descriptor is still skipped entirely | unit — the one true terminal state |
| AC-10 | Re-running the reconciler over the 15 latched descriptors un-sticks exactly those whose agent is alive, and leaves the rest stamped | regression fixture built from the real population |
| AC-11 | **Fail-first discipline** — every *behavioural* change carries an assertion-level test that fails against pre-fix code. API-introduction tests (AC-1..AC-6, which cannot compile pre-fix) are documented as the explicit exception, and **preserved** properties (AC-9) are never counted as fail-first | see §Fail-first below |
| AC-12 | A revived agent whose process started *after* the descriptor's `startedAt` still probes `alive` | unit — start time never demotes |
| AC-13 | A truncated/unparseable command line probes `unknown`, never `absent` | unit — truncation fixture |
| AC-14 | `activityCredibility` returns `superseded` + cause `agent-absent` for a terminal-stamped seat | unit |
| AC-15 | `activityCredibility` returns `unknown` + cause `no-activity-recorded` when no `state` and no `lastEventAt` | unit — the `anomalies.ts:398` defect stated positively |
| AC-16 | A fresh `agentLiveness: "alive"` outranks a stored `terminal` record | unit |
| AC-17 | A persistently dead seat produces **zero** writes and **zero** notices on a second consecutive tick | unit — two-tick regression |
| AC-18 | The probe is reachable from the production call site (not inert) | daemon-level integration test |
| AC-19 | Clearing `terminal` re-enables anomaly sweeps, re-permits re-bind, and makes `revive` refuse | seam tests |

---

## Planning Seam

**Questions not asked of a human.** Per the fleet brief (§5) and pij invariant 9, an
orchestration seat never opens a modal question UI, and non-blocking questions proceed on a
reasonable default. The builder's Round-1 questions were answered from repo convention:

| question | answer | grounded in |
|---|---|---|
| Workflow Mode | **Full** (2 phases) | two separable changes with a hard ordering constraint |
| Testing Strategy | **TDD — tests must fail without the fix** | charter: "Tests must FAIL without the fix" (AC-11) |
| Mock Usage | **Fakes only, no mocking library** | Pattern P8 / `adapters/fakes.ts`; `core/` is pi-free |
| Documentation Strategy | **Update `docs/how/` + the ledger; comment both issues** | fleet brief §6 |

**One question WAS escalated to the prime** (blocking exactly one task, not the plan):
whether `reconcileDeaths` may write an honest `state` on a confirmed-absent seat, since the
butterfly's `status-stale` row is emitted by `core/anomalies.ts` (s097's file) from
`state=working` + card age, and nothing inside this stream's three files otherwise changes what
that row says. Tracked as **OQ-1**; Phase 2 T-2.4 is gated on it and nothing else is.

---

## Implementation Plan

### Gate Matrix

| gate | verdict | note |
|---|---|---|
| G1 Clarify | ✅ PASS | no `[NEEDS CLARIFICATION]` markers; OQ-1 escalated, gates one task only |
| G2 Constitution | N/A | no `docs/project-rules/constitution.md` |
| G3 Architecture | ✅ PASS | hexagonal T2 preserved: OS work in the adapter, classification pure in `core/` |
| G4 ADR | N/A | no accepted ADRs bear on this |
| G5 Structure | ✅ PASS | phases ordered, tasks atomic, every AC mapped |
| G6 Testing Alignment | ✅ PASS | TDD; tests target `core/` + fakes (P8); AC-11 pins fail-first |
| G7 Domain Completeness | N/A | domain mode off |

### Summary

Replace the boolean existence probe with an **identity-aware, three-valued** liveness probe, and
make `terminal` a **revisable observation** rather than a latch — in one change, because either
alone is a no-op for existing seats.

The OS seam stays thin: the adapter returns a bounded snapshot of the process subtree; a **pure
core function** classifies it. That keeps `core/` pi-free (P2), keeps the walk deterministic in
tests (P8), and means every case above is a table test rather than a live-process experiment.

### Key Findings

| # | finding | consequence |
|---|---|---|
| K1 | Agent depth is mixed: 16 seats at depth 0, 7 at depth 1 | bounded walk **including self**; never a fixed depth |
| K2 | Command lines carry the harness session id (`--session-id <uuid>`, `--resume=<uuid>`) | exact identity is available, not just a binary-name proxy |
| K3 | `systemStateOf` already treats `pidAlive: null` as `unknown` and refuses to infer dead | the three-valued verdict maps onto existing, tested behaviour — no new vocabulary in `state.ts` |
| K4 | `applyTerminalObservation` early-returns if `terminal` is set | the latch exists in **two** places; clearing must be explicit, not a side effect |
| K5 | Only `dissolved` and no-descriptor are unambiguous (#155, `pij-chief-roadrunner`) | `dissolved` keeps its unconditional skip; `terminal` does not |
| K6 | **The watchdog does not read `terminal` — it reads `isAlive(pid)` directly** (`core/daemon/watchdog-manager.ts:240`) | s096's dependency is on **Phase 1**, not Phase 2. An earlier claim to the contrary was retracted to the prime |
| K7 | `reconcileDeaths` receives its probe injected from `daemon.ts:639-648` | Phase 1 is **inert in production** unless that call site is updated — see §Boundary |
| K8 | Clearing `terminal` re-enables anomaly sweeps (`anomalies.ts:507,537`), re-permits re-bind (`fs-registry.ts:735-749`), and makes `revive` refuse (`revive.ts:589-600`) | all three are the **correct** direction — you should not revive a live seat — but each needs a seam test |
| K9 | The reconciler runs on the daemon tick (~600ms) over ~500 descriptors | a per-descriptor `ps` is ~500 process-table spawns per tick. The snapshot **must** be taken once per sweep, by the caller |

### Phases

#### Phase Index

| phase | title | CS | depends on |
|---|---|---|---|
| 1 | Identity-aware liveness probe + `activityCredibility()` | 4 | — |
| 2 | Unlatch `terminal` on contrary evidence, and wire the probe | 3 | Phase 1 |

Both phases land in **one PR**. Splitting them across PRs would ship a state the plan explicitly
forbids: a fixed probe behind a live latch, or an unlatched field fed by a blind probe.

---

#### Phase 1: Identity-aware liveness probe

**Outcome**: a probe that can return the contrary answer, and says `unknown` when it cannot.

| task | description | files | AC |
|---|---|---|---|
| T-1.1 | Add `AgentLiveness = "alive" \| "absent" \| "unknown"`, `AgentLivenessProbe { liveness, agentPid?, cause }`, and `ProcessInfo { pid, ppid, command, startedAtMs }` to `core/platform/types.ts` | `core/platform/types.ts` | — |
| T-1.2 | Define `ProcessSnapshot` — an **immutable, whole-table** capture taken **once per sweep**. Do **not** widen `ProcessPort` with a per-pid `subtree()` (see §Boundary R6) | `core/platform/types.ts` | — |
| T-1.3 | Pure `resolveAgentLiveness(descriptor, snapshot, opts): AgentLivenessProbe` in `core/state.ts` — walks the snapshot in memory, self included, bounded depth | `core/state.ts` | AC-1..AC-6, AC-12, AC-13 |
| T-1.4 | Pure `activityCredibility(input): ActivityCredibility` per the published contract | `core/state.ts` | AC-14..AC-16 |
| T-1.5 | Real snapshot adapter: **one** `ps -Awwo pid=,ppid=,lstart=,command=` per sweep. `-ww` is mandatory — truncated command lines are the identity signal | adapter¹ | AC-13 |
| T-1.6 | Fake snapshot builder for constructible trees | `adapters/fakes.ts`¹ | AC-1..AC-6 |
| T-1.7 | Table tests for the ladder + the credibility predicate, incl. the gurgeh, cross-seat, truncation and revived fixtures | `core/state.test.ts` | AC-1..AC-6, AC-12..AC-16 |

¹ additive touches outside the charter's three files — see §Boundary.

**The identity ladder** (first match wins). Redesigned after validation: the previous draft
could manufacture a false `absent`, which is the destructive direction this stream exists to
remove.

| rung | condition | verdict | note |
|---|---|---|---|
| 1 | snapshot unavailable / capture failed | `unknown` | never coerced to dead |
| 2 | a process in the bounded subtree whose **parsed** `--session-id` / `--resume` argument equals the descriptor's `harnessSessionId` or `plannedHarnessSessionId` | `alive` | **exact identity** |
| 3 | a process naming the descriptor's harness binary, with **no** session id available on either side to compare | `alive` | corroborating, not exact |
| 4 | harness processes present, **all** of which carry a **different** seat's session id | `absent` | exact-negative |
| 5 | a harness process whose command line is **truncated or unparseable** | `unknown` | we cannot tell — say so |
| 6 | no harness-like process anywhere in the bounded subtree | `absent` | the common true-death case |

Four corrections from validation, each closing a false-`absent` path:

- **Parse, don't substring.** Match the session id as a parsed argument value, not as a
  substring of the whole command line: a worktree path or an unrelated flag can contain a uuid.
- **`ps -ww`, and truncation is `unknown`.** A truncated command line is missing evidence, not
  evidence of absence (rung 5).
- **Start time never produces `absent`.** A revived seat's agent legitimately starts *after* the
  descriptor's `startedAt`, so the timestamp is **corroboration only** — it may strengthen rung 3
  but can never demote a match. This removes the previous draft's undefined middle case.
- **Ambiguity is `unknown`.** A subtree containing both an expected-id process and a foreign one
  resolves `alive` (rung 2 wins); a subtree whose evidence conflicts in any other way is
  `unknown`, never `absent`.

---

#### Phase 2: Unlatch `terminal` on contrary evidence

**Outcome**: `terminal` means "currently observed terminal", and a returned seat recovers —
**without** a per-tick rewrite or notice storm.

**The transition table is the contract.** The previous draft specified only the `alive` case and
would have re-stamped and re-notified every already-dead seat on every 600ms tick, because the
update path rebuilds the expectation without the descriptor's existing `terminal`, so
`applyTerminalObservation`'s early-return (`spawn-expectation.ts:91`) never engages and
`latchTerminalNotice` re-latches.

| # | current state | probe | action | notice |
|---|---|---|---|---|
| 1 | `lifecycle: "dissolved"` | *(not probed)* | skip entirely — the one unambiguous terminal | none |
| 2 | no `terminal` | `absent` | stamp once | send once |
| 3 | `terminal` present | `absent` | **no update, no write** — idempotent steady state | **none** |
| 4 | `terminal`, `disposition: unrequested-by-pij` | `alive` | **clear** `terminal` + `deathNoticeLatchedAt`; `dead.delete(id)` | none |
| 5 | `terminal`, `disposition: requested` | `alive` | **retain** — a requested close in progress is not a "return" | none |
| 6 | any | `unknown` | **no mutation whatsoever** | none |

Row 3 is the one that keeps the daemon quiet; row 5 is the one that keeps a deliberate teardown
from being undone by a still-draining process; row 6 is the honest-unknown rule.

| task | description | files | AC |
|---|---|---|---|
| T-2.1 | Skip **only** `lifecycle === "dissolved"`; probe every other descriptor | `core/daemon/death-reconciler.ts` | AC-7, AC-9 |
| T-2.2 | Implement rows 2–6 exactly; emit a descriptor update **only** when something actually changes | `core/daemon/death-reconciler.ts` | AC-6..AC-8, AC-17 |
| T-2.3 | On row 4, clear `terminal` **and** `deathNoticeLatchedAt`, and remove the id from the `dead` set that suppresses notices (`death-reconciler.ts:99-105`) | `core/daemon/death-reconciler.ts` | AC-8 |
| T-2.4 | **Wiring (gated on §Boundary ruling)** — pass the once-per-sweep snapshot into `reconcileDeaths` from its production call site | `daemon.ts` *(not ours)* | AC-18 |
| T-2.5 | Two-consecutive-ticks regression: a persistently dead seat produces **zero** writes and **zero** notices on tick 2 | `core/daemon/death-reconciler.test.ts` | AC-17 |
| T-2.6 | Regression fixture from the real 15-seat population | `core/daemon/death-reconciler.test.ts` | AC-10 |
| T-2.7 | Seam tests for the three downstream consumers of a cleared `terminal` (anomaly suppression, re-bind, revive refusal) | `core/daemon/death-reconciler.test.ts` | AC-19 |

**Note on K4**: `applyTerminalObservation` (in `core/spawn-expectation.ts`, **not our file**)
early-returns when `terminal` is already set. Phase 2 therefore clears at the descriptor level in
`reconcileDeaths` rather than reaching into that helper — the clear is explicit and local, and no
other stream's file is modified.

### Acceptance Coverage Map

| AC | phase | task | test |
|---|---|---|---|
| AC-1, AC-2 | 1 | T-1.3, T-1.6 | `state.test.ts` — depth 0 and depth 1 |
| AC-3, AC-5 | 1 | T-1.3, T-1.6 | `state.test.ts` — shell-only, foreign session id |
| AC-4 | 1 | T-1.3, T-1.6 | `state.test.ts` — gurgeh/Intune fixture |
| AC-6 | 1,2 | T-1.3, T-2.2 | both suites — port throws |
| AC-7, AC-9 | 2 | T-2.1, T-2.2 | `death-reconciler.test.ts` |
| AC-8 | 2 | T-2.3, T-2.5 | `death-reconciler.test.ts` |
| AC-10 | 2 | T-2.6 | 15-seat regression fixture |
| AC-11 | 1,2 | all | suite run against `HEAD~` before merge |

### Seams — other streams

| stream | file | interaction |
|---|---|---|
| **s096** `pij-opposite-owl` | `core/daemon/watchdog-manager.ts` | **Live seam — on Phase 1, not Phase 2.** An earlier claim that their eligibility guard reads `terminal` was **wrong and has been retracted**: `terminal` appears zero times in `eligible()` (`watchdog-manager.ts:190-207`). What they actually consume is **the blind probe itself** — `watchdog-manager.ts:240`: `if (!eligible(session) \|\| !this.deps.isAlive(session.pid)) disposeSession(...)`. So their watchdog silently stops watching any seat whose registry pid reads absent, and watches forever any seat whose pid was recycled (pid 952 → `IntuneMdmDaemon`). Phase 1 changes what that line means for them; Phase 2 does not touch them. |
| **s097** | `core/anomalies.ts` | Owns the butterfly row. **Consumes `activityCredibility()`**, published at `activity-credibility.contract.md`. Merge order s095 → s097; **no edit-time serialisation**. |
| **s092** | `daemon.ts` | **Sequencing pair.** T-2.4 edits `daemon.ts:639-648` only (prime ruling — see §Boundary). s092 works the bootstrap/lock path and the `PIJ_HOME` sites, a different region. Convergence is the prime's; no direct coordination. |
| s093 / s094 | `cli.ts`, `core/cli.ts` | `cli.ts:1419` and `core/cli.ts:3318-3324,5771-5784` call `isAlive` directly. Left unchanged — `isAlive` stays on the port so their call sites keep compiling. |
| — | `core/anomalies.ts:507,537` · `adapters/fs-registry.ts:735-749` · `core/revive.ts:589-600` | Downstream of a **cleared** `terminal`: anomaly sweeps re-enable, re-bind is re-permitted, and `revive` refuses. **All three move in the correct direction** — you should not revive a seat that is alive — but each gets a seam test (T-2.7 / AC-19). |
| — | pij#171 | `paneId` is a lease, same root class, different axis. Not implemented here; the contract's §Non-goals states that `superseded` is never teardown authority for exactly this reason. |

### Boundary — declared before the first write

The charter names three files: `core/state.ts`, `core/platform/types.ts`,
`core/daemon/death-reconciler.ts`. Two additions were escalated and **ruled on by the prime**:

1. **`daemon.ts:639-648` — APPROVED, by me, minimal and additive.** One new field on the
   `reconcileDeaths` input plus the once-per-sweep snapshot call that feeds it. **Nothing else in
   that file is touched, and the exact line range is declared in the PR.** Rationale (prime):
   the design decision — once per sweep — is only makeable by the seat that measured the
   alternative, so handing the hunk to s092 buys a worse edit and a round trip.
2. **Adapter + fakes** (`adapters/*`): additive only. Per validation, `ProcessPort` is **not**
   widened with a mandatory `subtree()` — that would be source-breaking for every structural
   implementer, and the daemon uses its own `DaemonPorts` liveness seam (`core/daemon/loop.ts:48-92`)
   in any case. The snapshot is a **dedicated optional capability**, and its absence yields
   `unknown`, never `absent`.

### Fail-first discipline (replaces the original AC-11)

The original AC-11 — "every test fails against pre-fix code" — was **not achievable and has been
corrected**. Validation showed three of its claims were false: AC-7 already passes pre-fix under
an `isAlive: () => true` fake (`death-reconciler.test.ts:103-111`); AC-9 already passes because
dissolved descriptors are skipped today (`death-reconciler.ts:109`); and AC-1..AC-6 cannot even
compile pre-fix, so they fail to *build* rather than fail an *assertion*.

The rule is now:

| class | requirement |
|---|---|
| **Behavioural change** (AC-8, AC-10, AC-18) | must have an assertion-level test that **fails, not errors**, against pre-fix code |
| **Mutation-only** (AC-17, and any AC-19 seam that clears `terminal`) | **no pre-fix form exists** — see below. Sole proof is a **named mutant** |
| **New API** (AC-1..AC-6, AC-12..AC-16) | compile-time introduction — documented exception, not counted as fail-first |
| **Preserved property** (AC-9) | explicitly **not** counted as fail-first; it is a regression guard |

#### AC-17 is MUTATION-ONLY — verified, not assumed

A claim about a mechanism that **does not exist pre-fix** is not *false* pre-fix, it is
**vacuous**. Its natural home is "behavioural", where it then quietly never produces a red and
nobody distinguishes *"did not fail"* from *"could not fail"*.

Verified at `origin/main`, `death-reconciler.ts:109`:

```ts
if (descriptor.lifecycle === "dissolved" || descriptor.terminal !== undefined) continue;
```

So pre-fix, a persistently dead seat on tick two produces **zero writes and zero notices** —
byte-for-byte the observable AC-17 asserts post-fix. **The observable is identical in both
worlds; only the reason differs**: pre-fix it is silent because it is *latched*, post-fix
because transition row 3 says so. A pre-fix red is unavailable **in principle**, and any red
recorded for it would be an artefact of something else in the test.

**The mutant that discharges it** (already run, round-1 review): mutate row 3's guard
`if (descriptor.terminal === undefined) continue` → `if (true) continue`, which sends a
`terminal`+`absent` descriptor down the stamping path. AC-17b went **RED** under exactly that
mutation, target matched, no no-op.

> **The general test, applied to every criterion before recording it**: ask not *"did it fail
> pre-fix"* but ***"could it have"***. If the answer is no, it is mutation-only, and if you
> cannot name the mutant you do not have a criterion.

Credit: s100 for the fourth label; s094 for the first-assertion rule; s099 for the
one-claim-one-observable sharpening.

#### What a pre-fix red actually buys (correction, 2026-08-08 — fleet-wide, from s094)

**A pre-fix red on a multi-assertion test proves only the FIRST assertion that fired.**
`expect()` throws, so every assertion after the first failure never runs and is entirely
unproven. A five-assertion criterion that goes red pre-fix has proven exactly one of its five.

The live case: s094 recorded four cases red pre-fix, and all four failed on their *first*
assertion (`exitCode === 0`) because the command was refused at a capability gate — so
execution never reached the fixture those tests existed to exercise. The red was real and
proved the **permission** half, while saying nothing about the subject. What actually
established the remainder was a **reachable mutant**, because *mutation reaches past the first
assertion and a pre-fix red cannot*.

Therefore, for every behavioural criterion in this plan:

1. **Name the assertion that actually fired** in the recorded pre-fix output.
2. If that assertion is not the one carrying the criterion's meaning, the evidence **does not
   cover the criterion**.
3. **Prefer splitting** the criterion so each claim fires on its own; fall back to mutation for
   the remainder only where splitting is genuinely impossible.

**AC-17 is this plan's highest-risk criterion under this rule** — "zero writes *and* zero
notices, across *two* consecutive ticks" is at least four claims wearing one name, and a
pre-fix red on it would likely fire on the first write assertion and leave the notice claim
unproven. Split it.

Note the shape, which is this wave's: the pre-fix red and the multi-assertion test are each
fine. Their **composition** silently narrows the evidence, and nothing in either surfaces that
— the same intersection defect as the coupled instruments this stream exists to fix.

Note AC-6 **reverses** an existing tested behaviour: `death-reconciler.test.ts:162-175` currently
expects an unavailable observation to be stamped. That test is updated deliberately, and the
change is called out in the PR rather than buried.

### Risks

| # | risk | likelihood | mitigation |
|---|---|---|---|
| R1 | A harness with no live sample (`codex`, `omp`) is misclassified | med | rung 6 is `absent` = today's behaviour, so no regression; matchers are table-driven |
| **R2** | **Process-listing cost.** The naive per-descriptor shape is **~500 `ps` spawns per 600ms tick** at current population — this would stall the daemon tick and therefore message delivery | **high — measured, not estimated** | **One snapshot per sweep, taken by the caller.** This is a *correctness* requirement, not an optimisation: it is why T-2.4's wiring edit is unavoidable. Test asserts **one** snapshot call for N descriptors |
| **R3** | **Notice storm / write amplification.** Removing the latch sends every already-dead descriptor down the update+notice path every tick, because the rebuilt expectation drops the existing `terminal` so `applyTerminalObservation`'s early-return never engages (`spawn-expectation.ts:91`) and `latchTerminalNotice` re-latches | **high** | Transition row 3: `terminal` + `absent` ⇒ **no update, no notice**. AC-17 pins it across two consecutive ticks |
| R4 | Boundary collision with s092 in `daemon.ts` | med | prime-approved, single hunk, declared line range, convergence held by the prime |
| R5 | A revived agent starts after `startedAt` and trips a plausibility check | **eliminated by design** | start time now only ever *corroborates*; it can never demote a match to `absent` (AC-12) |
| R6 | Widening `ProcessPort` breaks structural implementers | **avoided** | dedicated optional capability instead; `isAlive` untouched |
| **R7** | **Tested-but-unreached.** Phase 1 fully unit-tested yet completely inert because nothing wires it into the daemon | **high — three instances in this wave** (s097's anomaly sweep, pij#118's success line, and this) | AC-18: a test that **fails if the production call site is unwired** |

---

## What this stream delivers instead of the butterfly row

**This PR will not change what the butterfly's `status-stale` row says, and that is the correct
outcome.** Stated explicitly, because otherwise this PR looks like it left the visible symptom
untouched.

The row is emitted by `core/anomalies.ts` (s097) from `state` + card age. The tempting fix —
having `reconcileDeaths` write an honest `state` when it confirms a seat absent — was proposed
here, escalated as OQ-1, and **ruled out by the prime on 2026-08-08**. The decisive argument is
not a boundary technicality:

> If `reconcileDeaths` writes `state`, the row stops firing **without the detector being fixed**.
> The board looks clean while `core/anomalies.ts` still contains a check that renders a dead seat
> as working — it is simply never handed one through that path again. That is a **silencer**, not
> a fix (government doctrine D-043): it removes the symptom by starving the detector of the input
> that exposes it.

Three further costs the ruling identifies:

1. **It masks every other consumer's version of the same bug.** `state` is read in more places
   than one detector; "fixing" the field leaves every other consumer's defect intact while
   destroying the one live example that would have revealed it.
2. **It creates a second writer to a field the daemon owns.** `state` is the mechanical activity
   axis, written from pane observation — a second writer is a race with no arbiter.
3. **It destroys information.** `state: working` on a dead seat is not false about the past; the
   last observation genuinely *was* working. Overwriting it discards the only record of what the
   seat was doing when it died — exactly what someone debugging a death needs.

**Neither field is defective.** `state` records a mechanical observation; `terminal` records a
liveness claim; both are correctly recorded. The defect is **a consumer reading one axis and
rendering a conclusion that requires both** — the coupled-instrument family (pij#160).

**The precondition this stream delivers.** s097's row cannot be fixed correctly while `terminal`
is a latch. A detector taught to consult `terminal` today would inherit the latch and confidently
suppress **15 seats, two of which are alive right now** — trading a false "working" for a false
"dead", which is the more destructive direction (#142's lost pane). **A correct, revisable
`terminal` is therefore a hard precondition for s097's fix, and delivering that precondition —
not the row — is this stream's contribution to the butterfly.** The row is s097's to fix, with the
butterfly as their live test case; the prime has relayed it.

**Follow-on — APPROVED and scoped to s095 (2026-08-08).** The ruling leaves a "every
consumer must remember to check `terminal`" rule, and a rule that needs a broadcast to stay true
is worse than one that cannot collide. The answer is to make the composite question **askable
once**: a named predicate — proposed as `activityCredibility()` in `core/state.ts`, returning a
tagged `current | superseded | unknown` verdict with a reason rather than a bare boolean — that
both the detector and any future consumer call instead of each re-deriving it. Proposed to the
prime; **awaiting scope confirmation before any implementation**, because it changes s097's fix.

### Unresolved Gaps

| id | gap | blocks |
|---|---|---|
| ~~OQ-1~~ | ~~May `reconcileDeaths` write an honest `state`?~~ | **RESOLVED 2026-08-08 — no.** See above. Blocks nothing. |
| ~~OQ-2~~ | ~~Is `activityCredibility()` scoped to s095, and is `unknown` non-suppressing?~~ | **RESOLVED 2026-08-08 — yes, and yes.** Scoped to s095 in `core/state.ts`; `unknown` is **non-suppressing** (render with age + uncertainty marker, never drop). Contract published; s097 consumes it. Now **in** this PR (Phase 1 T-1.4). |

### Definition of Done

A PR on `s095/liveness-fields` with green CI, **not merged**, in which:

1. A seat whose agent is alive is never stamped terminal — at depth 0 or depth 1.
2. A seat wrongly stamped recovers.
3. Every new test fails against pre-fix code (AC-11).
4. `harness checks` is green.
5. `docs/how/fleet/ledger.md` carries this stream's F-400/W-400/S-400 rows with evidence and cost.
