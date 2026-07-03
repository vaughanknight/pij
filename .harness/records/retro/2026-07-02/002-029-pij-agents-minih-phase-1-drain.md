---
schema_version: "1.0"
retro_id: "2026-07-02T23:25:22Z-pij-drain029p1"
agent: pij
plan_id: 029-pij-agents-minih
started_at: "2026-06-23T11:44:51.122Z"
ended_at: "2026-07-02T23:25:22Z"
summary: "retro --drain post-coding phase-1 save (6 entries, incl. cross-session leftovers)"
entries:
  - id: DL-001
    kind: difficulty
    description: "Spawned cheap/weak-model pij worker (gpt-5.4-mini) did not auto-report task completion to the orchestrator; the human had to relay it. The flow-pair dispatch packet said 'report back to me (pij-70pmv1)' but never named the MECHANISM (the pij_send tool). The sonnet coder and gpt-5.5 reviewer auto-reported fine — weaker/cheaper models don't infer the report-back mechanism."
    target: "skill"
    severity: "annoying"
    workaround: "Human manually relayed the worker's completion"
    suggested_encoding: "flow-pair dispatch packets must state the explicit report-back mechanism (e.g. 'when done, call pij_send({to:\"<orchestrator-id>\", message:...})'), especially for cheaper models; add as a standard packet footer in skills/flow-pair/SKILL.md"
    first_seen_at: "2026-06-23T11:44:51.122Z"
    system:
      compound:
        status: open
  - id: DL-002
    kind: difficulty
    description: "Coder reported 'harness checks --quick' lint GREEN, but a direct biome check on the changed dir flagged an unused STORE_NAME import left dead by the session-sql edit. The quick gate's lint did not surface a warning that biome-on-changed-files caught."
    target: "project-sensor"
    severity: "annoying"
    workaround: "Ran biome on the 3 changed files before commit; removed the dead import"
    suggested_encoding: "make harness checks (incl --quick) lint surface biome warnings on changed files, or document --quick lint as error-only so coders biome their touched files pre-commit"
    first_seen_at: "2026-06-23T11:44:51.191Z"
    system:
      compound:
        status: open
  - id: SUGG-001
    kind: improvement-suggestion
    description: "flow-pair: persist the fleet roster (role -> {pijId,paneId,model,spawnedByUs}) in run.json + run.schema.json for crash-safe teardown"
    target: "skill"
    first_seen_at: "2026-06-23T11:44:51.254Z"
    system:
      compound:
        status: open
  - id: SUGG-002
    kind: improvement-suggestion
    description: "flow-pair: add a 'flow-pair tidy --run-id' subcommand that closes only spawnedByUs colleagues, crash-safe via the ledger roster"
    target: "skill"
    first_seen_at: "2026-06-23T11:44:51.321Z"
    system:
      compound:
        status: open
  - id: SUGG-003
    kind: improvement-suggestion
    description: "flow-pair: add --coder-model/--reviewer-model flags + a canary/dead-peer health check on dispatch"
    target: "skill"
    first_seen_at: "2026-06-23T11:44:51.385Z"
    system:
      compound:
        status: open
  - id: SUGG-004
    kind: improvement-suggestion
    description: "flow-pair: fill the orchestrator-worker-protocol.md stub (fleet lifecycle + packet/report schema)"
    target: "skill"
    first_seen_at: "2026-06-23T11:44:51.451Z"
    system:
      compound:
        status: open
system:
  compound:
    bubble_action: "all-save"
---
