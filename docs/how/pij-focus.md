# pij focus — save and relaunch golden native sessions

`pij focus` freezes a bound peer's native session as an immutable named
snapshot, then launches fresh independent forks from it. It preserves the full
native conversation rather than reducing it to a summary.

## Quick start

Run `save` inside the bound pi or claude peer whose context you want to keep:

```bash
pij focus save golden-reviewer
pij focus list
pij focus launch golden-reviewer
```

`list` is filtered to the current Git repository by default. Use
`pij focus list --global` for the machine-wide inventory. Every command accepts
`--json` for scripting.

## Storage and immutability

Each focus is isolated below the registry root:

```text
~/.pij/focus/<name>/
  manifest.json
  snapshot.jsonl
```

No focus JSON is written at `~/.pij/*.json`, because that top level belongs to
live session descriptors. The snapshot is created exclusively, made read-only,
and checked against the manifest SHA-256 before and after every launch. Saving
an existing name is refused rather than overwriting its history.

The manifest records the harness and native session id, model and effort when
known, origin cwd, creation time, SHA-256, and source pij/native lineage.

## Harness adapters

| Harness | v1 | Save | Launch |
|---|---|---|---|
| pi | supported | Resolves the bound JSONL from `~/.pi/agent/sessions/<encoded-cwd>/` or `PI_CODING_AGENT_SESSION_DIR` | Uses pi's self-registering spawn path with `pi --fork <snapshot> --session-dir <isolated-dir> --session-id <fresh-native-id>`; the returned pij id is the id allocated by the child |
| claude | supported | Resolves the bound JSONL from the cwd-encoded Claude project directory and removes `gitBranch` metadata | Materializes the snapshot under a fresh focus-owned filename id, then uses `--resume <focus-id> --fork-session --session-id <fresh-fork-id>` |
| copilot | future | Returns `adapter not yet available in v1` | Same |
| codex | future | Returns `adapter not yet available in v1` | Same |

All supported saves reject credential-shaped persisted fields or values before
writing the snapshot.

## Launch rules

- Launch always creates a fresh native id and a fresh pij peer descriptor. Pi
  self-registers its own pij id; Claude keeps the daemon-bound preallocation path.
- The saved snapshot is never resumed in place or mutated.
- Repeated launches are independent; each fork gets its own native session and
  pij data directory.
- Launch needs tmux. Claude uses the existing pij daemon to drive its pending
  descriptor to bound; pi self-registers and needs no daemon.
- A successful spawn is returned as `pending-canary`, never ready. Do not assign
  work until the relaunch canary below proves the restored context.
- **pi cannot boot from a Git worktree (#21).** Change to the repository's main
  checkout before `pij focus launch <name>`. Claude may launch from a worktree,
  but the cwd must exist so its encoded transcript directory is resolvable.

## Relaunch canary

Before assigning real work, ask the launched peer to recall a unique token and
three facts planted before `save`. The launch output remains `pending-canary`;
treat the focus as restored only when it returns the token and all facts
verbatim. A mismatch means the fork did not restore the intended native context;
close it and investigate instead of continuing with degraded assumptions.

## Examples

```bash
# Save from the current bound peer.
pij focus save architecture-review --json

# Inventory for this repository, then globally.
pij focus list
pij focus list --global --json

# Launch from the current cwd.
pij focus launch architecture-review --json
```

Focuses are retained indefinitely in v1. There is no pruning, editing,
cross-machine synchronization, copilot/codex adapter, or TUI yet.
