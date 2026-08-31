# Coder packet — u-tap (wave 5)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w5-tap` · branch `s108/w5-tap`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-5/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The pane observer. Answer, truthfully and conservatively: **is a human typing in
this pane right now?**

## Why this unit exists separately

`InteractionGate` (in `pij-harnesses`) is built, tested, and fed by NOBODY. The
pointer rung therefore never fires in shipped composition, and wave 4 shipped it
that way on purpose rather than inverting the gate's default — a gate with no
sensor that answers "go ahead" is worse than no gate, because it discards a
standing ruling while appearing to honour it.

You are the sensor. It is its own unit because **a sensor built as a side-effect
of its consumer gets shaped by that consumer rather than by what it can honestly
observe.**

## The rule you are serving

**Socket is transport; tmux is politeness** (Jordan, 2026-08-27). Seat-`Working`
moved to the transport in wave 3; a HUMAN at the keyboard did not. Interrupting a
person mid-sentence is rude, and that is Jordan's to lift, not ours.

## What to build

1. A pane observer that feeds `InteractionGate` — `record_tap`,
   `observe_composer`, `record_enter` — from real tmux observation.
2. **Truthful unknowns.** `TmuxPort::user_typing` already says `pane_in_mode =
   false` is NOT permission. Absence of evidence is UNKNOWN, and unknown blocks.
   If you cannot distinguish "nobody is typing" from "I have not looked", say
   unknown.
3. **Restart baselines to unknown.** A fresh daemon has observed nothing.
4. **The 60-second first-sight rule is a POLICY DECISION, not an inheritance.**
   TS uses it to distinguish a stale draft from an active human. Decide it
   explicitly, state it in your report, and make it configurable if you keep it —
   a default is a number nobody chose.

## Done bar

* Gate six stages green (COMMON § 2).
* **The loop test (COMMON § 1.3)**: your observer is long-lived. Force one tmux
  error and prove the NEXT observation still happens. Name the test.
* **A decision table**: typing observed → blocked; enter observed → not typing;
  nothing observed → unknown → blocked; stale observation → your ruled policy.
* **Mutation**: make unknown permit, and watch a named test fail. That mutation is
  the whole reason the gate exists.
* **Prove it against a real pane** — one manual transcript in the report, per
  E-025. A sensor proven only against a fake is a claim about a fake.
* Receipt committed and pushed BEFORE the done message.

## Watch for

* Do not widen `ports.rs`. If observation needs a seam that is not there, that is
  an ack defect.
* Polling cadence is config, injected, never a constant.
* You feed the gate; you do NOT decide delivery. If a requirement here seems to
  need routing, say so at the ack.
