# Item-24 log-sink — hardening fold (B1 blocking + B2 + W3)

**Base**: 65560901e78a652dec593c38c6a7f6d9d58ac122 (log-sink fold; CONDITIONAL APPROVE, `reviews/item-24-log-sink-verdict.md`). Build on the coder's item-24-chain tree (T-LOG1's success-line format depends on item-24 bridge.ts b1f0e0a — A3; do NOT try to green these tests on bare main).
**Files**: `.pi/extensions/pij/telegram/index.ts`, `.pi/extensions/pij/telegram/index.test.ts`, and (B2/W3) `.pi/extensions/pij/daemon.ts` / `daemon.test.ts` as needed.

## B1 — BLOCKING: the durable tee must never crash the daemon
`bridgeFileLog` (index.ts:328-336) calls `appendFileSync(logPath, …)` at :334 UNGUARDED, BEFORE `baseLog(message)` at :335. A file error (read-only / ENOENT dir) throws, is caught by queue-consumer's OUTER crash-guard catch (queue-consumer.ts:56-57) whose own `log()` then throws again — nothing above it → **process exit**, on the daemon supervising Vaughan's phone channel. Violates index.ts:421-423 ("must NEVER crash the daemon"). Reviewer MEASURED: read-only log file → delivered FALSE, process CRASHED; attributed exclusively to this line via MUT-LOGSINK (tee removed → same scenario delivers fine).

**Fix** (ruling — report-once):
1. Call `baseLog(message)` FIRST (a file failure must never suppress the pane log).
2. Wrap `appendFileSync` in try/catch; a tee failure NEVER propagates.
3. On the FIRST catch only, emit one warning via `baseLog` (e.g. `telegram-bridge.log tee failed (<err.message>); durable log degraded, continuing`), then set a module/closure latch so subsequent failures are silent (no human-channel spam). Report-once.

**Oracle** (save under `tasks/item-24-log-sink/`, RUN each):
- `MUT-TEE-UNGUARDED.patch` — remove the try/catch. Must RED a behavioural test: a read-only (chmod 0444) or ENOENT-dir log path → delivery still SUCCEEDS (row acked) AND the pane log still receives the line AND the process does not exit. Revert → GREEN.
- `MUT-REPORT-ONCE.patch` — remove the latch (warn every time). Must RED a test asserting the tee-failure warning appears EXACTLY once across ≥2 failing forwards. Revert → GREEN.

## B2 — MAJOR: sensor the PRODUCTION path, not the unused one (E34)
Production is `bridgeSupervisorForDaemon` (daemon.ts:1776). T-LOG1 drives `autoStartBridgeForDaemon`, which has NO production caller. Reviewer: MUT-SUPERVISOR-UNWIRE (reverts both supervisor wirings = restores the exact bug this fold fixes) is SILENT (full suite identical to baseline). The fix IS correct on the supervisor path — only untested.

**Fix**: thread `DaemonBridgeOverrides` through `bridgeSupervisorForDaemon` → its `startDeps` closure → `daemonBridgeDepsFor` (which already accepts overrides), mirroring `autoStartBridgeForDaemon`. Add a test (T-LOG1-SUP) that drives the REAL `bridgeSupervisorForDaemon` (offline loadConfig + runBot override only, like T-LOG1) and asserts the same durable-file lines.
**Oracle**: `MUT-SUPERVISOR-UNWIRE.patch` (revert both supervisor wirings) must RED T-LOG1-SUP. Revert → GREEN. E40: name the covering test for each line the wiring touches — the supervisor `bridgeLog` wiring must be a line no prior test drove.

## W3 — capture must include the bridge log (o-prime ruling: rides item-24 PR)
Reviewer measured: a bad `pijHome` for the bridge-log tail makes the daemon capture silently LOSE the bridge log (99→58 bytes, evidence TRUE→FALSE) while the notice still looks healthy. With the log-sink now writing `telegram-bridge.log`, add an assertion that a daemon capture INCLUDES the bridge-log evidence.
**Oracle**: a mutant that breaks the tail path (bad pijHome / tee disabled) must RED that capture-includes-bridge-log assertion. Revert → GREEN.

## Gates + deliverable
- `just typecheck` 0; `biome check` clean on changed files; `npx vitest run .pi/extensions/pij/telegram/ .pi/extensions/pij/daemon.test.ts` GREEN.
- E40 ledger: for every mutant, name the covering test per touched line; ≥1 must be "none".
- Commit on top of 65560901 in YOUR OWN build worktree (NOT the shared stream worktree — COORD-010; explicit pathspec). Report the new candidate sha + every mutant result (RED line + restore GREEN).

## Out of scope (deferred, surfaced to o-prime)
- A4 unbounded growth / rotation: the daemon reader uses `.slice(-4096)` so retention beyond 4KB is inert; rotation is a separate follow-up (24b or a rotation item), NOT this fold.
- Concurrency (standalone + in-process both appending one file): reviewer flagged untested; note as a known gap, not folded here unless trivial.
