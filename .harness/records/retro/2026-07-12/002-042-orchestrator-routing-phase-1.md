---
record_kind: "retro"
harness_version: "0.11.0"
branch: "s042/orchestrator-routing-skill"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T05:37:24.317Z"
agent: "pij-vital-tiglon"
plan_id: "042-pij-orchestrator-routing-skill"
schema_version: "1.2"
retro_id: "2026-07-12T05:37:24Z-pij-vital-tiglon-972956b7efa5"
started_at: "2026-07-12T03:55:50.435Z"
ended_at: "2026-07-12T05:37:24.317Z"
summary: "Plan 042 phase-1 dogfood exposed worktree bootstrap, worker-silence, allowed-path alert, and mutating-check gaps; all four observations originated in the s042 worktree, while the main-checkout observation buffer was empty at drain."
entries:
  - id: DL-001
    kind: difficulty
    description: "First worktree boot failed because node_modules was absent; harness boot's envelope hid the TS2688 detail, requiring a second direct just typecheck run before npm ci"
    target: "worktree bootstrap and boot diagnostics"
    severity: annoying
    workaround: "Ran direct just typecheck to expose TS2688, then npm ci and re-ran harness boot."
    suggested_encoding: "Add a worktree bootstrap step or dependency symlink recipe and include compiler output in boot failures"
    fp: "972956b7efa5"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T03:55:50.435Z"
  - id: DL-002
    kind: difficulty
    description: "Plan 042 coder went idle for 45+ minutes mid-packet with no report; push-not-poll had no worker-silence watchdog, so the o-prime had to inspect the pane and prompt the orchestrator to nudge"
    target: "pij pair worker liveness"
    severity: degrading
    workaround: "Sent a COMPLETE/CONTINUING/BLOCKED status request, then adopted a 15-minute outage-first poke-before-redispatch cadence."
    suggested_encoding: "Add an orchestrator worker-liveness check: after a bounded quiet interval request interim COMPLETE/CONTINUING/BLOCKED status, distinct from daemon crash/stall detection"
    fp: "2311e07064f6"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T04:57:39.107Z"
  - id: DL-003
    kind: difficulty
    description: "Plan 042 coder modified .pi/packages.yaml outside the explicit packet allowlist; orchestrator scope check caught it before review and stopped the worker for byte-identical restoration and cause disclosure"
    target: "flow-pair scope enforcement"
    severity: degrading
    workaround: "Stopped the worker, classified the date-only diff, restored the file byte-identical, and resumed only after proof."
    suggested_encoding: "Make flow-pair or file-watch push an immediate alert when a worker changes a path outside delegation.allowedPaths"
    fp: "c38e3edc80d0"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T04:58:32.467Z"
  - id: GFT-001
    kind: gift
    description: "Root cause of the out-of-scope packages.yaml diff: harness checks --quick calls non-JSON pkg audit, whose documented refresh write-back updates vetted.date in the tracked manifest; a supposedly deterministic check mutates source"
    target: "harness checks pkg-audit sensor"
    severity: degrading
    workaround: "Classified the diff as timestamp-only known noise and restored packages.yaml after each gate."
    suggested_encoding: "Run pkg audit --json in checks/self-check for a read-only sensor; keep refresh as an explicit separate command"
    fp: "e17fabad3396"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T04:59:19.062Z"
---

# Retro — Plan 042 phase 1

All entries came from the isolated s042 worktree. The main checkout buffer was
empty when the post-coding drain ran, so no main-tree retro record was created.
