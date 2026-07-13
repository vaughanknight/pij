# ready — adopt this seat and wait

> Route module — terminal and inert. Perform only this procedure; never route
> onward or inspect work to anticipate the next instruction.

**Job**: make the current agent reachable, report readiness, and stop. The
prime or operator will push the next turn.

## Procedure

1. Detect only the delivery owner:
   - Pi with in-process pij tools is already push-owned; run no identity command.
   - With an exact non-empty `$TMUX_PANE`, resolve `<h>` from the current host
     (`claude`, `copilot`, `codex`, or `pi`) and run exactly
     `pij adopt "$TMUX_PANE" --harness <h>`. Never discover or guess another pane.
   - With no `$TMUX_PANE`, run exactly `pij inbox register --json`; never adopt a
     pane in external pull mode.
2. If registration succeeds, reply with exactly:

```text
Ready.
```

3. **STOP.** In push mode, ending the turn is the wait: the next message is
injected automatically. Do not run `pij inbox --wait` in push mode. In external
pull mode, use `pij inbox --wait` only when the host can continue waiting after
the readiness reply.

## Hard boundary

Do not read plans, briefs, government files, repository docs, git state, task
state, or another route. Do not run a harness boot, inspect peers, spawn, send,
tail, delegate, claim work, or infer what the next task might be. Registration,
the exact readiness reply, and waiting are the entire route.
