# u-copilot-verify — installed Copilot RPC evidence

**Display version:** GitHub Copilot CLI 1.0.82-0

**Native package:** `@github/copilot-darwin-arm64@0.0.412-2`

**Wire protocol:** `protocolVersion: 3`

**Resolved executable:** `/Users/jordanknight/.npm-global/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot`

**Executable SHA-256:** `3f7ca3e28fd92c3d20a24335296b65a6b483a4c590b7caeddd80211d97ebd00b`

**Seats:** dedicated probe processes; no human/production seat was used

**Re-review endpoints:** `127.0.0.1:47781`, `127.0.0.1:51948`

**Random re-review session ids:** `eb0821f7-3e87-422a-8421-8300a5b34115`, `f336e876-26d3-4291-b720-842e2ca0f0d2`

## Verdicts

| # | Claim | Verdict | Observation |
|---|---|---|---|
| 1 | `--ui-server --port N` accepts the flags and listens on N | **CONFIRM** | Two isolated processes requested different ports, `47781` and `51948`; each process owned exactly the requested listener and accepted a connection. |
| 2 | The endpoint uses vscode-jsonrpc `Content-Length` framing over TCP | **CONFIRM** | A correctly byte-counted multibyte frame succeeded; a UTF-16-code-unit count produced uncorrelatable `-32700`; an over-declared frame was silent. |
| 3a | `session.send` exists and returns a server-assigned `messageId` | **CONFIRM** | Requests carried no `messageId`; responses supplied distinct UUIDs. |
| 3b | An assigned session id is directly sendable | **DIVERGE** | An assigned/foreground-matching id was rejected until a client kept `session.resume` open. The design input has no resume/connection-lifetime prerequisite. |
| 4 | `mode:"enqueue"` appends politely to the model turn queue, not the human composer | **DIVERGE** | Two pipelined frames executed in reverse order even when both were labelled `queued`. An RPC turn also interjected while a human draft was pending, but the draft survived. |
| 5 | `session.getForeground` is a once-per-session readiness call, not a busy gate | **DIVERGE** | It stays positive while busy, but it is also positive pre-resume when `session.send` fails. A client-side latch remains UNDETERMINED; a pre-resume positive must never be latched. |
| 6 | Behavior while the listening session is mid-compose | **DIVERGE** | Both `enqueue` and `immediate` ran an unconsented model turn while text was pending. Pressing Enter afterwards submitted each preserved draft intact. |

The divergences are findings, not probe failures. No transport code was written.

## Rig identity and isolation

### Binary pin

Two different executables on `PATH` print the same display version, so the version string alone is not an instrument pin:

```console
$ which -a copilot
/Users/jordanknight/.npm-global/bin/copilot
/Users/jordanknight/.local/bin/copilot
```

The probes in this correction launched the resolved native executable by absolute path.

```console
$ /Users/jordanknight/.npm-global/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot --version
GitHub Copilot CLI 1.0.82-0.
Run 'copilot update' to check for updates.
```

```console
$ node -p "require('/Users/jordanknight/.npm-global/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/package.json').version"
0.0.412-2
```

```console
$ sha256sum /Users/jordanknight/.npm-global/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot
3f7ca3e28fd92c3d20a24335296b65a6b483a4c590b7caeddd80211d97ebd00b  /Users/jordanknight/.npm-global/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot
```

The original 47777 run used the npm wrapper and a UUID supplied explicitly by this probe. Corrective probes used the random UUIDs above.

### Isolated launches

```console
$ /Users/jordanknight/.npm-global/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot --ui-server --port 47781 --session-id eb0821f7-3e87-422a-8421-8300a5b34115 --no-color --no-custom-instructions --no-remote --no-auto-update
● Server listening on port 47781
```

```console
$ /Users/jordanknight/.npm-global/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot --ui-server --port 51948 --session-id f336e876-26d3-4291-b720-842e2ca0f0d2 --no-color --no-custom-instructions --no-remote --no-auto-update
● Server listening on port 51948
```

### Listener owners and connections

```console
$ lsof -nP -iTCP:47781 -sTCP:LISTEN && nc -vz 127.0.0.1 47781
COMMAND   PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
copilot 13896 jordanknight   32u  IPv4 0xc68549c52ca7167c      0t0  TCP 127.0.0.1:47781 (LISTEN)
Connection to 127.0.0.1 port 47781 [tcp/*] succeeded!
```

```console
$ lsof -nP -iTCP:51948 -sTCP:LISTEN && nc -vz 127.0.0.1 51948
COMMAND   PID         USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
copilot 13913 jordanknight   28u  IPv4 0xb69f6edf57c3d993      0t0  TCP 127.0.0.1:51948 (LISTEN)
Connection to 127.0.0.1 port 51948 [tcp/*] succeeded!
```

## 1. Flag and listener — CONFIRM

Two distinct requested ports were honoured exactly. Each launched process owned one listener on its requested `N`, and each accepted a connection. This discriminates `--port N` from a fixed/default-port implementation. The flag's omission from `copilot --help` did not substitute for a live probe.

## 2. Content-Length JSON-RPC framing — CONFIRM

The endpoint reports wire `protocolVersion: 3`:

```console
$ (printf 'Content-Length: 76\r\n\r\n%s' '{"jsonrpc":"2.0","id":"ping-1","method":"ping","params":{"message":"hello"}}'; sleep 1) | nc -w 2 127.0.0.1 47781
Content-Length: 128

{"jsonrpc":"2.0","id":"ping-1","result":{"message":"pong: hello","timestamp":"2026-08-31T02:05:29.604203Z","protocolVersion":3}}
```

`Content-Length` is a UTF-8 byte count, not a JavaScript string length. The discriminator asserts that the two lengths differ so an accidentally ASCII-only fixture cannot pass for the wrong reason:

```console
$ node -e 'const body = JSON.stringify({jsonrpc:"2.0",id:"utf8",method:"ping",params:{message:"baton — handoff 🤖"}}); console.log(body); console.log(`jsLength=${body.length}`); console.log(`utf8Bytes=${Buffer.byteLength(body,"utf8")}`); if (body.length === Buffer.byteLength(body,"utf8")) process.exit(1)'
{"jsonrpc":"2.0","id":"utf8","method":"ping","params":{"message":"baton — handoff 🤖"}}
jsLength=87
utf8Bytes=91
```

The correct byte count succeeds:

```console
$ (printf 'Content-Length: 91\r\n\r\n%s' '{"jsonrpc":"2.0","id":"utf8","method":"ping","params":{"message":"baton — handoff 🤖"}}'; sleep 1) | nc -w 2 127.0.0.1 47781
Content-Length: 143

{"jsonrpc":"2.0","id":"utf8","result":{"message":"pong: baton — handoff 🤖","timestamp":"2026-08-31T02:08:08.086696Z","protocolVersion":3}}
```

Declaring the JavaScript UTF-16 code-unit length truncates the UTF-8 body and returns an error whose `id:null` cannot be correlated to the request:

```console
$ (printf 'Content-Length: 87\r\n\r\n%s' '{"jsonrpc":"2.0","id":"utf8","method":"ping","params":{"message":"baton — handoff 🤖"}}'; sleep 1) | nc -w 2 127.0.0.1 47781
Content-Length: 110

{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"EOF while parsing a string at line 1 column 87"}}
```

Over-declaring the same 91-byte body as 95 bytes produces no output before the client timeout:

```console
$ (printf 'Content-Length: 95\r\n\r\n%s' '{"jsonrpc":"2.0","id":"utf8","method":"ping","params":{"message":"baton — handoff 🤖"}}'; sleep 1) | nc -w 2 127.0.0.1 47781
(no output)
```

**Binding:** compute `Content-Length` with `Buffer.byteLength(body, "utf8")`, include a non-ASCII contract fixture, and enforce a client response deadline. A bad length presents as silence or an uncorrelatable parse error, not a useful framing diagnostic.

## 3. `session.send`, `messageId`, and the missing resume prerequisite — CONFIRM / DIVERGE
The two halves are graded separately: `messageId` assignment is **CONFIRM**; direct addressability without a live resume registration is **DIVERGE**. The original assigned id shown below was supplied explicitly by this probe, not discovered as a sentinel; corrective runs use the random UUIDs in the instrument pin.


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

**3a — CONFIRM:** the request contained no `messageId`; the response supplied UUID `17d904fc-55dd-46b5-a6a8-10fb2feb46a7`. It was server-assigned, not echoed. The TUI visibly ran the prompt and printed `COPILOT_RPC_VERIFY_SEND_1`.

**3b — DIVERGE:** on this build, `port + assigned session id` is insufficient. A live resumed RPC connection owns registration. Any transport design must account for that connection lifetime; it cannot assume per-message connect/send/close.

## 4. `mode:"enqueue"` semantics — DIVERGE

### Pipelined frames can execute in reverse order

The original idle-session burst wrote `queue-1` then `queue-2` in one TCP write. Both acks succeeded, but session events recorded `SECOND_MODEL_QUEUE` before `FIRST_MODEL_QUEUE`:

```console
$ jq -ce 'select(.timestamp >= "2026-08-31T00:56:52.000Z" and .timestamp <= "2026-08-31T00:57:01.000Z") | select(.type == "user.message" or .type == "assistant.message") | {timestamp,type,marker:(if (.data.content | contains("FIRST_MODEL_QUEUE")) then "FIRST_MODEL_QUEUE" elif (.data.content | contains("SECOND_MODEL_QUEUE")) then "SECOND_MODEL_QUEUE" else "unexpected" end),delivery:(.data.delivery // null)}' /Users/jordanknight/.copilot/session-state/10900000-0000-4000-8000-000000000000/events.jsonl
{"timestamp":"2026-08-31T00:56:52.191Z","type":"user.message","marker":"SECOND_MODEL_QUEUE","delivery":"idle"}
{"timestamp":"2026-08-31T00:56:54.720Z","type":"assistant.message","marker":"SECOND_MODEL_QUEUE","delivery":null}
{"timestamp":"2026-08-31T00:56:54.746Z","type":"user.message","marker":"FIRST_MODEL_QUEUE","delivery":"queued"}
{"timestamp":"2026-08-31T00:57:00.129Z","type":"assistant.message","marker":"FIRST_MODEL_QUEUE","delivery":null}
```

That evidence proved reversal, but not its mechanism: the control changed both write shape and session state. The reviewer isolated those variables by holding the session busy and sending `ORDER_A` then `ORDER_B` as two frames in one 487-byte write. Both frames were labelled `queued`, yet execution still reversed:

```console
$ jq -ce 'select(.type == "user.message") | select((.data.content | contains("BUSY_ESTABLISH")) or (.data.content | contains("ORDER_A")) or (.data.content | contains("ORDER_B"))) | {timestamp,marker:(if (.data.content | contains("BUSY_ESTABLISH")) then "BUSY_ESTABLISH" elif (.data.content | contains("ORDER_A")) then "ORDER_A" else "ORDER_B" end),delivery:.data.delivery}' docs/plans/109-copilot-rpc/assets/reports/review-verify-R2-2-ordering-events.jsonl
{"timestamp":"2026-08-31T01:30:22.083Z","marker":"BUSY_ESTABLISH","delivery":"idle"}
{"timestamp":"2026-08-31T01:30:37.325Z","marker":"ORDER_B","delivery":"queued"}
{"timestamp":"2026-08-31T01:30:39.594Z","marker":"ORDER_A","delivery":"queued"}
```

**Finding:** reversal persists after busy state is established. The evidence supports concurrent handling of pipelined frames, not a race limited to the idle-to-busy transition.

**Mitigation:** serialize-and-await per seat. Keep exactly one message in flight; send the next only after the previous turn is **observed complete**, never merely acked. Establishing a turn first is not sufficient, and an RPC ack cannot prove execution.

`enqueue` is polite to an already-established model turn boundary when sends are serialized. It is not permission to interject into a human's live composer; claim 6 carries that independent consent hazard.

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

The original PTY observation was misread. After an RPC turn, the TUI rendered its empty-composer placeholder over a still-populated in-memory draft. Searching session files could only answer whether the text had been **submitted**; an unsent draft is absent from session state whether preserved or destroyed. Those two instruments did not observe draft survival.

The correction used a random session id and the missing discriminator: after each RPC turn completed, press Enter and inspect the resulting `user.message`.

### `enqueue`: RPC interjected; draft survived

Typed without Enter:

```text
ENTER_PROBE_ENQUEUE_eb0821f7
```

```console
$ (printf 'Content-Length: 206\r\n\r\n%s' '{"jsonrpc":"2.0","id":"enter-enqueue","method":"session.send","params":{"sessionId":"eb0821f7-3e87-422a-8421-8300a5b34115","prompt":"Reply exactly ENTER_RPC_ENQUEUE and do not use tools.","mode":"enqueue"}}'; sleep 1) | nc -w 2 127.0.0.1 47781
Content-Length: 100

{"jsonrpc":"2.0","id":"enter-enqueue","result":{"messageId":"477fad88-aa42-49b7-8f66-af5576e47fdc"}}
```

After `ENTER_RPC_ENQUEUE` completed, pressing Enter submitted the original draft intact.

### `immediate`: RPC interjected; draft survived

Typed without Enter:

```text
ENTER_PROBE_IMMEDIATE_eb0821f7
```

```console
$ (printf 'Content-Length: 212\r\n\r\n%s' '{"jsonrpc":"2.0","id":"enter-immediate","method":"session.send","params":{"sessionId":"eb0821f7-3e87-422a-8421-8300a5b34115","prompt":"Reply exactly ENTER_RPC_IMMEDIATE and do not use tools.","mode":"immediate"}}'; sleep 1) | nc -w 2 127.0.0.1 47781
Content-Length: 102

{"jsonrpc":"2.0","id":"enter-immediate","result":{"messageId":"5a7833ff-2e1f-4a65-bee6-701a334261e8"}}
```

After `ENTER_RPC_IMMEDIATE` completed, pressing Enter submitted the original draft intact.

Exact session ordering for both modes:

```console
$ jq -ce 'select(.timestamp >= "2026-08-31T02:06:00.000Z") | select((.type == "user.message" or .type == "assistant.message") and ((.data.content | contains("ENTER_RPC_")) or (.data.content | startswith("ENTER_PROBE_")))) | {timestamp,type,content:.data.content,delivery:(.data.delivery // null)}' /Users/jordanknight/.copilot/session-state/eb0821f7-3e87-422a-8421-8300a5b34115/events.jsonl
{"timestamp":"2026-08-31T02:06:08.800Z","type":"user.message","content":"Reply exactly ENTER_RPC_ENQUEUE and do not use tools.","delivery":"idle"}
{"timestamp":"2026-08-31T02:06:11.286Z","type":"assistant.message","content":"ENTER_RPC_ENQUEUE","delivery":null}
{"timestamp":"2026-08-31T02:06:27.343Z","type":"user.message","content":"ENTER_PROBE_ENQUEUE_eb0821f7","delivery":"idle"}
{"timestamp":"2026-08-31T02:06:33.044Z","type":"assistant.message","content":"ENTER_PROBE_ENQUEUE_eb0821f7\n\nNo instruction is attached to that token — let me know what you'd like done.","delivery":null}
{"timestamp":"2026-08-31T02:07:11.497Z","type":"user.message","content":"Reply exactly ENTER_RPC_IMMEDIATE and do not use tools.","delivery":"idle"}
{"timestamp":"2026-08-31T02:07:14.147Z","type":"assistant.message","content":"ENTER_RPC_IMMEDIATE","delivery":null}
{"timestamp":"2026-08-31T02:07:30.529Z","type":"user.message","content":"ENTER_PROBE_IMMEDIATE_eb0821f7","delivery":"idle"}
{"timestamp":"2026-08-31T02:07:33.266Z","type":"assistant.message","content":"ENTER_PROBE_IMMEDIATE_eb0821f7\n\nStill no instruction bound to that token — tell me what you'd like me to do.","delivery":null}
```

**Corrected finding:** neither tested mode destroyed the pending draft. Both modes did run an unconsented model turn in the human's live session while that draft was pending. The composer gate remains a hard precondition on consent grounds, not data-loss grounds.

## Consequences for downstream units

1. `rpc_port + harness_session_id` does not describe a per-message connection. The installed server required a live `session.resume` registration before `session.send` accepted the assigned id.
2. `session.getForeground == assigned id` is not sufficient readiness for send. **Never latch a positive observed before the live resume registration exists**; it is a demonstrated false ready.
3. No ordering guarantee is safe across pipelined RPC sends, including while the model is already busy and both messages are labelled `queued`. Serialize-and-await: one message in flight per seat, next only after the previous turn is observed complete.
4. Neither `enqueue` nor `immediate` is safe against a human mid-compose: both interject an unconsented model turn. The pending drafts survived and later submitted intact; no data loss was observed.
5. A composer/interaction gate is therefore a hard precondition on the RPC path itself. Mode selection cannot supply consent, and a fast path around the gate disables the protection without deleting its code.
6. Frame with `Buffer.byteLength(body, "utf8")`, defend it with a non-ASCII fixture, and impose a client response deadline; malformed lengths produce silence or uncorrelatable `id:null` errors.
