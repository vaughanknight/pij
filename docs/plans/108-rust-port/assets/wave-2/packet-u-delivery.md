# Coder packet — u-delivery (wave 2)

**Seat model**: `pij spawn --harness pi --bin omp --model github-copilot/gpt-5.6-sol-fast --effort high`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery` · branch `s108/w2-delivery`
**Common contract (read FIRST, including § 9)**:
`/Users/jordanknight/pi-hacking/pij-worktrees/s108-rust-port/docs/plans/108-rust-port/assets/wave-2/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Getting a message to a seat, honestly. This unit fixes the defect that started the
whole port: **a message sent before the seat bound reported success and vanished.**

## Scope

* `crates/core/src/delivery.rs` — **new**: routing policy, pure.
* `crates/daemon/src/delivery/**` — **new**: the runtime half.
* `crates/core/src/lib.rs` — one `pub mod delivery;`.
* your tests, allow-list rows, derived files. Composition recipe, not wiring
  (COMMON § 4) — **you replace no refusal**; `transport`'s `Real` arm belongs to
  wave 3.

## What to build

1. **`send(from, to, body) -> Receipt`** where the receipt is what actually
   happened: `Delivered` (the transport accepted it), `Queued` (durably enqueued —
   a promise the store has ALREADY kept, not an optimistic guess), or `Held`
   (withheld pending approval, with the reason). `DeliveryOutcome` already exists.
2. **Pre-bind queues, never drops.** A seat that exists but cannot receive yet gets
   its message queued and the sender told so. Test it against `FakeTransport`'s
   unreachable script; that fake exists for this.
3. **Every route logs msg-id + outcome.** Ermine's handover gap #8: without it, a
   message that went missing has no trail to follow. Assert the log line, not just
   the return value.
4. **It rides the queue AND the bus** (u-queue/u-events shipped both in wave 1):
   enqueue the work, publish the notification. They are different things — exactly
   once versus fan-out — and conflating them is the mistake wave 1's packet
   warned about. Attach with `Some(cursor)` (COMMON § 9.2).
5. **`inbox(seat, wait)`** for pull-mode consumers. A blocking read is the
   delivery primitive for a paneless seat; it is not a liveness poll.

## Done bar

* Gate green.
* **Receipt-honesty decision table**: busy · pre-bind · dead · held · delivered,
  each asserting the receipt AND whether the message is retrievable afterwards.
* **Mutation evidence** on the queued-vs-delivered branch — the exact defect this
  unit exists to fix.
* Report committed and pushed before the done message.
