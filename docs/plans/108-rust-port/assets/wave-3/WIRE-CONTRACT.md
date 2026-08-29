# v1 wire contract — the seam between the daemon and its in-process clients

**Owner**: PM (`pij-revolutionary-lungfish`). Landed 2026-08-30, before either unit
that consumes it could guess at it.

`u-extension` cannot register against routes that do not exist yet, and
`u-daemon-http` cannot serve a registration whose payload nobody has specified.
That is a seam, and a seam belongs to one mind before fan-out — tenet 2. Both
units build to THIS document; neither invents its half.

Anything here that turns out to be wrong is a PM ruling to change, not a unit's
local decision.

## Envelope (R7, unchanged)

Every response is `{ok, command, v, data, meta}` with `v = 1`. A reader that sees
a `v` it does not understand **refuses the payload whole** rather than
half-reading it. `Event.seq` is never in an event body (`#[serde(skip)]`) — a
cursor is a property of the stream and rides the FRAME.

## Auth (req-0007, unchanged)

`Authorization: Bearer <key>` on **every** route including `/health`, enforced as
middleware over the whole router with no exemption list. The local key is
per-boot, 0600, written before bind. Federation adds a persistent per-peer key and
an inbound RING (local + configured peers) — see the wave-3 http packet, D4.

## Routes

| method | path | body | does |
|---|---|---|---|
| `GET` | `/health` | — | liveness + build + offline + machine alias |
| `POST` | `/v1/register` | `Registration` | one registry write; returns the accepted descriptor |
| `POST` | `/v1/send` | `SendRequest` | exactly ONE durable enqueue; returns a `Receipt` |
| `GET` | `/v1/seats` | — | one `Registry::list` |
| `GET` | `/v1/events` | — | NDJSON stream: Hello line, then frames |

### `POST /v1/register`

```json
{
  "id": "pij-revolutionary-lungfish",
  "harness": "omp",
  "folder": "/abs/path",
  "pane": "%279",
  "pid": 25020,
  "proc_start": 20260829103052,
  "spawn_id": "s1787962695612-63981",
  "model": "github-copilot/gpt-5.6-sol-fast",
  "provider": "github-copilot",
  "effort": "high",
  "parent": "pij-dominant-vicuna",
  "relay": false
}
```

Rules, each with the incident behind it:

* **`pid` and `proc_start` travel together or not at all.** A pid alone is not an
  identity; the store already refuses half an identity. `proc_start` is the packed
  `YYYYMMDDhhmmss` that `ProcLiveness` produces (C-locale `ps -o lstart=`), so the
  extension and the daemon compare the same number.
* **Every optional field is genuinely optional.** A seat a human adopted has no
  `spawn_id`; absent must stay absent, never an empty string.
* **The daemon decides admission, not the caller.** The payload is EVIDENCE;
  `core::admission` rules on it (subagents inheriting `PIJ_*` can claim an id but
  cannot manufacture bind evidence). A refused registration returns `ok: false`
  with the refusal reason — which is a fact the caller must surface, not retry.
* Response `data` is the accepted `SeatDescriptor` as stored, so the caller learns
  what the authority actually recorded rather than assuming its own payload won.

### `POST /v1/send`

```json
{ "from": "pij-a", "to": "pij-b", "body": "…", "msg_id": "…" }
```

`to` may be `<seat>` (local, always) or `<seat>@<machine-alias>` (federated).
The route performs **one enqueue** — job kind `delivery:<seat-id>` via
`core::delivery::delivery_kind` — and returns a `Receipt { msg_id, outcome, at }`
whose outcome is `Queued`. The drain worker does the rest, off the request path
(R4: a handler does one cheap statement or enqueues).

### `GET /v1/events` — frames

The stream opens with the Hello line, then one JSON object per line:

```json
{"machine": "<alias>", "cursor": 42, "event": { "v":1, "at":…, "kind":"…", "seat":"…", "payload":"…" }}
```

* `cursor` is the store-assigned sequence for `machine`. **Per machine**, because
  each daemon has its own `Seq`; a federated consumer keeps a MAP, not a scalar.
* Query: absent `since` ⇒ live-only attach (`subscribe_live`); `since=N` ⇒
  `subscribe(Some(Seq(N)))` for the local machine.
* **An unknown `kind` is forwarded, not dropped** (R7). The daemon deliberately
  emits one probe kind so every consumer is written against a stream that already
  contains one.

### Pushed turns and replies

* A pushed turn is an event of kind **`message.pushed`** whose `seat` is the
  RECIPIENT and whose payload carries `{msg_id, from, body}`. A client filters the
  stream by its own seat id; the daemon does not open a per-seat stream.
* A reply is an ordinary `POST /v1/send` from the recipient back to `from`,
  carrying the same `msg_id` in its payload as `in_reply_to`. **Correlation is the
  msg_id**, which is also what the audit event keys on, so a message and its
  answer can be joined without guessing.

## Generation detection (u-extension)

The extension must distinguish three states and **never silently degrade**:

| state | discriminator | what to do |
|---|---|---|
| pij-rs daemon | authenticated `GET /health` answers a `v:1` envelope | use the HTTP wire |
| legacy TS daemon | `/health` refuses connection **AND** the TS registry/channel files exist under `pijHome` | use the legacy file wire |
| no daemon | `/health` refuses connection **AND** no TS registry files | LOUD named error |

Connection-refused alone is ambiguous, which is `u-extension`'s D4 and a real
defect in my packet: the positive legacy discriminator is the **presence of the TS
file surface**, not the absence of HTTP. A `v` newer than this build is a NAMED
wrong-generation error that says which generation was found and what to do.

Address and key: `PIJ_RS_ADDR` else `127.0.0.1:7461`; key from
`<state-dir>/daemon.key` where state dir is `PIJ_RS_STATE_DIR` else
`$HOME/.pij-rs`. Both already exist in `crates/cli`.

## Who owns what

* `u-daemon-http` — implements `/v1/register`, `/v1/send`, `/v1/seats`,
  `/v1/events` and the frame shape above.
* `u-extension` — consumes them, and records the fixtures under
  `crates/testkit/fixtures/wire/` (its packet is amended to allow that path).
* Neither invents a field the other has not seen. A shape either unit wants
  changed comes to the PM.
