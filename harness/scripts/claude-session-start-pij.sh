#!/bin/sh
set -u

state_dir=${PIJ_RS_STATE_DIR:-}
if [ -z "$state_dir" ]; then
    [ -n "${HOME:-}" ] || exit 0
    state_dir=$HOME/.pij-rs
fi
mkdir -p "$state_dir" 2>/dev/null || exit 0
log_file=$state_dir/hook.log
log_line() {
    printf '%s\n' "$1" >>"$log_file" 2>/dev/null || :
}

if [ -z "${TMUX_PANE:-}" ]; then
    log_line "skip:no-tmux"
    exit 0
fi
if ! pij-rs ping >/dev/null 2>&1; then
    log_line "skip:no-daemon pane=$TMUX_PANE"
    exit 0
fi
if adopt_output=$(pij-rs adopt "$TMUX_PANE" --harness claude 2>&1); then
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"pij automatically adopted this Claude session."}}'
else
    reason=$(printf '%s' "$adopt_output" | tr '\n' ' ')
    log_line "refused:adopt pane=$TMUX_PANE reason=$reason"
fi
exit 0
