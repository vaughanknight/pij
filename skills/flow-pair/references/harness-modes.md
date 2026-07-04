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
harnesses (Claude Code **and** GitHub Copilot CLI today): a single **`pij daemon`**
spawns a harness in a tmux pane, binds its identity deterministically, and **relays
messages via tmux `send-keys`** instead of the in-process inject. Everything a pi
session did with the `pij_*` tools, a Claude/Copilot orchestrator does with the
`pij` CLI + the daemon.

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

1. **One daemon, machine-wide — AUTO-STARTED, you rarely touch it.** The daemon
   watches `~/.pij/` for pending spawns + bound-session inboxes and drives
   readiness → init → bind → relay. It is single-instance (a second one refuses).
   **`pij spawn` auto-starts one if none is running** — it creates a *background*
   tmux window named **`pij-daemon`** (no focus steal) and prints a line telling
   you it did so (`⚙ no pij daemon was running — started one …`). So in the common
   path you just `pij spawn` and the daemon appears. Manage it explicitly with:
   - `pij daemon start` — start one now (idempotent; says so if already up).
   - `pij daemon status` — `running (pid …, window @N)` / `stale` / `not running`.
   - `pij daemon stop` (alias `kill`) — SIGTERM the daemon **and** tear down the
     `pij-daemon` window pij owns (found by the lock's recorded window id **and** by
     the window-name convention — so it cleans up orphans too). Never kills a window
     a human started the daemon in.

   *Identification is by convention:* a tmux window named `pij-daemon` is pij's;
   that's how auto-start avoids double-starting and how `stop` finds the window.
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
| **Prereq** | pi extension loaded | a `pij daemon` (auto-started by `pij spawn`, or `pij daemon start`) + `pij adopt` self once |
| **Be reachable (inbound)** | automatic (in-process receiver injects into your turn) | `pij adopt "$TMUX_PANE" --harness claude` (peers' sends → `[pij from <id>]` turns in your pane) |
| **Spawn a colleague** | `pij_spawn({ model })` — side stack by default | `pij spawn --harness claude\|copilot --model <m>` — side stack by default; returns the id **immediately**; the daemon drives boot → ready → init → bind asynchronously |
| **Deliver a pointer / message** | `pij_send({ to, message })` | `pij send <id> "<text>"` (daemon `send-keys` into the colleague's pane) |
| **Run a control command** | `pij_send({ to, command:"compact" })` | `pij send <id> "/compact"` (raw, executes in the pane) |
| **Peek without disturbing** | `pij tail <id>` | `pij tail <id> [--follow] [--lines N]` (reads the colleague's bound transcript — Claude JSONL or Copilot `events.jsonl`) |
| **Inspect state / liveness** | `pij state <id>` / `pij list` | same — the CLI verbs are shared |
| **Close / teardown** | `pij_close({ to })` (ownership-aware) | `pij close <id>` (ownership-aware: kills the pane + drops the descriptor; refuses a peer you didn't spawn unless `--force`) |

## Model names

**Discover, don't guess — `pij models`.** Run `pij models` (or `pij models
--json`) to list every model id pij knows **with its provider** — `claude`,
`copilot`, `codex`, and `openrouter` (incl. pi presets like `@preset/glm-1m`).
That is the authoritative source for the `--model` value of any harness; never
grep `~/.pi/agent/models.json` or hardcode a string from memory. `*`-marked rows
are a best-effort alias list (not a live registry), so canary-verify the spawned
pane's footer regardless.

- **pi mode** colleagues are spawned through pi/Copilot, so `--model` /
  `pij_spawn({ model })` takes the Copilot strings (e.g.
  `github-copilot/claude-sonnet-4.6:xhigh`, `github-copilot/gpt-5.5:xhigh`).
- **control-plane mode** colleagues are real **Claude**, **Copilot**, **codex**,
  or **pi** processes:
  - `--harness claude` → Claude names: `opus`, `sonnet`, `haiku`, or a full id
    (`claude-opus-4-8`, `claude-sonnet-4-6`).
  - `--harness copilot` → Copilot names: `gpt-5.5`, `claude-sonnet-4.6`, etc.
  - `--harness pi` → a pi model/preset (e.g. `@preset/glm-1m`).
  Cross-model (and now cross-**harness**) review still applies — pick a reviewer
  deliberately ≠ the coder (e.g. a pi/GLM reviewer over a Claude coder).

`pij spawn` always launches a driven pane with blanket permissions —
`claude --dangerously-skip-permissions`, `copilot --yolo` (= --allow-all-tools/
paths/urls): there is no human at that pane to answer permission/auto-mode
prompts, so without it the colleague hangs the instant it runs a tool. The pane is
a controlled peer you spawned, not an untrusted surface.

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

- **Compact YOURSELF and queue a follow-up — `pij compact-self`.** Any session
  (the orchestrator OR a peer) can compact its own context and continue in one
  shot: `pij compact-self [--pane %N] [--delay-ms N] [instruction…]`. It types
  `/compact` into the current pane (default `$TMUX_PANE`); with an `instruction` it
  then waits `--delay-ms` (~1.5s default, so compaction has begun) and types the
  instruction so the harness **queues** it and runs it as the **first turn of the
  fresh context**. So `pij compact-self "resume phase 3 from <plan>"` = compact,
  then auto-continue. No daemon/registry — pure send-keys; works for pi, claude,
  and copilot. (Same settle lesson as below: it waits before each Enter.)
- **Submit timing.** A burst `send-keys` trips Claude Code's paste detection; the
  daemon waits a short settle before Enter so the line submits crisply. If you ever
  shell `send-keys` by hand, type-then-settle-then-Enter (don't fire Enter
  instantly), or the submit can be swallowed.
- **Liveness is pane-based.** A control-plane colleague's descriptor records the
  **pane** pid (`#{pane_pid}`), not the spawner's, so `pij send` doesn't falsely
  refuse a live pane as dead.
- **Binding is deterministic but daemon-relative (Claude).** `pij spawn` snapshots
  the cwd's transcripts *before* the pane exists, so the daemon binds the
  genuinely-new transcript even if Claude writes it before the first daemon tick.
- **Copilot binding is deterministic *and* race-free.** Copilot lets pij CHOOSE the
  session UUID at spawn (`copilot --session-id <uuid>`), so the daemon binds to that
  exact id the instant the pane is interactive — no transcript discovery, no
  snapshot, no phonehome needed to bind (phonehome still runs as a nice confirm).
- **Getting Copilot's info out — `events.jsonl`, NOT the sqlite turns table.** A
  bound Copilot session streams every turn LIVE to
  `~/.copilot/session-state/<uuid>/events.jsonl` (lines `{type,data,…}`;
  `user.message`/`assistant.message` carry `data.content`, tools in
  `data.toolRequests[]`). That's what `pij tail` reads. Do **not** read
  `~/.copilot/session-store.db` `turns` — its `assistant_response` is persisted
  lazily (still null while the pane already shows the reply).
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
