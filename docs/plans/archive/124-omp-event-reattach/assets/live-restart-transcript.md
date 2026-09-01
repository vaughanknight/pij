# Plan 124 — isolated live restart transcript

## Safety and isolation

Prime denied a production daemon restart because it would drop streams for three PMs and a reviewer. This is a one-directional safety brake: removing it would permit a more destructive operation; it does not decide product behavior. Prime authorized the same proof against an isolated daemon.

- Worktree-built binary: `target/debug/pij-rs` (`cargo build -p pij-cli`).
- Daemon: `pij-rs daemon --bind 127.0.0.1:60524 --state-dir /tmp/pij-p124-reattach.gSPRYY`.
- Target OMP: hand-started in tmux pane `%2392`, explicit `--no-extensions -e <worktree>/.pi/extensions/pij/index.ts`, registered `pij-mistake-not`.
- Sender OMP: hand-started in tmux pane `%2393` with the same extension and daemon controls, registered `pij-ok-trout`.
- Both seats exported `PIJ_DAEMON_GENERATION=rs`, `PIJ_RS_ADDR=127.0.0.1:60524`, and `PIJ_RS_STATE_DIR=/tmp/pij-p124-reattach.gSPRYY`.
- Production daemon, key, SQLite store, and port `7461` were untouched.

## Per-boot key rotation

```text
before restart  e69dcd97562fb19d1b18769949e80529ac6b49d2a5e52ed58bd5a3ff4e82ab6b
post restart    fac421fc4b09ec83096ee0369ed23ad7c352c999a5507b441a39c9b4ad8dfb0d
```

The same two OMP processes remained open across the restart.

## Visible reconnect lifecycle

Captured from both live OMP panes while the isolated daemon was stopped, then started again:

```text
pij: daemon stream lost, reconnecting…
pij: re-attached at cursor 8
```

The first restart, before any isolated messages existed, reported `pij: re-attached at cursor 0`; after the message/ack exchange, the second restart reported cursor `8` in both panes.

## Post-restart full-body delivery

The sender OMP was typed this instruction after the daemon restarted:

```text
Use the pij_send tool to send exactly P124_AFTER_RESTART_INLINE to pij-mistake-not. Then answer done.
```

Sender pane tool receipt:

```text
• pij send
  └─ to="pij-mistake-not", message="P124_AFTER_RESTART_INLINE"
queued 89610910-f477-46e3-abb9-a4a555292def -> pij-mistake-not
```

Target pane, inline—not a pointer:

```text
[pij from pij-ok-trout] P124_AFTER_RESTART_INLINE
```

The still-open target then used its own post-restart `pij_send` tool to acknowledge:

```text
• pij send
  └─ to="pij-ok-trout", message="P124_AFTER_RESTART_INLINE received inline by pij-mistake-not. Canary ack — delivery path intact after restart."
queued df218e0c-f62d-4fd8-bc50-79ced7ecbdca -> pij-ok-trout
```

This proves the same target OMP's bearer-authenticated client calls worked after the per-boot key changed.

## Isolated authority rows

```text
1|seat.put|pij-ok-trout|
2|seat.put|pij-mistake-not|
3|message.pushed|pij-mistake-not|{"msg_id":"89610910-f477-46e3-abb9-a4a555292def","from":"pij-ok-trout","body":"P124_AFTER_RESTART_INLINE"}
4|delivery.outcome|pij-mistake-not|{"msg_id":"89610910-f477-46e3-abb9-a4a555292def","outcome":{"outcome":"queued"},"transport":"claude-uds"}
5|delivery.inbox-ack|pij-mistake-not|{"job_id":1,"authenticated_machine":"local","evidence_grade":"machine","outcome":"reader-read"}
6|message.pushed|pij-ok-trout|{"msg_id":"df218e0c-f62d-4fd8-bc50-79ced7ecbdca","from":"pij-mistake-not","body":"P124_AFTER_RESTART_INLINE received inline by pij-mistake-not. Canary ack — delivery path intact after restart.","in_reply_to":"89610910-f477-46e3-abb9-a4a555292def"}
7|delivery.outcome|pij-ok-trout|{"msg_id":"df218e0c-f62d-4fd8-bc50-79ced7ecbdca","outcome":{"outcome":"queued"},"transport":"claude-uds"}
8|delivery.inbox-ack|pij-ok-trout|{"job_id":2,"authenticated_machine":"local","evidence_grade":"machine","outcome":"reader-read"}
```

There is no `delivery.pointer-announced` row for either `msg_id`.

Seat continuity after both restarts:

```text
pij-ok-trout    harness=omp pane=%2393 pid=55512 seq=1
pij-mistake-not harness=omp pane=%2392 pid=55396 seq=2
```

No replacement ids were minted.

## Verdict

- AC1: PASS — hand-started OMP stayed open across daemon/key restarts, received the full body inline, and produced `message.pushed → delivery.inbox-ack` with no pointer row.
- AC2: PASS — the same target OMP's `pij_send` tool succeeded after restart and key rotation.
