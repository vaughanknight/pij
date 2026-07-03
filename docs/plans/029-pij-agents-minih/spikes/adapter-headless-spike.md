# Spike: claude / codex headless adapters — go/no-go

**Task**: T004 (Phase 1) · **Date**: 2026-07-03 · **Owner**: agent-runtime
**Answers**: workshop 001 Q1 ("Do claude/codex headless modes deliver everything an
adapter needs — structured result, session id for `terminate`, streaming events for
the stall watchdog?") and the Evidence Ledger "Missing" row (D2 adapters).

## Verdict: **GO** (headless subprocess adapters, D2 option A)

Both CLIs deliver a structured one-shot result with a session/thread id and token
usage in a single non-interactive invocation. That is everything minih's
`IAgentAdapter.run(options) → AgentResult` needs (`AgentResult = { output,
sessionId, status, exitCode, stderr?, tokens }`). Mid-run `compact`/`terminate`
and per-token streaming for the stall watchdog are **not** first-class in the
one-shot headless modes — that is an accepted graceful-degradation, see below.

## What `IAgentAdapter` actually needs (from the installed minih@0.2.4)

- `run(options)` resolves with `AgentResult`; the runner (`runner.js:1155-1162`)
  calls it with `{ prompt, model?, reasoningEffort?, cwd: <runDir>, onEvent,
  onSessionReady, configDir }`. Only `output` (→ `output/report.json` when truthy)
  and `status: 'completed'` are load-bearing for a recorded run; `sessionId`,
  `exitCode`, `tokens` are surfaced but not required for the happy path.
- `compact(sessionId)` / `terminate(sessionId)` exist on the interface but the
  runner only invokes `terminate` on a kill/timeout path. A one-shot subprocess has
  already exited by the time it resolves, so these are best-effort no-ops for the
  headless adapters (documented degradation, matches workshop 001 D2).

## Claude — `claude -p "<prompt>" --output-format json`

Real run (`claude 2.1.198`), prompt "Reply with exactly: SPIKE_OK":

```json
{"type":"result","subtype":"success","is_error":false,"result":"SPIKE_OK",
 "session_id":"ab564b8a-7752-41d4-80b2-f843db340912","num_turns":1,
 "stop_reason":"end_turn","terminal_reason":"completed","total_cost_usd":0.179,
 "usage":{"input_tokens":7451,"output_tokens":86}}
```

Adapter mapping:
- `output` ← `result`
- `sessionId` ← `session_id`
- `status` ← `is_error === true` ⇒ `'failed'`, else `'completed'`
- `exitCode` ← process exit code (0 on success)
- `tokens` ← `{ used: usage.input_tokens + usage.output_tokens, total: …, limit: 0 }`
  (best-effort; minih tolerates `tokens: null`)
- `model` ← `--model <id>` flag; effort has no direct claude flag → pij passes model only.
- Event granularity: `--output-format json` is a single terminal object (no
  per-token stream). `--output-format stream-json` exists for streaming but is not
  needed for a one-shot; `onEvent` is fed a single synthetic `message`/`session_idle`.

## Codex — `codex exec --json --skip-git-repo-check -s <sandbox> -o <file> -C <cwd> "<prompt>"`

Real run (`codex-cli 0.142.5`), prompt "Reply with exactly: SPIKE_OK":

```
{"type":"thread.started","thread_id":"019f24fb-b387-7201-a966-2ad66a0ff53a"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"SPIKE_OK"}}
{"type":"turn.completed","usage":{"input_tokens":14998,"cached_input_tokens":4992,"output_tokens":21,"reasoning_output_tokens":12}}
```

Adapter mapping:
- `output` ← last `item.completed` where `item.type === 'agent_message'` (`.item.text`);
  `-o <file>` also writes exactly that final message (redundant safety net).
- `sessionId` ← `thread.started.thread_id`
- `status` ← `turn.completed` seen ⇒ `'completed'`; process error / no `turn.completed`
  ⇒ `'failed'`
- `tokens` ← `turn.completed.usage.{input_tokens,output_tokens}`
- `cwd` ← `-C <runDir>`; `--skip-git-repo-check` (run folders are not git repos);
  sandbox `read-only` by default (agents `cd $MINIH_PROJECT_ROOT` per preamble).
- Pass the prompt as an **argv** and set stdin to `ignore` — piping stdin makes
  codex print "Reading additional input from stdin…" and wait.
- **Effort clamp (KF-06 / D2)**: codex effort is `-c model_reasoning_effort=<level>`
  and supports `minimal|low|medium|high` but **not** minih's `xhigh`; minih's enum is
  `low|medium|high|xhigh` and lacks codex's `minimal`. The adapter maps via a pure
  helper that **clamps `minimal` → `low` and warns**, and maps `xhigh` → `high`
  (codex ceiling), never blocking (warn-don't-block).

## Degradation notes (recorded, non-blocking)

- No mid-run `compact`/`terminate` in one-shot headless mode → both are best-effort;
  the runner's kill path tolerates a resolved/failed `AgentResult`.
- No per-token event stream → the runner's stall watchdog sees a single terminal
  event. For synchronous one-shot runs (v1 scope) this is acceptable; streaming
  (`--output-format stream-json`, codex `--json` per-item) is a post-v1 enhancement
  if a stall watchdog over live headless runs is wanted.

## Impact on T008

Design is unchanged from D2 option A. Two thin adapters:
`spawn CLI → parse structured stdout → AgentResult`. Effort mapping is a pure,
unit-tested helper per adapter (codex clamps `minimal`, claude passes model only).
