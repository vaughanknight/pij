# peer — spawn & talk to an ad-hoc colleague

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: talk to colleagues — stand up a NEW live session (claude / copilot / codex / pi) in a tmux pane, **or converse with peers that already exist**: identity/list/send/tail/state need no spawn. Nothing here delegates work products — this is the raw colleague seam.

**Preconditions**: follow § C1 for delivery-owner detection, native-extension ownership, exact-pane-only adoption and external register-first/no-pane-discovery rules. Spawn requires tmux. Tmux registration may place/reattach/export with `pij adopt "$TMUX_PANE" --harness <h> [--parent <id>] [--session-id <native-id>] [--export]`; carry an inherited parent (§ C1).

## Verbs

**Identity — choose only the § C1 delivery owner's path**
```bash
pij inbox register --json  # external pull FIRST: repairs exact ambient identity before whoami/list/state/tail
pij inbox --wait [ms]      # external: equivalent first-use registration, then receive
pij whoami [--json]        # external: only after registration; tmux control-plane: stable self
pij adopt "$TMUX_PANE" --harness <h> ${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}  # tmux E-NOID only; exact non-empty current-process pane
```

**Views**

```bash
pij list [--here]        # known sessions (--here: this tmux server only)
pij state <id> [--json]  # liveness + working/idle for one peer
pij inbox --wait [ms]    # non-tmux receive path; first use auto-registers
pij tree [<id> | --global] [--activity <v>] [--liveness <v>] [--lifecycle <v>] [--all] [--json]
```

Bare `tree` selects the current Git repository across linked worktrees; `--global` selects the registry and `<id>` that subtree.
Dead/dissolved history is hidden unless `--all` or an explicit history filter exposes it.
Repeated values OR within one axis; activity, liveness, and lifecycle axes AND.

**Structure**

```bash
pij link <child> --parent <parent> [--json]
pij link <child> --root [--json]
```

`parentId` is structural: an id is an explicit parent, `--root` writes explicit root `null`, and absence keeps the legacy `spawnedBy` fallback.
`spawnedBy` remains close authorization; `link` changes no other descriptor fields. Unknown ids, self-parenting, and cycles fail before any write.
Use adopt `--parent <id>` at registration; spawn automatically records the caller as structural parent and close owner.
When giving work, the governor also passes `--role pm|worker` on `link`;
a seat never infers or self-declares its own role.

**Spawn**

```bash
pij spawn --harness claude --model claude-sonnet-5 [--effort <level>] [--task "first task"] [--plan-id <id>] [--layout stack|right|below|window] [--branch]
```

Flags only: `pij spawn claude` is E-ARG; `--harness` is required. Effort is per-model
(`off|minimal|low|medium|high|xhigh|max`, warn-don't-block): discover with `pij models`, never assume.
`--plan-id` is opaque; it exports both plan env names, stamps the descriptor, and reports unresolved or non-segment ids without blocking spawn.

**Focus** — immutable native-session checkpoints, spawn's sibling:
`pij focus save <name>` requires a bound pi/claude caller; `pij focus list [--global]` is repo-filtered by default.
`pij focus launch <name>` forks a fresh tmux seat in **pending-canary**: golden recall must be verified (§ C2) before readiness.
pi launches from the main checkout, not a worktree; no copilot/codex adapters in v1.

File-change notices: `pij watch <path>` / `pij unwatch` — react to another seat's writes; mechanics in `docs/how/pij-peer-watch.md`.

**Body safety** (quoted text once EXECUTED `pij close` in a peer's repo): double-quoted
bodies expand backticks/`$(...)` in YOUR shell before pij runs. For code/backticks/untrusted
text, single-quote or use literal `pij send <id> --body-file <path>` (`-` = stdin).

- Model discovery is § C4; canary every spawned/provided peer before trust (§ C2), even after a non-blocking unknown-model warning.
- Returns id immediately: claude/copilot/codex bind asynchronously (boot → ready → bound); pi self-registers.
- `--task`: pi reads at boot via env; daemon-bound peers receive it after bind via inbox (FX001-2). `--branch` forks YOUR bound session, claude→claude only.
- Placement/default side stack: § C5. Seed § C10 in the first `--task` packet and require it for every subsequent send/reply.
- At each commit boundary, this seat and briefed peers apply § C11 (Commit attribution).

**Converse**

```bash
pij send <id> "message text"                         # lands as an injected turn in one peer
pij send --to <id> --to <id> "message text"          # same text once to each peer, in flag order
pij send --to <id> --to <id> "message text" --wait   # wait for every successful recipient
pij send <id> --command compact                      # rs daemon control: compact | new | reload
pij compact-self                                   # daemon-resolved self; no literal slash fallback
pij-rs send --to <id> --command compact              # native rs spelling (same admission)
pij tail <id> [--since N] [--follow]                 # peek its transcript without disturbing it
```

**Remote controls on rs** ([full contract](../../../../docs/how/pij.md#remote-session-control)):
commands carry no body; OMP/Pi handles claims in-process and acknowledges `executed` or
`refused` + reason. Acceptance is NOT completion. Native extension delivery bypasses typing
grace; Claude PTY keeps it (human drafts hold commands). Copilot refuses with
`E-RS-CONTROL-UNSUPPORTED: use Copilot's native user controls`; paneless seats also refuse.
Never replace refusal with literal `/compact` or send-keys. Any registered peer may compact,
without arming. Destructive `new`/`reload` require self or target-recorded parent, resolved
from daemon caller evidence — prime flags/roles confer no authority (no rs target-prime relation).
OMP/Pi's human must run `/pij` in the target to arm `new`/`reload`; unarmed requests refuse, never defer: arm and resend. Pi reload needs re-arming; installed OMP reload reopens the native session, NOT extension/skill resources.
Expired claims terminate with unknown-outcome/missing-ack, never replay; refused ids stay refused. Intentional retry after arming requires a new message id.

Pi/tmux replies arrive as `[pij-rs from <id>] … [/pij]` injected turns. For a non-tmux external peer, establish the durable address with `pij inbox register` (or let the first wait auto-register), send normally, then receive with:

```bash
pij inbox --wait          # block indefinitely
pij inbox --wait 30000    # or one finite 30s wait
```

This is pull delivery, not `pij state` polling (§ C7). Long content: write a file and send the path (pointer delivery — dispatch invariant 2). Every body follows § C10 — line 1 = the recipient's action or `NO ACTION`.

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
pij send pij-xxxxx "reply with exactly: ok"   # round-trip lands back as [pij-rs from pij-xxxxx] … [/pij]
pij close pij-xxxxx                           # pane + descriptor gone
```

Non-tmux pull:

```bash
pij inbox register                            # durable pull-owned self
pij send pij-xxxxx "reply with exactly: ok"
pij inbox --wait 30000                        # prints listing entry pij-xxxxx: ok, then "1 message read"
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
