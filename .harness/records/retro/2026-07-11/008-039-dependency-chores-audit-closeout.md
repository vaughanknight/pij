---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-11T23:42:17.064Z"
agent: copilot
plan_id: "039-dependency-chores-audit"
schema_version: "1.2"
retro_id: "2026-07-11T23:42:17Z-copilot-s039-closeout"
started_at: "2026-07-11T12:39:57.464Z"
ended_at: "2026-07-11T23:42:17.064Z"
summary: "Closeout captured four remaining harness gaps from the coder/reviewer fleet and dependency audit proof."
entries:
  - id: DL-001
    kind: difficulty
    description: "The /pij pair route advertises coder/reviewer model flags and roster persistence, but the shipped flow-pair start CLI and run schema expose neither, forcing separate peer spawn plus out-of-ledger roster evidence."
    target: harness-itself
    severity: degrading
    workaround: "Use flow-pair only for run/packet/review artifacts; spawn peers with pij and persist roster in the plan report."
    suggested_encoding: "Add model flags and CLI-owned roster mutations to flow-pair, or align the route module with the shipped engine."
    fp: "8962e0356d80"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:47:51.360Z"
  - id: DL-002
    kind: difficulty
    description: "flow-pair dispatch requires --tasks-dir even for a Builder Simple plan whose tasks are inline in the unified plan, so the caller must pass the plan directory and accept a synthetic missing tasks.md exclusion."
    target: harness-itself
    severity: annoying
    workaround: "Pass the plan directory as --tasks-dir; rely on the extracted Implementation section."
    suggested_encoding: "Make --tasks-dir optional when the selected plan section already contains the inline task table."
    fp: "3a67f42d693e"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:47:52.143Z"
  - id: DL-003
    kind: difficulty
    description: "flow-pair observe captures the entire shared worktree with no allowed-path filter; in an active Builder/prime run it would include or reject unrelated government and generated flight-plan files instead of producing a reviewable delegation diff."
    target: harness-itself
    severity: degrading
    workaround: "Generate a patch from the delegation allowed paths and persist its hash in the plan reviewer brief."
    suggested_encoding: "Add --allowed-paths or delegation-manifest scoping to flow-pair observe so it captures only worker-owned paths."
    fp: "efe2c94c127b"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T13:16:26.940Z"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "Dependency review required ad hoc lock-closure and audit-ancestry scripts to prove scope; encode this as a reusable dependency audit sensor."
    severity: annoying
    suggested_encoding: "Add a harness dependency-scope verb that compares lock revisions against named root closures and validates audit-node ancestry."
    fp: "3be3593c511d"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T12:39:57.464Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — Plan 039 closeout

The highest-value encoding is delegation-scoped diff capture: one `flow-pair observe --allowed-paths` or baseline-SHA mode would make concurrent governed reviews deterministic instead of worktree-wide.
