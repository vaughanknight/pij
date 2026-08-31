---
record_kind: "retro"
harness_version: "0.13.0"
branch: "s108/w7-sidecars"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-08-30T23:52:40.900Z"
agent: "pij-mammoth-ostrich"
plan_id: "108-rust-port"
schema_version: "1.2"
retro_id: "2026-08-30T23:52:55Z-pij-mammoth-ostrich-4335906a"
started_at: "2026-08-30T22:29:24Z"
ended_at: "2026-08-30T23:52:55Z"
summary: "Delivered and live-fired all three Rust sidecars; two harness defects were encountered and encoded during the run."
entries:
  - id: DL-001
    kind: difficulty
    description: "shared CARGO_TARGET_DIR reused test artifacts built from another worktree's unpushed source and produced a false gate verdict"
    target: tooling
    severity: blocking
    workaround: "reran the gate in a fresh private target directory"
    suggested_encoding: "use per-worktree target dirs by default or content-addressed sccache; add a guard against shared Cargo target paths across worktrees"
    fp: "4335906a5084"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-30T23:52:25.175Z"
        resolved_by: "PM ruling withdrew shared CARGO_TARGET_DIR; final gates use private targets"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "sidecar producer route and client each passed tests but no test connected them, allowing successful work to be reported as failure"
    target: project-sensor
    severity: degrading
    workaround: "aborted live-fire after observing the false failure and restored the production Telegram bridge"
    suggested_encoding: "retain the shipped DaemonClient-to-route sidecar producer integration test"
    fp: "ba8710ad834c"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-08-30T23:52:25.177Z"
        resolved_by: "4ed7ee70"
---

# Retro — 108 Rust sidecars

Both recurring failures moved into deterministic controls during the same run.
