---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s055/pij-watchdog"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-17T05:20:29.909Z"
agent: agent
plan_id: 055-pij-watchdog
schema_version: "1.2"
retro_id: "2026-07-17T05:20:29Z-agent-fp3w0055"
started_at: "2026-07-17T04:01:43.389Z"
ended_at: "2026-07-17T05:20:29Z"
summary: "Phase 3 drain (3 entries): proof harness earned its keep (caught a real P2 defect); flow-pair learn verb clobbers tracked candidates (recurrent, committed data loss — recovered)."
entries:
  - id: WIN-001
    kind: win
    description: "temp-daemon proof harness caught a real P2 defect (watcher stalled notices bypass episode latch) that TWO cross-model review rounds + 27 unit tests missed — count-based invariants (notices per episode) were asserted nowhere; unit fixtures assert response enums, proofs assert delivered-message counts"
    fp: "0b850c410c9e"
    disposition: kept
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-17T04:01:43.389Z"
  - id: DL-001
    kind: difficulty
    description: "flow-pair learn verb numbers candidates per-DELEGATION (dlg-0003 → learn-0003.md) with no existing-file check — silently clobbered the tracked plan-027 curated candidate; caught only by the coder's fence check. Verb should scan the cluster dir for the next free ordinal or refuse to overwrite"
    target: tooling
    severity: degrading
    workaround: "restored plan-027 content via git checkout; re-homed my candidate as learn-0005.md"
    suggested_encoding: "learn verb: next-free-ordinal scan + never-overwrite guard in skills/flow-pair/lib"
    fp: "3f0d70b6a24e"
    disposition: task
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-17T05:09:52.500Z"
  - id: DL-002
    kind: difficulty
    description: "RECURRENCE + committed data loss: flow-pair learn's per-delegation numbering clobbered tracked candidates TWICE this stream (P1's learn-0001 over a 2026-07-11 run's candidate, committed in bf056a7; today's learn-0003 over plan-027's curated candidate, caught by coder fence). Recovered as learn-0005/learn-0006. Verb needs next-free-ordinal scan + refuse-to-overwrite"
    target: tooling
    severity: blocking
    workaround: "git show bf056a7^ recovery → learn-0006.md; git checkout restore → learn-0003.md"
    suggested_encoding: "skills/flow-pair/lib learn: scan cluster candidates/ for max ordinal, error on existing path"
    fp: "9a1c4f27e805"
    disposition: task
    system:
      compound:
        status: open
        source: agent-self
        first_seen_at: "2026-07-17T05:11:01.955Z"
system:
  compound:
    bubble_action: "all-save"
---

# Retro — 055-pij-watchdog Phase 3

Three entries. The win is structural: the phase-3 proof harness caught a real
P2 defect (watcher notices bypassing the stall-episode latch) that two
cross-model review rounds and 27 unit tests missed — validating the
"proofs assert delivered-message counts, not enums" doctrine now banked as
learn-0005.

The difficulty is a real tooling defect with committed data loss: the
flow-pair learn verb numbers candidate files per-delegation and never checks
for an existing file. It clobbered tracked candidates twice this stream
(learn-0001 in commit bf056a7 — unnoticed for hours; learn-0003 today —
caught by the coder's fence discipline). Both originals recovered
(learn-0006.md, learn-0003.md restored; my candidate re-homed as
learn-0005.md). Dispositioned as TASK, not fixed-now: skills/flow-pair/lib is
outside this stream's fence and has no prior Jordan ruling — fix descriptor:
"flow-pair learn: scan cluster candidates/ for next free ordinal; refuse to
overwrite an existing path (tooling, blocking, two occurrences with data
loss)". Surfaced to Jordan at the Phase 3 checkpoint.
