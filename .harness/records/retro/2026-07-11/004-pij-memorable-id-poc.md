---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-11T10:56:41.744Z"
agent: copilot
plan_id: null
schema_version: "1.2"
retro_id: "2026-07-11T10:56:41Z-copilot-5c96"
started_at: "2026-07-11T10:55:09.936Z"
ended_at: "2026-07-11T10:56:41.744Z"
summary: "Built and proved a deterministic memorable pij-id prototype, then isolated the new package's audit impact from the repository's existing vulnerability baseline."
entries:
  - id: SUGG-001
    kind: improvement-suggestion
    description: "Comparing npm audit before and after a dependency install required a manual JSON diff because the repo already has 34 baseline findings."
    target: tooling
    severity: annoying
    suggested_encoding: "Add a just dependency-audit-delta recipe that snapshots baseline counts and reports only newly introduced advisories."
    fp: "5c96bcd1b064"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T10:55:09.936Z"
---

# Retro — pij memorable ID PoC
