---
record_kind: "retro"
harness_version: "0.11.0"
branch: "main"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-11T10:37:51.522Z"
agent: "agent"
plan_id: "036-pij-orchestration-baton"
schema_version: "1.2"
retro_id: "2026-07-11T10:37:00Z-agent-s036p1"
started_at: "2026-07-11T09:16:09.633Z"
ended_at: "2026-07-11T10:37:00Z"
summary: "Plan-036 phase-1 drain (5 entries): baton primitive built via flow-pair fleet under o-prime governance; 3-round mutation-gated review; live-verified under the daemon-restart baton. Dispositions per Jordan's drain ruling."
entries:
  - id: INS-001
    kind: insight
    description: "Third git-index incident of this class today (INC-001 here: o-prime git add -A swept s036 fenced in-flight artifacts; + INC-004 run-01 + osk case) — baton primitive requirements evidence: the git index IS the highest-traffic unserialized surface; pathspec-mandatory + commit-slot conventions keep being violated by habit, which is exactly what machine-visible lease state addresses"
    target: plan
    fp: "befb5749ac36"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-11T09:16:09.633Z"
  - id: DL-001
    kind: difficulty
    description: "flow-pair dispatch hard-requires --tasks-dir but Simple-mode plans carry inline task tables — had to materialize tasks/phase-1/tasks.md by hand; dispatch could fall back to the plan's ### Implementation table"
    target: tooling
    severity: annoying
    suggested_encoding: "context-pack.ts: when tasks.md absent, extract the plan's Simple-mode inline table"
    fp: "9f28e1a13641"
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-11T09:20:57.877Z"
        resolved_by: "https://github.com/AI-Substrate/pij/issues/6"
  - id: SUGG-001
    kind: improvement-suggestion
    description: "flow-pair run.json has no roster key — the pair route's P9 'persist roster before use' collides with 'never hand-write the ledger'; roster persistence needs a CLI verb (flow-pair roster set <role> <pijId>)"
    target: tooling
    fp: "2f9f54dbf666"
    disposition: task
    system:
      compound:
        status: suggested
        source: agent-self
        first_seen_at: "2026-07-11T09:21:52.370Z"
        resolved_by: "https://github.com/AI-Substrate/pij/issues/7"
  - id: DL-002
    kind: difficulty
    description: "file-watch-notify/watcher.test.ts:222 (delta v2→v3 baseline test) flakes under machine load — failed in just test during a 6+-agent session, passed clean in isolation 20s later; timing-sensitive baseline-advance race makes the boot sensor cry wolf"
    target: project
    severity: degrading
    workaround: "re-ran the single file in isolation to disambiguate"
    suggested_encoding: "deflake: fake timers or widen the debounce window in that test"
    fp: "2cf1bcbb1ab2"
    disposition: task
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-11T09:24:01.378Z"
        resolved_by: "b412f7d (deflake landed; 5/5 full-suite greens proven)"
  - id: DL-003
    kind: difficulty
    description: "file-watch-notify deletion-race test flaked twice today under full-suite load (s036 dlg-0002 coder + s037 orient boot; targeted rerun green both times) — flaky-test class, candidates: deterministic fake-clock for the deletion race, or mark with retry/quarantine annotation"
    fp: "fee328d6d042"
    disposition: task
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-11T09:24:34.500Z"
        resolved_by: "b412f7d (same-cluster fix)"
system:
  compound:
    bubble_action: "ruled-per-entry"
---

# Retro — plan 036 phase 1 (s036-baton stream)

Drain ruled by Jordan in-pane: watcher flake cluster → fix-or-remove (fence requested from o-prime); flow-pair tasks-dir gap → GitHub issue #6 (Sonnet subagent, dedup-checked against all open issues); INS-001 + SUGG-001 saved as-is.
