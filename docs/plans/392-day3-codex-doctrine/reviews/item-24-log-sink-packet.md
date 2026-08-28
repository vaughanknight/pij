# Cold-review packet — item-24 log-sink fold

**Candidate**: `65560901e78a652dec593c38c6a7f6d9d58ac122` (`fix(telegram): persist in-process bridge logs`)
**Fold target**: item-24's PR (o-prime ruling 2026-08-28 00:2xZ — same PR as the bubblesHash chain).
**Files**: `.pi/extensions/pij/telegram/index.ts` (+70/-26), `.pi/extensions/pij/telegram/index.test.ts` (+63), `docs/plans/392-day3-codex-doctrine/tasks/item-24-log-sink/MUT-LOGSINK.patch`.

## The gap this closes (grounded)
Since item 29, `~/.pij/telegram-bridge.log` was the STANDALONE bridge's log only (mtime frozen at 20:53Z "SIGTERM"). The in-process supervised bridge (`autoStartBridgeForDaemon` :527, `bridgeSupervisorForDaemon` :545) built `runtimeFor(pijHome, log)` with the daemon PANE-only logger, so forwardOne's `forwarded <id> part x/N` / `forward error (<id>)` / `queue consumer error (<id>, attempt N): ForwardIncomplete` lines never reached the durable file. Only `telegramStart` (:654) teed. Encoded as E42/E43 (negative log claim names file+mtime+id-range; peer count verified by ids).

## The fix
New `bridgeFileLog(pijHome, baseLog)` helper (:328): appends `[pij-telegram] <message>\n` to `telegram-bridge.log` synchronously, then calls `baseLog`. Wired into BOTH in-process paths:
- `autoStartBridgeForDaemon` — wraps `log` → `bridgeLog`, builds deps via new `daemonBridgeDepsFor` factory.
- `bridgeSupervisorForDaemon` — wraps `callbacks.log` → `bridgeLog`, used by runtime (`buildRuntime`), `onStart`, AND the supervisor's own `log:` (restart/failure notes).
- `telegramStart` deduped onto the same helper (stdout as baseLog) → format parity.
No double-append: runtime-log and supervisor-log are distinct call sites; each `bridgeLog` call appends once + baseLog once.

## Acceptance — T-LOG1 (index.test.ts:681, behavioural)
Matches the o-prime's accepted test verbatim. Drives the REAL `autoStartBridgeForDaemon`; overrides ONLY offline `loadConfig` (chatId 555) and `runBot` (inject a deterministic 400 for body containing "persistent failure", success otherwise). Real `SqliteQueue`, real `queue.deliver`, real forwarding. Seeds the log with mtime=1000ms baseline. Asserts the durable file contains `forwarded <id> part 1/1`, `forward error (<id>)`, `queue consumer error (<id>, attempt 1): ForwardIncomplete`; mtime advances past baseline; AND the daemon callback still receives logs (baseLog path un-regressed).

## MECHANICAL ORACLE (E37) — run it
`docs/plans/392-day3-codex-doctrine/tasks/item-24-log-sink/MUT-LOGSINK.patch` removes ONLY the `appendFileSync` tee line inside `bridgeFileLog`, PRESERVING `baseLog(message)`.
```
git apply <patch>   → T-LOG1 REDs at index.test.ts:721 (waitFor ForwardIncomplete in file never holds)
git apply -R <patch> → GREEN
```
Because baseLog is preserved, the daemon-callback assertion still passes under the mutant → T-LOG1 senses FILE PERSISTENCE specifically, not generic logging.

## E40 uniqueness (verified mechanically, not asserted)
`bridgeFileLog` is NEW in this commit. Under the mutant, the FULL telegram suite fails **exactly 1 test** — T-LOG1 — 28 pass, 1 (`.skip`). The tee line is driven by NO pre-existing test; the covering test for the mutated line is T-LOG1 alone (the required "none" prior-coverage line). Pre-existing daemon auto-start tests assert `startBridge`/`runBot` call counts, not file content, and stay green.

## Orchestrator cheap-look (already run — reproduce to confirm)
- Load-bearing hunk read: factoring sound, no double-append. ✓
- Baseline T-LOG1 GREEN → MUT-LOGSINK RED@:721 → revert GREEN (authoritative). ✓
- Full-suite mutant → exactly {T-LOG1} red (E40). ✓
- Gates: `just typecheck` clean; `biome check` (2 changed files) clean. ✓

## Review asks
1. Reproduce the oracle (apply→red@:721, revert→green) and the E40 full-suite-mutant (exactly 1 red).
2. Confirm no double-append path exists (supervisor log vs runtime log distinct call sites).
3. Confirm `telegramStart` dedup preserves the exact prior format (`[pij-telegram] <msg>\n` + stdout).
4. Confirm T-LOG1 drives the REAL in-process runtime (only config/runBot overridden — no stubbed forward path).
5. Post-restart LIVE proof (mtime advances on first forwarded message; first attempt-2 row carries its attempt-1 error line in the file) remains with the orchestrator after restart #6 — NOT a blocker for this fold's APPROVE.

Verdict artifact → `reviews/item-24-log-sink-verdict.md`. No APPROVE without a sha-verified RED→restore→GREEN.
