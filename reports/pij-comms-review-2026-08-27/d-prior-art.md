# (d) Prior art: how other multi-agent terminal-CLI systems get a message INTO a running agent session

Research sub-seat (d) for the pij communications architecture review, 2026-08-27.
Scope: reception side only (how a body reaches the recipient agent's context). Sending side, registry and daemon design are other seats.

Verified locally where noted: Claude Code 2.1.247 installed at `~/.local/share/claude/versions/2.1.247` (Bun-compiled Mach-O); this machine currently has four live inbox sockets in `/tmp/cc-socks/` and per-session registry records in `~/.claude/sessions/<pid>.json`. Everything else is from the cited sources.

---

## 1. Claude Code input channels

Claude Code has, in the last ~6 months, grown three first-class non-TTY inbound channels. Any of them makes the TTY-typing path obsolete for Claude peers.

### 1.1 Cross-session messaging: the per-session inbox socket (v2.1.224+, on by default)

This is the headline finding. Every interactive **and** `claude -p` session (not `--bare`) binds a Unix domain socket and registers itself on disk:

- Socket: `/tmp/cc-socks/<pid>.sock`, mode `srw-------` (verified locally: `72375.sock`, `74347.sock`, `83463.sock`, `84394.sock`).
- Registry: `~/.claude/sessions/<pid>.json` plus a `<pid>.<hex>.key` auth-key file. Verified record (this seat's parent session):
  ```json
  {"pid":74347,"sessionId":"e83164a1-…","cwd":"/Users/vaughanknight/GitHub/perimenocause",
   "version":"2.1.247","peerProtocol":1,"peerFeatures":["notify_idle","artifact_yield"],
   "kind":"interactive","entrypoint":"cli","tmux":"peri-prime:@19.%38",
   "messagingSocketPath":"/tmp/cc-socks/74347.sock","name":"perimenocause-b0",
   "nameSource":"derived","status":"idle","updatedAt":1787796090487}
  ```
  Note the `tmux` field: Claude Code already records its own tmux `session:@window.%pane` — pij can map pane → socket with no scraping.
- Exported to every hook and Bash child as `CLAUDE_CODE_MESSAGING_SOCKET` and `CLAUDE_CODE_MESSAGING_TOKEN` (verified in this shell's env).
- Tools: `ListAgents` (also `/list-agents`, `/peers`) and `SendMessage` (name-addressed; `notify_when_idle` one-shot idle notice, v2.1.236+). `/status` shows the `Peer address` row as `uds:…`.

**Wire format (not in the docs; recovered from the binary's own log string, untested here):** newline-delimited JSON; optional auth line first (required on Windows only):
```
{ echo '{"type":"auth","token":"'"$CLAUDE_CODE_MESSAGING_TOKEN"'"}';
  echo '{"type":"user","message":{"role":"user","content":"hello"}}'; } | socat - UNIX-CONNECT:/tmp/cc-socks/<pid>.sock
```
Other frame types visible in the binary: `peer_message_status` (carries `orig_msg_id`, `dropped_msg_ids`, `drop_reason`, `wereHeld`), `notify_when_idle`, `peer_idle_notice`, `yield_artifact_replies`. Frames with an unknown `type` or a non-string `content` are logged and ignored; over-long lines drop the connection; a connection that sends no complete line within a deadline is closed. User messages are "Routed … to queue (priority=…)".

**Delivery semantics (documented):**
- "The receiving Claude reads the message between tool calls during an active turn, so a running tool is never interrupted. When the receiving session is idle, Claude Code starts a new turn with the message." — i.e. mid-turn steering, not a lost keystroke.
- The receiver labels it as from another session, not the user; it cannot approve permissions or run slash commands (`/compact` arrives as text).
- Inbound policy `crossSessionInbound` = `accept | hold | refuse`. **Default when unset is class-based: a `bypassPermissions` receiver HOLDS messages from a non-bypass sender for human approval (5-minute `dialogExpiry`).** pij fleets that run `--dangerously-skip-permissions` must set `crossSessionInbound: accept` (per-session `--settings` or user settings) or messages silently sit in a dialog.
- Own-child exception: a hook or Bash child of the session posting to its own socket is delivered even with no setting, verified by process evidence (Linux) or by the token (macOS after the child exits).
- Sender-side back-pressure: ~1 MB cap; rapid-burst refusal at sender (v2.1.236+, before that receiver dropped silently); receiver queues at most 50, de-dupes identical repeats, rate-limits per sender.
- Not available on Bedrock/Vertex/Foundry, or when `DISABLE_TELEMETRY`/`DO_NOT_TRACK`/`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`/`DISABLE_GROWTHBOOK` turn off the feature-flag fetch. `--bare` sessions bind no socket.
- Known bug: issue #84945 — one of two identical sessions silently failed to bind its socket; the record then lacks `messagingSocketPath` and sends fall back to a Remote Control bridge and get refused. Treat "no `messagingSocketPath` in the record" as "socket down, fall back".

### 1.2 Channels: an MCP server that pushes into the session (research preview)

An MCP stdio server declaring `capabilities.experimental['claude/channel'] = {}` and emitting `notifications/claude/channel` with `{content, meta}` delivers the body into Claude's context as `<channel source="name" k="v">body</channel>`. "Events queue into the session and are processed in order. If several notifications arrive while Claude is busy, they're delivered together on the next turn." Enabled per session with `--channels plugin:…` (allowlisted plugins only) or `--dangerously-load-development-channels server:<name>` for a local `.mcp.json` server. Needs claude.ai or Console auth; Team/Enterprise must set `channelsEnabled`. `mberg/agent-http` is an example of exactly this: an HTTP inbox bridged into a live session via the channel protocol, chosen for "exact message fidelity" over terminal parsing.

Difference from the socket: channels deliver **on the next turn** (batched), the socket delivers **between tool calls of the current turn**. The socket needs no flag; channels need a startup flag and are org-gated.

### 1.3 Hooks

- `UserPromptSubmit`: plain stdout or JSON `additionalContext` is injected before Claude sees the prompt — but it only fires when a prompt is submitted. Community reports (issue #27441, Gas Town's `UserPromptSubmit → gt mail check --inject`) confirm it "works when the human is present … but does not enable autonomous agent-to-agent messaging".
- `SessionStart`: same injection, good for "drain inbox on (re)start".
- `Stop`: exit 2 (or JSON block) prevents the turn ending and feeds text back — the Ralph-loop mechanism (`plugins/ralph-wiggum`, later native `/loop`). Usable as "before you stop, check `pij inbox`"; costs a model call per turn end.
- `Notification`: cannot inject (output discarded). `TeammateIdle`, `TaskCreated`, `TaskCompleted` are agent-team hooks. There is no `InboxMessage`/peer-delivered hook event; the docs answer is the socket.

### 1.4 Agent teams (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)

Teammates are separate sessions with a file mailbox at `~/.claude/teams/{team}/inboxes/{agent}.json`; a write is reported "sent" only when the file write succeeds; malformed entries were fatal before v2.1.207. Split-pane mode uses tmux/iTerm2 but the transport is still the mailbox, not `send-keys`. Issue #23456: tmux-mode teammates "sit idle at the startup screen … mailbox messages remaining at `read: false`" — the file mailbox with no wake-up is the documented failure. Default is now in-process, and `-p`/SDK sessions cannot spawn teammates. Not reusable by pij for non-Claude peers.

### 1.5 Headless, SDK, resume, background sessions

- `claude -p` reads stdin (10 MB cap), `--output-format stream-json`, `--input-format stream-json` for a persistent process; the Agent SDK's streaming-input mode (`AsyncGenerator<SDKUserMessage>`) supports "Queued messages: send multiple messages that process sequentially, with ability to interrupt" — the same mid-turn steering, but only for a session pij spawns itself.
- `--resume <id>` from another process starts a **new** process on the transcript; it does not attach to a live TTY session. Not a delivery channel.
- Background sessions (`claude --bg`, supervisor daemon, `claude attach <id>`, `~/.claude/jobs/<id>/state.json`, `~/.claude/daemon/roster.json`): follow-ups are sent from agent view or by attaching; no CLI flag. They do bind inbox sockets, so the socket is still the way in.
- Interactive queue: "Type a message and press Enter while Claude is working. Claude Code queues the message … if you queue a message while Claude is running tool calls, Claude Code passes it to Claude as soon as those tool calls finish, within the same turn." This is what typing into the pane relies on, and it is exactly the path whose paste/Enter race clips pij bodies (section 2).

**Answer to "most reliable way in without the TTY":** the inbox socket (1.1). It is on by default, has an ACK (`peer_message_status`), a sender-side size/burst refusal, mid-turn delivery, and a stable on-disk registry that already records the tmux pane.

---

## 2. tmux-based orchestrators

Every tool that drives a CLI through the pane has converged on the same defensive recipe, and every one documents the same failure class.

| Tool | Send recipe | Busy/ready detection | Known input bugs |
|---|---|---|---|
| **Tmux-Orchestrator** (Jedward23) `send-claude-message.sh` | `tmux send-keys -t W "$MSG"; sleep 0.5; tmux send-keys -t W Enter` — no `-l`, so `#`/`!`/newlines break | none | message is `$*`, multi-line impossible |
| **Gas Town** (`gt nudge`, `internal/tmux/tmux.go` `NudgeSession`, "the canonical way to send messages to Claude sessions") | exit copy-mode (`send-keys -X cancel`, 50 ms) → sanitise control chars → `send-keys -l` in **512-byte chunks** with 10 ms gaps → adaptive delay 500 ms + 25 ms/chunk (max 2 s) → `Escape` + 600 ms (leave vim-insert; must exceed readline's 500 ms keyseq-timeout) → detect Claude's *Rewind* UI via `capture-pane` and dismiss → `sendEnterVerified` (capture ~5 lines before/after, retry Enter with 500 ms→1 s→2 s backoff, max 3) → `resize-window` dance to fire SIGWINCH and wake the pane | `WaitForIdle` polls `capture-pane` last ~12 lines for the prompt glyph with a spinner override; 15 s wait-idle then a 60 s background watcher at 1 s; degrades to **queue mode** for agents with no detectable prompt (Copilot CLI: fixed 5 s delay "since Copilot CLI doesn't emit a detectable prompt prefix"; Codex: no hooks, wrapper runs `gt prime` first) | Escape "cancels in-flight generation" on Copilot; nudges are one-liners, bodies live in `gt mail` (beads) and are pulled by `gt mail check --inject` from `SessionStart`/`UserPromptSubmit` hooks |
| **primeline claude-tmux-orchestration** | single-line: `send-keys -l "$P"; sleep 0.5; send-keys Enter`; multi-line: `echo "$P" \| tmux load-buffer -b buf -; tmux paste-buffer -p -d -b buf -t T; tmux send-keys -t T Enter` | `capture-pane` regex for `❯` prompt / "waiting for input"; `.ready` file handshake "prevents prompt collisions"; heartbeat 30/120/300 s | `_orchestrator/inbox/w1/` file inbox for escalations, drained by injecting `/orchestrate-cycle` |
| **GGPrompts pmux** | `send-keys -l "…"; sleep 0.3; send-keys C-m` — "CRITICAL: 0.3s delay prevents submit before prompt loads (especially for long prompts)" | `capture-pane \| tail -5` after send | — |
| **obra/claude-session-driver** | bracketed paste: `send-keys -l "${PASTE_START}${SAFE}${PASTE_END}"; sleep 0.1; send-keys Enter` | — | issue #20: "Enter gets sent before Claude Code converts the bracketed paste into its pending input widget"; pane shows `[Pasted text #1 +11 lines]` and never runs; proposed fixes: wait for pending-paste marker, configurable delay, retry Enter, "fall back to writing the command to a file the target reads on its own polling cycle" |
| **mitsuhiko agent-stuff tmux skill** | `send-keys -t target -l -- "$cmd"` then `Enter` as a separate call; `wait-for-text.sh -p '^>>>' -T 15` polling before sending | pattern polling | "the non-basic console interferes with your send-keys" (interactive readers eat input) |
| **obra superpowers tmux skill** | sleep after start; "always send Enter as a separate argument"; key names not raw chars | capture-screen loop | — |
| **claude-squad** (Go) | writes bytes straight to the PTY (`TapEnter` = `0x0D`, `SendKeys` raw), no delays, no bracketed paste; new prompts only at session create | `HasUpdated()` greps captured pane for "No, and tell Claude what to do differently" / trust dialogs | designed for human re-prompting, not agent-to-agent bodies |
| **vibe-kanban, claude-flow, ccswarm** | do not type into panes at all: vibe-kanban spawns agents as subprocesses with state in SQLite ("the first idea was … multiple agents in tmux, but agents overwrite each other's files"); claude-flow uses MCP tools + SQLite memory; ccswarm is worktree isolation | n/a | n/a |
| **Ralph loops** | none — a `Stop` hook re-feeds the prompt; no external input needed | n/a | n/a |

Failure classes documented against Claude Code specifically:
- **Paste/Enter race**: Enter absorbed into the bracketed-paste block or arriving before the paste widget exists (claude-session-driver #20; shukebeta "tmux send-keys silently drops the final Enter": "the dispatcher sees success. Nothing happened … any async channel where the sender gets a local exit code instead of a structured delivery ACK has this failure class").
- **`send-keys -l` dead after Esc,Esc on multi-line input** (claude-code #31739): only `paste-buffer -p` still works until `/clear`.
- **Newlines lost with `extended-keys-format csi-u`** (#43169): tmux encodes CR inside bracketed paste as CSI-u and Claude's paste tokenizer drops them.
- **Modal UIs eat input**: Rewind prompt, trust dialog, bypass-permissions warning, vim insert mode, copy mode (all handled case-by-case in Gas Town).
- **Anthropic's own tmux teammate backend** was the subject of #23456/#14109 ("Old (tmux) – fragile text-based: `tmux send-keys …`"); the shipped replacement is the socket in 1.1.

Net: the community's best `send-keys` path (Gas Town) is ~10 steps, per-agent tuned, verified by screen-scraping, and still only carries a one-line nudge; the body goes through a file/DB and a hook. Nobody who has tried pushes multi-line bodies through the pane on purpose.

---

## 3. Codex CLI and Copilot CLI channels

### Codex CLI
- `codex app-server` (`--listen stdio://` default, `ws://IP:PORT`, `unix://PATH`): bidirectional JSON-RPC 2.0 over JSONL. `initialize` → `thread/start` / `thread/resume` → `turn/start`; **`turn/steer` "adds user input to in-flight turn without starting new one"**; `turn/interrupt`; notifications `item/started`, `item/agentMessage/delta`, `item/completed`, `turn/completed`. This is the VS Code extension's transport.
- `codex exec` / `codex exec -` (stdin) / `codex exec --json` (JSONL events) / `codex exec resume --last|<id>` for one-shot and chained turns.
- **No way to inject into a running interactive TUI**: "The protocol does not support attaching to an existing running TUI"; `codex exec` and the TUI are separate paths. A Codex pane driven by pij can only be reached via the TTY, or pij must own the process via app-server.
- No hooks (Gas Town: "Codex … Operates entirely without hooks", startup fallback nudges "Run gt prime").
- Codex can be an ACP agent via Zed's `codex-acp` adapter.

### Copilot CLI
- `copilot --acp --stdio` (default) or `--acp --port N`: native **Agent Client Protocol** server, NDJSON JSON-RPC (`initialize`, `session/new`, `session/prompt`, `session/update`, `session/cancel`); TCP mode accepts multiple connections, "each handled as its own agent connection".
- Copilot SDK (Node/Python/Go/.NET/Rust/Java) spawns `copilot --headless --stdio` or `--headless --server` (TCP) and can connect to an external server (`RuntimeConnection.forUri`/`cliUrl`); `session.send()` "queues a message, returns immediately with message ID", `sendAndWait()`, `resumeSession(id)`, events `session.idle`, `assistant.message`, `tool.execution_*`. Churn warning: v0.0.410–0.0.413 removed `--headless --stdio` with no deprecation and broke every SDK version (#1606); SDK negotiates "protocol versions 2 through 3". Pin versions.
- `copilot -p "…"` (+ `-s` silent, `--allow-tool`, `--no-ask-user`, stdin piping, `--share`) for one-shot.
- Has lifecycle hooks (Gas Town treats Copilot as a hooks provider: `SessionStart → gt prime --hook && gt mail check --inject`, `UserPromptSubmit → gt mail check --inject`).
- **No documented way to inject into a running interactive `copilot` TUI**; Escape cancels generation (Gas Town caveat); no detectable prompt glyph, so busy detection is a fixed delay.

### pi (also in the pij fleet)
- `pi --mode rpc`: strict LF-delimited JSONL over stdin/stdout with `prompt`, **`steer`** ("delivered after tool execution, before next LLM call"), **`follow_up`** ("waits until agent stops"), `abort`, `clear_queue`, `set_steering_mode`/`set_follow_up_mode` (`all` | `one-at-a-time`), events `agent_start/end`, `agent_settled`, `queue_update`, `tool_execution_*`. Also has an SDK and a `pi-acp` adapter. Again: only for a process pij owns; no attach to an interactive pi.

Summary: all three non-Claude harnesses expose a rich JSON channel **only for processes the orchestrator spawns**. None exposes a socket to a live interactive session the way Claude Code now does.

---

## 4. Mailbox and protocol patterns

- **File inbox conventions** (all local, all need a wake-up):
  - Claude agent teams: `~/.claude/teams/{team}/inboxes/{agent}.json` (single JSON array, `read:false` flags, validated per entry; malformed entry used to block the whole mailbox).
  - `mailbox-mcp` (ellgree): MCP tools `mail_send/list/get/reply/status/thread` over `<repo>/.claude/{inbox,outbox}/*.md`; no push — agent must call `mail_list`.
  - `cc-to-cc`: maildir-style `~/.cc-to-cc/projects/<id>/inbox/{new,cur,archive}/` JSON (`id, from, to, subject, body, threadId, timestamp`) **plus a per-session local HTTP webhook so `watch` returns instantly** when the peer is online; offline peers read later.
  - `session-bridge` (Shreyas Patil): `~/.claude/session-bridge/sessions/<id>/{inbox,outbox}/` JSON with `pending→read` status; receiver runs `/bridge listen` which polls every 3 s (a whole turn burned on polling; 5–10 s latency).
  - primeline `_orchestrator/inbox/w<id>/` + `.ready` handshake; Gas Town: bodies in beads/`gt mail`, delivered by hooks (`gt mail check --inject`) and a one-line tmux nudge.
  - Pattern that works: **body on disk (atomic write, per-message file or append-only with ids), one-line wake-up on a real channel, receiver drains with an idempotent command.** Pattern that fails: file only (needs a human keystroke) or pane only (clips).
- **MCP as an inbound channel**: (a) polling tool (`mail_list`) — costs a turn to poll; (b) `resources/subscribe` + `notifications/resources/updated` — Claude Code supports `list_changed` refresh and `@server:resource` attachment, but a resource-updated notification does not start a turn, so it is not a wake-up; (c) **`claude/channel` notifications** — the only MCP push that lands in context (Claude-only, flag-gated, next-turn delivery).
- **A2A** (Google, Linux Foundation): JSON-RPC/HTTP, gRPC, REST bindings only; `SendMessage`, `SendStreamingMessage`, `GetTask`, `SubscribeToTask`, push-notification webhooks, Agent Card discovery. "No local, stdio, or file-based transport." Reusable idea: the message/task envelope (`taskId`, `contextId`, parts, task state machine) and Agent Card as the registry record; not the transport.
- **IBM ACP** (Agent Communication Protocol, BeeAI): REST over HTTP, "local-first", agent discovery + run lifecycle; effectively merged into A2A direction. Same verdict: envelope ideas only.
- **Zed ACP** (Agent Client Protocol): JSON-RPC over stdio for a sub-process; `session/new`, `session/prompt`, `session/update`, `session/cancel`, `session/request_permission`, stop reasons. Implemented natively by Copilot CLI and Gemini CLI, via adapters by Claude Code (`claude-agent-acp`), Codex (`codex-acp`), pi (`pi-acp`) and ~40 others. This is the one protocol that already spans every harness in the pij fleet — but as a **spawn-and-own** model (the client is the parent process). It is the right abstraction if pij ever moves from "attach to panes" to "own the agent processes and render them into panes".

---

## 5. Recommended reception model per harness

Options as framed: (i) type body into TTY; (ii) type a one-line notification, agent runs `pij inbox` to read the body from disk; (iii) MCP server the agent polls/subscribes; (iv) hook-based injection.

| Model | Pros | Cons | Claude Code | Codex CLI | Copilot CLI | pi |
|---|---|---|---|---|---|---|
| (i) body via TTY | works on anything with a pane | paste/Enter race, CSI-u newline loss, `-l` dead after Esc,Esc, modal UIs, chunk limits, no ACK, no busy semantics; every orchestrator that tried added 5–10 mitigation steps and still moved bodies off the pane | avoid (socket exists) | fallback only | fallback only | fallback only |
| (ii) one-line nudge + `pij inbox` from disk | body is never on the wire; single-line `send-keys -l` + separate Enter is the one tmux path with a good record; idempotent, re-drainable, debuggable (`cat` the file) | nudge itself can still be dropped (needs verified-Enter + retry like Gas Town); costs a tool call per delivery; busy pane means nudge is queued as a mid-turn user message | works (and the nudge line can go through the socket instead of the pane) | **primary** — no other channel into a live TUI; add wrapper/idle heuristics (no prompt hooks) | **primary** — pair with `UserPromptSubmit`/`SessionStart` hooks running `pij inbox --inject` so any keystroke also drains; 5 s fixed readiness delay | **primary** for an interactive pi; `steer`/`follow_up` if pij owns it |
| (iii) MCP inbound | structured, no TTY | polling tool costs a turn and needs the agent to remember; resource notifications don't start turns; `claude/channel` push is Claude-only, flag- and org-gated, next-turn delivery | channel push is a good **second** path when the socket is off (Bedrock/telemetry-off) | polling only | polling only | polling only |
| (iv) hook injection | zero-cost drain of pending mail on every prompt/start; `Stop` hook can force an inbox check before going idle | needs a turn boundary to exist — no autonomous wake-up on its own (#27441); Codex has no hooks | use as **belt-and-braces**: `SessionStart` + `UserPromptSubmit` → `pij inbox --inject`; optional `Stop` gate | not available | available (Gas Town does exactly this) | extension hooks exist; treat like Copilot |

**Recommendation for the pij daemon (single machine):**

1. **Claude Code peers: deliver over the inbox socket.** Read `~/.claude/sessions/*.json`, match `tmux` (or `cwd`/`name`) to the pij seat, write `{"type":"auth",…}` + `{"type":"user","message":{"role":"user","content":<body or one-line pointer>}}` to `messagingSocketPath`, and treat `peer_message_status` as the ACK. Send a short body directly (mid-turn, between tool calls, no paste race) or, for long/multi-line bodies, keep the body on disk and send the pointer — the 1 MB cap and 50-deep queue are generous either way. Require `crossSessionInbound: accept` in the fleet's `--settings`, because bypass-permissions receivers otherwise hold peer messages behind a 5-minute dialog. Fall back to (ii) if the record has no `messagingSocketPath` (#84945) or the feature is flagged off.
2. **Codex, Copilot, pi (interactive panes): model (ii).** One-line nudge, `send-keys -l` in ≤512-byte chunks, `Escape` only for Claude/pi (never Copilot), separate Enter, verify by `capture-pane` diff with backoff retry, body in the pij inbox on disk, `pij inbox` idempotent. Add `SessionStart`/`UserPromptSubmit` hooks where the harness has them (Copilot, Claude, pi) so a human keystroke also drains the inbox.
3. **Longer term:** the only cross-harness structured channel is spawn-and-own (Codex `app-server` `turn/steer`, Copilot `--acp`/`--headless --server`, pi `--mode rpc` `steer`, Claude SDK streaming input / `--input-format stream-json`). If pij ever owns the processes and renders them into panes, every harness gets a mid-turn `steer` with an ACK and the TTY problem disappears entirely; ACP is the neutral protocol to standardise on.

Verification note: the socket wire format above is transcribed from the 2.1.247 binary's own diagnostic string and not exercised in this seat (doing so would inject into a live session); the sending seat should run it against a throwaway `claude -p --settings '{"crossSessionInbound":"accept"}'` worker first.

---

## 6. Sources

Claude Code docs (code.claude.com)
- https://code.claude.com/docs/en/cross-session-messaging — inbox socket, `SendMessage`/`ListAgents`, delivery semantics, `crossSessionInbound`, `CLAUDE_CODE_MESSAGING_SOCKET`/`_TOKEN`
- https://code.claude.com/docs/en/channels — MCP channels overview, `--channels`, next-turn batching
- https://code.claude.com/docs/en/channels-reference — `claude/channel` capability, `notifications/claude/channel` `{content, meta}`, `--dangerously-load-development-channels`, permission relay
- https://code.claude.com/docs/en/agent-teams — mailbox at `~/.claude/teams/{team}/inboxes/{agent}.json`, tmux/iTerm2 split panes, limitations
- https://code.claude.com/docs/en/hooks — `UserPromptSubmit`/`SessionStart` stdout injection, `additionalContext`, `Stop` exit-2, `Notification` output ignored, `TeammateIdle`
- https://code.claude.com/docs/en/headless — `claude -p`, stdin, `--bare`, `--resume`, stream-json
- https://code.claude.com/docs/en/agent-sdk/streaming-input — streaming input mode, queued messages, interrupt
- https://code.claude.com/docs/en/interactive-mode — "Queue messages while Claude works", multiline input
- https://code.claude.com/docs/en/mcp — `list_changed`, resources/@-mentions, elicitation, "Push messages with channels"
- https://code.claude.com/docs/en/agent-view — background sessions, supervisor, `claude attach`
- https://code.claude.com/docs/en/errors — cross-session refusal reasons, 1 MB cap, rate limit, teammate inbox write failure

Claude Code issues / community
- https://github.com/anthropics/claude-code/issues/84945 — inbox socket bind failure, `/tmp/cc-socks/<pid>.sock`, `~/.claude/sessions/<pid>.json`
- https://github.com/anthropics/claude-code/issues/27441 — feature request for external injection; `UserPromptSubmit` inbox workaround fails unattended
- https://github.com/anthropics/claude-code/issues/23456 — tmux teammates never read mailbox
- https://github.com/anthropics/claude-code/issues/14109 — proposal to replace tmux teammate backend with MCP
- https://github.com/anthropics/claude-code/issues/31739 — `send-keys -l` dead after Esc,Esc
- https://github.com/anthropics/claude-code/issues/43169 — bracketed-paste newlines lost with csi-u
- https://github.com/anthropics/claude-code/blob/main/plugins/ralph-wiggum/README.md — Stop-hook loop
- https://github.com/mberg/agent-http/ — HTTP API into a live session via channels
- https://blakecrosley.com/blog/claude-code-cross-session-messaging — design overview
- https://claudefa.st/blog/guide/mechanics/cross-session-messaging — `uds:` peer address, own-child verification
- https://blog.shreyaspatil.dev/session-bridge-i-made-two-claude-code-sessions-talk-to-each-other/ — file inbox + 3 s polling
- https://github.com/takeshita-0x0201/cc-to-cc — maildir-style inbox + local webhook wake-up
- https://mcprepository.com/ellgree/mailbox-mcp — MCP mailbox tools over `.claude/{inbox,outbox}`

tmux orchestrators
- https://github.com/Jedward23/Tmux-Orchestrator and https://raw.githubusercontent.com/Jedward23/Tmux-Orchestrator/main/send-claude-message.sh
- https://github.com/steveyegge/gastown ; https://raw.githubusercontent.com/steveyegge/gastown/main/internal/tmux/tmux.go (`NudgeSession`, `sendEnterVerified`, 512-byte chunks) ; https://raw.githubusercontent.com/steveyegge/gastown/main/internal/cmd/nudge.go ; https://github.com/steveyegge/gastown/blob/main/docs/agent-provider-integration.md ; https://www.augusteo.com/blog/inside-gas-town/ ; https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04
- https://github.com/primeline-ai/claude-tmux-orchestration — `load-buffer`/`paste-buffer -p`, `.ready` handshake, file inbox
- https://gist.github.com/GGPrompts/800f2c67d96bceab836c0090b71488ef — `send-keys -l` + 0.3 s + `C-m`
- https://github.com/obra/claude-session-driver/issues/20 — bracketed paste vs Enter race
- https://blog.shukebeta.com/2026/05/17/tmux-send-keys-silently-drops-the-final-enter — verify-and-retry, file fallback
- https://raw.githubusercontent.com/mitsuhiko/agent-stuff/main/skills/tmux/SKILL.md — literal sends, wait-for-text
- https://claudemarketplaces.com/skills/obra/superpowers-lab/using-tmux-for-interactive-commands
- https://github.com/smtg-ai/claude-squad and https://raw.githubusercontent.com/smtg-ai/claude-squad/main/session/tmux/tmux.go
- https://virtuslab.com/blog/ai/vibe-kanban ; https://www.analyticsvidhya.com/blog/2026/03/claude-flow/ ; https://paddo.dev/blog/claude-code-hidden-swarm/

Codex / Copilot / pi
- https://raw.githubusercontent.com/openai/codex/main/codex-rs/app-server/README.md — `thread/start`, `turn/start`, `turn/steer`, `turn/interrupt`, transports
- https://learn.chatgpt.com/docs/non-interactive-mode — `codex exec`, `-`, `--json`, `resume`
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/acp-server — `copilot --acp --stdio|--port`
- https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference and https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically — `-p`, `-s`, `--allow-tool`
- https://github.com/github/copilot-sdk ; https://raw.githubusercontent.com/github/copilot-sdk/main/nodejs/README.md — `--headless --stdio|--server`, `send`/`sendAndWait`, `resumeSession`
- https://github.com/github/copilot-cli/issues/1606 — `--headless --stdio` removal breakage
- https://docs.github.com/en/copilot/how-tos/copilot-sdk/troubleshooting/sdk-and-cli-compatibility — protocol versions 2–3
- https://pi.dev/docs/latest/rpc — `pi --mode rpc`, `steer`, `follow_up`, JSONL framing

Protocols
- https://agentclientprotocol.com/overview/introduction ; https://agentclientprotocol.com/overview/agents ; https://agentclientprotocol.com/protocol/prompt-turn
- https://a2a-protocol.org/latest/specification/
- https://workos.com/blog/ibm-agent-communication-protocol-acp ; https://www.ibm.com/think/topics/ai-agent-protocols

Local verification (this machine, 2026-08-27): `claude --version` = 2.1.247; `/tmp/cc-socks/*.sock`; `~/.claude/sessions/74347.json`; `strings` of `~/.local/share/claude/versions/2.1.247` for the `[uds-messaging]` diagnostics quoted above.
