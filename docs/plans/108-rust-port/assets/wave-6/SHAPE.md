# Wave 6 — shape

The last build wave. Three units, then full-system first light against a dev store
and port beside the live TS daemon.

## 1. `u-inbox` — the verb the pointer already advertises

**FIRST, because it blocks first light.** `DeliveryService::inbox` is built,
tested, and reachable by NO route and NO verb. A recipient cannot read its
messages through the shipped binary.

And the pointer line — whose exact bytes the PM ruled — says **`run: pij inbox`**.
We shipped an instruction naming a command that does not exist, in the wave that
added a rule about verifying a fixed branch is reachable through the shipped
pipeline. The rule checked branches; nothing checked strings.

Nothing caught it because the pointer's bytes are asserted as a string, the CLI's
verbs are asserted as a list, and **no instrument compares them.** The consistency
test is a required deliverable, not a suggestion.

## 2. `u-uds-open` — turn the socket on

Both preconditions now exist: `u-spawn` stamps `cross_session_inbound_accept`
truthfully from the argv it emitted, and `u-tap` feeds the gate. This is the flip
and its proof — an accept-stamped seat delivers, an unstamped one still refuses.

Also here: re-verify the drop decoder against the CURRENT Claude build. It ships
marked UNPROVEN ON THIS CONNECTION SHAPE and has never been observed to fire.

## 3. `u-bounce` — req-0018, `pij daemon bounce`

Refuse if `HEAD != origin/main`, build, drain-restart, health-verify via the
auth-401 tell, print the version. **Drain-restart means shutdown finishes
in-flight work and never dequeues after the signal** — verify that the existing
runner does this rather than assuming it.

## Held, not scheduled

`u-sidecars` (telegram bridge, `bg` runner, `chore`) is with Jordan: do those three
consumers ship in the Rust generation or retire. Not a dependency — a product
decision.

## Backlog with named triggers (post-cutover, ruled)

* **Seat-level authentication.** The bearer key authenticates a MACHINE, not a
  seat, so `ReaderRead` over HTTP is attestable to machine granularity only — the
  ack row records which key performed it so the limit is auditable rather than
  silent. Trigger: **the day two mutually untrusting seats share one machine key.**
  Not invented mid-wave; req-0007's row states the current truth.
* **The duplicate-read window.** A client that read its inbox and died before
  acking gets those messages again. Duplicate over lost-with-a-lie, ruled three
  times and now doctrine.

* The evicted-id window becomes work when a recipient plausibly takes more than
  1,024 distinct messages inside a five-minute retry window. A traffic fact.
* The claim-crash window becomes work if a duplicate-suppressed receipt appears
  for a message no recipient received. Greppable in the ledger.
* Restart-time revocation becomes work the day a peer key must be revoked without
  a restart. An operational event.
