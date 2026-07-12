---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-11T23:56:06.449Z"
agent: agent
plan_id: "040-memorable-pij-session-ids"
schema_version: "1.2"
retro_id: "2026-07-11T23:56:06Z-agent-b47bd28f18b2"
started_at: "2026-07-11T23:46:33.556Z"
ended_at: "2026-07-11T23:56:06.449Z"
summary: "The Plan 040 review exposed a mixed-version observability gap and required a clean extracted-tree workflow because concurrent worktree edits contaminated whole-tree gates."
entries:
  - id: INS-001
    kind: insight
    description: "Memorable-id descriptors minted by the new CLI while the shared daemon still runs pre-change registry code can bind and send outward but cannot receive inward until the daemon restarts."
    target: runtime-inspectability
    severity: degrading
    workaround: "Use a classic-id reviewer for review-before-restart; retain a memorable peer for post-restart delivery proof."
    suggested_encoding: "Add mixed-version rollout coverage or a clear diagnostic when the daemon cannot route a descriptor written by a newer registry format."
    fp: "96715c37c6a5"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T23:46:33.556Z"
  - id: DL-001
    kind: difficulty
    description: "Whole-tree lint during the s040 review was contaminated by an unrelated concurrent formatting change outside review-input.patch, so patch-scoped verification required a clean extracted tree."
    target: review-isolation
    severity: degrading
    workaround: "Extract HEAD to a temporary tree, apply only the frozen review patch, symlink dependencies, and run scoped checks there."
    suggested_encoding: "Add a harness command that applies a captured review patch to a clean temporary tree and runs scoped checks."
    fp: "b47bd28f18b2"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T23:53:47.374Z"
---

# Retro - Plan 040 memorable session ids review

The highest-leverage improvement is a first-class patch-isolated review command:
the frozen-patch workflow was reliable, but rebuilding it by hand is unnecessary
inference and should become deterministic harness substrate.
