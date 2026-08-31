# Coder packet — u-inbox (wave 6)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w6-inbox` · branch `s108/w6-inbox`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-6/COMMON.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Make `pij inbox` exist — the verb the daemon has been telling operators to run.

## Why this is first

It blocks full-system first light. `DeliveryService::inbox(&seat, wait)` is built
and tested and reachable by **no route and no verb**, so a recipient cannot read
its messages through the shipped binary.

The pointer line says `run: pij inbox`. That is the exact byte string the PM
ruled, shipped in the wave that added a rule about verifying a fixed branch is
reachable through the shipped pipeline — **the rule checked branches, and nothing
checked strings.**

## What to build

1. **`GET /v1/inbox`**, authenticated like every other route, over
   `DeliveryService::inbox`. It takes the seat and the `wait` behaviour the
   service already implements.
2. **`pij inbox`** as a CLI verb, in both renderings (human and `--json`), like
   every other verb.
3. **THE CONSISTENCY INSTRUMENT — a required deliverable, ruled by the prime.**
   A test that the action a pointer ADVERTISES is a verb the CLI actually exposes.
   Not "assert the pointer says pij inbox" and not "assert the verb list contains
   inbox" — those are the two facts we already had. **Compare them**: parse the
   verb out of the rendered pointer line and assert the CLI exposes it.

   A mutation must fire on it from EITHER side: rename the verb, or change the
   pointer's advertised action, and the test fails.

## Done bar

* Gate six stages green (COMMON § 2).
* Reading an inbox through the SHIPPED binary: register a seat, send it a message,
  `pij inbox` returns it, and a second read does not (per the service's existing
  semantics — read the code, do not assume).
* **The consistency test, with mutations from both sides**, as above.
* `--json` and human renderings from ONE value, as every other verb does.
* Receipt committed and pushed **before** the done message.

## Watch for

* `inbox` acknowledges deliveries — check how it interacts with the delivered-id
  ledger (`ack_delivery`, `ReaderRead`) before you wire it, and say in your ack
  what you found. A read that records `ReaderRead` is making a claim about an
  observation; make sure it is one we actually made.
* The route is a READ that mutates queue state. Say so plainly in its doc comment;
  a reader who assumes GET is side-effect-free will be wrong, and that is worth one
  sentence rather than a surprise.
* Do not widen `ports.rs`.
