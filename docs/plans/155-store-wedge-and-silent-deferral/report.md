# Plan 155 — store wedge and silent delivery deferral

Base: main `10798fce`, coder packet `62aba16f63f666f36e262b90a15f2ea62f5adae7`. Work is confined to this worktree. Production daemon and message state were read-only for the coder. Release follows prime's explicit environmental gate ruling below; the full `self-check` failure is retained, not relabelled green.

## B: status was being mistaken for delivery authority (AC4 + prime ruling)

The unmodified classifier, then the complete fresh interaction gate, accepted both captured Claude 2.1.281 panes at their recorded cursor `(2,53)`:

```text
%486: permitted=true composer_idle=true reason=None
%495: permitted=true composer_idle=true reason=None
```

The labeled separator and background-agent footer were not the defect. Read-only `pij state --json` showed both `state:"idle"` and `semanticState:"hold"`; the worker returned before consulting the socket or composer. Prime identified these as self-reports awaiting Jordan, ruled that status must never suppress inbox delivery, changed the live seats to `waiting`, and reported all eight messages delivered. That live recovery is prime-reported, not a coder deployment.

Removed the routing, worker and native-claim status vetoes and the obsolete `OperatorHold` reason. No independent operator-mailbox-hold field or setter existed, so none was invented. Native incarnation, pane/context, recipient consent, receiver lease/stale checks and explicit per-job typing holds remain. The classifier itself is unchanged.

### Rolling compatibility — no paired cutover

Per prime's explicit ruling, the daemon retains deprecated `semantic_hold: false`
on native typing snapshots, regardless of reported status. Already-running old
children require the boolean and permit delivery when false. The new receiver
ignores the field entirely, absent or present (including a historical true value).
No fleet restart or paired upgrade is required by this contract.

Removal is filed separately as [#429](https://github.com/AI-Substrate/pij/issues/429).
Every live native receiver must first be positively verified at or past the
field-ignoring plan-155 build; initial `store.mjs` SHA-256:
`16a6020da089021cf0d6d0965e35974c0919e1f3e734ced1a98da48a61288fc5`.
Unknown loaded code blocks removal; an on-disk update or live host is not evidence.
Only then may a daemon-only follow-up delete the compatibility field.

The unchanged current-main runtime SHA-256 is
`ecdce862aea71ce61e330aef79533e3c7fa431f5d0a3f5bb995de316edfe3475`.
Against the new private daemon with the field missing, it failed before injection:
`NativeError: Native consent observation unavailable or invalid`.
The actual old module is loaded directly from main, not reimplemented by a fake;
chooser, registration, HTTP client, bridge, journal and SQLite are real. Only the
SDK's `native.send` acceptance boundary is simulated.

GREEN: **1 passed, 0.75 s**, using
`PIJ_NATIVE_RUNTIME_MODULE=/Users/jordanknight/pi-hacking/pij/.copilot/extensions/pij/store.mjs`
with `cargo test --locked -p pij-daemon --test native_runtime_cold_resume -- --ignored --nocapture --test-threads=1`.
The current-main module remained byte-identical; actual receipt:

```text
reportedState: hold
seat: pij-spiritual-regis
moduleDigest: ecdce862aea71ce61e330aef79533e3c7fa431f5d0a3f5bb995de316edfe3475
jobId: 1; messageId: cross-language-original-m1
old host: 59900; resumed host: 59960; proc_start: 20260925122114
acceptanceBoundaryCalls: 1; acknowledged: false → true
journalDigest: 25de2b0e5ad5d1d3a329ef94e106a220e6bdd2b24258f83d5a0e8de422454a71 (unchanged)
```

Both registry reads assert self-reported Hold remains. The same message/job is
ACKed after restart without a second injection. New-receiver tests also passed
**2/2** for an absent field and an ignored historical `true` value.

Behavioral REDs: core returned `Queue(OperatorHold)` instead of `Transport`; the queued worker delivered zero messages; native claim returned `Some("semantic-hold")`; native client sent zero rather than one. These paths passed in the composed daemon/native suites. The captured-layout regression proves the full gate, not just string parsing.

## A: acknowledged BEGIN could outlive its transaction guard (AC0–AC2)

sqlx 0.8.6 handles a cancelled **unacknowledged** worker BEGIN. Its custom-BEGIN path has another await after acknowledgement: `conn.lock_handle()` verifies the statement before `Transaction::begin` constructs its drop guard. Cancelling there leaves transaction depth one on the returned connection.

The original guard-free cancellation reproduction failed behaviorally:

```text
cancelled-after-BEGIN-ack: in_transaction=true
cancelled BEGIN must not poison the pool:
  attempted to call begin_with at non-zero transaction depth
```

A private HTTP daemon router backed by the frozen, unguarded pool boundary reproduced the same failure through the real `/v1/report` route:

```text
HTTP 500: meta="store: attempted to call begin_with at non-zero transaction depth"
old /health: HTTP 200, data.status="healthy"
```

This reproduces the production error and an unsafe library cancellation mechanism. The old production log has no timestamps/cancellation trace; it does **not** prove which production request triggered the incident.

Pool `after_release` and `before_acquire` now flush queued rollback work, inspect sqlx transaction depth, and roll back an open transaction before reuse. A failed hook closes the connection through sqlx. Recovery emitted exactly one `recovery_count=1` line in the targeted witness; the next `begin_write` succeeded. No unsafe SQLite FFI or installed dependency patch is used.

Every explicit store transaction now executes inside an owned task from BEGIN through COMMIT/ROLLBACK. Existing signatures, SQL atomicity and idempotency are retained; the queue's old forwarding helper is gone. The mutation removing task ownership produced **zero committed events instead of one** when the caller was cancelled inside a real SQLite INSERT. Restoring ownership passed both task abort and timeout/select cancellation. A real HTTP client disconnected inside INSERT still left exactly one committed `report.now`, followed by healthy store access.

### Ownership integration findings resolved

Independent review caught a new risk: shielding `note_delivered` alone could commit the dedupe reservation while cancellation discarded its injection continuation. The real-SQL hook regression confirmed **zero injected bodies**, followed by a misleading durable reservation. Admission now owns reservation, injection/compensation and publication together; its reply is a separate oneshot. The same regression passed with one injection and an idempotent retry. The service tracks admitted tasks for shutdown.

Shutdown stops/joins producers, drains delivery admissions, flushes the event bus, then drains both composed pool domains. A second deterministic test found `Pool::close().await` itself returning with `is_closed=true,size=1` while an INSERT was still blocked: sqlx 0.8.6 double-releases idle semaphore permits during close. The store close helper therefore waits for physical connection `size()==0` after closure, with a shutdown-only 10 ms wait. No new acquire can enter, and no writer is force-aborted. This extra barrier is regression-tested, not inferred from sqlx's close documentation.

Final integration also exercised real Queue/fake Spine: the new atomic deferral
path initially emitted a foreign-store cursor. The mixed-backend RED returned a
queued receipt instead of a named refusal. Direct delivery and drain now apply
the existing `E-RS-INBOX-AUTHORITY-SPLIT` guard before diagnostic mutation, keeping
the original body/retry while publishing no foreign event. No broader backend
configuration or ordinary ACK policy was changed.

### Cancellation boundary inventory

- HTTP callers can disconnect; store ownership persists, and delivery admission owns its cross-system continuation.
- `lib.rs` governance observer shutdown uses `select!` around `follow_deliveries`, which can be awaiting `mark_dispatch_delivered`; pool draining covers that detached SQL owner.
- The generic lifecycle scheduler and pane observer await work **inside the selected branch**, so their shutdown branch does not cancel the running tick.
- Native inbox `timeout_at`/`select!` arms wait on event streams, not a store transaction. Federation shutdown selections wait on idle/network events; store work is owned.
- Registration timeouts bound process/ancestry observation, not write transactions. These authority/deadline rules are not relaxed.
- The new bounded health waiter can time out; its owned BEGIN/ROLLBACK finishes independently. Process kill/power loss is not promised a successful commit.

## Honest health and bounded waits (AC3)

Pool acquisition and SQLite write-lock waits each have a two-second bound. `/health` probes schema plus write-lock availability without changing rows, under its own two-second deadline. Failure returns HTTP 503 with `ok:false`, `error:"adapter"`, a diagnostic `meta`, `data.status:"unhealthy"` and `data.store:{status:"unavailable",timeout_ms:2000}`.

Private HTTP proof: a poisoned legacy pool changed from 200 healthy to 503 unavailable. With the current single-connection pool deliberately occupied, health returned 503 and a store-bound state request returned 500 (about 4.0 seconds for the two sequential two-second waits); release restored 200 healthy. No production health was fault-injected.

## Durable, visible deferrals (AC5)

Migration 21 stores last reason, cumulative count, first-deferral time and event-sampling checkpoint on jobs. Facts and sampled `delivery.held` events commit atomically. First attempt and reason changes emit immediately; identical reasons emit at most once per minute per job, including across restart. Diagnostics cover composer and non-composer retry branches; publication failures retain the original consent backoff. They never count as delivery or ACK.

State exposes live `deliveryDeferrals:[{job_id,msg_id,reason,count,since_ms}]`; success/terminal rows disappear from this projection but retain SQL history. Existing explicit extension `/v1/hold` remains a separate `held[]` mechanism.

An actual private HTTP/SQLite smoke invoked both the built native CLI and this worktree's TS shim. The pane/transport inputs were deterministic fakes, not a model-backed Claude turn. Both exited zero and printed:

```text
delivery deferred: unrecognized ×3 since 1790301591239 ms
```

SQL contained one `delivery.held` for three attempts. The same row ended `done` with reason/count preserved; a fresh native state invocation no longer printed the active deferral. The seat's self-reported `hold` remained unchanged throughout.

Queued transport outcomes are **not** evidence of nonacceptance. Blind body re-send after an ambiguous socket write risks duplicates. This incident took the pre-transport status branch, not that branch; this plan does not claim or introduce a repair of the existing UDS ambiguous-retry policy.

## Timestamped daemon output (AC6)

One descriptor-level boundary timestamps each newly emitted daemon stdout/stderr line with UTC RFC 3339, including multiline errors and panic output. It preserves original destinations and bytes, drains final partial lines during orderly/unwind shutdown, and does not wait forever for inherited child writers. Normal CLI output is unchanged. Historical daemon.log lines remain untouched; SIGKILL cannot guarantee drain.

The actual private daemon regression first failed on an unprefixed `pij-rs claude inbound` line. Its GREEN and byte/partial/panic/inherited-writer cases passed in the Rust run. Architecture fixtures were then updated for the reviewed nix/time dependency edges rather than weakening the graph check.

## Contract and proof (AC7)

[API contract](../../how/pij-rs-api.md#store-health-and-daemon-logs) and [node reporting contract](../../../skills/pij/references/routes/node.md#tasks-and-reports) describe store health, deferral fields and status never gating delivery.

Targeted proof so far: store cancellation **2 passed**; private HTTP/cancellation/reservation **4 passed**; native receiver **255 passed / 3 Linux-only skips**; affected TS routing/runtime/smoke fixtures **356 passed**. The first whole Rust run passed the daemon/store suites and then correctly failed stale architecture fixture permissions; those fixtures are repaired. Final Rust/fmt/clippy and canonical gate receipts follow after all source settles.

Harness observations: cold boot smoke exceeded 90 seconds; a later canonical run hit the existing 250 ms Darwin process-observation refusal in one private inbox fixture. Its focused replay also failed while another Cargo build ran, so that was not an idle control. Serial post-build runs passed both with logging disabled temporarily and with logging enabled. A Rust library test (no CLI logger installed) separately hit the same zero-output `ps` refusal, disproving logging as a necessary cause. Heavy final gates run sequentially with Rust test threads set to one; no timeout, identity check or assertion was weakened. Temporary probe code was removed.

### Authorized observer-budget repair

The complete single-thread Rust run still failed five existing native
registration cases on the unchanged Darwin process observer: per-process
`/bin/ps` deadline 250 ms, outer host-observation deadline two seconds.
The same native subset with an explicit inert-host echo/exec-readiness handshake
passed 41/42 but still hit the 250 ms refusal. That experiment was removed:
readiness alone is not a demonstrated repair. The timestamp sink is not involved
in these library tests. No registration authority, deadline or assertion changed.

Prime explicitly authorized a separate budget commit: named per-process `ps`
limit **1 second**, whole-host/ancestry limit **5 seconds**. Every process-start
sandwich, executable and ancestry check remains unchanged. These limits are
**brakes, not policy**: raising a fail-closed timeout only delays refusal; it does
not grant identity or remove a required observation.

A fake `ps` answering in 600 ms was RED at 250 ms, then admitted at one second.
A never-answering fake `ps` is killed/reaped and refuses within the five-second
total, naming the observed PID. The first targeted pass had 70/72 successful,
including both new subprocess cases; two virtual-clock assertions observed
Tokio's 5.001-second timer tick instead of exactly 5.000. Their one-millisecond
precision allowance does not change either configured deadline.

**Extension retry:** the old HTTP 400 timeout was terminal to Copilot; timeouts
now use existing HTTP 409 `details.retryable:true`, so current-main and new
extensions retry with ordinary registration backoff, not native-session Hold.
No frontend retry implementation was changed.

Targeted GREEN: **72/72 registration tests**, including 600 ms admission,
never-answering refusal, named PID, both five-second host bounds and unchanged
start-time-sandwich regressions. The actual child HTTP-409 retry/delivery test also
passed **1/1**. No further widening is authorized or applied.

## Final gate receipt and authorized isolated replay

```text
RUST_TEST_THREADS=1 cargo test --workspace -- --format terse
exit 0 — 1183 reported passes, 0 failures, 8 ignored, 93 filtered across 92 result summaries
daemon unit suite: 437 passed, 0 failed
cargo fmt --all --check: exit 0
cargo clippy --workspace --all-targets -- -D warnings: exit 0
cargo build -p pij-cli --bin pij-rs: exit 0
just self-check: exit 1
Vitest: 5307 passed, 1 failed, 22 skipped; 243 passed files, 1 failed, 4 skipped
```

The remaining canonical failure is
`.omp/extensions/pij/cli.inbox.integration.test.ts:829`,
`refuses conflicting native session evidence observed in the host argv`.
Its final `whoami` was refused during registration:

```json
{"ok":false,"command":"pij register","v":2,"meta":"process observation for pid 48254 timed out after 1000ms","error":"refused","details":{"retryable":true}}
```
Prime ruled the remaining refusal environmental and authorized only that test
in isolation, up to three attempts, with no limit changes. **Attempt 1 passed**;
attempts 2 and 3 were therefore not run. Exact receipt:

```text
just test .omp/extensions/pij/cli.inbox.integration.test.ts -t 'refuses conflicting native session evidence observed in the host argv'
exit 0 — 1 passed, 16 intentionally unselected; test 969 ms; command 1.72 s
```

Environment **reported by prime**, not re-measured by the coder: load average
**38 on 16 cores**; Defender **~184% CPU**; OrbStack **~113%**; four Python
processes **~100% each**; idle `ps` **0.00 s**. The >1-second observation refusal
under that load was the retryable brake working as designed. The 1s/5s limits
were not widened.

Per that explicit ruling, the passing isolated replay authorizes delivery.
The earlier complete `self-check` remains **exit 1** and stopped at Vitest,
before its later native/Windows/smoke/audit/snapshot stages. Those later stages
are not falsely claimed as a completed final composite. Code, budget and
evidence are committed separately below.

## Delivery commits and retained evidence

- Code: `21098074a36b48e5bfb6e328832a55d34e63cd0e`.
- Observer budget: `dda4d052de4bd7d4a18d002f5e2964fa0b609dbe`.
- [Source hashes, RED/GREEN receipts and release ruling](proof.json).
- [Complete compact final Rust receipt](evidence/final-rust.txt).

This report and its ledger are the separate evidence commit named by the final
handoff. All three commits carry freshly derived C11 seat/prime/plan trailers.
Private smoke data, keys, temporary probes and delivered scratch notices were
removed. No push, PR, merge, production restart or global link change was made.

Harness lesson encoded: cancellation ownership must include the continuation
after a durable reservation, and shutdown must wait for physical resource
completion rather than trusting an API's closed flag. Their failure injections
now remain as deterministic regressions; deferral facts and timestamped output
make the next incident diagnosable without guessing from an idle badge.

## Fix round

F1 replaces the unbounded physical-pool drain with one shared five-second
deadline for tracked delivery/publication joins and both pool closes, after
producer shutdown. Expiry logs one line with role-labelled checked-out counts
and continues; normal admitted writes still drain before return. The previous
claim that closure prevents an indefinite wait was wrong: it prevents growth,
not a leaked lease. Expiry cannot promise completion of outstanding writes.

Tracked delivery/publication work is joined before pool cleanup. Standalone
`owned_write` tasks have no task registry; the bounded physical drain remains
their fallback without introducing another write-admission registry.

F2 derives the delayed process-observer fixture from 30% of
`PROCESS_OBSERVATION_TIMEOUT`; production limits remain 1s per process / 5s
per host. Virtual-clock tests retain deadline-boundary coverage.

F3 samples against the job's clock regardless of reason. Migration 0022 retains
pending reason-transition counts across restart; each event reports the current
reason and `reason_changes` since the last event (first event zero). First
deferral emits immediately, then at most one event per 60 seconds per job.

F4 coverage boundary: native inbox-pull holds and `backoff_held` do not increment
the durable deferral counter; native holds return reasons and are lease-bounded,
while `backoff_held` terminates at `HELD_ATTEMPT_LIMIT`. No behavior change.

### Behavioral proof

- F1 RED: a real private daemon with both pool connections held exceeded the
  six-second ceiling (`6.001334208s`, 0 passed / 1 failed). GREEN: the same case
  and normal detached-write completion both pass (2/2, 5.12s); expiry emitted:
  `pij-rs shutdown drain expired after 5000ms; spine_checked_out=1 background_checked_out=1; continuing shutdown`.
- `cargo test -p pij-daemon --test review_regressions`: **20/20 runs passed** at
  default parallelism, 14 tests each, zero hangs. Seven runs took roughly
  5.5–5.6s in the test suite; successful-test stderr is captured, so this receipt
  does not claim zero drain expiries. Total command wall time: 84.545s.
- F3 RED: 720 alternating attempts emitted 720 events, expected 60. GREEN:
  720 attempts at 5s intervals emit exactly 60 events against SQLite and the
  fake; later samples report 12 transitions each. All four deferral tests pass,
  including restart preservation, atomic failure, and terminal projection.
- Default-parallel `cargo test --workspace`: exit 0, **1185 reported passes,
  0 failures**, 8 ignored / 93 filtered across 92 result summaries, 184.07s.
  Counts include helper subprocess summaries, not unique tests. The revised
  observer fixture and both shutdown tests pass within this full run.
- `cargo fmt --all --check`, strict workspace/all-target Clippy, and the native
  CLI build pass. Native Node suite: **256 passed / 3 Linux-only skipped**,
  0 failed, 9.06s. No isolated rerun was needed for these gates.

[Compact fix-round receipts](fix-round-proof.json) retain the per-run results
and complete Rust result-summary inventory. Original release evidence above
remains historical; these fresh receipts supersede its gate verdict.

Harness retrospective (DL-001): closing admission prevents growth, not
termination. The retained stalled-resource test now proves the recovery path's
bound; normal-completion proof separately defends durability. The observation
was persisted in the compact ledger and drained. The failed RED fixture's
private key/store directory was removed; no production resources were touched.

### Final canonical gate

Warm `just self-check` **exit 0**, 140.73s: 244 Vitest files / 5308 tests passed,
4 files / 22 tests skipped; native 256 passed / 3 Linux-only skipped; Windows
focused 84 passed / 2 skipped, with all portable stages passing; all 11 smokes
passed. No gate needed an isolated rerun.

Closing snapshot proof:
`✓ snapshot-check: briefing.md SHA matches snapshots (cdf5f5b25001...)`.
The report-only package audit still flags one of four packages
(`pi-askuserquestion`: 4 fail / 13 warn). Biome schema skew is informational.
Historical missing-prime trailer warnings remain on `8eef0985`, `bd5afa23`,
and `62aba16f`; their attribution was not invented or rewritten.

Fix committed with fresh `Pij-Seat: pij-worthy-brandon`,
`Pij-Prime: pij-far-jackal`, and
`Pij-Plan: 155-store-wedge-and-silent-deferral` trailers; the final handoff names
the commit containing this report and its compact evidence.
