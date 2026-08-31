# Coder packet — u-federation (wave 4)

**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w4-federation` · branch `s108/w4-federation`
**Common contract (read FIRST)**: `docs/plans/108-rust-port/assets/wave-4/COMMON.md`
**Wire contract**: `assets/wave-3/WIRE-CONTRACT.md`
**PM**: `pij-revolutionary-lungfish`

## Mission

Cross-machine messaging (PRD req-0017). A daemon per machine, each with its own
database, routing to each other over the HTTP surface that already exists.

## What is already built, and what was deliberately refused

`u-daemon-http` shipped the PRIMITIVES and refused the network on purpose, at its
own ack (D6): a `post_to_peer` one-request forwarder, `PeerEndpoint`, the peer key
ring (persistent, per pair, inbound acceptance is a ring), and `Destination {
seat, machine }`. **`/v1/send` accepts only `machine: None` today** and refuses
anything else by name.

The reason that refusal exists is worth carrying: `delivery_kind(&seat)` is
identical for `alice@local` and `alice@remote`, so the origin side does not route
on it — **the destination side always enqueues locally**. A half-built network
inside a wave-3 route would have made that ambiguity a live bug.

## What to build

1. **The peer registry** — a `BTreeMap<String, PeerEndpoint>` and ONE
   `reqwest::Client`, owned by a worker rather than a request handler.
2. **Alias rules, enforced**: peer aliases are unique, none may equal the local
   alias, and an unqualified name is ALWAYS local. `u-daemon-lifecycle` owns the
   local alias (hostname-defaulted); you own the peer map and its validation.
3. **Remote send**: resolve the machine alias, `post_to_peer` once, and retry on
   failure with a bounded policy you state. A remote send that cannot be delivered
   **stays queued and is retried** — it is never silently dropped and never
   reported delivered.
4. **Registry and spine fan-in**: remote seats visible in `pij list`, remote events
   readable. **The federated cursor is a per-machine map**; frames are `{machine,
   cursor, event}`; `Event.seq` stays `#[serde(skip)]`.

## The receipt rule applies across machines

A remote delivery's outcome must name what was OBSERVED. Bytes accepted by a peer
daemon's HTTP endpoint is **not** the recipient reading it — that is
`InjectedToTransport` at best, and the peer's own receipt is what upgrades it.
Read `DeliveryOrigin` and E-023 before you decide what a remote send returns; the
entire vocabulary exists because a previous implementation reported `confirmed`
for something it never observed.

## Done bar

* Gate six stages green (COMMON § 2).
* **Two daemons, in-process, actually talking**: register on A, send from A to
  `seat@B`, and prove the row lands in B's queue and B's spine. Not a mocked
  client — two real routers on two ports.
* **The alias table**: unqualified resolves local; a duplicate peer alias is
  refused; a peer alias equal to the local alias is refused.
* **Auth both ways**: a peer key accepted inbound, a wrong key refused, and the
  key REMOVED from the ring refused afterwards (that is how an operator revokes).
* **A remote send that fails stays queued**, with attempt accounting intact — one
  writer, per the fork lesson in `assets/wave-3/packet-u-uds.md` § 8.
* Mutation transcripts, composition recipe, assumptions, receipt committed and
  pushed **before** the done message.

## Watch for

* Bearer key is the only LAN control; there is no TLS of our own. The comparison
  is already constant-time — do not add a second path that is not.
* Bootstrap is MANUAL and stays manual this wave. No discovery.
* Do not touch routing policy in `core::delivery` — that is `u-pointer`'s and
  mine. If federation seems to need a routing change, say so at the ack.
