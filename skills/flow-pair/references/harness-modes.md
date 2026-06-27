# Harness modes — pi tools vs the tmux control plane

flow-pair's colleague-comms seam has **two implementations**. The orchestrator
logic (decision loop, packets, ledger, review rubric, compact-early) is identical
across both — only **how a message reaches a colleague (and reaches the
orchestrator back)** changes. Detect the mode once at run start; use it everywhere.

## Why two modes

`pij` began as a **pi extension**: peers exchange messages through file-backed
inboxes, and each pi session's **in-process receiver** injects an inbound message
straight into its turn via `pi.sendUserMessage`. That seam is **pi-only** — it is
the one thing that cannot move out of process.

Plan 019 added a **machine-wide control plane** so pij can drive **non-pi**
harnesses (Claude Code today, Copilot later): a single **`pij daemon`** spawns a
harness in a tmux pane, binds its identity deterministically, and **relays
messages via tmux `send-keys`** instead of the in-process inject. Everything a pi
session did with the `pij_*` tools, a Claude orchestrator does with the `pij` CLI
+ the daemon.

> **The invariant:** pi keeps the in-process seam (old path, unchanged). Every
> **other** client uses the daemon + send-keys path. Never inject into a pi
> session from the daemon; never expect the in-process tools in a non-pi client.

## Detection (once, at run start)

1. Is the **`pij_spawn` tool** callable? → **pi mode**.
2. Otherwise → **control-plane mode** (you are in Claude Code / another client;
   the `pij` CLI is on `$PATH` and a `pij daemon` must be running).

(`PIJ_HARNESS` in the env is a secondary hint — `pi` vs `claude` — but tool
availability is the definitive signal.)

## Control-plane prerequisites

1. **One daemon, machine-wide.** Start it in its own tmux window:
   `npx tsx .pi/extensions/pij/daemon.ts` (or `pij daemon` once that verb ships).
   It is single-instance (a second one refuses), watches `~/.pij/` for pending
   spawns + bound-session inboxes, and drives readiness → init → bind → relay.
2. **Self-adopt — make the orchestrator reachable.** In pi, inbound is automatic;
   in control-plane mode the orchestrator must register its **own** pane as a peer,
   or colleague replies have nowhere to land:
   ```
   pij adopt "$TMUX_PANE" --harness claude
   ```
   This binds your pane to your live session (via `CLAUDE_CODE_SESSION_ID`, else
   the newest transcript in the cwd). Afterwards any `pij send <your-id> "…"` is
   typed into your pane as a framed `[pij from <sender>] …` user turn — the
   control-plane equivalent of pi's in-process inject.

## Command mapping

| Intent | pi mode (in-process tools) | control-plane mode (CLI + daemon) |
|---|---|---|
| **Prereq** | pi extension loaded | running `pij daemon` + `pij adopt` self once |
| **Be reachable (inbound)** | automatic (in-process receiver injects into your turn) | `pij adopt "$TMUX_PANE" --harness claude` (peers' sends → `[pij from <id>]` turns in your pane) |
| **Spawn a colleague** | `pij_spawn({ model, layout:"split" })` | `pij spawn --harness claude --model <m>` — returns the id **immediately**; the daemon drives boot → ready → init → bind asynchronously |
| **Deliver a pointer / message** | `pij_send({ to, message })` | `pij send <id> "<text>"` (daemon `send-keys` into the colleague's pane) |
| **Run a control command** | `pij_send({ to, command:"compact" })` | `pij send <id> "/compact"` (raw, executes in the pane) |
| **Peek without disturbing** | `pij tail <id>` | `pij tail <id> [--follow]` (reads the colleague's bound Claude transcript) |
| **Inspect state / liveness** | `pij state <id>` / `pij list` | same — the CLI verbs are shared |
| **Close / teardown** | `pij_close({ to })` (ownership-aware) | `tmux kill-pane -t <pane>` + `rm -f ~/.pij/<id>.json && rm -rf ~/.pij/<id>` |

## Model names

- **pi mode** colleagues are spawned through pi/Copilot, so `--model` /
  `pij_spawn({ model })` takes the Copilot strings (e.g.
  `github-copilot/claude-sonnet-4.6:xhigh`, `github-copilot/gpt-5.5:xhigh`).
- **control-plane mode** colleagues are real **Claude** processes, so `--model`
  takes Claude names: `sonnet`, `opus`, `haiku`, or a full id
  (`claude-sonnet-4-6`). Cross-model review still applies — pick a reviewer model
  deliberately ≠ the coder.

`pij spawn` always launches a driven Claude pane with
`--dangerously-skip-permissions`: there is no human at that pane to answer
permission/auto-mode prompts, so without it the colleague hangs the instant it
runs a tool. The pane is a controlled peer you spawned, not an untrusted surface.

## What is identical across modes

The **disciplines do not change** — only the transport verb does:

- **Canary-verify before trusting** — capture the new pane's footer, confirm the
  expected model, confirm no first-inference 400. (`pij tail <id>` reads the
  transcript in control-plane mode.)
- **Compact early, reuse, never close between phases.** `pij send <id> "/compact"`
  (or the tool) the instant a colleague reports done.
- **Pointer delivery only** — the packet is written to the ledger; only the short
  path pointer is sent. The **lib never sends**; the orchestrator sends.
- **Real peers, not builtin subagents** — a colleague is a real session
  (spawned/adopted/provided), never a read-blind builtin fanout.

## Gotchas & patterns (from live dogfooding, Plan 019)

- **Submit timing.** A burst `send-keys` trips Claude Code's paste detection; the
  daemon waits a short settle before Enter so the line submits crisply. If you ever
  shell `send-keys` by hand, type-then-settle-then-Enter (don't fire Enter
  instantly), or the submit can be swallowed.
- **Liveness is pane-based.** A control-plane colleague's descriptor records the
  **pane** pid (`#{pane_pid}`), not the spawner's, so `pij send` doesn't falsely
  refuse a live pane as dead.
- **Binding is deterministic but daemon-relative.** `pij spawn` snapshots the cwd's
  transcripts *before* the pane exists, so the daemon binds the genuinely-new
  transcript even if Claude writes it before the first daemon tick.
- **"peer is stale but alive" on send is benign.** Control-plane peers (claude)
  don't write pij `events.ndjson`, so `lastEventAt` stays null → liveness reads
  *stale*. The send still delivers (pid is alive). Don't treat that warning as a
  failure; confirm via `pij tail`.
- **Inbound arrives as a framed `[pij from <id>] …` turn.** In control-plane mode a
  peer message is typed into your pane and submits as a **user turn** prefixed
  `[pij from <sender>]`. Treat those as *peer* messages (reply with `pij send
  <sender> …`), not human input — same envelope the pi receiver has always used.
- **Cross-harness works in both directions, with split ownership (AC-08).**
  Claude↔pi is verified live: **you→pi** writes the pi peer's inbox and the daemon
  **observes only** — *pi's own in-process receiver* delivers it (never the daemon).
  **pi→you** uses pi's `pij_send` tool → your inbox → the daemon **relays** it into
  your adopted pane. So a flow-pair fleet can mix pi and claude colleagues on one
  daemon; just remember the daemon never injects into a pi session.
