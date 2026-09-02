# Live proof — Claude SessionStart auto-adopt

**Date**: 2026-09-02
**Branch binary**: `target/debug/pij-rs`
**Isolation**: rs daemon bound to `127.0.0.1:7563`, state in `/tmp/pij-plan127-refresh-rs`; the production daemon was never restarted. Real Claude settings were snapshotted before the probe and restored afterward; SHA-256 matched `b90e9a9434a9b2e24939ac573f424a180c2c56144b71d1a50cbfedacdf8844d3` before and after. `~/.claude-alt/settings.json` was likewise restored and matched its backup at `488c997ec9b43148d4c8690e9061c3390ee6487d3037215ea7df2cf21ba96f5f`.

## AC1 — zero-input startup, statusline, consent, inbound turn

A fresh tmux window hand-started `claude` with no task and no keystrokes. After ten seconds, pane `%2643` showed the auto-adopted id in the read-only statusline:

```text
▐▛███▛█   Claude Code v2.1.258
▝▜██████▀  Opus 5 with medium effort · Claude Max
  ▝▝ ▝▝    ~/pi-hacking/fs3-claude-session-start-adopt

────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────
  0% fs3-claude-session-start-adopt ⎇ 127-claude-session-start-adopt ⛓ pij-established-giraffe • Opus 5 • medium • 0/1.0M /rc
  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent
```

The isolated daemon listed exactly one Claude owner for the pane, with consent stamped:

```json
{"id":"pij-established-giraffe","harness":"claude","pane":"%2643","proc":{"pid":87071,"proc_start":20260902103153},"folder":"/Users/jordanknight/pi-hacking/fs3-claude-session-start-adopt","parent":null,"cross_session_inbound_accept":true}
```

A second isolated seat, `pij-incredible-damselfly`, sent `PLAN127-FINAL-INBOUND: reply exactly ACK127-FINAL`. Claude received it as a real injected turn, claimed the inbox, and replied:

```text
❯ [pij-rs from pij-incredible-damselfly]message waiting — run: pij inbox[/pij]

  Ran 2 shell commands

⏺ ACK127-FINAL sent to pij-incredible-damselfly.
```

Spine rows from `/tmp/pij-plan127-refresh-rs/pij.sqlite`:

```text
1|config.claude-hook-ensured||{"after":"/tmp/pij-plan127-refresh-rs/claude-session-start-pij.sh","before":null,"home":"/Users/jordanknight/.claude"}
4|message.pushed|pij-established-giraffe|{"msg_id":"85c51616bd7d20d3-0000000000000000","from":"pij-incredible-damselfly","body":"PLAN127-FINAL-INBOUND: reply exactly ACK127-FINAL"}
5|delivery.outcome|pij-established-giraffe|{"msg_id":"85c51616bd7d20d3-0000000000000000","outcome":{"outcome":"queued"},"transport":"claude-uds"}
6|delivery.pointer-announced|pij-established-giraffe|{"msg_id":"85c51616bd7d20d3-0000000000000000","from":"pij-incredible-damselfly","announcement":1}
7|message.pushed|pij-incredible-damselfly|{"msg_id":"85c51616bd7d20d3-0000000000000001","from":"pij-established-giraffe","body":"ACK127-FINAL"}
8|delivery.outcome|pij-incredible-damselfly|{"msg_id":"85c51616bd7d20d3-0000000000000001","outcome":{"outcome":"queued"},"transport":"claude-uds"}
```

## AC2 — repeat execution is idempotent

The installed hook ran twice more with `TMUX_PANE=%2643`. Both commands exited zero. The next list still contained one Claude row for that pane with the same id and process tuple:

```json
{"id":"pij-established-giraffe","harness":"claude","pane":"%2643","proc":{"pid":87071,"proc_start":20260902103153},"parent":null,"cross_session_inbound_accept":true}
```

## AC3 — non-tmux startup is silent

A real Claude client was started under a PTY with `TMUX_PANE` removed. It reached its normal prompt without a hook error:

```text
▐▛███▛█ Claude Code v2.1.258
▝▜██████▀ Opus 5 with medium effort · Claude Max
❯ Try "fix lint errors"
```

The hook produced no stdout/stderr and recorded exactly:

```text
skip:no-tmux
```

## AC4 — installer contract

RED first: `cargo test -p pij-harnesses` initially failed with four `E0425` errors for the missing `ensure_claude_session_start_hook`. After implementation:

```text
cargo test -p pij-harnesses -p pij-cli
cargo test: 127 passed (13 suites, 2 ignored)
```

Coverage includes missing settings creation, byte-preservation of Notification/PreToolUse/PostToolUse, append without reordering existing SessionStart entries, existing-command no-op/no backup, malformed refusal, stable executable script installation, silent non-tmux behavior, and contract-valid success JSON.

## AC5 — `/pij ready` remains a no-op

After auto-adopt, `/pij ready` was typed in the same live Claude client:

```text
❯ /pij ready

  Read 1 file, ran 1 shell command

⏺ Ready.
```

The statusline still showed `pij-established-giraffe`, and the daemon still listed only one Claude row for `%2643`.
