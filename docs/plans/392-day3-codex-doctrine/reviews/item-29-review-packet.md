# Item 29 review packet — Telegram bridge supervision (cold, CODE, URGENT/live-channel)

**Candidate**: `ebdc9846bf78c6616df72fe2bc49c2f360dc89ac` (base reconciled to main e19fdb1). Build/verify as CHERRY-PICK onto fresh main (COORD-004).
**Dossier**: `../tasks/item-29-telegram-bridge-supervision/tasks.md`. **Write verdict to** `reviews/item-29-review.md`.
**Files**: telegram/index.ts(+test), daemon.ts(+test). **This supervises the LIVE human channel (Vaughan's phone)** — a regression that double-starts (409) or kills a healthy bridge is worse than the silent-death it fixes. Weigh accordingly.

## What this lands (o-prime a/b/c + storm guard)
- **(a) die loud**: standalone `pij telegram` appends ordinary logs + SYNCHRONOUS uncaughtException/unhandledRejection/processExit records (reason+code) to its OWN file (~/.pij/telegram-bridge.log); caught bot.start fatals append before exit.
- **(b) supervise**: `superviseBridge()` runs each daemon tick (`daemon.ts` `this.bridgeSupervisor?.tick()`) — a dead standalone lock holder OR an in-process bridge whose stop removed the lock ⇒ restart via startBridge/acquireLock stale reclaim; a LIVE holder is never double-started.
- restart storm guard: 5s cooldown + 3 attempts / 60s → `{kind:"capped"}`.
- each restart: a `telegram-bridge-restarted` spine event + a DIRECT owner watchdog-capture (reason + bridge-log tail) that bypasses relay/watchdog exemption.

## Dim-0 mutation gate — MANDATORY, sha-verify RED→restore→GREEN on disk (lines CODER-CLAIMED — verify against file [DL-011])
- **MUT-LOUD** (claimed index.test.ts:641 & :664): remove the uncaughtException/exit handler ⇒ RED (abrupt death leaves no reason line).
- **MUT-SUPERVISE** (claimed index.test.ts:796): make superviseBridge a no-op on a dead holder ⇒ RED (dead bridge not restarted).
- **MUT-LIVE** (claimed index.test.ts:820): make superviseBridge restart a LIVE holder ⇒ RED (must NOT double-start → would 409-conflict the healthy bridge).

## Semantic checks (Dim-1) — the live-channel risks
1. **Sync flush is real**: the fatal handlers use `writeSync`/`appendFileSync` (SYNCHRONOUS) — confirm an async write can't be scheduled-then-lost when the process exits. The whole "die loud" value is that the reason reaches disk BEFORE death.
2. **No double-start / 409**: MUT-LIVE proves a live holder isn't restarted — but also confirm the liveness check is race-safe (a bridge that JUST started, lock written but pid check lagging, isn't stomped). Confirm the reclaim only fires on a genuinely dead pid.
3. **Both death modes**: standalone (lock holder pid dead) AND in-process (stop removed the lock) both trigger restart — confirm the detection covers both without false-positive on a bridge-less daemon (no telegram.env ⇒ no-op).
4. **Storm guard bounds**: a crash-looping bridge caps at 3/60s → `capped`, does NOT hot-loop the daemon tick; after the window it retries. Confirm the cap is per-window (not permanent lockout).
5. **Owner capture**: the direct notify reaches the unique live prime and bypasses exemption correctly — confirm behaviour with 0 primes (no crash) and that the capture carries the reason + log tail.
6. **No collateral** (E17): cherry-pick onto fresh main; vitest list + line-diff, no test removed/weakened. gatesClean:false = pre-existing only, none touching the 2 files.

Report verdict + the 3 mutation shas/RED lines + Dim-1 findings to me.
