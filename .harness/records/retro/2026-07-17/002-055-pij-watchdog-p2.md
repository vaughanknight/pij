---
record_kind: "retro"
harness_version: "0.12.0"
branch: "s055/pij-watchdog"
repo: "https://github.com/AI-Substrate/pij.git"
created_at: "2026-07-17T03:41:29.814Z"
agent: agent
plan_id: 055-pij-watchdog
schema_version: "1.2"
retro_id: "2026-07-17T03:41:29Z-agent-fp2b0055"
started_at: "2026-07-17T03:32:46.928Z"
ended_at: "2026-07-17T03:41:29Z"
summary: "Phase 2 drain (1 entry): flow-pair-mutate variadic quoting trap produced false mutation verdicts; fixed in-flight and proven end-to-end."
entries:
  - id: DL-001
    kind: difficulty
    description: "just flow-pair-mutate variadic *test_cmd degrades to bare 'npx' unless the suite command is passed as ONE quoted shell argument — two agents hit this in one phase (reviewer round 1, coder fix cycle); recipe should quote-join or fail loudly on multi-arg"
    target: tooling
    severity: degrading
    workaround: "pass the suite as one quoted third argument (reviewer used nested quotes)"
    suggested_encoding: "join all trailing args in flow-pair-mutate.sh and echo the resolved suite command"
    fp: "56c6cb9c7fab"
    disposition: fixed-now
    system:
      compound:
        status: encoded
        source: agent-self
        first_seen_at: "2026-07-17T03:32:46.928Z"
        resolved_by: "harness/scripts/flow-pair-mutate.sh shift-2/join-$* fix + suite echo; flight-plan excursion node fix-mutate-quoting (branch_of phase-2); proven RED 1/27 → GREEN 27/27 with previously-failing unquoted multi-arg form"
---

# Retro — 055-pij-watchdog Phase 2

One observation this phase: the mutation-gate recipe's variadic argument
handling silently degraded multi-word suite commands to bare `npx`, producing
false mutation verdicts. Hit independently by the reviewer (round 1) and the
coder (fix cycle). Fixed in-flight (disposition: fixed-now): the script now
joins all trailing args (`shift 2; TEST_CMD="${*:-…}"`) and echoes the
resolved suite line so the run is self-evidencing. Proven end-to-end with the
previously-failing unquoted form: mutation RED (1 failed/27), restore GREEN
(27/27).
