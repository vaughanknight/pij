# Phase 12: Item 28 — sender preflight: dead RELAY seats queue-with-note — tasks dossier
**Plan**: § Phase 12, AC-26 · **Branch/PR**: `s391/item28-relay-send-queues` off `main` · **Domains**: pij-control-plane (CLI preflight) · pij-messaging (receipt note) · **CS**: 2
**Evidence**: Telegram bridge dead ~18:4x–18:48Z; `pij send pij-telegram` refused client-side (E-DEAD), message lost (E25).
### Executive Briefing
- **Purpose**: `core/cli.ts preflightSendTargets` (`:2185-2200`) returns `E-DEAD` for `dissolved`, and for `dead` unless `deliveryMode === "pull"`. A relay/control-plane seat (`descriptor.relay === true`, the deliberate-silence class from C9/Plan 056) that is temporarily dead should QUEUE (durable sqlite row + a `recipient-dead` note) so the message drains when the bridge revives; ordinary dissolved seats keep the refusal (item 1 retires their mail on complete close).
- **Goals**: ✅ AC-26 dead relay → queued + note; dissolved ordinary → `E-DEAD`; live relay → normal
- **Non-Goals**: ❌ changing the deliberate-silence/watchdog semantics · ❌ auto-reviving the bridge
### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.ts` | yes | `preflightSendTargets` `:2232-2249` (`liveOf`, `E-DEAD` branch); send result shapes — receipt `"delivered"` `:2288`, wording `:2397`, `deliveryState` `:4619` (at main e935c88 — re-grep on your base) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.test.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/cli.integration.test.ts` | yes | send preflight tests; fake dead descriptor fixtures |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/types.ts` | yes | `relay?: boolean` on `SessionDescriptor` (READ ONLY) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/sqlite-queue.ts` | yes | receipt helper for the `recipient-dead` note |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/how/pij.md`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/how/pij-watchdog.md` | yes | deliberate-silence class docs |
### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | TEST (RED): fake `relay:true` + dead pid → `pij send` ok, `state: queued`, output "queued — relay is down; delivers on revive", receipt/note `recipient-dead`; fake dissolved ordinary seat → `E-DEAD` (unchanged); live relay → normal delivery | pij-control-plane | RED on base | AC-26 |
| [ ] | T002 | IMPL preflight branch on `descriptor.relay` + wording + note | pij-control-plane / pij-messaging | T001 GREEN | |
| [ ] | T003 | DOCS + GATE + PR | — | 0 fail | AC-10 |
