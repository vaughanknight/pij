# Stream brief — s101 `daemon-tick-cost`

**PM**: pij-cultural-vicuna · **Prime**: pij-continuing-ermine · **Opened**: 2026-08-09
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s101-daemon-tick-cost`
**Branch**: `s101/daemon-tick-cost` (from `origin/main` @ `95bf2f9f`)

## Your two issues

**#181 — one `ps` subprocess per descriptor per tick (26% of tick).**
`core/daemon/runtime-axis.ts:116` calls `isSuspended(descriptor.pid)`, wired at
`daemon.ts:345-355` to `execFileSync("ps", ["-o","state=","-p",pid])`. **548 of 549
descriptors carry a `paneId`**, so that is ~548 subprocess spawns per tick. A V8 profile
attributes **2956ms / 26.2% of tick** to this path. The issue's own suggestion: one `ps`
invocation can report every pid at once.

**#183 — `~/.pij` is 1.7G with no retention bound**, and the archive sweep logs a
permanently stuck record every tick.

**#204 is the mechanism connecting them** and is IN SCOPE as context: archive ageing lost
its tick axis when `lastTickAt` left the descriptor (#180 follow-up). Read it before you
design — if nothing ages out, #181's population never shrinks and #183 grows forever.

## Why one team owns both

They are one loop, not two bugs: **#204 stops dead rows ageing → the working set grows →
#181 pays a subprocess for every dead row → tick slows → #183 grows unbounded.** Measured
on this box today: **598 of 627 registry rows are dead**, so ~95% of #181's per-tick cost
is spent probing corpses. A fix to either alone leaves the loop intact.

## Ordering — do the CHEAP one first and MEASURE BETWEEN

1. **Batch the `ps` probe** (#181). Smallest diff, largest measured win, no semantic change.
2. **Re-measure.** State the tick cost before and after with the same instrument.
3. **Then retention/ageing** (#183/#204), which changes what is IN the working set and so
   changes #181's denominator. Doing it first would confound both measurements.

## MANDATORY — you are measuring a process, and it lies about its own code

**The daemon runs `tsx` off source with NO hot-reload.** A merged fix does nothing until
`pij daemon stop && pij daemon start`.

This is not hypothetical: **#180's fix merged 2026-08-08 21:46 and the daemon running this
morning had started 12.5h earlier — it executed pre-#180 code for the entire eight-stream
wave, while the issue read CLOSED.** Every performance number taken in that window was
measured against a binary that did not contain the fix.

So: **restart the daemon before every measurement, and state the daemon PID and start time
beside every number you report.** A number without its PID is not a measurement.

> **The daemon is MACHINE-GLOBAL and shared with other governments (chainglass,
> harness-engineering, dd). A restart is a shared mutable resource — ASK ME before
> restarting; do not do it unannounced.** Invariant 11: isolation removes edit-time
> serialization, not convergence-time serialization.

## Gates

`harness checks` must pass before you call anything done (`--quick` while iterating; the
full run before the PR). Typecheck, lint, unit, smoke. Cite the gate by name in your PR.

## Do NOT touch

- **#182** (slow tick manufactures false `stalled` alerts) — it is a CONSEQUENCE of your
  work, not a sibling. If your fix lands, #182's false positives should reduce on their
  own; **verify and report that, do not patch it.** It has a live dated instance:
  `pij-efficient-bug` at 2026-08-09T00:27Z, which was idle, not stalled.
- Anything under `docs/how/fleet/` — a live PR (#168) owns that tree.
- `.the-flow-state.json`, `the-flow.json`, `the-flow.md` — never written by anyone but
  the-flow guided mode.

## Evidence discipline (this fleet's standard — non-negotiable)

- **`--expect` is mandatory on any mutation test.** Without it a flake is
  indistinguishable from a kill.
- **A count is an assertion over a set.** Before reporting one, ask what two *opposite*
  errors would leave it unchanged.
- **Assert EXACTLY N, never "no extras".**
- **Before your PR run `git diff origin/main --name-status` UNSCOPED** and assert you
  generated nothing except what you own. A scoped check answers "what did I touch in the
  place I was thinking about"; the question is "what did I touch" — those differ exactly
  where you were not thinking, which is where strays are by definition. This cost the last
  wave a stray file that a scoped gate passed.
- **`gh pr view --json statusCheckRollup`, never `gh pr checks`** (superseded runs).
- A performance claim needs a **before AND after** with the same instrument. If you cannot
  produce the before, say so — do not backfill it.

## Reporting

`pij report now "<did>" "<next>"` at both edges of every unit of work — 280 char limit.
Ask me inline through this channel when ambiguous; never a modal question UI. Questions
stay with their context owner: if you need Jordan, ask me and I will route it.
