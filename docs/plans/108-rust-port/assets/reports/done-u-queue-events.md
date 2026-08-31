# u-queue + u-events done report — plan 108 wave 1

**Coder**: `pij-unchanged-viper` (OMP, `github-copilot/gpt-5.6-sol-fast`, high) ·
**PM**: `pij-revolutionary-lungfish` · 2026-08-29

**Provenance note, stated because it matters.** The coder delivered this report as
a wire message at its done edge; the PM never persisted it, and the gap was found
by the cross-model reviewer (`pij-big-tortoise`) checking the packet's named
receipts against the tree. The content below is the coder's own, transcripts
confirmed verbatim on request; the PM's failure was filing, not fabrication, and
the reviewer's catch is why it is on disk at all.

## Result

**Queue** — configured terminal claim expiry and FIFO proof.
**Events** — a durable replay/live `EventBus` with a sequence join, fan-out,
bounded drop-with-count, and additive-kind filtering.

Tables: the queue owns `jobs`; the bus owns no table and appends only through the
u-store-owned `spine_events`.

## The lease is a POLICY, not a brake

Stated in the terms AGENTS.md demands, because a reviewer looking at a job being
failed by a timer will otherwise go hunting for a retention rule:

> Claim age is **policy**. Removing it changes expired work from *terminal
> failure* to *indefinitely running* — a different outcome, not merely a more
> conservative one.

`claim_lease_secs` defaults to 300 and is **Config-owned**, not a constant: a
default is a number nobody chose. The next non-empty claim atomically fails
expired running rows, recording worker, reason and `acked_at`, and **never**
returns that `JobId` to pending. A stale worker's ack then fails; a retry is an
explicit enqueue that gets a new `JobId`. No worker-liveness coupling, and no path
to automatic double execution.

## Composition recipe

There is no `not_yet` arm for the bus — it is not one of the seven ports, it is a
service composed *from* one — so the recipe adds rather than replaces:

```rust
use crate::events::EventBus;
// in Services:
pub event_bus: Arc<EventBus>,
// after `spine` is built:
let event_bus = Arc::new(EventBus::new(Arc::clone(&spine), config.event_buffer_capacity)?);
```

The queue's `Real` arm already existed; it now passes `config.claim_lease_secs`.
Applied by the PM at composition (`ab27b340`).

## Proof

Environment: rustc 1.98.0 (88d9e12ae), cargo 1.98.0 (797e8a9bc), Avail 137Gi.

Gate: `cargo run --locked -p pij-testkit --bin pij-gate` →
toolchain / lock / fmt / clippy / test / arch all PASS, 8 crates, 0 violations;
tree clean after. The **first** run correctly failed `test` because the arch
metadata fixtures lacked the new `async-trait@dev` / `tokio-stream` edges —
regenerated both per the derived-artifact rule, `arch_drift` 6/6, rerun green.

Targeted: `pij-core` event tests 2/2 · `pij-store` queue 11/11 · `pij-daemon`
`events_bus` 3/3.

### Mutation transcripts (coder-run, confirmed verbatim)

**1 — the event filter**

```
$ ~/.cargo/bin/cargo test --locked -p pij-core \
    events::tests::all_forwards_additive_kinds_but_explicit_filters_stay_exact -- --exact
mutation: kinds.contains(&event.kind)  ->  !kinds.contains(&event.kind)
RED: assertion failed: EventFilter::kinds(["future.kind"]).matches(&unknown)
     at crates/core/src/events.rs:74:9
     FAILED. 0 passed; 1 failed; 1 filtered out   (exit 101)
restored, identical command  ->  1 passed
```

Independently re-run by the reviewer, who mutated `contains` to always-true and
killed **both** `events::tests` — two witnesses, different mutations, same
property.

**2 — the queue's live dedupe**

```
$ ~/.cargo/bin/cargo test --locked -p pij-store --test queue \
    an_acked_key_is_free_again_so_dedupe_is_per_burst_not_forever -- --exact
mutation: enqueue live-row SELECT  state IN ('pending','running')  ->  state = 'pending'
RED: panic at crates/store/tests/queue.rs:90:10
     enqueue: Adapter { adapter: "store/queue",
       message: "no rows returned by a query that expected to return at least one row" }
     FAILED. 0 passed; 1 failed; 10 filtered out   (exit 101)
restored, identical command  ->  1 passed; 10 filtered out
```

The packet asked for the dedupe predicate to be mutated *again* — wave 0's
`assets/reports/queue-mutation.md` killed four mutants on the same SQL, and this
is the fifth against the hardened version.

Also verified by the reviewer on the composed tree: removing the `seq <= last_seq`
join-dedup in `Subscription::poll_next` made
`replay_and_live_overlap_is_joined_once_by_store_sequence` fail with a duplicate
`[1,2,2,3]` shape — the no-gap-no-duplicate join is a real property, not a
path-shaped test.

## Shared-merge files

`Cargo.toml` · `Cargo.lock` · `crates/daemon/Cargo.toml` ·
`crates/testkit/arch-allowlist.toml` · both `crates/testkit/fixtures/arch/*.json`
(derived — regenerated, never hand-merged) · `crates/core/src/lib.rs` ·
`crates/core/src/config.rs` · and the **two** PM-granted logical lines in
`crates/daemon/src/lib.rs` (`pub mod events;`, and the queue constructor's config
argument). The existing daemon review-regression queue constructor was migrated
in the same change.

## Assumptions

1. All live-producing event appends route through `EventBus`; out-of-band spine
   appends remain replay-only.
2. `Event.seq` is `None` entering publish and `Some` from append/tail; serde keeps
   the cursor off the fixed R7 event wire.
3. The drop count advances when the lagged subscription is polled.
4. `Spine::tail` remains oldest-first.
5. No queue migration was required — migration 0002 already declared
   `claimed_at`/`acked_at`; `enqueued_at` stays unpopulated and ordering stays
   id-based, so no clock contract was invented.
6. Store tests remain in `crates/store/tests/queue.rs`.

## Packet defects surfaced at the ack

D1 `Spine::tail` sequence gap (found independently by u-store) — ruled additive,
`Event.seq`, PM-owned · D2 no channel for a dropped count — `Subscription` exposes
`dropped_count()` · D3 services' "typed Event enum" is stale prose against the
shipped struct — code authoritative · D4 no `not_yet` arm exists for the bus —
recipe adds rather than replaces · D5 ownership narrowed to `queue.rs` ·
D6 `ack` was still on autocommit despite the every-write-transaction rule — now
`begin_write` · D7 migration 0002's columns were declared but never written.
