# 00 — The live system at v0.2.0 (what a rebuilder needs to know before touching anything)

**Written by the pij o-prime at tag `d120c53`, 2026-08-28 05:3xZ.** Everything here was verified on the machine that night; pointers are to this repo unless stated.

## Topology
- One machine-wide daemon (`.pi/extensions/pij/daemon.ts`), launched by `pij daemon start` as **Node's direct child** (item 32, PR #33): `node --import <tsx loader> .pi/extensions/pij/daemon.ts`, parent = the tmux server; `~/.pij/daemon.lock` holds its pid. It serves every fleet on the machine (several governments share it) — a restart is a machine-wide event.
- Queue: SQLite WAL at `~/.pij/queue/pij.sqlite` (`adapters/sqlite-queue.ts`): tables `messages(seq, id, to_id, from_id, kind, command, body, attachments, created_at)` and `deliveries(seq, to_id, state, attempt, claim_token, lease_until, updated_at, last_error)`; states queued → claimed → injected → acked, plus parked; lease 60 s (`adapters/queue-consumer.ts`). `kind='receipt'` rows are daemon-written receipts (exclude them when counting sends).
- Delivery: Claude seats — inbox socket (`adapters/claude-socket.ts`; a durable `acked (reader=X)` row is written by the DAEMON at injection = injected, not read — item 23b); Copilot seats spawned with `--ui-server` — RPC with a real `messageId` ack (`adapters/copilot-rpc.ts`); socketless seats — a typed pointer line, then `pij inbox`.
- Telegram bridge: runs **in-process under the daemon** (item 29, PR #26), dies loud, auto-restarted; its log is `~/.pij/telegram-bridge.log` (restored by item 24 — it was silent between items 29 and 24). Idempotence: the plan of bubbles is hashed, each bubble marked on positive ack, same hash → unmarked only, other hash → all (item 24, PR #32); one in-lease retry for transient `sendMessage` failures. Routing (item 30, PR #34): swipe-reply → bubble sender (alive-checked); explicit address → that seat; bare text → the effective prime = a live prime in the `pij-telegram` watcher roster; dead → guidance, never queued. Watcher roster: `~/.pij/pij-telegram/watchdog.json` `watchers[]`, written by `pij watchdog watch pij-telegram` (NOT `pij watch`, which is the file-glob verb). The bridge-restart notice (item 29b-T001, PR #30) resolves to the same roster.
- Watchdog (item 31, PR #31): projection reads the live fire clock; "unknown" verdicts are never delivered; stall threshold is standby-aware; notices are signed `pij-watchdog`/`pij-daemon`. Residual: a working PM with an active child still trips the stall sensor (item 31b).
- Locks: `~/.pij/spine/write.lock`, `events.lock` — released on graceful stop, reclaimed by pid + start-time on start (item 15, PR #27); with item 32 live, SIGINT/SIGTERM/SIGHUP all release them.

## Restart procedure (used seven times on 2026-08-27/28, 29–30 s downtime each)
1. Full suite green at the exact sha in a fresh worktree (`npx vitest run .pi/extensions/pij/`; `just typecheck`; `just pij-skill-check`).
2. If other fleets share the daemon: send a SPAWN FREEZE to every live prime/pm/pa seat (`pij list --json`, filter `orchestrationRole` in prime/pm/pa and `liveness != dead`), wait for the co-tenant prime's ack.
3. `pij daemon stop` (signals the inner pid — safe), wait for the pid to vanish, `pij daemon start`; `pij daemon status` must show the new pid and sha and the pane must say `queue backend: sqlite`.
4. Check both spine locks for a dead writer pid (remove only if dead).
5. Proofs: one acked send per harness kind (Claude, Copilot, pij-telegram) with echo replies; bridge-restart notice reached the watchers; a ~400-char Telegram body acks on attempt 1 within seconds and the bridge log's mtime advances; `pij watchdog status <pa>` next-due within its interval; `ps -o ppid= -p <daemon pid>` is the tmux server (no tsx/npx wrapper).
6. FREEZE LIFTED to the same roster.
Reference scripts from the o-prime's session (not in the repo): the sequence above is exactly what they did.

## Sensors a rebuilder should use
- `sqlite3 ~/.pij/queue/pij.sqlite "select d.attempt,count(*) from messages m join deliveries d on d.seq=m.seq where m.to_id='pij-telegram' and coalesce(m.kind,'')<>'receipt' and m.created_at > <epoch ms> group by d.attempt"` — the human-channel duplicate/retry detector (attempt>1 = first attempt failed; on the pre-fix daemon 9 of 24 sends; post-fix 0 of 8 with 3 transients recovered in-lease).
- `~/.pij/telegram-bridge.log` — `forward error`, `text deps.send retry after transient failure`, `forward complete`.
- `pij watchdog status <seat>`, `pij queue`, `pij anomalies` (unscoped), `pij state <seat>` (read `date -u` first; never judge an age from memory).
- Daemon pane (`tmux` window `pij-daemon`): `queue backend`, `telegram:` lines — a 2000-line scrollback that cycles in ~30 min; never a substitute for the log file.

## Measured facts to carry
- Bridge first-attempt failures before item 24: 9 of 24 real sends (23:15–02:45Z), transient `Network request for 'sendMessage' failed!`, not length-related (a 692-char body succeeded first try, a 315-char one did not); each cost the 60 s lease. After item 24: 0 of 8 in the first hour, 3 transients recovered in-lease; the operator confirmed single delivery on the phone.
- GitHub Actions has never run in this repository (0 runs ever); all 34 PRs were gated locally (item 35 in this handover).
- Test suite at the tag: 172 files / 4160 tests / 0 failed (`npx vitest run .pi/extensions/pij/`, ~3.5 min); two known load-sensitive tests: `pij-skill-check.test.ts` (12-FX) and `adapters/claude-socket.test.ts` close-race (23-FX).

## Status report the owner reads
perimenocause repo `government/reports/pij-status-2026-08-28-release.html` (rendered at https://peri-dev.ngrok.app/reports/pij-status-2026-08-28-release/) — narrative built from the o-prime's packet `government/reports/status-packet-2026-08-27T2345Z.md` (this repo) and its amendments.
