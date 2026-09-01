# Cross-model review — s123 one-message-one-delivery

**Plan**: `/Users/jordanknight/pi-hacking/pij-worktrees/s123-one-message-one-delivery/docs/plans/123-one-message-one-delivery/plan.dd.json`  
**Commit reviewed**: `f6a28cf601318eb9e35c4dae5655c952400594c6` (`fix(pij): claim pushed messages before injection`)  
**Scope**: read-only review of the branch diff and its s123 commit; no source, test, or plan artifact was edited.  
**Date**: 2026-09-01

## A) Verdict

**REQUEST_CHANGES — one HIGH correctness finding.**

The nominal claim → inject → ack path is correctly ordered, and the live evidence is credible as documentary evidence. A session replacement while `claimInbox()` is in flight can nevertheless deliver and acknowledge seat A's claimed body as seat B. That is a cross-session misdelivery and consumes A's queue row.

## B) Summary

The implementation replaces event-body delivery with an authority-owned inbox claim, serializes pushed-event handling, injects before acknowledging, and suppresses an empty claim. The forced synchronous injection-failure test proves that this path does not acknowledge after `inject()` throws. The six pre-existing daemon inbox guards were not weakened: the s123 daemon diff is additive, and the full Rust completion gate passed. The Rust and TypeScript tests both consume the daemon-owned `inbox-claim.wire.json`; this guards the claim response spelling. Version-skew proof remains incomplete: no test or receipt exercises either pinned old/new pair or a loud compatibility failure.

## C) Checklist

- [x] Reviewed plan, implementation guide, supplied evidence, branch diff, and s123 commit diff.
- [x] Traced claim → inject → ack and the empty-claim branch in current source.
- [x] Checked the shared fixture has a Rust producer-side assertion and a TypeScript consumer.
- [x] Checked the daemon inbox guard region was not weakened by s123.
- [x] `pij-gate` passed: toolchain, lock, fmt, clippy, workspace tests, and architecture.
- [x] Focused `rust-runtime.test.ts` passed (4 tests).
- [x] `harness checks` passed all reported sensors: local paths, typecheck, lint, test, Windows compatibility, smoke, package audit, and snapshots.
- [ ] Pinned old/new daemon-extension compatibility pairs have not been exercised.

## D) Findings table

| ID | Severity | File:lines | Category | Summary | Recommendation |
| --- | --- | --- | --- | --- | --- |
| F001 | HIGH | `/Users/jordanknight/pi-hacking/pij-worktrees/s123-one-message-one-delivery/.pi/extensions/pij/adapters/rust-runtime.ts:101-112,184-202` | correctness | An in-flight claim crosses a `new`/`fork` session identity boundary and may inject/ack a prior seat's body as its successor. | Bind pushed work to its original seat/generation; after every async boundary, refuse to inject or acknowledge if that seat is no longer current. Add a delayed-claim replacement regression test. |
| F002 | MEDIUM | `/Users/jordanknight/pi-hacking/pij-worktrees/s123-one-message-one-delivery/.pi/extensions/pij/adapters/rust-runtime.ts:184-210`; `docs/plans/123-one-message-one-delivery/assets/live-delivery-transcripts.md:87-89` | compatibility/evidence | AC-4 has neither a pinned old/new runtime test nor a stated observable loud failure path. Claim failure is captured only as `daemon_event_error`. | Run both pinned skew pairs; assert one delivery/no double ack, or assert a user-observable mismatch failure and retained queue body. Attach the receipts. |

## E) Detailed findings

### F001 — asynchronous claim can cross a seat replacement (HIGH)

`boot()` replaces `this.self` at line 101. The event callback accepts a frame for the then-current seat and queues `consumePushed()` at lines 106-118. `consumePushed()` awaits `claimInbox(this.self)` at line 186, then invokes the current `PijSession` and acknowledges using `this.self` at lines 199-202.

Concrete failure scenario:

1. Seat A receives `message.pushed`; the callback starts `claimInbox(A)`.
2. Before that HTTP request resolves, the same extension handles `session_start` with `reason: "new"` or `"fork"`; `boot()` replaces `this.self` with B.
3. The pending request returns A's claimed row. `session.onInbound()` now injects its body into the new session B; `ackInbox(B, jobId)` then terminally acknowledges A's row.
4. The daemon acknowledgement endpoint intentionally derives the recipient solely from `job_id`, not `request.seat` (`crates/daemon/src/http/mod.rs:795-836`), so B's supplied seat does not stop the acknowledgement.

The existing successor test proves A and B differ, but it runs after the event handling has settled (`rust-runtime.test.ts:228-246`). None of the four focused tests holds a claim request across that replacement (`:249-290`). This is a real misdelivery and loss for A, not a style concern.

### F002 — skew compatibility is asserted, not proved (MEDIUM)

The static direction is favourable: the daemon `message.pushed` fields are unchanged (`crates/daemon/src/delivery/mod.rs:462-485`) and the new extension calls the established inbox claim/ack paths. But the acceptance criterion requires both directions to be tested and any failure to be loud. The only new extension compatibility inputs are a local event literal and a shared claim fixture; neither runs a pinned old daemon or old extension. A claim error is caught into `daemon_event_error` (`rust-runtime.ts:111-118`) rather than surfaced to the recipient. The supplied live transcript explicitly records only AC-1, AC-3, and an unavailable AC-5 (`live-delivery-transcripts.md:3-89`).

## F) Coverage map

| AC | Review result | Evidence | Confidence |
| --- | --- | --- | --- |
| ac-1 | Documentary pass; regression risk F001 remains | One unique injected marker in the supplied pane excerpt; matching queue row is `done`, worker is the recipient, and `acked_at` is populated. | 80% |
| ac-2 | Documentary pass | Supplied pre-fix pane excerpt contains the unique body and pointer; queue row remains pending. Source/binary parity is explicitly disclaimed. | 70% |
| ac-3 | Documentary pass | `--no-extensions` client uses daemon inbox and prints the full unique body; matching queue row is terminally acknowledged. | 80% |
| ac-4 | Not proven | Static interface inspection only; no old/new pair receipt or loud failure test. | 20% |
| ac-5 | Explicitly unavailable, as allowed | Transcript identifies the uncommitted moving s122 branch and withheld SHA. | N/A |
| ac-6 | Current review pass | `pij-gate` green; `harness checks` green. | 100% |

**Evidence provenance**: F001 and the nominal ordering/empty-claim/fixture conclusions were verified directly from current source and focused tests. AC-1 through AC-3 and AC-5 are coder-supplied retained transcripts reviewed for the stated markers and queue fields; I did not re-run their live OMP scenarios.

## G) Commands executed

```bash
harness docs the-harness-distilled
harness boot                         # timed out after 120 seconds; observation recorded as DL-003
harness observe "harness boot exceeded 120 seconds during read-only s123 review; no concise readiness verdict" --kind difficulty
CARGO_INCREMENTAL=0 ~/.cargo/bin/cargo run --locked -p pij-testkit --bin pij-gate
just test .pi/extensions/pij/adapters/rust-runtime.test.ts
harness checks
git diff --find-renames main...HEAD
git show --format= --find-renames f6a28cf6
git show --format=fuller --name-status f6a28cf6
```

## H) Handover brief

**Review result**: REQUEST_CHANGES.

**Files reviewed**:

| File | Status | Action needed |
| --- | --- | --- |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s123-one-message-one-delivery/.pi/extensions/pij/adapters/rust-runtime.ts` | F001 HIGH | Fence asynchronous pushed-event claims against session replacement. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s123-one-message-one-delivery/.pi/extensions/pij/adapters/rust-runtime.test.ts` | Incomplete coverage | Add a delayed claim + `new`/`fork` replacement test. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s123-one-message-one-delivery/crates/daemon/src/delivery/mod.rs` | Guarded | No code defect found; existing guards remain meaningful. |
| `/Users/jordanknight/pi-hacking/pij-worktrees/s123-one-message-one-delivery/crates/daemon/tests/fixtures/inbox-claim.wire.json` | Guarded | Both runtimes consume this fixture. |

**Required fixes**:

1. Bind each accepted pushed event to its originating seat/session generation. Do not inject or acknowledge its claim after that identity becomes stale; leave the row recoverable.
2. Add a deterministic delayed-claim test covering A → B replacement before the claim response.
3. Produce and attach two pinned runtime-skew receipts, including the promised observable loud failure case if a supported pair cannot interoperate.

The harness boot timeout was recorded as observation `DL-003`; `harness checks` later supplied the full green sensor inventory.
