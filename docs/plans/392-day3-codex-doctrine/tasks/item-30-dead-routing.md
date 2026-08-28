# Item 30 — dead-routing / prime-resolution (bridge.ts). PRE-TAG (human ruling 2026-08-28).

**Base**: item-24's PR head (branch s392/item-24-pr, head 9af79ae) — bridge.ts carries item-24's changes. Rebase onto main AFTER item 24 merges. Build in your OWN worktree (COORD-010; pathspec commits).
**Fence**: `.pi/extensions/pij/telegram/bridge.ts` (+ its test). Inbound Telegram message → target-seat resolution.

## Routing rules (spine 29003) — REPLACE the last-speaker heuristic
Resolve the target seat for an inbound Telegram message by these rules, in order:
1. **swipe-reply** (Telegram reply referencing a specific prior bubble) → route to that bubble's ORIGINAL SENDER seat, **alive-checked**.
2. **explicit address** (message text names a seat, e.g. a leading `@seat` / known id) → that seat, **alive-checked**.
3. **bare non-reply** (no reply target, no explicit address) → the **effective prime** = the live prime currently WATCHING pij-telegram (`pij watch` registration). Tie (>1 watcher) → the one MOST RECENTLY active to the bridge. None watching → emit a **guidance** message (how to address/watch), do not guess.
4. **dead target** (resolved seat is not alive) → reply "gone" (named), and **NEVER queue** for a dead seat.

**Retire** the last-speaker fallback entirely (route-to-whoever-spoke-last is GONE).

## Alive-check
Rules 1/2 resolve a seat then verify it is alive (registry + liveness) before delivery; a dead resolution falls to rule 4 ("gone", never queued), NOT to rule 3.

## Mutant gate (packet precondition)
`MUT-PRIME-RESOLUTION-LASTSPEAKER.patch`: mutate rule-3 effective-prime resolution to fall back to the retired last-speaker → must RED a behavioural test proving bare non-reply routes to the watching prime (not the last speaker). Save under `tasks/item-30-dead-routing/`; RUN it (apply→RED@line→revert→GREEN). Add mutants for the alive-check (rule 1/2 dead → gone, not queued) and the dead-never-queued rule as load-bearing guards on the human channel.

## Acceptance (a test per routing case)
swipe-reply→sender(alive); explicit→named(alive); bare→watching-prime; tie→most-recent; none→guidance; dead(any rule)→"gone", never queued; last-speaker path removed (no test still asserts it).
Gates: tsc 0, biome clean on changed files, telegram fence GREEN, E40 ledger. Report candidate sha + all mutant results.
Deferred/forbidden: the-flow state files; git add -A / commit -am.
