# Wave 5 — shape

Written at wave-4 close, from what wave 4 LEARNED rather than what it assumed.
Every unit here exists because a wave-4 unit hit its edge and we declined to
improvise.

## 1. `u-tap` — the pane observer

The missing producer. `InteractionGate` exists, denies on unknown, and **nothing
feeds it**: no Rust code calls `record_tap`, `observe_composer` or `record_enter`,
so the pointer rung is unreachable in shipped composition.

It is its own unit rather than a corner of u-pointer because **a sensor built as a
side-effect of its consumer gets shaped by that consumer instead of by what it can
honestly observe.**

What it must answer truthfully: is a HUMAN typing in this pane right now. Not "is
the pane in copy mode" — `TmuxPort::user_typing` already says explicitly that
`pane_in_mode = false` is NOT permission. The gate's conservative default stays:
unknown blocks.

Restart baselines to unknown. The TS 60-second first-sight rule is a POLICY, and
porting it is a decision this unit makes explicitly and states, not one it inherits
silently.

## 2. `u-federation-2` — the roster and the stream

Wave 4 shipped remote SEND and refused the rest, because five separate defects
were one fact: **the wire cannot express a federated roster or a per-machine
cursor.** Three changes, and they are the unit:

* `SeatDescriptor` needs a machine, or `/v1/seats` cannot show two seats called
  `alice`.
* `/v1/events` takes a SCALAR `since`; a federated replay needs a per-machine
  cursor map. Frames are `{machine, cursor, event}`; `Event.seq` stays
  `#[serde(skip)]`.
* `post_to_peer` is POST-only. Registry fan-in needs an authenticated GET and
  stream fan-in needs NDJSON with reconnect.

**Remote events are a VIEW, not a replica.** Appending a peer's events to the
local spine assigns them a second `seq` and risks loops. Say what happens on lag,
drop and reconnect — a stream that silently skips is the E-023 shape.

## 3. `u-dedupe` — destination-side delivered-id dedupe

Closes the at-least-once window wave 4 named rather than hid: a duplicate forward
collapses onto a live row, but if the first copy was already claimed and acked, a
retry after an ambiguous network failure delivers twice.

The honest fix is a durable record of delivered ids per recipient, consulted
before a forwarded message is enqueued. Bound it — an unbounded table is a leak
wearing a correctness argument — and say what the bound costs at the edge.

## 4. Harness: `harness boot` hides its diagnostic

Reported INDEPENDENTLY by two wave-4 coders. `boot` fails with
`boot-typecheck-failed` and suppresses the compiler output, so its own prescribed
action — "fix the type errors above" — is impossible from the receipt. The
highest-leverage fix is to include the failing stage's stderr in the envelope.

Outside the Rust fence; the PM carries it.
