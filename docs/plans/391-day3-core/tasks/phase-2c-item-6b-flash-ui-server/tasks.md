# Phase 2c: Item 6b — Flash interactive 400 under `--ui-server` — tasks dossier

**Plan**: § Phase 2c, AC-17 · **Branch/PR**: `s391/item6b-flash-ui-server` off `main` · **Domain**: pij-control-plane · **CS**: 2
**Ruling** (12:05Z): isolate with a scratch copilot OUTSIDE tmux (misbind incident makes tmux lab panes unsafe until item 10); fix if ours, else record "Flash unusable interactively — catalog marks it" honestly. Do NOT spawn pane-less pij seats. Local orient: Flash is unusable for interactive seats today; use terra/sol.

### Executive Briefing
- **Purpose**: with item 6 merged, a Flash seat launches `copilot --yolo --session-id <u> --model gemini-3.6-flash --ui-server --port N [--effort e]` (no `--context`) and still gets HTTP 400 "invalid request body" on every turn; `copilot -p "<prompt>" --model gemini-3.6-flash` from the same dir works. Find the variable or mark the catalog.
- **Non-Goals**: ❌ any tmux lab pane · ❌ pij seats without a pane · ❌ daemon changes.

### Isolation protocol (T001) — run from a plain terminal (NOT tmux), isolated `PIJ_HOME=$(mktemp -d)`, scratch dir, NO pij daemon involvement
Matrix (each cell: launch, send one trivial prompt, record HTTP status / first error line; kill):
| # | argv | model gemini-3.6-flash | model gpt-5.6-sol |
|---|---|---|---|
| 1 | `copilot -p "say ok"` | expected OK (baseline) | OK |
| 2 | `copilot --model M` (interactive, no flags) | ? | OK |
| 3 | `copilot --yolo --model M` | ? | OK |
| 4 | `copilot --model M --ui-server --port N` | ? | OK |
| 5 | `copilot --yolo --session-id <uuid> --model M --ui-server --port N` (pij's exact argv) | ? (expected 400) | OK |
| 6 | `copilot --yolo --session-id <uuid> --model M --ui-server --port N --effort low` | ? | OK |
| 7 | (5) with the repo's MCP/skills config removed (`--no-mcp`/empty `~/.copilot` config or an empty cwd) | ? | OK |
| 8 | (5) with `--context long_context` re-added (control for item 6) | expected 400 | OK |
Capture the 400 body if the CLI exposes it (`--log-level debug` / `~/.copilot/logs`). Record everything in `isolation.md` beside this file, including the copilot version (`copilot --version`).

### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | ISOLATE per the protocol above; write `isolation.md` (matrix + verbatim error lines + copilot version + verdict: "ours: <flag/config>" or "upstream: interactive request body rejected for this model") | — | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/plans/391-day3-core/tasks/phase-2c-item-6b-flash-ui-server/isolation.md` | file present; every cell filled or marked NOT-PROBEABLE with why | AC-17; NOT in tmux |
| [ ] | T002a | IF OURS: TEST (RED) in `core/spawn.test.ts` for the isolated variable (e.g. a flag gated per model like item 6), then IMPL in `core/spawn.ts` (+ registry capability if needed) | pij-control-plane | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/spawn.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/spawn.test.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/models/registry.ts` | GREEN | mirror item 6's tri-state pattern |
| [x] | T002b | IF UPSTREAM: TEST (RED) `core/models/registry.test.ts` + `core/models/spawn-validation.test.ts`: a curated catalog field named for the measured fact (NOT `interactive`; e.g. `copilotRejected?: {cli, measuredAt, paths}`) for `gemini-3.6-flash` beside `COPILOT_NO_LONG_CONTEXT`; `buildSpawnWarning` emits "gemini-3.6-flash on GitHub Copilot CLI <version> is unstable upstream: HTTP 400 'invalid request body' on every request path (-p and interactive) observed <date/time>, while a -p one-shot succeeded <date/time> — treat as unavailable until a fresh probe passes; pick gpt-5.6-terra or gpt-5.6-sol" (final ruling 08:20Z: BOTH observations, CLI version, no -p remedy) — warn-don't-block, NO `-p` remedy (refuted by the matrix); IMPL accordingly | pij-control-plane | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/models/registry.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/models/registry.test.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/models/validate.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/models/spawn-validation.test.ts` | GREEN | AC-17; implemented as `copilotInstability` with both observations |
| [x] | T003 | DOCS `docs/how/pij-models-discovery.md` (Flash interactive limitation or the fix) | docs | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/how/pij-models-discovery.md` | present | |
| [x] | T004 | GATE vitest green; pathspec commit; report | — | git root | 0 fail | AC-10; 3,994 passed, 15 skipped, 0 failed |

### Discoveries & Learnings
| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| 2026-08-28 | T001 | upstream | Same Copilot CLI build produced an earlier successful Flash `-p` one-shot and a later all-path HTTP 400 matrix. | Catalog both observations as upstream instability; warn-don't-block and recommend Terra/Sol pending a fresh probe. | `isolation.md`, `execution.log.md` |
