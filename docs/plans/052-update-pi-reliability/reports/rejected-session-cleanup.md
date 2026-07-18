# s052 rejected validation-session cleanup — Seq 336

## Authorized target

```text
Token: pij-s052-validation-k_uajea4
Path:  ~/.pi/agent/sessions/--private-var-folders-mv-9mcvlzg504b158ctlswmgwph0000gn-T-pij-s052-validation-k_uajea4-repo--
```

Human authorization was limited to this exact rejected-run session directory. No npm cache, other session, package store, installed Pi, configuration, worktree, or unrelated path was cleaned.

Raw snapshots:

- `rejected-session-before.json`
- `rejected-session-after.json`

## Before

The exact path existed as a real directory owned in the normal session tree. It was empty and not a symlink.

An offline invocation of the checked-in `harness/scripts/pij-cli.cjs list --json` found zero registry-descriptor matches for the token. Targeted process and tmux enumeration found:

```text
descriptor matches: 0
process matches:    0
tmux pane matches:  0
```

The process probe excluded its own PID/ancestor command chain because the cleanup probe necessarily contained the token as an argument. Two preliminary probes surfaced only that self-reference; the final persisted before snapshot excludes the probe chain and found no independent owner.

## Removal

A Python path guard required all of the following before deletion:

- parent exactly `~/.pi/agent/sessions`;
- basename exactly the authorized rejected-run directory;
- target was a real directory, not a symlink;
- directory was empty.

Only then was `shutil.rmtree()` called on that exact path.

## After

The exact path no longer exists. A fresh offline registry/process/tmux check again found:

```text
descriptor matches: 0
process matches:    0
tmux pane matches:  0
```

No cleanup was attempted anywhere under `~/.npm`, any other `~/.pi/agent/sessions` entry, global Pi/package stores, or repository state.
