# Preamble checkpoint — s392-day3-codex-doctrine

**Seat**: pij-falling-outside (pm) · **Parent**: pij-relative-panther · **Date**: 2026-08-27T08:12Z · **Stage**: orient → preamble (read-only review; no code mutation yet)

## claim
Brief dispatch-db872c58 acked (sha e4d617d6…6afa5); orient stack read (prime route → orchestrator → orient-global → orient-local → brief → implementer notes sha 7fe92b57…9a60 verified); thesis produced via the thesis skill; item 1 root cause and receipt bug source-verified on 2953d75; ready to plan pending rulings in open[].

## artifacts[]
- docs/plans/392-day3-codex-doctrine/thesis.md
- docs/plans/392-day3-codex-doctrine/reports/preamble-checkpoint.md (this file)
- /Users/vaughanknight/GitHub/pij/government/briefs/s392-day3-codex-doctrine.md (read)
- /Users/vaughanknight/.pij/pij-primitive-toucan/day3-implementer-notes.md (read)
- .harness/temp/ (2 observations captured via `harness observe`)

## shas[]
- base/HEAD: 2953d7599b3b8a498295f9e07b766a4fff49edc9 (branch s392/day3-codex-doctrine, worktree clean)
- brief: e4d617d6f5115c49b096e2c20b91c662754c3731c4a23fe9db75e34ef5d6afa5
- implementer notes: 7fe92b57dd4adb3e829e0e039dc6140bdeaeb60a728a5d0483c7570cf61e9a60

## gates[]
- `pij phonehome` → bound (pij-falling-outside ↔ session 293971b9)
- `pij whoami --json` → id pij-falling-outside, folder = this worktree, role pm
- `harness boot` → typecheck OK; `just test` red ONLY on harness/scripts/release-age-policy.test.ts (spawnSync pwsh ENOENT) — the brief's KNOWN-RED; not fixed
- `command -v pij` → /opt/homebrew/bin/pij → /Users/vaughanknight/GitHub/pij/harness/scripts/pij-cli.cjs (MAIN checkout; live proofs will bind `npx tsx .pi/extensions/pij/cli.ts`)
- node_modules present in worktree

## verified position (read-only, file:line on 2953d75, .pi/extensions/pij/)
- Item 1 root cause: `telegram/index.ts:316` `runtimeFor` → `new FsChannel(pijHome, pollPrimaryWatchOpts())`; `telegram/bridge.ts:548-649` `startForwarder(channel: FsChannel)` → `channel.watch(TELEGRAM_PEER_ID, …, deps.seen)`; every sender uses `openChannel` (`adapters/channel-factory.ts:131`, default sqlite) → no fs file is ever written → forwarder never fires. Confirmed live (read-only sqlite): `~/.pij/queue/pij.sqlite` deliveries for pij-telegram = 120 `failed` (o-prime retired at 07:20Z) + 2 `queued` (seq 149 from pij-vocal-kingfisher 07:17Z, 612 B; seq 290 from pij-relative-panther 07:58Z, 74 B), both attempt 0, no cursor row. Daemon correctly leaves them alone (`daemonOwnsDelivery` false for harness pi).
- Receipt bug: `core/cli.ts:2225` `classifySendReceipt` tests raw `descriptor.deliveryMode === "pull"`; the pij-telegram descriptor (`~/.pij/pij-telegram.json`) has `deliveryMode: null, paneId: null, harness: pi`, so it falls through `daemonReceiptAuthoritative` (false for pi) and `state` (undefined→idle) to `delivered`. `effectiveDeliveryMode` (`core/cli.ts:2270`) already resolves this to `pull`. Same raw check at `core/cli.ts:693`.
- Queue API available for the consumer: `SqliteQueue.listQueued/claim/settle/claimUnread` (`adapters/sqlite-queue.ts:250-395`); `failed` is excluded by `listQueued`/`listUnread` already (they filter to queued|claimed|injected) — the 120 retired rows can never replay by construction. Daemon's `recoverStaleClaims` sweeps ALL seats' expired leases, so a bridge crash mid-send self-heals.
- Existing forwarder tests (`telegram/bridge.test.ts:785-1100`) build `new FsChannel(home,{pollMs:25})` and drive `channel.deliver` — the sqlite variant needs a `SqliteQueue(home)` twin.

## observations[]
- obs-01 / difficulty / skill-layer / `/thesis` exists only at ~/.agents/skills/thesis (not under ~/.claude/skills) so a Claude seat cannot Skill()-invoke it / encode: link thesis into ~/.claude/skills (or list it in the Claude skill roster) — captured via harness observe
- obs-02 / difficulty / env / harness boot known-red on pwsh test on macOS / encode: skip `release-age-policy` pwsh probe when `pwsh` absent — captured via harness observe
- obs-03 / finding / core (NOT my fence) / the pi in-process receiver `index.ts:314` also hard-wires `new FsChannel` + `channel.watch` (`index.ts:377`) → any harness:"pi" peer is dark under the sqlite default by the same mechanism as the bridge / encode: a shared queue-poll consumer (`SqliteQueue`-aware watch) used by BOTH bridge and pi receiver; needs an owner ruling (s391 core? me?)
- obs-04 / finding / cli / `daemonReceiptAuthoritative` (`core/cli.ts:693`) also reads raw `deliveryMode`; harmless today (pi never reaches it) but the same class — will fix alongside 3b unless ruled out
- obs-05 / win / tooling / read-only `sqlite3 -readonly ~/.pij/queue/pij.sqlite` gives exact live evidence without touching the daemon — worth a `pij queue --to <id>` mention in the orient-local

## open[] (rulings sought at preamble; item 1 planning proceeds under the recommendations)
1. Rows 149/290: RECOMMEND forward-once on bridge restart (durable ack becomes the watermark; `failed` rows excluded by state) rather than retire — both are real operator messages ≤1h old. Alternative: retire with receipt "superseded-by-3b".
2. Boot-watermark semantics under sqlite: RECOMMEND the delivery state machine IS the watermark (never replay acked/failed; forward every `queued` row incl. backlog on boot). Risk: a long bridge outage replays a large backlog into the chat — accept for now; a `--skip-backlog` flag is a follow-up, not day-3.
3. Consumer placement: RECOMMEND a small generic poll-consumer over `SqliteQueue` (`claim → handler → ack | release`) in a NEW worktree-local path `adapters/queue-consumer.ts` (+test) so the pi receiver (obs-03) can adopt it without a second implementation; bridge keeps `startForwarder(channel: FsChannel | SqliteQueue)`. New path → fence notify (this is that notice).
4. Codex (item 2) is blocked on `codex login` (401) — will ask Vaughan in-pane when item 1 is handed over; not blocking item 1.
5. Build config: default `/pij pair` copilot gpt-5.6-sol xhigh coder + cross-model reviewer — will stop at WAITING_FOR_BUILD_CONFIG after the plan is validated.
6. Live proof of item 1 needs the bridge restart baton (o-prime owns `pij-prime:telegram`) — will hand over a tested commit + the exact proof command, per brief.

## next
Enter planning for item 1 via the-flow (plan folder docs/plans/392-day3-codex-doctrine/), unified spec+plan, cold validate, then WAITING_FOR_BUILD_CONFIG.
