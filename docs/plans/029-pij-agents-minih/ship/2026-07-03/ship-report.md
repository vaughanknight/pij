# Ship Report — pij-agents-minih

**Generated**: 2026-07-03T02:02:00Z
**Branch**: main → **Base**: main (direct-to-main, per repo convention + explicit user instruction)
**PR**: none — user requested commit + push on main; PR path intentionally not taken
**State**: pushed

## Checks

No PR → no `gh pr checks` watch. Local gate at ship time: `just self-check` exit 0
(1404 passing / 7 skipped), `bash scratch/agent-json-consume.sh` exit 0,
`PIJ_AGENT_LIVE=1` live suite green during Phase 1 (real claude 131s + codex 117s),
AC-08 proven live against the real fs2 graph.

**Verdict**: local gates green; no CI watch applicable.

## Repo guidance applied

- PR template: n/a (no PR opened)
- Base: main (repo convention — recent history commits directly to main)
- Reviewers: cross-model flow-pair review in-run (copilot/gpt-5.5 xhigh) — rev-0001
  APPROVE, rev-0002 FIX_REQUIRED → fix-0001 → rev-0003 APPROVE

## Deferred & Noteworthy

_Everything punted across the build that's about to ship — surfaced so the go-decision is informed. Never a blocker._

| Kind | Item | Where | Reason / note |
|------|------|-------|---------------|
| Noteworthy | Un-ejected built-ins always run ephemeral (never record) | `core/agents/cli-verbs.ts` (`ephemeral \|\| source === "builtin"`) | Deliberate reversible default — `pij agent eject` gets recorded runs; a `~/.pij` runs-redirect alternative was considered and not taken |
| Deferred | First-class session-resident companion verb (`pij agent companion`) | `docs/how/pij-agents.md` § Companion | Upstream wishlist pointer only; both companion paths ship as configuration-only (AC-11) |
| Deferred | Agent-pack-as-peer (spawn packs into tmux panes, addressable via pij send) | user request 2026-07-03 | Explicitly new scope — being set up as a follow-on subtask on this plan |
| Noteworthy | flow-pair CLI review/fix/accept verbs are stubs that fabricate APPROVE | `.harness/records/retro/2026-07-03/001-*.md` DL-001 | Harness-skill defect, not plan-029 code; verdicts in this run's ledger were hand-persisted; improve-offer open |
| Noteworthy | TODO/FIXME sweep of shipped diff | test fixtures only | No real markers introduced |

All 13 acceptance criteria ticked (AC-01..13); no skipped/blocked tasks open.

## Resume

- No PR/merge pending. Follow-on feature (agent-pack-as-peer) rides as a subtask on this plan.
