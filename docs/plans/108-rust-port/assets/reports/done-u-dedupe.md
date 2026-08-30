# Done — u-dedupe

## Result

Implemented destination-side delivered-id dedupe under ratified R4-AMEND-3 and schema 8.

- `Queue::enqueue_delivery` checks durable destination history and enqueues/collapses the live row in one `BEGIN IMMEDIATE` transaction.
- `Queue::ack_delivery` acknowledges the claimed delivery, records its observed `DeliveryOrigin`, and prunes the recipient's ledger in one `BEGIN IMMEDIATE` transaction.
- A forwarded duplicate while pending or running still collapses through the existing live `(kind, dedupe_key)` index.
- A forwarded duplicate after acknowledgement enqueues nothing, emits no second recipient-facing `message.pushed`, and returns the stored `Delivered { origin }` observation. The sender-facing outcome remains auditable.
- The real and fake queues implement the same bounded semantics. `CountingQueue` refuses delivery operations it cannot model rather than silently claiming success.

## Atomicity and receipt honesty

A separate delivered check followed by ordinary enqueue is not safe: an acknowledgement can commit between the stale check and the insert, freeing the live key and admitting a second row. Recording delivery after ordinary acknowledgement has the inverse crash window. R4-AMEND-3 therefore places both compound transitions at the queue seam, beside `Queue::retry`'s existing atomic transition.

The ledger stores `DeliveryOrigin` with `(recipient, msg_id)`. An id-only record cannot produce an honest successful duplicate receipt: `Queued` would claim a row that does not exist, and a non-ok response would make federation refuse or retry a message that was delivered. Replaying the stored origin uses the existing vocabulary and reports the observation the destination actually made.

## Bound and residual window

`Config::delivered_id_capacity` defaults to **1,024 per recipient** and is injected once into each queue at construction. Federation retry backs off to a five-minute ceiling; observed peak traffic is a few messages per recipient per minute. The default is roughly three orders of magnitude above that practical duplicate window while keeping a hundred-seat fleet's absolute ceiling to single-digit megabytes. Per-recipient pruning prevents one hot recipient from erasing every other recipient's protection.

**Residual window:** once a recipient has taken more than N later distinct ids, a retry of an evicted id with no live row is accepted and delivered again.

That is retention policy, not a safety brake: removing the bound preserves more duplicate protection but permits unbounded growth; lowering it changes which old duplicates are redelivered.

## Proof

Focused changed-crate run:

```text
cargo test --locked -p pij-core -p pij-store -p pij-testkit -p pij-daemon
216 passed; 0 failed; 1 ignored
```

Named behavior proofs include:

1. `forwarded_duplicate_after_reader_ack_replays_origin_without_second_turn` — forward, live duplicate, claim/ack, then post-ack duplicate; one body, stored `ReaderRead` receipt, no post-ack pushed event.
2. `delivered_id_and_origin_survive_queue_reconstruction` — durable id and evidence survive reconstructing the real SQLite queue.
3. `concurrent_delivery_ack_and_duplicate_enqueue_never_create_a_second_row` — the exact stale-check race resolves only to the live row or the delivered record, never a fresh row.
4. `per_recipient_bound_evicts_oldest_without_weakening_other_recipients` — N+1 evicts the oldest id for that recipient only; the evicted duplicate queues again.
5. `fake_queue_enforces_its_per_recipient_delivered_id_bound` — the shipped fake makes the same retention claim as SQLite.
6. `drain_loop_survives_transient_delivery_ack_failure_and_processes_next_message` — COMMON §1.3 loop proof. A test-local queue wrapper forces the first `ack_delivery` dependency call to fail; the named production `start_resilient_delivery_drain` wrapper then processes the next recipient on the next tick. Assertions read both injected ack calls and both transport deliveries. This drives the shipped loop wrapper, not `drain_once` and not a reconstructed copy.

### Mutation transcripts

Both anchored removals reported exact matched lines before execution and were restored afterward.

- Removed the fake queue's delivered-ledger check. `forwarded_duplicate_after_reader_ack_replays_origin_without_second_turn` failed: observed `Queued`, expected `Delivered { origin: ReaderRead }`.
- Removed SQLite's delivered-ledger check. `delivered_id_and_origin_survive_queue_reconstruction` failed: observed `Queued(JobId(2))`, expected `AlreadyDelivered(VerifiedArrival)`.
- After restoration, the focused changed-crate run passed.

### Six-stage gate

Command:

```text
PATH="$HOME/.cargo/bin:$PATH" CARGO_INCREMENTAL=0 \
CARGO_TARGET_DIR=/tmp/pij-w5-u-dedupe-target \
cargo run --locked -p pij-testkit --bin pij-gate
```

Observed final verdict:

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

Two pre-final gate runs found only new-code clippy findings (`cloned_ref_to_slice_refs`, then `collapsible_if`); both were corrected before the green receipt.

## Environment receipt

```text
rustc 1.98.0 (pinned toolchain)
cargo /Users/jordanknight/.rustup/toolchains/1.98.0-aarch64-apple-darwin/bin/cargo
Avail: 201 GiB on /System/Volumes/Data
```

## Composition recipe

Configuration and queue construction:

```text
use pij_store::SqliteQueue;

// Config
pub delivered_id_capacity: usize, // default 1_024 per recipient

let queue: Arc<dyn Queue> = match config.adapters.queue {
    AdapterChoice::Fake => Arc::new(FakeQueue::new(config.delivered_id_capacity)?),
    AdapterChoice::Real => Arc::new(SqliteQueue::new(
        pool("queue")?,
        config.claim_lease_secs,
        config.delivered_id_capacity,
    )?),
};
```

Call sites:

```text
// Forwarded admission only
queue.enqueue_delivery(job).await?;

// Pull consumer
queue.ack_delivery(job_id, DeliveryOrigin::ReaderRead).await?;

// Socket/PTY drain
queue.ack_delivery(job_id, observed_origin).await?;
```

The production drain loop is constructed through `start_resilient_delivery_drain`; it retains the existing stderr-and-continue behavior. No new task is started, so daemon shutdown remains unchanged.

## Shared-merge and mechanical files touched

- `crates/core/src/{config,ports}.rs` — configured capacity and R4-AMEND-3 contract.
- `crates/store/migrations/0008_delivered_ids.sql`, `crates/store/src/{migrate,queue}.rs` — schema 8 and real atomic implementation.
- `crates/daemon/src/lib.rs` — queue capacity argument plus named production drain-loop helper, as separately fenced.
- `crates/daemon/src/delivery/mod.rs`, `crates/daemon/src/pointer/worker.rs` — destination admission and observed delivery acknowledgements.
- `crates/testkit/src/{fakes,contract}.rs` — fake parity and shared queue contract.
- `crates/daemon/src/http/tests.rs` — `CountingQueue` mechanical conformance.
- Constructor/test mechanical updates in `crates/daemon/src/federation/mod.rs`, `crates/daemon/tests/review_regressions.rs`, `crates/core/tests/core_unit_exemplar.rs`, `crates/store/tests/queue.rs`, and `crates/testkit/tests/contract_over_fakes.rs`.

No derived file was regenerated. `Cargo.lock` was not modified.

## Assumptions and explicit limits

1. A delivery is recorded only when a destination consumer observes completion: inbox read (`ReaderRead`), successful socket outcome (its returned origin), or successful PTY command injection (`InjectedToTransport`). Failed and retried rows never enter the ledger.
2. Retention order is durable insertion order (`delivered_messages.seq`), not wall-clock age. Clock movement cannot change eviction order.
3. The first recorded origin for `(recipient, msg_id)` is retained. A later conflicting observation cannot rewrite the evidence replayed for that identity.
4. Live-row collapse remains the first-window mechanism. The ledger is a second gate after terminal delivery, not a replacement.
5. A suppressed post-ack duplicate omits `message.pushed` but emits the sender-facing outcome. Existing live duplicates retain their pre-existing admission-event behavior while sharing one queue row.
6. Recipient identity is the seat id. Reusing a seat id inherits that recipient's last N delivered ids; an id outside that bounded history is treated as new.
