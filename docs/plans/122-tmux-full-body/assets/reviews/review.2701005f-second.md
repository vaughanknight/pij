# s122 second review — 2701005f

**Verdict: REQUEST_CHANGES**

## Findings

| ID | Severity | Location | Failure scenario | Required remediation |
| --- | --- | --- | --- | --- |
| S001 | HIGH | `crates/tmux/src/lib.rs:749-766`; `crates/daemon/src/pointer/worker.rs:327-335`; `crates/daemon/src/delivery/mod.rs:315-317` | The commit command enables input, sends irreversible Enter, then sets the `<token>-committed` marker. If Enter succeeds but that marker write fails, `run_if_submit_token` returns an error; `commit_submit` restores the active token and reports failure. The queue worker retries, and direct delivery forgets its pre-injection claim, so the already-submitted frame can be typed a second time. | Treat every error after Enter as committed delivery with independently recoverable marker cleanup, or make the post-Enter transition failure-safe. Add a forced failure of the committed-marker transition itself. The existing cleanup-failure test only fails the later restore call after the committed marker was successfully written. |
| S002 | MEDIUM | `crates/harnesses/src/interaction.rs:93-101, 104-128, 785-869` | The requested `drop-without-commit` exit is not in the exit table. `PaneTransaction` Drop clears only the self-injection state; `StagedSubmit` has no Drop. A cancellation/scope drop after staging but before commit therefore relies only on the watchdog, with no test proving no Enter plus eventual enabled input and cleared marker. | Add a real cancellation/drop-after-stage witness and assert input enabled, marker cleared, no Enter, and recovery behavior. Daemon death is a distinct row and does not cover ordinary object/future drop. |
| S003 | MEDIUM | `crates/tmux/tests/adapter.rs:579-610, 734-794` | The adapter/process race tests synchronize only before `acquire_submit`. Against the pre-rebuild 047ea0ed check-then-set implementation, both actors can pass the initial marker/input reads, then A can write and verify before B writes and verifies; both acquires can return `Ok` even though the test expects one. The current CAS implementation is source-level sound and the tests pass, but these tests do not prove failure against the old mechanism. | Force the old read/write interleaving (or run a mutation/baseline witness) between pre-check and marker reservation, then assert exactly one acquisition succeeds. |
| S004 | MEDIUM | `crates/tmux/src/lib.rs:42-45, 227-255`; plan goal `docs/plans/122-tmux-full-body/plan.dd.json:23-27` | No supported byte ceiling is defined. `SUBMIT_CHUNK_BYTES=1000` is only a chunk size and `SUBMIT_STAGE_LIMIT=1s` is a timing limit, so the largest accepted body depends on machine speed. Tests cover roughly 3KB, 8KB, live 6647B, and a 200KB timeout, but no largest-supported-size boundary or byte-max+1 behavior exists. | Define the supported byte domain (or explicitly make acceptance timing-based) and test the largest supported body plus above-bound behavior. |
| S005 | HIGH | `crates/daemon/src/pointer/worker.rs:253`, `crates/harnesses/src/interaction.rs:37-55, 278-325` | The worker supplies literal `human_typing=false` and `composer_idle=true` to `select_rung`, so the pure selector's veto is dead for this path. The live gate does not re-drain tap bytes at the fresh boundary, and after 60 seconds `expire_vetoes_if_idle` clears `composer_active` while a nonblank `content` remains; `fresh_injection_verdict` can therefore report `permitted=true` for a stale draft. A typed path that consumes permission without a hard current-nonblank veto can submit into an operator draft; prime has a live stepped-on-draft witness. | Make the PaneTransaction/body path treat a current nonblank composer as an unconditional veto regardless of idle age, consult live tap state at the boundary, and add a stale nonblank-draft plus live-input regression (mutation-proven). |

## Reviewed closures

- **R004 parser repair — independently verified:** `cargo test -p pij-harnesses decorative_blank_rule_region_is_not_an_idle_composer` passed; `rounded_border_above_cursor_does_not_hide_later_composer` passed.
- **R005/R006 pullability — independently verified:** `cargo test -p pij-daemon 'control_pointer_'` passed 2 tests; both forced lookup and clock errors immediately re-exposed the original queue row.
- **R003b random tokens and watchdog recovery — independently exercised:** `cargo test -p pij-tmux --test adapter` passed 25 tests, including `ownership_tokens_do_not_recycle_across_adapters`, `stale_watchdog_cannot_release_a_later_adapter_transaction`, and `watchdog_expiry_before_disable_cannot_strand_input`.
- **Large-body and Enter cleanup behavior — independently exercised:** the same 25-test adapter run passed `submit_pastes_a_3000_byte_multiline_body_intact`, `stage_deadline_aborts_and_restores_input`, `daemon_death_mid_stage_restores_input_within_bound`, `staged_submit_excludes_human_input_mid_body_and_before_enter`, and `post_enter_cleanup_failure_remains_success_and_submits_once`.
- **Exit-table fake — independently exercised:** `cargo test -p pij-harnesses transaction_exit_table_clears_marker_input_and_exemption` passed 1 test. This covers the seven implemented rows, but not the missing drop row.
- **Plan accounting — independently verified:** `harness plan validate docs/plans/122-tmux-full-body/plan.dd.json --complete` returned `status ok`, 0 errors, 0 warnings, 0 orphans, and 0 contradictions.

## Evidence boundary

The hand-run OMP/Copilot witnesses, control-byte measurement/inbox transcript, and prior full-gate receipts are coder-provided evidence; this review did not reproduce live clients. A fresh `harness checks` invocation in this worktree failed all eight Node/tooling sensors (`local-paths`, `typecheck`, `lint`, `test`, `windows-compat`, `smoke`, `pkg-audit`, `snapshots`); the packet records this as the pre-existing npm-resolution exception rather than a s122 Rust regression.

## Re-review of coder working tree

The coder's uncommitted S001–S005 fixes were re-read and exercised. Verdict table:

| Finding | Verdict | Evidence |
| --- | --- | --- |
| S001 post-Enter marker transition | **CLOSED** | Commit authorization now transitions the token before Enter; `committed_marker_transition_failure_never_sends_enter` and `post_enter_cleanup_failure_remains_success_and_submits_once` both passed in the real-tmux suite. |
| S002 drop without commit | **CLOSED** | `dropped_staged_submit_restores_input_without_enter` was added and passed; the interaction table now includes `DropWithoutCommit`. |
| S003 deterministic concurrency witness | **CLOSED** | `forced_old_read_write_interleaving_allows_only_one_adapter` and the forced process schedule were added; the updated 29-test real-tmux adapter suite passed. The mutation-red claim remains coder evidence. |
| S004 body-size boundary | **OPEN — MEDIUM** | A max and max+1 test now exist, but the constant is documented as the complete framed transaction while the tests and `stage_submit` boundary use the raw `text` passed to `TmuxPort::submit`; production callers pass `frame_message(...)`, so an 8,192-byte body is not an 8,192-byte complete frame. Above-limit worker/direct-delivery behavior is still not tested. |
| S005 live tap and stale draft hard veto | **CLOSED for s122 typed-body delivery** | `refresh_live_tap` now drains before capture; `owned_submit_hard_vetoes_stale_draft_and_fresh_tap` passed and asserts no stage/submit. `fresh_verdict_keeps_nonempty_composer_fact_after_policy_expiry` still correctly allows the stale draft only at the socket-policy layer; the typed path checks `composer_idle`. |

### New finding

| ID | Severity | Location | Failure scenario | Required remediation |
| --- | --- | --- | --- | --- |
| S006 | MEDIUM | `crates/daemon/src/pointer/worker.rs:1341-1438` | The updated `refresh_live_tap` vetoes when no tap is attached, but `drain_loop_survives_transient_delivery_ack_failure_and_processes_next_message` constructs `FakeTmux::new()` and manually registers panes without attaching taps. The worker never reaches `ack_delivery`; the full `cargo test -p pij-daemon` run hung in this test and was terminated with SIGTERM. | Attach/arrange the fake tap in this fixture (or use the shared registration helper) and rerun the full daemon suite; do not leave the completion gate hanging. |

Fresh re-review commands: updated real-tmux adapter suite **29 passed**; updated harness suite **65 passed, 2 ignored**; targeted socketless and stale-draft daemon regressions **1 passed each**; `cargo fmt --check` passed. Full `cargo test -p pij-daemon` did not complete because of S006.
The fresh Rust gate invocation with bare `cargo` also failed its toolchain stage: this worktree resolved `/opt/homebrew/bin/cargo`, which ran rustc 1.95.0 against the pinned 1.98.0 toolchain; lock, fmt, clippy, tests, and architecture passed. The coder's green receipt used `~/.cargo/bin/cargo` and remains coder-provided rather than independently reproduced.
