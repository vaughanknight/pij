# Wave 2 done report — plan 108 (services over the wave-1 substrate)

**PM**: `pij-revolutionary-lungfish` · **Prime**: `pij-dominant-vicuna` ·
2026-08-30 · **Reviewer**: `pij-rigid-geronamid`
(`openrouter/z-ai/glm-5.3-flash`, high, cross-provider) — **APPROVE**

## Head, toolchain, disk

```
HEAD=910b30dc
PUSHED=910b30dc
CLEAN=0
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail=218Gi
COMMITS_SINCE_W1=30
REFUSALS_LEFT=2
```

Branch pushed to `origin/s108/rust-port`. **No PR.** 30 commits since wave 1's
done report. **Two `not_yet` mentions remain** in the daemon: the function itself
and one arm — `transport`, for wave 3. Every other refusal is deleted.

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

`cargo test --workspace`: **181 passed, 0 failed** (wave 1 closed at 122). The
reviewer counted independently and got the same number, with `git status --short`
empty after every run.

## What shipped

| unit | seat | delivered |
|---|---|---|
| u-report | `pij-identical-wolf` | cards over the spine, the 280 limit as a documented error at 279/280/281, freshness on an injected clock, absent ≠ empty |
| u-watchdog | `pij-cloudy-caribou` | eligibility as a decision table across every tier × state, exemption > compact > self, the healthy-long-tool-call false-stall regression |
| u-anomalies | `pij-defensive-parrot` | three detectors with named observables and runnable remediation lines, dispositions as spine events, cleared-stays-cleared |
| u-delivery | `pij-arrogant-ant` | honest receipts, pre-bind queueing, `delivery:<seat>` addressing, msg-id+outcome audit on the bus |
| u-harness | `pij-random-mosquito` | five adapters + registry, bind evidence, readiness anchors from real captures, #19 subagent scoping through `core::admission`, the typing gate as an AND |
| u-orchestration | `pij-fashionable-genar` | equivalence merge, spawner attribution with explicit `unknown{reason}`, ordinal minting across clone+worktrees+heads, single-holder leases, one capability chokepoint |

## Review — APPROVE, two findings, neither blocking

**Finding 1 (mine, should-fix)**: the reviewer packet's read-order named
`done-wave-2-u-store.md` — a receipt that never existed in any wave. I built the
packet by sed-rewriting wave 1's and then patched the receipt list by exact-text
match; the sed ran first, so the patch matched nothing and said nothing. Fixed at
`910b30dc`, with the incident recorded in the packet itself.

**The transferable half (E-020)**: a targeted edit after a mechanical rewrite must
be verified, because *"replaced nothing" and "replaced correctly" look identical
from outside*. And a checklist derived from last wave's checklist inherits last
wave's names.

**Finding 2 (note)**: `done-u-delivery.md` §7 records a live recurrence of the
exact defect that unit replaces — a pij receipt said `Delivered` for a message
whose body never injected. Kept as evidence rather than reconciled away; relevant
when `u-uds` lands in wave 3.

### The reviewer's own verification, kept

Three mutation spot-checks, its own edits, all reverted with the tree
byte-identical afterwards: `same_process || same_spawn` → `&&` broke the
five-row equivalence table; the same line reduced to pid-only broke the
recycled-pid row ("the recycled-identifier doctrine holds"); `>` → `>=` on
`CARD_LIMIT` broke the 279/280/281 boundary test. All three matched the coders'
transcripts exactly.

It also checked that the **rulings landed in code, not just in reports** — the
thing I most wanted from this review: `models()` returns `Err` naming u-models;
both half-state errors name which half landed; the staleness/nudging axes agree at
the seam and both consume `model::Card` with no parallel type;
`delivered-unacked-stale` is the shipped spelling; tombstoned delivery refuses
with `SeatIsGone`; `delivery_kind` is formatted in exactly one place; five
adapters not a composite; and the typing gate is a real `&&` where an unknown
composer state blocks.

Frozen contracts intact: seven traits in `ports.rs`, no SQL outside `store`, no
tmux shell-out outside `tmux`. **Zero `subscribe(None)` call sites in production
code.** Bind evidence preserves absence — no `unwrap_or` invention anywhere.

## Rulings this wave turned on

Eight, each from a coder's ack, each now checked in code by the reviewer. The
three I would carry forward:

1. **`models()` returns an error, never an empty `Vec`.** Empty *claims* the
   harness has no models — the absent-vs-empty collapse this port keeps fixing.
2. **Cross-port writes report the true half-state.** No atomic path spans Registry
   and Spine, or an action and its audit, so the error names which half landed and
   the caller reconciles by id. Filed as one R5-style row: two units hit the same
   limitation independently.
3. **Staleness and nudging are different axes.** Ruled toward observed TS
   semantics on the prime's grounding; from first principles I would have
   suppressed staleness for parked seats and broken parity silently.

## Assumptions

1. `transport` still refuses when set to `Real`; `u-uds` lands wave 3.
2. `u-models` owns `crates/harnesses/src/models/**`; until then `models()` errors.
3. Baselines remain deferred to `u-sidecars`.
4. Bind evidence is caller knowledge (transcript path, planned session id,
   phonehome); `None` stays `None` for an adopted seat.
5. The queue lease is a **policy** (age decides a terminal outcome), configured
   not const; retry is an explicit new enqueue, never an automatic requeue.
6. Anomaly dispositions live as spine events keyed by occurrence; `u-cli` is the
   named future consumer of the command surface.
7. Cards live on the spine — no report table, no parallel truth.
8. `harness checks` still cannot run here (no node tooling); `pij-gate` is the
   executed definition of done.
9. **New since dispatch**: PRD req-0017 (cross-machine federation) landed at
   `e40794e7` and changes three wave-3 unit contracts — `u-daemon-http`
   (bind beyond loopback, per-machine key exchange), `u-cli` (`seat@machine`
   parsing), `u-daemon-lifecycle` (machine alias, hostname default). It is folded
   into the wave-3 packets before dispatch, not retrofitted after.

## Friction

`assets/experiences.md` E-015…E-021. The two new ones are both mine: the
mechanical-rewrite no-op above, and **a checksum proves a file has not changed;
it cannot prove the file was ever right** — the corpus's ANSWER field is what
caught a fixture I had shipped as 16 blank lines with a perfectly correct sha.
