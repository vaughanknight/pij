---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s046/pij-real-trees"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-13T11:54:33.370Z"
agent: "pij-condemned-cockroach"
plan_id: "046-pij-real-trees"
schema_version: "1.2"
retro_id: "2026-07-13T11:54:33Z-pij-condemned-cockroach-5c8b8fd5"
started_at: "2026-07-12T21:54:20.759Z"
ended_at: "2026-07-13T11:54:33.370Z"
summary: "Plan 046 shipped durable pij trees through repeated coder/reviewer tranches, scratch-first topology proof, full smoke recovery, hosted CI, merge, and canonical live-registry validation."
entries:
  - id: CONF-001
    kind: confusion
    description: "flow-pair pair route documents coder/reviewer model flags and ledger roster fields that the installed CLI/schema do not support; plan-owned roster required"
    target: "skills/flow-pair/lib/cli.ts"
    severity: degrading
    workaround: "Persist models/effort/peer ids in the stream plan roster; never hand-edit .flow-pair"
    suggested_encoding: "Align pair route with CLI or add CLI-owned roster/model configuration"
    fp: "5c8b8fd5aa8d"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T21:54:20.759Z"
  - id: MW-001
    kind: magic-wand
    description: "When a smoke child exits before readiness, report executable argv, exit status, and final pane output automatically."
    target: "project-sensor"
    severity: degrading
    workaround: "Use tmux remain-on-exit and capture the dead pane manually."
    suggested_encoding: "Add fail-loud boot provenance to the Driver SDK error report."
    disposition: deferred
    system:
      compound:
        status: open
        source: user
        first_seen_at: "2026-07-13T10:00:00.000Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — 046 pij real trees

Detailed timings, failed approaches, permanent encodings, and the eight prime-captured
observations are mirrored in `reports/t012-ship-retro.md`.
