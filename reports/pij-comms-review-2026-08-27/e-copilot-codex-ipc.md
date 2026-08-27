# E — Can pij write into a running Copilot CLI / Codex CLI the way it writes into Claude Code's inbox socket?

Date: 2026-08-27. Read-only investigation; no keys sent to any pane, no process touched, no peer spawned.
Question: Claude Code ≥2.1.224 binds `/tmp/cc-socks/<pid>.sock` and accepts a `{"type":"user",...}` JSON line mid-turn.
Is there an equivalent local IPC (socket, pipe, port, stdio protocol, MCP hook, or re-read state file) for GitHub Copilot CLI and OpenAI Codex CLI?

## TL;DR

| Harness | Running interactive seat, as launched today | If pij launches it with the right flag/topology | Recommended |
|---|---|---|---|
| Copilot CLI 1.0.81-9 | **NO** — no listener, no socket path, no re-read state file. | **YES** — hidden `--ui-server --port N` gives the *same TUI* an embedded loopback JSON-RPC server with `session.send {sessionId, prompt, mode:"enqueue"\|"immediate"}` (queue when busy / interject mid-turn). | Spawn with `--ui-server`; `notification` hook as backstop; typed pointer only for legacy seats. |
| Codex CLI (upstream rust-v0.150.1; local npm install is broken) | **NO** — plain `codex` TUI is in-process, no transport. | **YES (pij-owned server)** — `codex app-server --listen unix://PATH` + pane runs `codex --remote unix://PATH`; daemon is a 2nd websocket client on the same socket and calls `turn/start` / `turn/steer`. | pij-owned app-server + remote TUI; `UserPromptSubmit`/`Stop` hooks as backstop. |
| pi | YES already (pij's own extension `file-watch-notify` calls `pi.sendUserMessage`, steer when busy). | `--mode rpc` is headless-only (no TUI). | Keep the extension. |

---

## Copilot

### Live evidence (this machine)

Four pij copilot seats (`~/.pij/<id>.json` → pid, harnessSessionId):

| seat | loader pid | native child | session |
|---|---|---|---|
| pij-mobile-bee | 69414 | 69476 | cc314740-… |
| pij-monetary-quelea | 61668 | 61721 | 33ab97e5-… |
| pij-reasonable-excuse | 64311 | 64507 | abc8ae0d-… |
| pij-universal-ebulan | 70037 | 70102 | 1c82f284-… |

Command lines (`ps -o command= -p`):

```
node /opt/homebrew/bin/copilot --yolo --session-id 1c82f284-7618-48ee-b341-c65e1209769c --model gpt-5.6-sol --context long_context
/opt/homebrew/lib/node_modules/@github/copilot/node_modules/@github/copilot-darwin-arm64/copilot --yolo --session-id 1c82f284-… --model gpt-5.6-sol --context long_context
```

No server flag of any kind. `lsof -p` on every native child shows the same shape (excerpt, pid 70102):

```
copilot 70102  20u unix 0xe1b4d3b654357746 0t0 ->0x1632ffeb4a779b0f   # socketpair, no bound path
copilot 70102  21u unix 0x1632ffeb4a779b0f 0t0 ->0xe1b4d3b654357746
copilot 70102  24w REG  …/.copilot/logs/process-1787607629958-70102.log
copilot 70102  25u IPv4 … TCP 192.168.1.241:50591->4.237.22.34:https (ESTABLISHED)
copilot 70102  39u REG  …/.copilot/session-store.db          (+ -wal, -shm)
copilot 70102  4,5,13,14,38,42,… PIPE                          # stdio + tool/MCP child pipes
```

- `lsof -U -a -p <pid>`: only anonymous socketpairs (`->0x…`, no `NAME` path). No `.sock` anywhere: `lsof -U | grep -i copilot` returns only those pairs.
- No LISTEN: `lsof -iTCP -sTCP:LISTEN` shows nothing owned by any copilot pid.
- The node loader (69414 etc.) holds just one pipe pair to the native child.
- Open files under `~/.copilot`: `session-store.db` (shared SQLite WAL, written by all seats) and `logs/process-*.log`. **No fd on `session-state/<uuid>/events.jsonl`.**

`~/.copilot/session-state/<uuid>/` (all four identical in shape):

```
checkpoints/  events.jsonl  files/  inuse.<nativepid>.lock  research/  rewind-file-snapshots/  workspace.yaml  [session.db]
```

`events.jsonl` is appended live (mtimes over ~one minute: 12:36:40 → 12:38:46 → 12:39:04 across seats; `session-store.db-wal` 12:39:02) but opened/appended/closed per event, and nothing re-reads it: the bundle references `events.jsonl` only in the remote-debug-bundle exporter, and the only `fs.watch` in app.js is `AgentRegistryWatcher` (agents dir). Event types in the tail are `user.message`, `assistant.turn_start/_end`, `tool.execution_*`, `model.*` — a transcript, not an inbox. `workspace.yaml` carries `remote_steerable: false`, `mc_session_id`, `mc_task_id` (GitHub "mission control" export ids). `inuse.<pid>.lock` just holds the pid.

Config: `~/.copilot/settings.json` = `{"enabledPlugins":{…}}`; `~/.copilot/hooks/` **does not exist**; `~/.copilot/mcp-config.json` = perplexity, flowspace, chrome-devtools, enghub (all stdio/local); `config.json` is machine-managed (trustedFolders, experiment flags).

Also live: Microsoft Scout (pid 4464) runs `copilot --headless --no-auto-update --log-level info --stdio` with fds 0/1/2 as socketpairs — that is the SDK server mode, owned by its parent over stdio.

### Binary / package evidence

`which copilot` → `/opt/homebrew/bin/copilot` → `/opt/homebrew/lib/node_modules/@github/copilot/npm-loader.js` (package.json says 0.0.412-1; the loader self-updates into `~/.copilot/pkg/darwin-arm64/1.0.81-9/`, and `copilot --version` = `1.0.81-9`). The running code is `~/.copilot/pkg/darwin-arm64/1.0.81-9/app.js` (8.1 MB) plus the Rust napi runtime `prebuilds/darwin-arm64/runtime.node`; the bundled client SDK is `…/1.0.81-9/copilot-sdk/` (`index.js`, `client.d.ts`, `generated/rpc.d.ts`).

Visible in `copilot --help`: `--acp`, `-p/--prompt`, `--output-format json`, `--session-id`, `--resume`, `--continue`, `--connect [sessionId]` ("Connect directly to a remote session"), `--remote/--no-remote` ("remote control of your session from GitHub web and mobile"), `--additional-mcp-config`. Subcommands: `app completion help init login mcp plugin plugins skill update version`. Nothing about servers.

**Hidden (`.hideHelp()`) flags in app.js** (`grep -o 'new Ci("--…' app.js`):

```
"--server",         "Enable headless JSON-RPC server mode"
"--headless",       "Enable headless JSON-RPC server mode (alias for --server)"
"--ui-server",      "Enable TUI with embedded JSON-RPC server"
"--managed-server", "Bootstrap a managed-server session under headless --server so a controller's attach picker can drive it"
"--stdio",          "Use stdio transport for server mode (instead of TCP)"
"--port <port>",    "Port to listen on when in server mode (default: random available port)"
"--host <host>",    "Host address to bind server to (default: 127.0.0.1)"
```

Guards in the same code: `"Cannot use --server/--headless with --ui-server. Use --server or --headless for headless mode, or --ui-server for TUI + server mode."` and `"Cannot use --stdio with --ui-server. Use --server --stdio for headless stdio mode."` (`--managed-server` additionally needs the `SESSIONS_SIDEBAR_TAB` feature flag.)

What `--ui-server` does at TUI start (app.js):

```
let be=await Dt.start();
x.info(`Embedded server TCP listener started on port ${be}`),
io(l,"server",`Server listening on port ${be}`,{ephemeral:!0})      // shown in the TUI
…
Dt.registerSession(l.sessionId,{trusted:!1});                        // the TUI's own session is registered with the server
```

Server JSON-RPC method table (app.js constant): `session.create, session.resume, session.destroy, session.abort, session.send, session.getMessages, session.list, session.getMetadata, session.getLastId, session.getForeground, session.setForeground, session.delete, tool.call, permission.request, userInput.request, …`. Transport is vscode-jsonrpc over TCP with `Content-Length` header framing (client bundle: `"Header must provide a Content-Length property"`); `cliUrl` accepts `"host:port"`, `"http://host:port"`, or `"port"`.

Delivery semantics (`copilot-sdk/generated/rpc.d.ts`):

```
/** How to deliver the message. `enqueue` (default) appends to the message queue.
    `immediate` interjects during an in-progress turn. */
export type SendMode = "enqueue" | "immediate";
```

and in app.js: `send(t){ if(this.activeTurn) return this.sendPendingMessage(t, t.mode==="enqueue" ? "queued" : "steering"); … dispatchTurn(t) }` — idle → starts a turn; busy → queued or steering. There is also `queue.insertAt`. This is functionally the Claude inbox.

`--connect` / `--remote` are the **GitHub cloud relay** ("mission control": `setRemoteSteerable`, `remote_steerable`, `mc_session_id`), steerable only from GitHub web/mobile; not a local channel and not usable by a daemon.

Hooks (names embedded in `runtime.node` and as settings keys `hooks.*` in app.js): `sessionStart, sessionEnd, userPromptSubmitted, userPromptTransformed, preToolUse, preMcpToolCall, postToolUse, postToolUseFailure, errorOccurred, agentStop, subagentStart, subagentStop, preCompact, permissionRequest, notification` (+ `disableAllHooks`). Files: `~/.copilot/hooks/*.json` (user) and `.github/hooks/*.json` (repo), entries `{"type":"command","bash":"…","timeoutSec":30}`.

MCP: app.js contains the MCP client schemas for `resources/subscribe` and `notifications/resources/updated`, but nothing wires a resource update into a prompt/turn. Copilot only acts on MCP when the model calls a tool.

No runtime slash command starts the embedded server (`"/server"`, `"/listen"`, `"/port"` absent from app.js) — a seat launched without `--ui-server` cannot be switched on later.

### Docs

- Use Copilot CLI (docs.github.com): programmatic `-p`, `/settings`, `--resume`/`--continue`, hooks and MCP pointers; nothing on sending input to a running session.
- ACP server reference: `copilot --acp` with `--stdio` (NDJSON, parent-owned) or `--port N` (TCP, loopback, multiple clients); "The server creates new sessions only; it does not attach to existing interactive CLI sessions."
- SDK "backend services": `copilot --headless --port 4321` … `new CopilotClient({ cliUrl: "localhost:4321" })`; "multiple SDK clients can share one CLI server". Headless = no TUI.
- copilot-sdk discussion #1114 "Documentation on the --ui-server command line": undocumented, but `--ui-server --port #` works and the maintainer points at `getForegroundSessionId` / `setForegroundSessionId` and `session.foreground` events for interacting with the TUI's session. Treat as unsupported.
- Hooks reference: `userPromptSubmitted` command-hook output is **dropped** (only SDK programmatic hooks may `modifiedPrompt`); `sessionStart` may return `additionalContext`; `agentStop` may return `{"decision":"block","reason":…}` to force another turn (max 8); `notification` (types `shell_completed, shell_detached_completed, agent_completed, agent_idle, permission_prompt, elicitation_dialog`) is fire-and-forget and "When `additionalContext` is returned, the text is injected into the session as a prepended user message. This can trigger further agent processing if the session is idle."

### Verdict — Copilot

- **Seats as running now (no `--ui-server`): NO.** No socket, pipe, port, or watched file exists; nothing can be enabled at runtime. Only tmux keystrokes reach them (or a hook on their next event, if hooks are picked up without restart — unverified).
- **Seats spawned with `--ui-server --port <P>` (plus pij's existing `--session-id <uuid>`): YES.** Endpoint `127.0.0.1:<P>` (loopback, unauthenticated), protocol vscode-jsonrpc / `Content-Length` framing, method `session.send` with `{sessionId:<uuid>, prompt:"…", mode:"enqueue"|"immediate"}`.

Test snippet A (official client, node; the bundled SDK is importable):

```js
import { CopilotClient } from "/Users/vaughanknight/.copilot/pkg/darwin-arm64/1.0.81-9/copilot-sdk/index.js";
const c = new CopilotClient({ cliUrl: "localhost:47111" });
await c.start();
const fg = await c.getForegroundSessionId();          // should equal the --session-id we passed
const s  = await c.resumeSession(fg, { onPermissionRequest: () => ({ kind: "approved" }) });
await s.send({ prompt: "[pij] 1 message — run: pij inbox", mode: "enqueue" }); // or "immediate"
```

Test snippet B (raw, python — proves the wire format independent of the SDK):

```python
import json, socket
def rpc(sock, id_, method, params):
    body = json.dumps({"jsonrpc":"2.0","id":id_,"method":method,"params":params}).encode()
    sock.sendall(b"Content-Length: %d\r\n\r\n" % len(body) + body)
s = socket.create_connection(("127.0.0.1", 47111))
rpc(s, 1, "session.getForeground", {})
rpc(s, 2, "session.send", {"sessionId": "<uuid>", "prompt": "[pij] ping", "mode": "enqueue"})
print(s.recv(65536))
```

Caveats to settle in the proof: exact `session.send` param names (check `generated/rpc.d.ts` line ~11720-11760 for the request interface), whether the SDK insists on `session.resume` before `session.send` on a session that is already the TUI foreground, what `trusted:false` restricts, that hooks/`--remote` are unaffected, and that pij's `adopt --session-id` binding still matches (session id is unchanged by the flag).

---

## Codex

### Live evidence

- No codex processes: `pgrep -x codex` → nothing; only `cryptexd/codex.system` PATH entries match `-f`.
- The local install is broken: `/opt/homebrew/lib/node_modules/@openai/codex` is 0.98.0 (Feb 2026); `vendor/aarch64-apple-darwin/codex/` is empty; `codex --version` → `spawn …/codex ENOENT`. No brew/cargo codex either. Upstream latest release: `rust-v0.150.1`.
- `~/.codex/`: `config.toml` (only `[mcp_servers.perplexity]`, `[mcp_servers.flowspace]`), `prompts/`, `skills/`, `tmp/`. No `sessions/`, no `hooks.json`.

So no `lsof` is possible today; evidence below is from docs and source (`gh api repos/openai/codex/contents/…`).

### Binary / protocol evidence (upstream main, 2026-08)

`codex-rs/app-server/README.md`:

- Protocol: JSON-RPC 2.0 (the `"jsonrpc":"2.0"` field is omitted on the wire).
- Transports: `--listen stdio://` (default; JSONL), `--listen ws://IP:PORT` (one message per text frame; **experimental / unsupported**; serves `/readyz`, `/healthz`), `--listen unix://` or `unix://PATH` ("websocket connections over `$CODEX_HOME/app-server-control/app-server-control.sock` … using the standard HTTP Upgrade handshake"), `--listen off`. `codex app-server proxy [--sock PATH]` bridges stdin/stdout to that socket. Auth options: `--ws-auth capability-token --ws-token-file`, `--ws-auth signed-bearer-token --ws-shared-secret-file`.
- Methods: `thread/start`, `thread/resume`, `thread/fork`, `thread/list`, `thread/read` (reports `canAcceptDirectInput`), `thread/subscribe`/`thread/unsubscribe` (per-connection), `turn/start`, **`turn/steer`** ("add user input to an already in-flight regular turn without starting a new turn; returns the active `turnId`"; example params `{threadId, clientUserMessageId, input:[{type:"text",text:"…"}], expectedTurnId}`), `turn/interrupt`, `thread/queue/start` (queued submissions), hooks fire `SessionStart`/`SessionEnd` from the server.
- Ownership: "Only one app-server process can hold a paginated thread open for writing at a time. If another process already owns the thread, `thread/resume`… fail with JSON-RPC error `-32600`." A second **connection** to the same server is fine: "resuming an already-loaded thread waits for the next live update", and "A different app-server connection cannot change [the MCP profile] by starting a later turn" (i.e. other connections may start turns).
- `codex-rs/cli/src/main.rs:970 struct InteractiveRemoteOptions`: `--remote <ADDR>` "Connect the TUI to a remote app server endpoint. Accepted forms: `ws://host:port`, `wss://host:port`, `unix://`, or `unix://PATH`", `--remote-auth-token-env`. Default socket resolved via `codex_app_server::app_server_control_socket_path(&codex_home)`.
- `codex-app-server-daemon` (experimental, Unix-only): `codex app-server daemon start|stop|…` runs a pidfile-backed app-server on the control socket for remote-management clients.
- Interactive `codex` without `--remote` runs core in-process: no listener, rollouts in `~/.codex/sessions`, sqlite state under `$CODEX_HOME`. Nothing re-reads a file for input.
- `codex exec` (non-interactive): `--json`, `-o`, `codex exec resume --last|<id>`; separate process, cannot post into a running TUI.
- Hooks (config reference): events `SessionStart, SessionEnd, PreToolUse, PostToolUse, PermissionRequest, PreCompact, PostCompact, UserPromptSubmit, SubagentStart, SubagentStop, Stop`; files `~/.codex/hooks.json`, `<repo>/.codex/hooks.json`, or `[hooks]` in `config.toml`; gated by `features.hooks`; stdin JSON (`session_id, cwd, hook_event_name, …`); stdout `{"additionalContext": "…"}` merges into the model prompt, `{"decision":"block"}` / exit 2 blocks, `{"continue": false}` stops, `Stop` must answer JSON. `notify = ["cmd"]` receives a JSON payload on turn completion (notification only).
- MCP: `mcp_servers.<id>.*` in config.toml; server-initiated pushes only via experimental `mcpServer/event/stream/*` on app-server — no "prompt the agent" path.

### Verdict — Codex

- **Plain interactive `codex` TUI: NO.** In-process core, no transport, no re-read state; the only external inputs are hooks (on the next prompt/stop event) and keystrokes.
- **pij-owned topology: YES.** pij runs `codex app-server --listen unix://$HOME/.pij/<seat>/codex.sock` (background, owned by pij) and puts `codex --remote unix://$HOME/.pij/<seat>/codex.sock` in the pane — a real TUI, rendered by codex itself, not by pij. The daemon opens a second websocket on the same socket and uses `thread/list` → `thread/resume {threadId, excludeTurns:true}` (subscribes) → `turn/start` when idle or `turn/steer {threadId, input:[…], expectedTurnId}` when a turn is active. This is a variant of fallback (d) where pij owns the *server* but codex still owns the *rendering*.

Test snippet (python, `pip install websockets`; websocket over unix socket):

```python
import asyncio, json, websockets
SOCK = "/Users/vaughanknight/.pij/scratch/codex.sock"
async def main():
    async with websockets.unix_connect(SOCK, uri="ws://localhost/") as ws:
        async def call(i, m, p): await ws.send(json.dumps({"id":i,"method":m,"params":p})); 
        await call(1, "initialize", {"clientInfo":{"name":"pij","version":"0"}})
        await call(2, "thread/list", {})
        # pick the threadId shown in the pane's TUI (thread/started) then:
        await call(3, "thread/resume", {"threadId": THREAD, "excludeTurns": True})
        await call(4, "turn/start", {"threadId": THREAD, "input":[{"type":"text","text":"[pij] 1 message — run: pij inbox"}]})
        # while a turn is active instead:
        # await call(5, "turn/steer", {"threadId": THREAD, "input":[{"type":"text","text":"…"}]})
        for _ in range(20): print(await ws.recv())
asyncio.run(main())
```

Open questions for the proof: does the remote TUI render `userMessage` items started by another connection (README says per-connection subscriptions; the TUI is subscribed to its own thread, so item notifications should reach it), the exact `initialize` params for v0.150, and whether the unix listener requires `--ws-auth`.

---

## pi (brief)

`pi --mode rpc` (pi 0.83.0; `--mode text|json|rpc`) is a headless JSON/JSONL-over-stdio embedding mode used by `pi-acp` and phone-remote projects — it gives pij a fully driveable agent but no TUI in the pane, so it is fallback (d) for pi. For *visible* pi seats pij already has the socket-equivalent: extension `.pi/extensions/file-watch-notify/inject.ts` watches a file transport and calls `pi.sendUserMessage(text)` when `ctx.isIdle()` (starts a turn) or `pi.sendUserMessage(text, { deliverAs: "steer" })` when streaming (queued after the current assistant turn). Extensions cannot expose bespoke RPC endpoints (docs/plans/001-pi-extensions/findings/01-extension-api.md:354), so file-watch remains the transport. pi is therefore YES via pij-owned extension, and needs no change from this review.

---

## Fallback ranking + recommended proof

Legend: (a) one-line pointer typed into the pane + body read via `pij inbox`; (b) pij MCP server; (c) hooks that inject pending inbox; (d) pij owns the process in server/ACP mode.

**Copilot — legacy seats (launched without `--ui-server`), ranked**
1. **(a) typed pointer** — the only thing that reaches them now; one short idempotent line, body via shell tool. Keep.
2. (c) `~/.copilot/hooks/pij.json` `notification` hook (types `agent_idle`, `agent_completed`) emitting `{"additionalContext": "<pending inbox>"}` — documented to inject "a prepended user message" that "can trigger further agent processing if the session is idle"; `agentStop` `{"decision":"block","reason":"[pij] inbox pending"}` forces another turn. Zero keystrokes, but whether a running seat picks up a newly created hooks file without restart is unverified (likely not).
3. (b) MCP — tool-poll only; Copilot ignores `notifications/resources/updated` for prompting. No push.
4. (d) `--headless`/`--acp` — headless (pij would render the pane itself). Worst.

**Copilot — new seats: (d′) `--ui-server --port <P>`** beats all of the above: same TUI, same `--session-id`, loopback JSON-RPC `session.send` with `enqueue`/`immediate`. Then (c) as the idle-time backstop, then (a).

**Codex — legacy plain-TUI seats**: 1. (a) typed pointer; 2. (c) `~/.codex/hooks.json` `UserPromptSubmit` → `additionalContext` (only on next prompt) and `Stop` → `{"continue": false}`/block with reason; 3. (b) MCP tool-poll; 4. (d) `codex exec`/app-server headless.
**Codex — new seats: (d′) pij-owned `codex app-server --listen unix://…` + `codex --remote unix://…` in the pane**, then (c), then (a).

**Recommendation**: adopt the "server-flag at spawn" pattern for both — Copilot `--ui-server --port <pij-chosen free port>`, Codex `app-server unix socket + --remote TUI` — recorded in the seat json (`ipc: {kind:"copilot-ui-server", port}` / `{kind:"codex-app-server", sock}`), with (a) retained for seats that predate it. Fix the codex install first (`npm i -g @openai/codex@latest`, expect rust-v0.150.x).

**Proof on a scratch seat (design only; do not touch the four live seats)**

Copilot:
1. In a scratch tmux window: `copilot --ui-server --port 47111 --session-id $(uuidgen) --yolo -C /tmp/pij-scratch`. Expect ephemeral "Server listening on port 47111" in the TUI; `lsof -iTCP -sTCP:LISTEN -a -p <native pid>` shows `127.0.0.1:47111`; `~/.copilot/logs/process-*.log` has `Embedded server TCP listener started on port 47111`.
2. Idle case: run snippet A (or B). Pass = the pane shows `[pij] 1 message — run: pij inbox` as a user message and the agent answers without any tmux send-keys.
3. Busy case: type in the pane `run: for i in $(seq 1 30); do echo $i; sleep 1; done` then, mid-turn, send `mode:"immediate"` (expect interjection) and separately `mode:"enqueue"` (expect delivery after the turn).
4. Regression checks: `pij adopt`/daemon binding unchanged (same `--session-id`), hooks still fire, `copilot --resume=<id> --ui-server --port …` restores the server, and a second client connection does not steal the foreground.
5. Record: exact `session.send` param shape, response ids, and any `trusted:false` refusals.

Codex:
1. Install ≥0.150; `codex app-server --listen unix:///Users/vaughanknight/.pij/scratch/codex.sock` in the background; pane: `codex --remote unix:///Users/vaughanknight/.pij/scratch/codex.sock`; note the thread id from the TUI.
2. Run the python snippet: `thread/resume` then `turn/start` while idle; pass = the pane renders the injected user message and replies.
3. Busy case: start a long shell in the TUI, then `turn/steer`; pass = steered text appears in the same turn; also confirm `-32600` does **not** occur (same server process, different connection).
4. Negative control: with a plain `codex` (no `--remote`) running, confirm no socket exists and that a separate `codex app-server` cannot `thread/resume` its live thread (`-32600`).

---

## Sources

- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/use-copilot-cli
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
- https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/use-hooks
- https://docs.github.com/en/copilot/reference/hooks-reference
- https://docs.github.com/en/copilot/how-tos/copilot-sdk/set-up-copilot-sdk/backend-services
- https://github.com/github/copilot-sdk (README, docs/getting-started.md)
- https://github.com/github/copilot-sdk/discussions/1114 (`--ui-server`)
- https://github.com/github/copilot-cli (README)
- Local: `~/.copilot/pkg/darwin-arm64/1.0.81-9/app.js`, `…/copilot-sdk/{client.d.ts,generated/rpc.d.ts,index.js}`, `…/prebuilds/darwin-arm64/runtime.node` (strings)
- https://learn.chatgpt.com/docs/app-server (redirect target of developers.openai.com/codex/app-server)
- https://learn.chatgpt.com/docs/config-file/config-reference
- https://learn.chatgpt.com/docs/non-interactive-mode
- https://learn.chatgpt.com/docs/hooks
- https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md (fetched via `gh api`)
- https://github.com/openai/codex/blob/main/codex-rs/app-server-daemon/README.md
- https://github.com/openai/codex/blob/main/codex-rs/cli/src/main.rs (`InteractiveRemoteOptions`, `app_server_control_socket_path`)
- https://github.com/openai/codex/tree/main/docs (exec.md, config.md)
- pij: `docs/plans/014-pi-session-messaging/progress-so-far.md`, `docs/plans/001-pi-extensions/findings/01-extension-api.md`, `.pi/extensions/file-watch-notify/inject.ts`, `.pi/extensions/pij/core/spawn.ts`
