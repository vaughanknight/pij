# Author verification — cold validation r1

**Validation reviewed**: `pij-orchestrator-routing-skill-plan-validation.md`
**Validated target SHA**: `ff88b0f4ac1094dda8bee80523d167dc9fb8d9f3493b9ba6990cb5dd7690393f`
**Review verdict**: `VALIDATED_WITH_NOTES`

## Verified claims

- The report exists and names the frozen SHA it judged.
- The plan hash remained unchanged through the review.
- The current `prime` route has one stream row pointing directly to `orient-global.md`; the planned redirect is real work.
- `pij-skill-check.sh` supports `PIJ_SKILL_ROOT` and owns a `prime_required` payload list suitable for mutation fixtures.
- The plan's gate N/A claims are accurate.

## Finding adjudication

| Finding | Adjudication | Evidence / plan effect |
|---------|--------------|------------------------|
| Add static anti-"prime's window" backpressure. | **Accepted** | Folded into T001 for plan v1.0.1. |
| Pin exact `gpt-5.6-sol @ xhigh` default plus verbatim read-back. | **Accepted** | Folded into AC-04, T001, and T002 for plan v1.0.1. |
| Prefer `pij spawn --cwd <worktree>`. | **Rejected — validator conflated peer spawn with `pij agent --cwd`.** | `parseSpawnArgs` rejects unknown peer-spawn flags; `runSpawn()` sets `cwd = process.cwd()` and passes it to tmux. Plan v1.0.1 makes that current contract explicit in T003. |

## Correction evidence

- `.pi/extensions/pij/core/spawn.ts` `parseSpawnArgs()` accepts only `harness`, `task`, `layout`, `model`, `effort`, `branch`, and `json`.
- `.pi/extensions/pij/cli.ts` `runSpawn()` derives both pi and control-plane peer cwd from `process.cwd()` and supplies it to `tmux.newWindow` / `tmux.splitWindow`.
- `pij spawn --help` exposes no `--cwd`; `docs/how/pij-agents.md` documents `--cwd` for `pij agent run/spawn`, a different surface.

The r1 report remains an immutable record of what the cold reviewer said. Plan v1.0.1 incorporates the two valid notes and corrects the invalid one, so it requires a fresh frozen-SHA validation.
