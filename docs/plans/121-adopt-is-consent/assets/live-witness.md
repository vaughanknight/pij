# s121 live witness — adopt is consent

Run 2026-09-02 against one pinned release binary and one isolated real daemon.

## Build and rig

- Source head before the s121 working-tree diff: `284a739489091bd7bcb824b0c454c7fdb7e13f40`
- Binary: `target/release/pij-rs`
- Binary SHA-256: `831664f3b65b8dc4d2533d4d22b9fe5632b70641ebd4221d31da48fefa9a99c9`
- Toolchain gate: rustc `1.98.0`; `pij-gate: all stages green`
- Daemon: PID `92631`, `127.0.0.1:17621`, state `/tmp/pij121-tmux.HaDZlJ`
- Isolated real tmux server: socket `/private/tmp/tmux-501/pij121`
- Sender: `pij-reasonable-excuse`, pane `%0`
- Both recipient clients: hand-started Claude Code `2.1.257` in real tmux panes; neither was spawned by pij

## AC-1 — accepting hand-started Claude receives a real user turn

Recipient:

- Pane `%1`, PID `98537`, session `a6b4e700-4f57-45e3-b998-3960af01fc1d`
- Started with `claude --settings '{"crossSessionInbound":"accept"}'`
- Adopted as `pij-honest-mistake`
- Adopt response carried `cross_session_inbound_accept: true`

Send response:

```json
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"s121-accept-1","outcome":{"outcome":"delivered","origin":"injected-to-transport"},"at":1788297871051}}
```

Pane transcript:

```text
⏺ The peer's sentinel arrived intact — all three lines, pij fences preserved,
  delivered as a real injected turn.

  Receipt, for the record:
  - S121-ACCEPT-REAL-TURN header ✓
  - line two: adopted Claude receives the full body ✓
  - line three: sentinel end ✓
  - No truncation; wrapped as <cross-session-message>.
```

Recipient transcript:

`~/.claude/projects/-Users-jordanknight-pi-hacking-pij/a6b4e700-4f57-45e3-b998-3960af01fc1d.jsonl`

```text
2026-09-01T21:24:31.075Z type=queue-operation operation=enqueue
content includes:
  S121-ACCEPT-REAL-TURN
  line two: adopted Claude receives the full body
  line three: sentinel end

next matching record: type=user, message.role=user, with the same three-line body
```

Programmatic discriminator over that JSONL:

```text
queue_operation_with_sentinel = 1
user_with_sentinel = 1
```

## AC-2 — same-build non-accepting control is held, system-only

Recipient:

- Pane `%2`, PID `7933`, session `8d66d2c7-4c10-4908-b827-d407a6415274`
- Started with `claude --settings '{"crossSessionInbound":"hold"}'`
- Adopted as `pij-corresponding-kiwi`
- The same daemon registration stamped `cross_session_inbound_accept: true`; pij therefore sent the frame rather than falling back to a pointer

Send response:

```json
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"s121-held-1","outcome":{"outcome":"held","reason":"recipient approval pending"},"at":1788297908379}}
```

Pane transcript:

```text
⏺ Held peer message — from uds:/tmp/cc-socks/pij-uds-92631-1.sock
  [verified pid 92631] (peer claims name: pij-reasonable-excuse);
  preview: «pij-rs from pij-reasonable-excuse» …[5 lines, 138 chars
  total — expand to review before approving] — not delivered to Claude
  (1 held). Your "crossSessionInbound" setting is "hold"; set it to
  "accept" to deliver held messages.
```

Recipient transcript:

`~/.claude/projects/-Users-jordanknight-pi-hacking-pij/8d66d2c7-4c10-4908-b827-d407a6415274.jsonl`

```text
2026-09-01T21:25:08.409Z type=system subtype=informational
Held peer message … not delivered to Claude (1 held).
```

Programmatic discriminator over the complete JSONL:

```text
system_held = 1
user_records_total = 0
```

Both arms used binary SHA-256 `831664f3b65b8dc4d2533d4d22b9fe5632b70641ebd4221d31da48fefa9a99c9` and daemon PID `92631`. The control is a positive system artifact, not an inference from silence.
