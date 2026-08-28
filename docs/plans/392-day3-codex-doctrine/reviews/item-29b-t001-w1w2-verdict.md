# 29b-T001 W1+W2 fold — stream verdict (orchestrator authoritative oracle)

**Candidate**: 34d189a949a441ecdf14bf9ef5d1a81397b36aba (= 5b77c99 + W1+W2), coder pij-remote-falcon, isolated worktree s392/29b-w1w2-falcon.
**No separate cold review**: this is the cold reviewer's OWN prescribed remedy (proven both directions in `reviews/item-29b-t001-deps.md`); the mutant-gate packet precondition is met by the saved patches + the orchestrator's authoritative RED→restore→GREEN run below.

## Commit scope (clean)
`git show --stat 34d189a` = daemon.test.ts (+4/-1) + MUT-CALLSITE-ARG.patch + MUT-LITERAL-BYPASS.patch. No stray files (COORD-010 pathspec-clean).

## The change (daemon.test.ts :331-335)
- Comment reworded to accurate (was: "The pathFor test above senses argument regressions" — false; now names that the pathFor test senses factory-internal args only, and this pins the call-site binding it cannot see).
- Retained old wrapping pin `toContain("notifyOwner: wireBridgeRestartNotifier(")` (:333).
- Added binding pin `toContain("bridgeNotifierDepsForDaemon(pijHome, registry, channel, log)")` (:334).

## Authoritative oracle (RUN by orchestrator in detached worktree @34d189a, node_modules linked)
Baseline: target test PASS (75 tests | 74 skipped by -t filter).
- **MUT-CALLSITE-ARG** (call site → `bridgeNotifierDepsForDaemon(join(pijHome, "nope"), …)`): target test **FAIL at daemon.test.ts:334** (new binding pin); :333 old pin PASSED (fails at first failing assert = :334). Revert → PASS.
- **MUT-LITERAL-BYPASS** (call site inlines `wireBridgeRestartNotifier({ … store: new FsWatchdogStore(join(pijHome,"nope")) … })`, bypassing the factory): target test **FAIL at :334**; :333 old pin PASSED (still contains `wireBridgeRestartNotifier(` — the weakness). Revert → PASS, tree clean.

**Discrimination proven**: under both mutations the OLD pin is blind (green) and the NEW pin reds — the new pin closes exactly the factory-bypass the fold's :332 weakening opened (W2) and the call-site arg gap the false comment claimed covered (W1).

## Gates (coder-reported, comment scope re-verified by orchestrator)
daemon.test.ts 73 passed / 2 skipped; typecheck 0; changed-file biome clean.

**Verdict: ready to include in the item-29b-T001 PR.** 29b-T001 chain HEAD = 34d189a.
