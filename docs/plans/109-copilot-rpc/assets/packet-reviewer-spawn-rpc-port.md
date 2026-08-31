# Reviewer packet — u-spawn-rpc-port (unit 1)

**Read first**: `SHAPE.md` including **Amendment 1**, `reports/findings-log.md`, and
`../108-rust-port/assets/REVIEWER.md`.

## Pre-register your falsifiers in a file BEFORE you read the receipt

And **measure your baseline at the time you use it**. A pre-registered claim is what
makes a verdict honest; the numbers inside it decay, and **a stale before-value fails
silently in the direction of a pass.**

## What to attack

1. **The revive transition.** Not "is the new port stamped" — that passes on a build
   that leaves the old value reachable. Revive, assert replacement, then assert
   **nothing re-stamps the old value on a later pass**. A mutation that only clears on
   the sweep must fail.
2. **Absence semantics.** `None` and `Some(false)` must both be closed. Absence must
   not be permissive, and a stale port must never read as a live one.
3. **Act vs row.** Is the clearing verified by **observing the descriptor**, or by the
   code path having run? The predecessor plan shipped a consent revocation that existed
   as a row and not as an act, and a hand detach was beaten twice by the daemon
   re-attaching.
4. **Path, not branch.** Every witness must execute through the **shipped** spawn and
   revive flow. A test that calls a helper directly proves the branch and not the path
   — the shape that let a gate exist, be tested, and never be consulted.
5. **The migration statement.** Does the receipt say plainly that every pre-existing
   Copilot seat is permanently a pointer seat until respawn? A reader's default
   assumption is that the fleet upgrades itself, and that is false.

## Habits that earned their place

- **Report the number AND the command.** Truncated output drops the payload; a filtered
  runner must fail loudly when its filter matches nothing.
- **When a red will not reproduce, MUTATE rather than repeat.** Repetition separates
  *rare* from *never*, never *rare* from *conditional*.
- **Surfacing a violation is not enforcing one** — abort on a dirty tree; never let a
  check mutate what it judges.
- **Ask what would distinguish the two states before trusting an instrument.** Unit 0's
  headline finding was false because two instruments each answered a different question
  from the one asked, agreed, and the agreement read as corroboration. One keystroke
  settled it.

Numbered findings, failure mode, severity, and a **CHECKED AND NOT RAISED** section.
Report your own reds. Disclose your own instrument errors — nine were disclosed in the
predecessor plan and none reached a verdict, which is the only reason the rest was
trustworthy. APPROVE only when nothing remains.
