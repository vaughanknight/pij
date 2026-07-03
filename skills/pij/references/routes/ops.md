# ops — daemon health, registry & tmux hygiene

> Route module — sibling-blind. Knows only this job; composition is the dispatch's job.
> Conventions cited as § C*n* live in `00-routing.md` § Shared conventions (pull lazily).

**Job**: keep the control plane healthy — the daemon, the session registry (`~/.pij/`), the tmux panes it manages, and the bridges around them.

## Daemon

```bash
pij daemon status   # is it up, pid, tick health
pij daemon start    # idempotent; `pij spawn` also auto-starts it
pij daemon stop     # graceful
pij daemon kill     # last resort
```

**Restart rule (§ C6)**: after ANY edit to daemon/core extension code, `pij daemon stop && pij daemon start` — tsx loads source at start, no hot-reload; a stale daemon silently ignores your fix. Bound peers survive a restart (descriptors are on disk); in-flight sends may need re-sending.

## Registry hygiene

The registry is `~/.pij/<id>.json` descriptors + per-session data dirs. Sessions that died without `pij close` leave **corpses** (descriptor present, process gone).

```bash
pij list                      # every known session
pij state <id>                # dead|alive + working/idle for one id
pij path <id> [--events|--state|--dir]   # resolve a session's on-disk paths
```

There is no `pij prune` yet — sweep manually: for each `pij list` id whose `pij state` says dead, remove `~/.pij/<id>.json` and its `~/.pij/<id>/` data dir. Shell gotcha: pipe ids through `while read -r id` (zsh `for id in $VAR` does NOT word-split). Never remove a descriptor whose state is alive.

## Tmux hygiene

Orphan panes/windows (peer closed but pane lingered, or vice versa): match `pij list` pane ids against `tmux list-panes -a -F '#{pane_id} #{pane_current_command}'`; kill panes that no live descriptor owns (`tmux kill-pane -t %N`). Ownership rule applies — don't kill panes belonging to sessions you didn't spawn without the owner's ask.

## Binding repair

```bash
pij phonehome [--json]   # run INSIDE a peer's pane: confirms a pending binding
```

Use when a spawned peer booted but never bound (daemon log shows pending): the peer confirms its own identity deterministically instead of waiting on transcript discovery.

## Telegram bridge

```bash
pij telegram init    # one-time bot token setup
pij telegram start   # bridge pij sessions ↔ the bot
pij telegram stop
```

## Diagnosing a sick control plane

| Symptom | Probe | Move |
|---|---|---|
| Spawns hang at "booting" | `pij daemon status`; daemon log | restart daemon (§ C6); re-spawn |
| Peer never binds | daemon log shows discovery pending | `pij phonehome` inside the pane |
| Sends land nowhere | `pij state <id>` dead? | corpse — sweep it; re-spawn |
| Registry bloated with dead ids | `pij list` count vs live panes | manual sweep (above) |
