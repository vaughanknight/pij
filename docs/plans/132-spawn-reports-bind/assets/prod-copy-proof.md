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
{"dead":72,"max_attempt":15933,"pane_absent":72,"pending":73,"tombstoned":0}
```

## One cadence

Built `target/debug/pij-rs` from this branch, then started one isolated dev
daemon against the writable copy on `127.0.0.1:57806`. Its first delivery drain
ran immediately after readiness. A second read-only join returned:

```json
{"dead_pending":0,"max_dead_attempt":0,"named_terminal_failures":77,"pending":1,"sample_reasons":[["delivery recipient pij-impressive-gopher pane %2164 is absent from tmux list-panes -a; not retried",21],["delivery recipient pij-chosen-arach pane %2811 is absent from tmux list-panes -a; not retried",12],["delivery recipient pij-elaborate-koala pane %3147 is absent from tmux list-panes -a; not retried",10]]}
```

All 72 baseline dead-recipient rows left pending state within the first cadence;
one live-recipient row remained pending. Failed outcomes name the recipient,
pane, authoritative tmux absence, and the no-retry decision. The isolated daemon
was then stopped.
