# peer — spawn & talk to an ad-hoc colleague

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: talk to colleagues — stand up a NEW live session (claude / copilot / codex / pi) in a tmux pane, **or converse with peers that already exist**: identity/list/send/tail/state need no spawn. Nothing here delegates work products — this is the raw colleague seam.

**Preconditions**: inside tmux; mode detected per § C1 (control-plane mode additionally needs the one-time self-adopt so replies can reach you). The daemon auto-starts on first spawn.

## Verbs

**Identity & views**

```bash
pij whoami [--json]      # your stable session id (E-NOID → adopt first, § C1)
pij list [--here]        # known sessions (--here: this tmux server only)
pij state <id> [--json]  # liveness + working/idle for one peer
```

**Spawn**

```bash
pij spawn --harness claude --model claude-sonnet-5 [--effort low|medium|high|xhigh] \
          [--task "first task"] [--layout stack|right|below|window] [--branch]
```

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

Replies arrive in YOUR pane as `[pij from <id>]` turns — pushed, never polled (§ C7). Long content: write a file, send the path (pointer delivery — dispatch invariant 2).

**Teardown**

```bash
pij close <id>           # ownership-aware: refuses a peer you didn't spawn
pij close <id> --force   # override — only on the owner's explicit ask
```

Keep a healthy peer across work items: compact and reuse instead of close-and-respawn (§ C3).

## Smoke sequence (prove the seam end-to-end)

```bash
pij whoami                                    # self resolves (else adopt, § C1)
pij spawn --harness claude --model sonnet     # → pij-xxxxx
pij tail pij-xxxxx                            # canary: footer shows expected model, no 400 (§ C2)
pij send pij-xxxxx "reply with exactly: ok"   # round-trip lands back as [pij from pij-xxxxx]
pij close pij-xxxxx                           # pane + descriptor gone
```

## Failure modes

| Symptom | Meaning / move |
|---|---|
| `E-NOID` on send/close | id not in registry — `pij list`, or the peer already closed |
| `E-FULL` on spawn | window at split cap — free a slot or spawn from a scratch window (§ C5) |
| Ready but 400 on first message | wrong model id — close, re-spawn with a `pij models` id (§ C2/C4) |
| Send "lands" but nothing happens | peer wedged in its input box — daemon auto-retries focus; if persistent, `pij tail` to inspect, then escalate to a human |
