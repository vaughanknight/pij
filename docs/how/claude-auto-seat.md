# Claude automatic pij seats

A foreground `pij-rs daemon` boot installs an embedded copy of
`harness/scripts/claude-session-start-pij.sh` at
`$PIJ_RS_STATE_DIR/claude-session-start-pij.sh` (default:
`~/.pij-rs/claude-session-start-pij.sh`). It then additively ensures this
absolute command under `hooks.SessionStart` in every discovered Claude
`settings.json`.

The hook runs once when Claude starts. In tmux it checks the rs daemon and runs
`pij adopt "$TMUX_PANE" --harness claude`, then emits only valid SessionStart
JSON context so Claude refreshes its initial UI after the seat exists; Claude does
not show successful hook stdout in the transcript. Outside tmux, with no daemon,
or on an adopt refusal, it exits zero with empty stdout and appends one line to
`$PIJ_RS_STATE_DIR/hook.log`. Existing Claude hooks retain their original order.
Changed settings are backed up as `settings.json.bak-<millis>`.

Inspect without changing settings:

```sh
pij-rs doctor claude-hook
```

The statusline remains read-only: it may call `pij whoami`, but must never call
`pij adopt`. Because `~/.claude/statusline-context.sh` is operator-owned rather
than repository-managed, guard its pij block locally so non-tmux renders skip
both identity probes:

```sh
PIJID=""
if [ -n "${TMUX_PANE:-}" ]; then
    PIJID=$(pij whoami 2>/dev/null | sed -n 's/^pij session:[[:space:]]*\([^[:space:]]*\).*/\1/p' | head -1)
    [ -z "$PIJID" ] && PIJID=$(pij whoami --json 2>/dev/null | jq -r '.id // empty' 2>/dev/null)
fi
```
