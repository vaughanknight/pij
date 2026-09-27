# Plan 156 report: a resumed session gets its own seat back

Coder: pij-suspicious-millicent (Claude Code, Opus 5.5). Prime: pij-far-jackal. Slices merged: #437 (AC2, AC1, AC6), #438 (AC3), #439 (ruling 2 and AC4). This final slice adds AC5, AC7 and AC8.

| AC | Status | Evidence |
|---|---|---|
| AC1 session continuity | ✅ The session is derived from Claude's own `sessions/<pid>.json` (ruling 2). The flag only cross-checks it. Non-Claude callers need observed ancestry. | `evidence/red/ac1.txt`, `resumed_claude_session_reclaims_its_tombstoned_seat_from_derived_evidence_only`, `claude_session_of_requires_the_record_to_describe_the_observed_process` |
| AC2 recycled pane | ✅ The sweep treats a reincarnated pane as absent. `whoami --pane` misses and adopt does not inherit a dead seat. | `red/ac2.txt`, two tests in `green-slice1.txt` |
| AC3 revive resumes | ✅ Uses each harness's own resume spelling and keeps `harness_session`. Refuses, naming the pane, when the conversation is live elsewhere. `--fresh` is the only blank path. | `red/ac3.txt`, `green-slice2a.txt`; canary = AC7 proof B |
| AC4 heal loop | ✅ Exactly one detached adopt per 15 s window, and the render never waits. The hook outlasts a late daemon. Log lines are RFC 3339 stamped. Adds +1–2 ms per healthy render. | `red/ac4.txt`, `green-slice2b.txt` |
| AC5 Copilot status line | ✅ Repo-owned and installed plus wired by the daemon, with the prior script backed up. Output is byte-identical to the hand-written script on a sample payload. Dead and missing seats show as such. | `red/ac5.txt`, `copilot_status_line_matches_the_hand_written_layout_and_names_dead_seats` |
| AC6 reclaim | ✅ Refuses on caller, harness or live target. Audited `seat.reclaimed`. Clears the stale session (prime's finding). | `red/ac6.txt`, `reclaim_is_guarded_by_caller_harness_and_death_then_audited` |
| AC7 end-to-end | ✅ Run live on the real cicada, as Jordan directed. See below. | `evidence/ac7-cicada.txt` |
| AC8 contract | ✅ `docs/how/pij-rs-api.md` now covers the adopt continuity order, `--reclaim`, the heal loop, the Copilot status line, revive resume and `--fresh`, and the reincarnated-pane sweep. | this commit |

**AC7, on the real `pij-future-cicada`.** Jordan authorised this directly, so it ran on the production daemon, not an isolated one.
- **Live heal.** The row still recorded the blank's stale session. A no-op message made cicada render, and the status line healed the row to `56206875` (`statusline:healed pane=%3`) with no pij command typed.
- **Proof A.** `tmux kill-pane %3`, then the sweep tombstoned the seat. In a fresh pane `%8` I typed only `claude --resume 56206875…`. The seat came back as `pij-future-cicada` in 2 s, on the same session.
- **Proof B.** `tmux kill-pane %8`, then the sweep tombstoned it. `pij-rs revive pij-future-cicada` launched `claude --resume 56206875…` in `%9`. The session was kept, and the status line shows `⛓ pij-future-cicada`. Cicada is left running in `%9`.

**Brake, not policy.** The reincarnated-pane rule narrows the sweep's pane-presence veto. The dead recorded process still decides. A pane root that is older than the seat, or that can't be observed, still vetoes.

**Gates.** `cargo test --workspace`, `clippy -D warnings` and `fmt --check` pass on each slice. `just self-check` was not run in this final slice (it ran under the prime's merges).

**Findings.**
1. Copilot and OMP re-tie after a pane-id change was not checked live; they are extension-owned and out of scope.
2. The revived cicada launched without `--model`/`--effort` because its row records none. This predates the plan.
3. `target-review/` (untracked) in the worktree is not mine.
4. The Claude SessionStart hook logs only failures, so the live proof can't tell whether the hook or the status line won the race in `%8`.

**Encodable improvement.** The status line's `whoami` gives no reason when it refuses. A `resolved_by: stale-session` hint would let the render explain *why* it is registering.
