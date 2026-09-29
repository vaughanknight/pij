# Plan 158 contract: FYI held delivery

This contract is frozen for the fan-out. The PM (pij-yelling-trout) owns the Rust daemon, store, core and CLI.
Workers code against this document, not against sibling implementations.

## Daemon HTTP (127.0.0.1:7461, `Authorization: Bearer <~/.pij-rs/daemon.key>`)

### Hold: `POST /v1/send` with `"fyi": true`
The body is an ordinary send body plus `"fyi": true`, for example
`{"to":"pij-x","from":"pij-y","body":"...","fyi":true}`.
- The daemon stores the FYI. It opens no turn and does no tmux, UDS or extension push.
- Success envelope `data` is a Receipt: `{"msg_id":"…","outcome":{"outcome":"held","reason":"fyi"},"at":<ms>}`.
- It is refused, with `ok:false` and `error:"refused"`, in these cases:
  - `fyi` combined with a control `command`;
  - a remote `seat@machine` recipient;
  - a tombstoned or unknown recipient, with the same errors as a normal send.
- The native CLI prints `pij send: held (fyi) — <msg_id>`.
- The shim form is `pij send <seat> --fyi "<text>"`, and the native form is `pij-rs send --to <seat> --fyi <text>`.

### Ride-along
The next non-control, non-FYI message that reaches the seat carries every pending FYI. This holds for every harness and every route (UDS, tmux, queue, inbox pull, pointer).
The FYIs are appended to the SAME message body, after its content, in the golden format below. No client work is needed for this.

### Claim: `POST /v1/fyi/claim`
Used by the typed-turn hooks.
- Request: `{"seat"?: string, "pane"?: string, "native_session"?: string, "via": "hook:claude"|"hook:copilot"|"hook:omp"|"hook:pi"}`.
  - At least one of `pane` or `native_session` is required as binding evidence.
  - `seat` is optional when `pane` resolves a live seat.
  - A mismatch between a given `seat` and the pane or session is refused.
- Success `data`: `{"seat":"pij-x","count":N,"block":"<golden block or empty string>","ids":["…"]}`.
  - `count` 0 means `block == ""`.
  - The claim is atomic: pending → delivered, exactly once. It appends a `fyi.delivered` spine event with its `via`. Two racing claims never both receive the same FYI.
- Native CLI for the Claude shell hook: `pij-rs fyi-claim --pane <P> [--native-session <S>] --via hook:claude`.
  - It prints the raw `block` to stdout, or nothing when the count is 0, and exits 0.
  - With the global `--json`, it prints the envelope.
  - When the daemon is unreachable it exits non-zero. The hook must then print nothing and exit 0, so it never blocks the human's prompt.

### Count
- `pij state <seat> --json` shows `data.pendingFyis: N`.
- `/v1/whoami` (and `pij-rs --json whoami --pane "$TMUX_PANE"`) gains `data.pending_fyis: N`. The status lines read it there, so they need no extra call.
- The events on `/v1/events`, whose `seat` is the recipient, are `fyi.held`, `fyi.delivered` and `fyi.restored`.
  A tombstone drops pending FYIs and records `pending_fyis_dropped` in the `seat.tombstone` payload.
  Extensions refresh their count on any `fyi.*` event, or on `seat.tombstone`, for their seat.

## Golden format (the only definition)
The fixture is `crates/testkit/fixtures/golden/fyi/block.txt`, which is the exact bytes of a 2-FYI block without a trailing newline:

```
Also, 2 FYIs were queued for you:
1. [from pij-x, 14:02] <body>
2. [from pij-y, 14:10] <body>
```

- For one FYI the header is `Also, 1 FYI was queued for you:`.
- Order is oldest first. The time is `HH:MM`, 24-hour, in daemon local time.
- In a multi-line body, each continuation line is indented by 3 spaces.
- Ride-along joins as `<original body>\n\n<block>`.
- Hooks use `block` verbatim. Clients never re-render or restate the format. Their tests read the fixture file and prove they pass it through byte-for-byte.

## Host placement
- **Claude:** a `UserPromptSubmit` hook prints `{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":<block>}}` when `block` is non-empty, and nothing otherwise.
- **OMP and Pi:** `pi.on("before_agent_start")` returns `{message:{customType:"pij-fyi", content: block, display:true}}`, or `undefined` when there is nothing to add.
- **Copilot:** in the native extension, `joinSession({hooks:{onUserPromptSubmitted}})` returns `{additionalContext: block}`.
- **Status and footer:** show `✉N` only while N > 0.

## Addendum 3: busy/idle publication (`POST /v1/activity`)
Root cause: rs has no activity producer, so `seats.state` stays at the constructor's `idle`. OMP/Pi turn events only update the embedded legacy mirror (see `agent://BusyIdleRootCause`).

- **Request:** `{"seat": string, "native_session"?: string, "pane"?: string, "state": "working"|"idle"}`.
  - Binding evidence is the same as for `/v1/fyi/claim`: at least one of `native_session` or `pane`, and it must match the seat.
  - A tombstoned seat is refused.
- **Success `data`:** `{"seat":"pij-x","state":"working"|"idle","changed":bool}`. The daemon persists `SeatDescriptor.state`, so `pij state` shows `working` during a turn and `idle` after it.
- **Clients** publish `working` at turn start and `idle` at turn end, with `agent_end` as an idempotent idle repair.
  - Publications are serialized per session, so a late `working` can never land after `idle`.
  - Failures never break a turn: log them. A 404 means an older daemon, so stop trying for this runtime.
- **OMP/Pi:** `turn_start` → working; `turn_end` and `agent_end` → idle. Use the harness session id as `native_session`.
- **Copilot:** native `assistant.turn_start` → working; `assistant.turn_end` or `session.idle` → idle.
- **Claude:** not in this plan's scope. The result is recorded in the evidence.
