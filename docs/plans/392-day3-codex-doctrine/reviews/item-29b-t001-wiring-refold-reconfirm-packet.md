# 29b-T001 wiring RE-FOLD — re-confirm (cold, mechanical oracle per E37)

**Candidate**: `277377142864cb57c9cb6e772b1f328517865908` — chain 816a726 → 87a0c13 → ad32ecb → 2773771. **Cherry-pick onto FRESH main; union+drop-resolve daemon.test.ts imports** (keep main's tests + 29b-T001's; drop createBridgeRestartNotifier, keep createDaemonRegistry). Full-suite on the PR worktree (E35). **Write to** `reviews/item-29b-t001-wiring-refold-reconfirm.md`.
**This is a REAL extraction (not the ad32ecb rename)**: runDaemon now calls `notifyOwner: wireBridgeRestartNotifier({...})` DIRECTLY (daemon.ts:1773) — the call site IS the tested factory.

## MECHANICAL ACCEPTANCE (RUN it, don't read — E37)
- `MUT-WIRING.patch` (committed in the packet) reintroduces the call-site single-prime gate.
- With the source-pin grep present or DELETED: `git apply MUT-WIRING.patch` → the behavioural wiring test RED (@daemon.test.ts:228, 0 notices vs 1); `git apply -R` → GREEN, pristine.
- Orchestrator ran this: patch applied, behavioural test 1 FAILED, `-R` restored to pristine sha. CONFIRM on disk yourself.

## Dim-0 (sha-verify RED→GREEN; RUN each)
- **MUT-WIRING** (the patch): applied ⇒ behavioural test RED **even with the source-use pin deleted** (prove the behavioural test alone catches the call-site regression — the whole point vs ad32ecb).
- **MUT-HONESTLOG-CATCH** (claimed daemon.test.ts:296): revert the unparseable-JSON catch to "(0 entries rejected)" ⇒ RED (ADV-2 now honest+sensored — the catch branch was the unsensored gap).

## Dim-1
1. The EXTRACTION is real: `notifyOwner: wireBridgeRestartNotifier({...})` is the ONLY thing on that path — no untested intermediate. The behavioural test drives THAT factory with 3 primes + 1 watcher → notice reaches the watcher, primes not. Confirm a call-site single-prime re-intro (MUT-WIRING) reds it without the grep.
2. ADV-3: daemon.ts now imports the EXPORTED isWatcher (watchdog-store.ts), not a hand-copy — no schema-drift misattribution; the "N dropped, M malformed" accounting preserved.
3. ADV-2 catch: the unparseable-JSON path now logs honestly (not the old hardcoded "(0 entries rejected)") and MUT-HONESTLOG-CATCH pins it.
4. No collateral (E17): vitest list + line-diff on daemon.test.ts (after resolving the cherry-pick).
5. ADV-4 (weak prime assertions) is OUT (→ 29b-rest) — confirm it's not silently relied on.

Report verdict + the 2 mutation results + Dim-1. Then I run two green full runs on the PR worktree → 29b-T001 PR.
