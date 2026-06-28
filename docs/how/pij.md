# pij — peer pi-session messaging

`pij` lets two (or more) running **pi sessions** in the same project talk to each
other and observe each other's work in near-real-time. It is a thin file-backed
message bus + activity stream — no server, no daemon. Sessions discover each other
through `~/.pij/`, message via a fire-and-forget channel, and read each other's
event streams.

## The point: cheap generation, expensive review

```
PARENT  = expensive model (Opus-class)  → mostly INPUT tokens  (reads + reviews)
WORKER  = cheaper model   (mid model)   → mostly OUTPUT tokens (generates code)
```

A **parent** reviewer instructs a cheaper **worker** generator, then follows the
worker's event stream incrementally (`pij tail --since N`) — paying input tokens
only for *new* activity, never re-ingesting the full context — and fires targeted
feedback. High-quality direction + review at a fraction of doing it all on the
expensive model.

---

## Setup

The extension (`.pi/extensions/pij/`) auto-loads in any pi session started from
this repo. It announces the session's id at boot and serves inbound messages.

The **`pij` CLI** is the act+observe surface:

```bash
just pij list --here          # in-repo, no global install
# or, after `just install` (which runs `npm link`):
pij list --here               # bare `pij` on PATH from any cwd
```

- **`PIJ_HOME`** (default `~/.pij`) overrides where descriptors, event logs, and
  inboxes live — set it to sandbox a test/smoke run.
- **`PIJ_SESSION_ID`** is exported into each session's env at boot so a `pij`
  invocation from inside that session resolves "self" unambiguously even when two
  sessions share a folder.

---

## CLI reference

`pij <verb> [args] [--json]` — every verb accepts `--json` for machine output.

| Verb | Usage | Does |
|------|-------|------|
| `whoami` | `pij whoami` | Print this session's id (resolves via `PIJ_SESSION_ID` → lone local session → `E-AMBIG`). |
| `list` | `pij list [--here]` | List known sessions (id, state, liveness, folder). `--here` filters to the current folder; self is marked `★`. |
| `send` | `pij send <id> "<text>"` · `pij send <id> --command <name>` | Message a peer (your id is stamped automatically). `--command <compact\|new\|reload>` runs an allow-listed session-control command on the peer (see [Remote session control](#remote-session-control)). `--wait [ms]` blocks for the delivery receipt. |
| `tail` | `pij tail <id> [--since N] [--type T] [--lines N] [--follow]` | Read a peer's event stream. `--since N` returns only `seq>N`; `--type` filters by event type; `--follow` streams new events. |
| `state` | `pij state <id>` | Report the peer's state (`working`/`idle`) + liveness (`active`/`stale`/`dead`) + latest-event age — without parsing the stream. |
| `path` | `pij path <id> [--events\|--state\|--dir]` | Print the on-disk path (events file / descriptor / data dir) for direct reading with file tools. |
| `spawn` | `pij spawn --harness pi\|claude\|copilot [--model <m>] [--task "<t>"]` | Spawn a colleague in a tmux pane — one uniform surface for every harness. `pi` self-registers at boot (no daemon); `claude`/`copilot` are daemon-bound. See `pij spawn --help`. |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | OK |
| `2` | bad target: `E-NOID` (no such session) / `E-SELF` (sent to self) / `E-CMD` (unknown command) / `E-AMBIG` (can't resolve self) |
| `1` | `E-DEAD` (peer's process is gone) |
| `3` | `E-NOREG` (no `~/.pij` registry yet) |
| `64` | `E-ARG` (malformed invocation — unknown flag, bad arity, non-numeric `--since`, `text` + `--command` together, …) |

---

## The message + receipt protocol

- **Raw body, framed once on receipt.** `pij send w3 "hi"` writes the raw text; the
  *receiver* frames it as `[pij from <senderId>] hi` when it injects — so a reply
  needs no lookup (the sender id is right there).
- **Idle vs busy.** An idle peer receives the message immediately (triggers a turn);
  a busy/streaming peer receives it via *steer* after its current turn (never a
  mid-stream interrupt).
- **Commands.** `--command <compact|new|reload>` are the allow-listed session-control
  commands; unknown names are rejected (`E-CMD`) before any pi call. See
  [Remote session control](#remote-session-control) for how each one fires.
- **Delivery receipts (observe-only).** The sender gets a `delivered` receipt (idle
  peer) or `queued` → `delivered` (busy peer). Receipts ride back as ordinary
  `kind:"receipt"` messages and are **recorded as events** on the sender — they are
  never injected, so they never wake or bill the parent. See them with
  `pij tail <self> --type receipt`.

---

## Remote session control

`pij send <id> --command <name>` drives one of three session-control commands in the
target session. A bare `/compact` | `/reload` | `/new` **text** body auto-routes to
this path too (so `pij send <id> "/compact"` executes instead of leaking the text
into the peer's LLM). The three commands split by **which pi context they need** —
which determines how reliable they are:

| Command | Effect on the peer | Reliability |
|---------|--------------------|-------------|
| `compact` | Compacts the peer's context (summarize-in-place) | ✅ **Always works, no arming.** `compact()` is on the long-lived `ExtensionContext`, so the background receiver runs it on arrival. Use freely. |
| `new` | Starts a fresh session in the peer | ⚠️ **Arm once, fire once.** Needs a captured command context; one-shot, so the disarm below doesn't bite. |
| `reload` | Reloads the peer's extensions/skills/prompts/keybindings | 🔻 **Best-effort; disarms itself (see below).** For a reliable reload, have the peer's human type `/reload` directly. |

### Why `new`/`reload` need "arming" — and why `reload` keeps disarming

pi only exposes `newSession()` / `reload()` on an **`ExtensionCommandContext`**, which
it hands out *only inside a registered slash-command handler* — never on the
long-lived context the background receiver holds, and `sendUserMessage()` can't
dispatch a slash command (an injected `/…` goes to the peer's **LLM** as text, not
to pi). So pij **captures that command context the moment the target runs `/pij`**
and re-routes remote `new`/`reload` onto it.

The catch with `reload` specifically: **reload re-runs the extension**, which resets
the captured handle (`commandControl`) back to un-armed — and pi also marks the old
command context *stale* on reload, so it can't be persisted across the boundary.
**A remote reload therefore disarms the peer as it runs**, and the *next* one defers
until someone re-arms. This is a pi limitation, not a pij bug; there is no
extension-side workaround.

- **Arm:** a human runs `/pij` once in the target session.
- **`compact`:** ignores all of this — runs on arrival, every time.
- **`new`:** arm once, fire once (you don't repeat it, so disarm is moot).
- **`reload`:** prefer the peer's human typing **`/reload`** directly. Remote
  `--command reload` works *once* after each `/pij`, then needs re-arming — don't
  expect repeated hands-free remote reloads.
- **Un-armed = deferred, not lost:** an un-armed `new`/`reload` is queued and the peer
  is woken with a notice that asks its **human operator** to run `/pij` (an agent
  cannot run a slash command itself). It applies on the next `/pij`.
- **Receipts tell you which happened:** the peer records `{"command":"reload",
  "executed":true}` when it fired, or `{…,"deferred":true}` when it was queued —
  read them with `pij tail <peer> --type receipt`.

### What `/pij` is for

Given the above, `/pij` earns its place as **(a) an in-session status readout**
(`pij: <id> · role=<role> · peers <n> · events <n>` — the only in-session view of
your own pij identity + live counts) and **(b) the arming gate** for the one-shot
`new` and the occasional `reload`. It is **not** needed for `compact` or for any of
the messaging/observability verbs (`send`/`tail`/`state`/`list`) — those always work.

---

## Observation: the event stream

Every session records its activity to `~/.pij/<id>/events.ndjson` — one JSON line
per event with a strictly monotonic `seq` and an ISO-8601 `timestamp`. Captured
types: `tool_call`, `tool_result`, `message`, `receipt`.

- **Incremental review**: `pij tail w3 --since 42` returns only events after seq 42.
- **Stall detection**: `pij state w3` surfaces the newest event's age — a
  `working` session whose newest event keeps aging is wedged (`active`/`stale`),
  vs a crashed one (`dead`, pid gone).
- **Deep dive**: `pij path w3 --events` prints the file path; read it directly with
  your file tools for exact tool args/outputs.

### Commanding a peer: reading what it's doing

A reviewer driving a worker can reconstruct exactly what the worker is up to from
its stream — last few turns, full history, tool calls + args, filtered slices:

```bash
# Native CLI filters (no extra tooling)
pij tail w3 --lines 5                  # last 5 events (any type)
pij tail w3 --type tool_call --lines 8 # just what it ran, recently
pij tail w3 --type tool_result         # just the outputs it got back
pij tail w3 --since 200 --type message # new assistant/user turns since seq 200

# Rich parse via the raw log (pij path w3 --events) + jq
EV=$(pij path w3 --events)
jq -r '.type' "$EV" | sort | uniq -c            # whole-history shape by type
jq -r 'select(.type=="tool_call")
       | "\(.seq)  \(.data.toolName)  \(.data.input.command // .data.input.path)"' "$EV"
jq -r 'select(.type=="message" and .data.message.role=="assistant")
       | .data.message.content[]? | select(.type=="text") | .text' "$EV" | tail   # its words
jq -r 'select(.type=="message" and .data.message.role=="user")
       | .data.message.content[]? | select(.type=="text") | .text' "$EV"          # what it was tasked with
```

The event envelope is `{seq, type, timestamp, data}`; `data` is the captured pi
event (`tool_call`/`tool_result` carry `toolName`+`input`/`content`; `message`
carries `message.role`+`message.content[]`). This is the same data the parent pays
*input* tokens to review — but only the new slice (`--since N`), never the whole
context.

---

## Parent/worker workflow

> **Session identity.** A session's `pij-<id>` is derived from pi's own session
> id, so it is stable across `/reload` and `/resume` but a **fresh id on `/new`
> and `/fork`** (a `/new` session is a new peer, not the old one). When pi
> exposes no session id (SDK/tests) it falls back to `pij-<pid>`.

The canonical loop (roles are fixed per session at boot):

| # | Actor | Action | Command |
|---|-------|--------|---------|
| 1 | Parent | Instruct the worker with a scoped task + a done-signal contract | `pij send w3 "…"` |
| 2 | Worker | Work; every tool call/result lands in its event stream | (automatic) |
| 3 | Parent | Follow incrementally; pay input only for new events | `pij tail w3 --since N` |
| 4 | Parent | If off-track, fire targeted feedback (steers if busy) | `pij send w3 "fix …"` |
| 5 | Worker | On completion, message the parent the agreed done-signal | `pij send a1 "done — …"` |
| 6 | Parent | Final verify against `tool_result`/tests | `pij tail w3 --since N --type tool_result` |
| 7 | Parent | If worker context heavy, request `compact` (always works); to refresh code, prefer the worker's human typing `/reload` (remote `reload`/`new` need arming) | `pij send w3 --command compact` |

**Use cases**: delegated implementation (headline), live code review, stuck-worker
rescue (`state` shows `working` but the age grows, or `dead`), context hygiene
(`--command compact`), deep-dive read (`path --events`).

**Done/failure is convention, not protocol**: the parent's instruction *names* the
done-signal ("reply `done` with test output"); the event stream is the source of
truth, messages are nudges.

---

## AGENTS.md self-announce snippet

Add this to a project's `AGENTS.md` so a fresh agent knows pij exists even before
the runtime boot announce fires:

```md
## pij — talk to peer pi sessions

If another pi session is running in this repo, you can message and observe it:
- `pij list --here` — discover peer sessions in this folder (★ = you)
- `pij send <id> "<text>"` — message a peer (your id is stamped automatically)
- `pij send <id> --command <compact\|new\|reload>` — run an allow-listed session-control command on a peer
- `pij tail <id> --since N` — read a peer's new events (cheap incremental review)
- `pij state <id>` — a peer's working/idle + liveness + latest-event age
- `pij path <id> --events` — the peer's events.ndjson path for direct reading

You are stamped with a stable id at boot (`pij whoami`). Full guide: docs/how/pij.md
```

At runtime, the extension injects an equivalent announce at session start:

```
You are pij session <id> (<role>).
Peers reach you via: pij send <id> "..."
To message a peer: pij send <id> "..." (your id is stamped automatically).
Discover peers: pij list --here   ·   Observe one: pij tail <id> / pij state <id>.
```
