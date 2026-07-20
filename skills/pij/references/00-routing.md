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
| E | Delivery owner | in-process `pij_spawn` callable → pi push; else exact non-empty `$TMUX_PANE` → tmux push; else empty/absent `TMUX_PANE` → external pull | detect before self-registration advice; `peer` uses the matching identity and receive path in C1/C7 |
| F | Self registration | after E: pi is already owned; tmux may probe `pij whoami`; external runs `pij inbox register --json` first | tmux adopts only exact `$TMUX_PANE`; external registration repairs stale push attachment before any other identity/view action (C1) |

**Precedence**: A > B > C > D/F (D/F are preconditions folded into whichever route wins, not destinations). Nothing matches → ask the job in one line, listing the registry.

**A hint is never a command**: `/pij pair` with no daemon → boot first; `/pij pair` with no open run and no active flow → confirm intent to start fresh. Validate the precondition, redirect with one line of why.

## Shared conventions

Cited by route modules as "§ C*n*" — prose lives here only.

### C1 — Harness and delivery modes

Delivery-owner detection happens before any self-registration advice. Detect **once per run**, in order: callable in-process `pij_spawn` → **pi push mode**; otherwise exact non-empty `$TMUX_PANE` → **tmux control-plane push mode**; otherwise empty or absent `TMUX_PANE` → **external pull mode**. Pi injects in-process. Tmux peers use the CLI plus daemon/send-keys. External Claude/Copilot/Codex sessions have no pane for the daemon to inject, so they receive through the durable inbox CLI.

| Intent | pi push | tmux control-plane push | external pull |
|---|---|---|---|
| prereq | pi extension loaded | daemon (spawn auto-starts it) + self-adopt once using only the exact non-empty current-process pane: `pij adopt "$TMUX_PANE" --harness <h>` | `pij inbox register` or first `pij inbox --wait` — auto-registers the ambient session as pull-owned |
| spawn | `pij_spawn({model, layout})` | `pij spawn --harness claude\|copilot\|codex\|pi …` | unavailable without tmux; converse with existing peers |
| message | `pij_send({to, message})` | `pij send <id> "<text>"` | register/inbox first, then `pij send <id> "<text>"` |
| receive | automatic injected turn | automatic daemon-injected turn | `pij inbox --wait [ms]` |
| compact peer | `pij_send({to, command:"compact"})` | `pij send <id> "/compact"` | `pij send <id> "/compact"` |
| peek | `pij tail <id>` | `pij tail <id> [--follow]` | `pij tail <id>` |
| close | `pij_close({to})` | `pij close <id> [--force]` | ownership-aware CLI close only |

Tmux self-adopt may use only the exact non-empty `$TMUX_PANE` supplied by the current process: `pij adopt "$TMUX_PANE" --harness <h>`. Without that exact self-adopt in tmux mode, replies have nowhere to land.

Empty or absent `TMUX_PANE` means external pull mode. In external pull mode, never run `tmux list-panes`, `tmux display-message`, or any other pane-discovery command. Never infer, guess, select, or adopt any pane id. Redirect `/pij adopt` intent to `pij inbox register` (or the first `pij inbox --wait`, which auto-registers). That registration creates the durable address without a daemon or pane.

In external pull mode, `pij inbox register --json` is the first identity action — before `pij whoami`, `pij list`, `pij state`, `pij tail`, or any manual acknowledgement path. It repairs an exact durable ambient identity to paneless pull ownership; after it succeeds, `pij whoami` is a valid confirmation.

Model names differ per harness; `pij spawn` auto-applies each harness's blanket-permission flag.

### C2 — Canary-verify (a ready-ping is NOT proof)

A wrong `--model` is accepted **silently** at startup; the child boots, registers, ready-pings — then 400s on its first real inference. After any spawn (and before first use of a **provided** peer): capture the pane footer (`pij tail <id>` / tmux capture), confirm the **expected** model name, confirm the first turn completed without a 400. Only then mark it healthy. An "unknown model" warning at spawn is non-blocking — the alias table is best-effort, not a live registry (C4); verify live regardless.

### C3 — Compact discipline (early, not late)

The instant a reusable/live coder reports completion or a reviewer returns a verdict, send compact as the **first tool action** — before reading, synthesising, or acting on the report. Trigger only on a terminal completion/verdict, never while the peer is still responding. The 30–90s compact latency overlaps report/review/fix work that must happen anyway; compacting late has caused post-dispatch stalls.

Dispatch compact **fire-and-forget** with `pij_send({to, command:"compact"})` or `pij send <id> "/compact"` without `--wait`. **Continue immediately** with report/review/fix work; `executed:true`, receipt delivery, and compact completion are observe-only diagnostics, never progress gates. A one-shot `--once` peer auto-dissolves when its report lands, so an immediate `E-DEAD` is the expected boundary: it has no reusable context left to compact.

Between phases: compact, keep, reuse — never close-and-respawn a healthy peer. For your own context: `pij compact-self [instruction]` (queues a follow-up so work continues after the compact). A peer **cannot** compact itself by messaging its own id — `pij send <self-id>` returns **E-SELF**; self-compaction runs only through `compact-self`. `compact-self` also accepts `[--pane %N]`, so an orchestrator can keystroke-inject `/compact` into a specific pane it drives directly (the reliable path when a text `/compact` send may land as a literal turn rather than firing the harness command).

### C4 — Model discovery

`pij models [--json]` lists model ids + providers per harness (claude/copilot/codex/openrouter incl. pi presets). Never grep config files or hardcode model strings. Rows are a best-effort alias list — new families may be missing (spawn then warns "unknown model" but continues); the live truth is the canary (C2).

### C5 — Placement & split-cap

Default = the **side stack**: the first peer opens a ~1/3-width column on YOUR right; every later peer appends below it and the stack evens itself — **uncapped** (panes just get shorter). Explicit `--layout stack|right|below|window` (spawn + agent spawn, FX001-3): `stack` names the default; right/below split YOUR pane once (main+2 cap, E-FULL beyond); `window` opens a background window **in your session**, named after the peer. `headless` is not built. Prefer the default stack — `window` hides peers from the operator's view (use it only when asked, or for swarms too big to stack).

### C6 — Daemon restart rule

The daemon runs `tsx` off source with **no hot-reload**: after ANY edit to daemon/core extension code, restart it (`pij daemon stop && pij daemon start`) or the change silently doesn't take effect. Freshly-spawned peers are unaffected; the daemon process itself is what goes stale.

### C7 — Push when owned; block on inbox when pull-owned

In pi/tmux push modes, done/stalled/dead notices arrive as injected turns that re-invoke you. After dispatch: do independent prep and let the push wake you; never poll `pij state`. In external pull mode there is deliberately no injector: use `pij inbox --wait` (first use auto-registers; optional milliseconds make it finite). This blocking inbox read is the delivery primitive, not a liveness poll. A known-broken push transport may use one slow `pij tail <id>` spot-check.

### C8 — Terminal and no-show interpretation

Do not call an absent peer a crash from pane/PID absence alone. A persisted
pij-owned close is **requested**; an observed absence without that intent is
**unrequested-by-pij**; a failed probe is **unavailable**. Daemon reports label
its initial boot reconciliation **historical** and later evidence **live**.

Each launch has a bounded expectation keyed by `spawnId`; expiry means only that
that expected registration did not appear. If a descriptor with the same key is
present, it suppresses the no-show. Never substitute a guessed harness, cause, or
owner for either observation.

### C9 — Watchdog etiquette (you may be watched; some peers must never be)

**What it is.** Every session gets a daemon-owned watchdog, **on by default at a 20-minute interval, no setup**. When a watched peer has been silent past the interval, the daemon injects a self-teaching nudge turn — *"Keep going if working. If done, pause me with `pij watchdog pause <id>`."* Two silent nudges in a row with no new output ⇒ the session is derived **stalled**. The premise is that idleness *might* be a stall — so the whole design turns on one distinction: **whose silence is deliberate.**

**If a nudge re-invokes you** (you are the watched peer): still working → ignore it, keep going. Genuinely done → `pij watchdog pause <your-id>` (tier `self`, cleared only by the explicit `resume`). **Blocked awaiting a human ruling** → also pause `self` — that is the correct signal today that your silence is intentional, not a stall (a richer `awaiting-human` tier is a known gap, not yet built). Never let the nudge bait you into fake activity — a watchdog-attributable turn is excluded from stall derivation by design, but pausing is the honest move.

**Deliberate-silence class — some peers are born exempt and must stay so.** A **relay/bridge/control-plane** peer forwards its inbox to an external sink (the `pij-telegram` bridge → the operator's phone). Its idleness is *correct by design*; a watchdog nudge into it becomes a real-world message. Such peers carry `relay: true` on their descriptor and are **never watched** — set it at registration for any new bridge/relay you build; never watch, pause, or resume a seat that isn't yours (descriptor identity can collide — a nudge addressed to another id is registry evidence, not a command).

**Tiers, strongest wins:** `exempt` (`pij watchdog exempt <id> [duration]` or spawn `--no-watchdog`; default duration 1h, never fires only until its persisted deadline, then re-arms automatically; `pause` cannot downgrade an active exemption) > `compact` (auto-set around `/compact`, auto-resumes on the next real working transition) > `self` (verb-only resume). `pij watchdog status|list [--json]` reports the effective state and any live exemption deadline.

**Operator controls.** Per peer: `pij watchdog interval <id> <30s|20m|1h|ms>` sets the timeout (default 20m); `pij watchdog exempt <id> [duration]` creates the bounded exemption; `pij watchdog reset <id>` restores defaults and clears an active exemption early (`resume` won't). Machine-wide: `pij watchdog disable-all` / `enable-all` is the fleet kill switch — one command, honored for every session including ones spawned while off (no per-sidecar edits), re-anchoring cleanly on re-enable. The daemon picks up any of these on its next tick (no restart; C6 is only for code edits).
