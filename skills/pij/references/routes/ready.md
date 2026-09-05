# ready — adopt this seat and wait

> Route module — terminal and inert. Perform only this procedure; never route
> onward or inspect work to anticipate the next instruction.

**Job**: make the current agent reachable, report readiness, and stop. The
prime or operator will push the next turn.

## Procedure

1. **You are a pi/omp seat: the extension registered you at boot. Reply `Ready.` and
   STOP — run NO pij identity command (no adopt, no inbox register).**
   Copilot with its native `pij_send` tool is also extension-owned: reply `Ready.`
   and stop without a competing identity/adopt/inbox command.
   Copilot without the native tool must report native setup unavailable and stop;
   adopting or starting a CLI pull receiver is not a delivery fallback. Otherwise,
   detect only the delivery owner:
   - With an exact non-empty `$TMUX_PANE`, resolve `<h>` from the current host
     (`claude` or `codex` — NEVER `pi`: pi/omp seats self-register at
     boot and `pij adopt` rejects `--harness pi` by design) and run exactly
     `pij adopt "$TMUX_PANE" --harness <h> ${PIJ_PARENT_ID:+--parent "$PIJ_PARENT_ID"}`.
     Carry the parent whenever the env has one — it is a self-declaration of who
     governs you, validated and persisted, and it is the ONLY moment it can be
     recorded without someone later remembering. Never discover or guess another pane.
   - With no `$TMUX_PANE`, run exactly `pij inbox register --json`; never adopt a
     pane in external pull mode.
2. **Verify the write, never the print.** "Succeeds" means `pij whoami` names
   you and `pij phonehome` says `(bound)` — not that the previous command printed
   a success line. `adopt` on a dissolved descriptor prints a correct-looking
   `adopted <id> … (pane %N, bound)` and persists NOTHING; the remedy is
   `pij revive <id> --attach "$TMUX_PANE"` (see peer route § Failure modes).
   Resuming after a reboot or long gap? Treat every pane id, pid, and prior
   finding as stale and re-derive before reusing it.
3. Once verified, reply with exactly:

```text
Ready.
```

4. **STOP.** In push mode, ending the turn is the wait: the next message is
injected automatically. Do not run `pij inbox --wait` in push mode. In external
pull mode, use `pij inbox --wait` only when the host can continue waiting after
the readiness reply.

## Hard boundary

Do not read plans, briefs, government files, repository docs, git state, task
state, or another route. Do not run a harness boot, inspect peers, spawn, send,
tail, delegate, claim work, or infer what the next task might be. Registration,
the exact readiness reply, and waiting are the entire route.

## Once work arrives

Invariant 12 starts applying the moment you accept a unit of work: `pij report
now "<did>" "<next>"` at its start and again at its finish. Every reply you send
to another agent follows § C10 — Wire discipline (`00-routing.md` § Shared
conventions). A seat adopted
through this route is the likeliest to go stale — it can sit for hours, so its
card is the one most often read while it is the one least often refreshed. Being
watchdog-nudged means it was already stale.
