# 29b-T001 DEPS fold — cold review (mechanical oracle per E37/E40)

**Candidate**: `5b77c99f4d35330044ab3ed1637492d9accda836` — chain 816a726 → 87a0c13 → ad32ecb → 2773771 → **5b77c99**. Cherry-pick onto FRESH main; union+drop-resolve daemon.test.ts imports (keep main's + 29b-T001's; drop createBridgeRestartNotifier, keep createDaemonRegistry). Full-suite on the PR worktree (E35). **Write to** `reviews/item-29b-t001-deps.md`.

**What this fold fixes (the INS-005/E40 correction)**: the prior MUT-WIRING mutated the ALREADY-TESTED factory body — proved nothing new. This fold extracts the UNTESTED deps construction so a real mutant bites. `bridgeNotifierDepsForDaemon(pijHome, registry, channel, log)` (daemon.ts:221) returns the deps incl `store: new FsWatchdogStore(pijHome)` (:230); runDaemon's ONLY line on that path is `notifyOwner: wireBridgeRestartNotifier(bridgeNotifierDepsForDaemon(...))` (call site :1796).

## MECHANICAL ACCEPTANCE (RUN it, don't read — E37)
- `MUT-CALLSITE-HOME.patch` (committed at tasks/item-29b-bridge-advisories/) changes ONLY the store arg: `new FsWatchdogStore(pijHome)` → `new FsWatchdogStore(join(pijHome,"nope"))` (join imported daemon.ts:24, compiles).
- `git apply MUT-CALLSITE-HOME.patch` → the pathFor test REDs (daemon.test.ts:319 "constructs bridge notifier storage under the daemon pijHome"; asserts deps.store.pathFor("pij-telegram") === join(home,"pij-telegram","watchdog.json") — mutant resolves under <home>/nope); `git apply -R` → GREEN, pristine.
- Orchestrator cheap-look (READ, not run): the mutant hits :230; the ONLY driver of bridgeNotifierDepsForDaemon in the test file is that one new test (import :38, call :319); CONFIRM by RUNNING.

## E40 UNIQUENESS (the crux — verify yourself)
The mutant must lie in code NO PRE-EXISTING test drove. Before this fold the deps-construction/store-root line did not exist. The adjacent test "wires production restart notices through watchers…" (daemon.test.ts:~329) is a pure SOURCE PIN (reads daemon.ts text, asserts `notifyOwner: wireBridgeRestartNotifier(` substring), explicitly commented "wrapping form only. The pathFor test above senses argument regressions." So MUT-CALLSITE-HOME must RED the pathFor test and NOT the source pin. Confirm: apply the patch → exactly the pathFor test reds, the source-pin test still passes.

## Dim-1
1. The EXTRACTION is real: runDaemon:1796 passes bridgeNotifierDepsForDaemon(...) DIRECTLY into wireBridgeRestartNotifier — no untested intermediate (the old bridgeCaptures :1788/:1811 intermediate is gone). Confirm.
2. ADV log-path honesty: every no-watchers/malformed/empty/unparseable skip log now includes the RESOLVED sidecar path (store.pathFor result) so a wrong home cannot impersonate a correct no-watchers result. Confirm the 4 skip branches log the path.
3. No collateral (E17): `npx vitest list` count + line-diff on daemon.test.ts after resolving the cherry-pick (count is BLIND — do the list diff).
4. runDaemon itself remains UNBOOTED on this reconciled seam (documented, → 29b-rest runDaemon boot test). Confirm it is not silently claimed as covered.

Report verdict + the MUT-CALLSITE-HOME result (RED line + restore sha) + the E40 uniqueness result + Dim-1. Then I run two green full runs on the PR worktree → 29b-T001 PR.
