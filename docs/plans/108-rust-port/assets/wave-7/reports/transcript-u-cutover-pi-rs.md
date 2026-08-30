# u-cutover-controls transcript — plain Pi / rs

## Isolation

- Host: `/Users/jordanknight/.npm-global/bin/pi`
- Extension: `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w7-cutover/.pi/extensions/pij/index.ts`
- Launch: `pi --approve -ne -e <extension> --model github-copilot/gpt-5.6-sol-fast`
- Controls: `PIJ_DAEMON_GENERATION=rs`, `PIJ_RS_ADDR=127.0.0.1:17682`, `PIJ_RS_STATE_DIR=/tmp/pij-w7-cutover-final.srxRKd/rs-state`
- Throwaway legacy home: `/tmp/pij-w7-cutover-final.srxRKd/pi-rs-legacy-home`

The daemon was the worktree-built `pij-rs`, bound through `PIJ_RS_BIND=127.0.0.1:17682`. No production daemon, store, or canonical `.pi/**` path was used.

## Host observation

```text
pij: detected Rust daemon v1 at 127.0.0.1:17682; registered pij-little-rascal
pij-little-rascal · rs-v1
```

## Authority observation

The Rust authority, not the host exit code, proved registration:

```json
{"id":"pij-little-rascal","harness":"pi","pid":70226,"proc_start":20260831084727,"state":"idle"}
```

The throwaway legacy home did not exist after the rs leg. Rust mode created no TS registry residue.

## Pushed turn and correlated reply

Submit:

```json
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"pi-rs-matrix","outcome":{"outcome":"queued"},"at":1788130152841}}
```

Durable authority events:

```text
seq=3 kind=message.pushed seat=pij-little-rascal
{"msg_id":"pi-rs-matrix","from":"pij-rapid-wren","body":"Use the pij_send tool to send exactly PI_RS_REPLY to pij-rapid-wren, then answer done."}

seq=7 kind=message.pushed seat=pij-rapid-wren
{"msg_id":"033229e5-bafb-4784-94af-bfb9125b0bd3","from":"pij-little-rascal","body":"PI_RS_REPLY","in_reply_to":"pi-rs-matrix"}
```

Result: registered, received a pushed turn, replied through the v1 wire with durable correlation.
