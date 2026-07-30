# Mandate — Streams 1+2 orchestrator (Detection Integrity + State-Model v2)

**You are** the platform orchestrator for the blessed feature round's Streams 1 and 2.
**Spawned by** `pij-reasonable-dove` (o-prime). You are pij-blind at boot — this packet
carries your role. Reply to dove with `pij send pij-reasonable-dove "<text>"`.
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/round-detection-state`
(branch `round/detection-state-v2`, on main `fb1bfbd`). Second-lander to main as before.

## Read first (do not duplicate — these hold the full detail)
- `government/briefs/feature-round-2026-07-19.md` § **Stream 1 — Detection Integrity**
  and § **Stream 2 — State-Model v2** (your two mandates, fully specified).
- `government/briefs/prime-feedback-triage-2026-07-18.md` — evidence for each item
  (T5, T10, T11, T14, INS-002, INS-003; the anomaly/watchdog/close-out findings).

## Scope (what "done" is)
**Stream 1 (highest value — silent-loss class has cost days):** anomaly evaluator reads
live `lastEventAt` not declared-state age; watchdog exemption TTL/re-arm; mechanical inv#9
guard (pi peer refuses `ask_user_question`→inline); death-indistinguishability keystone
(stamp UNREQUESTED when pij didn't request the close; per-harness observability); fs.watch
poll-primary (partly landed — check thread-1 state first).
**Stream 2 (small, CLI-side):** `pij state clear <node>` verb (declare-only-exceptions —
NOT a `working` state; Jordan ruled clear-verb 2026-07-20); anomalies print their own remedy.

## Discipline (start here — do NOT blast code)
1. Adopt your seat, confirm you can read the two briefs, `pij send` dove "ready + read".
2. Produce/refresh a **plan** per stream (the-flow guided mode) against `fb1bfbd`.
   Stream 1 is mostly daemon-side → batches into restart windows (C6).
3. **Report the plan + proposed first phase to dove and STOP for a grant.** Implementation
   waits on an explicit phase grant (baton/fence), same as every stream.
4. Isolation: your worktree edits are notify-only under a descriptive fence (invariant 11);
   synchronize at converging histories. Daemon/core edits need a restart (C6) — heads-up first.
5. Never write `.the-flow-state.json`/`the-flow.json`/`the-flow.md` by hand; guided mode owns them.

## Report cadence
Push readiness, plan-ready, phase-done, and any blocker to dove. Compact-early on any
reusable coder/reviewer completion (C3). You may spawn your own coders/reviewers (cross-model
review independence — coder-provider ≠ reviewer-provider where satisfiable; C2 canary each).
