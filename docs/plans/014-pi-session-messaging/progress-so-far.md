# Progress so far — pi-session-messaging

**Status**: Phase-1 mechanism **proven** via a scratch prototype. Not yet a real
extension / CLI. Pre-plan preamble still to work through before the full spec.

> This is a working record captured during exploration, before the formal
> the-flow stages. It feeds the eventual spec; it is not itself the spec.

## The goal (one line)
Two separate, **live** pi sessions hold a near-realtime, natural back-and-forth —
one pi talking to another pi (and, more generally, any external process talking
into a running pi session).

## Mechanism research (confirmed against pi 0.79.x)
- **No off-the-shelf pi extension** does Pi↔Pi messaging today. pi ships the
  primitives; `examples/extensions/file-trigger.ts` is the closest reference.
- pi has **`--mode rpc`** (JSON-RPC/JSONL over stdio) for headless embedding — a
  broker could relay between two headless agents, but that gives no visible TUI.
- For **visible interactive sessions**, the path is an **extension** that watches
  a shared transport and injects messages. Confirmed API surface
  (`dist/core/extensions/types.d.ts`):
  - `ctx.isIdle()` — detect whether the agent is mid-turn.
  - `pi.sendUserMessage(text)` — when **idle**, sends a user message and
    **triggers a turn** (agent responds immediately).
  - `pi.sendUserMessage(text, { deliverAs: "steer" })` — when **streaming**,
    **queues** the message; delivered **after the current assistant turn**
    finishes its tool calls (this is the steering path).
  - ⚠️ Calling `sendUserMessage` while streaming **without** `deliverAs` throws —
    so the extension MUST branch on `ctx.isIdle()`.
- Net: the user's hypothesis ("same command — execute now if idle, else queue via
  steering") is **correct**, with the one nuance that `deliverAs:"steer"` is
  required when busy.

## Phase-1 prototype (scratch, gitignored)
Location: `scratch/messenger_test/`
- `messenger.ts` — T1 extension. Watches the dir for `inbox.jsonl`; on
  `session_start` **watermarks** existing message ids (no replay on start/reload);
  on change, reads unread-by-`id` lines and plays each as its own user message
  (first idle → immediate; rest / busy → `deliverAs:"steer"`). Watcher started in
  `session_start`, closed in `session_shutdown`.
- `send.ts` — CLI. Appends one JSON line atomically (write `inbox.jsonl.tmp` →
  `copyFileSync` over `inbox.jsonl`) so the watcher sees an in-place `change`
  (stable inode) and never reads a half-written file.
- `inbox.jsonl` line shape: `{ id, from, ts, text }`.
- `plan.md` — the prototype design + mermaid diagrams + test plan.

## What was proven (manual, two real pi windows)
1. **Idle path** ✅ — message dropped while idle → agent responded immediately.
2. **Steering path** ✅ — message dropped mid-turn → queued, delivered cleanly at
   the turn boundary (no mid-stream interruption).
3. (Batch of multiple unread → separate messages in order: designed, not yet
   exercised end-to-end.)

## Known limitations / deferred (out of phase-1 scope)
- One-directional in the prototype (CLI → pi). True Pi↔Pi needs **two inboxes**
  (one per direction) + a **loop guard** (the `input` event exposes
  `source:"extension"` for injected messages).
- In-memory watermark (no durable cursor) — fine for proof; durable cursor via
  `appendEntry` is a later upgrade.
- No sender auth / identity verification — `from` is whatever the CLI passes.
- Transport is a JSONL file + `fs.watch`. Sockets/named-pipe are a lower-latency
  alternative to evaluate.
- "Map into a proper CLI later" (user) — the sender should graduate from the
  scratch `send.ts` to a real tool; the extension should graduate from scratch T1
  to a vetted T2 extension (`just new`).

## Open questions for the preamble (to resolve before the full spec)

Resolved in preamble (see sections below): transport (file-based JSONL, minih
model), addressing/identity (`~/.pij/` registry + per-session id), the
working/static signal (state files). Still genuinely open: durable-history
retention, exact liveness/heartbeat mechanism, reuse-vs-fork of minih code.

## minih prior-art (researched)

Full findings in [`minih-prior-art.md`](./minih-prior-art.md). Headline: minih
already ships the data model we need — `events.ndjson` (`{type,timestamp,data}`;
tool_call/tool_result/message/usage/…) and inside/outside **state** files
(`idle|in-progress|paused|reviewing|complete|error`) that are exactly the "is it
working or static" signal. (minih also has a persisted inbox-message schema, but
we are **not** adopting it — see § Messaging = fire-and-forget.) minih follows the
stream by **byte offset** (`tail`, watermark). **pij delta**: add a monotonic
`seq` to every event so the CLI can do `--since <seq>` / `--type <t>` filtering
cleanly. Topology differs: minih spawns a headless child; pij is two **peer
interactive pi TUIs** discovered via a shared registry.

## Discovery & identity (decided)

- **Global registry folder: `~/.pij/`**. When the pij **extension first loads**
  (`session_start`), it writes a **session descriptor** there — its own **pij
  session id**, the **cwd / folder path**, **its data dir** (where this session's
  `events.ndjson` + state files live), pid, and current status.
- Peers are discovered by **scanning `~/.pij/`**, ideally **filtered by folder
  path** — "find all pij sessions working in this project."
- A session **knows its own id**. On boot the extension **self-announces**: it
  injects a first message into its own session — *"you are pij session <id>;
  here's how you use pij"* — and this usage is also documented in **AGENTS.md**
  so the agent knows the protocol.
- The **`pij` CLI** (Node) is the working surface: list sessions, send a message,
  send a command, tail/follow another session's event stream, filter by
  `seq`/type, read state, and **`pij path <id>`** to print a session's data-dir /
  `events.ndjson` path so you can read it **directly** with file tools when a
  tactical deep-dive beats the CLI. (Phase-1 `send.ts` graduates into this.)

## Messaging = fire-and-forget, self-identifying (decided — no inbox)

Keep it as basic as possible:

1. **Fire-and-forget, no inbox.** A message is just **fired into the target
   session's delivery channel**; the extension **injects it like human input**
   (idle → respond, busy → steer) — exactly the phase-1 prototype. No stored
   messages, no `ackOf`, no reply tracking, no persistence.
2. **The `from` id rides in every message.** The sender stamps **its own session
   id** on the message; the injected text reads like `[pij from <senderId>]
   <body>`. The receiver replies with **zero lookup**: `pij send <senderId>
   "..."`. The agents just talk back and forth like that.

Consequences:
- The `~/.pij/` registry is only for **first contact / discovery** ("who's out
  there in this folder?"); once you've received a message you already have the
  sender's id inline.
- The peer's actual work/answers are observed via its **event stream**, not a
  message log. minih's inbox-message schema is **not** adopted (only its
  event-stream + state model are).

## Remote commands (decided — first: compact)

Beyond plain messages, a session can send the peer a **command** to run. Same
fire-and-forget channel, but the payload is tagged as a command so the extension
**executes it via a pi API** instead of injecting it as user text.

- **First command: `compact`.** The parent can tell the worker to compact its
  context (e.g. when it's getting full). The extension can't *type* `/compact`
  (it's a user builtin), but `ctx.compact({ onComplete, onError })` triggers it
  programmatically — confirmed in the extension API.
- Shape: the message carries a kind, e.g. `{ from, kind: "command", name:
  "compact", args? }` vs the default `{ from, kind: "message", text }`.
- CLI: `pij send <id> --command compact` (or `pij cmd <id> compact`).
- Extensible: a small **command registry** maps `name → pi action` (compact →
  `ctx.compact()`; future: extension slash-commands could be injected as
  `/<cmd>` via `sendUserMessage`, which pi's input pipeline executes). Keep it a
  tiny allow-list, not arbitrary remote code.

## Workflow / economic model (the why)

- **Parent (this side)** = reviewer/orchestrator, a more **expensive model** — but
  it mostly pays **input tokens** (reading the worker's stream + firing feedback).
- **Worker (other side)** = generator, a **cheaper model** doing the
  **output-token** heavy lifting (writing code, running tools).
- Loop: parent **tells** the worker what to do → worker generates and emits its
  event stream + status → parent **follows along** incrementally (offset/tail,
  `present-5`, tactical read-back of older events) and **rapidly fires** feedback /
  review requests back. Both are in pi, so the channel is fast and local.
- Parent must see: **what the worker is doing now**, **what it has done**, and
  **its current state** (working vs static) — without re-ingesting the whole log.

## Engineering constraints / architecture (decided)

**Hexagonal (ports & adapters) + DI**, aligning with pij patterns P1–P10:

- **Pure core / domain** (no I/O, no pi imports — P2): session identity, event
  `seq`ing, the message/command model, the state machine
  (`idle|working|…`), discovery + folder-filter logic. Tagged-union returns (P4).
- **Ports** (interfaces the core depends on):
  - `RegistryPort` — read/write session descriptors in `~/.pij/`.
  - `EventLogPort` — append/read `events.ndjson` (with `seq`, offset, type filter).
  - `DeliveryPort` — fire-and-forget channel write + watch (the messenger).
  - `PiRuntimePort` — `sendUserMessage` / `isIdle` / `compact` (the pi side).
  - `ProcessPort` — pid probe + clock for liveness.
- **Adapters** implement the ports: fs registry, ndjson log, `fs.watch` channel,
  a pi-`ExtensionAPI` adapter, a node `process`/`kill` adapter.
- **Services** compose ports via **constructor injection** — no global mutable
  state (P3); side effects injected, not reached for.
- **Two entry points wire the same core**: the **pi extension** (`index.ts`)
  binds the real adapters; the **`pij` CLI** binds its own adapter set. Core is
  shared and pi-free.

**Toolchain / quality gates:**
- **TypeScript** NodeNext ESM, `.js` relative imports (P7); no `any` (inherited).
- **vitest** — unit tests target the **core/services** against fake adapters (P8).
- **Biome** — lint + format (`just lint`).
- **npm audit** — dependency CVE check (pij's report-and-continue vetter applies).
- **CI** — GitHub Actions running typecheck → lint → test → audit on every push.
- Fits the pij harness: scaffold via the T2 layout; `just typecheck/lint/test`,
  smoke scenario, `just self-check` before done.

## Planned workshops (before the spec)

The user wants two workshops as part of/after **explore**, **before** specify:
1. **The `pij` CLI surface + the other-agent experience** — command/flag design,
   what the worker agent sees and how it's prompted to use pij.
2. **The workflows** we're trying to enable — the parent/worker review loop,
   comms patterns, and the observability/follow-along experience.

## Still open (deferred, not blocking the dossier)
