---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s074/pij-rail-v2"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-29T08:18:32.192Z"
agent: "pij-gigantic-marmoset"
plan_id: null
schema_version: "1.2"
retro_id: "2026-07-29T08:18:32Z-pij-gigantic-marmoset-41e6ffc31b34"
started_at: "2026-07-29T08:12:06Z"
ended_at: "2026-07-29T08:18:32Z"
summary: "Re-reviewed the Phase 9 watchdog-proof repair, mutation-proved the scheduler and exemption assertions, and found that the reduced smoke sensor still does not inspect the nudge text."
entries:
  - id: DL-006
    kind: difficulty
    description: "A compile-time constant mutation was optimized away by tsx/esbuild, producing a false green proof run."
    target: tooling
    severity: annoying
    workaround: "Used a runtime-dependent impossible session id instead of a constant-false condition."
    suggested_encoding: "Add mutation-test guidance or a helper that rejects compile-time-eliminable mutants."
    fp: "41e6ffc31b34"
    disposition: kept
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-29T08:16:58Z"
---

# Retro — Phase 9 proof re-review
