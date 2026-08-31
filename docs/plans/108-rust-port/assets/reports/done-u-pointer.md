# Done — u-pointer + u-drain

## Result

Implemented the rung below the socket and the queue drain worker without adding a typed-body fallback.

- `pij_core::delivery::select_rung` is the pure five-row ladder: paneless observe, explicit command PTY, body socket, body-free pointer, or remain queued.
- Human typing vetoes socket and pointer delivery.
- `DrainWorker` claims at most one row per pane-bound recipient per pass, submits bare command tags as slash commands through `TmuxPort::submit`, delivers socket-capable bodies, and releases undelivered bodies atomically through `Queue::retry`.
- Pointer bytes are exactly `[pij from pij-sender] message waiting — run: pij inbox`; the body is absent.
- Pointer publication uses `delivery.pointer-announced`, with recipient in `Event.seat` and `{msg_id, from}` payload.
- Failed commands use durable exponential backoff from `Job.attempt`: 1 second doubling to a 5-minute ceiling.
- Bodies always release with `Duration::ZERO`; announcement cadence never delays the reader.

## D26 — two schedules were one field

`not_before` was initially asked to mean both “when may the announcer speak again?” and “when may the reader claim the body?”. Those schedules belong to different subjects. Backing off the body made the pointer lie: it said a message was waiting and directed the reader to `pij inbox`, while the same worker made that row unclaimable for up to five minutes.

The body now releases with zero delay. Announcement cadence is per-seat, held in memory from live `delivery.pointer-announced` events. Each pass removes an announced recipient kind before another claim, preventing an immediate loop while leaving the body reader-claimable.

The cadence map is residue in E-024’s exact sense: it records that **this process** announced, not durable proof that the seat was told. A restart may repeat one pointer. That line still states a true fact; avoiding it would require a permanent latest-event seam or descriptor field for exactness the product does not need.

## Proof

Focused pointer/drain suite: 16 passed.

The tests enumerate and distinguish:

1. paneless pull ownership;
2. explicit command PTY submission, never socket;
3. socket body delivery, never PTY;
4. pointer bytes and body absence;
5. unknown and human-typing gates releasing without delivery;
6. one announcement per recipient per pass;
7. live-event cadence suppression across two workers;
8. accepted one-pointer repeat after restart;
9. zero-delay body availability to an immediate reader;
10. command retry/backoff from durable `Job.attempt`;
11. real SQLite attempt increment and immediate reclaimability.

### Mutation transcripts

- Replaced `msg.command.is_some()` with a leading-slash body sniff. `only_the_command_field_selects_the_pty` failed: `/compact` body selected `Pty`, expected `Socket`.
- Weakened the human-typing veto to apply only without a socket. `human_typing_vetoes_socket_and_pointer_delivery` failed for `socket_available=true`: selected `Socket`, expected `Queue`.
- Replaced the real body release `Queue::retry(job, Duration::ZERO)` with terminal `ack(Done)`. `drain_release_increments_attempt_in_real_sqlite_and_body_is_immediately_claimable` failed with durable attempt `0`, expected `1`; the subsequent reader claim would also be absent. The anchored edit was restored and the named test passed.

### Six-stage gate

Command:

```text
CARGO_INCREMENTAL=0 CARGO_TARGET_DIR=/tmp/pij-w4-pointer-target \
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

## Environment receipt

```text
rustc 1.98.0 (88d9e12ae 2026-08-18)
cargo 1.98.0 (797e8a9bc 2026-08-05)
Avail: 208 GiB on /System/Volumes/Data
```

## Composition recipe

Public entry point: `pij_daemon::pointer::DrainWorker`.

At composition:

```text
use pij_daemon::pointer::DrainWorker;

let pointer_drain = DrainWorker::new(
    Arc::clone(&registry),
    Arc::clone(&queue),
    Arc::clone(&transport),
    Arc::clone(&tmux),
    Arc::clone(&interaction_gate),
    Arc::clone(&event_bus),
    Duration::from_secs(config.pointer_announce_cadence_secs),
)?;
```

Call `pointer_drain.drain_once()` from the injected delivery cadence. The PM owns the composition-root constructor cutover and cadence field.

## Shared-merge files touched

- `crates/daemon/src/lib.rs` — exactly one module declaration: `pub mod pointer;`.

No derived file was regenerated. `Cargo.lock` was not modified by this unit.

## Assumptions and explicit limits

1. The pointer rung ships inert in composition until wave 5’s `u-tap` producer feeds `InteractionGate::{record_tap, observe_composer, record_enter}`. Unknown remains a conservative veto; the human-typing rule is not inverted to make the feature appear live.
2. `Msg.command` is proven and rendered, but the current shipped Rust HTTP send surface still constructs `command: None`; a production command producer remains composition/future-surface work.
3. Restart-perfect pointer cadence is intentionally not promised. A fresh worker may repeat one true pointer.
4. A pointer is not body delivery. It does not emit `DeliveryOutcome::Delivered`; the body remains queued and immediately pullable.
5. A pointer submitted before its audit event fails to publish may repeat on retry. That is at-least-once notification of a still-true statement, not exactly-once delivery.
6. `DeliveryService` gate injection and constructor migration remain PM composition work; this unit did not edit composition wiring.
