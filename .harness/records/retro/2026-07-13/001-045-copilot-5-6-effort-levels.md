---
record_kind: "retro"
harness_version: "0.11.0"
branch: "s045/copilot-5-6-effort-levels"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-13T00:15:32.957Z"
agent: pij-evolutionary-jellyfish
plan_id: 045-copilot-5-6-effort-levels
schema_version: "1.2"
retro_id: "2026-07-13T00:15:32Z-pij-evolutionary-jellyfish-a045"
started_at: "2026-07-12T21:30:11.298Z"
ended_at: "2026-07-13T00:15:32.960Z"
summary: "S045 delivered and reviewed the Copilot GPT-5.6 effort correction, integrated the released control-plane domain contract after PR #9, and reached ready-for-review under a higher-layer ruling while retaining shared harness debt."
entries:
  - id: DL-001
    kind: difficulty
    description: "flow-pair dispatch still requires a tasks directory for a Simple plan, so S045 materialized a tasks mirror and execution log before delegation"
    target: "skills/flow-pair/lib/context-pack.ts"
    severity: annoying
    workaround: "Create docs/plans/045-copilot-5-6-effort-levels/tasks/phase-1/{tasks.md,execution.log.md} from the validated inline task table"
    suggested_encoding: "Teach flow-pair dispatch to consume a Simple plan inline task table when --tasks-dir is absent (GH issue #6)"
    fp: "f2e0e70b3d18"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T21:30:11.298Z"
  - id: DL-002
    kind: difficulty
    description: "Full harness checks in a branch worktree fail because pi-peacock smoke hardcodes the main checkout path and branch at smoke.ts:15"
    target: ".pi/extensions/pi-peacock/smoke.ts:15"
    severity: blocking
    workaround: "Use targeted pij tests/smoke to prove S045 while keeping the full phase gate blocked"
    suggested_encoding: "Make the pi-peacock smoke cwd/branch assertion accept the active worktree path and branch without weakening footer-shape proof"
    fp: "05791e0ceb43"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-12T22:17:14.460Z"
  - id: DL-003
    kind: difficulty
    description: "flow-pair observe could not capture the dlg-0004 two-file diff because orchestrator-owned the-flow.json was dirty, so review needed a manual scoped diff"
    target: "skills/flow-pair/lib/observe.ts"
    severity: annoying
    workaround: "Review git diff -- docs/domains/pij-control-plane/domain.md execution.log.md directly"
    suggested_encoding: "Add path-scoped observe or ignore orchestrator-owned flow-state files when they are outside delegation allowedPaths"
    fp: "85ff198f57c5"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T00:14:59.205Z"
  - id: DL-004
    kind: difficulty
    description: "Post-PR9 full smoke failed across scenarios because tmux panes disappeared before capture-pane, so local ship proof remained unavailable despite every static/unit/Windows sensor passing"
    target: "harness/driver"
    severity: blocking
    workaround: "Use PR CI plus targeted product proof and retain the shared smoke debt under a higher-layer ruling"
    suggested_encoding: "Harden smoke pane lifecycle/diagnostics so scenario panes survive through capture or return the causal teardown event"
    fp: "ca004fd8efd4"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-13T00:15:17.940Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — 045 Copilot GPT-5.6 effort levels

The highest-leverage follow-up is the shared tmux pane-lifetime sensor: it is the only proof surface that remained unavailable after product, domain, CI, and cross-platform checks were green.
