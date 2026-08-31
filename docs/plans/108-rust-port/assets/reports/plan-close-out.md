# Plan 108 — close-out

**Composed head `a748c0d7`. Six gate stages green — toolchain, lock, fmt, clippy,
test, arch — 9 crates, 0 architecture violations, 363 tests passing.**

Eight waves (0–7), every unit through review, **every wave approved**. Across the
whole plan the ack gate raised well over a hundred findings and **not one was
refuted**.

## What exists

A Rust pij: store, spine, queue, registry, tmux, transport, liveness behind seven
frozen ports; an HTTP daemon with per-boot bearer auth and machine-graded peers;
seat spawn and naming; federation; pane observation with a human-interaction gate;
a two-step inbox; pointer announcement with a parking cap; `pij daemon bounce`;
Telegram, background-command and chore sidecars with a shipped producer surface;
and the cutover controls that let a seat run on either generation.

## PRD

- **req-0018** (bounce) — checked, with evidence.
- **req-0019** (cutover controls) — checked, with evidence, including the
  cross-generation lock contract.

Checked one row at a time against its own receipt and review verdict. Never in bulk:
a register checked in a batch records the checker's confidence, not the code's state.

## Ports: frozen at seven, amended three times

Each amendment carried an exact signature to the prime, and each replaced an
inference with a question put to the thing that actually knows:

- **`Spine::latest_matching`** — the unpark check was reading the ENTIRE spine on
  every inbox claim in order to call `.last()`. Ratified *with* its instrument: a
  `CountingSpine` that fails on a full scan from that path, because **a cost claim
  without an instrument is a comment**.
- **`TmuxPort::pane_tap_sink`** + marker-as-ownership — not a relaxation of "existence
  is not ownership" but that rule finally used for the case it was invented for:
  after a crash the marker is the only surviving evidence, and that is exactly when
  consent is least defended.
- **`Queue::ack_delivery -> DeliveryAck`** — attestation attributed by the authority,
  read inside the commit transaction, instead of taken from the request body.

Banked as one doctrine: **ask the WORLD what it owns; ask the AUTHORITY who read.**

## The defect this plan kept finding

One mistake, in fourteen costumes: **taking the nearest available signal as evidence
of the thing actually cared about.**

Pipe EXISTENCE mistaken for ownership. A tombstone ROW mistaken for a release. A
detach RETURN mistaken for a teardown. A MARKER's presence mistaken for *our*
marker. A zombie ROW mistaken for a survivor. `reap() -> None` mistaken for *never
exited*. A config LIMIT reported as an observation. A HOST's success reported as an
extension's. An RPC ack reported as a turn. A `reader-read` reported as a human
reading. `kill`'s English STDERR used as control flow. A lock that could not be
PARSED read as absent, and absent read as reclaimable. A pid observed live in a scan
mistaken for a pid live at kill time. And a null result — a discriminator that never
ran — published as a positive.

Its companion: **a fix landed in one half.** The caller fixed and the primitive left
armed; the Rust client updated and the TypeScript one not; the allowlist rule added
and the derived fixture not; a security fix whose own commit broke two other things
precisely because all the attention was on the defect it closed.

## What made the difference

**Dogfood.** Real agent seats, spawned by the thing under test, on a live machine.
Four defects came out of one afternoon's dogfood that no test had caught, and a seat
on an `accept=false` pane produced five findings by *living with* the system —
including the fork's unbounded-pointer bug, found by counting its own turns, and a
`reader-read` in a ledger for a body it never received.

**Live proof of destructive claims.** A fix for a destructive defect is proven by
**the destruction failing to happen** — DELETED before, SURVIVES after, same
procedure, discarded runs disclosed.

**Mutation over repetition.** Repetition distinguishes *rare* from *never*; it cannot
distinguish *rare* from *conditional*, and it never names a mechanism. A one-word
mutation reproduced on demand what eight full-workspace runs had only counted.

**Reviewers who disclosed their own instrument errors.** Fifteen across the plan's
later waves, every one caught by the person who made it, **none reaching a verdict**.
One probe reaped the zombie it was measuring; one runner summarised a hard failure as
`OK — 5s`; one offline run regenerated the lockfile in the tree it was judging, on
the head whose finding was that the lock was missing. The reliability of the rest
rests on those having been reported.

**Coders who stopped.** Six times a coder refused to wire past an ambiguity and
asked instead — and twice shipped a fix better than the one ruled. One of them
answered a question about whether an instrument was worth building by *specifying
the instrument*.

## Composer's defects

Named in the wave reports rather than omitted: a producer route returning a bare body
so the client reported FAILED for work that landed; a `$HOME` default that would have
had every dev daemon seize the operator's production Telegram poll; a "cheap probe"
ruling that could not converge on a zombie-only group; two coders dispatched into one
worktree and then onto one branch; a shared build cache that served one coder
artefacts compiled from another's unpushed source; a null result published as a
positive proof; and, at the final item, implementing a ruling in parallel with the
coder who was already implementing it.

**A report that lists only the coders' defects teaches the next PM that composition
is the safe seat.** This plan is evidence it is not.

## Not done here

`u-copilot-rpc` is wave 8: the spawn descriptor amendment first and **alone**, with
its *revive re-stamps fresh* witness, then the transport. Falsifiers pre-registered
before code — now a standing wave-entry requirement, because this plan's two cheapest
findings arrived that way.
