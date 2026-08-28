# 19 — Pointer rows park after bounded re-announcements

**Item id / stream at handover:** 19 · s391-day3-core  
**Status at v0.2.0 (tag `d120c53`, 2026-08-28 05:2xZ):** designed, not started; the tagged pointer path still leaves `attempt` unchanged (`docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:1-9`; `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:449-470`).  
**Size estimate:** S (CS 2), 2-4 hours (`docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:1-3,19-25`). · **Order / dependencies:** after Item 31b in the handover queue; preserve Item 1's retirement semantics, Item 5's pointer path, and the fixed `POINTER_LEASE_MS` (`docs/plans/391-day3-core/rulings.md:165-166`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:7-9`).

## 1. Why this exists (the observed failure, with evidence)

- The pointer path never calls `SqliteQueue.claim()`, which is the only tagged transition that increments `attempt`; it lists queued rows, types a pointer, then settles the row as injected without changing the count (`d120c53:.pi/extensions/pij/daemon.ts:1368-1444`; `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:423-470`).
- Lease recovery parks only when `attempt >= maxAttempts`; because pointer settlement leaves attempt at zero, an unread pointer returns to queued state every 90 seconds forever and never reaches the park threshold (`d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:491-510`; `d120c53:.pi/extensions/pij/core/daemon/loop.ts:55`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:3-8`).
- The existing dual-backend test explicitly preserves that current behavior: pointer delivery leaves the row injected and lease expiry re-announces it, while receipt attempts remain zero (`d120c53:.pi/extensions/pij/daemon.delivery.test.ts:550-588`; `d120c53:.pi/extensions/pij/adapters/sqlite-queue.test.ts:230-260`).
- The operational symptom was recorded as “pointer rows never park” in the s391 work order (`pij spine seq 26887`; `pij spine seq 27574`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:3-8`).

## 2. What is ruled (design / spec)

- Every pointer announcement counts as an attempt; after a bounded number N, the row transitions to `parked` with receipt detail `pointer-unread` (`docs/plans/391-day3-core/391-day3-core-plan.md:521-536`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:7-8,22-24`).
- `parked` remains open-but-stuck and therefore inspectable and retireable under Item 1; it is not silently dropped (`docs/plans/391-day3-core/391-day3-core-plan.md:523-534`; `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:9-16,39-42`).
- A recipient that reads on the second announcement must ack normally at attempt 2; the bounded retry rule must not change successful consumption (`docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:22-23`).
- `POINTER_LEASE_MS`, body-path behavior, receipt vocabulary before parking, and `SendOutcome` remain unchanged (`docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:7-9`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/packet-addendum.md:10-11`).
- The unresolved design choice is whether N reuses the body-path default of six or gets a pointer-specific constant; whichever is chosen must document why `N × 90 seconds` safely exceeds a long turn (`docs/plans/391-day3-core/391-day3-core-plan.md:523-531`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:22-24`).

## 3. Where the code is (at tag `d120c53`)

| Surface | Current behavior at `d120c53` | Required change |
|---|---|---|
| `.pi/extensions/pij/core/daemon/loop.ts:55,699-772` | Defines the 90-second pointer lease and renders/types `[pij from <from>] N new message(s) — run: pij inbox`; pointer delivery reports `via:"pointer"`. | Preserve line format, lease, composer guard, and `SendOutcome`; no retry policy belongs here unless the design requires a named shared constant. |
| `.pi/extensions/pij/daemon.ts:1368-1444` | Calls `recoverStaleClaims()`, lists only queued SQLite rows, drains them, then settles successful pointer delivery as injected with a lease. | Route the pointer settlement through the attempt-counting transition; keep body settlement unchanged. |
| `.pi/extensions/pij/adapters/channel-factory.ts:104-110,138-150` | `sqliteOf()` exposes the queue state machine under both `sqlite` and `dual`; `openChannel()` selects the configured backend. | Tests must use this seam so dual/default behavior remains covered. |
| `.pi/extensions/pij/adapters/sqlite-queue.ts:423-470` | `claim()` increments attempt; `settle()` changes state/lease but preserves the prior attempt. | Add `countAttempt:true` or a dedicated `announce()` transition for pointer sends. |
| `.pi/extensions/pij/adapters/sqlite-queue.ts:491-510` | Lease expiry requeues or parks at `attempt >= maxAttempts`, recording generic `lease-expired`. | Distinguish exhausted pointer announcements and record `parked` / `pointer-unread`. |
| `.pi/extensions/pij/adapters/sqlite-queue.ts:683-739` | `summary()` already exposes each row's `attempt`, state, lease, and receipt trail. | No new CLI field is needed; the corrected count must flow through existing output. |
| `.pi/extensions/pij/daemon.delivery.test.ts:550-588` | Existing dual-backend test proves pointer injection and one lease re-announcement. | Extend with bounded never-read and read-on-second-announce cases. |
| `.pi/extensions/pij/adapters/sqlite-queue.test.ts:230-260` | Existing tests prove body-path parking and explicitly note that `settle()` does not count. | Add pointer-specific transition and reason coverage beside these tests. |

## 4. Acceptance (behavioural, mechanical)

- Add `daemon.delivery.test.ts` case `parks an unread pointer after the ruled announcement budget` (the constant's name — `POINTER_MAX_ANNOUNCES` vs the shared `maxAttempts` — is § 7's open question; the test name must not presume it): use a real SQLite-backed channel, let a socketless bound seat ignore every pointer, advance beyond each lease, and assert attempts 1..N, final `parked` state, `pointer-unread` receipt, and no next-tick injection (`docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:22`).
- Add the paired case `acks normally after the second pointer announcement`: after attempt 2, consume with the production inbox method and assert `acked`, no later pointer, and no park receipt (`docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:22`).
- Add `sqlite-queue.test.ts` coverage for the selected API: pointer settlement increments exactly once per announcement, its injected receipt carries the incremented attempt, and expiry at N parks with detail `pointer-unread` (`docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:23`).
- `MUT-POINTER-NO-COUNT`: restore the no-increment SQL/update behavior at `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:451-469`; both pointer-attempt tests must go RED.
- `MUT-POINTER-BYPASS-TRANSITION`: restore the direct `sq.settle(seq, "injected", { leaseMs: POINTER_LEASE_MS })` call at `d120c53:.pi/extensions/pij/daemon.ts:1437-1444`; the daemon never-read case must go RED.
- `MUT-POINTER-PARK-THRESHOLD`: change `attempt >= max` at `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:491-509` to an off-by-one or never-park condition; the Nth-announcement test must go RED.
- `MUT-POINTER-PARK-REASON`: restore generic `lease-expired` for an exhausted pointer row at `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:491-510`; the receipt-detail assertion must go RED.
- `MUT-POINTER-ACK`: widen recovery beside `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:399-407,491-509` so an acked second-announcement row remains eligible; the read-on-second case must go RED.
- Gates are two green full extension runs at the merge product in a fresh worktree, `just typecheck`, `just pij-skill-check`, scoped Biome, and retained logs before teardown (`docs/handover/v0.2.0/README.md:7-11`; `docs/handover/v0.2.0/TEMPLATE.md:16-19`).

## 5. Live verification (after a daemon restart carrying it)

1. Under the shared-daemon freeze/restart procedure, create or select a disposable socketless tmux seat and send one ordinary text row; record its message id and starting queue row (`docs/handover/v0.2.0/README.md:7-11`; `d120c53:.pi/extensions/pij/core/daemon/loop.ts:699-772`).
2. Do not run `pij inbox` for that seat. After each 90-second lease, run `pij queue --to <seat> --all --json`; expect `attempt` to advance once per pointer and the pane to receive no more than N pointer lines (`d120c53:.pi/extensions/pij/core/daemon/loop.ts:55`; `d120c53:.pi/extensions/pij/cli.ts:812-897`).
3. After N, expect state `parked`, a final receipt detail `pointer-unread`, and no additional pointer on the next daemon pass; the row must remain visible and retireable (`docs/plans/391-day3-core/391-day3-core-plan.md:521-536`; `d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:491-510,683-739`).
4. Repeat with a second row, run `pij inbox` after pointer 2, and expect `acked` at attempt 2 with no park; failure is attempt staying zero, an N+1 pointer, silent deletion, or any body-path behavior change (`docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/tasks.md:22-24`).

## 6. Risks / gotchas that already bit us

- **E29 — silent loss outranks noisy duplicate:** exhausted pointer delivery parks visibly; it never retires or drops the body merely to stop notifications (`docs/handover/v0.2.0/README.md:14`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/review-brief.md:5-7`).
- **E34 — a sensor proves exactly the layer it drives:** adapter tests prove counting, while the daemon-delivery test must prove the production pointer call site uses it (`docs/handover/v0.2.0/README.md:15`; `d120c53:.pi/extensions/pij/daemon.ts:1368-1444`).
- **E40 — mutate the uncovered pointer hunk:** a RED in the already-covered body `claim()` path is not evidence for this item (`docs/handover/v0.2.0/README.md:15`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/review-brief.md:8`).
- **E35/E22 — fresh merge product and full logs:** retry timing is load-sensitive, so keep each red and both final green runs before deleting the worktree (`docs/handover/v0.2.0/README.md:16`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/review-brief.md:9`).
- **E45 — production adapter selection:** exercise `openChannel()`/`sqliteOf()` so the default SQLite and dual modes cannot silently diverge (`docs/handover/v0.2.0/README.md:18`; `d120c53:.pi/extensions/pij/adapters/channel-factory.ts:104-110,138-150`).
- The `attempt` field means an actual delivery attempt everywhere else; count it at the successful pointer announcement transition, not at lease recovery, or a crash between those events will lie about what the user saw (`d120c53:.pi/extensions/pij/adapters/sqlite-queue.ts:423-470`).

## 7. Open questions for the human

- Choose N: reuse body-path `maxAttempts = 6` for one shared retry budget, or introduce `POINTER_MAX_ANNOUNCES`; with the unchanged 90-second lease, six announcements span nine minutes (`docs/plans/391-day3-core/391-day3-core-plan.md:523-531`; `d120c53:.pi/extensions/pij/core/daemon/loop.ts:55`).
- Confirm whether manual `pij queue retire` is the only recovery from `parked`, or whether revive should requeue pointer-unread rows under the existing recipient-close guard; the plan says parked remains open and mentions revive interaction as a risk but does not decide it (`docs/plans/391-day3-core/391-day3-core-plan.md:523-531`; `docs/plans/391-day3-core/tasks/phase-8-item-19-pointer-park/review-brief.md:5-7`).
