# /pij · routing & shared conventions

Loaded by the dispatch (`../SKILL.md`) in **guided mode**, together with the chosen route module only. Direct jumps don't load this up front — a route module may cite a `§ Shared conventions` block below and pull it lazily; that is still progressive disclosure.

## Detection signals (guided `/pij`, re-derived every call — survives /compact)

All probes are deterministic files/commands; remember nothing between calls.

| # | Signal | Exact probe | Route offered |
|---|--------|-------------|---------------|
| A | Open delegation run | newest `.flow-pair/runs/*/run.json` has `"status": "open"` (schema enum is `open\|closed` — `skills/flow-pair/schemas/run.schema.json`; missing file/status = no signal) | **offer** resume `pair` — never auto-resume; stale-open runs are common |
| B | Live fleet roster | that same newest `run.json` → `roster.<role>.{pijId, spawnedByUs}`; liveness per id via `pij state <id>` or presence of `~/.pij/<id>.json` | `pair` reattach (live) or `ops` heal/teardown (dead, spawnedByUs) |
| C | Active the-flow mid-build | newest `docs/plans/*/the-flow.json` → `harness flow nav show --path <it>`; `data.nav.now`/`next` on a phase/review node | offer `pair` dispatch for that phase |
| D | Daemon alive | `pij daemon status` | down + any spawn intent → `ops` boot first (spawn also auto-starts it) |
| E | Self adopted | `pij whoami` (E-NOID / empty = not registered) | control-plane precondition: adopt before anything conversational (C1) |

**Precedence**: A > B > C > D/E (D/E are preconditions folded into whichever route wins, not destinations). Nothing matches → ask the job in one line, listing the registry.

**A hint is never a command**: `/pij pair` with no daemon → boot first; `/pij pair` with no open run and no active flow → confirm intent to start fresh. Validate the precondition, redirect with one line of why.

## Shared conventions

Cited by route modules as "§ C*n*" — prose lives here only.

### C1 — Harness modes (pi tools vs control plane)

Detect **once per run**: if the in-process `pij_spawn` tool is callable → **pi mode** (use `pij_spawn`/`pij_send`/`pij_close` tools; inbound messages inject automatically). Otherwise → **control-plane mode** (Claude Code / any non-pi client): drive the `pij` CLI + a running daemon; the daemon spawns/binds colleagues in tmux panes and relays via send-keys.

| Intent | pi mode | control-plane mode |
|---|---|---|
| prereq | pi extension loaded | daemon (auto-started by `pij spawn`) + **self-adopt once**: `pij adopt "$TMUX_PANE" --harness claude` |
| spawn | `pij_spawn({model, layout})` | `pij spawn --harness claude\|copilot\|codex\|pi [--model <m>] [--effort <lvl>] [--task "<t>"]` |
| message | `pij_send({to, message})` | `pij send <id> "<text>"` |
| compact a peer | `pij_send({to, command:"compact"})` | `pij send <id> "/compact"` |
| compact yourself | `pij compact-self [instruction]` | same — both modes |
| peek (non-disturbing) | `pij tail <id>` | `pij tail <id> [--follow]` |
| close | `pij_close({to})` | `pij close <id> [--force]` |

Without self-adopt in control-plane mode, peer replies have nowhere to land. Model names differ per harness (claude: `sonnet`/`opus`/full ids; copilot: `gpt-5.5`, `claude-sonnet-4.6`…; codex: `gpt-5.5`, `o3`…; pi: models/presets like `@preset/glm-1m`). `pij spawn` auto-applies each harness's blanket-permission flag — a daemon-driven pane has no human to approve prompts.

### C2 — Canary-verify (a ready-ping is NOT proof)

A wrong `--model` is accepted **silently** at startup; the child boots, registers, ready-pings — then 400s on its first real inference. After any spawn (and before first use of a **provided** peer): capture the pane footer (`pij tail <id>` / tmux capture), confirm the **expected** model name, confirm the first turn completed without a 400. Only then mark it healthy. An "unknown model" warning at spawn is non-blocking — the alias table is best-effort, not a live registry (C4); verify live regardless.

### C3 — Compact discipline (early, not late)

The instant a worker/reviewer reports done, compact it — **before** doing anything else with its report. The 30–90s compact latency then overlaps work you're doing anyway; compacting late has caused post-dispatch stalls. Confirm `command:compact, executed:true` via `pij tail <id>` before the next pointer. Between phases: compact, keep, reuse — never close-and-respawn a healthy peer. For your own context: `pij compact-self [instruction]` (queues a follow-up so work continues after the compact).

### C4 — Model discovery

`pij models [--json]` lists model ids + providers per harness (claude/copilot/codex/openrouter incl. pi presets). Never grep config files or hardcode model strings. Rows are a best-effort alias list — new families may be missing (spawn then warns "unknown model" but continues); the live truth is the canary (C2).

### C5 — Placement & split-cap

Default = the **side stack**: the first peer opens a ~1/3-width column on YOUR right; every later peer appends below it and the stack evens itself — **uncapped** (panes just get shorter). Explicit `--layout stack|right|below|window` (spawn + agent spawn, FX001-3): `stack` names the default; right/below split YOUR pane once (main+2 cap, E-FULL beyond); `window` opens a background window **in your session**, named after the peer. `headless` is not built. Prefer the default stack — `window` hides peers from the operator's view (use it only when asked, or for swarms too big to stack).

### C6 — Daemon restart rule

The daemon runs `tsx` off source with **no hot-reload**: after ANY edit to daemon/core extension code, restart it (`pij daemon stop && pij daemon start`) or the change silently doesn't take effect. Freshly-spawned peers are unaffected; the daemon process itself is what goes stale.

### C7 — Push, not poll

The daemon owns liveness and pushes it: a peer's **done-report**, **stalled** (idle without finishing), and **dead** (crashed/quota) all arrive as injected turns that re-invoke you. After dispatch: do independent prep, let the push wake you. Do not confirm a peer flipped to `working`, do not nudge idle-looking peers. One exception: a peer on a known-broken transport (keystrokes not landing, no events flowing) never pushes — for those only, use a slow periodic `pij tail <id>` spot-check.
