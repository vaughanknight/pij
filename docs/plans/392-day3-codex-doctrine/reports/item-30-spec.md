# Item 30 — dead-routing / prime-resolution (bridge.ts). Pre-tag (human ruling 2026-08-28).

**Routing spec (per spine 29003):**
- **swipe-reply** (Telegram reply to a specific bubble) → route to that bubble's SENDER, alive-checked.
- **explicit address** (message names a seat) → that seat, alive-checked.
- **bare non-reply** (no reply target, no explicit address) → the **effective prime** = the live prime WATCHING pij-telegram; tie → most recent to the bridge; none → a guidance message.
- **dead target** → "gone", never queued (do not silently enqueue for a dead seat).
- **last-speaker heuristic RETIRED** — no longer route to whoever spoke last.

**Mutant gate (packet precondition):** MUT prime-resolution → last-speaker must RED a behavioural test (i.e. a test proving the effective-prime resolution is used, not the retired last-speaker fallback).

**Sequencing**: base branch on item-24 PR head; dispatch on item-24 PR OPEN (not merge); rebase onto main after 24 merges. Same file family as item 24 (bridge.ts) — expect overlap; that's why it pipelines on 24's head.
