# Live delivery transcripts

## AC-1 — extension consumer: one rendering, terminal acknowledgement

**Daemon**: current worktree `target/debug/pij-rs`, isolated at `127.0.0.1:7562`
**State**: `/tmp/pij-s123-final.b6aobk`
**Client**: OMP 18.0.3, worktree pij extension loaded explicitly with `--no-extensions -e …/.pi/extensions/pij`
**Seat**: `pij-fate-amenable-to-change` · pane `%2189`
**Message id**: `ac1-s123-final`

Send receipt:

```text
pij send: ok — {"msg_id":"ac1-s123-final","outcome":{"outcome":"queued"},"at":1788253685645}
```

Pane transcript after delivery:

```text
AC-1 final witness: remain idle; no edits or commands.

Understood. I will not edit or run commands and will remain idle.

[pij from pij-obedient-marmot] AC1-S123-FINAL exactly-once witness

I’m here and ready. I’ll follow the AC1 witness role and stay idle without making edits or commands.
```

No `[pij-rs …] message waiting` turn appeared. Read-only queue receipt from the same isolated daemon:

```text
id: 1
kind: delivery:pij-fate-amenable-to-change
serial_key: pij-fate-amenable-to-change
dedupe_key: ac1-s123-final
state: done
worker: pij-fate-amenable-to-change
outcome: NULL
enqueued_at: 1788253685
claimed_at: 1788253685
acked_at: 1788253685
attempt: 0
not_before: 0
```

The positive artifacts agree: the real client rendered the body once; that client claimed the queue row before injection and acknowledged it after injection; the daemon has no live row left to announce or retype.

## AC-3 — no extension consumer: daemon inbox still delivers

**Daemon/state**: same isolated worktree daemon
**Client**: OMP 18.0.3 launched with `--no-extensions`
**Seat**: `pij-ashamed-bobolink` · pane `%2191`
**Message id**: `ac3-s123-final`

Send receipt:

```text
pij send: ok — {"msg_id":"ac3-s123-final","outcome":{"outcome":"queued"},"at":1788253971007}
```

The real client then ran the daemon inbox path in its pane. Exact body-bearing output:

```text
$ target/debug/pij-rs --state-dir /tmp/pij-s123-final.b6aobk --addr 127.0.0.1:7562 inbox --seat pij-ashamed-bobolink
pij inbox: ok — [{"from":"pij-obedient-marmot","to":"pij-ashamed-bobolink","body":"AC3-S123-FINAL no-extension fallback body","msg_id":"ac3-s123-final"}]
```

Read-only terminal queue receipt:

```text
id: 2
kind: delivery:pij-ashamed-bobolink
serial_key: pij-ashamed-bobolink
dedupe_key: ac3-s123-final
state: done
worker: pij-ashamed-bobolink
outcome: NULL
enqueued_at: 1788253971
claimed_at: 1788254011
acked_at: 1788254011
attempt: 8
not_before: 1788254007
```

With the extension absent, no event consumer claimed or injected the message. The daemon-owned inbox path returned the full body in the real OMP pane and atomically finished the queue row; no silent drop.

## AC-5 — composed s122 check not yet runnable

Prime receipt: s122 branch `s122/tmux-full-body` compiles but remains mid-edit and uncommitted with four dirty files; its `interaction.rs` verdict seam is still in flight. The prime withheld a moving ref and will provide a pinned SHA once that seam is committed green. Therefore the composed zero-additional-tmux-typing check cannot yet be run; no s122 bytes were copied or inferred here.
