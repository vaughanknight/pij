# pij#19 trigger — CONTROLLED CONFIRMATION (2026-08-28, pij-dominant-vicuna)
Protocol: ermine's falsifier as corrected by lynx/nigel (logical-subagent aim, no
process-fork detector). Monitor: registry poll 3s + machine worker watch, timestamps UTC.

## Arms
- Probe A `pij-right-hedgehog` (pid 48674, omp sol-fast low, scratch cargo project):
  ran Rust LSP diagnostics on a file with a deliberate undefined-name error; spawned
  nothing. RESULT: **no new descriptor** on its pid for the whole window.
  (Bonus recurrence: diagnostics returned "OK, no details" against a real error — the
  known OMP false-clean bug, reproduced in a fresh seat.)
- Probe B `pij-husky-lededje` (pid 68816): instructed 06:29:0xZ to spawn ONE read-only
  logical subagent (no writes, no LSP). RESULT: **alias `pij-fragile-magpie` minted on
  pid 68816 at 06:29:41Z** — within seconds, no new OS process, pane/spawnId fields
  null on the alias row.
- Ambient: `__omp_worker_daemon_broker`/`lsp_mux` are MACHINE-WIDE processes predating
  both probes — corroborates the withdrawal of the worker-process hypothesis.

## Verdict
Logical internal subagent spawn IS the #19 alias trigger — controlled, with negative
arm. Mechanism matches the source-grounded filing (in-process subagent runs pij
session_start, gets a distinct native session id, registers against parent pid/pane
via inherited PIJ_*). Self-report cannot be the sensor for worker-class activity
(ermine), but for LOGICAL subagents the containing seat knows it spawned one — the
fix is still structural (registration requires bind evidence + subagent scoping,
continuous dedup per R5 item 3), never self-report.
