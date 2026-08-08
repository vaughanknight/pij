---
record_kind: "retro"
harness_version: "0.13.0"
branch: "s100/tick-heartbeat"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-08-08T10:34:58.254Z"
agent: "pij-glad-stingray"
plan_id: "100-tick-heartbeat"
schema_version: "1.2"
retro_id: "2026-08-08T10:35:00Z-pij-glad-stingray-fix8"
started_at: "2026-08-08T10:30:51Z"
ended_at: "2026-08-08T10:35:00Z"
summary: "Reviewed the fix8 attachment predicate, independently mutation-tested its legacy keep and re-adoption branches, and rejected remaining source comments that promise a next-tick repair which a stopped daemon cannot guarantee."
entries:
  # One block per observation. id = <PREFIX>-<3+ digits>. Any uppercase prefix is valid;
  # DL/MW/GFT/INS/COORD/SUGG/CONF/WIN are the recommended per-kind defaults, and run-scoped
  # prefixes (e.g. VF- for a flow worker's own numbering) are equally fine.
  # kind in difficulty | magic-wand | gift | insight | coordination | improvement-suggestion | confusion | win
  - id: DL-001
    kind: difficulty
    description: "Harness boot again failed on intermittent ENOTEMPTY cleanup in a git-repository fixture, leaving the full gate nondeterministic for unrelated review work."
    target: tooling
    severity: degrading
    workaround: "Ran the focused overlay suite and independent in-memory mutation tests after typecheck passed; recorded the fixture failure separately."
    suggested_encoding: "Make git-fixture teardown wait for child git processes and retry deterministic directory cleanup before reporting a test failure."
    fp: "dd63329b435f"
    disposition: kept
                                             #   drain-time decision; distinct from system.compound.status (long-horizon lifecycle)
    system:
      compound:                             # CONVENTION (open 'system' object), not a schema field
        status: open
        source: agent-self
        first_seen_at: "2026-08-08T10:34:43Z"
---

# Retro — Phase 2 fix8 review

<!-- Optional human narrative. The structured `entries` above are the durable signal. -->
