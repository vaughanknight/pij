# Wave 5 — done report

**APPROVED** by `pij-elderly-capybara` (openrouter/z-ai/glm-5.3-flash) after four
rounds and twelve findings. None refuted. **Four were in code written to fix its
own earlier findings.**

## What shipped

| unit | what it is |
|---|---|
| `u-tap` | the pane observer — the pointer rung finally has a sensor |
| `u-federation-2` | federated roster and event stream: `SeatDescriptor.machine`, typed `FederatedRoster{seats,unavailable}`, per-machine cursor map, `scope=local` peer reads, tagged in-band control frames |
| `u-dedupe` | destination-side delivered-id ledger on schema 8, with atomic `enqueue_delivery`/`ack_delivery` |

**308 tests, gate six-for-six**, lock clean at the committed head, 8 crates / 0
arch violations.

## Amendments ratified this wave

* **R3-AMEND-6** — `TmuxPort` gains the pane tap and the cursor PAIR. The tightest
  port change of the port: nothing trimmed, because every item arrived with the
  reason it could not be dropped.
* **R4-AMEND-3** — `enqueue_delivery` / `ack_delivery` plus schema 8. Wave 4's
  "exactly one migration" bound was amended BY RULING rather than eroded silently.
* **R4-AMEND-4** — `note_delivered` / `forget_delivered`, claim-before-inject for
  the direct path, with the prime's binding rider built: compensate on synchronous
  failure, NAME the residual crash window, and witness the FAILURE path.

## The rule this wave produced

> **Every fix names the path it executes on, and the reviewer verifies the fixed
> branch is reachable through the shipped pipeline.**

It exists because three of my four fixes landed on the path the FINDING described
rather than the path the DEFECT lived on, and one of them was unreachable through
the shipped pipeline at all (E-031).

## What the review found, in one line each

* A stream that skipped a backwards cursor SILENTLY — E-023's shape inside the
  code written to prevent it.
* A first-sight blank composer PERMITTING injection: more permissive than the TS
  rule we declined to inherit for being too eager.
* The ledger fix landing in one half, twice more — local queue-routed, then
  transport-direct, which is the likeliest path of all.
* A recovery branch that could not be reached, then one that branched on PROSE
  after this project spent a wave removing prose-branching.
* A re-raise FABRICATING its numbers, so an operator read the right diagnosis
  carrying evidence nobody measured.
* Every witness I owed and had not written — including two of my own regression
  tests that passed their own mutations before witnessing anything.

## What is now honest that was not

* The pointer rung has a sensor that **says unknown when it cannot see**, and
  blocks on unknown. Restart baselines to unknown; no age-based release, because
  age cannot distinguish a parked draft from a paused human.
* A federated roster distinguishes **empty from unreachable** in a typed field,
  not in prose.
* A peer whose history was reset is **named** (`ErrorKind::CursorReset`, 409,
  carrying the two real numbers as data) and the consumer **resumes** rather than
  retrying an impossible cursor for ever.
* A delivery is claimed before it is injected, and a failed injection **releases
  the claim** — because a claim that outlives a failed delivery is a lost message
  wearing our most confident receipt.

## Still deliberately open, and named

* At-least-once, with two named windows: an evicted id past the per-recipient
  bound, and a hard crash between claim and compensation.
* Peer bootstrap is manual; revocation is restart-time.
* `harness checks` cannot run in these worktrees. Four observations across two
  waves now point at the same surface — boot hides its diagnostic, and a fresh
  linked worktree has no `node_modules`. Carried up, outside this plan's fence.
