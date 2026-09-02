# RED witness — plan 132

## Child exits before bind

Command: `cargo test -p pij-daemon spawn_wait_reports_child_exit_with_log_tail -- --nocapture`

```text
thread 'http::tests::spawn_wait_reports_child_exit_with_log_tail' panicked at crates/daemon/src/http/tests.rs:551:5:
assertion `left == right` failed
  left: 200
 right: 502
test result: FAILED. 0 passed; 1 failed; 148 filtered out
```

The pre-fix route returns HTTP 200 immediately after dispatch instead of waiting for bind or reporting the child's failure.

## Spawn parent erased at bind

Command: `cargo test -p pij-daemon spawned_registration_adopts_prebind_row_and_preserves_port -- --nocapture`

```text
assertion `left == right` failed: the first bind cannot erase the parent persisted by spawn
  left: None
 right: Some("pij-parent")
test result: FAILED. 0 passed; 1 failed; 148 filtered out
```

The pre-bind row stores the parent, then registration overwrites it with an absent claim.

## Dead recipients retained pending rows

Commands:

```text
cargo test -p pij-daemon a_missing_pane_terminalizes_its_queued_delivery_with_named_reason -- --nocapture
cargo test -p pij-daemon a_tombstoned_recipient_terminalizes_its_pending_delivery -- --nocapture
```

RED on the pre-fix tree:

```text
a_missing_pane_terminalizes_its_queued_delivery_with_named_reason panicked:
a missing pane is not retried
test result: FAILED. 0 passed; 1 failed; 161 filtered out

a_tombstoned_recipient_terminalizes_its_pending_delivery panicked:
assertion failed: left 0, right 1
test result: FAILED. 0 passed; 1 failed; 161 filtered out
```

The first witness uses a bound descriptor (`proc: Some`) whose pane is absent;
the second uses a tombstoned paneless descriptor. Before the fix the missing
pane backed off again and the tombstoned recipient was excluded from claims.

GREEN after the full policy change:

```text
cargo test -p pij-daemon pointer::worker::tests -- --nocapture
cargo test: 26 passed (11 suites, 206 filtered, 0.00s)
```

Each dead-recipient row now records one terminal `Outcome::Failed` naming the
seat and dead fact, leaves the live queue, and is never retried. Listed panes,
human-typing vetoes, and systemic tmux errors retain their prior retry paths.

## Unknown actual model is not a mismatch

RED tests added from Opus finding R001:

```text
session_record_and_exact_pane_bind_before_a_transcript_exists:
left None, right Some("claude-opus-5")

absent_actual_model_is_unknown_while_explicit_no_model_is_a_mismatch:
assertion failed: requested_model_matches(Some("claude-opus-5"), None, false)
```

GREEN after adding the explicit `actual_model_observed` wire fact:

```text
cargo test: 1 passed (session_record_and_exact_pane_bind_before_a_transcript_exists)
cargo test: 1 passed (absent_actual_model_is_unknown_while_explicit_no_model_is_a_mismatch)
```

Claude/CLI binders now preserve the requested model and publish `spawn.bound`
when actual model evidence is unavailable. Pi/OMP explicitly reports whether it
observed a model, so an observed absence remains a real mismatch.

## Global tmux inventory failure does not halt delivery

RED from Opus R2 blocker N1:

```text
pane_inventory_failure_is_deferred_while_recipient_work_continues panicked:
inventory failure cannot halt the pass
left: 0
right: 2
```

GREEN after preserving unknown inventory as a separate state:

```text
cargo test -p pij-daemon pane_inventory_failure_is_deferred_while_recipient_work_continues
cargo test: 1 passed
cargo test -p pij-daemon pointer::worker::tests
cargo test: 27 passed
```

The fake fails only the first all-server pane inventory. The pass then delivers
both live recipients' messages and still returns the scripted systemic error.
Pane absence is terminal only when a successful inventory proves it.
