# Coder packet — u-queue finish + u-events (wave 1)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w1-events` · branch `s108/w1-events`
**Common contract (read first)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-1/COMMON.md`
**PM**: `pij-revolutionary-lungfish` · **Tier**: store integration + a fan-out
property suite

## Mission

Two seams that sit beside each other and must not be confused:

* **the queue** is work that must happen **exactly once**, with claims;
* **the event bus** is notification that **fans out** to every subscriber.

The delivery service (wave 2) will consume both — enqueue the job, publish the
event. Getting the distinction wrong now costs every consumer later.

## Scope — the only paths you write

* `crates/store/src/queue.rs` and `crates/store/tests/queue.rs` — **only** these
  in `crates/store` (another coder owns registry/spine/migrate this wave).
* `crates/core/src/events.rs` — **new**, the bus's types and pure logic.
* `crates/core/src/lib.rs` — one `pub mod events;` line.
* `crates/daemon/src/events/**` — **new**, the runtime half.
* `crates/daemon/tests/events_*.rs` — your tests.
* `crates/testkit/arch-allowlist.toml` — your reviewed row(s).
* New migrations if the bus needs them: **new files only**, never an edit.

## What to build

### Queue (finish)

Wave 0 shipped enqueue/claim/ack with partial-unique dedupe and per-entity serial
keys, four killed mutants, and an 8-worker contention test. Harden it:

1. **A claim that is never acked must not wedge its entity for ever.** Decide the
   policy (lease with expiry? explicit reap? worker liveness?) and **state it in
   your ack** — this is a design call I want to see before code, because every
   sidecar inherits it.
2. **Ordering**: FIFO within a serial key is what callers will assume. Assert it,
   or document loudly that it is not guaranteed.
3. **`ack` on a job nobody is running** already errors (a lost claim is a real
   signal). Keep that; extend it to the states you add.

### Events

`EventBus { publish(Event); subscribe(filter) -> Stream<Event> }`, per
services.dd (PRD req-0015):

4. **Durable leg + live leg.** Publishing appends to `Spine` (replayable via
   `Spine::tail(since)`) *and* feeds live subscribers. The seam between "replay
   what I missed" and "receive what happens next" must have **no gap and no
   duplicate**, and that seam gets its own test.
5. **A slow subscriber never blocks the publisher.** Lag policy is
   **drop-with-count**, never unbounded buffering and never back-pressure onto
   the publisher — a stalled UI stream must not stop the daemon. The dropped
   count is reported, because a silent drop is data loss nobody can see.
6. **Additive kinds never break subscribers.** The `Unknown` variant already
   exists in `pij_core::wire`; an event kind a subscriber has never heard of is
   forwarded, not dropped (R7, and the asymmetry with envelopes is deliberate —
   read `crates/core/src/wire.rs`'s module doc).
7. **`Event` already carries `v` + `at` + `kind`** (wave 0 put them there for
   exactly this unit). Do not add a second version field.

## Done bar

* Gate six stages green.
* **Fan-out property test**: N subscribers, set-equality on what each received —
  not "subscriber 1 got something".
* **Slow-subscriber test**: a subscriber that never reads must not stall the
  publisher, and the drop count must be observable.
* **Replay-vs-live seam test**: subscribe, publish, tail from a sequence — every
  event exactly once across the join.
* **Mutation evidence** on the dedupe predicate (again — it is the queue's whole
  point) and on the filter in `subscribe`. Break, watch the named test fail,
  restore, transcript.
* Composition recipe (COMMON §4) for the bus. The queue's `Real` arm already
  exists; say if your changes alter it.

## Watch for

* `BEGIN IMMEDIATE` (COMMON §1) — you are the crate's second writer this wave.
* Do not put tokio in `pij-core`. The bus's *types and filter logic* are pure and
  live in core; the channel and the runtime live in `crates/daemon`. The arch gate
  will refuse the alternative, which is the point.
* The queue and the bus share a database but not a table. Say in your report which
  tables you own, so the PM can sequence your merge against u-store's.
