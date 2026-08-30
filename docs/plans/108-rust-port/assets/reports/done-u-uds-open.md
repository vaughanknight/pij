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

The first closing gate exposed cross-binary real-tmux interference on the machine-global server. A shared `tmux wait-for` lock initially serialized project tests, but production did not participate; review replaced the lock with dedicated per-fixture tmux servers, as recorded below.

## Wave 6 review round 1 — nine accepted findings

All nine findings were accepted. Three ratified port amendments landed in the same clean cutover:

```rust
Spine::latest_matching(&self, seat: &SeatId, kinds: &[&str]) -> Result<Option<Event>>
TmuxPort::pane_tap_sink(&self, pane: &str) -> Result<Option<PathBuf>>
Queue::ack_delivery(&self, job: JobId, origin: DeliveryOrigin) -> Result<DeliveryAck>
```

The shared doctrine is: ask the WORLD what it owns; ask the AUTHORITY who read. The attestation and bounded-read amendments are two faces of one error — not asking what the read actually needs.

### F2 — consent withdrawal extended across restarts

The in-process tombstone fix retired only `tracked_panes()`. After a crash, a fresh process has an empty tracked set, so a tombstoned or absent seat's marked pipe could continue capturing a human terminal forever.

Boot reconciliation now lists the world, asks `pane_tap_sink` for durable ownership on every non-wanted pane, and actively retires marked taps. Marker-authorized detach after restart is E-033 finally used for the case it was invented for, not a relaxation: after a crash the marker is the only ownership evidence that survives. Registry failure leaves reconciliation incomplete and retries on the next sweep.

The rule is **transition-not-filter extended across restarts**. A tombstone row alone is not release; observed teardown is release. The restart test uses two observer and adapter instances, injects an unreadable first registry pass, proves marker retention, retries, and then observes pipe zero, marker absent, and captured sink deleted.

Stress evidence, all reported rather than classified away:

```text
pre-fix detach: recurred at run 10/20
  tmux command success; pane_pipe still 1
shared-server attach: refused at run 7/20
  production TS daemon owned the foreign pipe; correct E-033 refusal
after effect convergence + dedicated tmux server: 20/20 from zero
  every run exercised attach and restart detach
```

Nine early greens did not refute the race; the tenth run found it. Three runs could not distinguish one-in-two from one-in-twenty. The recurrence index is part of the proof.

### Physical effect convergence — pipe EXISTENCE, tombstone ROW, detach RETURN

tmux occasionally returned success before detach took effect. The immediate verification was correct to inspect and wrong only to interpret not-yet as never. Attach and detach now poll `pane_pipe` against a two-second wall-clock deadline. State is recorded only after attach converges to one; marker and sink are cleared only after detach converges to zero. Timeout names operation, pane, sink, expected and observed state, retains marker/sink, and leaves the next observer sweep able to retry.

The attach mirror matters more: **a lying attach feeds zero bytes into a policy that reads zero as HUMAN NOT TYPING — the politeness gate would authorize forever on a sensor that never sensed.**

The day's trilogy is: **pipe EXISTENCE, tombstone ROW, detach RETURN** — three layers, one mistake: taking the nearest available signal as evidence of the effect that matters.

### F3 — durable storage for a forgeable assertion

Inbox ack previously published an attestation attempt before the delivered ledger changed, attributed it to `request.seat`, and carried no committed outcome. A machine-graded key could therefore mint an audit event for any seat, including when the job id was invalid or the ledger write failed.

`ack_delivery` now returns `DeliveryAck { recipient, msg_id, origin }` from the claimed job only after the transaction commits. HTTP publishes afterward, attributes `Event.seat` from `ack.recipient`, and carries the committed `reader-read` outcome. The hostile test sends a request body naming a different seat; the event remains attached to the job's recipient. An invalid job emits no attestation.

This is the reader-read defect on the surface built to prove reader-reads: attestation was moved to the spine because the ledger evicts, but the relocated claim itself was never checked for truth.

### F1 and F4 — deterministic real-tmux proof

`drain_until_quiet` now uses a generous ten-second wall-clock deadline instead of 80 scheduler ticks. Failure reports elapsed time, observed bytes, and the actual pane-pipe state.

The cross-process lock was still only polite: the production TS daemon never participated and legitimately attached pipes to fresh panes on the machine-global server. Every real fixture now owns a dedicated named tmux server and kills that server in `Drop`. Tests can neither see nor be seen by user processes; no stale lock or manual unlock instruction remains.

### F5 — lossy live policy state reconciles

The pointer subscriber now reads `dropped_count()`. Any lag is logged with the dropped count, in-memory policy state is discarded, and announced/parked/unparked facts are cold-replayed from the durable spine before another decision. A capacity-one test drops pre-ordinal announcements and proves replay parks at the full durable count instead of reopening the budget.

### F6 — P9 persist before mutate

Pointer facts now publish before `tmux.submit`. A spine failure leaves the physical pane untouched; recovery persists once and then submits once. This is the project's P9 rule: the previous order could repeatedly type an unrecorded final parking notice on every cadence.

### F7 — compare before park

Immediately before publishing parked, the worker reads the latest seat-scoped announced/parked/unparked fact. An unpark sequence newer than the decision wins; the stale park is abandoned and local state is reconciled. The race test publishes an unpark after the decision cursor and proves no parked event appears.

### F8 — unpark placement pinned to claim

The parking test claims mail and inspects the spine before acknowledgement. `delivery.pointer-unparked` must already exist while the queue has no ack. Moving unpark to the ack leg makes the test fail: a seat has been given its body at claim time even if the client dies before ledger acknowledgement.

### F9 / R3-AMEND-7 — one-row question, one-row read

`EventBus::history` is deleted. `Spine::latest_matching` requires a seat and non-empty kinds; mandatory scope is the load-bearing bound because an unscoped hot-path question is impossible to express. SQLite binds seat and kinds and executes `ORDER BY seq DESC LIMIT 1`.

The ratified `CountingSpine` instrument seeds 1,000 unrelated events, counts exactly one `latest_matching` call, and fails any `tail` call from the inbox-unpark hot path. Restoring the full scan fails exactly:

```text
bounded unpark lookup: Adapter { adapter: "testkit/counting-spine", message: "unpark hot path performed unbounded Spine::tail" }
```

This is the cost contract. The shared spine suite separately proves mandatory seat scope, kind matching, latest sequence, and empty-kind refusal over both fake and SQLite implementations.

### Final evidence and proof ceiling

```text
full workspace before the first gate: 341 passed / 49 suites / 3 ignored
F2 dedicated-server restart stress: 20/20 from zero
first canonical gate: no verdict — outer 3600s ceiling killed it after check compilation took 52m52s
second warm canonical gate: all six stages green after 2869s
```

The initial timeout is an environment proof ceiling, not a substituted result: a cold stream worktree pays the whole Rust build while the composed tree is warm. The PM owns the final central canonical gate on the merged head. No narrower command is reported as that final gate.

## Wave 6 review round 2 — effect and ownership

### F1 — marker presence is not ownership

Boot reconciliation originally treated any `@pij-tap-sink` value as authority to close the pane's pipe and unlink the named path. Because any tmux-writing process can set that option, the daemon exposed an arbitrary file-deletion primitive at boot.

Retirement now requires exact identity: the marker must equal the sink this daemon computes for that pane. An unrecognised marker belongs to someone else; the observer leaves pipe, marker, and file untouched and reports the mismatch. The hostile real-tmux test creates a decoy file and foreign marker on an unregistered pane, then proves reconciliation preserves all three.

Mutation — reduce ownership back to marker presence:

```text
FAILED foreign_marker_cannot_authorize_pipe_or_file_deletion
assertion `left == right` failed
  left: "0"
 right: "1"
```

Live both-halves proof:

```text
BEFORE — DELETED
pre-fix daemon running; decoy marker named /tmp/decoy-sink-1788122328.raw
boot reconciliation deleted a file it never created on a pane it never tapped

AFTER — SURVIVES
zero daemons running when armed; fixed binary launched foreground by hand
decoy file: survives
decoy marker: intact
owned seat %1566: tapped, matching marker present
released seat %1567: pipe=0, still released
```

Two intermediate DELETED runs were discarded, not hidden. Run 1 armed the decoy while the old daemon still ran, so the pre-fix 600 ms sweep consumed it before the fixed binary booted. Run 2 used a hub-supervised process that later exited non-zero and could not be accounted for as a clean instrument. The decisive run pinned zero daemons before arming and launched the exact fixed binary in the foreground. **A test whose instrument state is not pinned reports the environment, not the change.**

This is the fourth form of the same axis: pipe **EXISTENCE**, tombstone **ROW**, detach **RETURN**, marker **PRESENCE**. Ownership is not that a marker exists; ownership is that the marker is ours.

### F2 — experienced event with bounded retry

`delivery.pointer-announced` continues to mean what the seat experienced. The worker submits first, then publishes. If publication fails, it retains the exact pending event in process state; every later claim retries that publication before any new submit. The regression injects one spine failure, observes one physical pointer, retries, and proves one event plus still exactly one submit.

The named restart residual is deliberate: a crash can lose the process-local pending fact and duplicate one pointer. Duplicate-over-lie wins. Redefining the event as a pre-submit decision was rejected because it would make the ledger change its story to fit implementation order.

### F3 — read attestation residual

Inbox acknowledgement commits the delivered ledger before publishing its authority-attributed attestation. If that later publish fails, a committed read has no durable spine evidence; after delivered-ledger eviction, a consumer cannot distinguish it from no read. No compensating machinery was added. This silent residual is the price of never minting evidence for a read that did not commit.

### F4 — asynchronous convergence and isolated instruments

Attach and detach effect convergence now uses async sleep, so an unhappy pane yields the runtime. Retirements run concurrently through a `JoinSet`, bounding the sweep by one convergence deadline rather than serialising two seconds per pane.

Real tmux fixtures no longer share the production server. Each owns a dedicated socket-name server and kills it in `Drop`; the cooperative global lock was removed. This closed both the cold-load settling flake and production-daemon pipe races.

Stress history:

```text
detach not-yet recurred at run 10/20 before effect convergence
foreign-owner attach refusal recurred at run 7/20 on the shared production server
dedicated-server attach + restart-detach: 20/20 from zero after fixes
```

The first two reds had distinct production causes and were not classified away. The final sample exercises both attach and detach observation on every run.

### Round 2 verification

```text
targeted round-2 regressions: green
all pij-tmux adapter tests: 9 passed
workspace: 342 passed / 49 suites / 3 ignored
architecture fixtures regenerated; arch_drift: 6 passed
```

The PM owns the final canonical gate on the warm composed tree. No additional cold gate was started after that handoff.

## Wave 6 review round 3 — primitive ownership

### F1 — the caller was fixed while the primitive stayed armed

Round 2 compared marker identity in `PaneObserver`, but marker-fallback `TmuxAdapter::detach_pane_tap` still trusted any `@pij-tap-sink` string. A direct call with no process-local tap closed the foreign pipe and unlinked the attacker-named file. The port documentation claimed “matching durable marker” while the primitive enforced presence only.

`TmuxAdapter` now takes its authorized tap root at construction, alongside server/session scope. `pij_tmux::tap_sink_path` is the single sink-identity function shared by adapter and observer. Attach refuses a caller-provided sink that differs from the adapter-computed path. Marker-fallback detach independently recomputes the expected path and refuses a mismatch before pipe or filesystem mutation. `build_services` receives the exact pane-signal root and passes the same value to adapter and observer.

The permanent direct-adapter test has no local tap state. It creates a foreign pipe, foreign marker, and real decoy file; calls `detach_pane_tap` directly; asserts the file first, then the refusal and live pipe. Removing the primitive comparison fails on the file, not merely a boolean:

```text
FAILED direct_detach_refuses_foreign_marker_and_preserves_its_file
foreign file survives: Os { code: 2, kind: NotFound, message: "No such file or directory" }
```

Live proof at the primitive layer, with identical procedure and instrument state pinned:

```text
BEFORE — pre-fix daemon, armed while running
/tmp/decoy-sink-1788122328.raw: DELETED; foreign marker cleared

AFTER — composed head 55c38530, armed with ZERO daemons running,
fixed binary launched foreground by hand
/tmp/decoy-w6final-1788134026.raw: SURVIVES; foreign marker untouched
owned %1566: tap and matching marker retained
released %1567: pipe=0, not resurrected
```

Two intermediate deleted runs remain disclosed: one accidentally exercised the old daemon still alive; one used a supervised process that later exited non-zero. Neither is counted as evidence for or against the fixed primitive. The observer caller and adapter primitive are now separately witnessed; proving only the caller was the gap that created round 3.

This is the round-2 pattern one layer down: the observer caller was fixed while the deletion primitive remained armed. The port documentation and implementation now enforce the same matching-identity guarantee.

### F2 — pending fact retry is claimless

Submit still precedes publication so `delivery.pointer-announced` means experienced. A failed publication retains the pending event in process state. `drain_once` now flushes all pending pointer facts before registry reads or queue claims.

The regression lets submit succeed, injects publication failure, then has a reader claim and retain the body before the next pointer tick. The next `drain_once` handles zero jobs yet publishes the pending fact; submit count remains one. This closes the live-process hole where the reader removed the only job that could drive retry.

The residual boundary is wider than the earlier receipt stated: a crash between successful submit and pending-state insertion may lose the fact and duplicate one pointer after restart. With the process alive, claimless top-of-loop retry no longer depends on the body row remaining available. Duplicate-over-lie remains the ruled trade.

### F3 — explicit cold-path unbounded hydration

Pointer hydration and lag recovery deliberately call `EventBus::subscribe(None, ..)`. That calls `Spine::tail` from sequence zero, materializes every spine row, and only then filters pointer kinds in Rust. The code now states this cost plainly.

The full scan is accepted only on cold initialization and lossy-live recovery because reconstructing every announcement since the latest unpark requires durable history. It must not migrate to per-inbox or per-claim hot paths; those use mandatory-seat `latest_matching`.

### Proof-environment correction

The proposed shared `CARGO_TARGET_DIR` was withdrawn after another worktree consumed test artifacts built from this branch's unpushed future source and reported compiler paths as its own. A shared path cache let artifacts outlive and cross the facts they described. Final cited evidence returned to the per-worktree `/tmp/pij-w6-u-uds-open-target`; content-addressed `sccache` is the named future solution.

Round-3 per-worktree evidence:

```text
direct primitive hostile-marker test: passed
observer hostile-marker test: passed
restart consent transition: passed
pending fact with reader-held row: passed
workspace: 347 passed / 52 suites / 3 ignored
```

The PM owns the final composed-head canonical gate.
