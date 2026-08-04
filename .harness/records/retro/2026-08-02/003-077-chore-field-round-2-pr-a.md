---
record_kind: "retro"
harness_version: "0.13.0"
branch: "s082/chore-path-literals"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-08-02T10:02:18.800Z"
agent: "pij-atomic-gore"
plan_id: "077-chore-field-round-2"
schema_version: "1.2"
retro_id: "2026-08-02T10:02:18Z-pij-atomic-gore-6d70dd564ce0"
started_at: "2026-08-02T09:34:34.190Z"
ended_at: "2026-08-02T10:02:18.801Z"
summary: "Implemented portable repo-scoped chore paths and lint-safe repo roster JSON; captured four harness failures encountered while proving the change."
entries:
  - id: DL-001
    kind: difficulty
    description: "harness boot reported typecheck failure but truncated the underlying TypeScript diagnostics to npm run typecheck"
    target: harness-itself
    severity: degrading
    workaround: "Ran just typecheck directly to expose the missing compiler diagnostic."
    suggested_encoding: "Include compiler diagnostics in boot error output"
    fp: "6d70dd564ce0"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T09:34:34.190Z"
  - id: DL-002
    kind: difficulty
    description: "Disposable pij chore CLI proof inherited the live peer PIJ_SESSION_ID, so temp PIJ_HOME authoring failed before the test began"
    target: tooling
    severity: annoying
    workaround: "Cleared PIJ_SESSION_ID and TMUX_PANE explicitly for disposable-home authoring."
    suggested_encoding: "Acceptance fixtures should clear inherited pij identity variables by default"
    fp: "4251e103a7ff"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T09:45:07.396Z"
  - id: DL-003
    kind: difficulty
    description: "Full harness smoke lost tmux pane %705 during capture and then timed out while package setup continued, leaving the gate unable to distinguish a pane race from product failure"
    target: harness-itself
    severity: degrading
    workaround: "Reran just smoke in isolation, then reran the full harness gate."
    suggested_encoding: "Smoke should retain pane ownership or report the scenario and pane lifecycle that removed it"
    fp: "f5088f94417f"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T09:51:18.824Z"
  - id: DL-004
    kind: difficulty
    description: "Repository requires the pre-commit skill before staging, but the host skill registry reports pre-commit as unavailable even though its checked-in contract exists"
    target: harness-itself
    severity: degrading
    workaround: "Read the checked-in SKILL.md and ran its just self-check contract directly."
    suggested_encoding: "Register the repo-managed pre-commit skill in every supported host"
    fp: "db3a3e4f42f8"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-02T09:55:56.551Z"
---

# Retro — chore field round 2 PR A

The product change is fully proven. The retained entries are harness improvements that would
make the same proof path faster and more diagnostic for future agents.
