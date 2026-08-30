# u-cutover-controls transcript — OMP / rs

## Isolation

- Host: `/Users/jordanknight/.npm-global/bin/omp`
- Extension: the same `/Users/jordanknight/pi-hacking/pij-worktrees/s108-w7-cutover/.pi/extensions/pij/index.ts` used by plain Pi
- Launch: `omp --no-extensions -e <extension> --model github-copilot/gpt-5.6-sol-fast`
- Controls: `PIJ_DAEMON_GENERATION=rs`, `PIJ_RS_ADDR=127.0.0.1:17685`, `PIJ_RS_STATE_DIR=/tmp/pij-w7-cutover-final.srxRKd/rs-omp-state`
- Throwaway legacy home: `/tmp/pij-w7-cutover-final.srxRKd/omp-proof-omp-home`

The daemon was the worktree-built `pij-rs`, bound through `PIJ_RS_BIND=127.0.0.1:17685`. No production daemon, store, or canonical `.pi/**` path was used.

## Authority observation

```json
{"id":"pij-rapid-wren","harness":"omp","pid":2088,"proc_start":20260831085350,"state":"idle"}
```

The peer row came from authenticated `pij-rs --json list`; a host model reply was not treated as registration evidence.

## Pushed turn and correlated reply

Submit:

```json
{"ok":true,"command":"pij send","v":1,"data":{"msg_id":"omp-rs-clean","outcome":{"outcome":"queued"},"at":1788130439891}}
```

Durable authority events:

```text
seq=3 kind=message.pushed seat=pij-rapid-wren
{"msg_id":"omp-rs-clean","from":"pij-little-rascal","body":"Use the pij_send tool to send exactly OMP_RS_REPLY to pij-little-rascal, then answer done."}

seq=5 kind=message.pushed seat=pij-little-rascal
{"msg_id":"b8475395-8c93-4e8a-a746-ad3545161061","from":"pij-rapid-wren","body":"OMP_RS_REPLY","in_reply_to":"omp-rs-clean"}
```

Result: registered, received a pushed turn, replied through the v1 wire with durable correlation.
