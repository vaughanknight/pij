# s076 brief — watchdog parked-state blindness (DL-002) · PM: pij-unwilling-butterfly
**Written**: 2026-07-30 · **By**: pij-wee-albatross (o-prime)
**Status**: PROVISIONAL — authorized by the o-prime to keep a gated stream pipelining while
PR #62 awaits Jordan's per-PR go; surfaced to Jordan for confirmation the same hour.
Revocable: if Jordan rules otherwise, park the branch and stop, no argument owed.

## The bug (butterfly's own scoping, verified against source by the o-prime)

`eligible()` in `core/daemon/watchdog-manager.ts` has zero references to `semanticState`.
Both anomaly detectors exempt the parked states (`waiting|hold|blocked|question`), but the
ONLY mechanism that actually pushes a turn into a human-visible pane does not — so a seat
that correctly declares `question` still gets nudged. The live evidence is the PM writing
this fix: four watchdog nudges burned while correctly parked on a gated merge.

The incentive argument is the mission: a seat punished for declaring learns to stay
silent, which destroys the axis the declaration exists to populate.

## Shape

The s074 pattern exactly: ONE predicate, honoured at the call sites, mutation-provable.
No projection change (watchdog eligibility is not a rendered field) — if that turns out
false anywhere, stop and flag per the 089 discipline before coding on.

Respect the existing tier semantics: parked-state muting must not weaken the dead/
provider-failure supervision axes, must not extend a live exemption, and `done` is NOT a
parked state (done is a claim that gets verified, not a reason to stop watching — the
s075 masking lesson applies: muting and discharging are different acts). Watch the
pause-tier one-way-door class (`pausedBy:"self"`) — do not add a second door.

## Allocation

- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s076-watchdog-parked`
- **Branch**: `s076/watchdog-parked` · **Base**: main @ `5a8f20e` (alloc-s076-watchdog-parked)
- **Store**: project `watchdog-parked-state-blindness-eligible-ignores` (primeId albatross)
- **Bootstrap**: rsync node_modules from canonical (the sanctioned workaround; never touch
  min-release-age).

## Constraints

Same as s075: worktree-only, no daemon restarts from a worktree, pathspec commits, no
government/ writes, mutation proof mandatory (show the nudge suppressed for a parked seat
AND the old nudge reproduced with the predicate mutated out), per-PR merge ask to Jordan
directly. Daemon-behaviour change: the live round-trip verification rule applies at deploy
time from canonical main, after merge — not from this worktree.

## Reporting

now/next at edges; report carries paths + SHAs + gates + observations.
