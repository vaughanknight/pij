# Phase 11: Item 27 — `pij tail --type` actually filters — tasks dossier
**Plan**: § Phase 11, AC-25 · **Branch/PR**: `s391/item27-tail-type-filter` off `main` · **Domain**: pij-control-plane (CLI) · **CS**: 1
**Evidence**: o-prime verified `pij tail <id> --type receipt` (with/without `--json`) returns the unfiltered transcript (E21).
### Executive Briefing
- **Purpose**: `core/cli.ts` parses `--type` (`:374` `type?: string`; `:1301` "--type takes an event type"; `:1306` threads `type`), but the tail renderer never consults it. Make it filter, validate the type against the real kind vocabulary, and pin with a mixed-kind fixture.
- **Goals**: ✅ AC-25 `--type receipt` → receipt lines only (text and `--json`); unknown → `E-ARG` naming valid kinds; default unchanged
- **Non-Goals**: ❌ new event kinds · ❌ `--follow` semantics
### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.ts` | yes | `--type` parse `:1296-1301` (at main e935c88); the tail handler — T001 first proves the value is unread (grep the handler for `type`) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.test.ts` | yes | tail tests |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/cli.integration.test.ts` | yes | fixture transcripts (`pij tail` over a sandbox PIJ_HOME) |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/how/pij.md` | yes | tail docs |
### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | TEST (RED): fixture transcript mixing kinds (text, receipt, cmd, bg) → `--type receipt` yields only receipt lines (text + `--json`); no `--type` → all; `--type bogus` → `E-ARG` listing the valid kinds (derive the list from the event-kind type, not a hand list) | pij-control-plane | RED on base | AC-25 |
| [ ] | T002 | IMPL filter + validation + help text | pij-control-plane | T001 GREEN | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/cli.ts` (help) |
| [ ] | T003 | DOCS + GATE + PR | — | 0 fail | AC-10 |
