---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s061/team-scaffold"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-20T11:34:40.271Z"
agent: pij-shy-justine
plan_id: 061-team-scaffold
schema_version: "1.2"
retro_id: "2026-07-20T11:34:40Z-pij-shy-justine-p1drain"
started_at: "2026-07-20T11:24:06.021Z"
ended_at: "2026-07-20T11:34:40Z"
summary: "retro --drain P1 phase-end save (2 entries, coder bucket pij-shy-justine) — independently converges with orchestrator DL-004/CONF-001"
entries:
  - id: DL-001
    kind: difficulty
    description: "Task packet allowlist omitted transitive recovery callers and acceptance fixtures for a required signature widening"
    target: tooling
    severity: degrading
    workaround: "Pause implementation, persist the conflict, and request two narrow addenda"
    suggested_encoding: "Add a task-packet validator that traces changed function call sites and fixture constructors into the generated allowlist"
    fp: "b4b8d8efb6b2"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T11:24:06.021Z"
  - id: DL-002
    kind: difficulty
    description: "Full-suite gates repeatedly timed out timing-sensitive tests that passed in isolation, obscuring product regressions"
    target: project
    severity: degrading
    workaround: "Run isolated failing files and obtain an explicit T15 ruling"
    suggested_encoding: "Maintain a machine-readable known-flake manifest keyed by test name and contention-only signature"
    fp: "ae5559689dee"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T11:24:26.921Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — 061-team-scaffold P1 (coder bucket)

The coder's own captures, drained by the orchestrator at phase end. Both pair
with orchestrator-bucket record 001 (DL-004 = allowlist tracing; CONF-001 =
known-flake manifest): the same frictions observed independently from both
seats in one phase.
