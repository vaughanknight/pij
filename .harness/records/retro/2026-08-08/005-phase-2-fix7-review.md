---
record_kind: "retro"
harness_version: "0.13.0"
branch: "s100/tick-heartbeat"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-08-08T10:08:02.271Z"
agent: pij-glad-stingray
plan_id: 100-tick-heartbeat
schema_version: "1.2"
retro_id: "2026-08-08T10:08:02Z-pij-glad-stingray-829f9c48c7b2"
started_at: "2026-08-08T10:01:25.613Z"
ended_at: "2026-08-08T10:08:02.271Z"
summary: "The fix7 review found and proved a legacy re-adoption heartbeat inheritance P1; the full gate later passed, but an initial full-suite run had an unrelated temporary-fixture cleanup failure."
entries:
  # One block per observation. id = <PREFIX>-<3+ digits>. Any uppercase prefix is valid;
  # DL/MW/GFT/INS/COORD/SUGG/CONF/WIN are the recommended per-kind defaults, and run-scoped
  # prefixes (e.g. VF- for a flow worker's own numbering) are equally fine.
  # kind in difficulty | magic-wand | gift | insight | coordination | improvement-suggestion | confusion | win
  - id: DL-001
    kind: difficulty
    description: "Full suite test cleanup races in git-repository test, obscuring review readiness."
    target: ".pi/extensions/pij/adapters/git-repository.test.ts"
    severity: degrading
    workaround: "Ran the focused overlay suite, then re-ran the full harness gate."
    suggested_encoding: "Make temp-root cleanup retry-safe or serialise its fixture teardown."
    fp: "829f9c48c7b2"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-08-08T10:01:25.613Z"
---

# Retro — phase-2-fix7 review

The highest-leverage improvement is deterministic retry-safe cleanup for the
git worktree fixture, so a transient cleanup failure cannot obscure unrelated
review readiness.
