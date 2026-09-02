# Live Claude no-settings proof

**Date**: 2026-09-02
**Branch**: `126-claude-inbound-accept-global`
**Isolated daemon**: `127.0.0.1:17662`, state `/tmp/pij126-state.ChWX61`

## Setup

The production daemon was not restarted. The branch binary ran as an isolated real-adapter daemon:

```text
target/debug/pij-rs --state-dir /tmp/pij126-state.ChWX61 daemon --bind 127.0.0.1:17662
```

Before boot, `crossSessionInbound` was removed from `~/.claude/settings.json` after copying the exact original to `/tmp/pij126-settings.original`. Isolated startup restored the key and logged:

```text
pij-rs claude inbound: /Users/jordanknight/.claude=touched, /Users/jordanknight/.claude-alt=skipped
pij-rs daemon: listening on 127.0.0.1:17662 · key /tmp/pij126-state.ChWX61/daemon.key (0600) · offline=false
```

The target client was hand-started in tmux with no `--settings` flag:

```text
env PIJ_RS_ADDR=127.0.0.1:17662 PIJ_RS_STATE_DIR=/tmp/pij126-state.ChWX61 claude --dangerously-skip-permissions
```

It ran `/pij ready` and registered as `pij-anxious-porcupine` on pane `%2538`.

## Delivery receipt

A second isolated Claude seat, `pij-constitutional-harrier`, sent `plan126-live-1`:

```json
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"plan126-live-1","outcome":{"outcome":"delivered","origin":"injected-to-transport"},"at":1788303099074}}
```

The target pane rendered the peer turn and replied:

```text
› Message from @pij-constitutional-h…: [pij-rs from pij-constitutional-harrier] (ctrl+o to expand)

  Replying to the peer's probe
  $ pij send pij-constitutional-harrier "RECEIVED-126"
```

The target's native Claude transcript `~/.claude/projects/-Users-jordanknight-pi-hacking-fs3-claude-inbound-accept-global/069f6964-9990-4ed9-b696-6260fab29307.jsonl` records the transport content as a real user turn:

```json
{"type":"user","message":{"role":"user","content":"Another Claude session sent a message:\n<cross-session-message from=\"uds:/tmp/cc-socks/pij-uds-75815-0.sock\" from-name=\"pij-constitutional-harrier\">\n[pij-rs from pij-constitutional-harrier]\nPLAN126 LIVE: reply with exactly RECEIVED-126\n[/pij]\n</cross-session-message>..."}}
```

## Spine evidence

The isolated SQLite spine contained:

| seq | kind | seat | evidence |
|---:|---|---|---|
| 1 | `config.claude-inbound-ensured` | global | `home=/Users/jordanknight/.claude`, `before=null`, `after=accept` |
| 5 | `message.pushed` | `pij-anxious-porcupine` | `msg_id=plan126-live-1`, sender `pij-constitutional-harrier` |
| 6 | `delivery.outcome` | `pij-anxious-porcupine` | `msg_id=plan126-live-1`, `delivered`, `injected-to-transport` |

No pointer outcome appeared for `plan126-live-1`.

## Doctor

```json
{"ok":true,"command":"pij doctor claude-inbound","v":1,"data":[{"home":"/Users/jordanknight/.claude","current":"accept","required":"accept","status":"accept","error":null},{"home":"/Users/jordanknight/.claude-alt","current":"accept","required":"accept","status":"accept","error":null}]}
```

## Restoration

After the proof, `/tmp/pij126-settings.original` was copied back to `~/.claude/settings.json`; `cmp` returned success, proving exact restoration. Both test Claude windows and the isolated daemon were then stopped.
