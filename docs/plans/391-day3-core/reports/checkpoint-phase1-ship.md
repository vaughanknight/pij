# Checkpoint — Phase 1 (item 6) shipped to PR
## claim
PR #2 open for item 6, reviewed cold (APPROVE), rebased onto origin/main@2707705, full suite green post-rebase.
## artifacts[]
- https://github.com/vaughanknight/pij/pull/2
- docs/plans/391-day3-core/ship/2026-08-27/ship-report-item6.md
- docs/plans/391-day3-core/tasks/phase-1-item-6-long-context-gate/review-01.md (reviewer verdict)
- docs/plans/391-day3-core/tasks/phase-1-item-6-long-context-gate/execution.log.md (coder log)
- docs/plans/391-day3-core/fleet.md
## shas[]
- head 697b442 (rebased); reviewed 7ba1831; base origin/main 2707705
## gates[]
- `npx vitest run .pi/extensions/pij/` @697b442 → 171 passed | 2 skipped files; 3934 passed | 15 skipped; exit 0 (`docs/plans/391-day3-core/kept-logs/vitest-phase1-rebased.log.txt`)
- Dim-0 mutation gate: 5 mutations RED, restored (review-01.md § Dim-0)
- `tsc --noEmit` exit 0 (reviewer)
## observations[]
- DL-001 difficulty skill: /thesis not in Claude Skill registry (symlink ~/.agents/skills → ~/.claude/skills)
- CONF-001 confusion tooling: implementer notes cite core/daemon/daemon.ts (file is daemon.ts)
- DL-002 difficulty tooling: A2A body with backticks shell-expanded (pij send should warn / C10 mandate --body-file for code spans)
- DL-003 difficulty tooling: flow-pair observe diffs the working tree, not the committed delegation
- DL-004 difficulty tooling: pij canary first run times out on freshly bound copilot seats (2/2 today); second passes — wait for idle before nonce
- DL-005 difficulty tooling: flow-pair review verb cannot ingest a cold reviewer's findings (verdict law vs ledger writer)
- (new) pij queue output truncated at 64 KiB by exit-before-flush — becomes a Phase 2 add-on task (o-prime ask)
## open[]
- Merge PR #2 (o-prime). s392 rebases after.
- Phase 2 (item 1) dispatching now on `s391/item1-queue-retire` off origin/main, with the queue-listing add-on folded in.
