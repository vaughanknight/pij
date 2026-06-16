# minih prior-art — event/comms/state data model

Research captured from `~/substrate/minih` (commit state 2026-06-15). This is the
closest existing system to what `pij` needs: a parent ("outside") observing and
messaging a worker ("inside") agent, with a full on-disk event + comms + state
model. We reuse the **data model**; the **topology differs** (see end).

## Run directory layout (per agent run)
`agents/<slug>/runs/<runId>/`:

| File/dir | Purpose |
|---|---|
| `events.ndjson` | **The granular event stream** — one JSON object per line. |
| `completed.json` | Terminal summary: `result`, `eventCount`, `toolCallCount`, `durationMs`, `validated`. |
| `run.json` | Live manifest: `status`, `terminalReason`, `pid`, `budgets`, `lastEventAt`. |
| `inbox/inside/`, `inbox/outside/` | **Bidirectional comms** — one file per message, per direction. |
| `inbox-snapshot/` | Snapshot of inbox state. |
| `state/inside.json` | Worker's current state (status enum). |
| `state/history.ndjson` | State-transition log (append-only). |
| `state/sdk-watermark.json` | **Offset watermark** for resumable following. |
| `state-snapshot.json` | Combined `{inside, outside}` status snapshot. |
| `instructions.md`, `prompt.md`, `input/output-schema.json`, `output/` | Agent pack + results. |

## Event stream — `events.ndjson`
Each line: `{ "type": <string>, "timestamp": <ISO>, "data": <object> }`.

Observed types (one real run = **6250 events / 164 tool calls**):
`session_start`, `skills_loaded`, `thinking`, `text_delta`, `message`,
`tool_call`, `tool_result`, `usage`, `session_idle`, `raw` (+ synthetic
`run_stalled` from the watchdog).

- `tool_call.data` = `{ toolName, toolCallId, input }`
- `tool_result.data` = `{ toolCallId, output, isError }`  ← file writes, command output, etc.
- `message.data` = `{ messageId, content }`
- `usage.data` = token usage per turn.

**Key gap for pij**: events have **no per-event `seq`/index** — minih addresses
them by **byte offset** (`tail` polls every 200ms, tracks `bytesRead`) and by
line position (`readRecentEventLines` reads the last N lines from EOF = your
"present minus 5"). For pij's CLI ("show everything since N / of type X /
filter"), we should **add a monotonic `seq` integer to every event** so offset +
type filtering are O(1) and stable, instead of relying on byte math.

## Reading patterns (CLI prior art — `minih tail`)
- **Follow**: poll `events.ndjson` by byte offset; print new lines; stop on `completed.json`.
- **Tail N**: scan backward from EOF for N newlines (bounded chunks) — cheap "recent" view.
- **Snapshot**: bounded recent + completion summary, then exit.
- This is exactly the "follow along at home, don't re-read the whole context"
  pattern the user wants; `--lines`, `--snapshot`, `--run <id>` already exist.

## Comms — `inbox-message` schema
`{ id(ULID), sender: "outside"|"inside", type, subject, body, ts, ackOf?, meta? }`.
Real `type`s seen: `briefing`, `task`, `control`, `finding`. `ackOf` links a
reply to the message it answers (review-request → finding). Messages are
individual files under `inbox/<direction>/`. This is the bidirectional
back-and-forth model pij wants (parent ⇄ worker), already battle-tested.

## State — "is it working or static"
- `inside.json`: `{ status, data, updatedAt, updatedBy: "inside" }`,
  status ∈ `idle | in-progress | paused | reviewing | complete | error` (+ `stopping`).
- `outside.json`: status ∈ `idle | in-progress | paused | done | error`.
- `state/history.ndjson`: every transition `{ ts, side, from, to, reason, peerStateAtTime }`.
- This **is** the working/static signal pij needs — a session writes its status;
  the peer reads it without parsing the whole event stream.

## Liveness (dead/stale/active) — `docs/how/run-liveness.md`
- `run.json.status` + **pid probe** (`kill(pid,0)`): pid gone → `dead`; alive but
  quiet >60s → `stale`; events in last 60s → `active`.
- Budgets (timeout / stalled-stream / max-turns) guarantee self-termination.
- For pij peers we'll want an equivalent: a heartbeat/pid + last-event time so the
  parent knows the worker is alive vs wedged vs done.

## Topology delta: minih vs pij
- **minih**: an orchestrator process **spawns** a headless pi/Copilot agent as a
  child; the runner **owns** the run dir and writes events/state on the agent's
  behalf. Parent↔child via inbox files the runner forwards.
- **pij**: **two peer interactive pi TUIs**, each a loaded **extension**, no
  parent process owning the other. They find each other via a shared global
  registry (`~/.pij/`) and each writes its **own** event stream + state + inbox.
  Same data model, peer-to-peer instead of spawn-and-own.

## Reuse decisions (carry into spec)
- ✅ Adopt `events.ndjson` (`{type,timestamp,data}`) **plus a `seq` field**.
- ❌ **Do NOT** adopt the persisted inbox-message shape — messaging is
  **fire-and-forget, self-identifying**: the sender stamps its `from` id on the
  message, the extension injects it like human input, the receiver replies via
  `pij send <senderId>`. No stored inbox, no `ackOf`.
- ✅ Adopt inside/outside state files + a history log for the working/static signal.
- ✅ Adopt byte/line-offset + watermark following; expose `seq`-based filters in CLI.
- ✅ Adopt a liveness probe (pid + lastEventAt) for the alive/stale/dead verdict.
