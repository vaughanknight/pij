---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s074/pij-rail-v2"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-29T03:46:23.169Z"
agent: "pij-gigantic-marmoset"
plan_id: "074-pij-rail-v2"
schema_version: "1.2"
retro_id: "2026-07-29T03:46:23Z-pij-gigantic-marmoset-s074phase2"
started_at: "2026-07-29T03:39:54Z"
ended_at: "2026-07-29T03:46:23Z"
summary: "Cross-model review of Phase 2 isolated the requested commit, mutation-tested the adoption and compiled-role locks, and found a hollow optional prime audit event for legacy unset. The review also reconfirmed that production capability changes require explicit governance and composition enrollment."
entries:
  - id: DL-001
    kind: difficulty
    description: "Type-level assertions in *.test.ts are not compiled because tsconfig excludes test files; type proofs must live in included non-test TypeScript."
    target: tooling
    severity: degrading
    workaround: "Move the load-bearing type invariant into included production TypeScript."
    suggested_encoding: "Add a dedicated type-test compilation lane or reject type-only test assertions in excluded files."
    fp: "6e980ddfe3df"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-29T02:44:55.007Z"
  - id: DL-002
    kind: difficulty
    description: "Detached review mutations require an explicit cd; the first target test ran against the active branch."
    target: tooling
    severity: annoying
    workaround: "Use an isolated worktree with an explicit working-directory prefix and a temporary dependency symlink."
    suggested_encoding: "Add a review-worktree helper that creates an exact checkout with reusable dependency resolution and executes a named target."
    fp: "6e4900e02e01"
    disposition: kept
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-29T03:43:30.299Z"
  - id: DL-003
    kind: difficulty
    description: "The Phase 2 flow-pair packet omitted production bin wiring although the new RoleService verb was unreachable without it."
    target: "flow-pair-packet-generation"
    severity: annoying
    workaround: "Inspect the composition root and request a bounded scope correction before accepting a partial implementation."
    suggested_encoding: "Generate allowed paths from each phase touch-set plus the composition roots needed to construct new dispatch dependencies."
    fp: "8d7acddd25d6"
    disposition: kept
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-29T03:19:55.102Z"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "Adding one pij capability requires descriptor ownership, raw-write governance, and production CLI composition enrollment, but generated packets omit those distributed surfaces."
    target: "flow-pair-packet-generation"
    severity: degrading
    workaround: "Inspect governance refusals and composition roots, then request bounded path additions."
    suggested_encoding: "Add a capability-enrollment manifest or packet preflight that expands task paths through ownership tables, raw-write governance, and construction roots."
    fp: "a9ea560b043e"
    disposition: kept
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-29T03:30:44.029Z"
---

# Retro — s074 Phase 2 review
