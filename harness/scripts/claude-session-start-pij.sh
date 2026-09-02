#!/bin/sh
set -u

state_dir=${PIJ_RS_STATE_DIR:-}
if [ -z "$state_dir" ]; then
    [ -n "${HOME:-}" ] || exit 0
    state_dir=$HOME/.pij-rs
fi
mkdir -p "$state_dir" 2>/dev/null || exit 0
log_file=$state_dir/hook.log

if [ -z "${TMUX_PANE:-}" ]; then
    printf '%s\n' "skip:no-tmux" >>"$log_file"
    exit 0
fi
if ! pij-rs ping >/dev/null 2>&1; then
    printf '%s\n' "skip:no-daemon pane=$TMUX_PANE" >>"$log_file"
    exit 0
fi
if pij adopt "$TMUX_PANE" --harness claude >/dev/null 2>&1; then
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"pij automatically adopted this Claude session."}}'
else
    printf '%s\n' "refused:adopt pane=$TMUX_PANE" >>"$log_file"
fi
exit 0
