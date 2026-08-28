# Checkpoint — s391 day-3 core — mid-stream rollup (2026-08-28 ~18:30Z)

## claim
Eight of the stream's items are merged and live on the daemon (6, 1a, 1, 5+C, 1b, 4, 6b, 13); item 15 is in build on the post-#24 base; items 16, 19, 25, 26, 27, 28 are fully prepared (dossier, packet, addendum, review brief, dispatch message, PR skeleton, branch ref) and dispatch in the ruled order as each PR lands.

## artifacts[]
- PRs: #2 (6), #3 (1a), #9 (1), #11 (5+C), #14 (1b), #18 (4), #22 (6b), #24 (13) — all merged.
- `docs/plans/391-day3-core/391-day3-core-plan.md` v1.16.0 (12 phases); `rulings.md` (every ruling/notice, time-stamped); `fleet.md` (roster, canaries, incidents); `ship/2026-08-27/ship-report-item*.md` ×8; `tasks/phase-*/review-01.md` ×8 (cold verdicts, Dim-0 evidence); `tasks/phase-*/tasks.md` ×12.
- Observations buffer: `.harness/temp/agent/session-buffer.md` (DL-001…DL-011, CONF-001, INS-001, INS-002).

## shas[]
- origin/main `e46eec8a` (post-#24); item 15 branch wip `b9a9e43` on it.

## gates[]
- Every merged PR: cold cross-model review (claude-opus-5) with sha-verified RED→restore→GREEN mutations (verdict files above) + full vitest 0-fail post-rebase (logs in `~/.pij/pij-associated-louse/bg-*.log`). Known-red baseline untouched (`release-age-policy.test.ts` needs pwsh; pre-existing lint in `producers/osc-7337-producer.ts`).

## observations[] (id / kind / layer / one-liner / suggested encoding)
- DL-001 difficulty skill — /thesis, /validate-v2 only under ~/.agents/skills; not in Claude Code's Skill registry → symlink into ~/.claude/skills (as pij is).
- CONF-001 confusion tooling — implementer notes cited core/daemon/daemon.ts; file is daemon.ts → generate citations from git ls-files.
- DL-002 difficulty tooling — inline pij send body with backticks shell-expanded → warn on inline bodies with backticks/$(); C10 mandates --body-file (now in orient-local).
- DL-003 difficulty tooling — flow-pair observe diffs the working tree, not the committed delegation → observe base..HEAD when the tree is clean.
- DL-004 difficulty tooling — pij canary first run on a fresh copilot seat times out (5/5 seats) → wait for idle before the nonce / longer ack budget when bound <60 s.
- DL-005 difficulty tooling — flow-pair review cannot ingest a cold reviewer's findings → --findings <json>.
- DL-006 difficulty tooling — stale spine write.lock after restart #1 (dead pid) → item 15.
- DL-007 difficulty tooling — hand-composed timestamps (local date + UTC clock) → clock-derived stamps only; lint for future 'Z' stamps.
- DL-008 difficulty tooling — busy-but-wedged copilot seat read `working`; queued /compact read `paused (compact)` → item 25.
- DL-009 difficulty tooling — join-pane read as terminal absence → item 26.
- DL-010 difficulty tooling — RPC-driven copilot work invisible to the runtime axis (idle while mid-turn) → item 25 inverse case.
- DL-011 difficulty tooling — a message delivered twice across restart #4 with one sqlite row → dedupe on messageId in the RPC adapter / verify RPC ack before acked.
- INS-001 insight tooling — merge-tree tip-vs-main predicts a squash merge, not a rebase → predict per commit or run the rebase in a throwaway worktree.
- INS-002 insight tooling — pane bottom line is not a liveness signal when the composer queue renders; pij tail (tool calls) is.

## open[]
- Item 15 in build (dlg-0019); then 16 → 19 → 25 → 26 → 27 → 28 per the ruled order.
- Deferred-and-named per PR: item 1b's G-2..G-5 (→ 13, landed), Phase 5's FX-1/FX-2 (→ Phase 6 T004b/T004c), 6b's R-1 (note write-only), Phase 4's G-1/G-2 (unconditional append unpinned; duplicated advice).
