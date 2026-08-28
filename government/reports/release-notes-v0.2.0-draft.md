# pij v0.2.0 — release notes (TAGGED 2026-08-28 05:2xZ at `d120c53` on Vaughan's ruling "merge it all, make it 0.2.0"; outstanding items handed over in docs/handover/v0.2.0/)
Source sha: **d120c53** = tag `v0.2.0` (main head at 05:2xZ 2026-08-28; live on the daemon since restart #7 at 05:13Z, pid 69943; includes item 32). Bridge measurement in the first post-fix hour: 0 of 8 sends needed a second attempt. Gates on that sha: full vitest, `just typecheck`, `just pij-skill-check`, cold review per PR, live proofs per harness kind + Telegram. **GitHub Actions has never run in this repo; these gates are local.**

## Headline
Peer comms move from filesystem inboxes to a **SQLite WAL durable queue** with **socket/RPC delivery**: Claude seats read an inbox socket; Copilot seats spawned with `--ui-server` receive RPC; socketless seats get a typed pointer line. `queue backend: sqlite` is the default; fs inboxes migrate on first daemon start. Standalone design spec: `docs/specs/claude-copilot-sqlite-sockets-comms.md` (AI-Substrate/pij#311).

## Included (day-3 items, PRs #1–#34; items 24, 29b-T001, 30, 31 merged 2026-08-28)
- Queue: `pij queue retire`, closed-recipient sweep, revive un-retire (item 1); dispatch records retired for closed seats (1b); stdio flush before exit (1a).
- Delivery: Telegram bridge and pi receiver consume the queue at-least-once (3b, 3c); no duplicate after transport ack-loss (20); honest transport receipts — `sent` vs durable ack (23); honest pointer-path "unverified" line (5).
- Telegram bridge: supervised in-process, dies loud, auto-restarts (29); no duplicate after an internal retry — plan-hash idempotence, media included, one in-lease retry for transient send failures, durable in-process bridge log (24); restart notice reaches the bridge's watchers (29b-T001; primes run `pij watchdog watch pij-telegram`); routing: swipe-reply → that seat, explicit address → that seat, bare text → the prime (from the `pij-telegram` watcher roster), dead seat → told with guidance, never queued; last-speaker-follow retired (30).
- Safety: pane-misbind guard (10a/10b, 17, 21); registry publishes serialized (13); stale spine/platform write-locks released and reclaimed (15); creator notices route to the current parent, liveness-aware (16); the daemon runs as Node's direct child and releases its locks on SIGINT/SIGTERM/SIGHUP (32).
- Spawn/models: `--context long_context` gated per model (6); gemini-3.6-flash marked upstream-unstable, warn-don't-block (6b).
- Harness/docs: skill-check debt and hardening (9, 11, 12); report vocabulary remedies (4); C9 watchdog doc (14, 18); pointer doctrine (7).
- Watchdog: projection reads the live fire clock; "unknown" verdicts are never delivered; stall threshold is standby-aware; notices are signed by the sensor, not the observed seat (31).

## Known gaps (honest)
- Telegram bridge: a retry inside one delivery pass after an ambiguous send failure (network error after Telegram may have accepted) can duplicate one bubble; it never omits. Cross-pass redelivery is idempotent (plan-hash marks). Bounded backoff and this case: item 24b. Measured on 188c877 (23:15–02:45Z): 9 of 24 bridge sends (≈1 in 3) failed their first attempt (transient network errors on `sendMessage`, evidenced in the bridge log after item 24 restored it; not length-related) and landed ~65–80 s later on the lease retry. With item 24's in-lease retry live (2026-08-28 04:11Z), the first hour showed 0 of 6 sends needing a second attempt and one transient recovered in-lease.
- Claude-socket receipts: `acked (reader=X)` proves injected-to-socket, not read (item 23b pending).
- Codex `app-server --remote` path deferred; Codex seats use the pointer line.
- `pij list --json` / `pij state --json` omit harness/pane/statusAt.
- The stall sensor still notifies for a working PM whose child seat is active (delegation quiet) — item 31b. Standby seats and the PA are clean since item 31.
- The plan-055 watchdog smoke proof (`docs/plans/055-pij-watchdog/proofs/run-proofs.ts`) is stale since item 5 (asserts the pre-pointer delivery model; unawaited ticks; FsChannel while the CLI writes sqlite) and reads red on the harness smoke line for those reasons — item 33.
- Daemon restart is machine-wide (every fleet); baton protocol in `government/`.

## Upgrade
Restart the daemon from the tagged checkout; first start migrates fs inboxes. Primes: `pij watchdog watch pij-telegram` so bridge-restart notices and bare Telegram text reach you (`pij watch` is the file-glob verb and does nothing for this).
