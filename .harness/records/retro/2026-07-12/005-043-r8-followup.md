---
record_kind: "retro"
harness_version: "0.11.0"
branch: "s043/telegram-last-speaker-routing"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T09:51:12.747Z"
agent: "pij-rigid-minnow"
plan_id: "043-telegram-last-speaker-routing"
schema_version: "1.2"
retro_id: "2026-07-12T09:51:12Z-pij-rigid-minnow-d0a480a5"
started_at: "2026-07-12T09:28:57.229Z"
ended_at: "2026-07-12T09:51:12.747Z"
summary: "R8 follow-up drain: flow-pair observe could not exclude orchestrator-owned Builder state."
entries:
  - id: DL-001
    kind: difficulty
    description: "flow-pair observe rejects a delegation diff whenever orchestrator-owned the-flow files are dirty, with no exclusion flag, so post-ship follow-up code cannot be snapshotted without violating Builder's single-writer state contract."
    target: "flow-pair observe contract"
    severity: degrading
    workaround: "Review the bounded git diff against HEAD with explicit allowed paths while preserving the flow files."
    suggested_encoding: "Add --exclude-paths/default flow-state exclusions to flow-pair observe, matching context-pack forbidden paths."
    fp: "d0a480a54c48"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T09:28:57.229Z"
---

# Retro — Plan 043 R8 follow-up

The review stayed correct by using an explicitly bounded git diff while preserving Builder's CLI-owned flight state.
