# Item 30 — dead-routing / prime-resolution — COLD REVIEW packet

**Candidate**: c0a879877704aef6baf93bc5961d937dfdd53426 (2 commits on current main 7117164: 8733724 impl + c0a8798 last-speaker test retirement). Branch: coder's item-30 worktree.
**Why cold review**: fresh routing logic on the human channel (who receives Vaughan's messages). Not a reviewer-prescribed fold — independent verification required.

## What changed
- `bridge.ts`: inbound Telegram routing rewritten. swipe-reply → bubble sender (alive-checked); explicit address → that seat (alive-checked); bare non-reply → newest LIVE prime WATCHING pij-telegram (tie → most recent to bridge; none → guidance); every resolved target re-checked immediately BEFORE queue delivery; dead → "gone", NEVER queued. Last-speaker heuristic RETIRED.
- `bridge.test.ts`: new routing-case tests. `index.test.ts`: the old last-speaker integration case (was :416) rewritten to watching-prime semantics (orchestrator scope ruling — required by acceptance).

## Mechanical oracle (E37 — RUN each; orchestrator already ran authoritatively, results are the bar)
Baseline telegram fence = 228 passed | 2 skipped. Patches under `tasks/item-30-dead-routing/`.
- `MUT-PRIME-RESOLUTION-LASTSPEAKER` (bare → last speaker) → RED (3 tests: bridge.test.ts:515 + index.test.ts:411 + one more). Revert → GREEN. **This proves the retirement**: last-speaker ≠ watching-prime in the rewritten case.
- `MUT-ALIVE-CHECK` (skip the alive recheck) → RED (6 tests). Revert → GREEN.
- `MUT-DEAD-NEVER-QUEUED` (queue for a dead target) → RED (bridge.test.ts:609). Revert → GREEN.

## Review asks (independent verification)
1. **Each routing rule** resolves correctly and in the right PRECEDENCE (reply > explicit > bare); confirm with your own probes, not by re-reading my numbers.
2. **Alive-check is a real pre-delivery recheck** (TOCTOU): a target alive at resolution but dead at delivery → "gone", never queued (report cites a newly-dead pre-delivery race test at bridge.test.ts:596). Confirm the window is actually closed.
3. **bare → newest live prime watching pij-telegram**: verify "watching" = `pij watch` registration (not mere liveness), "newest" = most-recent-to-bridge tiebreak, and none-watching → guidance (not a silent drop, not a guess).
4. **dead → gone, never queued** on ALL paths (reply/explicit/bare), and "gone" names the seat.
5. **Last-speaker fully retired**: no code path or test still routes by last speaker; the index.test.ts:411 rewrite is genuinely sensored (MUT reds it).
6. **E40**: covering test per touched line; ≥1 = none. Report claims uncoveredTouchedProductionLines empty — verify.
7. **No collateral / no silent loss**: nothing that was delivered before is now dropped; every "not delivered" path is a visible "gone"/guidance, never a silent enqueue-to-dead or drop.

**Verdict artifact**: `reviews/item-30-dead-routing-verdict.md`. This PR is the LAST before the restart-6 baton (o-prime holds a ≤1 h ask), so a prompt verdict keeps item 24 + 30 on one restart.
