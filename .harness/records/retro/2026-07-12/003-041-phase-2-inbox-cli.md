---
record_kind: "retro"
harness_version: "0.11.0"
branch: "s041/inbox-no-tmux"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-12T08:53:23.733Z"
agent: agent
plan_id: 041-pij-inbox-no-tmux
schema_version: "1.2"
retro_id: "2026-07-12T08:53:23Z-agent-9bd130fe3dae"
started_at: "2026-07-12T05:02:51.629Z"
ended_at: "2026-07-12T08:53:23.733Z"
summary: "Phase 2 delivered daemon-safe pull ownership, ambient registration, durable inbox reads, race-safe receipts, and atomic per-envelope receipt events; cold review found and drove fixes for three proof gaps that green mechanical gates missed."
entries:
  - id: DL-001
    kind: difficulty
    description: "Full smoke in a fresh worktree stalls at pi's folder-trust prompt; PATH passed to the harness process does not reach tmux new-session because the tmux server uses its global environment"
    target: harness/driver
    severity: degrading
    workaround: "temporarily prepend a pi --approve wrapper to tmux's global PATH and restore the original PATH after smoke"
    suggested_encoding: "let Driver BootOpts carry argv or an approve/trust option so worktree smoke does not mutate tmux global environment"
    fp: "0573792b8a99"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T05:02:51.629Z"
  - id: DL-002
    kind: difficulty
    description: "pi-peacock smoke hardcodes ~/pi-hacking/pij (main), so an otherwise healthy worktree fails the full gate on cwd/branch text"
    target: .pi/extensions/pi-peacock/smoke.ts
    severity: degrading
    workaround: "temporarily widened the smoke regex for worktree validation and restored it afterward"
    suggested_encoding: "make the peacock smoke derive cwd and branch from the scenario environment instead of pinning main"
    fp: "9aa4b93144ae"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T05:20:20.246Z"
  - id: COORD-001
    kind: coordination
    description: "Phase 2 ownership tranche dispatched in worktree: run 2026-07-12T06-19-07Z-github.com-AI-Substr, dlg-0001, coder pij-eventual-scallop, Copilot GPT-5.6 Sol xhigh"
    fp: "0de476436920"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T06:20:11.570Z"
  - id: DL-003
    kind: difficulty
    description: "Full harness smoke stalls on Pi's interactive 'Do not trust (this session only)' prompt instead of reaching idle."
    target: harness/driver
    severity: degrading
    workaround: "Run the ownership tranche static and targeted gates while inspecting the existing smoke trust setup."
    suggested_encoding: "Teach the smoke driver to preconfigure or deterministically answer the Pi trust prompt."
    fp: "4f9cac48851d"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T06:33:21.982Z"
  - id: DL-004
    kind: difficulty
    description: "Full harness checks smoke timed out at Pi's 'Do not trust (this session only)' prompt; the driver lacks a deterministic trust-prompt response."
    fp: "7794d003f4e7"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T07:33:13.039Z"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "Green Phase 2 gates missed partial inbox-claim data loss, uncorrelated receipt loss, and invalid ambient fallback; deterministic regressions were only found by cold review."
    fp: "9bd130fe3dae"
    disposition: kept
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-12T08:18:38.941Z"
---

# Retro — Plan 041 Phase 2

The highest-leverage improvement is a deterministic adversarial inbox gate that
exercises malformed batches, uncorrelated receipt races, invalid ambient
metadata, and dual-consumer event publication. Those checks now exist as
permanent regressions; the remaining open harness gap is worktree-safe smoke
trust handling.
