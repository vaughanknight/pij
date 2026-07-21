---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s061/team-scaffold"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-20T12:28:11.099Z"
agent: agent
plan_id: 061-team-scaffold
schema_version: "1.2"
retro_id: "2026-07-20T12:30:00Z-agent-p2drain"
started_at: "2026-07-20T12:27:35.757Z"
ended_at: "2026-07-20T12:30:00Z"
summary: "retro --drain P2 phase-end save (2 entries, orchestrator bucket) — dispatch-receipts phase with one FIX_REQUIRED cycle"
entries:
  - id: DL-001
    kind: difficulty
    description: "flow-pair observe refused diff capture because MY orchestration writes (the-flow.json receipts via harness flow CLI) shared the working tree with the coder's code — forced a mid-phase split-commit of orchestration state before the diff could be captured. The observe verb diffs the whole tree vs HEAD with no way to scope to the delegation's allowed paths."
    target: tooling
    severity: annoying
    workaround: "commit orchestration state separately, then observe"
    suggested_encoding: "flow-pair observe --paths <allowlist> scoping, or diff vs a recorded dispatch-time baseline ref"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T12:27:35.757Z"
  - id: INS-001
    kind: insight
    description: "W-002 ack contract had a latent impossibility found only at build: packet header must be runnable pre-send, but transport messageId is allocated at deliver-time — ack re-keyed to preallocated dispatch id (provisional amendment). Workshop-level contracts that name runtime-allocated identifiers should be checked against allocation timing at workshop time."
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-20T12:27:35.848Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — 061-team-scaffold P2 (orchestrator bucket)

P2 (Dispatch receipts) phase-end drain. One FIX_REQUIRED cycle this phase —
the reviewer's vacuous-assertion find (terminal-output rule) is recorded in
rev-0002-approval.md as a carried lesson for P3 test tasks, not as a buffer
entry (it is already encoded in the P3 tasking input).
