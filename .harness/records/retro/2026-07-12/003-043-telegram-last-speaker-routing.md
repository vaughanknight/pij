---
record_kind: "retro"
harness_version: "0.11.0"
branch: "s043/telegram-last-speaker-routing"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T08:49:28.534Z"
agent: "pij-rigid-minnow"
plan_id: "043-telegram-last-speaker-routing"
schema_version: "1.2"
retro_id: "2026-07-12T08:49:28Z-pij-rigid-minnow-b5704bd6"
started_at: "2026-07-12T06:44:30.181Z"
ended_at: "2026-07-12T08:49:28.534Z"
summary: "Phase-end drain: seven coordination, flow-pair, mutation, and smoke-harness observations from Plan 043."
entries:
  - id: COORD-001
    kind: coordination
    description: "A granted implementation worktree omitted its validated plan folder, so guided Builder could not resume without an o-prime handoff."
    target: "worktree provisioning"
    severity: blocking
    suggested_encoding: "Make stream worktree allocation include or deterministically transplant the validated plan artifacts before DISPATCH."
    fp: "6f7fe602cd51"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T06:44:30.181Z"
  - id: DL-001
    kind: difficulty
    description: "The /pij pair route requires model overrides and roster persistence, but flow-pair start ignores coder/reviewer model flags and run.json has no roster field; s043 used the authorized plan-roster truth instead."
    target: "flow-pair roster contract"
    severity: degrading
    workaround: "Persist docs/plans/043-telegram-last-speaker-routing/reports/fleet-roster.md before spawning peers."
    suggested_encoding: "Add roster/model fields and CLI flags to flow-pair run schema/start, or update the pair route to name plan-roster truth as the supported contract."
    fp: "a84f5a3e6d94"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T06:48:31.765Z"
  - id: DL-002
    kind: difficulty
    description: "Full smoke gate stalls at Pi's 'Do not trust (this session only)' workspace prompt and times out instead of auto-selecting the deterministic trust choice."
    target: "just smoke"
    severity: degrading
    workaround: "Inspect the smoke driver trust handling and retry without changing product scope."
    suggested_encoding: "Teach the smoke driver to detect and answer Pi's workspace trust prompt before waitIdle."
    fp: "8c4490f23395"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T07:25:18.337Z"
  - id: DL-003
    kind: difficulty
    description: "After project trust, smoke Pi exits because globally linked pij extensions and project-local copies register duplicate tool names."
    target: "harness smoke"
    severity: degrading
    workaround: "Run smoke with a temporary PI_CODING_AGENT_DIR copied from the user agent dir but excluding global extension symlinks."
    suggested_encoding: "Make the Driver SDK isolate global extension links when cwd already supplies the same project extensions."
    fp: "b5704bd6698e"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T07:31:29.855Z"
  - id: DL-004
    kind: difficulty
    description: "Reviewer brief mutation command failed because flow-pair-mutate treated the supplied just test command as a recipe name."
    target: "flow-pair mutation proof"
    severity: degrading
    workaround: "Inspect recipe argument contract and retry with the accepted test command form."
    suggested_encoding: "Make flow-pair-mutate accept an arbitrary quoted command or emit usage showing the expected recipe argument."
    fp: "34e2b7c8b64f"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T08:05:22.694Z"
  - id: DL-005
    kind: difficulty
    description: "Full harness checks failed because the smoke driver lost tmux panes during capture."
    target: "tmux smoke driver"
    severity: degrading
    workaround: "Retry the isolated smoke sensor once before classifying the failure."
    suggested_encoding: "Make smoke pane capture report process exit/root cause and retry transient missing-pane captures deterministically."
    fp: "86b39326198c"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T08:09:26.731Z"
  - id: DL-006
    kind: difficulty
    description: "flow-pair review cannot ingest a real reviewer peer's findings: its CLI only checks execution.log and would record APPROVE for s043 despite two HIGH findings, so flow-pair fix cannot safely generate the narrowed packet."
    target: "flow-pair review/fix contract"
    severity: degrading
    workaround: "Treat reviews/review.phase-1.md as law and persist a plan-scoped fix packet with exact allowed files."
    suggested_encoding: "Add --findings/--review-artifact ingestion to flow-pair review so the peer verdict is persisted and flow-pair fix can consume it without hand-editing the ledger."
    fp: "2fff0e304544"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T08:13:02.625Z"
---

# Retro — Plan 043 phase end

Highest leverage: isolate global extension links in smoke by default so worktree gates run without reconstructing a temporary Pi agent environment.
