# Item 30 — C1/C2/C3 close-out (CONDITIONAL APPROVE conditions)

**Base**: c0a8798 (item 30; cold review CONDITIONAL APPROVE — `reviews/item-30-dead-routing-verdict.md`). Build on your item-30 worktree (2 commits on main 7117164). Rebase onto latest origin/main.

## C1 — BLOCKING: the guidance command is WRONG (human channel dead-end)
When Vaughan's message reaches the bridge and resolves to NOBODY, the sole recovery instruction (bridge.ts:64) says `pij watch pij-telegram`. But routing reads the WATCHDOG roster (bridge.ts:187, `FsWatchdogStore(...).read(TELEGRAM_PEER_ID).watchers`) — the same store 29b's bridge-restart notifier uses. Reviewer proved `pij watch pij-telegram` is the file-watch feature (treats pij-telegram as a glob, E-NOID) and can NEVER populate that roster → the message-lost loop repeats forever.
**Fix**: change the guidance string to the command that populates the watchdog watcher roster + update the 2 asserting tests (bridge.test.ts:577, index.test.ts:446).
**PENDING O-PRIME RULING on the exact command** (escalated — it contradicts orient-local's `pij watch pij-telegram`). Orchestrator recommendation: `pij watchdog watch pij-telegram`. Use the o-prime-confirmed command (I will relay). Do NOT ship C1 with `pij watch`.

## C2 — MAJOR (test gap): media pre-download recheck UNSENSORED
bridge.ts:468 (the recheck before media download/delivery) has no test driving it. A mutation removing it stays at EXACT baseline 228, yet the measured harm is a real attachment notice QUEUED TO A DEAD SEAT with NO reply to the operator — "dead → gone, never queued" failing SILENTLY on the one unsensored path.
**Fix (test-only)**: add a test — a target alive at resolution but dead before media download → NOTHING downloaded, NOTHING queued, operator gets "gone" (names the seat). Save `MUT-MEDIA-RECHECK.patch` (remove/skip the :468 recheck) under `tasks/item-30-dead-routing/`; it must RED the new test. Revert → GREEN.

## C3 — MODERATE (test gap): address pre-selection recheck UNSENSORED
bridge.ts:409 (recheck before the "Now addressing X" reply) unsensored — a mutation stays at baseline; harm is the bot claiming "Now addressing <seat>" for a seat that just died (false liveness; /tail points at a corpse).
**Fix (test-only)**: add a test — target dies between resolution and the address-ack → no false "Now addressing" for a dead seat. Save `MUT-ADDRESS-RECHECK.patch` (skip the :409 recheck); must RED it. Revert → GREEN.

## Advisories (fold if cheap; else note)
- Tie-break: bridge.ts:174 sorts by addedAt (newest first), but an EXACT addedAt tie falls to roster order, not a defined "most recent" (spine-29003 said "most recent"). Minor; note it. If cheap, make the tie deterministic.
- Dead code: last-speaker map at index.ts:181/193/231 is now inert (populated, unused). Remove if trivial.

## Gates + deliverable
tsc 0, biome clean, telegram fence GREEN. RUN every mutant (E37: apply→RED@line→revert→GREEN). E40: covering test per touched line (C2/C3 close the mutation-coverage gap the reviewer found at :409/:468). Commit on c0a8798 in YOUR worktree (COORD-010, pathspec). Report new sha + all mutant results. This is the LAST PR before the restart-6 baton — priority.
