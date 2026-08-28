# FX-01 — item 16 (dlg-0016) review follow-ups — base cc96eca

Verdict: `review-01.md` APPROVE-WITH-FINDINGS (2 medium, 2 low, 2 info). Orchestrator ruling: F-1 is a behavioural REGRESSION vs base for a real case (parent dead/closed → nobody told; base told the spawner), F-2 is an unsensored gate — both fixed before PR. Fence unchanged (binding.ts, loop.ts, death-reconciler.ts, daemon.ts + tests, docs). Sender provenance (F-5) stays item 31.

## F-1 (medium) — liveness-aware recipient
`noticeRecipient(descriptor)` is pure `parentId ?? spawnedBy`. When the parent is dead, dissolved, or absent from the registry, the notice is suppressed (dead-set) or delivered to a closed seat (dissolved is filtered from `list()`, so the parent never enters the dead set → delivered into a closed inbox, withheld 0, no log).
**Rule**: resolve to the FIRST LIVE candidate in `[parentId, spawnedBy]` — "live" = present in the registry AND not `dissolved`/`failed` AND not in the dead set the caller already holds. If neither is live: deliver nothing AND log one operator line `notice <kind> for <id>: no live recipient (parent <p> <state>, spawner <s> <state>)`; count it as withheld.
Keep `noticeRecipient` as the PURE candidate order (it is used by the builders); add a registry-aware resolver beside it (e.g. `resolveNoticeRecipient(descriptor, registryView, deadIds)`) and use it at every gate that has registry access (loop.ts bind/fail via the persisted descriptor + registry, death-reconciler `resolveDeathNotices`, daemon.ts stalled ×2 / provider-failure). Builders keep taking the chosen recipient.
**RED first** (each site): adopted seat, parentId = dead seat, spawnedBy = live → notice to the SPAWNER (base behaviour restored); parentId = cleanly closed (dissolved) seat → same; both dead → no delivery + one log line + withheld 1. Reviewer's repro: `daemon.ts:794-821` composition delivered [] / withheld 1 on head.

## F-2 (medium) — sensor for the watchdog-derived stall gate
`daemon.ts:~1063 pushWatchdogResponse` gate converted but reverting it to `persisted.spawnedBy` leaves the full suite green (mutation survivor M7). Add the test: parent-only adopted seat + watchdog `stalled` verdict → notice to parentId; with the gate reverted the test must go RED. Prove it in your report (RED under revert → GREEN restored).

## F-3 (low) — two stale comments
`core/daemon/watchdog-manager.ts:219-220` and `:635-636` still say pushWholeLifeTransition "returns early when spawnedBy is absent" — it now returns early only when no live recipient exists. Fix the prose (comment-only edit; watchdog-manager.ts is otherwise OFF LIMITS — that file must stay byte-identical apart from those lines).

## F-6 (info) — `death-reconciler.test.ts:111` "routes a adopted seat" → "an adopted seat".

## Out of scope (recorded, not fixed): F-4 bind-refusal / needs-human diagnostics still go to the spawner (declared boundary; carried to the ship report). F-5 provenance → item 31 AC-30.

## Gates: full `npx vitest run .pi/extensions/pij/` via `pij bg` → `docs/plans/391-day3-core/logs/vitest-phase7-fx01.log`; tsc; biome on changed files. Commit (pathspec) on the same branch; report per schema by `--body-file` with: new SHA, per-finding RED evidence (file:line), the F-2 revert-RED proof, and confirmation watchdog-manager.ts differs from cc96eca only at the comment lines.
