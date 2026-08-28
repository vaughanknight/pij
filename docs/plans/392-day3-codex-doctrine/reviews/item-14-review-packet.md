# Cold review packet — item 14 (C9 watchdog-mute wording) · LIVE SKILL · terminal-once
**Commit**: `445f8ee` · **Diff**: `git show 445f8ee` · **Base**: main + item-14 · **C10**
**Fence**: `00-routing.md` (C9) + `orient-oprime.md` (duty 7). **Allowed**: READ anything; WRITE only `reviews/item-14-review.md`. Own throwaway tree + node_modules symlink for vitest.

## Establish (semantic)
1. **Correct against code**: `core/watchdog.ts:332 mutesWatchdogNudge` returns true ONLY for `blocked|question|hold|waiting`; false for `done|ready|failed|cancelled` (orchestrator confirmed). The C9 amendment must say exactly that — `done`/`ready` stay WATCHED, those four MUTE. Verify no over/under-claim.
2. **Stale-quote fix**: the coder found the old C9 nudge quote ("If done, run `pij report state done`") was stale and updated it to the current `buildWatchdogTurn` text ("If this unit of work is finished… ; if you are idle but available on a standing assignment, run `pij report state ready`"). Verify the new quote is byte-faithful to the actual daemon-injected text (check `buildWatchdogTurn`/the nudge builder in `core/`), and that the old substring survives ONLY as an explicitly-negated shorthand (so any string-pin test still passes without re-asserting a stale claim).
3. **Budget-flat**: 00-routing.md net line delta 0 (205 lines); no load-bearing C9 content dropped to fit (compare the removed vs added — the "backstop"/self-pause guidance must survive).
4. **orient-oprime duty 7 mirror**: one line, consistent, budget-respecting.
5. **Gates first-hand**: `just pij-skill-check` 0 ✗; `cli.integration` + `acceptance-sweep` green (these spawn CLI procs — allow ~2-3 min).

## Verdict → `reviews/item-14-review.md`; report {summary,verdict,path}. Terminal-once.
