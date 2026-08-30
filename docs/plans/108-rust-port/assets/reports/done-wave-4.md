# Wave 4 — done report

**APPROVED** by `pij-varying-sharrow` (openrouter/z-ai/glm-5.3-flash) at
`66629a71`, after three rounds and ten findings. None refuted.

## What shipped

| unit | what it is |
|---|---|
| `u-spawn` | launches a seat through tmux and STAMPS what it launched, from the argv actually emitted |
| `u-names` | the memorable id generator, ported against TS golden vectors |
| `u-pointer` + `u-drain` | the ladder below the socket, and the retry worker |
| `u-federation` | cross-machine send, remote half only |

**282 tests, gate six-for-six**, `cargo metadata --locked` clean at the committed
head, 8 crates / 0 arch violations.

## Amendments ratified and consumed

* **R4-AMEND-1** `Queue::retry(job, delay)` — atomic return-to-pending with the
  attempt counted, plus schema 6's `attempt` / `not_before`.
* **R3-AMEND-5** `TmuxPort::submit(pane, text)` — a separate verb, never a flag,
  so type-without-sending stays expressible.
* **R7-AMEND-1** `Msg.from_machine` and its wire field.
* **R3-AMEND-4** (wave-3 close) `TmuxPort::new_window` optional discrete argv.

## The governance riders

**No stage may repair the input it judges.** The `lock` stage checks the lock
against the TREE as well as the manifests, `clippy` and `test` carry `--locked`,
and `UPDATE_GOLDENS` is removed from the test stage's environment. Each has a
mutation witness.

**Audited, as asked: no other stage writes what it judges.** `toolchain` reads a
pin, `fmt` is `--check`, `clippy` has no `--fix`, `arch` compares and never
regenerates.

## What was deliberately NOT built

* **The pointer rung composes inert.** Nothing feeds `InteractionGate`, which
  denies on unknown. We did not invert that default to make the rung reachable —
  a gate with no sensor that answers "go ahead" is worse than no gate, and it
  would discard Jordan's politeness ruling while appearing to honour it. `u-tap`
  is wave 5.
* **The socket transport stays closed** until a seat is stamped.
* **Registry and event fan-in are deferred**; req-0017 is half-shipped on purpose
  and the PRD row stays unchecked. The deferred packet is written from what we now
  know: three wire changes, none of them made by a unit improvising.
* **Delivery is at-least-once**, with the duplicate window named rather than
  closed by assertion.

## The defect classes this wave produced

**A seam landed in one half.** Seven were mine, in commits I had already announced
as ready: `retry` wrote a counter `claim` could not read; a model field with no
wire field; `message.pushed` dropping it again; and R7-AMEND-1's own collision
still live inside `route()` — the amendment ratified to fix same-name-two-machines,
with the field landed, the wire landed, `accept_forwarded` landed, and the thing
still broken in the one function that had to answer it.

**A fix lands in one half too** (E-029). Schema 7 scoped dedupe by kind while
federation stamped one kind for every peer, so the loss survived for exactly the
rows the migration comment claimed to cover.

**The loop nobody ran** (E-030). Both workers died on their first transient error;
the end-to-end test drove the STEP by hand and nothing ever exercised the loop.
Composed with an absent HTTP timeout and an unscoped lease sweep, three findings
made one silent, permanent, message-losing state.

**A fake's semantics were quietly false — four times.** It dropped a retried body,
accepted an unclaimed retry, ignored not-before, and deduped on the wrong key. A
fake is a claim about the real adapter.

**A witness must activate the mechanism it mutates** (E-027). Two mutation
witnesses my own packets DEMANDED could not fire, and one of them demanded a proof
the source I was citing proves impossible. The coder measured that and declined to
tighten a bound until it fired.

**One field, two schedules** (E-028). `not_before` was to carry both the
announcer's cadence and the reader's availability, so a pointer would advertise
`run pij inbox` and the same worker would hide the body from that inbox for five
minutes.

## Twice the honest fix was to REMOVE a requirement

The pointer **count** — a number nothing could produce, stale by construction, and
when I went to escalate a port method for it I could not write the justification.
And **restart-perfect cadence** — an exactness nobody needs, where a pointer
re-announced after a restart is still saying something true. Both were mine; both
sounded helpful; both would have been paid for in permanent API.

## Accepted residue (reviewer, round 3, non-blocking)

* `drain_once` aborts the remainder of a pass on the first per-row error. Bounded
  by the tick; rows are never stranded; liveness-denting for at most one interval.
* Worker error reporting is `eprintln`. Correct while the daemon has no structured
  log sink; revisit when one exists.
* `harness boot` hides the underlying TypeScript diagnostic on failure — reported
  independently by two coders. The highest-leverage fix is to include the failing
  stage's stderr in the boot envelope. Outside this plan's fence; passed up.
