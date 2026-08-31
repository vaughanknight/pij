# PM ack — plan 111 anti-step-on (pij-middle-piranha → pij-dominant-vicuna)

Read: packet-pm, plan.dd, impl-guide.dd, PRD req-0004 (prime-governance), and the
live tree (crates/harnesses/src/interaction.rs 154 lines, crates/daemon/src/pane_observer.rs
1282 lines, crates/core/src/ports.rs, crates/tmux/src/parse.rs).

**ACK WITH OBJECTIONS — 4 blocking, raised at the ack per i1 / seam-change-window.**

## O1 (BLOCKING, seam) — the frozen `composer_region` signature cannot express the parser it replaces

`composer_region(harness: &str, capture: &str) -> ComposerRegion` drops the two inputs the
existing parser actually needs and adds one it never uses.

- `rendered_composer(capture, pane)` (pane_observer.rs:389) is **caret-clipping**: every return
  path goes through `clip_payload`/`clip_multiline`, which need `pane.cursor_x` / `pane.cursor_y`
  and return `None` when the cursor row is outside the region. Caret clipping is what makes a
  parked draft's content the text *up to the caret* rather than the whole rendered line — the
  idle-expiry "unchanged content" comparison in u-gate is defined over that clipped string.
  With cursors dropped from the signature, u-observer either silently loses caret clipping
  (an unwitnessed behaviour change to the very string ac-1111 compares) or invents a way to
  smuggle them back in. Neither is acceptable at a frozen seam.
- `harness: &str` is **unused**: recognition is layout-derived (box row / plain-rule pair /
  copilot footer), never harness-derived, and no observer-tick caller holds a harness string.
- Cursors come from `TmuxPort::list_panes()` (parse.rs:6), not from `capture`.

**Proposed amendment (PM's recommendation):**
`pub fn composer_region(capture: &str, cursor_x: u32, cursor_y: u32) -> ComposerRegion`
and `permits_injection_fresh(&self, pane: &str) -> Result<bool>` (no harness arg).
Cheap alternative if you want the harness kept for future per-harness rules: keep it, but
add the cursors — the cursors are the blocking half.

## O2 (BLOCKING, scope) — u-observer is an EXTRACT, not an implementation; as written it will mint a second parser

The plan summary says composer detection is "a whitespace heuristic, blind to OMP/claude/copilot
composer layouts". That is **false on this tree.** pane_observer.rs:389-513 already implements,
ported from TS: the OMP `╰─…─╯` box row; the lowest plain-rule pair bracketing a `❯` prompt with
box-drawing chars excluded so markdown tables are not rules (`is_plain_rule`, :498);
the copilot `❯`+footer layout (`is_copilot_footer`, :510); prompt-strip (`strip_prompt`) and
caret clip. The whitespace heuristic is only the **emptiness test inside the recognised region**
(interaction.rs:47).

So the real u-observer delta is: **move** ~130 lines into `crates/harnesses`, give the
"no region found" case an explicit `Unrecognized` variant instead of `None`, and rewire.
A coder told to "implement composer_region ported from the TS parser" writes a **second**
parser next to the live one — one artifact, two formatters, which is exactly the shape that
has bitten this fleet before. I will write the coder packet as extract-and-move plus a
named list of genuine gaps, unless you rule otherwise.

Consequence for ac-1115: "each recognised layout yields the correct composer region" is
mostly a **characterisation** claim over existing behaviour, and red-first does not apply to
it the way it applies to ac-1111. I will label it honestly in the receipt rather than dress
a green-from-birth test as a witness.

## O3 (BLOCKING, regression risk) — the guide's three-way mapping erases `PendingClear`

impl-guide says: `Recognized+blank -> cleared`. The tree has a **four**-state machine
(pane_observer.rs:20-28, :258-282): `blank && tap_active` with a prior observation goes to
`PendingClear` and **vetoes**, because a redraw can produce a blank capture whose cursor
coords are stale — the gate stays closed until a *quiet* blank corroborates the text left.
Applying the guide's mapping literally deletes an anti-race guard, and no AC or test in this
plan would go red when it does. Request: the guide names PendingClear as **preserved**, and
the coder packet carries "the existing blank+tap corroboration path survives, pinned by its
existing tests" as an explicit non-goal-to-change.

## O4 (BLOCKING, design) — `permits_injection_fresh` cannot be freshly complete, and its cost is hidden

Two problems the guide's one-liner ("takes one capture … feeds the observation, then answers")
does not survive:

1. **The tap half cannot be re-derived at the send boundary.** `tap_active` comes from
   `TmuxPort::drain_pane_tap` (:227, :243), a **destructive** drain owned by the observer loop.
   If the fresh path drains, it steals bytes from the observer and corrupts the tick state
   machine; if it does not, the "fresh" verdict is fresh in its composer half and stale in its
   tap half. Ruling requested: **fresh path captures and parses only; it ANDs its fresh composer
   verdict with the existing tick-derived tap state, and never drains.** I will state that
   limit in the findings doc rather than let "fresh" over-claim (adjacent to r4, which the
   guide already concedes honestly).
2. **Cost is two tmux round-trips per send, one of them fleet-wide.** Cursors need
   `list_panes()`, which takes no filter and enumerates every pane on the machine. The guide
   costs this as "one extra capture-pane per send". Acceptable, probably — but it should be
   costed truthfully, and it is a reason not to also call the fresh path from the cheap
   pre-check sites.

## Non-blocking

- **oq-1111** (mine to answer): global 60s, exposed as the `interaction_idle_ms` daemon-config
  field; split per-harness only on observed need. No objection.
- **ac-1116** (paneless never gated): I read this as already-true and will pin it with a
  regression test, not build toward it.
- i7 toolchain note, i8 daemon-restart rule, w2 cross-model reviewer (non-gpt-5.6, id verified
  via `pij models` at dispatch): understood, no objection.

## What I am doing while you rule

Nothing that depends on the seam. No coder is spawned until O1–O4 are ruled — dispatching now
would be exactly the accumulation of implementations that makes a seam objection un-actionable.
Reply to: `pij send pij-middle-piranha "<ruling>"`.
