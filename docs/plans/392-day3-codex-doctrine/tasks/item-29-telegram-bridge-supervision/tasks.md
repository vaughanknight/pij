# Item 29: Telegram bridge — die loud + daemon supervises + auto-restart (URGENT)

**Plan**: `../../day3-codex-doctrine-plan.md` (§ Item 29) · **Ruling**: `../../rulings.md` (2026-08-28, order 21→29→24→22→E22→23b) · **Related**: E24 (death unobserved), E25/item 28 (s391 send-to-dead-bridge).
**Base**: main (fetch at dispatch; cherry-pick fresh-from-main, COORD-004). CODE.
**Fence**: `telegram/index.ts` (+test), `telegram/lockfile.ts` (dead-pid detect — reuse), `daemon.ts` (tick supervision), `telegram/bridge.ts` if the forwarder needs the own-log stream, + tests. NO schema change beyond additive.
**Evidence**: `~/.pij/telegram-bridge.log`, spine 27911/28188. Deaths: ~18:4xZ pid 8674; ~19:3xZ pid 36559 (~3 min after restart #4). Interim: o-prime set `remain-on-exit on` on the telegram tmux window.

### Root cause (read-only survey)
- **Production bridge = STANDALONE** `pij telegram` (separate pid + tmux window, tee'd log), NOT the in-process `autoStartBridgeForDaemon` path. The standalone command (`index.ts:~455-520`) installs ONLY `process.once("SIGINT"/"SIGTERM", shutdown)` (`:498-499`) and a try/catch around `bot.start()` (→ `handleStartError`). There is NO `uncaughtException`/`unhandledRejection`/`exit` handler, so an unhandled rejection inside grammy's long-poll (a network error in an un-awaited callback) kills the process with the log ending on a normal "forwarded" line.
- **No supervision**: `maybeStartBridge` (`index.ts:362`) runs ONCE at daemon startup (`daemon.ts:1676 autoStartBridgeForDaemon`); `:372` only LOGS "a bridge already runs (pid …) — not auto-starting". Nothing re-checks liveness on tick, so a died bridge stays dead. `lockfile.ts:91-95` already detects+reclaims a dead lock holder — the machinery exists, it's just not driven per-tick.

### Tasks
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 (a: die loud) | the standalone `pij telegram` command: open its OWN append stream to the bridge log (`~/.pij/telegram-bridge.log`) and route `log()` through it (not just stdout→tee); install `process.on("uncaughtException")`, `process.on("unhandledRejection")`, and `process.on("exit", code=>…)` handlers that SYNCHRONOUSLY write `reason + code` (+ stack) to the log before the process dies. RED-first: a test that injects an unhandled rejection / non-signal exit ⇒ the log gains a reason line (today it does not). | pij-control-plane | `telegram/index.ts` (+test) | RED→GREEN; an abrupt death leaves a reason+code line | flush sync (writeSync/appendFileSync) — an async write is lost on exit |
| [ ] | T002 (b: supervise) | add a `superviseBridge(deps)` (in `telegram/index.ts`) the daemon calls each TICK: read the recorded bridge pid (lock/descriptor); if it is GONE and a telegram.env is present, RESTART (reuse `maybeStartBridge`'s stale-lock reclaim path), append a spine note, and push a capture to the bridge OWNER regardless of exemption. Idempotent: a live bridge ⇒ no-op. | pij-control-plane | `telegram/index.ts` (+test), `daemon.ts` (tick call) | RED→GREEN | do NOT double-start a LIVE bridge (lockfile.ts:91 refuses a live holder); only a dead/absent holder restarts |
| [ ] | T003 (daemon wiring) | call `superviseBridge` from the daemon tick loop (alongside/near the delivery timer, `daemon.ts:1665+`), guarded so a bridge-less daemon is unchanged (no telegram.env ⇒ no-op). | pij-control-plane | `daemon.ts` | tick invokes supervision; bridge-less daemon unchanged | fold teardown into the existing disposer |
| [ ] | T004 (c: the headline test) | fake that KILLS the bridge child ⇒ within ONE supervision tick the bridge is restarted AND a spine note + owner capture are emitted. | pij-control-plane | `telegram/index.test.ts` (or a daemon test) | restart-within-one-tick proven with fakes | the ruling's acceptance test |
| [ ] | T005 | gates (`npx vitest run .pi/extensions/pij/`, `just typecheck`), pathspec commit, `reports/item-29-report.md` | pij-control-plane | reports/ | recorded | one PR |

### Cold-review Dim-0 (mandatory)
- **MUT-LOUD**: remove the uncaughtException/exit handler ⇒ T001 RED (abrupt death leaves no reason).
- **MUT-SUPERVISE**: make superviseBridge a no-op when the pid is dead ⇒ T004 RED (dead bridge not restarted).
- **MUT-LIVE**: make superviseBridge restart even a LIVE bridge ⇒ a double-start/409 test RED (must not stomp a healthy bridge).
- Verdict artifact records sha + RED line each.

### Open
- Confirm the production bridge is the standalone tmux `pij telegram` (evidence says yes: separate pid + own window). If some daemons run the in-process bridge, supervision must cover the in-process death too (the `.catch` at `index.ts:376` tears down but never restarts) — note which mode(s) the fix covers in the report.
- The owner-capture "regardless of exemption": pij-telegram is a relay/exempt seat; the supervision note must reach the owner anyway (a direct push, not gated by watchdog exemption). Cite the exemption bypass path used.
- Restart storm guard: if the bridge crash-loops, bound the auto-restart (e.g. backoff or a max-per-window) so supervision doesn't hot-loop a broken bridge — flag if you add one.
