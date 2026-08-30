# Coder packet — u-dedupe (wave 5)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w5-dedupe` · branch `s108/w5-dedupe`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-5/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Close the at-least-once window wave 4 NAMED rather than hid.

## The exact window

A forwarded message always enqueues on the destination
(`DeliveryService::accept_forwarded`), so a duplicate forward collapses onto the
live row through `msg_id` dedupe — **while the first copy is still pending or
running.** If it has already been claimed and acked, a retry after an ambiguous
network failure delivers the message TWICE.

Wave 4's coder refused to invent exactly-once and named the window instead. That
was right, and this unit is the honest close.

## What to build

A durable record of DELIVERED ids per recipient, consulted before a forwarded
message is enqueued.

Three things I care about more than the mechanism:

1. **BOUND IT.** An unbounded table is a leak wearing a correctness argument. Say
   what the bound is, what it costs at the edge, and what happens to a duplicate
   that arrives after the bound has forgotten — because something eventually will,
   and "we never thought about it" is the answer that ships.
2. **The bound is a POLICY, so it is CONFIG**, injected, never a constant.
3. **It must not weaken the live path.** The existing collapse is cheap and
   correct; this is a second gate in front of it, not a replacement.

## The distinction to hold

**A record of what was DELIVERED is not a record of what was SENT.** Only the
first can answer "have I already given this to the recipient", and only the
destination can hold it — an origin that tracked its own sends would be recording
what it BELIEVES, which is the class of claim this whole project exists to refuse.

## Done bar

* Gate six stages green.
* **Duplicate after ack is refused**: forward, claim, ack, forward the same
  `msg_id` again — the recipient sees it ONCE. That test does not pass today and
  it is the unit.
* **The live-collapse path still works** — a duplicate before the ack still
  collapses, unchanged.
* **The bound is proven**, not just configured: fill past it and show what happens.
* **The loop test (COMMON § 1.3)** if you add or touch any long-lived loop.
* Mutation: remove the delivered-id check and watch the duplicate test fail.
* Receipt pushed before the done message, with the residual window (if any) named
  as precisely as wave 4 named this one.

## Watch for

* Schema is at **7**; a migration is stop-and-ask, and you will probably need one.
  Declare it at the ack.
* `Queue` dedupe is `(kind, dedupe_key)` over LIVE rows — read wave 4's E-029
  before you assume what that covers, because a fix landed in one half there once
  already.
