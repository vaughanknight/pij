# Plan 109 — credits, and the close-out draft

Written **before** the seats are closed, because credit that lives only in a
released agent's transcript is credit that did not survive.

## The gate's first outing — the release-notes centrepiece

The Rust CI job added for this release found **four defects nothing local could
see**, and three were real rather than cosmetic:

- a clippy import **dead only on Linux** — this workspace had never been compiled on
  Linux;
- a test comparing against **the author's own home directory**, green on every
  machine it had ever run on **because every machine was that one**;
- a lock-holder liveness probe **shelling out to `/bin/kill`**, whose answer depended
  on which implementation was on the box — and whose out-of-range pid was one cast
  away from a signal call where **`-1` means every process**;
- a lint whose scope was wrong in **both directions at once**: vcs-on hid real files,
  vcs-off invented artefacts.

> **Every one of those was an honest green about the wrong world.**

That is the sentence this plan converges on, and the gate is what made the worlds
differ.

## Credits

**`pij-busy-macaw`** — unit 1, three refusals absorbed without once arguing a defect
was acceptable. Shipped, unprompted, a **producer-side refusal of an empty spawn id**
with the reason in the message — *"so the first bind can correlate its launch"* — the
`Some(0)` lesson applied at the producer rather than the consumer, which nobody asked
for.

**`pij-orthodox-tahr`** — the revive verb, and **the withdrawal**. Told of a finding
about someone else's code, it read its own green witness, found it took the spawn id
from the persisted descriptor and passed it by hand, and wrote: *"the fixture has a
capability the shipped launcher did not provide; my prior green therefore does not
prove fleet first-bind preservation."* **The reviewer could not have caught it — its
fence was the mechanism, not the verb.** It then rebuilt the arm to parse the discrete
argv the launcher recorded, and that arm reproduced F9 red before the fix existed.

**`pij-skinny-oramen`** — release-prep witness repair, and the pattern now going into
the packet template: **it ran the reviewer's named mutation against its own fix before
declaring.** Also scoped its own fake unprompted (*"this proves our configured
contract, not Node's internal retry implementation"*) and named its residual rather
than leaving a silence.

**`pij-remaining-chameleon`** — reviewer across all three units. **Nine findings over
four rounds on unit 1, every one closed by an observation it ran at the head it was
judging**, plus two on the witness unit closed by reds it produced rather than greens
anyone reported. It pre-registered acceptance criteria before each fix existed —
including **M10**, which is the only reason we know the correlator arm checks
*identity* and not merely *presence*.

And **nine disclosed instrument errors, none of which reached a verdict** — including
a probe that reaped the zombie it was measuring, a `SIGPIPE` read as a test failure,
and a reverse diff that was **a revert wearing the shape of a fix**. Its
generalisation of its own failures is the most reusable thing either plan produced:
*the probe did not establish the scope of its own question.*

> A reviewer who has never disclosed an instrument error is a reviewer whose
> instruments nobody has checked.

## The two classes this plan named

- **Coincidence by construction** — *the fixture cannot produce a case where the two
  states differ.* Tell: a test that **cannot go red**.
- **Capability asymmetry** — *the fixture can produce a case production cannot
  reach.* Tell: a test that **goes red correctly, for a scenario nothing can enter.**

The tells are opposite, which is why **mutation testing cannot detect the second** —
and why the discriminating question for it is **what does a real caller actually
know**.

## Deferred, with triggers

- **D-1** — three tests assert a negative via a 20ms timeout and pass *because the
  timeout elapsed*.
- **The cross-boundary list** — *every cross-boundary contract in this workspace is
  currently held by reading, not by running*: the Rust/TypeScript correlator literals,
  and Node's `maxRetries` semantics. The response is not to reimplement the other
  side; it is to **know the list, keep it short, and let each entry carry its own
  disclosure line.**
- **unit 2** (`u-copilot-rpc`), packet written; **verb parity** at 15%, with `tail`
  renamed before parity completes, while it is still a correction.

## Observed in production, after the tag: RF29-2 was not hypothetical

Before deploying, the prime ran **one rs spawn on the OLD build** — pre-merge daemon
and binary — and captured both halves:

```
API response allocated:      pij-free-flute
launched process env:        PIJ_SESSION_ID=pij-enchanting-aardvark
```

**Emitted and stamped diverged in production, on a plain omp spawn.**

That is exactly the failure the reviewer registered as **RF29-2** before the fix
existed: *the spawn id is minted in one place and the argv is built from another, so
if a second id is minted for the argv rather than threading the stamped one, emitted
and stamped diverge — and every test that reads the launch id from the SPAWN RESPONSE
still passes.* It was written down as the failure to expect **if anything went
wrong**, and it was already happening.

Two things it settles for the record:

- **The reviewer's condition was blocking a real fleet defect, not a theoretical
  one.** "Same minted value threaded end to end, never a second mint" looked like
  pedantry about an internal detail; it was a description of production.
- **The correlator riding EVERY spawn, not only Copilot, is demonstrated rather than
  argued.** This was an **omp** seat. Had the ruling gated the correlator on
  `Harness::Copilot`, this divergence would have stayed live on every other harness
  and been discovered by whoever needed it next.

The discriminating pair is the post-deploy repeat of the identical spawn on the new
build: **allocated == env id**. One command, two values, and the claim is settled in
the direction the evidence points — which is how every other finding on this plan was
closed.

## The discriminating pair, both directions, in production

Identical spawn command, two builds, values read **from the launched process's
environment** rather than from the API response:

| | allocated | `PIJ_SESSION_ID` in the launched env | `PIJ_SPAWN_ID` |
|---|---|---|---|
| **OLD** | `pij-free-flute` | `pij-enchanting-aardvark` | **absent entirely** |
| **NEW** (`67f8a19e`) | `pij-irregular-apocalypse` | `pij-irregular-apocalypse` | `s-6a54b59c…` — **byte-for-byte the spawn response's `spawn_id`** |

**The fix reaches production.** Same minted values threaded end to end, and the check
was made where a real seat reads them — *not* where the fixture could have supplied
them.

That last distinction is the plan in miniature. The witness that green-lit the first
three heads compared against a value it had taken from the spawn response; **this
comparison is against the launched environment**, which is the only place the claim
was ever about. Capability asymmetry, closed by the same discipline that named it:
**what does a real caller actually know.**

And both arms exist. A green with no red beside it would have proved that the new
build works, not that the old one was broken — the old build's divergence is what
makes the new build's equality mean something.

## B-1 — BACKLOG, BLOCKING UNIT 2 — the extension registers a THIRD id, stranding the row the port is stamped on

Found by the live deployment proof, **one seam above the one the fix closed**.

Generation detection works — the seat toasts *detected Rust daemon v1, registered*.
But the store then holds **two rows for one seat**:

```
pij-irregular-apocalypse   pre-bind, proc:false   pane %1963   spawn_id s-6a54b59c…
pij-empirical-caribou      live,     proc:true    pane %1963   spawn_id s-6a54b59c…
```

**Same pane. Same spawn id. Two seats.** The daemon had everything needed to
correlate them and created a second row instead: the extension's register path does
not adopt `PIJ_SESSION_ID`, and rs registration has no adopt/claim semantics — the
parity report had already called rs `register` *"a renamed, reduced adopt"*, before
anyone knew it mattered here.

### Why it blocks unit 2 specifically

**`rpc_port` is stamped on the PRE-BIND row.** So every daemon-spawned rs seat strands
a phantom row, and **the port is stranded with it** — while the live row, the one a
consumer would look at, has no port at all.

That is **F8's absence table one seam up**: an absent port on the live row no longer
means *"never launched with the flags"*; it means *"launched, and the stamp is on the
other row"*. Unit 2's read-time possession check would consult exactly the row that
does not carry it.

### The shape of it, for the record

The launcher seam is **closed and proven** — env equals allocation, byte-for-byte, in
production. The adjacent seam was never checked **because the correlator work looked
complete**. That is E-031 at the seam level: *the fix landed in one half*, and the half
it landed in was the one everybody was looking at.

**Trigger: before unit 2 dispatches.** Not blocking the restart round — existing seats
boot-register with no pre-bind row and strand nothing — and blocking real Copilot RPC
use via spawn, which is unit 2's entire subject.

