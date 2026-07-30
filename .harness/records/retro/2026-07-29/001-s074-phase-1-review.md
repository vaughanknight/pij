---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s074/pij-rail-v2"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-29T02:38:50.560Z"
agent: "pij-gigantic-marmoset"
plan_id: "074-pij-rail-v2"
schema_version: "1.2"
retro_id: "2026-07-29T02:31:39Z-github-copilot-4ad2fce82b60"
started_at: "2026-07-29T02:31:39Z"
ended_at: "2026-07-29T02:39:00Z"
summary: "Reviewed Phase 1's descriptor prerequisite. The full gate was green, but a mutation proved that T005's Role exact-union assertion is excluded from tsc and erased by Vitest; the review returned FIX_REQUIRED. The review also found the C1 baseline exception still granted by Phase 2's task record."
entries:
  - id: DL-001
    kind: difficulty
    description: "Phase 1 T006 still named the C1 baseline red after Phase 6 had closed it; Phase 2 still carries the same stale exception."
    target: plan
    severity: annoying
    workaround: "Used the parent dispatch's zero-failure bar, reviewed every Phase 1-6 task record, and reported Phase 2 for correction."
    suggested_encoding: "Add a baseline-closure reconciliation check that fails while any active phase task grants a closed exception."
    fp: "128747fcf5a5"
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-29T02:26:11.892Z"
  - id: DL-002
    kind: difficulty
    description: "The skill runner cannot pass eng-harness-flow's required --hook argument, so the mandated pre-coding seam cannot be invoked verbatim."
    target: tooling
    severity: annoying
    workaround: "Ran the available no-argument skill, then captured the inability to invoke the exact hook."
    suggested_encoding: "Allow the skill runner to pass slash-skill arguments or expose a hook-aware invocation surface."
    fp: "077faa3083cb"
    disposition: deferred
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-29T02:33:30.746Z"
---

# Retro — s074 Phase 1 review
