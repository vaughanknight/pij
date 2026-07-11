---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-11T11:55:35.839Z"
agent: "agent"
plan_id: null
schema_version: "1.2"
retro_id: "2026-07-11T11:55:35Z-agent-3a8f62d1c4b9"
started_at: "2026-07-11T11:09:46.887Z"
ended_at: "2026-07-11T11:55:35.839Z"
summary: "Shared agent-bucket drain at Plan 038 Phase 1: one dependency-audit note, one skill sensor fix, and four flow-pair orchestration/review frictions."
entries:
  - id: DL-001
    kind: difficulty
    description: "npm audit fix --dry-run --json emitted non-JSON output, so remediation preview requires a second diagnostic command instead of machine parsing."
    fp: "57f9aaeebb01"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T11:09:46.887Z"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "skills/pij/SKILL.md claims every pij CLI verb has a route, but the shipped orchestration family is absent from the coverage table; Plan 038 should add orchestration baton/prime coverage and keep pij-skill-check enforcing it"
    target: project-sensor
    severity: annoying
    suggested_encoding: "Extend pij-skill-check coverage assertions for the orchestration family"
    fp: "a088662c3439"
    disposition: fixed-now
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-11T11:16:11.230Z"
        resolved_by: "Plan 038 Phase 1 working tree; commit pending"
  - id: DL-002
    kind: difficulty
    description: "The /pij pair route documents --coder-model/--reviewer-model flags and a persisted role roster, but the live flow-pair CLI exposes neither; orchestration must spawn peers separately and cannot record ownership through the declared ledger surface"
    target: project-sensor
    severity: degrading
    workaround: "Use flow-pair for packets/records and pij spawn/send for peers; track spawned ids in the phase execution log"
    suggested_encoding: "Add start model flags plus roster set/show verbs to flow-pair, or revise the pair route to the shipped contract"
    fp: "f9bae522e2a7"
    disposition: plan
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-11T11:40:49.730Z"
        resolved_by: "government/spine.md Seq 25 flow-pair backlog"
  - id: DL-003
    kind: difficulty
    description: "flow-pair observe rejects a valid path-bounded delegation when any unrelated dirty file matches its global forbidden-path scan; it cannot capture a scoped diff in a shared-tree government run"
    target: project-sensor
    severity: degrading
    workaround: "Use git diff with the delegation pathspec and a plan-fenced reviewer packet; retain flow-pair review/learning records"
    suggested_encoding: "Add allowed-paths-aware diff capture to flow-pair observe and ignore pre-existing unrelated dirty paths"
    fp: "1e50bd219be9"
    disposition: plan
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-11T11:48:41.685Z"
        resolved_by: "government/spine.md Seq 25 flow-pair backlog"
  - id: DL-004
    kind: difficulty
    description: "Review packet passed 'just pij-skill-check' to flow-pair-mutate, but the helper expects a just recipe name and attempted 'just just pij-skill-check'."
    target: "flow-pair review packet mutation command"
    severity: annoying
    suggested_encoding: "Make flow-pair-mutate accept either a recipe name or a full command, or generate packets with the recipe-only form."
    fp: "b87d42a743b5"
    disposition: plan
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-11T11:51:19.242Z"
        resolved_by: "government/spine.md Seq 25 flow-pair backlog"
  - id: CONF-001
    kind: confusion
    description: "The review packet used the two-argument just flow-pair-mutate wrapper with a third custom test command, but only the underlying shell script accepts that third argument"
    target: agent-harness
    severity: annoying
    workaround: "Invoke harness/scripts/flow-pair-mutate.sh directly when passing a custom test command"
    suggested_encoding: "Document wrapper versus script arity in the flow-pair review rubric and templates"
    fp: "92c3960669c3"
    disposition: deferred
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T11:55:02.635Z"
---

# Retro — shared agent phase end

Plan 038 Phase 1 encoded the missing orchestration skill sensor. Flow-pair contract drift and shared-tree observe limitations were routed to the o-prime's ordinal backlog; the dependency-audit entry was preserved without attributing it to Plan 038.
