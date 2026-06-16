# skill-runner

Makes pi's loaded skills **discoverable and runnable as agent tools**.
Pi natively only injects passive skill descriptions into the system prompt
and relies on the model voluntarily reading SKILL.md (or the user typing
`/skill:name`). This extension closes that gap.

Tools / commands:

- `skills_list` (tool) — enumerate every loaded skill (name + description).
- `skills_run` (tool) — fuzzy-match an intent ("validate") to one skill and
  return its full SKILL.md content for the agent to apply. Reports
  candidates when ambiguous, available names when no match.
- `/skills` (command) — human-facing list in the TUI.

Mechanism (harvested from `tungthedev/pi-extensions` `skill` tool): skills
surface in pi's slash-command registry (`pi.getCommands()`) as
`source === "skill"` commands named `skill:<name>`, with `sourceInfo.path`
pointing at SKILL.md and an optional `description`.

## Acceptance for v1

- [x] `npm test` green for `skill-runner/store.test.ts`
- [x] `npm run typecheck` clean
- [x] `cd pij && pi` loads without error; `/skills`, `skills_list`,
      `skills_run` registered (verified live 2026-06-16)
- [x] `npm run smoke -- skill-runner` passes
- [ ] One difficulty entry added (or zero, if nothing was friction)

## Validation Record (2026-06-16)

**Thesis**: make pi's loaded skills discoverable (`skills_list`) and
loadable-on-demand (`skills_run`) as agent tools, closing pi's passive-
description gap. **Proof target**: Integration. **Verdict**: Advanced —
tools register and return correct results in a live session.

| Lens | Issues | Verdict |
|------|--------|---------|
| Correctness (matcher / tie-band) | 0 | ✅ |
| P2/P4/P5/P7/P8 compliance | 0 | ✅ |
| Index guards (noUncheckedIndexedAccess) | 0 | ✅ |
| Edge case: SKILL.md unreadable | 1 MEDIUM fixed | ✅ |
| Wording consistency | 1 LOW fixed | ✅ |
| Doc accuracy (acceptance) | 1 LOW fixed | ✅ |

**Forward-compatibility**: STANDALONE — leaf utility; sole consumer is the
runtime agent, no downstream plan phase depends on its shape.

**Fixes applied**: `skills_run` now wraps `readFile` in try/catch and
returns a graceful tagged result on read failure (was: unhandled throw);
"No skills loaded" wording unified across command/tools/smoke.

**Overall**: ⚠️ VALIDATED WITH FIXES — typecheck clean, 14/14 store tests
pass post-fix; `skills_list` + `skills_run` confirmed live this session.

## Notes

- Fuzzy matching lives in `store.ts` (pi-free, P2): exact name > prefix >
  substring > token overlap on name+description. Decisive hits (score ≥ 300)
  win outright; weak ties report `ambiguous` rather than guessing (P4).
- No event-sourced state — skills are read live from the command registry
  each call, so P9/P10 persistence patterns don't apply here.
