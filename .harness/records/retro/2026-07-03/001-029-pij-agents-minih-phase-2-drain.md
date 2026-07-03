---
schema_version: "1.0"
retro_id: "2026-07-03T00:55:54Z-agent-drain029p2"
agent: agent
plan_id: 029-pij-agents-minih
started_at: "2026-07-03T00:55:07.526Z"
ended_at: "2026-07-03T00:55:54Z"
summary: "retro --drain post-coding phase-2 save (2 entries — flow-pair orchestration friction)"
entries:
  - id: DL-001
    kind: difficulty
    description: "flow-pair CLI review/fix/accept verbs are stubs (Phase 6 unbuilt): 'flow-pair review' silently records verdict:APPROVE with zero findings without any review happening — an orchestrator calling it before the reviewer returns creates a false ledger record (happened this run; deleted and hand-persisted). Fix packets + verdicts currently hand-written into the run dir."
    target: "skills/flow-pair/lib"
    severity: "degrading"
    workaround: "rm the bogus record; Write real verdict JSONs into reviews/ manually"
    suggested_encoding: "implement flow-pair review --verdict/--findings-file to record the REVIEWER's verdict, and make the stub exit 2 unconfigured instead of fabricating APPROVE"
    first_seen_at: "2026-07-03T00:55:07.526Z"
    system:
      compound:
        status: open
  - id: SUGG-001
    kind: improvement-suggestion
    description: "flow-pair worker packets carry no standing quality-bar clause for advertised CLI flags: dlg-0002's coder parsed --permissions/--cwd but never propagated them (silent no-op on public flags, caught by cross-model review round 1). A packet-template line 'every advertised flag needs a regression test asserting its EFFECT on the run artifact, not just its parsing' would have prevented the round trip."
    target: "skills/flow-pair/references/templates"
    severity: "degrading"
    first_seen_at: "2026-07-03T00:55:07.692Z"
    system:
      compound:
        status: open
system:
  compound:
    bubble_action: "all-save"
---
