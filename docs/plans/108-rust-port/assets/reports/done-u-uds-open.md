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
- `crates/tmux/src/lib.rs`
- `crates/tmux/tests/adapter.rs`
- `crates/core/src/config.rs`
- `crates/daemon/src/events/mod.rs`
- `crates/daemon/src/pointer/mod.rs`
- `crates/daemon/src/pointer/worker.rs`

Shared-merge file: `crates/daemon/src/lib.rs` (constructor conformance and composition ordering). No final manifest, `Cargo.lock`, architecture metadata, migration, frozen port, model, or error change.

## Assumptions

1. Claude 2.1.251 remains the current installed build measured here.
2. `cross_session_inbound_accept` is launcher-owned evidence; registration may preserve but never invent or downgrade it.
3. A socket write supports only `Delivered { origin: InjectedToTransport }`; model visibility was observed separately in the live proof.
4. Unknown interaction state is a conservative veto. Permission requires either an observed nonblank-to-blank transition or two consecutive positively recognized blank composers with a live tap and zero intervening bytes. Any redraw vetoes until another quiet pass corroborates it.
5. UDS remains Unix-only. The pointer/inbox route owns non-socket fallback; bodies are never typed into a PTY.
6. The documented drop/hold decoder is retained without vocabulary change because the current daemon-origin connection again returned zero bytes.

## Dogfood addendum — existence was not ownership

The first live proof was necessary but not sufficient. Long-running dogfood on the managed dev daemon (`127.0.0.1:17600`, state `/Users/jordanknight/.pij-rs-dev`) exposed four composed failures that every green unit test had missed:

1. first-attempt `DeliveryService` bypassed the politeness gate;
2. a clear redraw erased the observer's nonblank knowledge;
3. the tmux `-o` flag is a toggle, so a repeated attachment can close the pipe;
4. after restart, `pane_pipe=1` proved only that a pipe existed, not that the current daemon owned it.

The fourth diagnosis was measured from incompatible clocks and write effects rather than guessed:

```text
current release process: PID 1736, started 17:14:54
current release binary mtime: 17:14:47
_1566.raw: 346 bytes, mtime 17:07:31
pane_pipe: 1
```

`TmuxAdapter` truncates a sink on its first process-local attach. The sink predated the process and was not truncated, so PID 1736 had never attached. tmux still owned the prior daemon's `cat` pipe; the new adapter's map was empty. Each observer pass saw an existing unowned pipe, refused to replace it, called `InteractionGate::record_unknown`, and retried the accepted queue row indefinitely. The accepted row reached more than 90 claims without delivery.

**Finding**: `pane_pipe=1` proved existence, not ownership. Process memory and tmux disagreed, and the observer trusted neither strongly enough to repair.

### Persistent tap repair

Commit `ea9b0893` made each 600 ms observer pass reconcile process-local tap state with `#{pane_pipe}` and removed tmux's toggling `-o` flag. If the OS pipe vanishes while this daemon still owns the sink, the next pass reattaches without truncating the file or resetting the byte offset.

`second_observer_pass_repairs_a_vanished_os_pipe_and_keeps_growing` drives real tmux: pass one captures `first-pass`, the fixture removes only the OS pipe while retaining adapter state, pass two repairs it, and `second-pass` grows the same sink. Restoring attach-only-when-untracked failed:

```text
tap must grow after pass two
```

The first mutation run initially skipped because `/opt/homebrew/bin/tmux` was absent from the test PATH. The fixture was changed to skip only when tmux is genuinely unavailable and to fail with the actual `new-session` diagnostic once `tmux -V` succeeds. Under the canonical PATH it produced the intended red. During the final full gate, two real-tmux tests generated the same session name concurrently; the gate failed on `duplicate session` rather than hiding it. An atomic suffix now makes every fixture name unique, and the gate rerun passed.

### Quiet-pane policy

The PM's hypothesis that Claude's placeholder was parsed as content was tested with the actual private Rust function against live pane `%1566`, not a reimplementation:

```text
LIVE_COMPOSER pane="%1566" cursor=(Some(2),Some(42)) extracted=Some("")
```

Cursor clipping already excludes `Try "…"`. The parser was correct. The policy was not: a fresh idle pane produces no nonblank-to-blank transition, so the gate stayed closed indefinitely despite a recognized empty composer, healthy pipe, and repeated quiet observations.

Commit `f4143529` distinguishes unknown from observed quiet. One recognized `Some("")` remains insufficient. The second consecutive recognized blank authorizes only when the tap is attached and both drains report zero intervening bytes. This is three positive facts, not silence treated as evidence: recognized layout, owned sensor, and two stable observations.

Required mutations:

```text
# Permit on the first recognized blank
FAILED two_stable_recognized_blanks_are_required_to_permit_injection
one recognized blank must not authorize injection

# Ignore tap bytes between the two blanks
FAILED tap_bytes_between_recognized_blanks_require_another_quiet_pass
tap bytes between blanks must keep the gate closed
```

### Quiet live stamp contrast

Two real Claude 2.1.251 seats were spawned and bound through the shipped CLI against the same daemon and quiet tmux environment:

```text
pij-zoophagous-vosill  pane %1566  cross_session_inbound_accept=true
pij-limited-stork      pane %1567  cross_session_inbound_accept=false
```

No one typed during the final contrast. After the PM explicitly closed the two known legacy orphan pipes, the running daemon attached cleanly. Both `pane_pipe` values stayed `1`, and the accepted sink grew from 22,982 to 29,025 to 31,253 bytes over 20 seconds. The accepted seat read the body of `quiet-accept-1` and replied through pij:

```text
ACK-QUIET
```

Its inbox was empty without a reader claiming the row. No pointer line appeared; a pointer never carries the body, so the model could not have followed the body's `reply ACK-QUIET` instruction without socket delivery. At the same moment the unstamped seat's mail remained queued and undelivered. Same daemon, Claude build, pane state, and quiet policy; the acceptance stamp was the differing fact.

This meets the live done bar without a typing ritual: the daemon's own observer authorized an ordinary quiet pane, the accepted body reached the model, and the unstamped control stayed closed.

### Durable restart ownership

The PM's one-time manual closure proved the policy but is not a shipping restart story. Commit `4f3fa054` records ownership as a pane-scoped tmux option:

```text
@pij-tap-sink=<exact absolute sink path>
```

The marker is written before pipe creation. A crash between those actions leaves marker plus `pane_pipe=0`, which the next daemon can complete; the inverse order would leave another unmarked orphan. On restart:

- matching marker + pipe authorizes replacement/adoption;
- mismatched or absent marker refuses to clobber a foreign pipe;
- detach closes the pipe and clears the marker;
- sink residue alone never grants ownership.

`matching_marker_adopts_restart_pipe_and_detach_clears_ownership` uses a fresh adapter with empty process memory to adopt the first adapter's marked real tmux pipe, captures post-restart bytes, and proves detach clears the marker. `mismatched_marker_refuses_to_replace_a_foreign_pipe` proves the foreign pipe remains live. Removing marker publication failed at the exact empty-marker assertion.

Final gate after the marker and collision-safe real-tmux fixtures:

```text
toolchain PASS  rustc 1.98.0 == pin
lock      PASS  Cargo.lock matches the manifests, and the tree
fmt       PASS  cargo fmt
clippy    PASS  cargo clippy
test      PASS  cargo test
arch      PASS  8 crates, 0 violations
pij-gate: all stages green
```

The legacy cleanup was explicit and one-time. Existing unmarked pipes are never adopted from a filename or sink residue; that would repeat the ownership defect under E-024 rather than fix it.

## Dogfood addendum — pointer parking

The unstamped control seat exposed the fork's G25 in the Rust worker. It experienced 18 pointers from 17:21:30 through 17:53:56 (spine seq 21, 24–40). `pointer_due` consulted only cadence, so a seat that never read would be reminded forever.

The control seat's reason line is the contract:

> The announcer records that it POINTED, not that anyone will ever come.

### Policy

`Config::pointer_announce_limit` defaults to 3 and rejects zero. Three means one initial pointer plus two reminders: three independent opportunities to notice across UI churn, followed by deliberate silence. The budget is seat-level because the pointer names no row. Row-level parking would leave the oldest parked row at the queue head and silently starve newer mail.

The third pointer explains the silence to the recipient:

```text
[pij from pij-sender] message waiting — final reminder; parked after 3 announcements — message remains queued; run: pij inbox when ready
```

One deployment-only legacy window is named, not migrated: a seat already over budget when the cap first lands parks without the explanatory final pointer because its Nth announcement was emitted by the old build. The window closes after the first read/unpark and never recurs under the new producer. Existing history is not rewritten.

The recipient explained why the line cannot be replaced by the operator event: “I only know it parked because I can read your sqlite — a recipient without spine access would still be at ‘went quiet’.”

The same transition publishes one durable operator-facing event:

```json
{"kind":"delivery.pointer-parked","seat":"pij-seat","payload":{"announcements":3,"reason":"announcement-limit"}}
```

The body row remains pending and immediately claimable. A successful inbox read consumes the available mail and, only when the latest policy event is parked, publishes:

```json
{"kind":"delivery.pointer-unparked","seat":"pij-seat","payload":{"reason":"reader-read","messages":1}}
```

Read is the only automatic unpark. A new msg_id does not reset the budget: otherwise a sender could mint its way past a cap the human has not satisfied. An explicit operator unpark command would be honest but does not exist and was not invented in this unit.

### The counter correction

**The durable queue `attempt` is not an announcement count.** It increments on every claim and release: cadence suppression, typing gates, socket refusal, and actual pointer work. The live row reached attempt 64 while the seat had received exactly three pointers. Capping on `attempt` would park a seat before it had been told three times, and possibly before it had been told once.

The policy instrument is the spine's `delivery.pointer-announced` sequence, the only durable record of what the seat was actually told. New events carry `announcement: 1..3`. On its first drain, a worker cold-replays announced, parked, and unparked events before it claims work. Historical announced events without an ordinal increment in spine order. Restart therefore preserves both cadence and the exhausted budget; a crash-looping daemon cannot reset the count and shout forever.

The first parked payload exposed a second count defect: it said `announcements: 3` while the seat had experienced 18. Three was the policy threshold, not the seat's count. The full history was already durable; `publish_parked` discarded the replayed total and substituted the configured limit. It now carries the actual count reconstructed from every announcement since the latest unpark, or from the beginning when no unpark exists.

`legacy_history_counts_every_announcement_since_the_last_unpark` seeds 18 pre-policy announcement events without ordinals, cold-replays them, parks without issuing an unexplained nineteenth pointer, keeps the row readable, and asserts `{"announcements":18}`. Replacing the experienced count with the configured limit failed:

```text
FAILED legacy_history_counts_every_announcement_since_the_last_unpark
announcements means what the seat experienced, not the policy limit
left:  {"announcements":3,"reason":"announcement-limit"}
right: {"announcements":18,"reason":"announcement-limit"}
```

### Tombstone is consent withdrawal

The control seat then requested deregistration. Its descriptor was correctly tombstoned, but `PaneObserver` continued treating its pane as wanted. A hand detach was undone within seconds: the daemon recreated the pipe and marker. Only stopping the daemon ended capture.

A pane tap is a consent surface, not merely a routing resource. Tombstoned seats are now excluded from the wanted set. Because tracked-but-unwanted panes flow through the existing retirement path, the next observation actively detaches the tmux pipe, clears `@pij-tap-sink`, removes the sink containing captured terminal bytes, clears interaction evidence, and never reattaches on later sweeps.

`tombstoning_an_observed_seat_detaches_marker_and_captured_bytes` uses real tmux as a transition test: attach first, persist the tombstone, sweep, assert `pane_pipe=0`, marker absent, sink absent, then sweep again and prove none return. Removing the tombstone discriminator failed on the live resource:

```text
FAILED tombstoning_an_observed_seat_detaches_marker_and_captured_bytes
left:  "1"
right: "0"
```

### Proof

`third_pointer_explains_parking_row_stays_readable_and_read_unparks` executes the full policy:

1. announces exactly three times across injected 90-second cadences;
2. asserts the third pointer's exact explanatory bytes;
3. runs the N+1 decision and asserts there is no fourth submit;
4. observes exactly one `delivery.pointer-parked` event;
5. constructs a fresh worker and proves cold replay still suppresses a fourth pointer;
6. reads the still-live body through `DeliveryService::inbox`;
7. observes `delivery.pointer-unparked`;
8. queues new mail and proves the successful read reset the seat budget.

Mutation — remove the cap by replacing the configured limit with `u32::MAX`:

```text
FAILED third_pointer_explains_parking_row_stays_readable_and_read_unparks
assertion `left == right` failed: N+1 must not announce
  left: 4
 right: 3
```

Mutation — render an ordinary pointer on the third announcement:

```text
FAILED third_pointer_explains_parking_row_stays_readable_and_read_unparks
left:  "submit:%park:[pij from pij-sender] message waiting — run: pij inbox"
right: "submit:%park:[pij from pij-sender] message waiting — final reminder; parked after 3 announcements — message remains queued; run: pij inbox when ready"
```

The final workspace run reported 320 passing tests across 49 suites with 3 ignored. The canonical six-stage gate then passed toolchain, lock, fmt, clippy, test, and architecture (8 crates, 0 violations).

The first closing gate also exposed that real-tmux fixtures from separate Rust test binaries could overlap on the machine-global tmux server: an unrelated fixture pipe appeared as a foreign owner. Both fixture families now take the same cross-process `tmux wait-for` lock and always release it during `Drop`. The full workspace and subsequent six-stage gate passed with the real tmux tests executed, not skipped.
