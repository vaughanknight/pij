# peer — spawn & talk to an ad-hoc colleague

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: talk to colleagues — stand up a NEW live session (claude / copilot / codex / pi) in a tmux pane, **or converse with peers that already exist**: identity/list/send/tail/state need no spawn. Nothing here delegates work products — this is the raw colleague seam.

**Preconditions**: detect the delivery owner before giving any self-registration advice (§ C1). Spawning requires tmux. Tmux control-plane mode needs one-time self-adopt using only the exact non-empty `$TMUX_PANE` supplied by the current process: `pij adopt "$TMUX_PANE" --harness <h>`. To place it structurally during registration, use `pij adopt "$TMUX_PANE" --harness <h> [--parent <id>] [--session-id <native-id>] [--export]`. A non-tmux external session can converse with existing peers after `pij inbox register` (or its first `pij inbox --wait`) auto-registers pull ownership.

Empty or absent `TMUX_PANE` means external pull mode. In external pull mode, never run `tmux list-panes`, `tmux display-message`, or any other pane-discovery command. Never infer, guess, select, or adopt any pane id. Redirect `/pij adopt` intent to `pij inbox register` (or the first `pij inbox --wait`, which auto-registers).

## Verbs

**External pull identity — first action**

```bash
pij inbox register --json  # run before whoami/list/state/tail; repairs exact ambient identity to pull
pij inbox --wait [ms]      # equivalent first-use auto-registration, then receive
pij whoami [--json]        # valid confirmation only after external registration succeeds
```

**Tmux push identity**

```bash
pij whoami [--json]                     # your stable session id
pij adopt "$TMUX_PANE" --harness <h> ${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}   # E-NOID only; exact non-empty current-process pane
```

**Views**

```bash
pij list [--here]        # known sessions (--here: this tmux server only)
pij state <id> [--json]  # liveness + working/idle for one peer
pij inbox --wait [ms]    # non-tmux receive path; first use auto-registers
pij tree [<id> | --global] [--activity <v>] [--liveness <v>] [--lifecycle <v>] [--all] [--json]
```

Bare `tree` selects the current Git repository across linked worktrees. `--global`
selects the registry, while `<id>` selects that arbitrary subtree. Dead/dissolved
history is hidden by default; `--all` or an explicit history filter exposes it.
Repeated values OR within one axis; activity, liveness, and lifecycle axes AND.

**Structure**

```bash
pij link <child> --parent <parent> [--json]
pij link <child> --root [--json]
```

`parentId` is structural: an id is an explicit parent, `--root` writes explicit
root `null`, and an absent field keeps the legacy `spawnedBy` fallback.
`spawnedBy` remains close authorization; `link` never changes it or other
descriptor fields. Unknown ids, self-parenting, and cycles fail before any write.
Use adopt `--parent <id>` to establish structure at registration; spawn records
the caller as both structural parent and close owner automatically.

**Spawn**

```bash
pij spawn --harness claude --model claude-sonnet-5 [--effort <level>] [--task "first task"] [--plan-id <id>] [--layout stack|right|below|window] [--branch]
```

Flags, never positionals — `pij spawn claude` is an E-ARG; `--harness` is
required. Effort levels are per-model (`off|minimal|low|medium|high|xhigh|max`,
warn-don't-block): discover what a model accepts via `pij models`, never assume.
`--plan-id` is opaque; it exports both plan env names, stamps the descriptor, and reports unresolved or non-segment ids without blocking spawn.

**Focus** — immutable native-session checkpoints, spawn's sibling:
`pij focus save <name>` (caller must be a bound pi/claude peer) ·
`pij focus list [--global]` (repo-filtered by default) ·
`pij focus launch <name>` — forks a fresh tmux seat in **pending-canary**
state: not ready until golden recall is verified (§ C2). pi launches from the
main checkout, not a worktree; no copilot/codex adapters in v1.

File-change notices (self-serve): `pij watch <path>` / `pij unwatch` — use when
a peer must react to a file another seat writes; mechanics in
`docs/how/pij-peer-watch.md`.

**Body safety (live incident: quoted text EXECUTED `pij close` at a peer's
repo)**: a double-quoted send body substitutes backticks/`$(...)` in YOUR shell
before pij ever runs. For any body carrying code, backticks, or untrusted text:
single-quote it, or use the literal channel — `pij send <id> --body-file
<path>` (`-` = stdin), which bypasses shell interpretation entirely.

- Model names are per-harness — discover with `pij models` (§ C4); an "unknown model" warning is non-blocking, the canary decides (§ C2).
- Returns the pij id immediately (claude/copilot/codex are daemon-bound: boot → ready → bound happens behind you; pi self-registers).
- `--task` delivers the first task on every harness: pi reads it at boot (env); daemon-bound peers get it **injected after bind** (it rides the inbox, FX001-2). `--layout` places the pane (§ C5). `--branch` forks YOUR session into the pane (claude→claude only, same harness, bound session).
- Placement: default = the side stack (~1/3 right column, uncapped, evens itself) — keep it unless told otherwise (§ C5).
- **Always canary-verify before trusting** (§ C2) — spawned *and* provided peers.

**Converse**

```bash
pij send <id> "message text"                         # lands as an injected turn in one peer
pij send --to <id> --to <id> "message text"          # same text once to each peer, in flag order
pij send --to <id> --to <id> "message text" --wait   # wait for every successful recipient
pij send <id> --command compact                      # control command (compact/reload/…) [--wait]
pij tail <id> [--since N] [--follow]                 # peek its transcript without disturbing it
```

Pi/tmux replies arrive as `[pij from <id>]` injected turns. For a non-tmux external peer, establish the durable address with `pij inbox register` (or let the first wait auto-register), send normally, then receive with:

```bash
pij inbox --wait          # block indefinitely
pij inbox --wait 30000    # or one finite 30s wait
```

This is pull delivery, not `pij state` polling (§ C7). Long content: write a file and send the path (pointer delivery — dispatch invariant 2).

**Teardown**

```bash
pij close <id>           # ownership-aware: refuses a peer you didn't spawn
pij close <id> --force   # override — only on the owner's explicit ask
```

Keep a healthy peer across work items: compact and reuse instead of close-and-respawn (§ C3).

## Smoke sequence (prove the seam end-to-end)

Tmux/pi push:

```bash
pij whoami                                    # self resolves; E-NOID uses the tmux action in § C1
pij adopt "$TMUX_PANE" --harness <h> ${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}   # only the exact non-empty current-process pane
pij spawn --harness claude --model sonnet     # → pij-xxxxx
pij tail pij-xxxxx                            # canary: footer shows expected model, no 400 (§ C2)
pij send pij-xxxxx "reply with exactly: ok"   # round-trip lands back as [pij from pij-xxxxx]
pij close pij-xxxxx                           # pane + descriptor gone
```

Non-tmux pull:

```bash
pij inbox register                            # durable pull-owned self
pij send pij-xxxxx "reply with exactly: ok"
pij inbox --wait 30000                        # prints [pij from pij-xxxxx] ok
```

## Failure modes

| Symptom | Meaning / move |
|---|---|
| `E-NOID` on send/close | id not in registry — `pij list`, or the peer already closed |
| `E-NOID`/`E-ARG` on link/adopt parent | inspect `pij tree --global --all`; unknown/self/cyclic links and missing parents are no-write failures |
| `E-NOID` for self in tmux control-plane mode | use only `pij adopt "$TMUX_PANE" --harness <h>` with the current process's exact non-empty pane |
| `adopt` prints success, then `whoami`/`phonehome`/`send` still `E-NOID` | your descriptor is `lifecycle: dissolved` (check `pij node show <id> --json`); the write was silently discarded. `adopt` cannot revive a tombstone — run `pij revive <id> --attach "$TMUX_PANE"`, then VERIFY with `pij whoami && pij phonehome`. Refuses if the old pid was recycled; `--assume-dead` overrides |
| Resuming after a reboot, a long gap, or a tmux-server restart | every pane id and pid you hold is from a dead epoch, and prior findings are stale. `pij daemon status` first, then re-derive liveness before reusing ANY earlier conclusion — see [`../prime/rituals/bootstrap.md#recovery`](../prime/rituals/bootstrap.md#recovery). `pij revive --print` (from the folder) names the seat and mutates nothing |
| `E-NOID` for self outside tmux | run `pij inbox --wait` or `pij inbox register`; first use auto-registers the ambient session |
| `E-FULL` on spawn | window at split cap — free a slot or spawn from a scratch window (§ C5) |
| Ready but 400 on first message | wrong model id — close, re-spawn with a `pij models` id (§ C2/C4) |
| Send "lands" but nothing happens | peer wedged in its input box — daemon auto-retries focus; if persistent, `pij tail` to inspect, then escalate to a human |
