---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s074/pij-rail-v2"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-29T06:00:46.645Z"
agent: "pij-gigantic-marmoset"
plan_id: null
schema_version: "1.2"
retro_id: "2026-07-29T06:01:00Z-pij-gigantic-marmoset-a94d65d2a1bb"
started_at: "2026-07-29T05:48:12Z"
ended_at: "2026-07-29T06:01:00Z"
summary: "Reviewed Phase 3 report-family commit a94d65d against 67b4af5. The first-person guard and record compatibility passed mutation and differential probes, but stale post-lock descriptor reads on report state, clear, and verify remain unprotected by tests, so the review requires a fix round."
entries:
  - id: DL-001
    kind: difficulty
    description: "Detached commit-review worktrees lack project-local Pi package state, so smoke can time out cloning an extension despite the reviewed commit passing the same gate in its active worktree."
    target: tooling
    severity: degrading
    workaround: "Ran the full harness checks in the clean active worktree after exact-commit mutation and differential tests."
    suggested_encoding: "Add a review-worktree bootstrap that links or provisions managed Pi package state before smoke."
    fp: "dd03d71ad373"
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-29T05:59:09.564Z"
  - id: DL-002
    kind: difficulty
    description: "The concurrent descriptor reread test protects only report now; replacing the three sibling state/clear/verify post-lock rereads with their stale pre-lock descriptor still left all 326 core CLI tests green."
    target: project-sensor
    severity: degrading
    workaround: "Traced the source manually and retained the correct rereads; require sibling race tests before accepting the phase."
    suggested_encoding: "Extract a shared reporting-seat refresh seam or add a table-driven lock-hook race fixture for state, clear, and verify."
    fp: "8c0daed21641"
    disposition: task
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-29T06:00:13.053Z"
---

# Retro — s074 Phase 3 review
