# Reviewer canary no-show 001

- **Spawn**: `s1784501879414-2`
- **Requested model/provider**: `claude/claude-opus-4-8` (cross-provider review canary)
- **Pane returned**: `%1978`
- **Observed**: no ready ping or canary acknowledgement; after one bounded liveness check, `pij tree --global --all --json` contained no descriptor for pane `%1978`; `tmux display-message`/`capture-pane` returned `can't find pane: %1978`.
- **Disposition**: pre-self-register no-show; cause unavailable. No close/adopt/register attempted. This is direct evidence for Stream 1 Phase 3's Pi spawn-expectation requirement.
- **Replacement**: use a different-provider Sakana reviewer canary.
