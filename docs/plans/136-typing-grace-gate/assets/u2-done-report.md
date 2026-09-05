# u2 — typing-grace gate delivery receipt

## Result

Unit implementation and verification complete; live cross-unit composition remains PM-owned.

- Seat: `pij-immense-hawk`; observed model footer: GPT-6 Astra (1M), high.
- Worktree: `/Users/jordanknight/pi-hacking/fs3-typing-grace-gate-u2`.
- Branch: `136-typing-grace-gate-u2`.
- Core vocabulary dependency commit: `0037a44189913ef81a766d1129b6df87c65b606e`.
- Authority: packet u2, then PM/prime amendments through `2fe71151`; startup FIFO ruling `14615489` belongs to u1. Later rulings supersede the original claimed-and-unacked design. Contract revisions were read by immutable `git show`; PM carries their latest documents into composition.

## What shipped

1. One Rust `DEFAULT_TYPING_GRACE_MS`; daemon-only environment override; flattened registration response without changing `SeatDescriptor` or `seat.put`.
2. Real authenticated `/v1/hold` and `/v1/release` routes carrying durable `job_id`. No transient claim map remains. Both spine kinds are known wire events; HTTP tests compare emitted payload bytes to the frozen fixture.
3. `Queue::defer`: pending/running delivery becomes pending, its worker lease clears, body/attempt/dedupe/delivery evidence survive. No new stored held state or schema. Positive SQLite deadlines round upward to its existing second precision; zero is immediate.
4. `Queue::release_deferred`: classification and pending-only deadline clearing share the queue transaction/lock. Running jobs remain owned by their reader. Absent, terminal, and not-deferred outcomes are distinguishable, with explicit HTTP no-op bodies.
5. A release declaration always emits `delivery.released`, independently of the queue outcome. Queue mutation is attempted before publication so awakened readers see updated eligibility. Running/terminal restart cases now clear sender-visible held evidence without revoking a claim.
6. HTTP `inbox?wait=true` subscribes to both `delivery.outcome` and `delivery.released` before attempting an ordinary nonwaiting claim. This is an intentional route-semantic change; `delivery/mod.rs` remains unchanged.
7. `StateCard.held` survives typed CLI decoding; `pij-rs state` renders `held: N (human-typing since ... ms)`, while JSON stays unadorned.
8. Pointer drain excludes Omp/Pi even when pane-bound or tombstoned. This is a separately proven **latent double-delivery fix**, valid independently of typing grace; eligible Claude rows still drain.
9. Honest queued-before-ack / ReaderRead-after-ack behavior is pinned for Omp and Pi. The producer was mutated only for the authorized negative control, then restored exactly.

## Verification

Commands ran in the worktree above with `VITEST_MAX_WORKERS=4`, `VITEST_MAX_THREADS=4`, `CARGO_BUILD_JOBS=4`; final gates also set `RUST_TEST_THREADS=4`.

| Proof | Observed result |
| --- | --- |
| `cargo test -p pij-core -p pij-daemon -p pij-cli -p pij-store -p pij-testkit -p pij-sidecars -- --test-threads=4` | **489 passed**, 50 suites, 1 existing ignored |
| Scoped `cargo clippy ... --all-targets -- -D warnings` for the same six packages | clean |
| `cargo fmt --all -- --check` | clean |
| Actual rebuilt `cargo run -p pij-cli --bin pij-rs -- state pij-immense-hawk` | real daemon read succeeded; human output ended `held: 0` |
| Held-count renderer witness | RED then GREEN for count 2/since 7; JSON parses without added human text |
| Isolated `just smoke` | all 11 scenarios passed, unchanged |
| Full `harness checks` | **8/8 pass**, no skips, exit 0 at `2026-09-05T00:47:53.772Z` |
| Independent review | three actionable findings reproduced, fixed, then source-cleared; final declaration amendment also source-cleared |

Full-gate sensors: local-paths, typecheck, lint, test, windows-compat, smoke, pkg-audit, snapshots. Exact retained final envelope follows.

```json
{
  "command": "checks",
  "status": "ok",
  "timestamp": "2026-09-05T00:47:53.772Z",
  "data": {
    "ok": true,
    "ran": [
      "local-paths",
      "typecheck",
      "lint",
      "test",
      "windows-compat",
      "smoke",
      "pkg-audit",
      "snapshots"
    ],
    "skipped": [],
    "results": [
      {
        "name": "local-paths",
        "status": "pass",
        "code": 0,
        "proves": "operational files contain no user-specific absolute home paths"
      },
      {
        "name": "typecheck",
        "status": "pass",
        "code": 0,
        "proves": "the TypeScript surface compiles"
      },
      {
        "name": "lint",
        "status": "pass",
        "code": 0,
        "proves": "Biome (errors + warnings) is clean"
      },
      {
        "name": "test",
        "status": "pass",
        "code": 0,
        "proves": "the vitest suite passes"
      },
      {
        "name": "windows-compat",
        "status": "pass",
        "code": 0,
        "proves": "portable typecheck, lint, registry replacement, inbox, fake, and no-tmux CLI checks pass"
      },
      {
        "name": "smoke",
        "status": "pass",
        "code": 0,
        "proves": "the tmux-driven end-to-end driver scenarios pass"
      },
      {
        "name": "pkg-audit",
        "status": "pass",
        "code": 0,
        "proves": "third-party package vetting surfaces no new findings"
      },
      {
        "name": "snapshots",
        "status": "pass",
        "code": 0,
        "proves": "agent-pack snapshots have not drifted"
      }
    ]
  },
  "next_action": "All checks green — safe to ship / declare this task done."
}
```

### Gate/environment deviations

- Fresh worktree initially lacked TS gate dependencies. Installed 503 packages **only in this worktree**, using the packet's temporary removal of `min-release-age`. Restored original `.npmrc` and `package-lock.json` bytes; neither belongs in the change.
- The first dependency-complete full gate was 7/8: smoke alone failed, but its diagnostic was lost to background-output column truncation. **Unproven cause, not reproduced in isolation**: the isolated 11-scenario smoke run passed without a code change, and the retained full rerun passed all eight sensors. No claim that a flaky cause was fixed.
- Queue additions required mechanical forwarding in `crates/sidecars/tests/sidecars.rs`, specifically `FailFirstClaim` and `RefuseFirstDelivery`. This is the explicitly reported out-of-original-fence footprint; no sidecar production behavior changed.
- No daemon start/restart, toolchain upgrade, main-clone npm install, PR, or push was performed by this unit.

## Toolchain observations — NOT an enforcement claim

The pin is **NOT claimed enforced**. PM reported: “observed cargo 1.98.0, rustc 1.95.0 (Homebrew), clippy 0.1.98; pin 1.98.0 NOT enforced, rustup absent.”

This seat's observations differ and are retained rather than silently reconciled:

```text
/Users/jordanknight/.cargo/bin/cargo --version
cargo 1.98.0 (797e8a9bc 2026-08-05)
/Users/jordanknight/.cargo/bin/rustc --version
rustc 1.98.0 (88d9e12ae 2026-08-18)
node --version
v24.7.0
npm --version
11.10.0
```

The existing worktree `target/.rustc_info.json`, read after final scoped cargo/clippy execution, also records `rustc 1.98.0 (88d9e12ae 2026-08-18)` and sysroot `/Users/jordanknight/.rustup/toolchains/1.98.0-aarch64-apple-darwin`. This final cache is not proof of pin enforcement or of the compiler selected by every earlier command. No installation probe, repair, or upgrade was made in response to the discrepancy.

## Corrections that changed the implementation/proof

- The original hold design retained a running claim; that blocked bypass and allowed lease-expiry re-delivery. Prime inverted it to pending/unclaimed.
- Existing `retry` refuses pending rows; existing `peek` observes oldest **live**, not oldest eligible. Neither behavior was silently changed. The temporary eligible-peek witness was withdrawn with the PM's retraction; ordinary claim remains the typing/bypass path.
- A duplicate `defer(job, ZERO)` release revoked an active reader. Atomic pending-only release replaced it.
- **The old golden job ID `1308` made the duplicate-release witness vacuous**: repeating an unclaimed/nonexistent fixture ID proved no race. Its replacement uses the actual job ID, claims it after release, repeats release, and proves acknowledgement succeeds. The pre-fix acknowledgement returned 500.
- Release publication and queue mutation are separate facts: a running/terminal queue no-op must still clear the extension's held declaration.
- Release did not wake existing HTTP inbox waiters; the HTTP subscription now covers release as well as new sends.
- Fake deferral overflow panicked while holding its mutex; checked arithmetic now refuses without mutation or poisoning.

> This unit found three defects at seams it did not own—stale-held state, the duplicate-release race, and unequal-deadline restart reordering—each would have passed both sides' isolated unit tests and failed only in front of Jordan. Interrogating assumptions before wiring exposed them before composition.

## ASSUMPTIONS / PM composition obligations

1. u1 sends the actual `InboxClaim.job_id` with matching seat/message identity, awaits hold/release operations, and treats re-offered `msg_id` values idempotently rather than injecting duplicates. The queue, not an extension note or daemon map, owns every body.
2. A hold may arrive again while pending: it updates eligibility without incrementing attempt and without duplicating active held evidence. Absent/terminal IDs are observable no-ops, not false successful mutations.
3. u1 declares release **before acking any row it may have held**; unconditionally doing so is permitted. This includes after restart when its memory is lost. The declaration clears readback even when the queue row is already running or terminal. Queue no-op does not mean “no release event.”
4. **Startup FIFO is u1-owned per `14615489`: session_start uses oldest-live peek → release → ordinary claim.** Ordinary typing/bypass uses claim, not peek. Queue ordering is among eligible rows only; unequal deferrals can otherwise reorder deliveries after memory loss. PM's live witness must use two differing deadlines, with the older row deferred later.
5. Existing stored pending jobs and their IDs survive process/daemon restart. The unit proves adapter persistence semantics and HTTP state recreation; PM owns live process-kill/re-register/daemon-restart witnesses and deployment ordering.
6. Live editor observation, programmatic-edit suppression, urgent detection, and last-edit timing belong to u1/u3. This unit publishes the one grace and controls queue eligibility; it does not observe keystrokes.
7. SQLite's pre-existing integer-second eligibility bounds positive deferral by upward rounding; explicit release makes it eligible immediately. This is not an extra grace policy.

## Snap-in recipe and boundary

Real routing and register construction are documented beside `router_with_config` in `crates/daemon/src/http/mod.rs` and already wired inside this unit. The PM retains the existing outer daemon router call and pointer-worker cadence; no new outer composition object is needed. `crates/daemon/src/lib.rs` and `crates/daemon/src/delivery/mod.rs` are unchanged.

Tree-resident `git status --short`, from the assigned branch after code validation, listed only the intended Rust files below; core `delivery.rs` was already committed separately. The compiler's package paths in build output also name this worktree.

```text
 M crates/cli/src/main.rs
 M crates/core/src/ports.rs
 M crates/core/src/wire.rs
 M crates/daemon/src/http/mod.rs
 M crates/daemon/src/http/tests.rs
 M crates/daemon/src/http/types.rs
 M crates/daemon/src/pointer/worker.rs
 M crates/sidecars/tests/sidecars.rs
 M crates/store/src/queue.rs
 M crates/store/tests/queue.rs
 M crates/testkit/src/fakes.rs
 M crates/testkit/tests/contract_over_fakes.rs
136-typing-grace-gate-u2
```

## Harness improvement

The new contract tests and actual interleaving witnesses encode the discovered failure modes. Preserve the session observations (`CONF-001..003`, `DL-001..002`); no buffer was cleared. Highest-leverage next encoding: freeze cross-unit contracts against executable authority-backed witnesses, including restart and duplicate-request interleavings, before fan-out. Also bootstrap every gate runtime in fresh worktrees, not only the unit's language toolchain.

## RED and negative-control receipts

Chronology is explicit: ordinary route/render/failure-path witnesses ran against pre-fix behavior. New queue APIs first produced compiler RED (`E0046`, missing required `defer` / `release_deferred` implementations); after implementation, deliberately incorrect no-op implementations killed **all 20 adapter witnesses** (7 SQLite defer + 6 fake defer + 4 SQLite release + 3 fake release), then exact production bytes were restored. These are **negative controls**, not fabricated pre-implementation assertion failures. The existing honest-receipt guard used the separately authorized lying-producer control. Every final implementation was subsequently GREEN.

The blocks below are excerpts of actual captured command output, not reconstructed assertions.

### Initial HTTP/wire baseline

Session receipt: `artifact://16`.

```text
running 13 tests
test client::tests::registration_requires_pid_and_start_time_together ... ok
test address::tests::an_unqualified_address_always_means_local ... ok
test tests::exit_code_contract_is_an_explicit_table ... ok
test address::tests::address_parse_table_covers_degenerate_and_escaped_cases ... ok
test tests::human_rendering_does_not_hide_a_success_warning ... ok
test client::tests::unsupported_envelope_version_is_refused_before_payload_typing ... ok
test address::tests::every_rendered_address_parses_back_to_the_same_destination ... ok
test client::tests::send_serializes_destination_as_an_object_and_keeps_reply_correlation ... ok
test client::tests::every_unrecognised_version_is_skew_not_only_future_versions ... ok
test bounce::tests::unauthenticated_401_is_distinct_from_no_listener_and_wrong_status ... ok
test client::tests::tail_reads_hello_then_frames_and_keeps_unknown_event_kinds ... ok
test bounce::tests::clean_head_equal_to_origin_main_is_reproducible ... ok
test bounce::tests::dirty_and_divergent_are_named_as_different_refusals ... ok

test result: ok. 13 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.46s

     Running unittests src/main.rs (target/debug/deps/pij_rs-cef6b5fa53033f07)

running 27 tests
test identity_cli_tests::no_pane_builds_the_paneless_form ... ok
test identity_cli_tests::the_pane_form_is_the_ready_gestures_command_line ... ok
test identity_cli_tests::an_omitted_parent_is_absent_from_the_wire ... ok
test tests::linked_worktree_detection_names_the_git_dir_shape ... ok
test tests::malformed_environment_values_name_the_variable_and_value ... ok
test tests::editorial_help_is_shape_checked_not_frozen ... ok
test tests::clap_exposes_every_ruled_verb ... ok
test tests::inbox_peek_is_an_explicit_non_destructive_mode ... ok
test tests::accept_inbound_and_no_accept_inbound_conflict ... ok
test tests::explicit_accept_inbound_still_works_for_claude ... ok
test tests::help_leads_with_short_send_and_destructive_inbox_forms ... ok
test tests::claude_spawn_accepts_inbound_by_default ... ok
test tests::daemon_bounce_is_real_while_bare_daemon_still_runs_foreground ... ok
test tests::clap_leaves_runtime_defaults_unresolved ... ok
test tests::missing_send_body_reaches_the_named_runtime_refusal ... ok
test tests::no_accept_inbound_withdraws_the_claude_default ... ok
test tests::rendered_pointer_advertises_a_verb_the_real_cli_exposes ... ok
test tests::non_claude_spawn_defaults_to_no_inbound_setting ... ok
test tests::runtime_controls_resolve_flag_then_environment_then_default ... ok
test tests::doctor_exposes_claude_hook_state ... ok
test tests::register_requires_a_complete_process_identity ... ok
test tests::revive_carries_only_identity_and_placement ... ok
test tests::telegram_short_form_leaves_identity_and_message_id_for_runtime_resolution ... ok
test tests::send_short_forms_leave_identity_and_message_id_for_runtime_resolution ... ok
test tests::spawn_waits_thirty_seconds_by_default_and_no_wait_disables_it ... ok
test tests::spawn_without_an_id_parses_and_leaves_allocation_to_the_daemon ... ok
test tests::claude_adopt_warns_for_unaccepted_caller_config_dir ... ok

test result: ok. 27 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s

     Running tests/claude_inbound.rs (target/debug/deps/claude_inbound-4f98d0201e5e6d1f)

running 2 tests
test doctor_reports_each_home_without_writing_settings ... ok
test daemon_boot_repairs_once_and_publishes_one_change_event ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 1.59s

     Running tests/render_golden.rs (target/debug/deps/render_golden-03fc3106f574b65f)

running 3 tests
test list_computed_payload_matches_the_committed_golden ... ok
test register_computed_payload_matches_the_committed_golden ... ok
test send_computed_payload_matches_the_committed_golden ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.01s

     Running tests/revive.rs (target/debug/deps/revive-8468a0dd50883b92)

running 2 tests
test shipped_revive_refuses_absent_and_live_ids_without_launching ... ok
test shipped_revive_derives_identity_and_launches_one_prebind_incarnation ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.25s

     Running tests/shipped_daemon_config.rs (target/debug/deps/shipped_daemon_config-a329565825c82e72)

running 2 tests
test the_offline_flag_selects_a_daemon_that_touches_nothing ... ok
test the_shipped_config_boots_real_adapters_and_leaves_a_store_on_disk ... ok

test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.41s

     Running tests/sidecar_producer.rs (target/debug/deps/sidecar_producer-17fe518e3239b29f)

running 1 test
test the_shipped_client_can_complete_one_sidecar_call ... ok

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.39s

     Running tests/spawn.rs (target/debug/deps/spawn-bcd9f8963475ce08)

running 3 tests
test shipped_cli_reads_one_seat_state_back_from_the_real_store ... ok
test shipped_spawn_revive_and_registration_transitions_replace_rpc_port_intent ... ok
test shipped_cli_registers_sends_reads_acks_and_does_not_read_twice ... ok

test result: ok. 3 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.59s

     Running unittests src/lib.rs (target/debug/deps/pij_core-ee92be9851235554)

running 19 tests
test anomalies::tests::delivered_unacked_uses_the_ts_kind_and_emits_the_exact_ack_command ... ok
test anomalies::tests::disposition_events_are_appendable_spine_facts_for_the_exact_occurrence ... ok
test anomalies::tests::cleared_occurrence_stays_cleared_until_source_evidence_changes ... ok
test anomalies::tests::every_emitted_row_has_an_observable_and_runnable_remediation ... ok
test anomalies::tests::status_staleness_is_clock_only_and_parking_suspends_nudging_not_detection ... ok
test delivery::tests::delivery_ladder_enumerates_every_rung_in_order ... ok

[Showing lines 1-300 of 612. Use :301 to continue]
```

### Expanded pre-fix HTTP baseline

Session receipt: `artifact://51`.

```text
---- http::tests::typing_pending_holds_allow_bypass_rehold_and_restart_in_order stdout ----

thread 'http::tests::typing_pending_holds_allow_bypass_rehold_and_restart_in_order' (891740250) panicked at crates/daemon/src/http/tests.rs:178:5:
assertion `left == right` failed
  left: 404
 right: 200
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

---- http::tests::typing_hold_release_match_contract_and_are_idempotent stdout ----

thread 'http::tests::typing_hold_release_match_contract_and_are_idempotent' (891740249) panicked at crates/daemon/src/http/tests.rs:392:13:
assertion `left == right` failed
  left: 404
 right: 200

---- http::tests::typing_unknown_claim_after_restart_is_harmless_and_keeps_pending_body stdout ----

thread 'http::tests::typing_unknown_claim_after_restart_is_harmless_and_keeps_pending_body' (891740261) panicked at crates/daemon/src/http/tests.rs:178:5:
assertion `left == right` failed
  left: 404
 right: 200

---- http::tests::typing_state_projects_active_holds_only stdout ----

thread 'http::tests::typing_state_projects_active_holds_only' (891740260) panicked at crates/daemon/src/http/tests.rs:293:5:
assertion `left == right` failed
  left: Null
 right: Array [Object {"msg_id": String("active"), "reason": String("human-typing"), "seat": String("pij-state"), "since_ms": Number(7)}]

---- http::tests::typing_registration_flattens_grace_without_persisting_it_on_the_seat stdout ----

thread 'http::tests::typing_registration_flattens_grace_without_persisting_it_on_the_seat' (891740254) panicked at crates/daemon/src/http/tests.rs:320:17:
grace None: 
running 1 test
test http::tests::typing_registration_flattens_grace_without_persisting_it_on_the_seat ... FAILED

failures:

failures:
    http::tests::typing_registration_flattens_grace_without_persisting_it_on_the_seat

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 175 filtered out; finished in 0.00s


thread 'http::tests::typing_registration_flattens_grace_without_persisting_it_on_the_seat' (891740259) panicked at crates/daemon/src/http/tests.rs:342:5:
assertion `left == right` failed
  left: Null
 right: 60000
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace



failures:
    http::tests::typing_hold_release_match_contract_and_are_idempotent
    http::tests::typing_pending_holds_allow_bypass_rehold_and_restart_in_order
    http::tests::typing_registration_flattens_grace_without_persisting_it_on_the_seat
    http::tests::typing_state_projects_active_holds_only
    http::tests::typing_unknown_claim_after_restart_is_harmless_and_keeps_pending_body

test result: FAILED. 2 passed; 5 failed; 0 ignored; 0 measured; 169 filtered out; finished in 0.01s
```

### Honest-receipt producer negative control

Session receipt: `artifact://26`.

```text
running 1 test

thread 'http::tests::typing_receipt_is_queued_until_ack_then_reader_read_for_omp_and_pi' (891318675) panicked at crates/daemon/src/http/tests.rs:290:9:
assertion `left == right` failed
  left: Object {"origin": String("reader-read"), "outcome": String("delivered")}
 right: Object {"next_retry_at": Number(0), "outcome": String("queued"), "reason": String("extension-stream")}
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
test http::tests::typing_receipt_is_queued_until_ack_then_reader_read_for_omp_and_pi ... FAILED

failures:

failures:
    http::tests::typing_receipt_is_queued_until_ack_then_reader_read_for_omp_and_pi

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 171 filtered out; finished in 0.00s
```

### Pointer ownership baseline

Session receipt: `artifact://48`.

```text
---- pointer::worker::tests::omp_and_pi_rows_remain_unclaimed_while_claude_drains stdout ----

thread 'pointer::worker::tests::omp_and_pi_rows_remain_unclaimed_while_claude_drains' (891636030) panicked at crates/daemon/src/pointer/worker.rs:1339:9:
assertion `left == right` failed: only Claude is claimed, including when pull consumers are tombstoned
  left: 5
 right: 1
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    pointer::worker::tests::omp_and_pi_rows_remain_unclaimed_while_claude_drains

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 172 filtered out; finished in 0.00s
```

### CLI held-summary baseline

Session receipt: `artifact://59`.

```text
---- tests::typing_state_renders_count_and_since_without_corrupting_json stdout ----

thread 'tests::typing_state_renders_count_and_since_without_corrupting_json' (891862428) panicked at crates/cli/src/main.rs:1628:9:
pij state: ok — {"id":"pij-typist","state":"idle","liveness":"active","pid":null,"procStart":null,"cwd":"/abs/tree","harness":"omp","role":null,"parent":null,"boundModel":null,"effort":null,"pane":null,"provider":null,"semanticState":null,"machine":null,"tombstonedAt":null,"tombstoneReason":null,"statusPrev":null,"statusNext":null,"statusAt":null,"statusSeq":null,"statusStale":null,"stateNote":null,"held":[{"msg_id":"one","reason":"human-typing","seat":"pij-typist","since_ms":7},{"msg_id":"two","reason":"human-typing","seat":"pij-typist","since_ms":9}],"unsupported":[]}
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    tests::typing_state_renders_count_and_since_without_corrupting_json

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 27 filtered out; finished in 0.00s
```

### Explicit no-op body baseline

Session receipt: `artifact://81`.

```text
---- http::tests::typing_not_live_names_absent_and_terminal_noops_on_both_routes stdout ----

thread 'http::tests::typing_not_live_names_absent_and_terminal_noops_on_both_routes' (892364637) panicked at crates/daemon/src/http/tests.rs:218:13:
assertion `left == right` failed: /v1/hold absent: {"command":"pij hold","data":{"held":false,"msg_id":"terminal"},"ok":true,"v":2}
  left: Null
 right: true
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    http::tests::typing_not_live_names_absent_and_terminal_noops_on_both_routes

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 176 filtered out; finished in 0.01s
```

### Fake overflow baseline

Session receipt: `artifact://91`.

```text
---- fake_queue_defer_overflow_refuses_without_poisoning_or_mutating stdout ----

thread 'fake_queue_defer_overflow_refuses_without_poisoning_or_mutating' (892642875) panicked at /Users/jordanknight/.rustup/toolchains/1.98.0-aarch64-apple-darwin/lib/rustlib/src/rust/library/core/src/time.rs:1257:31:
overflow when adding durations
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    fake_queue_defer_overflow_refuses_without_poisoning_or_mutating

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 17 filtered out; finished in 0.00s
```

### Duplicate-release and wait-wakeup regressions

Session receipt: `artifact://93`.

```text
---- http::tests::typing_hold_release_match_contract_and_are_idempotent stdout ----

thread 'http::tests::typing_hold_release_match_contract_and_are_idempotent' (892700211) panicked at crates/daemon/src/http/tests.rs:229:5:
assertion `left == right` failed
  left: 500
 right: 200
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

---- http::tests::typing_release_wakes_an_already_waiting_inbox_reader stdout ----

thread 'http::tests::typing_release_wakes_an_already_waiting_inbox_reader' (892700223) panicked at crates/daemon/src/http/tests.rs:210:84:
release wakes the existing reader without another send: Elapsed(())


failures:
    http::tests::typing_hold_release_match_contract_and_are_idempotent
    http::tests::typing_release_wakes_an_already_waiting_inbox_reader

test result: FAILED. 7 passed; 2 failed; 0 ignored; 0 measured; 169 filtered out; finished in 0.26s
```

### SQLite defer negative control

Session receipt: `artifact://97`.

```text
---- defer_positive_delay_never_becomes_eligible_early stdout ----

thread 'defer_positive_delay_never_becomes_eligible_early' (892763559) panicked at crates/store/tests/queue.rs:898:9:
integer-second storage must round the absolute deadline upward, including whole-second delays
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

---- defer_pending_delivery_replaces_deadline_and_zero_releases_it stdout ----

thread 'defer_pending_delivery_replaces_deadline_and_zero_releases_it' (892763558) panicked at crates/store/tests/queue.rs:639:5:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: Deferred { recipient: SeatId("pij-pending"), msg_id: "m-pending" }

---- defer_absent_and_terminal_jobs_are_not_live stdout ----

thread 'defer_absent_and_terminal_jobs_are_not_live' (892763557) panicked at crates/store/tests/queue.rs:820:13:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: NotLive { reason: Terminal }

---- defer_preserves_delivery_body_and_original_fifo_position stdout ----

thread 'defer_preserves_delivery_body_and_original_fifo_position' (892763560) panicked at crates/store/tests/queue.rs:761:14:
oldest still first

---- defer_refuses_non_delivery_jobs_without_mutation stdout ----

thread 'defer_refuses_non_delivery_jobs_without_mutation' (892763768) panicked at crates/store/tests/queue.rs:859:13:
only a correctly addressed delivery may be deferred: pointer

---- defer_rejects_unrepresentable_delay_without_mutation stdout ----

thread 'defer_rejects_unrepresentable_delay_without_mutation' (892763770) panicked at crates/store/tests/queue.rs:920:9:
an unrepresentable deadline must be rejected

---- defer_running_delivery_releases_ownership_without_counting_attempt_or_delivery stdout ----

thread 'defer_running_delivery_releases_ownership_without_counting_attempt_or_delivery' (892763775) panicked at crates/store/tests/queue.rs:553:5:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: Deferred { recipient: SeatId("pij-recipient"), msg_id: "m-deferred" }


failures:
    defer_absent_and_terminal_jobs_are_not_live
    defer_pending_delivery_replaces_deadline_and_zero_releases_it
    defer_positive_delay_never_becomes_eligible_early
    defer_preserves_delivery_body_and_original_fifo_position
    defer_refuses_non_delivery_jobs_without_mutation
    defer_rejects_unrepresentable_delay_without_mutation
    defer_running_delivery_releases_ownership_without_counting_attempt_or_delivery

test result: FAILED. 0 passed; 7 failed; 0 ignored; 0 measured; 21 filtered out; finished in 0.13s
```

### Fake defer negative control

Session receipt: `artifact://99`.

```text
---- fake_queue_defer_refuses_non_delivery_without_mutating_pending_or_running_rows stdout ----

thread 'fake_queue_defer_refuses_non_delivery_without_mutating_pending_or_running_rows' (892766321) panicked at crates/testkit/tests/contract_over_fakes.rs:398:22:
only matching delivery kinds can be deferred: NotLive { reason: Absent }

---- fake_queue_defer_pending_replaces_the_schedule_from_the_current_clock stdout ----

thread 'fake_queue_defer_pending_replaces_the_schedule_from_the_current_clock' (892766320) panicked at crates/testkit/tests/contract_over_fakes.rs:171:9:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: Deferred { recipient: SeatId("pij-pending"), msg_id: "pending-message" }

---- fake_queue_defer_overflow_refuses_without_poisoning_or_mutating stdout ----

thread 'fake_queue_defer_overflow_refuses_without_poisoning_or_mutating' (892766319) panicked at crates/testkit/tests/contract_over_fakes.rs:436:46:
overflow is an error, never a panic: NotLive { reason: Absent }
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

---- fake_queue_defer_absent_or_terminal_is_not_live_and_preserves_delivery_evidence stdout ----

thread 'fake_queue_defer_absent_or_terminal_is_not_live_and_preserves_delivery_evidence' (892766318) panicked at crates/testkit/tests/contract_over_fakes.rs:328:13:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: NotLive { reason: Terminal }

---- fake_queue_defer_running_preserves_identity_body_attempt_and_delay stdout ----

thread 'fake_queue_defer_running_preserves_identity_body_attempt_and_delay' (892766324) panicked at crates/testkit/tests/contract_over_fakes.rs:89:9:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: Deferred { recipient: SeatId("pij-recipient"), msg_id: "stored-message" }

---- fake_queue_defer_zero_releases_pending_and_running_without_reordering_fifo stdout ----

thread 'fake_queue_defer_zero_releases_pending_and_running_without_reordering_fifo' (892766325) panicked at crates/testkit/tests/contract_over_fakes.rs:249:13:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: Deferred { recipient: SeatId("pij-fifo"), msg_id: "first-message" }


failures:
    fake_queue_defer_absent_or_terminal_is_not_live_and_preserves_delivery_evidence
    fake_queue_defer_overflow_refuses_without_poisoning_or_mutating
    fake_queue_defer_pending_replaces_the_schedule_from_the_current_clock
    fake_queue_defer_refuses_non_delivery_without_mutating_pending_or_running_rows
    fake_queue_defer_running_preserves_identity_body_attempt_and_delay
    fake_queue_defer_zero_releases_pending_and_running_without_reordering_fifo

test result: FAILED. 0 passed; 6 failed; 0 ignored; 0 measured; 12 filtered out; finished in 0.00s
```

### SQLite release negative control

Session receipt: `artifact://116`.

```text
---- release_deferred_distinguishes_absent_and_terminal_jobs stdout ----

thread 'release_deferred_distinguishes_absent_and_terminal_jobs' (893151749) panicked at crates/store/tests/queue.rs:1115:9:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: NotLive { reason: Terminal }

---- release_deferred_refuses_non_delivery_jobs_without_mutation stdout ----

thread 'release_deferred_refuses_non_delivery_jobs_without_mutation' (893151752) panicked at crates/store/tests/queue.rs:1153:13:
release only accepts a correctly addressed delivery: pointer
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

---- release_deferred_duplicate_or_optimistic_release_preserves_the_active_claim stdout ----

thread 'release_deferred_duplicate_or_optimistic_release_preserves_the_active_claim' (893151750) panicked at crates/store/tests/queue.rs:1047:13:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: NotDeferred

---- release_deferred_pending_delivery_is_immediate_without_changing_body_attempt_or_evidence stdout ----

thread 'release_deferred_pending_delivery_is_immediate_without_changing_body_attempt_or_evidence' (893151751) panicked at crates/store/tests/queue.rs:972:5:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: Released { recipient: SeatId("pij-release"), msg_id: "m-release" }


failures:
    release_deferred_distinguishes_absent_and_terminal_jobs
    release_deferred_duplicate_or_optimistic_release_preserves_the_active_claim
    release_deferred_pending_delivery_is_immediate_without_changing_body_attempt_or_evidence
    release_deferred_refuses_non_delivery_jobs_without_mutation

test result: FAILED. 0 passed; 4 failed; 0 ignored; 0 measured; 28 filtered out; finished in 0.04s
```

### Fake release negative control

Session receipt: `artifact://118`.

```text
---- fake_queue_release_deferred_distinguishes_absent_and_terminal_without_resurrection stdout ----

thread 'fake_queue_release_deferred_distinguishes_absent_and_terminal_without_resurrection' (893155456) panicked at crates/testkit/tests/contract_over_fakes.rs:628:13:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: NotLive { reason: Terminal }
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

---- fake_queue_release_deferred_preserves_body_attempt_ledger_and_active_reader stdout ----

thread 'fake_queue_release_deferred_preserves_body_attempt_ledger_and_active_reader' (893155457) panicked at crates/testkit/tests/contract_over_fakes.rs:495:13:
assertion `left == right` failed
  left: NotLive { reason: Absent }
 right: Released { recipient: SeatId("pij-release"), msg_id: "release-message" }

---- fake_queue_release_deferred_refuses_non_delivery_without_mutation stdout ----

thread 'fake_queue_release_deferred_refuses_non_delivery_without_mutation' (893155458) panicked at crates/testkit/tests/contract_over_fakes.rs:681:22:
refuse non-delivery: NotLive { reason: Absent }


failures:
    fake_queue_release_deferred_distinguishes_absent_and_terminal_without_resurrection
    fake_queue_release_deferred_preserves_body_attempt_ledger_and_active_reader
    fake_queue_release_deferred_refuses_non_delivery_without_mutation

test result: FAILED. 0 passed; 3 failed; 0 ignored; 0 measured; 18 filtered out; finished in 0.00s
```

### Final release declaration regression

Session receipt: `artifact://127`.

```text
---- http::tests::typing_release_declaration_clears_running_and_terminal_holds_after_restart stdout ----

thread 'http::tests::typing_release_declaration_clears_running_and_terminal_holds_after_restart' (893528755) panicked at crates/daemon/src/http/tests.rs:318:9:
assertion `left == right` failed: queue no-op must not leave stale held evidence
  left: Array [Object {"msg_id": String("declaration"), "reason": String("human-typing"), "seat": String("pij-release-declaration"), "since_ms": Number(7)}]
 right: Array []
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace


failures:
    http::tests::typing_release_declaration_clears_running_and_terminal_holds_after_restart

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 178 filtered out; finished in 0.01s
```
