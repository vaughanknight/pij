# pij — peer pi-session messaging

`pij` lets two (or more) running agent sessions in the same project talk to each
other and observe each other's work in near-real-time. It is a thin file-backed
registry, durable message bus, and activity stream. Pi sessions consume their
inbox in-process; tmux-bound Claude, Copilot, and Codex peers are pushed by the
pij daemon; external sessions without tmux pull through `pij inbox`.

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
New identities use `pij-<adjective>-<animal>` (for example
`pij-arbitrary-locust`). Existing opaque ids are never renamed and remain fully
addressable.

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
- **`PIJ_PARENT_ID`** is a spawn/adopt/export-time environment snapshot used by
  the current process and inherited by future children. `pij link` changes the
  registry descriptor's `parentId`; observe current structural truth with
  `pij tree`. Linking cannot retroactively mutate a running process environment.
  An explicit-root export emits no parent assignment, so run
  `unset PIJ_PARENT_ID` first when evaluating into a shell that may carry a stale
  value. `spawnedBy` remains separate close-authorization ownership and is never
  rewritten by structural linking.

### Push and pull delivery

Delivery ownership is explicit:

- **Pi** is push-first through its in-process receiver.
- **Tmux-bound Claude/Copilot/Codex** are push-first through the daemon.
- **External sessions without tmux** are pull-owned. Run `pij inbox --wait`;
  the first inbox command auto-registers the current Claude, Copilot, or Codex
  session as `deliveryMode:"pull"`. Use `--wait <ms>` for a finite wait or omit
  the value to block indefinitely.

The daemon never drains, buffers, heartbeats, or injects a pull-owned inbox.
For an explicit setup step before sending, run `pij inbox register`; subsequent
`pij inbox`, `pij inbox check`, and `pij inbox --wait` reuse that identity.

---

## CLI reference

`pij <verb> [args] [--json]` — every verb accepts `--json` for machine output.

| Verb | Usage | Does |
|------|-------|------|
| `inbox` | `pij inbox [check\|register] [--wait [ms]]` | Pull unread messages for the current external session. First use auto-registers it as pull-owned; `--wait` blocks indefinitely and `--wait <ms>` uses one finite timeout. Receipt envelopes become events and never print as user messages. |
| `whoami` | `pij whoami` | Print this session's id (resolves via `PIJ_SESSION_ID` → lone local session → `E-AMBIG`). |
| `list` | `pij list [--prime] [--here]` | List known sessions (id, prime marker, state, liveness, folder). `--prime` is current-only: it keeps explicit `prime:true` sessions and composes with `--here`. Self is `★`; current prime is `P`; retired old-prime is `O`. JSON includes `prime:boolean` and `oldPrime:boolean`. |
| `send` | `pij send <id> "<text>"` · `pij send <id> --body-file <path\|->` · `pij send --to <id> --to <id> "<text>"` · `pij send <id> --command <name>` | Message one peer or fan the same text out to two or more peers in flag order (your id is stamped automatically). **For relayed or untrusted text use `--body-file <path\|->`** — a double-quoted body is expanded by your shell before pij runs. A send with nothing the target can render is refused (`E-EMPTY`), never given a receipt. Broadcast is text-only and reports one independent result per recipient. `--command <compact\|new\|reload>` runs an allow-listed session-control command on one peer (see [Remote session control](#remote-session-control)). `--wait [ms]` blocks until every successful send has a terminal receipt or the global timeout expires. |
| `tail` | `pij tail <id> [--since N] [--type T] [--lines N] [--follow]` | Read a peer's event stream. `--since N` returns only `seq>N`; `--type` filters by event type; `--follow` streams new events. |
| `state` | `pij state <id>` | Report the peer's state (`working`/`idle`) + liveness (`active`/`stale`/`dead`) + latest-event age — without parsing the stream. |
| `report now` | `pij report now "<did>" "<next>" [--state <word>] [--note "<text>"] [--project <slug>]` | Record this registered seat's now/next as one `status` event; with `--state`, write `state-set` then `status` under one platform lock. `--note` is valid only for `question`/`blocked`. |
| `report question` | `pij report question "<what I need from you>" [--assignment <id>]` | Declare a human-facing question and stamp its bounded text on the same assignment. |
| `report blocked` | `pij report blocked "<what I am waiting on>" [--assignment <id>]` | Declare an external blocker and stamp its bounded text on the same assignment. |
| `report state` | `pij report state <state> [--assignment <id>] [--refs a,b,…]` | Declare this registered seat's assignment-scoped semantic state. A seat with no assignment materializes its fixed general assignment. |
| `report clear` | `pij report clear [--assignment <id>]` | Remove this registered seat's declared semantic state while keeping its task, event history, and mechanical/runtime state. |
| `report verify` | `pij report verify <node> [--assignment <id>]` | Supervisory verification: stamp the registered caller as `verifiedBy` on another node's latest `done` claim. |
| `path` | `pij path <id> [--events\|--state\|--dir]` | Print the on-disk path (events file / descriptor / data dir) for direct reading with file tools. |
| `tree` | `pij tree [<id> \| --global] [--activity <v>] [--liveness <v>] [--lifecycle <v>] [--all]` | Render the current Git repository forest by default, the global registry with `--global`, or an arbitrary subtree with `<id>`. Filters are repeatable; `--json` returns `{"roots":[...]}`. |
| `link` | `pij link <child> --parent <parent> [--role <pm\|worker>] \| --root` | Reparent a session or make it an explicit structural root. A governor may designate role in the same placement call. Validates unknown ids, self-links, and cycles before writing; never changes close ownership. |
| `spawn` | `pij spawn --harness pi\|claude\|copilot\|codex [--model <m>] [--task "<t>"] [--plan-id <id>]` | Spawn a colleague in a tmux pane — one uniform surface for every harness. An explicit plan id is exported as `HARNESS_PLAN_ID` + `PIJ_PLAN_ID` and stamped on the seat descriptor. `pi` self-registers at boot (no daemon); `claude`/`codex` are daemon-bound via transcript discovery, `copilot` via a deterministic `--session-id`. See `pij spawn --help`. |
| `adopt` | `pij adopt "$TMUX_PANE" --harness <h> [--parent <id>] [--id <existing>] [--session-id <native-id>]` | Register an existing external-client pane and optionally place it structurally under an existing session. Parent validation happens before reservation or descriptor writes. `--id` is reattachment-only: it must name an existing descriptor or retained reservation, otherwise `E-NOID`. |
| `attest` | `pij attest <id> --plan-id <id>` | Add or correct an existing seat's explicit opaque plan id. Absent means unattested; pij never derives it from project paths or ambient environment. |
| `orchestration baton` | `pij orchestration baton define\|list\|show\|request\|grant\|return\|reclaim` | Coordinate machine-wide exclusive resources with an atomic single-holder lease, discretionary purpose queue, receipt-aware notices, stale-pin acknowledgement, blocked-time measurement, and alert-never-auto-reclaim liveness. |
| `orchestration prime` | `pij orchestration prime set\|retire\|unset [<id>]` | Mark a current prime, retire it into old-prime history, or clear both markers. Omitted ids require exact self-resolution; see [pij prime](./pij-prime.md#registry-designation). |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | OK |
| `2` | bad target: `E-NOID` (no such session) / `E-SELF` (sent to self) / `E-CMD` (unknown command) / `E-AMBIG` (can't resolve self) |
| `1` | `E-DEAD` (peer's process is gone), or at least one preflight-valid broadcast delivery failed |
| `3` | `E-NOREG` (no `~/.pij` registry yet) |
| `64` | `E-ARG` (malformed invocation — unknown flag, bad arity, non-numeric `--since`, `text` + `--command` together, …) |

---

## Semantic state declarations

Everything under `report` is a first-person claim about yourself.
`pij report state <state>` records an assignment-scoped declaration from the
closed semantic vocabulary. `pij report question "<text>"` and
`pij report blocked "<text>"` carry the two human-facing note states. Actively
working has no semantic state word; absence is the honest expression by design.

Inline markdown is supported in report text (`` `code` ``, `**bold**`,
`[links]`) and survives whitespace collapsing. Block markdown is not: newlines
are refused. Use single shell quotes around text containing backticks.

`pij report clear [--assignment <id>]` removes the declaration without creating
an implicit general assignment, closing the task, or changing `systemState`. It
appends one journaled `state-cleared` spine event and keeps earlier assignment
history intact. A clear of an already undeclared assignment is an `E-ARG`
refusal, not a silent success.

Report writes require the calling seat to resolve to a registered descriptor;
`PIJ_SESSION_ID` alone cannot attribute a claim to a missing seat.

---

## Session forests, repositories, and ownership

Four independent descriptor axes answer different questions:

| Axis | Field / projection | Meaning |
|---|---|---|
| Structure | `parentId` / `effectiveParentId` | Where the session appears in the forest. An id is an explicit parent, `null` is an explicit root, and absence reads through the legacy `spawnedBy` fallback without migration writes. |
| Close ownership | `spawnedBy` | Which creator may close the peer without `--force`. `pij link` never changes it. |
| Repository | `gitCommonDir` | Canonical absolute Git common directory. A main checkout and all linked worktrees share one repository key. |
| State | activity + liveness + lifecycle | Activity is `working\|idle\|done`; liveness is `active\|stale\|dead\|dissolved`; lifecycle is `pending\|ready\|bound\|failed\|dissolved`. |

### Tree selectors and filters

```bash
pij tree                                      # current Git repository, across linked worktrees
pij tree --global                             # all visible registry sessions
pij tree <id>                                 # arbitrary subtree, independent of cwd/repository
pij tree --activity working --activity idle   # OR within activity
pij tree --liveness active --lifecycle bound  # AND across axes
pij tree --all --json                         # include dead/dissolved history
```

Bare `tree` requires a Git repository identity; outside Git, use `--global` or an
explicit subtree id. Repository identity is captured/refreshed during spawn,
registration, and reattachment. Dead/dissolved history is hidden by default and
is included by `--all` or an explicit `dead`/`dissolved` liveness/lifecycle
filter. Repeating one filter flag ORs its values; different axes compose with AND.

Human output uses `P` for current prime and `O` for old-prime, renders dissolved
lifecycle as `closed`, and annotates `[orphan:<id>]`, `[filtered-parent:<id>]`,
or `[cycle→<id>]`. JSON is additive and stable: raw descriptor fields stay on
each node beside `effectiveParentId`, activity, liveness, optional problem data,
and `children`; the document root is `{"roots":[...]}`. Human and JSON rendering
use explicit traversal stacks, so corrupt/cyclic or thousands-deep history stays
finite without recursive stack overflow; very deep human indentation is capped
and marked with an ellipsis while retaining every node.

### Linking and adoption

```bash
pij link <child> --parent <parent> [--role <pm|worker>] [--json]
pij link <child> --root [--json]
pij adopt "$TMUX_PANE" --harness <h> --parent <parent>
```

`link` changes only `parentId`. Unknown child/parent ids, self-parenting, and
effective-parent cycles fail before any write. The JSON receipt is
`{"id":"…","parentId":"…"|null,"changed":true|false}`. Automatic spawn records
the caller as structural parent and close owner; adopted panes need `--parent`
or an explicit post-identity `link` when they should join an existing hierarchy.
Role is designated by the governor that gives a seat work, never inferred or
self-declared by the seat; pass `--role pm|worker` on that placement call.

---

## Restart and re-adoption identity

A pij identity belongs to the underlying native session, not its temporary process
or tmux pane. Pi supplies its exact native session id through the extension; external
clients use `(harness, native session id)`:

```bash
pij adopt "$TMUX_PANE" --harness claude --session-id "$CLAUDE_CODE_SESSION_ID"
```

The first attachment atomically claims a memorable primary id and a two-way durable
mapping under `PIJ_HOME`; a later attachment of the same exact native identity reuses
the original id and metadata while replacing pane/PID/cwd/lifecycle. Existing opaque
descriptors and durable mappings win before allocation, so upgrades never rename them.

Candidates come from the exact-pinned adjective/animal corpus. A collision advances
deterministically to the next two-word pair; no suffix or overwrite is allowed.
Control-plane and agent spawns reserve the id before opening the pane. Known launch
failure releases only that launch owner's reservation. A crash-orphan reservation is
retained even if the short-lived spawner PID is dead, because the child may already be
running; recover it explicitly with `adopt --id <reserved-id>`. Omitting `--session-id`
retains newest-artifact discovery for initial adoption only. For Codex, an authoritative
id must resolve to an exact readable rollout path or adoption fails with `E-NOID`.

Copilot adoption never guesses from the globally newest
`~/.copilot/session-state/<uuid>` directory: `/new` leaves older global sessions
present, so mtime cannot identify the current pane. The current Copilot process must
provide a UUID in `COPILOT_AGENT_SESSION_ID`, and that UUID must have matching
session-state directory metadata. If it is absent or invalid, adoption stays pending
with an actionable message. Run `pij phonehome` inside that Copilot pane once the env
signal is available; phonehome reads `COPILOT_AGENT_SESSION_ID` for Copilot and
`CLAUDE_CODE_SESSION_ID` for Claude.

Structural parent, repository identity, current prime, and old-prime history are
part of the descriptor snapshot and survive this same restart/reattachment path.
`unset` writes explicit false for both prime markers; legacy absence reads as
neither current nor old prime. See [pij prime](./pij-prime.md#registry-designation).

---

## The message + receipt protocol

- **Immutable inbox history.** Every send publishes `msg-<messageId>.json`.
  Consumption never rewrites or deletes it; `read-<messageId>.json` is the
  authoritative read state. Tmux and pi push consumers publish that marker only
  after their injection/`onInbound` outcome. Pull consumers claim the same marker
  contract, so all delivery modes skip marked history after restart or reload.
- **Raw body, framed once on receipt.** `pij send w3 "hi"` writes the raw text; the
  *receiver* frames it as `[pij from <senderId>] hi` when it injects — so a reply
  needs no lookup (the sender id is right there).
- **The safe body channel — use it for anything you did not author.**
  `pij send <id> "<text>"` is a double-quoted **shell** argument. When the body is
  *relayed* text — a log line, a peer's report, a source excerpt — any `` ` `` or
  `$( )` inside it is executed by **your** shell before pij's process even starts.
  The message still delivers, mangled, with a success receipt. **pij cannot prevent
  this**: the expansion is finished before pij exists, and nothing in pij's delivery
  path runs a shell (it is `execFileSync` with an argv array end to end). The remedy
  is not to remember better, it is to use a channel where the body is never a shell
  token:

  ```sh
  pij send <id> --body-file notes.txt          # the file IS the body, byte-for-byte
  pij send <id> --body-file - <<'PIJ'          # quoted heredoc: your shell expands nothing
  anything at all: `backticks`, $(substitutions), ${vars}, 'quotes', ; semicolons
  PIJ
  ```

  `--body-file` is **literal**: no trimming, no normalisation, trailing whitespace and
  newlines preserved, and the body is never parsed as argv — a body whose first line
  starts `--wait` arrives as text, not as a flag. It is mutually exclusive with
  `--command`.
- **`--file` is NOT `--body-file`.** They are one letter apart with opposite meanings.
  `--file <path> [--caption <text>]` passes a path **by reference** — pij never reads
  the file — and only a **pull-mode** peer (`pij inbox`) or the telegram bridge renders
  it. A pushed peer (tmux/pi/claude/copilot/codex) would receive nothing at all, so
  pij **refuses** an attachment-only send to such a target with `E-EMPTY` rather than
  reporting a receipt for an empty message (pij#132). Text *plus* an unrenderable
  attachment still delivers the text, and warns that the reference was dropped.
  To send a file's **contents**, use `--body-file`.
- **Nothing to send is an error, not a receipt.** A send whose delivered payload would
  be empty for that target — `pij send <id> ""`, or an attachment-only send to a peer
  that cannot render attachments — is refused with `E-EMPTY` (exit `2`) before anything
  is written. No message, no receipt. `--command` sends are exempt: they legitimately
  carry an empty body.
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
- **Receipt durability.** A receipt envelope is retained like every other message,
  but it is hidden from user output and peer injection. Its receipt event is
  atomically appended/reused before its read marker is published, so
  `pij send --wait` can resolve terminal state after process or daemon restarts.

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

> **Session identity.** A new session gets a collision-safe
> `pij-<adjective>-<animal>` primary id. Pi's native session identity keeps it
> stable across `/reload` and `/resume`, while `/new` and `/fork` mint a fresh
> memorable id. SDK/test fallback also allocates from the memorable sequence.
> Existing opaque ids remain unchanged.

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
- `pij send <id> --body-file <path|->` — **use this for relayed or untrusted text**; the file/stdin is the body, byte-for-byte, and your shell expands nothing
- `pij send --to <id> --to <id> "<text>"` — send the same text once to each named peer
- `pij send <id> --command <compact\|new\|reload>` — run an allow-listed session-control command on a peer
- `pij tail <id> --since N` — read a peer's new events (cheap incremental review)
- `pij state <id>` — a peer's working/idle + liveness + latest-event age
- `pij tree [<id> | --global]` — inspect repository, global, or subtree structure
- `pij link <child> --parent <parent> | --root` — change structure without changing close ownership
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

`--plan-id <id>` uses the same warn-don't-block posture. Pij probes simple-segment
ids against `docs/plans/<id>` in the spawner's current directory; non-segment
opaque ids are explicitly reported as not checked. Unresolved and not-checked
outcomes appear in JSON and human spawn receipts, and spawn always proceeds.
Existing seats can be corrected with `pij attest <id> --plan-id <id>`.

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

### Terminal observation and spawn no-shows

Every launch writes a durable expectation keyed by its `spawnId` **before** opening
its tmux pane. It records the requested harness, a bounded registration deadline,
and later the pane/session correlation. A launch that fails synchronously removes
only its own expectation; a process crash leaves the intent for reconciliation.

Terminal status is evidence, not a guessed cause: a pij-owned close is
`requested`; a PID/pane absence without recorded pij close intent is
`unrequested-by-pij`; and a failed probe is `unavailable`. The daemon labels its
first post-boot reconciliation as **historical** and subsequent observations as
**live**, preserving the observation time and any last-seen time. An unbound,
expired expectation becomes an expectation-keyed no-show notice; a descriptor with
the same `spawnId` suppresses that no-show rather than inventing a runtime harness.

Per-harness detection (on captured pane text, never stderr):
- **claude**: `API Error: 400` → `model-not-supported` (also triggers pane-dead via `classifyReadiness`)
- **copilot/pi**: first-inference error text → `model-not-supported`

The first-inference gate (deterministic-bind path only) defers the bound-notice until the init-inject turn completes without a model error — so the creator is never told a session is "ready" when it immediately 400d.
