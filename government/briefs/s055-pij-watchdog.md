# Stream brief — s055-pij-watchdog
**From**: pij-reasonable-dove (o-prime) · **Date**: 2026-07-16T14:20:00Z · **Lifecycle**: provisional (until Jordan's in-pane preamble)

## Structure tree

```text
human (Jordan)
└─ o-prime pij-reasonable-dove · window o-prime (pane %1546)
   ├─ THIS STREAM s055-pij-watchdog · window s055-pij-watchdog (new)
   ├─ s054 pij-civilian-takin · window s054 · IN FLIGHT overnight loop (P1 fix cycle)
   ├─ s051 pij-remarkable-hyena · Pi peer · IN FLIGHT G7 acceptance (mission critical path)
   ├─ s052 pij-pregnant-dragon · HELD on PD-009 (vite A/B, Jordan pending)
   └─ s050 pij-bored-pelican · LOW-PRIORITY HOLD
```

## Work item

- **Plan folder**: `docs/plans/055-pij-watchdog/`
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s055-pij-watchdog`
- **Branch**: `s055/pij-watchdog`
- **Base**: `origin/main` at `591f188f394ab17d8c34a800fd55f87c752d4005`
- **Spawn evidence**: filled at spawn — descriptor cwd must equal the worktree; window `s055-pij-watchdog`
- **Landing**: `/builder 8 ship` to PR merge; teardown only after merge or explicit abandonment
- **Human ask, verbatim** (spine rulings record ~14:10Z, Seq 416/417):
  1. "there was a feature idea that came from the pij orchestrator - pij first class watch dogs. What will happe is all pij sessions will auto get a watch dog at 20 mins. Each watch dog message tellsit how they can pause and resuem hte watchdog. pij sessions should keep watchdog running until they no longer doing active work. if they get a watch dog after active owrk, the know how to pause it. running compact on a peer will also auto pause watchdog."
  2. Via s054's pane: "we are going to impleemtn the pij watchdog so that next time limits happens it will auto resume." → **hard requirement: auto-resume after usage-limit freezes**.
  3. (~14:35Z, o-prime's pane): "new feature, they can watch a pane - which when watchdog fires drops the tmux window pane text in so they can see it (not pij messages, if for exampe teh agent has run out of credits that will not be in pij logs - but also we dont want to drop too muchin each time cause it can get expensive asll these watch dogs)." → **hard requirement: on-fire tmux pane-text capture in the watchdog turn** (ground truth beyond pij's own logs — the out-of-credits case is the canonical example), with a **cost-bounded capture size per fire** as a first-class design constraint (many watchdogs × big captures = expensive). Expect the plan to answer: how many lines/bytes, tail-vs-diff since last fire, and whether capture is always-on or only on anomaly.
- **Current flow state**: none — fresh stream; you create the flight plan via builder guided mode.
- **Prior art** (paths only):
  - `docs/plans/054-pij-grown-up/reports/watchdog-enhancement-proposal.md` (s054 worktree — FROZEN at commit `96e19a7`, sha256 `e025161ce87930d6df6adc0c3dd2cae2efdf65c96be356ef316fc8a4982de76d`; includes tonight's field evidence: 7.5h coder freeze, `liveness=active` lying, `lastEventAt` frozen)
  - Second same-day freeze datum (spine Seq 419): s051's coder `pij-fond-sole` PID silently gone ~12h before anyone noticed — burned a 4–6h phase ETA; two independent orchestrators hand-rolled detection the same night. This is your demand evidence.
  - `.pi/extensions/pij/core/state.ts` (liveness/staleness derivation, STALE_AFTER_MS), `core/daemon/loop.ts` (daemon tick, pane-scrape), `core/readiness.ts`
  - s054 plan WS-6 (state model, fleet-amended vocabulary) at `docs/plans/054-pij-grown-up/workshops/001-data-model.md` — human-ruled, do-not-re-litigate
  - Prime's thesis read (spine-adjacent, quoted here): universal-by-default supervision; the watchdog turn itself teaches pause/resume; push-not-poll inviolate — daemon watches, peers only receive turns; paused = session's *claim* of idleness, not proof; deliberate-silence peers (frozen evidence seats like `pij-vital-toucan`/`pij-evolutionary-junglefowl`, parked holds) need a first-class exemption, not a workaround.
- **Cross-repo/cross-worktree artifacts**: the frozen proposal above lives in ANOTHER stream's worktree — vendor it VERBATIM into your plan folder + record sha256 in a PROVENANCE file BEFORE citing it (byte-identity: no prepended headers). Verify against the pinned sha; if it differs, stop and tell me — edits to it are gated through the o-prime.

## Descriptive fence

Canonical fence section: spine Seq 416 (planning-only).

- Expected touch set (NOW): `docs/plans/055-pij-watchdog/**` only
- Scratch: `.harness/temp/s055/**`
- Hard exclusions: `government/**` (o-prime single-writer) · `.the-flow-state.json`/`the-flow.json`/`the-flow.md` (flow-CLI-only) · every other stream's worktree · all product paths until a validated plan earns a refreshed fence
- Known separate-branch overlap (merge risk, recorded — NOT spawn blockers): s054 P2 `system_state`/daemon-event seams and `core/types.ts` additive surface (SW-3 serialization precedent at convergence); s051 descriptor/close surfaces; dormant s053 sqlite brief if revived
- New worktree-local path: persist, tell the o-prime, continue (tell-not-ask; stop only at hard boundaries or convergence — global invariant 11)

## Orient stack

1. Invoke `/pij prime`; stream triage loads `<skill>/references/prime/orchestrator.md`.
2. Portable global orient: `<skill>/references/prime/orient-global.md`
3. Consuming repo local orient: `government/orient-local.md` (LIVE copy at `/Users/jordanknight/pi-hacking/pij/government/` — your worktree's snapshot is not authoritative)
4. This item brief
5. Invoke `/thesis` through the host skill mechanism
6. Human preamble + preamble checkpoint — **Jordan delivers your preamble in your pane himself; hold planning mutation until it lands and is checkpointed**
7. Protocol/ritual pages only on demand

## Assignment and reporting

- Assignment stays provisional until the human preamble and first report.
- A validated plan stops at `WAITING_FOR_BUILD_CONFIG`; no implementation begins until the human confirms the recorded coder/reviewer profile.
- Report at preamble, every phase checkpoint, and ship using `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`.
- Reports/questions/baton requests → `pij send pij-reasonable-dove`. Streams never talk sideways; cross-stream needs route through the o-prime.
- Work confined to this verified worktree/branch is notify-only; a pushed baton grant is required only at convergence or shared mutable resources. Daemon restarts are ALWAYS baton-gated (machine-wide blast radius) — this stream's subject matter lives in the daemon; expect that gate at live-verify time and plan isolated/temp-daemon proofs first (s051 precedent).
- Fleet packets inherit this fence and name a narrower task allowlist.
- Window/identity: `s055-pij-watchdog` / `<pij id at spawn>` / role `stream-s055`; worker panes split inside this window and inherit the worktree cwd.
