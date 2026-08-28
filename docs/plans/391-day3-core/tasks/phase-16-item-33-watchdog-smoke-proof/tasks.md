# Phase 16: Item 33 — resurrect the plan-055 watchdog smoke proof — tasks dossier
**Plan**: § Phase 16, AC-33 · **Branch/PR**: `s391/item33-watchdog-smoke-proof` off `main` · **Domain**: proof script + harness smoke output
**Evidence**: `docs/plans/391-day3-core/logs/smoke-red.log` (unawaited ticks), `smoke-red-2.log` (FsChannel vs sqlite default), `smoke-red-3.log` (first-turn body vs pointer line); partial fix for drifts 1–2: `docs/plans/391-day3-core/logs/run-proofs-partial.patch` (apply with `git apply`). Each was reproduced on CLEAN main with the previous fix applied.
### Executive Briefing
- **Purpose**: the harness's only watchdog smoke sensor has been dead since (at least) item 5's pointer path and item 1's sqlite default, masked by the pwsh/OSC baseline reds. Make it live and make its output unmaskable.
- **Goals**: ✅ AC-33 smoke green on head; reddens when the fire path is broken; baseline reds named separately; every red kept as a log
- **Non-Goals**: ❌ changing daemon/watchdog behaviour (any needed change = STOP and report — it would be a regression finding, not this item) · ❌ deleting assertions to get green (rewrite them for the pointer model, keep their intent)
### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/plans/055-pij-watchdog/proofs/run-proofs.ts` | yes | ticks `:322/:330/:369/:375/:411`; `new FsChannel(home)` `:304`; first-turn assertions `:~1209-1217`; more scenarios below the smoke may carry the same drifts |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/harness/scripts/smoke.ts` | yes | runs `run-proofs.ts --smoke` (`:33`); output separation lives here or in the proof's JSON — ask before touching the harness script |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/channel-factory.ts` | yes (READ ONLY) | `openChannel` `:138`, `queueBackend` `:46` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/daemon-tmux.ts` | yes (READ ONLY) | the pointer line rendered for socketless tmux seats (item 5) — assert against its format, not a guess |
### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | `git apply docs/plans/391-day3-core/logs/run-proofs-partial.patch`; run the smoke (`PIJ_HOME=$(mktemp -d) TMUX= npx tsx docs/plans/055-pij-watchdog/proofs/run-proofs.ts --smoke`); confirm reason 3 reproduces; log → phase folder `logs/red-3-repro.log` | proof | run-proofs.ts | reproduced | AC-33 |
| [ ] | T002 | Rewrite the pointer-era assertions: the nudge BODY (with `pij report state done`) is asserted in the durable channel (unread body for the seat); the pane receives the pointer line (assert its shape from `daemon-tmux.ts`); repeat for every sibling assertion that reads pane text as body. Run; keep every log (`logs/run-NN.log`). NEW reason of the same class (delivery-model drift) → fix + log; anything that looks like daemon behaviour → STOP + report | proof | run-proofs.ts | smoke green | |
| [ ] | T003 | Sensor honesty: temporarily make `isFireDue` return false (or equivalent) in a scratch copy → smoke RED; restore → GREEN; record both in execution.log.md (never commit the mutation) | proof | — | RED/GREEN recorded | AC-33 |
| [ ] | T004 | Output separation: the smoke JSON (or `harness/scripts/smoke.ts` — ASK first) reports `watchdog-smoke: green` on its own line and lists pwsh/OSC baseline reds separately; DOCS (one line for the release-notes known gap, for the o-prime); GATE (full vitest via `pij bg`, tsc, biome on changed files); PR-ready (no push) | — | | 0 fail; smoke line green | AC-10 |
