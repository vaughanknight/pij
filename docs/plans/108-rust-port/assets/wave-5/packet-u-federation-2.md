# Coder packet — u-federation-2 (wave 5)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w5-federation2` · branch `s108/w5-federation2`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-5/COMMON.md`
**Wire contract**: `assets/wave-3/WIRE-CONTRACT.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

The half of req-0017 wave 4 refused: a federated ROSTER and a federated STREAM.

## Why it was refused, and why that matters to you

Five separate defects at wave 4's ack were one fact: **the wire cannot express
this.** I cut the scope rather than let a unit improvise three wire changes under
deadline. You are the unit that makes them, from knowledge instead of assumption.

The three, each already diagnosed:

1. **`SeatDescriptor` has no machine**, so `/v1/seats` cannot show two seats
   called `alice` — and two machines each having an `alice` is ordinary.
2. **`/v1/events` takes a SCALAR `since`.** A federated replay needs a per-machine
   cursor map; frames are `{machine, cursor, event}` and `Event.seq` stays
   `#[serde(skip)]`.
3. **`post_to_peer` is POST-only.** Registry fan-in needs an authenticated GET;
   stream fan-in needs NDJSON with reconnect and version handling.

All three touch frozen or additive-only surfaces. **Declare exactly what you need
at the ack; I allocate, and anything on `ports.rs` goes to the prime.**

## The rule that shapes the design

**Remote events are a VIEW, not a replica.** Appending a peer's events to the
local spine assigns them a second `seq` and risks loops — a machine that forwards
what it received is a cycle waiting for two daemons to point at each other.

## What to build

* Registry fan-in: remote seats visible in `pij list`, each carrying its machine,
  with the local roster still authoritative for local seats.
* Event fan-in: a per-machine cursor map, reconnect from the right offset per
  machine, unknown kinds passing through as open strings.
* **Say what happens on lag, drop and reconnect.** A stream that silently skips is
  the E-023 shape: an absence that reads as evidence.

## Done bar

* Gate six stages green.
* **The loop test (COMMON § 1.3)**, named: your fan-in workers are long-lived, and
  wave 4's died on their first transient error while every instrument stayed
  green. Force one peer error; prove the next poll still happens.
* **Two real routers**, as wave 4 did: A sees B's seats, A follows B's events, and
  a reconnect resumes from B's cursor rather than replaying B's spine.
* **Same-name proof**: `alice` on both machines is TWO rows in a federated list,
  each addressable.
* A peer that is DOWN degrades honestly — the local roster still answers, and the
  absence is visible rather than silent.
* Mutation transcripts, composition recipe INCLUDING shutdown, assumptions,
  receipt pushed before the done message.

## Watch for

* Bearer keys are the only LAN control; revocation is restart-time.
* Bounded work at attach (COMMON § 6). A fan-in that replays a peer's whole spine
  on every reconnect is the unbounded-attach defect wearing a network.
* Do not touch routing policy in `core::delivery` — if fan-in seems to need it,
  that is an ack defect.
