- id: DL-001
  kind: difficulty
  description: "u4 rust-analyzer returned zero AnomalyView references although explicit worktree grep found crates/store/tests/anomaly_dispositions.rs; scope-aware reference checks must reject false-empty worktree results"
  fp: 1aaf99ace5b5
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T03:39:28.699Z"
- id: DL-002
  kind: difficulty
  description: "Workflow HOLD (edits paused for PM validation) was mistakenly published as semantic hold, which blocks PM messages with operator-hold. Prime reported spine 17581; report state waiting restored delivery at spine 17706. Encode worker READY handoff to use waiting, never semantic hold; reserve hold for explicit operator input refusal."
  system:
    compound:
      status: open
      source: agent-self
