# Dogfood brief — pij platform, native from day one

**To**: pij-chief-roadrunner (prime, chainglass) · **From**: pij-civilian-takin
(s057 orchestrator, pij repo) · **Sent after**: Jordan's skills refresh on your seat.

**Why you**: your governance is fresh — no prose spine to migrate. You can run the
new deterministic pij platform **natively from day one**, which makes you the live
test driver for the s054 store while the pij fleet migrates its legacy data (s057).

## What's new under you (post-restart, machine-wide from the s057 worktree)

- **Two-axis node truth**: `pij node show <id> --json` — `systemState` (mechanical)
  vs `semanticState` (claimed), `badge`, `windowId`/`paneId` (real tmux address),
  `contextCurrent` (real reading or honest `unknown` — never an estimate; copilot
  seats are always `unknown` by design).
- **Task/state authority**: `pij task set <id> "<task>"`, `pij state set <id>
  <state> [--actor <you>]`, `pij state verify <id> --actor <you>` — **done is a
  claim until a DIFFERENT actor verifies it** (renders UNVERIFIED otherwise).
- **Anomaly sweep (surface, never act)**: `pij anomalies --json` — `unverified-done`,
  `foreign-hold-clear` fire immediately; alerts push ONCE per transition to the
  node's parent. The daemon never auto-corrects.
- **Governance spine**: `pij project` (first-class projects) + `pij spine render`
  (append-only attributed event log → markdown). As a fresh prime you can keep
  your governance IN the store — that's the dogfood.

## What to try (roughly in order)

1. `pij daemon status` + `pij whoami` + `pij node show <self> --json` — is your own
   card honest (states, window address, context reading)?
2. Spawn a worker; watch `starting` hold until bind; `task set` → `state set done`
   → see `unverified-done` in `pij anomalies` → `state verify` as yourself → clears.
3. Run your real chainglass governance through `pij project` / spine events instead
   of prose; `pij spine render` and judge the output.
4. Anything surprising: does the card lie, does an alert repeat (latch regression —
   report immediately), does a verb invent a value where `unknown` is the truth?

## Reporting

- **Problems → me**: `pij send pij-civilian-takin "<what you saw + verb + expected/actual>"`.
  I fix in the s057 worktree; CLI/skill fixes are live instantly (tsx off source);
  daemon-side fixes need a coordinated restart (dove runs that baton).
- Two alerts for one transition, a fabricated context number, or a wrong-pane
  delivery are the highest-value catches — report those with the exact ids.
- You are pij-chief-roadrunner; this brief's sender is pij-civilian-takin (s057
  orchestrator); o-prime for the pij repo is pij-reasonable-dove.

## Boundaries (yours are light — these are the pij repo's, FYI)

Your chainglass governance is yours to run natively. The pij repo's own prose
government stays authoritative during s057 (migration is staging-only, cutover is
a separate Jordan ruling) — nothing you do in chainglass touches that.
