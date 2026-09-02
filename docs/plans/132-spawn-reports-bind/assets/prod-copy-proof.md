# Production-copy dead-recipient drain proof

Source database (read-only):

`/private/tmp/claude-501/-Users-jordanknight-pi-hacking-pij/7b95239d-d05a-44e7-ad9d-ecc36e15c1ca/scratchpad/prod-copy.sqlite`

Writable proof copy: `/tmp/pij-plan132-prod-proof-1752/pij.sqlite`.
The production daemon and source database were not modified. The legacy daemon
was already off by Jordan's ruling.

## Baseline

Dead means the recipient row is tombstoned, or it carries a pane absent from
`tmux list-panes -a`. A Python read-only join over `jobs` and `seats`, using the
fresh tmux pane set, returned:

```json
{"dead_pending":72,"max_attempt":15933,"pane_absent":72,"pending":73,"running":2,"prior_named_failures":3,"tombstoned":0}
```

## One cadence

Built `target/debug/pij-rs` from this branch, then started one isolated dev
daemon against the writable copy on `127.0.0.1:57806`. Its first delivery drain
ran immediately after readiness. A second read-only join returned:

```json
{"dead_pending":0,"max_dead_attempt":0,"named_terminal_failures":77,"pending":1,"sample_reasons":[["delivery recipient pij-impressive-gopher pane %2164 is absent from tmux list-panes -a; not retried",21],["delivery recipient pij-chosen-arach pane %2811 is absent from tmux list-panes -a; not retried",12],["delivery recipient pij-elaborate-koala pane %3147 is absent from tmux list-panes -a; not retried",10]]}
```

All 72 baseline dead-recipient pending rows left pending state within the first
cadence; one live-recipient row remained pending. The terminal-failure total
rose from 3 to 77: the 72 dead pending rows plus 2 stale-running dead rows.
Failed outcomes name the recipient, pane, authoritative tmux absence, and the
no-retry decision. The isolated daemon was then stopped.

## Evidence split

| State | Required outcome | Receipt |
| --- | --- | --- |
| successful inventory, pane absent, socket unreachable | terminal named failure | production copy `72 → 0`; multi-row unit witness |
| tombstoned recipient, inventory available or unknown | terminal named failure | `a_tombstoned_recipient_terminalizes_its_pending_delivery` |
| successful inventory, pane absent, socket reachable | socket delivery | `missing_pane_with_reachable_socket_delivers_instead_of_terminalizing` |
| successful inventory, pane absent, socket probe errors | retry and visible error | `unknown_socket_reachability_retries_and_surfaces_the_error` |
| inventory errors | no pane-absence inference; recipient work continues; error visible | `pane_inventory_failure_is_deferred_while_recipient_work_continues` |
| paneless, non-tombstoned | pull-owned; drain does not claim | `paneless_pull_consumer_keeps_ownership_of_its_queue_row` |

Production contained no tombstoned pending rows, so production proves the
pane-absent/unreachable case; the tombstone and unknown states are unit-proven.
