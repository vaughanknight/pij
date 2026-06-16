# Research Dossier — pij session messaging

**Generated**: 2026-06-16 · **Mode**: Pre-Plan (greenfield) · **FlowSpace**: not used (greenfield design — no existing pij messaging code to archaeologize)
**Inputs consolidated**: `progress-so-far.md`, `minih-prior-art.md`, the pi 0.79.x extension API, pij patterns P1–P10.

> This is a **design-research** dossier, not codebase archaeology. The system
> doesn't exist yet; the relevant prior art is external (pi's extension API +
> minih's data model) plus pij's own conventions. All three are already gathered.

## Executive Summary

### What we're building
`pij` — a system letting **two live, interactive pi sessions** hold a
near-realtime conversation, where a **parent** (expensive reviewer model, mostly
input tokens) directs and observes a **worker** (cheaper generator model, output
tokens). It combines (a) **fire-and-forget messaging** injected like human input,
(b) an **observability event stream** the parent can follow incrementally, and
(c) a **state/liveness signal** so the parent knows if the worker is working.

### Key insights
1. **The load-bearing primitive exists and is proven.** `pi.sendUserMessage(text)`
   triggers a turn when idle; the same call with `{ deliverAs:"steer" }` queues
   cleanly when busy. Phase-1 prototype proved both paths in two real windows.
2. **minih already ships the data model** — `events.ndjson` (`{type,timestamp,data}`),
   inside/outside **state** files, byte-offset following. We adopt the shapes,
   add a per-event **`seq`**, and **drop the persisted inbox** (messaging is
   fire-and-forget + self-identifying).
3. **Topology is peer-to-peer, not spawn-and-own.** Unlike minih (orchestrator
   spawns a headless child), pij is two peer TUIs that discover each other via a
   shared `~/.pij/` registry. Each session owns its own event stream + state.

### Quick stats
- **New components**: ~12 (extension, registry, event log, delivery, CLI, state, liveness, command registry, discovery, ports, adapters, tests).
- **External prior art**: pi extension API (`sendUserMessage`/`isIdle`/`compact`), minih (events/state/tail).
- **Complexity**: CS-4 (multi-component, hexagonal, two entry points, CI).
- **Domains**: 1 NEW (`pij-messaging`) consuming pi runtime + extension-authoring-harness.

## How it will work (target design)

### Topology
```
pi window A (parent)                      pi window B (worker)
 ├─ pij extension                          ├─ pij extension
 │   ├─ registry descriptor → ~/.pij/A      │   ├─ registry descriptor → ~/.pij/B
 │   ├─ delivery channel (watched)          │   ├─ delivery channel (watched)
 │   ├─ events.ndjson (writes own)          │   ├─ events.ndjson (writes own)
 │   └─ state.json (idle|working)           │   └─ state.json
 └─ pij CLI ── send/cmd ─▶ B.channel        └─ pij CLI ── send/cmd ─▶ A.channel
        └─ tail/path ─────▶ B.events                └─ tail ──────▶ A.events
```

### The three subsystems
1. **Discovery** — on `session_start` the extension writes `~/.pij/<id>.json`
   (id, cwd/folderPath, dataDir, pid, status). `pij list [--here]` scans + filters
   by folder path. First-contact only; replies use the `from` id in the message.
2. **Messaging (fire-and-forget, self-identifying)** — `pij send <id> "text"`
   writes to `<id>`'s delivery channel (atomic tmp→copy). The target extension
   watches, then injects `[pij from <senderId>] text` as user input (idle→turn,
   busy→steer). **Commands**: `pij send <id> --command compact` → the extension
   runs `ctx.compact()` (allow-listed name→action map). No inbox, no acks.
3. **Observability** — each extension appends every session event to its own
   `events.ndjson` with a monotonic `seq`. The parent follows via
   `pij tail <id> --since <seq> --type <t> --lines N`, or `pij path <id>` to read
   `events.ndjson` directly with file tools for a tactical deep-dive. State +
   liveness (`pij state <id>`) answer "working or static / alive or wedged".

## Prior art (carried in)

### pi extension API (verified, `dist/core/extensions/types.d.ts`)
| Capability | API | Use |
|---|---|---|
| Detect busy | `ctx.isIdle()` | branch inject-now vs steer |
| Inject message | `pi.sendUserMessage(text, {deliverAs?})` | deliver incoming messages |
| Compact | `ctx.compact({onComplete,onError})` | the `compact` remote command |
| Lifecycle | `session_start` / `session_shutdown` | start/stop watchers, registry write/clear |
| Source guard | `input` event `source:"extension"` | future loop-prevention if needed |

### minih data model (`~/substrate/minih`, see `minih-prior-art.md`)
- `events.ndjson` = `{type,timestamp,data}`; types tool_call/tool_result/message/usage/… (6250 events/164 tool calls in one real run). **Addressed by byte offset — no seq → we add one.**
- inside/outside `state` (`idle|in-progress|paused|reviewing|complete|error`) + `history.ndjson` transitions = the working/static signal.
- `tail` follows by byte offset (200ms poll); `readRecentEventLines` = "present-minus-N".
- **inbox-message schema deliberately NOT adopted** (we're fire-and-forget).

### pij conventions (this repo, AGENTS.md P1–P10)
- T2 layout (`index/store/test`), **pi-free core** (P2), constructor DI (P3),
  tagged-union returns (P4), tests target the store/core (P8), `.js` ESM imports (P7).
- Harness: `just new`, `just typecheck/lint/test`, smoke via Driver SDK, `just self-check`, biome, vitest, the report-and-continue vetter, CI.

## Architecture (hexagonal — decided)

**Pure core** (no pi, no I/O) → **Ports** → **Adapters**; **Services** compose
ports via constructor DI; **two entry points** (extension `index.ts`, `pij` CLI)
wire the same core.

| Port | Responsibility | Adapter(s) |
|---|---|---|
| `RegistryPort` | session descriptors in `~/.pij/` | fs registry |
| `EventLogPort` | append/read `events.ndjson` (+seq, offset, type filter) | ndjson fs |
| `DeliveryPort` | fire-and-forget channel write + watch | fs + `fs.watch` |
| `PiRuntimePort` | `sendUserMessage`/`isIdle`/`compact` | pi `ExtensionAPI` adapter |
| `ProcessPort` | pid probe + clock (liveness) | node `process`/`kill` |

Core stays pure → unit-tested against **fake adapters** (no mocks).

## Quality / toolchain (decided)
TS NodeNext ESM (no `any`); **vitest** on core/services with fakes; **Biome**;
**npm audit** (pij report-and-continue vetter); **GitHub Actions CI**
(typecheck→lint→test→audit); `just self-check` before done.

## Critical discoveries / risks
- 🚨 **Turn-submission is the linchpin** — proven via `sendUserMessage`; everything
  else is plumbing around it. Keep the inject path identical to the prototype.
- ⚠️ **`fs.watch` reliability** — watch the *directory*, atomic tmp→copy writes
  (stable inode), debounce + dedupe. Proven in the prototype.
- ⚠️ **No per-event seq in minih** — we own seq assignment; must be monotonic and
  crash-safe (derive from line count / persisted counter).
- ⚠️ **Liveness** — peer must distinguish working / idle / wedged / dead (pid +
  lastEventAt), mirroring minih's `run-liveness` verdict.
- ⚠️ **Security** — remote `--command` must be a tiny allow-list (compact only to
  start), never arbitrary remote execution.

## Open questions for the spec
- Where does a session's `events.ndjson` + `state.json` live — under `~/.pij/<id>/`
  or in the project? (leaning `~/.pij/<id>/` so peers read without project access).
- Seq durability across `/reload` (persisted counter vs line-count derivation).
- Liveness thresholds (stale window, heartbeat cadence).
- How much the worker writes to its own event stream from inside pi (which pi
  events the extension captures: tool_call/tool_result/message/usage at minimum).

## Workshop opportunities (deferred — folded into spec per user)
1. `pij` CLI surface + the other-agent experience (command/flag design, prompting).
2. Parent/worker workflows + the follow-along observability experience.

---
**Research complete.** Feeds the spec next.
