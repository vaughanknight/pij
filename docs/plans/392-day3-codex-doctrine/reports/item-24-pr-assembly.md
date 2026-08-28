# Item-24 PR — assembly recipe & gates

**Build rule**: E35 — cherry-pick onto a FRESH-from-main worktree (separate `git worktree add`, `npm ci`, node_modules), two green runs with logs persisted per E22. Held until all folds below are cold-reviewed (mutant-gated).

## Contents (in order)
1. **bubblesHash chain**: a27ab58 → 6641943 → 588dd0e → a6151aa → b1f0e0a → d42fc5b
2. **Log-sink fold**: 65560901e78a652dec593c38c6a7f6d9d58ac122
   - Cold review IN FLIGHT → pij-wilful-morton (`reviews/item-24-log-sink-packet.md`, oracle MUT-LOGSINK).
   - Orchestrator oracle already RUN authoritatively: RED@index.test.ts:721 → GREEN; E40 exactly-1-red.
3. **W3 assertion fold** (o-prime ruling 2026-08-28 #2): behavioural assertion that a bad `pijHome` makes the capture LOSE the bridge-log evidence (reviewer-measured 99→58 bytes, evidence TRUE→FALSE; `daemon.ts:254` uses pijHome for the bridge-log tail).
   - NOT YET BUILT. Dispatch as a fold on top of the log-sink candidate AFTER the log-sink verdict returns and the coder frees from the 29b W1+W2 fold.
   - Must ship mutant-gated (a bad-pijHome mutant that REDs the new assertion; the operator-diagnostic silent-loss is the human-channel path) + its own cold review.

## Gate order
- [ ] log-sink verdict APPROVE (in flight)
- [ ] W3 fold built (coder) → oracle run → cold review APPROVE
- [ ] fresh-from-main worktree; chain + 65560901 + W3 cherry-picked; two green runs (logs persisted)
- [ ] then open PR

## Pre/post yardstick
Live-acceptance baseline (pre-fix): `reports/item-24-live-acceptance-baseline.md` — attempt-2 rate ~29%, NOT length-correlated; post-restart-#6 comparison over ≥1 h.

## Base pin (updated 2026-08-28)
Base the item-24 PR on **main @ ae7356b** (post-PR#30 merge; o-prime ruling). Restart #6 is gated on item 24 alone.

## Build intel (pre-staged 2026-08-28, ancestry checked)
66d0acd's git ancestry is NOT a clean item-24 chain — it interleaves docs commits AND the 29b deps fold (5b77c99, already on main via PR #30). Do NOT cherry-pick a range. Cherry-pick ONLY the 8 item-24 CODE commits individually, in order:
  a27ab58, 6641943, 588dd0e, a6151aa, b1f0e0a, d42fc5b, 65560901 (log-sink), 66d0acd (hardening)
Expect conflicts in daemon.ts / daemon.test.ts: 29b (now on main, post-W1+W2 + my union-resolution) and item-24 both touch them. In particular W3 (66d0acd, daemon.test.ts +3) augments the SAME test main already has post-29b ("notifies every pij-telegram watcher instead of inferring one prime owner", ~daemon.test.ts:234). Resolve union/incoming as with the 29b PR; final tsc must be 0.
telegram/index.ts + index.test.ts changes are item-24-local (less conflict risk vs main).
All 8 commits confirmed reachable. Base: fresh origin/main (>= ae7356b; 1342384 adds only a gov doc).
