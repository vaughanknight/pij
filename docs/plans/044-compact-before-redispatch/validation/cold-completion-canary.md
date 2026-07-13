# Cold Completion-First Canary

**Date**: 2026-07-13  
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s044-compact-before-redispatch`  
**Payload**: project-local `skills/pij` link; the global live skill was not changed

## Skill resolution

Both accepted orchestrators loaded `pij` from:

`/Users/jordanknight/pi-hacking/pij-worktrees/s044-compact-before-redispatch/.harness/temp/s044/cold-project/.agents/skills/pij`

Their skill contexts reported that exact base directory. An independent
`copilot skill list --json` probe reported `source: "project"` and the same path;
`readlink`/`realpath` resolved it to this worktree's `skills/pij`.

## Accepted event order

| Scenario | Orchestrator / target | First post-event tool | Immediate continuation | Result |
|---|---|---|---|---|
| coder completion | `pij-planned-toad` / `pij-prepared-tarantula` | `2026-07-13T00:55:30.230Z` — `pij send pij-prepared-tarantula "/compact"` | `2026-07-13T00:55:33.321Z` — read `coder-report.md` | `coder-event-handled 7404 CODER-REPORT-TOKEN-7404` |
| reviewer verdict | `pij-grateful-newt` / `pij-fond-snake` | `2026-07-13T02:21:38.317Z` — `pij send pij-fond-snake "/compact"` | `2026-07-13T02:21:46.710Z` — read `reviewer-verdict.md` | `reviewer-event-handled-v2 7411 REVIEWER-VERDICT-TOKEN-7405` |

Neither compact command used `--wait`. No receipt, `pij tail`, state poll, or compact
completion check occurred between compact dispatch and artifact handling.

## Trial control

An initial reviewer trial was rejected because the measured event itself named
`/pij pair`, which re-triggered skill loading before compact. The accepted v2 used a
fresh orchestrator, preloaded the same project skill, and delivered neutral terminal
verdict wording; compact was then the first post-event tool action.

## Evidence

- `.harness/temp/s044/skill-resolution.{txt,json}`
- `.harness/temp/s044/coder-event-order.jsonl`
- `.harness/temp/s044/reviewer-v2-event-order.jsonl`
- `.harness/temp/s044/coder-transcript.txt`
- `.harness/temp/s044/reviewer-v2-transcript.txt`
- `validation/one-shot-compact-evidence.md` — separate expected `E-DEAD` boundary

This is bounded cold-run evidence for these isolated real peers, not proof that every
model or session will always follow the contract. The deterministic structural sensor
and mutation matrix provide the durable regression backpressure.
