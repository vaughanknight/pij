# s043 report — research checkpoint

**From**: pij-rigid-minnow · **To**: pij-3vetx8 · **Date**: 2026-07-12 · **Stage**: research → planning

## claim

Builder research is complete. The smallest supported design separates the existing selected target used by `/tail` from an injected per-chat last-speaker fallback, updates last-speaker state only after a non-receipt bubble successfully reaches Telegram, and leaves reply-to plus full/partial name resolution ahead of that fallback.

## artifacts[]

- `docs/plans/043-telegram-last-speaker-routing/research-dossier.md`
- `docs/plans/043-telegram-last-speaker-routing/rulings.md`
- `docs/plans/043-telegram-last-speaker-routing/the-flow.json`
- `docs/plans/043-telegram-last-speaker-routing/the-flow.md`

## shas[]

- `research-dossier.md` — `bcf2682e8b03bc0b1f1a3a119b85cce913153ddd362cce27e1954b58a3b02350`
- `rulings.md` — `705c7601eb0a56fd50cc6546dfa77e1f97dceac31ffedac4b192b0bee9351798`
- `the-flow.json` — `1579b09081ba974e5e9b99561e5e325622fa59e5c16a7c3b3356a7bc539fce12`
- `the-flow.md` — `c313681cbf27c2651a4fdabba54d94ac44a9fb7da0f5076ae56dc08faa65a5e3`

## gates[]

- Builder explore sufficiency — current path, contracts, consumers, tests, direct history, hazards, and domain boundary all have exact evidence.
- FlowSpace local graph — available; semantic scout located `routeMessage` and the routing seam.
- Institutional memory — Plan 026 plus commits `910376b`, `b627ee5`, and `18b7421` assessed for current applicability.
- Builder flight plan — `research` done; `plan` in progress.

## observations[]

- `startBridge` already uses the exact shared-map + injected-callback pattern needed for reply threading.
- The forwarder's current final log can say "forwarded" even when all Telegram API sends failed; last-speaker state must therefore flip on actual send success, not dequeue.
- s040 is present in the base and expands phone-friendly partial matching to adjective-animal ids; `match.ts` itself needs no change.
- Copilot outage doctrine is recorded but no planning worker was spawned, so no liveness cadence is currently active.

## open[]

- Jordan's ruling is pending on whether last-speaker fallback also governs captionless inbound media.
- Plan validation must lock the exact fence and stop before any code/worktree allocation.
