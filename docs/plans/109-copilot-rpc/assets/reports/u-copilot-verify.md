# u-copilot-verify — installed Copilot RPC evidence

**Binary:** GitHub Copilot CLI 1.0.82-0  
**Date:** 2026-08-31  
**Seat:** dedicated probe process started for this unit; no human/production seat was used  
**Endpoint:** `127.0.0.1:47777`  
**Assigned session id:** `10900000-0000-4000-8000-000000000000`

## Verdicts

| # | Claim | Verdict | Observation |
|---|---|---|---|
| 1 | `--ui-server --port N` accepts the flags and listens on N | **CONFIRM** | The dedicated process printed `Server listening on port 47777`; `lsof` pinned the listener to its Copilot child PID; `nc` connected. |
| 2 | The endpoint uses vscode-jsonrpc `Content-Length` framing over TCP | **CONFIRM** | A framed `ping` returned a framed JSON-RPC response. An HTTP request was parsed as a malformed RPC header, independently identifying the stream parser. |
| 3 | `session.send` exists, returns a server-assigned `messageId` | **DIVERGE** | The method and server-created id exist, but an assigned/foreground-matching session id was rejected until a client kept `session.resume` open. The design input has no resume/connection-lifetime prerequisite. |
| 4 | `mode:"enqueue"` appends politely to the model turn queue, not the human composer | **DIVERGE** | Once a model turn was established, enqueue deferred to its boundary. Two back-to-back frames on one connection executed in reverse order, and enqueue discarded an unsent human composer buffer. |
| 5 | `session.getForeground` is a once-per-session readiness call, not a busy gate | **DIVERGE** | It returns foreground identity/workspace/capabilities and remains positive while the model is busy, but equality with the assigned id did not make `session.send` addressable. No server-side latch was observed; a client-side latch is UNDETERMINED without transport code. |
| 6 | Behavior while the listening session is mid-compose | **DIVERGE** | Both `enqueue` and `immediate` accepted and ran while text was unsent in the composer, then returned to a blank composer. No Copilot-owned persistence of either sentinel was found. |

The divergences are findings, not probe failures. No transport code was written.

## Rig identity and isolation

### Launch

```console
$ copilot --ui-server --port 47777 --session-id 10900000-0000-4000-8000-000000000000 --no-color --no-custom-instructions --no-remote --no-auto-update
● Server listening on port 47777
```

The process was started as a dedicated PTY job named `copilot-rpc-verify`. The chosen UUID and port were unique to this probe.

### Version

```console
$ copilot --version
GitHub Copilot CLI 1.0.82-0.
Run 'copilot update' to check for updates.
```

### Listener owner and connection

```console
$ lsof -nP -iTCP:47777 -sTCP:LISTEN
COMMAND   PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
copilot 72023 jordanknight   28u  IPv4 0x8dca07b59bcdc030      0t0  TCP 127.0.0.1:47777 (LISTEN)
```

```console
$ nc -vz 127.0.0.1 47777
Connection to 127.0.0.1 port 47777 [tcp/*] succeeded!
```

## 1. Flag and listener — CONFIRM

The launch, `lsof`, and active connect above settle both halves: the installed binary accepted the hidden flags and the process actually listened on the requested loopback port. The flag's omission from `copilot --help` did not substitute for a live probe.

## 2. Content-Length JSON-RPC framing — CONFIRM

The body is 76 bytes:

```console
$ printf '%s' '{"jsonrpc":"2.0","id":"ping-1","method":"ping","params":{"message":"hello"}}' | wc -c
76
```

Exact command and output:

```console
$ (printf 'Content-Length: 76\r\n\r\n%s' '{"jsonrpc":"2.0","id":"ping-1","method":"ping","params":{"message":"hello"}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 128

{"jsonrpc":"2.0","id":"ping-1","result":{"message":"pong: hello","timestamp":"2026-08-31T00:53:19.913864Z","protocolVersion":3}}
```

Independent negative discriminator:

```console
$ curl --http0.9 -i --max-time 5 http://127.0.0.1:47777/
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed

  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0
100   139    0   139    0     0   107k      0 --:--:-- --:--:-- --:--:--  135k
Content-Length: 116

{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Message header must separate key and value using ':'"}}
```

The endpoint treated the HTTP request line as a malformed vscode-jsonrpc header and framed its error with `Content-Length`.

## 3. `session.send`, `messageId`, and the missing resume prerequisite — DIVERGE

### Foreground id matched the spawn-assigned id

```console
$ (printf 'Content-Length: 88\r\n\r\n%s' '{"jsonrpc":"2.0","id":"probe-foreground-1","method":"session.getForeground","params":{}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 280

{"jsonrpc":"2.0","id":"probe-foreground-1","result":{"sessionId":"10900000-0000-4000-8000-000000000000","workspacePath":"/Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000","capabilities":{"ui":{"elicitation":true,"mcpApps":false},"extensions":true}}}
```

### Direct send still failed

This was repeated after a real TUI turn had completed; first-turn initialization did not change it.

```console
$ (printf 'Content-Length: 207\r\n\r\n%s' '{"jsonrpc":"2.0","id":"send-3","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Reply exactly COPILOT_RPC_VERIFY_SEND_1 and do not use tools.","mode":"enqueue"}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 179

{"jsonrpc":"2.0","id":"send-3","error":{"code":-32603,"message":"Request session.send failed with message: Session not found for sessionId: 10900000-0000-4000-8000-000000000000"}}
```

A one-shot `session.resume` whose TCP connection then closed produced no response before close, and a later send still failed:

```console
$ (printf 'Content-Length: 121\r\n\r\n%s' '{"jsonrpc":"2.0","id":"resume-1","method":"session.resume","params":{"sessionId":"10900000-0000-4000-8000-000000000000"}}'; sleep 1) | nc -w 2 127.0.0.1 47777

$ (printf 'Content-Length: 207\r\n\r\n%s' '{"jsonrpc":"2.0","id":"send-4","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Reply exactly COPILOT_RPC_VERIFY_SEND_1 and do not use tools.","mode":"enqueue"}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 179

{"jsonrpc":"2.0","id":"send-4","error":{"code":-32603,"message":"Request session.send failed with message: Session not found for sessionId: 10900000-0000-4000-8000-000000000000"}}
```

### Keeping the resumed connection open made the id sendable

Exact persistent-client command/input:

```console
$ nc 127.0.0.1 47777
Content-Length: 121

{"jsonrpc":"2.0","id":"resume-2","method":"session.resume","params":{"sessionId":"10900000-0000-4000-8000-000000000000"}}
```

Exact response frame (unsolicited event frames are not reproduced):

```text
Content-Length: 422

{"jsonrpc":"2.0","id":"resume-2","result":{"sessionId":"10900000-0000-4000-8000-000000000000","nativeSessionId":"10900000-0000-4000-8000-000000000000","startTime":"2026-08-31T00:51:26.485Z","isRemote":false,"mode":"interactive","workspacePath":"/Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000","capabilities":{"ui":{"elicitation":true,"mcpApps":false,"canvases":false},"extensions":false}}}
```

With that resumed connection still alive, the same one-shot send shape succeeded:

```console
$ (printf 'Content-Length: 207\r\n\r\n%s' '{"jsonrpc":"2.0","id":"send-5","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Reply exactly COPILOT_RPC_VERIFY_SEND_1 and do not use tools.","mode":"enqueue"}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 93

{"jsonrpc":"2.0","id":"send-5","result":{"messageId":"17d904fc-55dd-46b5-a6a8-10fb2feb46a7"}}
```

The request contained no `messageId`; the response supplied one. The TUI visibly ran the prompt and printed `COPILOT_RPC_VERIFY_SEND_1`.

**Finding:** on this build, `port + assigned session id` is insufficient. A live resumed RPC connection owns registration. Any transport design must account for that connection lifetime; it cannot assume per-message connect/send/close.

## 4. `mode:"enqueue"` semantics — DIVERGE

### Back-to-back frames raced and executed in reverse order

Two framed requests were written in this order in one write to the already-open persistent `nc` connection:

```text
Content-Length: 247

{"jsonrpc":"2.0","id":"queue-1","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Output exactly FIRST_MODEL_QUEUE, then integers 1 through 200 separated by spaces, and nothing else.","mode":"enqueue"}}Content-Length: 197

{"jsonrpc":"2.0","id":"queue-2","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Reply exactly SECOND_MODEL_QUEUE and nothing else.","mode":"enqueue"}}
```

Both acks succeeded:

```text
{"jsonrpc":"2.0","id":"queue-1","result":{"messageId":"fd5e02d0-b533-4612-805d-1e7a2fddb69e"}}
{"jsonrpc":"2.0","id":"queue-2","result":{"messageId":"30f3a5f8-341e-47c3-8ec1-ac29e1fdb782"}}
```

Execution order came from the isolated session's own event log. `jq -e` makes an empty filter a non-zero failure rather than a false pass:

```console
$ jq -ce 'select(.timestamp >= "2026-08-31T00:56:52.000Z" and .timestamp <= "2026-08-31T00:57:01.000Z") | select(.type == "user.message" or .type == "assistant.message") | {timestamp,type,marker:(if (.data.content | contains("FIRST_MODEL_QUEUE")) then "FIRST_MODEL_QUEUE" elif (.data.content | contains("SECOND_MODEL_QUEUE")) then "SECOND_MODEL_QUEUE" else "unexpected" end),delivery:(.data.delivery // null)}' /Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000/events.jsonl
{"timestamp":"2026-08-31T00:56:52.191Z","type":"user.message","marker":"SECOND_MODEL_QUEUE","delivery":"idle"}
{"timestamp":"2026-08-31T00:56:54.720Z","type":"assistant.message","marker":"SECOND_MODEL_QUEUE","delivery":null}
{"timestamp":"2026-08-31T00:56:54.746Z","type":"user.message","marker":"FIRST_MODEL_QUEUE","delivery":"queued"}
{"timestamp":"2026-08-31T00:57:00.129Z","type":"assistant.message","marker":"FIRST_MODEL_QUEUE","delivery":null}
```

### Established busy turn deferred correctly

The first send was allowed to establish a turn before the second send was issued. Both used `mode:"enqueue"`:

```console
$ (printf 'Content-Length: 239\r\n\r\n%s' '{"jsonrpc":"2.0","id":"busy-1","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Output exactly BUSY_FIRST, then integers 1 through 400 separated by spaces, and nothing else.","mode":"enqueue"}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 93

{"jsonrpc":"2.0","id":"busy-1","result":{"messageId":"f88fc882-2064-48a5-b686-4db43f3c8015"}}
```

```console
$ (printf 'Content-Length: 189\r\n\r\n%s' '{"jsonrpc":"2.0","id":"busy-2","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Reply exactly BUSY_SECOND and nothing else.","mode":"enqueue"}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 93

{"jsonrpc":"2.0","id":"busy-2","result":{"messageId":"2250f5f8-cdb4-4c3a-9e53-18aef50636e6"}}
```

```console
$ jq -ce 'select(.timestamp >= "2026-08-31T00:58:59.000Z" and .timestamp <= "2026-08-31T00:59:10.000Z") | select(.type == "user.message" or .type == "assistant.message") | {timestamp,type,marker:(if (.data.content | contains("BUSY_FIRST")) then "BUSY_FIRST" elif (.data.content | contains("BUSY_SECOND")) then "BUSY_SECOND" else "unexpected" end),delivery:(.data.delivery // null)}' /Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000/events.jsonl
{"timestamp":"2026-08-31T00:58:59.172Z","type":"user.message","marker":"BUSY_FIRST","delivery":"idle"}
{"timestamp":"2026-08-31T00:59:07.438Z","type":"assistant.message","marker":"BUSY_FIRST","delivery":null}
{"timestamp":"2026-08-31T00:59:07.462Z","type":"user.message","marker":"BUSY_SECOND","delivery":"queued"}
{"timestamp":"2026-08-31T00:59:09.871Z","type":"assistant.message","marker":"BUSY_SECOND","delivery":null}
```

**Finding:** established model-turn queueing works, but request dispatch can race before busy state is established. No ordering guarantee is safe across a burst of sends.

The human-composer part of this claim is settled by claim 6: enqueue is not merely unaware of the composer; it clears it.

## 5. Readiness and latching — DIVERGE

The first `getForeground` success and subsequent `session.send` failure are quoted under claim 3. A matching foreground id was therefore not a sufficient readiness condition.

The server answered repeated calls; it did not expose a server-side latch:

```console
$ (printf 'Content-Length: 82\r\n\r\n%s' '{"jsonrpc":"2.0","id":"foreground-2","method":"session.getForeground","params":{}}'; sleep 1) | nc -w 2 127.0.0.1 47777 && (printf 'Content-Length: 82\r\n\r\n%s' '{"jsonrpc":"2.0","id":"foreground-3","method":"session.getForeground","params":{}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 274

{"jsonrpc":"2.0","id":"foreground-2","result":{"sessionId":"10900000-0000-4000-8000-000000000000","workspacePath":"/Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000","capabilities":{"ui":{"elicitation":true,"mcpApps":false},"extensions":true}}}Content-Length: 274

{"jsonrpc":"2.0","id":"foreground-3","result":{"sessionId":"10900000-0000-4000-8000-000000000000","workspacePath":"/Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000","capabilities":{"ui":{"elicitation":true,"mcpApps":false},"extensions":true}}}
```

It is not a busy gate. A controlled model turn ran from `01:00:34.891Z` to `01:00:52.413Z`; `getForeground` returned positive at `01:00:35.855041000Z` inside that interval:

```text
2026-08-31T01:00:35.855041000Z
Content-Length: 279

{"jsonrpc":"2.0","id":"foreground-busy-2","result":{"sessionId":"10900000-0000-4000-8000-000000000000","workspacePath":"/Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000","capabilities":{"ui":{"elicitation":true,"mcpApps":false},"extensions":true}}}
```

Exact interval evidence:

```console
$ jq -ce 'select(.timestamp >= "2026-08-31T01:00:34.000Z") | select(.type == "user.message" or .type == "assistant.turn_start" or .type == "assistant.message" or .type == "assistant.turn_end") | if .type == "user.message" then {timestamp,type,content:.data.content,delivery:.data.delivery} elif .type == "assistant.message" then {timestamp,type,content_prefix:(.data.content[0:40])} else {timestamp,type,data} end' /Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000/events.jsonl
{"timestamp":"2026-08-31T01:00:34.889Z","type":"user.message","content":"Output exactly READINESS_BUSY_2, then integers 1 through 1000 separated by spaces, and nothing else.","delivery":"idle"}
{"timestamp":"2026-08-31T01:00:34.891Z","type":"assistant.turn_start","data":{"turnId":"0","interactionId":"b162e307-3a0d-4576-b995-528336ad5188"}}
{"timestamp":"2026-08-31T01:00:52.412Z","type":"assistant.message","content_prefix":"READINESS_BUSY_2 1 2 3 4 5 6 7 8 9 10 11"}
{"timestamp":"2026-08-31T01:00:52.413Z","type":"assistant.turn_end","data":{"turnId":"0"}}
```

**Latch boundary:** a once-per-session cache would be client transport behavior. Settling that implementation property would require writing the transport, which this unit forbids. It remains **UNDETERMINED** as an implementation mechanism. What is determined is that latching the pre-resume positive result would cache a false readiness result.

## 6. Mid-compose behavior — DIVERGE

### `enqueue` accepted, ran, and cleared the unsent buffer

Exact PTY state before the RPC request (ANSI-stripped capture):

```text
HUMAN_COMPOSER_SENTINEL_DO_NOT_SUBMIT

 @ files · # issues
```

The sentinel was typed without Enter.

```console
$ (printf 'Content-Length: 203\r\n\r\n%s' '{"jsonrpc":"2.0","id":"compose-1","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Reply exactly RPC_DURING_COMPOSE and do not use tools.","mode":"enqueue"}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 96

{"jsonrpc":"2.0","id":"compose-1","result":{"messageId":"a98284d6-25bd-4091-86d1-468468a02ea6"}}
```

Exact material PTY state after the request:

```text
 ● Working esc interrupt · ctrl+q enqueue ❯ Reply exactly RPC_DURING_COMPOSE and do not use tools.10:56
 ● RPC_DURING_COMPOSE30.1545
 @ files · # issues
```

The RPC prompt ran immediately. The composer returned blank; the sentinel was neither submitted nor restored.

### `immediate` exists and is no safer

Exact PTY state before the request:

```text
HUMAN_COMPOSER_IMMEDIATE_DO_NOT_SUBMIT
```

```console
$ (printf 'Content-Length: 217\r\n\r\n%s' '{"jsonrpc":"2.0","id":"immediate-1","method":"session.send","params":{"sessionId":"10900000-0000-4000-8000-000000000000","prompt":"Reply exactly RPC_IMMEDIATE_DURING_COMPOSE and do not use tools.","mode":"immediate"}}'; sleep 1) | nc -w 2 127.0.0.1 47777
Content-Length: 98

{"jsonrpc":"2.0","id":"immediate-1","result":{"messageId":"0b92ed3f-01f0-4e56-80f0-1f09f688c231"}}
```

Exact material PTY state after the request:

```text
 ● Working esc interrupt · ctrl+q enqueue
 ❯ Reply exactly RPC_IMMEDIATE_DURING_COMPOSE and do not use tools.10:57
 ● RPC_IMMEDIATE_DURING_COMPOSE38
 @ files · # issues
```

The composer was blank again. No tested send mode preserved the unsent human buffer.

### Recovery search

The session event log did not contain either sentinel. `jq -e` made absence loud:

```console
$ jq -ce 'select(tostring | contains("HUMAN_COMPOSER_"))' /Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000/events.jsonl

Command exited with code 4
```

The exact recursive search run through the repository search tool was:

```text
pattern: HUMAN_COMPOSER_(SENTINEL|IMMEDIATE)_DO_NOT_SUBMIT
path: /Users/jordanknight/.copilot
case-sensitive: true
respect gitignore: false
```

Exact output:

```text
No matches found
```

The external PTY capture retained the text because the probe harness recorded what had been rendered. No Copilot-owned session state, draft, or log under `~/.copilot` retained it. This supports "not recoverable from Copilot-owned state"; it does not claim that an independent terminal recorder could not recover rendered text.

## Consequences for downstream units

1. `rpc_port + harness_session_id` does not describe a per-message connection. The installed server required a live `session.resume` registration before `session.send` accepted the assigned id.
2. `session.getForeground == assigned id` is not sufficient readiness for send.
3. No ordering guarantee is safe across back-to-back RPC sends. Once a model turn is established, later enqueue defers correctly.
4. Neither `enqueue` nor `immediate` is safe against a human mid-compose. The observed consequence was loss of the unsent buffer, not merely interjection.
5. A composer/interaction gate is therefore a hard precondition on the RPC path itself; mode selection cannot make an unsafe send safe.
