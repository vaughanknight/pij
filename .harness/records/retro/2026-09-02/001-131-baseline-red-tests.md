---
record_kind: "retro"
harness_version: "0.14.0"
branch: "131-baseline-red-tests"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-09-02T04:06:25.440Z"
agent: "pij-ripe-moth"
plan_id: "131-baseline-red-tests"
schema_version: "1.2"
retro_id: "2026-09-02T04:06:33Z-pij-ripe-moth-430152"
started_at: "2026-09-02T02:35:19.461Z"
ended_at: "2026-09-02T04:06:33Z"
summary: "Plan 131 fixed the npm quarantine fail-open and macOS worktree teardown red, while exposing search-index, diagnostic-output, task-state, and cross-daemon coordination friction."
entries:
  - id: CONF-001
    kind: confusion
    description: "Plan 131 PM packet points to .agents/skills/pij-team/TENETS.md, but that path is absent in this worktree; the installed skill must be used instead."
    fp: 653d1df5d7ed
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-02T02:35:19.461Z"
  - id: DL-001
    kind: difficulty
    description: "FlowSpace semantic search for worktree-test cleanup timed out after 60 seconds even after starting the daemon; a path-scoped retry is required."
    fp: edc0fd51ae81
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-02T02:37:57.256Z"
  - id: DL-002
    kind: difficulty
    description: "FlowSpace path-scoped search matched zero indexed .pi paths even though the target worktree code exists there; the central index omits this repo's hidden extension tree."
    fp: e0204d052048
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-02T02:38:46.224Z"
  - id: DL-003
    kind: difficulty
    description: "Plan 131 preflight boot passed typecheck but full just test failed in an out-of-scope cli.integration.test.ts spawn assertion with exit 143 while other worktrees are active; final gate must determine whether this shared-environment red persists."
    fp: 17d46b78030a
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-02T02:43:10.216Z"
  - id: CONF-002
    kind: confusion
    description: "Builder implement instructions require marking tasks in progress, but ddocs builder/plan state vocabulary only permits unchecked, checked, blocked, human-skipped, or na; no in-progress state exists."
    fp: 6ab5dd4b8b8d
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-02T02:43:45.858Z"
  - id: DL-004
    kind: difficulty
    description: "Three full harness checks runs have reported the test stage red while standalone full just test runs from the same worktree are green; the checks envelope truncates the failing test tail in normal agent output, requiring a separate jq-shaped rerun to diagnose."
    fp: 15dd46a6f486
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-02T03:21:16.595Z"
  - id: DL-005
    kind: difficulty
    description: "Reviewer spawn registered only in the legacy pij daemon while normal sends routed to pij-rs, which reported no row; delivery required PIJ_DAEMON_GENERATION=legacy plus explicit PIJ_SESSION_ID to avoid a false self-send."
    fp: 0728645c9d60
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-02T03:44:13.022Z"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "Local npm 11.5.1 can prove fail-closed refusal but cannot execute the supported npm>=11.10.0 quarantine-enforcement arm"
    target: project-sensor
    severity: degrading
    suggested_encoding: "add a deterministic supported-npm matrix job that runs the enforcement arm with npm 11.10.0 or newer"
    fp: 430152fa4cc0
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-09-02T04:06:01.924Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — Plan 131 baseline red tests

Eight observations saved for terminal harvest and later encoding.
