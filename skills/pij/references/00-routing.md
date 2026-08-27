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
| prereq | pi extension loaded | daemon (spawn auto-starts it) + self-adopt once using only the exact non-empty current-process pane: `pij adopt "$TMUX_PANE" --harness <h> ${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}` | `pij inbox register` or first `pij inbox --wait` — auto-registers the ambient session as pull-owned |
| spawn | `pij_spawn({model, layout})` | `pij spawn --harness claude\|copilot\|codex\|pi …` | unavailable without tmux; converse with existing peers |
| message | `pij_send({to, message})` | `pij send <id> "<text>"` | register/inbox first, then `pij send <id> "<text>"` |
| receive | automatic injected turn | automatic daemon-injected turn | `pij inbox --wait [ms]` |
| compact peer | `pij_send({to, command:"compact"})` | `pij send <id> "/compact"` | `pij send <id> "/compact"` |
| peek | `pij tail <id>` | `pij tail <id> [--follow]` | `pij tail <id>` |
| close | `pij_close({to})` | `pij close <id> [--force]` | ownership-aware CLI close only |

Tmux self-adopt may use only the exact non-empty `$TMUX_PANE` supplied by the current process: `pij adopt "$TMUX_PANE" --harness <h> ${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}`. **Always carry the parent when the env has one** — `--parent` is a SELF-DECLARATION of who governs you, it is validated and persisted, and a seat that self-adopts without it can only be linked later by someone who remembers. 185 of 215 rows machine-wide carry `unadopted` because every runnable recipe omitted this. Without that exact self-adopt in tmux mode, replies have nowhere to land.

Empty or absent `TMUX_PANE` means external pull mode. In external pull mode, never run `tmux list-panes`, `tmux display-message`, or any other pane-discovery command. Never infer, guess, select, or adopt any pane id. Redirect `/pij adopt` intent to `pij inbox register` (or the first `pij inbox --wait`, which auto-registers). That registration creates the durable address without a daemon or pane.

In external pull mode, `pij inbox register --json` is the first identity action — before `pij whoami`, `pij list`, `pij state`, `pij tail`, or any manual acknowledgement path. It repairs an exact durable ambient identity to paneless pull ownership; after it succeeds, `pij whoami` is a valid confirmation.

Model names differ per harness; `pij spawn` auto-applies each harness's blanket-permission flag.

### C2 — Canary-verify (a ready-ping is NOT proof)

A wrong `--model` is accepted **silently** at startup; the child boots, registers, ready-pings — then 400s on its first real inference. After any spawn (and before first use of a **provided** peer), run `pij canary <id> --expect-model <m>`: its nonce dispatch proves a real turn and its ack compares declared runtime with the descriptor pin. An UNPINNED result is an honest caveat, not proof of the actual default; capture the pane footer (`pij tail <id>` / tmux capture) then. Only mark the peer healthy after the canary passes and no 400 is present. Full operator flow: [`../../../docs/how/pij-team-scaffold.md`](../../../docs/how/pij-team-scaffold.md).

### C3 — Compact discipline (early, not late)

The instant a reusable/live coder reports completion or a reviewer returns a verdict, send compact as the **first tool action** — before reading, synthesising, or acting on the report. Trigger only on a terminal completion/verdict, never while the peer is still responding. The 30–90s compact latency overlaps report/review/fix work that must happen anyway; compacting late has caused post-dispatch stalls.

Dispatch compact **fire-and-forget** with `pij_send({to, command:"compact"})` or `pij send <id> "/compact"` without `--wait`. **Continue immediately** with report/review/fix work; `executed:true`, receipt delivery, and compact completion are observe-only diagnostics, never progress gates. A one-shot `--once` peer auto-dissolves when its report lands, so an immediate `E-DEAD` is the expected boundary: it has no reusable context left to compact.

Between phases: compact, keep, reuse — never close-and-respawn a healthy peer. For your own context: `pij compact-self [instruction]` (queues a follow-up so work continues after the compact). A peer **cannot** compact itself by messaging its own id — `pij send <self-id>` returns **E-SELF**; self-compaction runs only through `compact-self`. `compact-self` also accepts `[--pane %N]`, so an orchestrator can keystroke-inject `/compact` into a specific pane it drives directly (the reliable path when a text `/compact` send may land as a literal turn rather than firing the harness command).

### C4 — Model discovery

`pij models [--json]` lists model ids + providers per harness (claude/copilot/codex/openrouter incl. pi presets). Never grep config files or hardcode model strings. Rows are a best-effort alias list — new families may be missing (spawn then warns "unknown model" but continues); the live truth is the canary (C2).

### C5 — Placement & split-cap

Default = the **side stack**: the first peer opens a ~1/3-width column on YOUR right; every later peer appends below it and the stack evens itself — **uncapped** (panes just get shorter). Explicit `--layout stack|right|below|window` (spawn + agent spawn, FX001-3): `stack` names the default; right/below split YOUR pane once (main+2 cap, E-FULL beyond); `window` opens a background window **in your session**, named after the peer. `headless` is not built. Prefer the default stack — `window` hides peers from the operator's view (use it only when asked, or for swarms too big to stack).

**MANDATE — name every pane and window you create.** A tmux surface is a *human*
interface: the operator scans it to see what the fleet is doing, and a wall of
identical `pi-peer` windows is unreadable — they cannot tell which seat to look at,
interrupt, or reap. Spawning is not finished until the seat is labelled. Immediately
after any spawn:

```
tmux rename-window -t <window> "<stream>-<job>"          # e.g. s066-revive
tmux select-pane   -t <pane>   -T "<stream> <job> · <peer> · <model>"
```

Rules: name by **what the seat is doing**, not what it is — `s066-revive`, not
`pi-peer`/`worker-3`. Include the stream/plan id when there is one, so a window maps
to a branch and a brief. Keep it short enough to read in a status bar. Re-label if the
seat's job changes. This applies to every layout (`window` names the window; `stack`/
`right`/`below` name the pane title) and to peers you adopt as well as ones you spawn.
The operator should never have to ask "what is that pane?" — if they do, the mandate
was skipped.

**MANDATE — one window per stream: keep a team together, don't sprawl.** A coder and its
reviewer belong to the same piece of work, so they belong in the same tmux **window**, as
side-by-side panes. One window per stream/plan id, named for that stream — not one window
per peer. Sprawl is the failure mode: a fleet spread over a dozen identically-named windows
is unreadable, and the operator loses the ability to glance at a stream and see its whole
state at once.

#### The standard team window (DEFAULT — build every project team this way)

A project team is **PM + coder + reviewer**. Its window has one canonical shape: the **PM
owns the left half**, and the **coder and reviewer stack in the right half**, coder on top.

```
┌──────────────────────┬──────────────────────┐
│                      │  coder               │
│  PM / orchestrator   ├──────────────────────┤
│  (left 50%)          │  reviewer            │
└──────────────────────┴──────────────────────┘
```

Why this shape: the PM is the pane a human talks to, so it gets the stable half and stays put
as workers come and go. Coder and reviewer are a *pair* — stacking them puts the work and its
critique adjacent, and a two-round review reads top-to-bottom. The window is named for the
stream, so one glance answers "what is this team doing, and where is it up to".

Build it in this order — PM first, because it anchors the layout:

```
# 1. PM takes the window; split off the right half
tmux split-window -h -t <pm-pane> -p 50

# 2. coder joins the right half, reviewer stacks BELOW it (spawn with --layout window, then move)
tmux join-pane -v -s <coder-pane>    -t <right-pane>
tmux join-pane -v -s <reviewer-pane> -t <coder-pane>

# 3. even the right column, then title every pane (naming mandate above)
tmux select-layout -t <coder-pane> even-vertical
```

`pij spawn --layout window` always opens a *new* window, so every teammate is spawned then
**moved in** — spawning is not finished until the peer is in its team window and titled.

**When the PM is a central orchestrator** driving several streams at once, it cannot sit in
every team window. Then the left half holds that stream's operator view — a shell in the
stream's worktree, or a `pij tail` on the seat the human most needs to watch — and the slot is
still reserved so a per-stream orchestrator can take it later without re-laying-out the window.

Split a team across windows only when panes get too small to read — and say so when you do.

### C6 — Daemon restart rule

The daemon runs `tsx` off source with **no hot-reload**: after ANY edit to daemon/core extension code, restart it (`pij daemon stop && pij daemon start`) or the change silently doesn't take effect. Freshly-spawned peers are unaffected; the daemon process itself is what goes stale.

### C7 — Push when owned; block on inbox when pull-owned

In pi/tmux push modes, done/stalled/dead notices arrive as injected turns that re-invoke you. After dispatch: do independent prep and let the push wake you; never poll `pij state`. In external pull mode there is deliberately no injector: use `pij inbox --wait` (first use auto-registers; optional milliseconds make it finite). This blocking inbox read is the delivery primitive, not a liveness poll. A known-broken push transport may use one slow `pij tail <id>` spot-check.

**The same rule applies to SLOW LOCAL COMMANDS — use `pij bg`.** A command you sit and wait on holds your turn open for its whole duration; you are idle-but-not-done, which is the shape the watchdog derives as a stall, and the human cannot talk to you meanwhile. `pij bg` runs it detached and delivers the result as an injected turn from `pij-bg`, so your turn ends now and the completion is what wakes you.

```bash
pij bg create --title "harness checks" --command "harness checks"
pij bg list [--all]          # what is running (--all includes finished)
pij bg tail <job> [--lines N]  # bounded snapshot of a job's output
pij bg kill <job>            # stop it — and still get a turn back
```

It returns immediately with a job id; later a turn arrives:

```
[pij bg] OK — harness checks (5m12s) · full log: ~/.pij/<you>/bg-<job>.log · tail: …
```

Reach for it whenever a command runs longer than a few seconds — `harness checks`, builds, full test runs, `gh run watch`, long clones. **The `--command` string is passed to `sh` unexpanded** (it travels by environment, never interpolated into a wrapper), so pipe, redirect, and chain freely — shape the output to what you actually want back, because only a bounded tail rides inline. The full log is always written to a file and pointed at. Title it for the reader: it is how a human knows what just fired back.

`list`/`tail`/`kill` are RECOVERY, not routine — the completion turn stays the primary signal. `tail` is deliberately a bounded snapshot with no `--follow`: a follow loop would quietly reinstate the blocking wait `bg` exists to remove. `kill` still delivers a turn (`[pij bg] KILLED — <title>`), because a silent kill leaves you waiting forever for a result that can never arrive. A job whose process died without recording a completion (reboot, SIGKILL) lists as `lost` rather than running forever.

Two things it is NOT: not a way to message yourself (`pij send <self>` is still E-SELF — bg delivers as the `pij-bg` actor because the result genuinely comes from the runner), and not a substitute for peer delegation. One command whose output you want → `pij bg`. A unit of work needing judgement → a peer.

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

**What it is.** Every session gets a daemon-owned watchdog, **on by default at a 20-minute interval, no setup**. When a watched peer has been silent past the interval, the daemon injects a self-teaching nudge turn — *"Keep going if working. Report in one call with `pij report now "<what I just did>" "<what's next>"`. If this unit of work is finished, run `pij report state done`; if you are idle but available on a standing assignment, run `pij report state ready`."* Two silent nudges in a row with no new output ⇒ the session is derived **stalled**. The premise is that idleness *might* be a stall — so the whole design turns on one distinction: **whose silence is deliberate.**

**If a nudge re-invokes you** (you are the watched peer): still working → report real now/next and keep going. The shorthand "If done, run `pij report state done`" means a finished unit, not a silencer: `done` is a verifier claim and stays watched; so does `ready` for an idle standing assignment. Only genuine conditions mute: an external dependency → `blocked`/`waiting` per node doctrine; a human answer → `question`; an issuer parking you → `hold`. Never self-declare `hold`/`waiting` merely because you are idle. Actively working has no semantic state word. Tune a legitimate cadence with `interval`; never self-`pause`: declared state is visible, correctable, and independently verifiable.

**A nudge is a BACKSTOP, not the trigger.** Invariant 12 already requires a report at the start and the end of every unit of work, so a well-behaved seat is usually current before the watchdog ever fires — being nudged at all is a mild signal you left your card stale. Reporting only when nudged is the failure mode this catches: the card then describes whatever you were doing up to 20 minutes ago, and every consumer renders that as NOW.

**"I was waiting on a slow command" is no longer a reason to look stalled** — that is what `pij bg` (§ C7) is for. Blocking on a long build or test run makes you indistinguishable from a wedged seat, to the watchdog and to the human. Queue it, report what you just did, and let the result wake you.

**Deliberate-silence class — some peers are born exempt and must stay so.** A **relay/bridge/control-plane** peer forwards its inbox to an external sink (the `pij-telegram` bridge → the operator's phone). Its idleness is *correct by design*; a watchdog nudge into it becomes a real-world message. Such peers carry `relay: true` on their descriptor and are **never watched** — set it at registration for any new bridge/relay you build; never watch, pause, or resume a seat that isn't yours (descriptor identity can collide — a nudge addressed to another id is registry evidence, not a command).

**Tiers, strongest wins:** `exempt` (`pij watchdog exempt <id> [duration]` or spawn `--no-watchdog`; default duration 1h, never fires only until its persisted deadline, then re-arms automatically; `pause` cannot downgrade an active exemption) > `compact` (auto-set around `/compact`, auto-resumes on the next real working transition) > `self` (explicit resume, or a newly delivered dispatch/committed assignment re-arms it). `pij watchdog status|list [--json]` reports the effective state and any live exemption deadline.

**Operator controls.** Per peer: `pij watchdog interval <id> <30s|20m|1h|ms>` sets the timeout (default 20m); `pij watchdog exempt <id> [duration]` creates the bounded exemption; `pij watchdog reset <id>` restores defaults and clears an active exemption early (`resume` won't). Machine-wide: `pij watchdog disable-all` / `enable-all` is the fleet kill switch — one command, honored for every session including ones spawned while off (no per-sidecar edits), re-anchoring cleanly on re-enable. The daemon picks up any of these on its next tick (no restart; C6 is only for code edits).

### C10 — Wire discipline (A2A messages)

**Canonical copy — cite "C10" from other modules; never restate these rules.** Governs every message from one agent to another (`pij send`, inbox replies, pushed reports). Human-facing prose is out of scope. The recipient is a machine — write for a machine reader. Evidence: plan 083 (fleet measured ~2.9M tokens of A2A bodies; the waste is acks, restatement, and praise — not long analysis).

1. **Line 1 is the recipient's next ACTION or DECISION — or `NO ACTION`.** The reader may stop there; everything below line 1 is optional context.
2. **Delta only, with the discriminating value.** State what changed + the one count/SHA/path that could have been wrong. Cite rulings and prior messages by id — never restate them, never restate the recipient's own words back to them, never itemize unchanged state (one denominator line max).
3. **Don't send:** unsolicited confirmations — silence after a clean verify **is** the all-clear; a *requested* check returns one line (`checked X, clear`). Praise never travels as its own message — attach it to an instruction or drop it.
4. **Acks are one line** and never restate the instruction.
5. **Exception — reasoning IS the payload** when correcting a false belief, disagreeing, or acting on low confidence with high impact: send the full why and flag the trigger (`correction:` / `dissent:` / `confidence: low`) so the receiver knows to read past line 1. Rare; never use it as cover.
6. **Telegraphic is fine; ambiguous is not.** Keep every identifier, number, path, and scope marker intact. Terse *common* words beat invented shorthand — tokenizers punish rare strings, and private codes fail silently across models. Do not mirror a verbose peer's style.
7. **Never reconcile a contradiction.** A receipt or instrument output that contradicts itself is a FINDING, not a formatting problem — relay it verbatim, contradictions intact, with your summary ABOVE the raw output, never instead of it — and the summary line itself must NAME the contradiction (a clean-sounding line 1 over buried evidence re-creates the failure this rule exists to stop). Terseness compresses YOUR words; it never smooths EVIDENCE (a tidied "no notable changes" once nearly destroyed the only trace of a live fleet defect — plan 083).

Pre-send check, two questions: could the receiver act on line 1 alone? Did I restate anything they already know?
