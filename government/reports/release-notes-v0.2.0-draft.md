# pij v0.2.0 — release notes (DRAFT; Vaughan ruled 02:2xZ Aug 28: item 30 is pre-tag; §7 decisions 2–6 open; not tagged)
Source sha: **3411794** (main; live on the daemon since restart #6, 2026-08-28 04:11Z, checkout 916e915 = 3411794 + government). Tag pending Vaughan's decisions 2–6 and the 1-h bridge measurement. Gates on that sha: full vitest, `just typecheck`, `just pij-skill-check`, cold review per PR, live proofs per harness kind + Telegram. **GitHub Actions has never run in this repo; these gates are local.**

## Headline
Peer comms move from filesystem inboxes to a **SQLite WAL durable queue** with **socket/RPC delivery**: Claude seats read an inbox socket; Copilot seats spawned with `--ui-server` receive RPC; socketless seats get a typed pointer line. `queue backend: sqlite` is the default; fs inboxes migrate on first daemon start. Standalone design spec: `docs/specs/claude-copilot-sqlite-sockets-comms.md` (AI-Substrate/pij#311).

## Included (day-3 items, PRs #1–#34; items 24, 29b-T001, 30, 31 merged 2026-08-28)
- Queue: `pij queue retire`, closed-recipient sweep, revive un-retire (item 1); dispatch records retired for closed seats (1b); stdio flush before exit (1a).
- Delivery: Telegram bridge and pi receiver consume the queue at-least-once (3b, 3c); no duplicate after transport ack-loss (20); honest transport receipts — `sent` vs durable ack (23); honest pointer-path "unverified" line (5).
- Telegram bridge: supervised in-process, dies loud, auto-restarts (29); no duplicate after an internal retry — plan-hash idempotence, media included, one in-lease retry for transient send failures, durable in-process bridge log (24); restart notice reaches the bridge's watchers (29b-T001; primes run `pij watchdog watch pij-telegram`); routing: swipe-reply → that seat, explicit address → that seat, bare text → the prime (from the `pij-telegram` watcher roster), dead seat → told with guidance, never queued; last-speaker-follow retired (30).
- Safety: pane-misbind guard (10a/10b, 17, 21); registry publishes serialized (13); stale spine/platform write-locks released and reclaimed (15); creator notices route to the current parent, liveness-aware (16).
- Spawn/models: `--context long_context` gated per model (6); gemini-3.6-flash marked upstream-unstable, warn-don't-block (6b).
- Harness/docs: skill-check debt and hardening (9, 11, 12); report vocabulary remedies (4); C9 watchdog doc (14, 18); pointer doctrine (7).
- Watchdog: projection reads the live fire clock; "unknown" verdicts are never delivered; stall threshold is standby-aware; notices are signed by the sensor, not the observed seat (31).

## Known gaps (honest)
- Telegram bridge: a retry inside one delivery pass after an ambiguous send failure (network error after Telegram may have accepted) can duplicate one bubble; it never omits. Cross-pass redelivery is idempotent (plan-hash marks). Bounded backoff and this case: item 24b. Measured on 188c877 (23:15–02:45Z): 9 of 24 bridge sends (≈1 in 3) failed their first attempt (transient; not length-related — a 692-char body succeeded first try while a 315-char one did not) and landed ~65–80 s later on the retry.
- Claude-socket receipts: `acked (reader=X)` proves injected-to-socket, not read (item 23b pending).
- Codex `app-server --remote` path deferred; Codex seats use the pointer line.
- `pij list --json` / `pij state --json` omit harness/pane/statusAt.
- The plan-055 watchdog smoke proof (`docs/plans/055-pij-watchdog/proofs/run-proofs.ts`) is stale since item 5 (asserts the pre-pointer delivery model; unawaited ticks; FsChannel while the CLI writes sqlite) and reads red on the harness smoke line for those reasons — item 33.
- The daemon is launched under an `npx tsx` relay (cli.ts:1598): a signal that reaches the wrapper pid (tmux kill-window, OS shutdown) SIGKILLs the daemon in ~60 ms and leaks the spine write locks; `pij daemon stop` is safe (signals the inner pid) and item 15's reclaim recovers on next start. Direct-child launch = item 32 (pre-tag preferred).
- Daemon restart is machine-wide (every fleet); baton protocol in `government/`.

## Upgrade
Restart the daemon from the tagged checkout; first start migrates fs inboxes. Primes: `pij watchdog watch pij-telegram` so bridge-restart notices and bare Telegram text reach you (`pij watch` is the file-glob verb and does nothing for this).
