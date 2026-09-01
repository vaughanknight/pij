# OMP extension delivery diagnosis

## Verdict

The live OMP path is **RustRuntimeSession**, not the legacy `FsChannel` watcher. The Rust event consumer **did fire** in the recorded acceptance run: it injected the full leg-2 body at `scratch/s119/transcripts/accept-omp-lark-%2167.txt:145-150`. The later pointer at `:153-158` is a second, daemon-authored notification, not pointer text passed through the extension.

The concrete defect is a dual-delivery protocol mismatch: the daemon publishes `message.pushed` even when its delivery outcome is `Queued`; the OMP extension treats that event as the body delivery, while the still-live queue row independently falls through to the pointer worker. Since the only socket transport rejects every non-Claude harness, an OMP queue retry selects `Pointer` and tmux-submits `message waiting — run: pij inbox`. The `message.pushed` payload has `msg_id/from/body` but no queue `job_id`, so the extension cannot acknowledge the queued row through `/v1/inbox/ack`.

A report of **pointer only** is not reproduced by the retained acceptance transcript. It is nevertheless structurally possible after an event-stream gap: the extension attaches to `/v1/events` without a cursor, the daemon makes a cursorless attach live-only, and the client has no reconnect/replay loop. That is a bounded inference, not the observed cause of the acceptance pointer.

## 1. Runtime selected by a live spawned OMP

- OMP loads the current extension through `~/.omp/agent/extensions/pij -> /Users/jordanknight/pi-hacking/pij/.pi/extensions/pij` (read-only `readlink` receipt).
- Current live seat receipt: daemon `/v1/seats` returns `pij-killing-time`, `harness:"omp"`, pane `%2177`, pid `64636`; `ps` identifies pid 64636 as `bun .../omp`. The process has no `PIJ_DAEMON_GENERATION`, `PIJ_RS_ADDR`, or `PIJ_RS_STATE_DIR` override.
- Therefore `daemonGenerationPreference()` defaults to `rs` (`.pi/extensions/pij/adapters/daemon-http.ts:67-75`), and `daemonLocation()` defaults to `127.0.0.1:7461` plus `~/.pij-rs` (`:54-64`). The live `/health` probe returned HTTP 200, `healthy`, machine `JordansacStudio.localdomain`; the key was readable. That makes `detectDaemonGeneration()` return `{ kind: "rust", ... }` (`:77-108`).
- `index.ts` branches to `RustRuntimeSession` when `generation.kind === "rust"`, constructs/boots it, assigns `session = rustRuntime`, and returns before legacy setup (`.pi/extensions/pij/index.ts:283-327`). The legacy poll-primary `FsChannel` is only constructed after that return (`:329-396`).
- OMP runtime detection is independently positive because Bun or an `omp` executable basename selects `"omp"` (`.pi/extensions/pij/core/discovery.ts:51-57`; call site `.pi/extensions/pij/index.ts:272-278`).
- Direct historical runtime receipt: the fresh OMP printed `pij: detected Rust daemon v1 ... registered pij-handicapped-lark` (`scratch/s119/transcripts/accept-omp-lark-%2167.txt:103-107`).

## 2. Event-consumer diagnosis

The three proposed failures are ruled out for the observed run:

1. **Subscription/auth is connected.** `PijDaemonClient.watchEvents()` opens authenticated `GET http://<addr>/v1/events` (`.pi/extensions/pij/adapters/daemon-http.ts:138-153`, auth header `:172-174`). Current live OMP pid 64636 owns an established TCP connection to `127.0.0.1:7461` (read-only `lsof` receipt), and an authenticated read-only replay request returned HTTP 200.
2. **Seat names match.** Live daemon registry rows carry the OMP ids, and the replayed seq 454 frame has `seat:"pij-handicapped-lark"`. `RustRuntimeSession.boot()` sets `this.self = id` immediately before attaching (`.pi/extensions/pij/adapters/rust-runtime.ts:95-105`); the transcript startup identity is the same id (`scratch/s119/transcripts/accept-omp-lark-%2167.txt:103-110`).
3. **The daemon emits `message.pushed` for OMP.** Read-only `/v1/events` replay returned seq 454 with full body and seat `pij-handicapped-lark`; the durable receipt is also recorded at `scratch/s119/ACCEPTANCE-weasel-independent-run.md:14-18`. Source publishes the event against `msg.to` with the full body (`crates/daemon/src/delivery/mod.rs:462-485`) and has no harness filter.

Positive proof that the `:106` limb fired: the consumer calls `pushedMessage()` then `session.onInbound()` (`.pi/extensions/pij/adapters/rust-runtime.ts:104-123`); `onInbound()` frames and injects the body (`.pi/extensions/pij/core/session.ts:589-600`; frame spelling at `.pi/extensions/pij/core/message.ts:10-13`). The exact resulting `[pij from pij-combined-impala] acceptance leg 2...` appears before the pointer in `scratch/s119/transcripts/accept-omp-lark-%2167.txt:145-153`. The prior review independently identified the same duplicate (`scratch/s119/review-gopher-f10-acceptance-evidence.md:21-26`).

### Pointer-only exposure

The stream client starts without a cursor (`.pi/extensions/pij/adapters/daemon-http.ts:138-153`). The daemon explicitly makes absent-cursor subscriptions live-only (`crates/daemon/src/http/mod.rs:1132-1159`). `pumpEventStream()` reports termination/error and exits, with no reconnect or cursor persistence (`.pi/extensions/pij/adapters/daemon-http.ts:177-225`); the only `watchEvents` call is the boot-time attach (`.pi/extensions/pij/adapters/rust-runtime.ts:103-123`). Thus a frame emitted before attach or after a dropped stream can be absent from OMP while remaining durable in the spine. [INFERENCE: plausible explanation for a separate pointer-only observation; not what happened at seq 454.]

## 3. Author of the pointer turn

The daemon authored it and submitted it directly through tmux:

- The exact text is produced by Rust `render_pointer()` as `[pij-rs from ...]\nmessage waiting — run: pij inbox\n[/pij]` (`crates/daemon/src/pointer/mod.rs:33-45`).
- The queue worker selects `Pointer`, renders it, calls `self.tmux.submit(pane, &pointer)`, then records `delivery.pointer-announced` (`crates/daemon/src/pointer/worker.rs:292-327`, `:353-439`).
- OMP cannot use the current UDS body transport: `can_deliver()` returns false unless `seat.harness == Harness::Claude` (`crates/transport/src/uds.rs:164-177`). A socketless, idle, paned recipient selects `Pointer` (`crates/core/src/delivery.rs:72-95`).
- The extension's injected text has the distinct `[pij from <id>] <body>` spelling (`.pi/extensions/pij/core/message.ts:10-13`), exactly matching transcript line 145, not the `[pij-rs ...]` pointer at line 153.

Why both happen for one message:

- After any accepted send, `DeliveryService` calls `publish_pushed()` even when the computed outcome is `Queued` (`crates/daemon/src/delivery/mod.rs:298-322`). The queued contract is explicit in the tests: a queued row remains claimable and still has the `message.pushed` plus `delivery.outcome` pair (`:770-790`, `:1009-1031`).
- `PushedEvent` contains no `job_id` (`crates/daemon/src/delivery/mod.rs:527-539`), while queue acknowledgement requires the claimed `job_id` (`:30-38`, `:340-413`). The extension therefore injects from the event but does not consume/ack the queued job; the pointer worker later announces that row.

## Machine caveat

`pij daemon status` reports a running process recorded at source `c8d99b13` while the checkout is `d84001bb` (565 commits newer). The behavioral conclusions above do not depend on assuming source/binary parity: they are anchored by the live API replay and retained OMP transcript. The current file lines identify the checked-out implementation that produces the observed wire shapes.
