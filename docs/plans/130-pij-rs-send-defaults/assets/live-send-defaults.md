# Live send-defaults proof — plan 130

**Date**: 2026-09-02
**Isolation**: source-built `target/debug/pij-rs`; state `/tmp/pij-130-live.RsLb5E`; bind `127.0.0.1:18461`. The production daemon was not stopped, restarted, or modified.

Clients were hand-started with `tmux new-window`, not `pij spawn`:

- OMP v18.0.3 / GPT-5.6 Sol: pane `%2992`, seat `pij-adorable-fly`.
- Claude Code v2.1.258 / Opus 5: pane `%2993`, seat `pij-monthly-cephalopod`.

Neither pane exported `PIJ_SESSION_ID`. Both scripts invoked this worktree's absolute `target/debug/pij-rs` with the isolated address and state directory.

## Isolated daemon

```console
$ target/debug/pij-rs --state-dir /tmp/pij-130-live.RsLb5E --addr 127.0.0.1:18461 --json ping
{"ok":true,"command":"pij ping","v":1,"data":{"build":"pij-rs 0.1.0","machine":"JordansacStudio.localdomain","offline":false,"status":"healthy"}}
```

## Pane-derived identity

OMP:

```json
{"ok":true,"command":"pij adopt","v":1,"data":{"id":"pij-adorable-fly","harness":"omp","pane":"%2992","proc":{"pid":98213,"proc_start":20260902130722},"folder":"/Users/jordanknight/pi-hacking/fs3-pij-rs-send-defaults","state":"idle","semantic_state":null,"role":null,"parent":null,"relay":false},"meta":"export PIJ_SESSION_ID=pij-adorable-fly — this shell still carries whatever id it had before, and an id that contradicts the pane is refused, not preferred"}
```

Claude; the non-shell-harness note names pane resolution and contains no export instruction:

```json
{"ok":true,"command":"pij adopt","v":1,"data":{"id":"pij-monthly-cephalopod","harness":"claude","pane":"%2993","proc":{"pid":99661,"proc_start":20260902130729},"folder":"/Users/jordanknight/pi-hacking/fs3-pij-rs-send-defaults","state":"idle","semantic_state":null,"role":null,"parent":null,"relay":false,"cross_session_inbound_accept":true},"meta":"adopted pij-monthly-cephalopod; identity resolves from pane %2993 on each command — no PIJ_SESSION_ID export is required for this harness"}
```

## AC1 — no `--from`, no `--msg-id`

OMP:

```console
$ pij-rs send --to pij-monthly-cephalopod --body hello-from-omp
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"01a06016-9510-71e2-b966-520483deec55","outcome":{"outcome":"delivered","origin":"injected-to-transport"},"at":1788318487824},"meta":"from pij-adorable-fly; msg_id 01a06016-9510-71e2-b966-520483deec55"}
```

Claude:

```console
$ pij-rs send --to pij-adorable-fly --body hello-from-claude
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"01a06016-938c-76c0-9249-08e9c3020b29","outcome":{"outcome":"queued"},"at":1788318487436},"meta":"from pij-monthly-cephalopod; msg_id 01a06016-938c-76c0-9249-08e9c3020b29"}
```

Both ids parse as UUIDv7. Each receipt names the pane-derived sender. OMP printed `LIVE_DONE_OMP`; Claude printed `LIVE_DONE_CLAUDE` after receiving the OMP turns inline.

## AC2 — stdin and 5 KiB file are literal

OMP stdin command:

```console
$ printf '%s' '--not-a-flag body with $(danger) and `backticks`' | pij-rs send --to pij-monthly-cephalopod --body-file -
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"01a06016-9609-7861-b3ee-5fc094d5b195","outcome":{"outcome":"delivered","origin":"injected-to-transport"},"at":1788318488074},"meta":"from pij-adorable-fly; msg_id 01a06016-9609-7861-b3ee-5fc094d5b195"}
```

Claude's real pane rendered the body as data: `--not-a-flag body with $(danger) and \`backticks\``. No substitution occurred.

Claude file command:

```console
$ pij-rs send --to pij-adorable-fly --body-file /tmp/pij130-5k.txt
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"01a06016-96d1-7e03-8e60-2d85a32a6b3b","outcome":{"outcome":"queued"},"at":1788318488274},"meta":"from pij-monthly-cephalopod; msg_id 01a06016-96d1-7e03-8e60-2d85a32a6b3b"}
```

The OMP inbox returned bodies of 17 and 5120 bytes. The 5120-byte body equals `/tmp/pij130-5k.txt` byte-for-byte.

## AC4 — pane-derived inbox and routed pointer

OMP read its two queued Claude messages with bare `pij-rs inbox` while `PIJ_SESSION_ID` remained unset. Its pane displayed the new pointer action:

```text
[pij-rs from pij-monthly-cephalopod]message waiting — run: pij inbox check[/pij]
```

## AC6 — cross-seat destructive refusal; peek preserves mail

While Claude was `Hold`, OMP queued `peek-survives`, then attempted a cross-seat destructive read:

```json
{"ok":false,"command":"pij inbox","v":1,"meta":"pij inbox: the acting seat is `pij-adorable-fly` but --seat names `pij-monthly-cephalopod`; destructive inbox reads cannot claim or acknowledge another seat's mail. Use --peek for a non-destructive cross-seat read","error":"adapter"}
```

OMP's `--peek` observed the queued body:

```json
{"ok":true,"command":"pij inbox","v":1,"data":[{"from":"pij-adorable-fly","to":"pij-monthly-cephalopod","body":"peek-survives","msg_id":"01a0602d-137d-7331-8dc3-19da3ceae108"}]}
```

Claude then performed its own destructive read and received the same message id and body, proving the refusal and peek had not claimed or acknowledged it:

```json
{"ok":true,"command":"pij inbox","v":1,"data":[{"from":"pij-adorable-fly","to":"pij-monthly-cephalopod","body":"peek-survives","msg_id":"01a0602d-137d-7331-8dc3-19da3ceae108"}]}
```

Final pane lines:

```text
OMP:    LIVE_PEEK_DONE_OMP
Claude: LIVE_PEEK_DONE_CLAUDE

## Post-review rerun after rebase and identity hardening

**Isolation**: source-built `target/debug/pij-rs`; state `/tmp/pij-130-relaunch`; bind `127.0.0.1:18462`. The production daemon was not stopped, restarted, or contacted. The isolated daemon was stopped after proof.

Clients were hand-started with `tmux new-window` in panes `%3155` and `%3156`. OMP ran `github-copilot/gpt-5.6-sol`; Claude ran `claude-opus-5`. Their project extensions/hooks were disabled for the proof so only the source-built binary performed registration and transport. Neither pane exported `PIJ_SESSION_ID`.

OMP adopted as `pij-sleeper-service`:

```json
{"ok":true,"command":"pij adopt","v":2,"data":{"id":"pij-sleeper-service","harness":"omp","pane":"%3155"},"meta":"adopted pij-sleeper-service; identity resolves from pane %3155 on each command — no PIJ_SESSION_ID export is required for this harness"}
```

Claude adopted as `pij-elegant-aardwolf`:

```json
{"ok":true,"command":"pij adopt","v":2,"data":{"id":"pij-elegant-aardwolf","harness":"claude","pane":"%3156"},"meta":"adopted pij-elegant-aardwolf; identity resolves from pane %3156 on each command — no PIJ_SESSION_ID export is required for this harness"}
```

Both sent with no `--from` and no `--msg-id`; receipts named the derived sender and minted UUIDv7 ids:

```json
{"ok":true,"command":"pij send","v":2,"data":{"msg_id":"01a0607c-c505-7102-b04f-5cbe48ffc14f","outcome":{"outcome":"queued"}},"meta":"from pij-sleeper-service; msg_id 01a0607c-c505-7102-b04f-5cbe48ffc14f"}
{"ok":true,"command":"pij send","v":2,"data":{"msg_id":"01a0607c-c449-7b81-865f-00c8831f7c94","outcome":{"outcome":"queued"}},"meta":"from pij-elegant-aardwolf; msg_id 01a0607c-c449-7b81-865f-00c8831f7c94"}
```

OMP sent the literal stdin body with `--body-file -`; Claude read it unchanged:

```json
{"from":"pij-sleeper-service","to":"pij-elegant-aardwolf","body":"--not-a-flag body with $(danger) and `backticks`","msg_id":"01a0607c-c516-7bc2-878d-44c1830e20dd"}
```

Claude sent `/tmp/pij-130-relaunch/body-5k.txt` with `--body-file`. OMP read bodies of 26 and 5120 bytes; a programmatic comparison reported `file_bytes: 5120` and `file_body_equal: true`.

Final pane output:

```text
OMP:    LIVE_DONE_OMP
Claude: LIVE_DONE_CLAUDE
```
