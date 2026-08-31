# Wave 1 done report — plan 108 (store · queue · events · tmux · liveness)

**PM**: `pij-revolutionary-lungfish` · **Prime**: `pij-dominant-vicuna` ·
2026-08-29 · **Reviewer**: `pij-big-tortoise` (`openrouter/z-ai/glm-5.3-flash`,
high, cross-provider) — **APPROVE**

## Head, toolchain, disk

```
HEAD=8cfbd54d
PUSHED=8cfbd54d
CLEAN=0
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail=212Gi
```

Branch pushed to `origin/s108/rust-port`. **No PR.** 29 commits since wave-0's
APPROVE point (`e508cd97`).

## Gate

```
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

`cargo test --workspace`: **122 passed, 0 failed** (wave 0 closed at 86). Working
tree clean before and after the gate — independently confirmed by the reviewer.

## What shipped

| unit | seat | delivered |
|---|---|---|
| u-liveness | `pij-grotesque-fish` | `ProcLiveness` exact-pid adapter; five-row decision table; permission-denied is an error, never `Dead` |
| u-tmux | `pij-sufficient-llama` | `TmuxAdapter`, all six port methods; fixture-backed parsing incl. hostile pane titles; every real call inside an entropy-named detached session |
| u-store | `pij-rapid-gurgeh` | full Registry/Spine contract, crash-mid-write, single-writer serialisation, absent/NULL/empty kept distinct, tombstone reason readable through the port |
| u-queue + u-events | `pij-unchanged-viper` | configured terminal claim lease, FIFO proof, durable replay/live `EventBus` with a sequence join, fan-out, bounded drop-with-count |

**Two of the four wave-0 refusals are deleted** — `liveness` and `tmux` are wired.
`transport` and `harness` still refuse by name, for waves 3 and 2.

## Composition

Merged in dependency order (liveness → tmux → store → queue/events). **Every
composition recipe was pasted by the PM, not by its author**: four coders and one
`crates/daemon/src/lib.rs` is the collision tenet 4 exists to prevent, and the
only exceptions were two logical lines I granted u-events explicitly.

Derived artifacts (`Cargo.lock`, both arch metadata fixtures) conflicted at every
merge after the first — exactly as `COMMON.md` predicted — and were resolved by
**regeneration from the composed tree**, never by hand. The single genuine content
conflict was two units' allow-list rows for one crate, which combined cleanly.

The PM landed one thing directly: `Event.seq` and the tombstone fields
(`4d84eb50`). A type two units both consume is not a unit's work.

## First light

`assets/reports/first-light-wave-1.md` — a transcript, not an exit code: a real
registry round-trip through SQLite including a tombstone whose reason is readable
through the port, a durable publish, two subscribers attached at a cursor
receiving the same event, and a replay proving the exactly-once join.

**It found what 122 green tests could not**: `subscribe(since: None)` replays the
entire spine. Documented behaviour, correct for a cursor that has seen nothing,
and unbounded work at attach time for a UI joining a long-lived fleet. Filed as a
scaling question, agreed by the reviewer, and **carried into the wave-2 packet**:
consumers attach with `Some(cursor)`.

## Review — APPROVE

**One finding, zero code defects, and the finding was mine.** The u-queue-events
done report arrived at the coder's done edge as a wire message and I never
committed it, so the reviewer packet named a receipt that existed nowhere. The
reviewer checked the named receipts against the tree rather than assuming, and
found it.

Closed by persisting the coder's own report — transcripts confirmed verbatim on
request rather than paraphrased — with the provenance stated in the report
itself: the failure was filing, not fabrication, and *a receipt that only ever
existed in a chat log is not a receipt.*

The reviewer's own verification, kept because it is evidence: six stages green
with a clean tree before and after; 122 tests; the first-light transcript
reproduced; **three independent mutation spot-checks** — removing the `seq <=
last_seq` join-dedup produced a duplicate `[1,2,2,3]`; `splitn(4)` → `split` broke
the hostile-title parse; an always-true `EventFilter` killed both filter tests.
Seven traits in `ports.rs`, untouched by the wave; no SQL outside `store`; no
tmux invocation outside `tmux`.

## The ack gate

**17 defects across four acks, none refuted, all surfaced before any code
existed.** Two are worth the prime's attention:

* **Two coders independently found the same structural defect** — `Spine::tail`
  returning `Vec<Event>` with no sequence — from opposite ends of it. Fixed
  additively; `ports.rs` never moved.
* **u-tmux found a dead premise in a frozen port**: `user_typing` cannot be
  honestly answered from tmux. Ruled without widening the trait, with `FALSE`
  documented as "no tmux-observable interaction" and never "safe to inject", and
  the stateful gate handed to wave 2 as a **named** obligation.

## Policy-vs-brake calls, stated in the AGENTS.md terms

* **Queue lease — POLICY.** Age decides a terminal outcome; removing it changes
  expired work from terminal failure to indefinitely running. Duration is
  `Config`-owned, never a const.
* **tmux `kill` — brake.** Refuses a pane id it did not freshly resolve; removing
  it kills *more*.
* **`user_typing` — brake**, with the honest caveat above.
* **Exact-pid liveness — brake.** Removing it inspects more processes.

All four verified by the reviewer as matching the code, not just the prose.

## Assumptions

1. `subscribe(None, …)` is full-spine replay by design; consumers joining a
   running fleet must pass `Some(cursor)`.
2. All live-producing appends route through `EventBus`; out-of-band spine appends
   are replay-only.
3. `Event.seq` never reaches the wire (`#[serde(skip)]`, asserted) — R7's v1 shape
   is exactly `{v, at, kind, seat, payload}`.
4. The queue lease does **not** requeue: retry is an explicit enqueue with a new
   `JobId`. No worker-liveness coupling.
5. `enqueued_at` stays unpopulated; ordering is id-based. No clock contract was
   invented.
6. `user_typing` is `pane_in_mode` only until wave 2 ANDs the stateful gate.
7. Real `tmux` is never exercised against the operator's fleet — tests create and
   destroy their own detached session; first light keeps tmux fake for the same
   reason.
8. Baselines remain deferred to `u-sidecars` (no frozen contract to build against).
9. R5 items 3/13/14 need descriptor fields owned by u-harness/u-orchestration.
10. `harness checks` still cannot run here (no node tooling); `pij-gate` is the
    executed definition of done.

## Friction

`assets/experiences.md` E-015…E-019. The two the templates should absorb: **a
fence written from the code's structure always omits the derived files** (four
coders asked about `Cargo.lock` and the arch fixtures before the rule was
written down), and **a type two units both consume belongs to the PM, landed
before either needs it.**
