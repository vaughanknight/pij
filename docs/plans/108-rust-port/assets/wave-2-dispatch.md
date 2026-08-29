# Wave-2 dispatch — services over the wave-1 substrate
2026-08-29, pij-dominant-vicuna. Prior waves: 0 (mold) + 1 (store/queue/events/tmux/liveness)
both APPROVE. Reviewer ruling and spawn forms unchanged (Jordan 2026-08-29/28).

## Roster (6 coders, parallel, worktree-per-coder off s108/rust-port)
| unit | scope | tier | trigger |
|---|---|---|---|
| u-delivery | Transport trait consumers: send/inbox/receipts over queue+events; honest queued/delivered/held; pre-bind queueing; msg-id+outcome logging | 400K | single seam, fixture-backed |
| u-harness | HarnessPort adapters (claude/copilot/codex/pi-omp): discovery, bind evidence carrying pane+model+cwd (R5 13-15), readiness anchors, #19 subagent scoping; DELETES the harness refusal | -1m | (b) reads TS harness quirks |
| u-watchdog | eligibility consulting semanticState, configurable thresholds, nudge scheduling over fake clock | 400K | decision-table shaped |
| u-anomalies | detectors w/ named observables, clearable rows, remediation lines | 400K | |
| u-orchestration | batons/projects/streams/ordinals/roles + descriptor equivalence-merge (pid,proc_start,spawnId; tolerant secondary fields) + spawner attribution (E-OWN 'unknown' fix class) | -1m | (b) reads TS semantics + (a) reconciliation touches store seams |
| u-report | cards, state verbs, documented 280 const, staleness clock | 400K | |

## Packet lines (additive to every standing line from waves 0-1)
- DERIVED FILES: fence enumerates Cargo.lock + generated fixtures with REGENERATE-NEVER-
  HAND-MERGE (lungfish wave-1 item 3 — packet defect, now closed in COMMON).
- EVENT ATTACH RULE: consumers pass Some(cursor); subscribe(None) is a deliberate
  full-replay for cold consumers ONLY and every None call site carries a comment saying
  why unbounded is safe there (wave-1 first-light finding).
- TYPING GATE: u-harness owns the stateful composer-interaction gate as a NAMED
  deliverable; it ANDs with TmuxPort.user_typing (pane_in_mode); FALSE never means
  'safe to inject' (wave-1 item 2).
- Receipts are FILES IN THE TREE before the done message cites them — a receipt that
  only exists in a chat log is not a receipt (wave-1's single review finding).

## Cadence
PM lungfish; compose in dependency order (report -> watchdog/anomalies -> delivery ->
harness -> orchestration); reviewer openrouter/z-ai/glm-5.3-flash high AFTER composition;
alias scan at spawn + every done edge; ack-with-numbered-plan, PM rules acks, escalate
contract changes only.
