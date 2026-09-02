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

## Unbound seat whose pane disappeared

Command: `cargo test -p pij-daemon a_missing_pane_terminalizes_its_queued_delivery_with_named_reason -- --nocapture`

RED on rebased pre-fix tree:

```text
thread 'pointer::worker::tests::a_missing_pane_terminalizes_its_queued_delivery_with_named_reason' panicked at crates/daemon/src/pointer/worker.rs:1769:9:
a missing pane is not retried
test result: FAILED. 0 passed; 1 failed; 160 filtered out
```

GREEN after the bounded policy change:

```text
cargo test: 1 passed (11 suites, 230 filtered, 0.00s)
```

The queue now records one terminal `Outcome::Failed` whose reason names both
`pij-vanished` and `%1861`; the row leaves the live queue and is not retried.
