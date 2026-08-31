# Findings — plan 111 anti-step-on

Honest record, instrument failures included. Appended as work lands.

## Carried into composition (ph-1112), before any live smoke

**F-1111 — a claude seat parked at the folder-trust modal publishes a live socket but NO
session record.** Source: pij-dominant-vicuna (o-prime), 2026-08-31, from plan 110's live
findings. Consequence for our smoke test: a smoke recipient that reads as *unreachable* may
be sitting at the trust modal, not suffering a transport fault. **Capture the pane before
diagnosing transport** — otherwise the nearest signal (unreachable) gets mistaken for the
fact (transport broken), and the smoke produces a false negative about our gate.

## Known limits to state, not paper over

**F-1112 — `permits_injection_fresh` is fresh in its COMPOSER half only.** Its tap half is
tick-derived: `drain_pane_tap` is destructive and owned by the observer loop, so the fresh
path must not drain it. Ruled at the PM ack (O4, accepted). The staleness window shrinks from
the observer interval to capture-to-inject; it is bounded, not eliminated. Do not claim zero.

**F-1113 — the fresh path costs two tmux round-trips per gated send, one of them fleet-wide.**
Cursor coordinates come from `TmuxPort::list_panes()`, which takes no filter and enumerates
every pane on the machine. Accepted as a cost, recorded rather than hidden. Cache or scope
only if measurement forces it.

## Instrument failures (recorded, not swallowed)

**F-1114 — both wave-1 omp coders could not post a status card before adoption.**
pij-extensive-echidna (u-gate) and pij-scrawny-crawdad (u-observer), 2026-08-31, independently:
the first `pij report now` failed, and each had to adopt its OMP pane before it could report.
Two for two on freshly spawned omp seats. This is the same pre-bind/registration window PRD
req-0003 already tracks (its third face: omp seats that cannot register at birth). Recorded
here as a second and third data point for whoever owns that row — not diagnosed by us, and
not a defect in this plan's work.

**F-1115 — the fan-out rationale was wrong: u-gate could not compile without the seam.**
Raised by pij-extensive-echidna at its ACK. The impl-guide's fan-out says "neither reads the
other's unfinished code", which is true but assumed u-gate could BUILD without
`composer_region` existing. It cannot: `permits_injection_fresh` is a non-test public method,
and a test-only double cannot satisfy the pij-gate build. Resolved WITHOUT a stub — a
production placeholder returning `Unrecognized` would have been a fleet-wide conservative veto
that turns no test red if the real extraction never lands. Instead: u-gate splits at the seam
(idle expiry + self-echo now, carrying ac-1111/1112/1113 and both mutation proofs), and
u-observer lands the real extracted `composer_region` as its first push, which releases the
blocked third. Wave 1 stays parallel in its valuable half.

## Control-plane failure hit live during wave 1 (2026-08-31)

**F-1116 — daemon-bound delivery to both omp coders was BLOCKED for ~5 minutes without me
knowing, while every surface said the seats were fine.** The composite, in the order it
presented:

1. Both `pij send` rulings receipted **`queued (unbound): peer is still binding`**. I read that
   as "will deliver at bind" and moved on. It was the honest signal and I under-read it.
2. The daemon's spawn-id descriptors never bound (`failure: bind-timeout`), so the queued
   messages had no route. **Neither ruling was ever delivered.**
3. Two **false death notices** arrived — `s1788166845282-83558`, `s1788166853280-89488`,
   "has exited; terminal absence: live observation" — for seats whose panes were alive
   (`pane_dead 0`), whose pids were alive, and which were actively working and messaging me.
   This is PRD req-0003's false-death-notice hazard, reproduced twice, six seconds apart.
   **I did not re-spawn.** Re-spawning on that notice is how a prime ends with two seats on
   one worktree.
4. `pij state` showed both seats **`DEGRADED · never bound`** while they were demonstrably
   working — because each seat had self-adopted under its OWN name (pij-extensive-echidna,
   pij-scrawny-crawdad) while the daemon watched the orphaned spawn-id descriptor. Same
   pre-bind/registration window as req-0002 B-1 and req-0003, seen from a third end.
5. **Direction matters and no surface said so**: coder→PM `pij send` worked throughout (both
   ACKs and u-gate's "the ruling did not inject here" arrived fine). PM→coder was blocked.
   A half-open channel reads as a working channel from the end that is transmitting.

**What finally proved it**: re-sending, which receipted
`BLOCKED: peer never bound … Nothing will deliver this`. The earlier `queued` and the later
`BLOCKED` are the same underlying state, described twice with opposite operational meaning.

**Recovery trap**: `pij revive <id> --print` — documented as "touches no tmux pane, spawns
nothing, writes no descriptor … --print never needs it: it mutates nothing" — **refused
anyway** with `E-ARG: session still has a live prior attachment; close it before reviving`.
The refusal fires before the dry run, so the one command that is safe to run on a live seat
is unavailable exactly when the seat is live-but-orphaned, which is the case it exists for.
`--attach %pane` refused identically. Same trap-door shape req-0003 already names for
`pij adopt`. **Delivered the rulings by `tmux send-keys` instead**, after capturing both panes
to confirm the composers were empty (bare `❯`) — the pointer rung's own fallback, and the
politeness gate this very plan is about.

**Why this matters to plan 111 specifically**: the work was NOT lost, but for five minutes both
coders were building from the packet alone against a superseded ordering, and I believed they
had my rulings. Nothing in the PM's view distinguished "delivered" from "queued forever".

## Cross-check findings from u-observer (TS vs Rust; Rust deliberately unaltered)

**F-1117 — HAZARD, escalated to the o-prime: `Unrecognized` has no expiry, and a whole harness
class may be unrecognizable.** Current Copilot v1.0.82 panes carry no prompt marker, so both
parsers return `Unrecognized`; the TS comment claiming every live Copilot capture has a prompt
marker is stale. Composed with our contract: `Unrecognized` DEFERS, and idle expiry applies
**only** to a *recognized* non-blank composer whose content is unchanged — so an unrecognized
pane is vetoed **forever**, with no escape hatch. That is plan 111's own goal 1 ("a parked
draft delays delivery, never blocks it") failing through a different door: the 72b5dd61
over-hold arriving as unrecognizability rather than as a parked draft.

Bounded honestly: today's tick path already maps `Unrecognized → record_unknown → veto`, so
this is **inherited, not introduced**. What plan 111 changes is that the fresh verdict becomes
the one *authorising* an injection, promoting an inherited cheap-precheck veto to the decisive
one. **Not claimed**: that copilot seats are gated on the live fleet today — unverified, and
not to be asserted until looked at. The sufficient claim is narrower: plan 111 must not
*entrench* an unbounded hold, and as contracted it does. Recommended (o-prime's ruling, not
the PM's): bounded deferral degrading to today's `user_typing`-only behaviour; a live
v1.0.82 copilot fixture; and probably a seventh AC, because **nothing currently turns red if
`Unrecognized` holds forever** — which is exactly how it passed both of us into a frozen contract.

**F-1118 — `is_plain_rule` box-character set diverges from TS.** Rust excludes 20 box chars;
TS `BOX_DRAWING` additionally excludes heavy vertical and double-line corners, so those borders
can classify differently between the two implementations. Recorded, unaltered.

**F-1119 — a live OMP capture contains a tool-output bottom border ABOVE the real composer.**
Pre-move Rust returns unknown (the caret row misses that false OMP region); TS would classify
the empty border region as `Recognized`-blank — i.e. "composer is clear", releasing the gate on
a pane whose real composer is elsewhere. **Rust is the safer of the two here; the bug is TS's.**
Referred to the o-prime as a possible TS-side row.

## Receipt discipline

**F-1120 — a compile error is not a red-first witness.** u-gate's Part A (5c31e8df) delivered
correct code and both mutation proofs, but presented ac-1111's pre-fix red as
`error[E0599]: no associated function named with_clock`. That proves the test could not RUN,
not that the pre-fix tree lacked the behaviour. Red-from-cannot-build is no better a witness
than green-from-birth. Sent back to stage clock injection as a behaviour-neutral refactor
first, run the witness on that tree for a genuine assertion failure, then implement expiry —
or say plainly that the ordering is impossible and record Mutation A as the substitute with
its limitation named. Code accepted; receipt corrected.

## Composition (ph-1112)

**F-1121 — the plan says three consumers; there are TWO production call sites.**
`delivery/mod.rs` (first-attempt) and `pointer/worker.rs` (`DrainWorker`, which serves BOTH the
queued-retry drain AND the pointer worker — they are one worker, not two). Checked for a third,
ungated injection path rather than assuming the count was right: `submit_command` is the only
other way bytes reach a pane, and it sits behind the same gate at `worker.rs:217`, after the
pane/proc/hold guards. No ungated path exists. A miscount in a contract is harmless here, but
only because it was checked — hunting a third consumer that does not exist would have ended
either in a wasted search or an invented one.

**F-1122 — switching to the fresh verdict makes EVERY injection depend on capture and
recognition succeeding.** Wiring it broke 12 daemon tests, and that was the composition working:
tests that had seeded a clear composer through the observer tick now had to present a
recognizable composer AT the boundary. Two of those failures were real coverage, not noise —
`unknown_or_human_typing_gate_releases_body_without_delivery` and
`failed_command_uses_durable_attempt_backoff` both depend on the gate having NO evidence, so
they now use an explicitly unarranged fixture. Arranging every pane by default would have
deleted that coverage while turning the suite green, which is the failure mode this plan exists
to avoid.

The fake was deliberately NOT made permissive by default: an unscripted capture stays an empty
pane and therefore a veto. A fake that permits injection by default makes the gate it is used
to test unfalsifiable.

**Integration proofs, each mutation-checked rather than accepted green-from-birth:**
- `a_parked_draft_delays_delivery_and_then_stops_blocking_it` (ac-1111 e2e) — shortening the
  wait below the idle window turns it RED.
- `a_stale_clear_tick_cannot_authorize_an_injection_a_fresh_capture_vetoes` (ac-1114 e2e) —
  reverting the call to `permits_injection` turns it RED. This is the one that proves the
  WIRING, not just the gate.
- `a_paneless_seat_is_never_gated_and_never_captured` (ac-1116 pin) — asserts the ABSENCE of
  tmux calls, not merely a delivered receipt.

**F-1123 — `pij-gate` prints a FAIL stage and still EXITS 0.** Observed on this tree: the
verdict block read `fmt FAIL … pij-gate: 1 stage(s) failed — fmt. The task is not done.` and the
process exited with code 0. Any consumer keying on the exit status — CI, a script, an agent
running it unattended — reads that run as a pass. Caught here only because the human-readable
verdict was being read directly. Out of this plan's fence; reported upward rather than fixed.
