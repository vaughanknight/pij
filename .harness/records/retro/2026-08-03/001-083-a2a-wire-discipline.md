---
schema_version: "1.2"
retro_id: "2026-08-03T08:50Z-pij-rural-shrimp-083wd"
agent: pij-rural-shrimp
plan_id: 083-a2a-wire-discipline
started_at: "2026-08-03T08:46:19.134Z"
ended_at: "2026-08-03T08:50:00Z"
summary: "retro --drain session-end save (2 entries)"
entries:
  - id: DL-001
    kind: difficulty
    description: "harness boot --json returned a transient {status:error, stages:[]} envelope on first call, clean ok on immediate identical re-run — forced a guess-and-retry to interpret"
    severity: annoying
    target: harness-itself
    fp: "2e72b6259827"
    disposition: kept
    first_seen_at: "2026-08-03T08:46:19.134Z"
  - id: DL-002
    kind: difficulty
    description: "harness flow status --to done silently no-ops on an assumed-status node when output is redirected: assumed→done needs the assumed→known hop first, and the failure printed nothing actionable — cost a debugging loop to spot the stale node"
    severity: degrading
    target: harness-itself
    fp: "505d0bd23e9a"
    disposition: kept
    first_seen_at: "2026-08-03T08:46:19.261Z"
system:
  compound:
    bubble_action: "all-save"
---
