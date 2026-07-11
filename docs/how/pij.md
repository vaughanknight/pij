# pij — peer pi-session messaging

`pij` lets two (or more) running **pi sessions** in the same project talk to each
other and observe each other's work in near-real-time. It is a thin file-backed
message bus + activity stream — no server, no daemon. Sessions discover each other
through `~/.pij/`, message via a fire-and-forget channel, and read each other's
event streams.

## Related workflow guides

| Guide | Use it when |
|---|---|
| [pij prime](./pij-prime.md) | Govern multiple plan-owning streams through one o-prime seat and file-backed government |
| [pij orchestration batons](./pij-orchestration-baton.md) | Serialize shared resources with atomic leases, pushed grants, explicit return/reclaim, and holder alerts |

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
- **`PIJ_PARENT_ID`** is set on a *spawned* session to the pij-id of the session
  that spawned it (its parent). Together with `PIJ_SESSION_ID` (own id) this gives
  a spawned agent both "who am I" and "who spawned me" without any resolution
  step — uniform across `pi`, `claude`, `copilot`, and `codex` spawns. Absent on a
  session with no resolvable spawner (e.g. a top-level boot).

---

## CLI reference

`pij <verb> [args] [--json]` — every verb accepts `--json` for machine output.

| Verb | Usage | Does |
|------|-------|------|
| `whoami` | `pij whoami` | Print this session's id (resolves via `PIJ_SESSION_ID` → lone local session → `E-AMBIG`). |
| `list` | `pij list [--here]` | List known sessions (id, state, liveness, folder). `--here` filters to the current folder; self is marked `★`. |
| `send` | `pij send <id> "<text>"` · `pij send --to <id> --to <id> "<text>"` · `pij send <id> --command <name>` | Message one peer or fan the same text out to two or more peers in flag order (your id is stamped automatically). Broadcast is text-only and reports one independent result per recipient. `--command <compact\|new\|reload>` runs an allow-listed session-control command on one peer (see [Remote session control](#remote-session-control)). `--wait [ms]` blocks until every successful send has a terminal receipt or the global timeout expires. |
| `tail` | `pij tail <id> [--since N] [--type T] [--lines N] [--follow]` | Read a peer's event stream. `--since N` returns only `seq>N`; `--type` filters by event type; `--follow` streams new events. |
| `state` | `pij state <id>` | Report the peer's state (`working`/`idle`) + liveness (`active`/`stale`/`dead`) + latest-event age — without parsing the stream. |
| `path` | `pij path <id> [--events\|--state\|--dir]` | Print the on-disk path (events file / descriptor / data dir) for direct reading with file tools. |
| `spawn` | `pij spawn --harness pi\|claude\|copilot\|codex [--model <m>] [--task "<t>"]` | Spawn a colleague in a tmux pane — one uniform surface for every harness. `pi` self-registers at boot (no daemon); `claude`/`codex` are daemon-bound via transcript discovery, `copilot` via a deterministic `--session-id`. See `pij spawn --help`. |
| `adopt` | `pij adopt "$TMUX_PANE" --harness <h> [--session-id <native-id>]` | Register an existing external-client pane. For restart re-attachment, `--session-id` is authoritative and recovers the prior pij-id; newest-artifact discovery is only an initial-adopt fallback. |
| `orchestration baton` | `pij orchestration baton define\|list\|show\|request\|grant\|return\|reclaim` | Coordinate machine-wide exclusive resources with an atomic single-holder lease, discretionary purpose queue, receipt-aware notices, stale-pin acknowledgement, blocked-time measurement, and alert-never-auto-reclaim liveness. |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | OK |
| `2` | bad target: `E-NOID` (no such session) / `E-SELF` (sent to self) / `E-CMD` (unknown command) / `E-AMBIG` (can't resolve self) |
| `1` | `E-DEAD` (peer's process is gone), or at least one preflight-valid broadcast delivery failed |
| `3` | `E-NOREG` (no `~/.pij` registry yet) |
| `64` | `E-ARG` (malformed invocation — unknown flag, bad arity, non-numeric `--since`, `text` + `--command` together, …) |

---

## Restart and re-adoption identity

A pij identity belongs to the underlying native session, not its temporary process
or tmux pane. Pi supplies its exact native session id through the extension; external
clients use `(harness, native session id)`:

```bash
pij adopt "$TMUX_PANE" --harness claude --session-id "$CLAUDE_CODE_SESSION_ID"
```

The first attachment atomically claims a two-way durable mapping under `PIJ_HOME`
and snapshots role/creator/history metadata; a later attachment of the same exact
native identity reuses the original `pij-id` and metadata while replacing
pane/PID/cwd/lifecycle. Claims stage and fsync complete temp files before no-replace
publication; duplicate, colliding, or occupied ids fail with `E-AMBIG` instead of
overwriting a peer. Omitting `--session-id` retains newest-artifact discovery for
initial adoption only. For Codex, an authoritative id must resolve to an exact readable
rollout path or adoption fails with `E-NOID`.

---

## The message + receipt protocol

- **Raw body, framed once on receipt.** `pij send w3 "hi"` writes the raw text; the
  *receiver* frames it as `[pij from <senderId>] hi` when it injects — so a reply
  needs no lookup (the sender id is right there).
- **Ordered broadcast.** `pij send --to w3 --to z9 "hi"` preflights the full target
  set before delivering anything, then writes the identical raw body once to each
  recipient in flag order. Human output prints one recipient row; JSON is
  `{"from":"…","results":[…]}` with independent message ids, receipt/liveness
  metadata, or per-target errors. A later target is still attempted after a
  delivery-port failure.
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
  `pij tail <self> --type receipt`. Broadcast `--wait` correlates each recipient's
  message id, prefixes receipt changes with the target, and names any unresolved
  targets if the single global timeout expires.

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
- `pij send --to <id> --to <id> "<text>"` — send the same text once to each named peer
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

---

## Fail-loud model layer

Three layers of observability for model-related failures in spawned sessions.

### 1. Model discovery — `pij models`

List all models known to pij (pi-first, then copilot seed, claude aliases, codex snapshot):

```sh
pij models                          # all known models (table)
pij models fugu                     # fuzzy filter (shows fugu, fugu-ultra)
pij models --harness claude         # only claude aliases
pij models --harness copilot        # copilot models seeded from pi's github-copilot section
pij models --json                   # machine-readable JSON array
```

Models labelled `*` are **unverified** (best-effort alias lists, not confirmed by a live API).

### 2. Spawn-time validation — warn-don't-block

When `pij spawn --model <id>` names an unknown model, pij prints a warning **but still spawns immediately** — the pij-id is returned right away, binding proceeds normally:

```
warning: unknown model 'claude-zz-99' (did you mean 'claude-sonnet-4-6'?) — spawn continues; confirm the id is correct
```

The spawn is never blocked. If the model truly does not exist, the session will fail at first inference and the fail-loud heartbeat (layer 3) notifies the creator.

### 3. Fail-loud heartbeat — whole-life stalled/dead push

Once a session is bound, the daemon monitors it every tick and pushes to the creator **once per transition**:

| Event | Message to creator |
|-------|--------------------|
| Session stalled (working + silent past 60s) | `⏸ <id> has gone quiet (stalled…)` |
| Session dead (pid exited) | `💀 <id> has exited (reason: <code>)` |

Machine-stable reason codes: `model-not-supported` · `auth` · `quota` · `stalled` · `dead` · `unknown`

The bound model (captured from first inference) and reason code are surfaced in `pij state <id>` and `pij state <id> --json`:

```sh
pij state pij-worker          # shows model + failure reason in human text
pij state pij-worker --json   # boundModel, failureReason fields
```

Per-harness detection (on captured pane text, never stderr):
- **claude**: `API Error: 400` → `model-not-supported` (also triggers pane-dead via `classifyReadiness`)
- **copilot/pi**: first-inference error text → `model-not-supported`

The first-inference gate (deterministic-bind path only) defers the bound-notice until the init-inject turn completes without a model error — so the creator is never told a session is "ready" when it immediately 400d.
