# Ruling 2 (prime pij-far-jackal, 2026-09-27) — Claude's session is derived from its own process record

Amends ruling 1 for Claude. Found while building AC4: Claude spawns status-line and tool children detached (own session, no tty). The status-line adopt must run in the background so rendering never waits, so it is orphaned (ppid 1) when the script exits, before the daemon's lsof + ps ancestry check runs. Ancestry therefore can't be the Claude heal path.

- **Claude:** on every adopt, the daemon derives the session from the pane process's own record `<claude home>/sessions/<pid>.json` (every home in `claude_homes()`, including `~/.claude-alt`). The record counts only if its `pid` is the process tmux reports for the pane and its `procStart` (UTC) matches that process's observed start. Named resumes are covered, because Claude writes the resolved id.
- `--harness-session` is only a cross-check for Claude. A mismatch refuses, and a flag with no corroborating record refuses. It is never a source on its own.
- **Other harnesses:** ruling 1 is unchanged. The flag is believed only when lsof shows that the process owning this connection descends from the pane's harness process (checked with ps).
- Test: `proc::tests::claude_session_of_requires_the_record_to_describe_the_observed_process`, where a record whose start differs by one second derives nothing.
