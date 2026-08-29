# u-delivery done report — plan 108 wave 2

**PM**: `pij-revolutionary-lungfish`  
**Branch**: `s108/w2-delivery`  
**Implementation commit**: `9b70212c`  
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery`

## Delivered

- Pure routing policy at `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/core/src/delivery.rs`: busy, pre-bind, operator hold, and transport-unreachable states queue; tombstoned seats refuse permanently; self-addressing refuses.
- Runtime service at `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/daemon/src/delivery/mod.rs`: `send(from, to, body) -> Receipt`, honest durable queueing, transport delivery/approval hold, `delivery.outcome` audit events, and pull-mode `inbox(seat, wait)`.
- Recipient-specific queue kinds from the single `delivery_kind(&SeatId)` formatter. `delivery:<seat-id>` lets `inbox(A)` claim only A's work through the frozen `Queue::claim` surface.
- `EventBus::subscribe_live(filter)` at `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/daemon/src/events/mod.rs`: no historical replay. Durable consumers still use `subscribe(Some(cursor), ...)`; `subscribe(None, ...)` remains intentional cold replay only.
- Distinct `PijError::SeatIsGone` and `PijError::DeliveryAuditFailed` diagnostics at `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/core/src/error.rs`.

## Receipt-honesty decision table

`delivery::tests::receipt_honesty_decision_table_covers_busy_prebind_dead_held_and_delivered` asserts both the result and subsequent retrievability:

| case | result | queued/retrievable |
|---|---|---|
| busy | `Receipt { outcome: Queued }` | yes |
| pre-bind | `Receipt { outcome: Queued }` | yes |
| operator `SemanticState::Hold` | `Receipt { outcome: Queued }` | yes |
| tombstoned/dead | `PijError::SeatIsGone` | no; the row is a permanent post-mortem |
| approval held by transport | `Receipt { outcome: Held { reason } }` | no |
| delivered | `Receipt { outcome: Delivered }` | no inbox row |

Every successful route also asserts a durable `delivery.outcome` event whose JSON payload contains `msg_id`, `outcome`, and transport name.

The contract-gap regression `inbox_for_a_never_claims_b_even_when_b_was_enqueued_first` enqueues B before A, proves `inbox(A)` returns only A, then proves B remains claimable. `waiting_inbox_attaches_live_before_checking_the_queue` proves the blocking pull primitive wakes without an empty-claim/attach race. `subscribe_live_never_replays_the_existing_spine` proves live attach does not replay history.

## Mutation evidence

Mutant applied at `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/daemon/src/delivery/mod.rs`: the registry-selected queued branch skipped `Queue::enqueue` and returned `DeliveryOutcome::Delivered`.

Command:

```text
CARGO_TARGET_DIR=/tmp/pij-w2-delivery-target CARGO_INCREMENTAL=0 \
  cargo test --locked -p pij-daemon \
  delivery::tests::receipt_honesty_decision_table_covers_busy_prebind_dead_held_and_delivered \
  -- --exact
```

Observed failure:

```text
assertion `left == right` failed
  left: Delivered
 right: Queued
test result: FAILED. 0 passed; 1 failed
```

Artifact: `artifact://23`. After restoring the honest branch, the identical command passed: `1 passed`, artifact `artifact://25`.

## Canonical gate

Command from `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery`:

```text
PATH="$HOME/.cargo/bin:$PATH" \
CARGO_TARGET_DIR=/tmp/pij-w2-delivery-target \
CARGO_INCREMENTAL=0 \
cargo run --locked -p pij-testkit --bin pij-gate
```

Observed after the final audit-failure ruling landed:

```text
pij-gate verdict
  toolchain PASS  rustc 1.98.0 == pin
  lock      PASS  Cargo.lock matches the manifests
  fmt       PASS  cargo fmt
  clippy    PASS  cargo clippy
  test      PASS  cargo test
  arch      PASS  8 crates, 0 violations

pij-gate: all stages green
```

Artifact: `artifact://45`.

LSP diagnostics were clear on every changed Rust file. The only workspace diagnostic was the pre-existing inactive `#[cfg]` hint in `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/daemon/src/auth.rs`.

## Toolchain and disk

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
1.98.0-aarch64-apple-darwin (rust-toolchain.toml override)
/dev/disk3s5  1.8Ti  1.6Ti  241Gi available  87%
```

`harness boot` was also attempted before coding. Its TypeScript `just typecheck` stage failed with exit 2 but emitted no type diagnostic, matching the wave-0 report's known node-tooling gap. The Rust definition-of-done is the green `pij-gate` above.

## Composition recipe

Public entry point: `pij_daemon::delivery::DeliveryService`.

No `AdapterChoice::Real` refusal is replaced; the transport `Real` arm remains wave 3's `u-uds` work.

Paste into `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/daemon/src/lib.rs` at compose time:

```rust
use crate::delivery::DeliveryService;

// Services field:
pub delivery: Arc<DeliveryService>,

// After event_bus is constructed:
let delivery = Arc::new(DeliveryService::new(
    Arc::clone(&registry),
    Arc::clone(&queue),
    Arc::clone(&transport),
    Arc::clone(&event_bus),
)?);

// Services initializer:
delivery,
```

## Shared-merge and fence-extension files

- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/core/src/lib.rs` — one `pub mod delivery;` line.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/daemon/src/lib.rs` — one `pub mod delivery;` line; no composition wiring.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/daemon/src/events/mod.rs` — PM-granted fence extension for `subscribe_live`.
- `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w2-delivery/crates/core/src/error.rs` — PM-allocated to this unit for the two distinct refusal/half-state variants.

No dependency, allow-list, `Cargo.lock`, migration, or architecture-fixture change was needed.

## Assumptions and ruled failure semantics

1. Delivery job kind is `delivery:<seat-id>`, produced only by `delivery_kind`. `serial_key` is the recipient id and `dedupe_key` is the message id. A future worker asking for any pending delivery must enumerate bounded kinds from the registry; widening the frozen `Queue` port is not assumed.
2. For pull-mode seats, claiming and acknowledging the recipient-specific job is delivery. `inbox(wait=true)` subscribes live before its first claim, so durable queue state closes notification races without replaying the event spine.
3. Queue/transport action and `EventBus` audit are separate effects with no cross-port transaction. The ruled order is action first, truthful audit second. If audit publication fails, `DeliveryAuditFailed` names the `msg_id`, states which outcome already landed, and directs the caller to reconcile by message id rather than blindly resending. Returning success while swallowing the audit failure and returning a bare error that hides the landed effect are both forbidden.
4. The audit-failure message shape is unit-tested. The frozen fakes expose no injected `Spine` failure, so the cross-port failure timing itself is not synthesized by a local double; adding a second fake implementation was explicitly forbidden.
5. A real approval hold is produced only by `Transport` (wave-3 UDS attestation). `SemanticState::Hold` is temporary operator parking and therefore queues.
6. The delivery service generates a per-instance random 64-bit message-id prefix plus an atomic sequence. The clock and id prefix are constructor-injected in its internal test constructor; production uses OS randomness and Unix milliseconds.
7. Receipt `1787963637387-000001-89164` reported the PM's first audit-failure ruling message as delivered, but the body never injected into this pushed OMP turn after multiple tool calls. The PM resent it. This is a live recurrence of the receipt-says-delivered/message-never-arrives defect while implementing its Rust replacement; it is evidence, not reconciled away.
