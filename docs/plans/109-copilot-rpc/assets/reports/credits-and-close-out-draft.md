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
