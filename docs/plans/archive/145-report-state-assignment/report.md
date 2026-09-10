# Plan 145 delivery

Source commit: `79af85083c389b00d431cf2a25f0f390dbebbaa2`
Branch: `145-report-state-assignment`
Coder: `pij-conservation-spoonbill`; prime: `pij-minor-unicorn`.

This post-commit report is intentionally outside the source commit so its SHA is exact. Preserve it with the handoff. No push, PR, merge, production restart, or flight-plan mutation.

## Acceptance

- AC1: state/blocked/question accept an existing caller-owned task; unknown and foreign tasks return named 400 refusals before any report/question write.
- AC2: assignment metadata survives spine persistence/reopen, report receipts, selected `node show` state, and `pij state` beside its note. Refs-only declarations work. Clear/unscoped declarations discard stale metadata. Old history defaults safely.
- AC2a (prime ruling): **`assignment_id` is the only canonical field**, matching existing verify/anomaly consumers. No `assignment` alias or second spelling; `refs` stays `refs`.
- AC3: project and relay refusals now explain actual node scoping / missing relay authority; no report refusal cites a legacy source line or recommends legacy fallback.
- AC4: behavioral RED first, all final Rust suites green, golden and manifest regenerated deliberately, unchanged current-parent verify contract exercised against newly reported task-scoped done events.
- AC5: `docs/how/pij-rs-api.md` flags table, named codes, default/projection behavior and actual client parity updated. Review F2 found two stale node skill examples; the fix round removes unsupported `--project` from `report now` and `--assignment` from `report clear`.
- AC6: actual native binary on private real-adapter daemon opened a task, reported waiting with refs, read `node show`, observed both named refusals, reported blocked/question/done, and verified that done event as parent.

## Changes

- Parser accepts assignment/refs only on the three scoped leaves; rejects duplicate/missing metadata values; uses existing governance CSV normalization.
- Decision service checks the existing store task lookup and immutable owner before writing; durable questions retain their decision behavior.
- Core `StateRecord` adds serde-default `assignment_id` / `refs`. Every `declare` and durable-question caller migrated.
- `node show` adds the selected node's `state` block; child summaries remain structural. `pij state` and report receipts use canonical metadata names.
- Existing task verification/store rules and task closure untouched. `report state done` does not close a task.

## RED receipts

Commands run from the worktree, using `~/.cargo/bin/cargo`.
Initial HTTP fixture setup used the wrong caller spelling; corrected to the existing `PIJ_SESSION_ID` wire before recording behavioral RED below. This setup failure is not claimed as the regression witness.

### Parser — exit 101

`cargo test -p pij-daemon assignment_ -- --nocapture`

```text
Compiling pij-daemon v0.1.0 (/Users/jordanknight/pi-hacking/fs3-report-assignment/crates/daemon)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 17.56s
     Running unittests src/lib.rs (target/debug/deps/pij_daemon-043514ab0ddb16b1)

running 2 tests

thread 'http::report::tests::reporting_assignment_flags_are_accepted_only_on_state_leaves' (1385324299) panicked at crates/daemon/src/http/report.rs:519:13:
assertion failed: parse_report(&argv(&["report", leaf, value, "--assignment", "task-1",
                            "--refs", "a,b"])).is_ok()
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
test http::report::tests::verify_accepts_seat_only_and_explicit_assignment_but_not_ignored_filters ... ok
test http::report::tests::reporting_assignment_flags_are_accepted_only_on_state_leaves ... FAILED

failures:

failures:
    http::report::tests::reporting_assignment_flags_are_accepted_only_on_state_leaves

test result: FAILED. 1 passed; 1 failed; 0 ignored; 0 measured; 366 filtered out; finished in 0.00s

error: test failed, to rerun pass `-p pij-daemon --lib`
```

### HTTP ownership and round-trip — exit 101

`cargo test -p pij-daemon --test report_http assignment_ -- --nocapture`

```text
Finished `test` profile [unoptimized + debuginfo] target(s) in 0.43s
     Running tests/report_http.rs (target/debug/deps/report_http-10f32502a00f58b3)

running 2 tests

thread 'assignment_reports_survive_reopen_and_reach_node_and_state_readers' (1385348204) panicked at crates/daemon/tests/report_http.rs:1252:9:
assertion `left == right` failed: {"command":"pij report","error":"refused","meta":"rs cannot honour --assignment: it names an ASSIGNMENT id (.pi/extensions/pij/core/cli.ts:888-892). rs has no assignment model. Refusing by name rather than accepting the flag and discarding what it asked for. This verb still works on the legacy generation: PIJ_DAEMON_GENERATION=legacy pij report …","ok":false,"v":2}
  left: 400
 right: 200
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
test assignment_reports_survive_reopen_and_reach_node_and_state_readers ... FAILED

thread 'assignment_refusals_name_owner_and_leave_state_and_questions_untouched' (1385348203) panicked at crates/daemon/tests/report_http.rs:1302:13:
assertion `left == right` failed: {"command":"pij report","error":"refused","meta":"rs cannot honour --assignment: it names an ASSIGNMENT id (.pi/extensions/pij/core/cli.ts:888-892). rs has no assignment model. Refusing by name rather than accepting the flag and discarding what it asked for. This verb still works on the legacy generation: PIJ_DAEMON_GENERATION=legacy pij report …","ok":false,"v":2}
  left: Null
 right: "E-RS-ASSIGNMENT-NOT-YOURS"
test assignment_refusals_name_owner_and_leave_state_and_questions_untouched ... FAILED

failures:

failures:
    assignment_refusals_name_owner_and_leave_state_and_questions_untouched
    assignment_reports_survive_reopen_and_reach_node_and_state_readers

test result: FAILED. 0 passed; 2 failed; 0 ignored; 0 measured; 26 filtered out; finished in 0.06s

error: test failed, to rerun pass `-p pij-daemon --test report_http`
```

### Old history default — exit 101

`cargo test -p pij-core --test report old_state_history -- --nocapture`

```text
Blocking waiting for file lock on build directory
   Compiling serde_core v1.0.229
   Compiling serde v1.0.229
   Compiling memchr v2.8.3
   Compiling serde_json v1.0.151
   Compiling syn v3.0.4
   Compiling serde_derive v1.0.229
   Compiling thiserror-impl v2.0.20
   Compiling async-trait v0.1.92
   Compiling thiserror v2.0.20
   Compiling toml_datetime v0.7.5+spec-1.1.0
   Compiling serde_spanned v1.1.1
   Compiling toml v0.9.12+spec-1.1.0
   Compiling pij-core v0.1.0 (/Users/jordanknight/pi-hacking/fs3-report-assignment/crates/core)
   Compiling pij-testkit v0.1.0 (/Users/jordanknight/pi-hacking/fs3-report-assignment/crates/testkit)
    Finished `test` profile [unoptimized + debuginfo] target(s) in 11.54s
     Running tests/report.rs (target/debug/deps/report-1cec2dab7b0286e9)

running 1 test

thread 'old_state_history_defaults_assignment_and_refs_without_losing_its_note' (1385333906) panicked at crates/core/tests/report.rs:305:5:
assertion `left == right` failed
  left: Null
 right: Array []
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace
test old_state_history_defaults_assignment_and_refs_without_losing_its_note ... FAILED

failures:

failures:
    old_state_history_defaults_assignment_and_refs_without_losing_its_note

test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 7 filtered out; finished in 0.00s

error: test failed, to rerun pass `-p pij-core --test report`
```

## Final gates

| Command | Observed result |
|---|---|
| `cargo test --workspace` | Exit 0; tool summary: 1064 passed, 85 suites, 8 ignored, 93 filtered. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0. |
| `cargo fmt --all -- --check` | Exit 0, no output. |
| `harness checks` | Exit 0; `status:ok`, `data.ok:true`, all 10 sensors ran, `skipped:[]`. |

Harness final timestamp: `2026-09-10T00:29:06.949Z`.
Sensors: local-paths, typecheck, lint, test, copilot-native, windows-compat, smoke, pkg-audit, snapshots, pij-commit-trailers.
The earlier full harness invocation also passed. Initial boot smoke timeout was not suppressed; full completion gates subsequently passed.

Workspace gate tail (raw artifact `artifact://52`):

```text
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 0.00s

     Running tests/wire_over_corpus.rs (target/debug/deps/wire_over_corpus-7c671951bcd14ab1)

running 10 tests
test the_hello_line_comes_first_and_declares_the_version ... ok
test an_envelope_round_trips_and_a_current_version_is_accepted ... ok
test a_sequenced_event_never_carries_its_cursor_onto_the_wire ... ok
test a_known_event_round_trips_through_the_wire ... ok
test an_unknown_event_kind_is_forwarded_not_dropped ... ok
test a_truncated_line_is_reported_with_its_line_number ... ok
test an_empty_stream_is_empty_not_broken ... ok
test an_event_without_a_kind_is_a_shape_error_not_an_unknown_kind ... ok
test an_envelope_from_the_future_is_refused_whole ... ok
test a_stray_human_line_costs_that_line_and_nothing_else ... ok


[Artifact storage: ~/.omp/agent/sessions/-pi-hacking-pij/2026-09-10T00-16-09-113Z_01a088ac-0199-777f-9f0c-8825040231d0/52.bash-original.log (101.9KB). Use artifact://52:N-M to page, artifact://52:raw:N-M for verbatim chunks, and the artifact file path for search/copy workflows.]

[Showing lines 1-300 of 1590. Use :301 to continue]
```

Clippy gate tail (raw artifact `artifact://45`):

```text
    Checking reqwest v0.12.28
    Checking clap v4.6.6
    Checking pij-sidecars v0.1.0 (/Users/jordanknight/pi-hacking/fs3-report-assignment/crates/sidecars)
   Compiling sqlx-macros-core v0.8.6
   Compiling sqlx-macros v0.8.6
    Checking sqlx v0.8.6
    Checking pij-store v0.1.0 (/Users/jordanknight/pi-hacking/fs3-report-assignment/crates/store)
    Checking pij-daemon v0.1.0 (/Users/jordanknight/pi-hacking/fs3-report-assignment/crates/daemon)
    Checking pij-cli v0.1.0 (/Users/jordanknight/pi-hacking/fs3-report-assignment/crates/cli)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 21.41s
```

The first workspace run failed the fixture manifest after its behavioral suites passed. Updated hashes, bytes and answers, and indexed both new fixtures; the full workspace then passed. Golden regeneration used `UPDATE_GOLDENS=1 cargo test -p pij-core --test report assignment_state_round -- --nocapture` before the final unflagged workspace run.

## Live proof

Actual real-adapter daemon at 127.0.0.1:62148, private HOME/CLAUDE_CONFIG_DIR/XDG_CONFIG_HOME/state-dir, supervised tmux socket /tmp/pij-145-proof-yDPONJ/tmux.sock. Daemon and private tmux retired via hub stop. Production daemon never restarted or modified apart from required first-person status cards.

Exact binary SHA-256: `6d681c262f613e11cdd385d75d77375369acd4f9bc3239a6fa087b77a42d6b5e`.
Owned runtime directory: `/tmp/pij-145-proof-yDPONJ` (original captures retained).
Private tmux readiness: socket `/tmp/pij-145-proof-yDPONJ/tmux.sock`, server pid 30928; actual private panes `%0`, `%1`, `%2` supplied registration evidence. Initial paneless/no-process registration correctly refused; reran with those actual pane identities.

Selected actual outputs, unnormalized:


### ping

Caller: `None`; exit 0.

```json
{"ok":true,"command":"pij ping","v":2,"data":{"status":"healthy","build":"pij-rs 0.1.0","offline":false,"machine":"JordansacStudio.localdomain"}}
```


### task set pij-145-worker prove assignment reporting

Caller: `pij-145-parent`; exit 0.

```json
{"ok":true,"command":"pij task","v":2,"data":{"seq":7,"task":{"close_reason":null,"closed_at":null,"id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","node_id":"pij-145-worker","opened_at":1788999889223,"opened_by":"pij-145-parent","project":null,"task":"prove assignment reporting"}}}
```


### report state waiting --assignment assignment-4b910e8ee38db4888e1029b1f6acf4e2 --refs x,y

Caller: `pij-145-worker`; exit 0.

```json
{"ok":true,"command":"pij report","v":2,"data":{"seat":"pij-145-worker","seq":9,"state":"waiting","assignment_id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","refs":["x","y"],"line":"pij-145-worker is Waiting (spine 9)"}}
```


### node show pij-145-worker

Caller: `pij-145-worker`; exit 0.

```json
{"ok":true,"command":"pij node","v":2,"data":{"cursor":9,"node":{"assignments":[{"close_reason":null,"closed_at":null,"id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","node_id":"pij-145-worker","opened_at":1788999889223,"opened_by":"pij-145-parent","project":null,"task":"prove assignment reporting"}],"children":[],"dispatches":[],"id":"pij-145-worker","parent":"pij-145-parent","plan_id":null,"role":null,"state":{"assignment_id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","note":null,"refs":["x","y"],"registry_seq":8,"state":"waiting"}}}}
```


### report state waiting --assignment assignment-4b910e8ee38db4888e1029b1f6acf4e2

Caller: `pij-145-other`; exit 2.

```json
{"ok":false,"command":"pij report","v":2,"meta":"E-RS-ASSIGNMENT-NOT-YOURS assignment assignment-4b910e8ee38db4888e1029b1f6acf4e2 belongs to pij-145-worker, not pij-145-other","error":"refused","details":{"assignment_id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","caller":"pij-145-other","code":"E-RS-ASSIGNMENT-NOT-YOURS","owner":"pij-145-worker"}}
```


### report question which task? --assignment assignment-missing

Caller: `pij-145-worker`; exit 2.

```json
{"ok":false,"command":"pij report","v":2,"meta":"E-RS-ASSIGNMENT-UNKNOWN no task assignment assignment-missing","error":"refused","details":{"assignment_id":"assignment-missing","code":"E-RS-ASSIGNMENT-UNKNOWN"}}
```


### report blocked waiting for review --assignment assignment-4b910e8ee38db4888e1029b1f6acf4e2 --refs review

Caller: `pij-145-worker`; exit 0.

```json
{"ok":true,"command":"pij report","v":2,"data":{"seat":"pij-145-worker","seq":11,"state":"blocked","note":"waiting for review","assignment_id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","refs":["review"],"line":"pij-145-worker is Blocked: waiting for review (spine 11)"}}
```


### report question which branch? --assignment assignment-4b910e8ee38db4888e1029b1f6acf4e2 --refs branch

Caller: `pij-145-worker`; exit 0.

```json
{"ok":true,"command":"pij report","v":2,"data":{"assignment_id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","decision":{"answer":null,"answer_msg_id":null,"answered_at":null,"answered_by":null,"asked_at":1788999889279,"asked_by":"pij-145-worker","id":"decision-77629f236e5e6d64a4a24d47b6d6c831","parent":"pij-145-parent","question":"which branch?","question_seq":12,"state":"open"},"line":"question recorded: decision-77629f236e5e6d64a4a24d47b6d6c831","refs":["branch"],"seat":"pij-145-worker","seq":12}}
```


### report state done --assignment assignment-4b910e8ee38db4888e1029b1f6acf4e2

Caller: `pij-145-worker`; exit 0.

```json
{"ok":true,"command":"pij report","v":2,"data":{"seat":"pij-145-worker","seq":16,"state":"done","assignment_id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","refs":[],"line":"pij-145-worker is Done (spine 16)"}}
```


### report verify pij-145-worker --assignment assignment-4b910e8ee38db4888e1029b1f6acf4e2

Caller: `pij-145-parent`; exit 0.

```json
{"ok":true,"command":"pij report","v":2,"data":{"assignment_id":"assignment-4b910e8ee38db4888e1029b1f6acf4e2","done_seq":16,"line":"verified pij-145-worker done at spine 16","seat":"pij-145-worker","seq":17,"verified_by":"pij-145-parent"}}
```


## Golden / parity evidence

- `crates/testkit/fixtures/golden/api/report-state-record.json`: generated deterministic core-service record.
- `crates/testkit/fixtures/golden/api/report-assignment-client-parity.json`: actual native/shim pairs on one isolated real daemon: node and state readbacks, not-yours and unknown refusals. All stdout byte-equal. Existing exit policies intentionally differ: native 2, shim 4 on refusals.
- `governance-routes.json`, `governance-events.json`, and corpus manifest updated. Historical client captures were not rewritten to pretend they exercised this change.

## Harness handoff

Two observations remain in the worktree's harness buffer for the prime's drain: worktree dependency/LSP readiness friction and missing reusable isolated-runtime fixture command. Scoped harvest found no prior plan-145 retros.

Encoded now: assignment ownership/no-write regressions, old-history compatibility regression, populated-state golden, real client parity, and manifest indexing. These turn the reported false-refusal regression into executable backpressure.

Highest-value offered improvement: expose the existing Rust `governance_boot` isolation setup as an agent-facing `harness fixture` command returning private address/state-dir/pane evidence. It avoids reconstructing home/config/tmux/process identity on each live-proof run; not added outside this assignment's scope.

## Attribution

Fresh `pij-rs commit-trailers` output was used immediately before commit:

```text
Pij-Seat: pij-conservation-spoonbill
Pij-Prime: pij-minor-unicorn
Pij-Plan: 145-report-state-assignment
# Pij-Prime derivation: role=prime
```

Required first-person cards were published at work entry, proof completion, and committed delivery. No production task, role, assignment, or lifecycle state changed.

## Fix round

Review: `6598483f`, `review.md`, F1/F2 only.
Fix commit: `fe3895bb86c70ba644864749226095078c84ed27`.
One new fix commit on `145-report-state-assignment`; no amend of the review or original implementation commit, push, PR, merge, or production daemon mutation. This report remains the post-commit, untracked handoff artifact.

### F1 — assignment-scoped done selection

`SqliteOrchestration::verify_done_committed` now searches descending history for the latest done **naming the requested `assignment_id`**, rather than selecting the latest done overall and then rejecting a different assignment. Unscoped verify still selects the latest done overall. Current-parent authority and the existing task owner/open/closed-time checks remain in place; no actual done remains `E-RS-NO-DONE`, and an unmatched assignment when done history exists remains `E-RS-DONE-ASSIGNMENT`.

The anomaly projection already selects the latest done per `(seat, assignment_id)` and its remediation already names that assignment. Verification now applies that same scope. No second remediation implementation was introduced: the HTTP regression derives the detector's actual `remediation_line` from the HTTP-selected fact and submits those arguments to `/v1/report`.

Extended `assignment_done_is_verified_only_by_current_parent_for_matching_task` proves:

- Repeated A declarations select the latest A, not its first done.
- A followed by an unscoped done, and A followed by a B-scoped done, both remain verifiable through A's actual remediation.
- Successful verification removes A's unverified-done row without removing the unrelated done row.
- Unscoped verify still selects the later overall done; self-verification and genuinely wrong assignment refusals remain intact.

RED, before changing store selection:

```text
$ cargo test -p pij-daemon --test report_http assignment_done_is_verified_only_by_current_parent_for_matching_task -- --nocapture
assertion `left == right` failed:
{"command":"pij report","details":{"code":"E-RS-DONE-ASSIGNMENT","record":"assignment-0ee5cfc2d01327254a7dd881033852c1"},"error":"refused","meta":"E-RS-DONE-ASSIGNMENT transition refused for assignment-0ee5cfc2d01327254a7dd881033852c1","ok":false,"v":2}
  left: Bool(false)
 right: true
test result: FAILED. 0 passed; 1 failed; 0 ignored; 0 measured; 28 filtered out
```

Exit 101; raw receipt `artifact://68`. After the fix, the same command exits 0:

```text
test assignment_done_is_verified_only_by_current_parent_for_matching_task ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 28 filtered out
```

This is real HTTP plus a fresh SQLite store, with the existing fixture's isolated host adapters. No production daemon was used for the regression.

### F2 — unsupported flag guidance

Removed `--project` from `report now` and `--assignment` from `report clear` in `skills/pij/references/routes/node.md`. Corrected AC5 above, which previously claimed the unchanged node guidance was true. Node guidance and `docs/how/pij-rs-api.md` also now distinguish latest-within-assignment from latest-overall verification.

The repository has `just pij-skill-check`, not `just skill-check`; the present equivalent exits 0 (raw receipt `artifact://72`), including node-route budget `100/150`, CLI coverage, and routing checks.

### Fix-round gates and handoff

All commands ran in the worktree using `~/.cargo/bin/cargo`:

| Gate | Result |
|---|---|
| `harness boot` | Exit 0; dependency check, typecheck and smoke pass. Conversation ingest separately reported unavailable identity; no ingestion claimed. |
| `cargo test --workspace` | Exit 0; 1064 passed, 85 suites, 8 ignored, 93 filtered. |
| `cargo clippy --workspace --all-targets -- -D warnings` | Exit 0. |
| `cargo fmt --all -- --check` | Exit 0, no output. |
| `just pij-skill-check` | Exit 0. |
| `harness checks` | Exit 0 at `2026-09-10T00:45:44.687Z`; `status:ok`, `data.ok:true`, all 10 sensors ran, none skipped. |

Combined Rust gate raw receipt: `artifact://79`; closing clippy line:

```text
Finished `dev` profile [unoptimized + debuginfo] target(s) in 5.32s
```

The final commit used freshly derived `pij-rs commit-trailers` values: `Pij-Seat: pij-conservation-spoonbill`, `Pij-Prime: pij-minor-unicorn`, `Pij-Plan: 145-report-state-assignment`.

Harness improvement encoded: the existing HTTP regression now executes anomaly advice across competing done records, so the previously missed cross-reader selection mismatch fails deterministically. Captured this lesson as `DL-002`; observations remain available for the prime's drain. Scoped retro harvest still reports zero records. No TS/JS edits or throwaway scripts were introduced. F3–F5 remain outside this requested fix round.
