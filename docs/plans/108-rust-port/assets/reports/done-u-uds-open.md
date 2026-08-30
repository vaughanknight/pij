# u-uds-open done report — live Claude socket arrival

**Unit**: u-uds-open · **Branch**: `s108/w6-uds-open` · **Date**: 2026-08-30

## Result

There was no transport flip to add. `UdsTransport` already opened for `cross_session_inbound_accept: Some(true)`. This unit joined the spawn producer to that consumer with one composition-root test, corrected stale inertness prose, and fixed the two missing preconditions found only by running the shipped binary:

1. `DeliveryService::arrive` bypassed `InteractionGate` on the common first-attempt socket path. It now shares the same gate as `DrainWorker` and queues on unknown or active human input before asking transport capability.
2. `PaneObserver` erased an observed nonblank composer when the clear redraw produced tap bytes. Its next quiet blank was consequently treated as first sight forever. `ComposerKnowledge::PendingClear` now keeps composer knowledge separate from the gate verdict: redraw closes the gate without discarding the transition; a quiet blank corroborates it. A later idle redraw likewise temporarily closes and then restores a previously known-clear composer.

## Live shipped-binary proof

Observed binary: `/tmp/pij-w6-u-uds-open-target/debug/pij-rs`, built from this tree with `cargo build --locked -p pij-cli --bin pij-rs`.

Daemon:

```text
pij-rs daemon: listening on 127.0.0.1:17462 · key /tmp/pij-w6-u-uds-open-state-2/daemon.key (0600) · offline=false
```

Real spawn through the shipped CLI:

```json
{"ok":true,"command":"pij spawn","v":1,"data":{"id":"pij-uds-live-accept-2","harness":"claude","pane":"%1486","proc":null,"folder":"/Users/jordanknight/pi-hacking/pij-worktrees/s108-w6-uds-open","state":"idle","semantic_state":null,"role":null,"parent":null,"relay":false,"cross_session_inbound_accept":true,"spawn_id":"s-1277087117e1414d6de4bcf9650a77f8"}}
```

The seat was bound to PID 57741 while registration preserved the launcher-owned acceptance stamp:

```json
{"id":"pij-uds-live-accept-2","harness":"claude","pane":"%1486","proc":{"pid":57741,"proc_start":20260830153612},"cross_session_inbound_accept":true,"spawn_id":"s-1277087117e1414d6de4bcf9650a77f8"}
```

A real composer transition was driven (`witness`, then Ctrl-U). The body was submitted through `pij-rs send`, durably queued while the politeness observation was not yet sufficient, then delivered by the shipped drain worker after the quiet-blank corroboration:

```text
› Message from @pij-yelping-moth: [pij from pij-yelping-moth] LIVE-UDS-OPEN-20260830: reply exactly ACK-LIVE-UDS-OPEN (ctrl+o to expand)

⏺ Another delivery probe — replying with the requested ACK.

⏺ Sent ACK-LIVE-UDS-OPEN back to pij-yelping-moth
```

The reply arrived in the originating session as:

```text
[pij from pij-implicit-hookworm] ACK-LIVE-UDS-OPEN
```

This is the shipped route: real CLI spawn → persisted descriptor stamp → real pane observer/gate → real queue drain → real `UdsTransport` → Claude's live UDS → model-visible turn. The initial `Queued` receipt remains honest; the later arrival is separately observed rather than retroactively upgrading that receipt.

The daemon was stopped with Ctrl-C and exited 0; both proof-only Claude panes were removed.

## Current Claude drop-decoder re-verification

Observed Claude build: `2.1.251 (Claude Code)`.

Closed control seat: PID 78719, pane `%1487`, no `--accept-inbound`, descriptor stamp `Some(false)`. The session record and exactly one peer key matched:

```text
procStart: Sun Aug 30 05:37:18 2026
pidDomain: darwin
messagingSocketPath: /tmp/cc-socks/78719.sock
```

Exact user frame sent after the newline-terminated auth frame:

```json
{"msgV":1,"msg_id":"drop-reverify-20260830","type":"user","message":{"role":"user","content":"<cross-session-message from=\"uds:pij-daemon\" from-name=\"pij-yelping-moth\">\n[pij from pij-yelping-moth] DROP-DECODER-REVERIFY-20260830\n</cross-session-message>"},"priority":"next","from":"uds:pij-daemon"}
```

Socket observation:

```text
elapsed: 2.000557458 seconds
returned_len: 0
returned_bytes: ""
```

Claude UI observation:

```text
Held peer message — from uds:pij-daemon ... DROP-DECODER-REVERIFY-20260830 ... not delivered to Claude (1 held).
The sender did not attest its permission mode and this session bypasses prompts.
```

**Verdict**: unchanged from wave 3. No `peer_message_status`, correlated drop, `wereHeld`, or other negative acknowledgement arrived on this authenticated daemon-origin connection. The decoder remains fixture-tested but UNPROVEN on this connection shape. Receipt vocabulary does not change.

Positive control: the same authenticated frame shape sent to the accepted seat appeared in Claude and produced `ACK-RAW-CONTROL`, confirming that the zero-byte negative arm was a held-message result rather than a broken socket or frame.

## Agreement and regression proofs

### Spawn argv → stamp → transport

`emitted_spawn_argv_is_the_stamp_that_opens_the_real_transport` lives at the daemon composition root, which already depends on both producer and consumer. In one test it:

- builds the real Claude argv with and without `accept_inbound`;
- asserts the exact `--settings {"crossSessionInbound":"accept"}` pair;
- copies only `SpawnPlan.cross_session_inbound_accept` into the descriptor;
- proves the closed arm makes no UDS connection;
- proves the accepted arm authenticates and writes the message through real `UdsTransport`.

Mutation: invert `UdsTransport::can_deliver`'s acceptance predicate.

```text
FAILED emitted_spawn_argv_is_the_stamp_that_opens_the_real_transport
assertion failed: !transport.can_deliver(&seat, &msg).await.expect("closed capability")
```

### Direct-path politeness

`first_attempt_socket_delivery_obeys_the_same_politeness_gate_as_retries` exercises `DeliveryService`, not a reconstructed decision. Unknown and tmux-typing observations queue without touching the transport; independently known-clear evidence delivers.

Mutation: remove `interaction_permits` from the direct branch.

```text
FAILED delivery::tests::first_attempt_socket_delivery_obeys_the_same_politeness_gate_as_retries
assertion `left == right` failed: unknown
  left: Delivered { origin: InjectedToTransport }
 right: Queued
```

### Transient redraw loop

`redraw_blank_preserves_pending_clear_until_a_quiet_pass_corroborates_it` drives the shipped `PaneObserver::observe_once` sequence: nonblank → blank with tap activity → quiet blank → idle blank redraw → quiet blank. Both redraws close the gate; both quiet passes restore authorization from retained knowledge.

Mutation: replace the pending-state branch with `set_unknown`.

```text
FAILED pane_observer::tests::redraw_blank_preserves_pending_clear_until_a_quiet_pass_corroborates_it
a quiet blank after the pending transition must authorize injection
```

## Gate and environment

```text
rustc/cargo toolchain: 1.98.0-aarch64-apple-darwin
filesystem: /dev/disk3s5, 1.8 TiB total, 117 GiB available, 94% used
CARGO_INCREMENTAL=0
CARGO_TARGET_DIR=/tmp/pij-w6-u-uds-open-target
```

Final canonical command:

```bash
cargo run --locked -p pij-testkit --bin pij-gate
```

Final verdict:

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

An intermediate gate correctly rejected a proposed `pij-transport -> pij-harnesses` dev dependency as forbidden architecture. The agreement test was moved to `pij-daemon`, the composition root; no new crate edge or manifest change remains.

`harness checks` was not run: COMMON records that Node tooling is unavailable in these worktrees and names `pij-gate` as the definition of done.

## Composition recipe

```rust
use pij_harnesses::InteractionGate;
use pij_transport::UdsTransport;

let transport: Arc<dyn Transport> = match config.adapters.transport {
    AdapterChoice::Fake => Arc::new(FakeTransport::reachable()),
    AdapterChoice::Real => Arc::new(UdsTransport::new()?),
};
let tmux: Arc<dyn TmuxPort> = /* configured adapter */;
let interaction = Arc::new(InteractionGate::new(Arc::clone(&tmux)));

let delivery = Arc::new(DeliveryService::new(
    Arc::clone(&registry),
    Arc::clone(&queue),
    Arc::clone(&transport),
    Arc::clone(&interaction),
    Arc::clone(&event_bus),
)?);

let pane_observer = PaneObserver::new(
    Arc::clone(&services.registry),
    Arc::clone(&services.tmux),
    Arc::clone(&services.interaction),
    state_dir.join("pane-signals"),
    Duration::from_millis(config.pane_observer_interval_ms),
)?;

let drain = DrainWorker::new(
    Arc::clone(&services.registry),
    Arc::clone(&services.queue),
    Arc::clone(&services.transport),
    Arc::clone(&services.tmux),
    Arc::clone(&services.interaction),
    Arc::clone(&services.event_bus),
    Duration::from_secs(config.pointer_announce_cadence_secs),
)?;
```

`PaneObserver` remains the only producer of composer evidence. Direct delivery and queued retry consume the same gate. Shutdown contract is unchanged: HTTP, delivery loop, pane observer (which detaches taps), then federation.

## Files and merge posture

Source/test files:

- `crates/transport/src/uds.rs`
- `crates/daemon/src/delivery/mod.rs`
- `crates/daemon/src/pane_observer.rs`
- `crates/daemon/src/lib.rs`
- `crates/daemon/src/http/tests.rs`
- `crates/daemon/tests/review_regressions.rs`
- `crates/cli/src/lib.rs`
- `crates/cli/tests/shipped_daemon_config.rs`

Shared-merge file: `crates/daemon/src/lib.rs` (constructor conformance and composition ordering). No final manifest, `Cargo.lock`, architecture metadata, migration, frozen port, model, or error change.

## Assumptions

1. Claude 2.1.251 remains the current installed build measured here.
2. `cross_session_inbound_accept` is launcher-owned evidence; registration may preserve but never invent or downgrade it.
3. A socket write supports only `Delivered { origin: InjectedToTransport }`; model visibility was observed separately in the live proof.
4. Unknown interaction state is a conservative veto. A redraw also vetoes until a quiet capture corroborates retained composer knowledge.
5. UDS remains Unix-only. The pointer/inbox route owns non-socket fallback; bodies are never typed into a PTY.
6. The documented drop/hold decoder is retained without vocabulary change because the current daemon-origin connection again returned zero bytes.
