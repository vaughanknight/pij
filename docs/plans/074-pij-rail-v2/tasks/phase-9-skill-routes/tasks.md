# Phase 9: Item 6 — skill-route automation — Tasks

**Plan**: [../../pij-rail-v2-plan.md](../../pij-rail-v2-plan.md)
**Phase**: 9 of 10 · **Created**: 2026-07-29 · **Depends on**: P2, P3, P4 (all shipped)
**Domain**: pij-skill

## Why this phase decides whether the plan mattered

Phases 2–4 shipped the verbs. **If no route runs them, the rail stays empty and the whole plan is
theatre.** A PM who must *remember* to report will not, and the feature degrades to a field nobody
fills. This phase is the difference between a capability and a habit.

Repo doctrine, applied literally: *a wiki paragraph that says "remember to do X" is worth nothing;
an automated step that does X for you is worth everything.*

## What is already done — do not redo it

**The mechanical retirement of `state set/clear/verify` happened in P3**, per the timing rule: a
prescriptive surface migrates in the phase that removes the verb, never in a later cleanup phase.
The P4 reviewer's sweep confirmed no live instruction names a removed verb.

## Tasks

| # | Task | Done when | Notes |
|---|---|---|---|
| 9.1 | **Role arrives from ABOVE, always.** The *governor* designates at placement: `pij link <seat> --parent <gov> --role pm\|worker`. `/pij ready` writes **no role at all** | the route teaches the governor to designate; the seat is taught nothing about roles | **Corrected mid-phase.** Self-designating `worker` at adoption is JC-2 D5-b's rejected backfill performed one seat at a time — it *manufactures a fact*, and role-unknown would stop existing. **A seat does not know its own role**: one spawned by a PM may be a worker or a sub-PM, and only whoever gives it work knows. This is also what makes P2's refusal of `adopt --role` coherent — adopt states *where a seat is* (observable); role states *what it is for* (not observable from inside) |
| 9.2 | **`pij report now` becomes a route STEP at start and stop of work**, with the command inline | a PM reports without being asked | AC-12. This is the whole phase; everything else is support |
| 9.2b | Teach the **family axis**, not the subcommands: *everything under `report` is a first-person claim about yourself* | one sentence in the route | An agent that grasps the axis guesses the subcommands; one that memorised verbs does not |
| 9.2c | Document **inline markdown works** (`` `code` ``, `**bold**`, `[links]`) and **newlines do not** | the worked example uses it | Zero contract change — it just needs saying, or nobody uses it |
| 9.3 | Teach `report question "<text>"` / `report blocked "<text>"` for the two human-facing states — and **do not invent a word for "actively working"** | no route suggests a non-existent state | Observed live: there is no such word in the ruled eight. Absence is the honest expression, **by design** |
| 9.4 | A worked now/next example sized to the 280-char cap | a PM never guesses the shape | Source: this PM seat's own dogfooding |
| 9.5 | **Do NOT teach "pause the watchdog when done"** | no route or text prescribes a self-pause | **F-16**: self-pause was a one-way door and is why 47 of 51 seats fleet-wide sat paused. P5 added new-work re-arm; this phase removes the sign that kept directing agents into the hole |
| 9.6 | `harness checks` | **exit 0, ZERO failures** | AC-14 |

## Definition of Done

A PM that follows the routes is designated by its governor at placement, reports
at start and stop, asks questions through `report question`, and never pauses
its own watchdog merely because work ended or blocked — **without being told any
of it twice.**

## Discoveries & Learnings

- **Role arrives from above, always.** Self-designating `worker` in `/pij ready`
  would reproduce JC-2 D5-b's rejected backfill one seat at a time and erase the
  meaningful role-unknown state. Adopt describes where a seat is; only the
  governor giving it work knows what it is for.
- **P5 fixed the one-way door but left the sign pointing at it.** The scheduler
  re-armed a self pause on new work while the nudge still recruited new self
  pauses on completion. Mechanism and teaching must be reviewed together.
