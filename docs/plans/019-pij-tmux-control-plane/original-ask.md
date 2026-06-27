# Original ask — pij-tmux-control-plane
**Captured**: 2026-06-27  ·  **By**: /the-flow  ·  *(distilled from conversation — the user's own framing preserved)*

> I want a way to control Claude Code — and later other harnesses like Copilot CLI — the way pij can already control pi, but using **tmux** as the transport.
>
> **Spawn flow.** We create a tmux window, run claude in it, then inject pij instructions. The agent is given its **pij-id at start — we generate the pij-id *before* we call it**. So the `pij` command creates the session, creates the tmux window, then hands in the pij-id. This pij-id can talk to pi-native sessions *or* tmux-native ones. I can also ask you to send a pij-id to an **existing** session in any tmux.
>
> **Daemon.** We need a **pij daemon / long-running process that runs once on the machine**. When a tmux-version pij agent gets sent an init command it calls the pij CLI and **"phones home"** — which means we can extract the harness session id. The creating agent then gets **verification** that the other agent was created. This linkage between the **Claude session id and the pij-id** means we can **tail** the other agent's session easily.
>
> **The end-to-end flow.** I'm working in claude and say "hey, create another claude to the right." It pops the tmux window, launches claude, **waits until it's up (we read tmux, look for a signal — all in code, not agent)**, then injects the pij-id; the agent calls back home; the session is logged. If we send messages to that session, **tmux injects them and presses enter** — this includes `/compact` etc. too. It **does not wait**, it **does not require the other claude to "check an inbox cli."** The claudes *can* use the CLI to send messages, since they won't have built-in tools like pi does with its pij tools.
>
> **Cross-compat** between pij, pi, and claude for a start (Copilot CLI later).
>
> **Roll file-mon into the daemon.** The pij daemon should also do the file-monitoring it does today (lift it out of the per-session pi extension). The daemon is **just a CLI I run in a tmux window** — it'll look slick with chalk and show all the activity going on (spawns, phone-homes, message flow, who's alive).

## Distilled requirements
- **Identity-first**: the pij-id is generated before launch and is the stable handle that outlives transport differences.
- **Phone-home handshake**: injected init → agent runs `pij` CLI (child inherits `CLAUDE_CODE_SESSION_ID` etc.) → daemon binds `pij-id ↔ harness-session-id ↔ pane ↔ cwd` → creator gets verification.
- **Two transports behind one surface**: file-inbox (pi self-injects in-process) and tmux `send-keys`+Enter (claude/copilot). pij picks transport by harness type.
- **Fire-and-forget**: controller never blocks; target never polls an inbox CLI.
- **Readiness detection in code**: poll `capture-pane` for a "ready" signal before injecting — no agent in the loop, no fixed sleep.
- **Tail linkage**: the id binding resolves the transcript path so a parent can tail a child out-of-band.
- **Daemon = switchboard + UI**: single machine-wide process owning watch + route + registry + a live chalk TUI; rebuildable from `~/.pij/` files (UI is a view, not source of truth).
- **Cross-harness**: pi, claude now; copilot-cli later — behind a harness-type seam.
- **Adopt existing sessions**: assign a pij-id + phone-home to an already-running tmux agent.

## Open decisions carried into planning
1. Readiness signal — exact pane text/state that means "ready to receive."
2. Inject-while-busy — accept native queueing vs gate on idle (and how to detect idle for a TUI seen only via `capture-pane`).
3. Multi-line / paste safety via `send-keys` (bracketed paste vs literal).
4. Daemon lifecycle — lazy start vs recipe; socket vs file rendezvous; crash recovery.
5. Phone-home timeout / failure semantics for the creator's verification wait.
6. Reuse vs rebuild against existing pij spawn/tmux/registry code (plans 014–017).
