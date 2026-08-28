# 31b — Subtree-aware legacy stall detection

**Item id / stream at handover:** 31b · s391-day3-core  
**Status at v0.2.0 (tag `d120c53`, 2026-08-28 05:2xZ):** designed, not started; no subtree helper or acceptance test exists at the tag (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:1-20`; `d120c53:.pi/extensions/pij/daemon.ts:1199-1206`).  
**Size estimate:** S, 2-4 hours; one production clause/helper, one focused test matrix, docs, and gates (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:15-22`). · **Order / dependencies:** after Item 34; retain Item 31's interval-aware threshold and Item 16's parent/spawner precedence (`docs/plans/391-day3-core/rulings.md:155-158`; `d120c53:.pi/extensions/pij/core/daemon/watchdog-manager.ts:367-374`; `d120c53:.pi/extensions/pij/core/binding.ts:296-317`).

## 1. Why this exists (the observed failure, with evidence)

- At 04:3xZ, `⏸ pij-falling-outside has gone quiet (stalled — no activity past the stale threshold)` was delivered while its coder `pij-remote-falcon` was actively working with fresh events; an orchestrator waiting for its child is silent by design, not stalled (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:1-6`; `docs/plans/391-day3-core/rulings.md:155-156`).
- At tag `d120c53`, the legacy detector asks only whether the parent descriptor is `working` and older than its own threshold, then immediately persists `failureReason:"stalled"` and sends the notice (`d120c53:.pi/extensions/pij/daemon.ts:1199-1214`).
- The production tick invokes that detector after observing and persisting the current seat but without passing any child context (`d120c53:.pi/extensions/pij/daemon.ts:920-925`).
- Item 31 already fixed the per-seat threshold: `staleAfterMsFor(id)` returns at least 60 seconds and respects longer configured intervals; Item 31b must add subtree evidence without weakening that rule (`d120c53:.pi/extensions/pij/core/daemon/watchdog-manager.ts:367-374`; `d120c53:.pi/extensions/pij/daemon.test.ts:1979-2025`).

## 2. What is ruled (design / spec)

- The governing rule is: **a working parent with any active direct child is not legacy-stalled** (`docs/plans/391-day3-core/rulings.md:155-156`; `docs/plans/391-day3-core/391-day3-core-plan.md:703-717`).
- A qualifying child is one hot-registry row whose `parentId` is the parent, or whose `spawnedBy` is the parent only when `parentId` is absent; the child must be `state === "working"` with `lastEventAt` younger than that child's own `staleAfterMsFor(child.id)` (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:5-7,18-19`; `d120c53:.pi/extensions/pij/core/binding.ts:296-317`).
- The check is deliberately one level only; grandchildren do not suppress the parent (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:7`).
- The hot list already held by the tick is the only input; no archive read and no second registry scan may be added (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:6-7,19`; `docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/review-brief.md:4`).
- This is a one-directional safety interlock: it can only suppress a parent stall when fresh child evidence exists; removing it produces the same notices or more, never a different positive action (`docs/plans/391-day3-core/391-day3-core-plan.md:703-717`).
- The watchdog-derived unanswered-nudge path and `systemStateOf` remain unchanged (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:7`; `docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/packet-addendum.md:10`).

## 3. Where the code is (at tag `d120c53`)

| Surface | Current behavior at `d120c53` | Required change |
|---|---|---|
| `.pi/extensions/pij/daemon.ts:920-925` | The bound-seat tick calls `pushWholeLifeTransition(current)` after activity and compact handling. | Pass or reuse the tick's hot registry snapshot so subtree evaluation adds no I/O. |
| `.pi/extensions/pij/daemon.ts:1184-1222` | `pushWholeLifeTransition()` computes `stalled = isWorking && staleAge` from the current seat alone, latches once, persists `failureReason`, and routes the notice. | Add `hasActiveChild(parent, hotList, nowMs)` and gate only the legacy stalled branch. |
| `.pi/extensions/pij/core/daemon/watchdog-manager.ts:367-374` | `staleAfterMsFor(id)` applies the 60-second floor or the seat's longer interval. | Read only; reuse it for each candidate child's freshness. |
| `.pi/extensions/pij/core/binding.ts:296-317` | `noticeRecipient()` establishes `parentId ?? spawnedBy` precedence and the hot-registry liveness vocabulary. | Mirror the same parent-first relationship when identifying direct children. |
| `.pi/extensions/pij/daemon.test.ts:1979-2025` | Existing tests pin the long-interval and no-sidecar legacy thresholds. | Keep these green while adding subtree fixtures on both sides of the child threshold. |
| `.pi/extensions/pij/daemon.test.ts:2055-2089` | Existing tests drive the real daemon stall notice and parent/spawner routing. | Extend this harness; do not settle for a pure helper-only test. |
| `docs/how/pij-watchdog.md` | Documents the Item 31 interval-aware stall threshold. | Add the one-level active-child suppression and its limits (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:11-14`). |

## 4. Acceptance (behavioural, mechanical)

- Add `daemon.test.ts` coverage named `suppresses a parent stall while a direct child is working and fresh`; parent is working with an event three minutes old and a 60-second interval, child is working with an event ten seconds old, and the test asserts no notice, no parent `failureReason`, and one suppression log naming the child (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:18`).
- In the same real-daemon harness, prove child `idle` does not suppress, child `working` but five minutes stale does not suppress, `spawnedBy` fallback does suppress when `parentId` is absent, and an equally fresh child of another parent has no effect (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:18`).
- Pin the suppression log to one line per suppression episode, not one line per tick, while retaining the existing one-notice-per-stall latch (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/review-brief.md:4`; `d120c53:.pi/extensions/pij/daemon.ts:1205-1214`).
- `MUT-SUBTREE-BYPASS`: remove `&& !hasActiveChild(...)` from the future stalled expression beside `d120c53:.pi/extensions/pij/daemon.ts:1202-1206`; the fresh-working-child case must go RED.
- `MUT-CHILD-FRESHNESS`: at the future helper inserted beside `d120c53:.pi/extensions/pij/daemon.ts:1199-1206`, accept any `state === "working"` child regardless of `lastEventAt`; the five-minute-stale-child case must go RED.
- `MUT-CHILD-SPAWNER-FALLBACK`: at that same `d120c53:.pi/extensions/pij/daemon.ts:1199-1206` insertion seam, ignore `spawnedBy` when `parentId` is absent; the spawnedBy-only child case must go RED.
- `MUT-CHILD-FOREIGN-PARENT`: at that same `d120c53:.pi/extensions/pij/daemon.ts:1199-1206` insertion seam, ignore the relationship check; the unrelated-parent case must go RED.
- `MUT-SUBTREE-ARCHIVE`: replace the hot list with `listTerminal()` or add a second registry read; a source assertion or counted fake must go RED (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/review-brief.md:4`).
- `MUT-SUPPRESSION-LOG-LATCH`: bypass the future suppression latch beside `d120c53:.pi/extensions/pij/daemon.ts:1205-1214`; the repeated-tick log-count assertion must go RED.
- Re-run the existing AC-29 threshold cases so the subtree clause cannot accidentally revert Item 31 (`d120c53:.pi/extensions/pij/daemon.test.ts:1979-2025`; `docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/review-brief.md:4`).
- Gates are two fresh merge-product full-suite runs, `just typecheck`, `just pij-skill-check`, scoped Biome, and retained full logs (`docs/handover/v0.2.0/README.md:7-11`; `docs/handover/v0.2.0/TEMPLATE.md:16-19`).

## 5. Live verification (after a daemon restart carrying it)

- The implementation packet requires no live-daemon proof from the coding seat; the o-prime owns restart and live verification (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/packet-addendum.md:3-5,10-11`; `docs/handover/v0.2.0/README.md:10-11`).
- For passive verification after the restart, record `date -u`, then run `pij state <parent> --json` and `pij state <child> --json`; while the direct child is `working` and fresh inside its own threshold, the parent must not gain `failureReason:"stalled"` and its creator must receive no `gone quiet` notice (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:3,18`).
- After every direct child becomes idle or stale beyond its own threshold, the parent's existing stalled transition must fire once; inspect the recipient's durable rows with `pij queue --to <recipient> --all --json` by message id rather than relying on pane absence (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:18`; `docs/handover/v0.2.0/README.md:17`; `d120c53:.pi/extensions/pij/cli.ts:812-897`).
- Failure is either a false positive while a fresh child works, a false negative after the subtree is quiet, repeated suppression logs every tick, or any archive access added to the hot path (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/review-brief.md:4`).

## 6. Risks / gotchas that already bit us

- **E34 — a sensor proves exactly the layer it drives:** use the real daemon tick and notice delivery, not only `hasActiveChild()` in isolation (`docs/handover/v0.2.0/README.md:15`; `d120c53:.pi/extensions/pij/daemon.ts:920-925`).
- **E40 — mutate the new clause itself:** a RED in old threshold code does not prove subtree coverage (`docs/handover/v0.2.0/README.md:15`; `docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/review-brief.md:4`).
- **E35/E22 — fresh merge product and full logs:** long-lived-worktree results can misattribute another stream's daemon changes (`docs/handover/v0.2.0/README.md:16`).
- **E42/E43 — absence needs bounded evidence:** prove no notice by querying the exact recipient/message ids and prove freshness from timestamps, not a pane excerpt or aggregate count (`docs/handover/v0.2.0/README.md:17`; `docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:18`).
- **E45 — production adapters matter:** the acceptance case must use the daemon's hot registry path and `staleAfterMsFor`, not a parallel test-only model (`docs/handover/v0.2.0/README.md:18`; `d120c53:.pi/extensions/pij/core/daemon/watchdog-manager.ts:367-374`).

## 7. Open questions for the human

- With multiple fresh working children, should the one-per-episode suppression log name the first deterministic child, list a bounded sample, or report only a count? The ruling requires “one log line naming the child” but does not define multi-child rendering (`docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/tasks.md:18`; `docs/plans/391-day3-core/tasks/phase-18-item-31b-subtree-stall/review-brief.md:4`).
