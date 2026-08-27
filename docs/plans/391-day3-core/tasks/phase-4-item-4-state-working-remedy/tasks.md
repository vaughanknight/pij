# Phase 4: Item 4 — `--state working` remedy (ruled (c-remedy)) — tasks dossier

**Plan**: `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/plans/391-day3-core/391-day3-core-plan.md` § Phase 4, AC-09 · **Branch/PR**: `s391/item4-card-working` off `main` · **Domains**: pij-orchestration (anomalies) · pij-control-plane (core cli) · **CS**: 1
**Ruling R-4 (c-remedy)** (`rulings.md` 08:47Z): predicates untouched; the E-ARG rejection at `core/cli.ts:1646` carries the remedy line; the same remedy line goes into the status-stale anomaly detail; a test pins that `--state working` still rejects AND prints the remedy; NOT (c-alias). `role.ts` and `SEMANTIC_STATES` are UNTOUCHED.

### Executive Briefing
- **Purpose**: `pij report now --state working` is rejected with no remedy; the briefed "fix" (exempt working seats from status-stale) would have deleted the detector (`core/anomalies.ts:636-645` already flags only actively-emitting seats). The ruled fix makes the rejection and the anomaly detail teach the right move, and adds the fixture that pins the detector cannot be deleted silently.
- **Non-Goals**: ❌ any change to `SEMANTIC_STATES` (`core/types.ts:110`), `cardCanMislead` (`role.ts:123`), the rail, or the status-stale predicate · ❌ accepting `working` as a state.

### Pre-Implementation Check
| File | Exists? | Notes |
|---|---|---|
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.ts` | yes | `--state` validation `:1646-1647` rejects non-`SEMANTIC_STATES` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.test.ts` | yes | parse/report tests |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/anomalies.ts` | yes | status-stale detail text `:676-683`; scope gate `:630`; freshness `:636-640`; parked exemption `:645` |
| `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/anomalies.test.ts` | yes | `describe("status-stale (the card a busy seat forgot to update)")` `:891`; `busy()` fixture `:894` sets no `systemState` |
| `docs/how/pij.md` | yes | report/state section |

### Tasks
| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [x] | T001 | TEST (RED) `core/cli.test.ts`: `report now "<did>" "<next>" --state working` → still `E-ARG`; message contains `working` + "mechanical" (daemon-owned), the literal `pij report now "<did>" "<next>"`, and `waiting|hold|blocked|question` | pij-control-plane | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.test.ts` | RED (message text) | AC-09 |
| [x] | T002 | TEST (RED) `core/anomalies.test.ts`: a pm seat with `systemState:"working"`, fresh `lastEventAt`, old `statusAt` STILL raises `status-stale` AND its `detail` contains the remedy line; mutation-proof in the execution log: invert the freshness predicate → this fixture goes GREEN-by-absence (i.e. test RED) → restore | pij-orchestration | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/anomalies.test.ts` | RED (detail text) | AC-09; detector-non-deletion guard |
| [x] | T003 | IMPL `core/cli.ts:1646`: remedy-bearing E-ARG text; `core/anomalies.ts:676-683`: same remedy line appended to the status-stale detail | both | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/cli.ts`, `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/core/anomalies.ts` | T001/T002 GREEN | wording identical in both places (single exported const) |
| [x] | T004 | DOCS `docs/how/pij.md` report/state section: "working is the mechanical axis; refresh with pij report now; park with --state …" | docs | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/docs/how/pij.md` | present | |
| [x] | T004b | (carried from Phase 3 review-01 F-1, low) TEST: pin the pointer info line's POSITIVE content in `daemon-tmux.test.ts` — asserts the `ℹ️` glyph AND the honest Enter-attempt count (the `enterAttempts` increment and the info prefix each survived a mutation) | pij-control-plane | `/Users/vaughanknight/GitHub/pij-worktrees/s391-day3-core/.pi/extensions/pij/adapters/daemon-tmux.test.ts` | RED by mutation (drop increment / drop glyph) → GREEN | carried |
| [x] | T005 | GATE vitest green; pathspec commit; report | — | git root | 0 fail | AC-10 |

### Discoveries & Learnings
| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
