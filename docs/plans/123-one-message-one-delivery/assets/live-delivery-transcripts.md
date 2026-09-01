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

## AC-5 — composed with s122: zero additional tmux typings

**Composition**: s123 detached head `6e0fd786` merged without commit with pinned s122 `c5c7fd2c`
**Daemon**: composed worktree binary at `127.0.0.1:7564`
**Client**: OMP 18.0.3 with the composed worktree extension loaded explicitly
**Seat**: `pij-like-gibbon` · pane `%2234`
**Message id**: `ac5-s123-s122`

An unsent `draft-holding` composer value forced s122's first-attempt tmux rung to queue instead of type. Send receipt:

```text
pij send: ok — {"msg_id":"ac5-s123-s122","outcome":{"outcome":"queued"},"at":1788254936237}
```

The event consumer then claimed the row, injected once, and acknowledged it. Pane transcript:

```text
❯ draft-holding

[pij from pij-obedient-marmot] AC5-S123-S122 zero-additional-typing witness

Understood. I’ll stay idle and not make any edits or commands.
```

The composer draft disappeared when the injected turn landed. No second copy was typed by s122's enabled tmux body rung. Queue receipt:

```text
id: 1
kind: delivery:pij-like-gibbon
serial_key: pij-like-gibbon
dedupe_key: ac5-s123-s122
state: done
worker: pij-like-gibbon
outcome: NULL
enqueued_at: 1788254936
claimed_at: 1788254936
acked_at: 1788254936
attempt: 0
not_before: 0
```

The composed suites were also green: focused Vitest 12/12 and `cargo test -p pij-daemon` 211/211. The terminal row means s122's drain worker had no body left to type: extension consumption produced exactly one rendering and zero additional tmux typings.

## AC-4 — pinned runtime skew pairs

### New extension `cd0223ef` against old daemon `a93f8f23`

The OMP client loaded the clean `cd0223ef` extension while the isolated daemon binary was built and run from `a93f8f23` at `127.0.0.1:7565`. Seat `pij-functional-salmon`, pane `%2248`, rendered one body:

```text
[pij from pij-obedient-marmot] AC4-PINNED-NEWEXT-OLDDAEMON exactly-once witness
```

Queue and spine receipts:

```text
id: 2
dedupe_key: ac4-pinned-newext-olddaemon
state: done
worker: pij-functional-salmon
claimed_at: 1788255671
acked_at: 1788255671
attempt: 0

spine: one message.pushed · one delivery.outcome · one delivery.inbox-ack
```

Result: one rendering, one acknowledgement, no retained row. The new extension interoperates with the pinned old daemon because event, claim, and ack routes were already present.

### Old extension `a93f8f23` against new daemon `cd0223ef`

The OMP client loaded the clean `a93f8f23` extension while the isolated daemon binary was built and run from `cd0223ef` at `127.0.0.1:7567`. Seat `pij-subtle-gamefowl`, pane `%2249`, first rendered the pushed body:

```text
[pij from pij-obedient-marmot] AC4-PINNED-OLDEXT-NEWDAEMON loud-skew witness
```

At that point queue job 1 remained `pending`, with `claimed_at: NULL` and `acked_at: NULL`: the body was retained, not silently lost or falsely acknowledged. The operator then ran the daemon inbox recovery in the same real pane and visibly received the same body again:

```text
pij inbox: ok — [{"from":"pij-obedient-marmot","to":"pij-subtle-gamefowl","body":"AC4-PINNED-OLDEXT-NEWDAEMON loud-skew witness","msg_id":"ac4-pinned-oldext-newdaemon"}]
```

Final receipts:

```text
id: 1
dedupe_key: ac4-pinned-oldext-newdaemon
state: done
worker: pij-subtle-gamefowl
claimed_at: 1788255768
acked_at: 1788255768
attempt: 4

spine: one message.pushed · one delivery.outcome · one delivery.inbox-ack
```

Result: this unsupported direction fails loudly as a visible duplicate body, retains the queue body until explicit recovery, and records exactly one acknowledgement. It neither loses the body nor double-acks.
