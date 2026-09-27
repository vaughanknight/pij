# Ruling 1 (Jordan, 2026-09-27) — where the Claude session id comes from

This ruling supersedes the evidence list in plan.md Rule 1 ("argv / transcript held open").

After a reboot every pane id is new, so each seat must be re-tied to the pane its session now occupies.

- **Claude:** the status line and the SessionStart hook are both child processes of the Claude process in the pane. Each receives `TMUX_PANE` in its environment and the `session_id` in the stdin JSON. They pass both to adopt (for example `pij-rs adopt "$TMUX_PANE" --harness claude --harness-session <id>`).
- **The daemon accepts that session id only if the calling process descends from the Claude process tmux reports for that pane.** That is the derivation: a fact reported by the session's own child. A caller outside that process tree is refused. There is no argv or transcript sniffing, and named resumes (`--resume prime`) are covered for free.
- **Copilot and OMP/pi are already covered** by their extensions: Copilot's reads `SESSION_ID` and `TMUX_PANE`, and OMP's `session_start` handler sends `getSessionId()` and `TMUX_PANE`. Do not change them. If you find they do NOT re-tie after a pane-id change, report it as a finding.
- Rule 2 still holds: a pane id alone is never identity.
