# Plan 037 rulings

## 1. CLI surface: extend `pij send`

**Jordan, 2026-07-11**: "yeah perfect"

This accepts the immediately preceding proposal:

```bash
pij send --to pij-a --to pij-b --to pij-c "same message"
pij send --to pij-a --to pij-b "same message" --wait
```

- Keep `pij send <id> "<message>"` unchanged.
- Report honest results per recipient.
- Do not place broadcast under `pij orchestration`.

## 2. Planning mode and validation

**Jordan, 2026-07-11**: "yeah perfect /builder get your explore done then build the plan. simple mode, no need for war and peace on this one."

**Jordan, 2026-07-11**: "then use a subagent to /validate-v2 the plan"

- Use builder guided mode.
- Produce a concise research dossier, then a unified Simple-mode plan.
- Run `/validate-v2` in a separate cold subagent and persist its verdict.

## 3. Implementation runs through the stream fleet

**Jordan, 2026-07-11**: "just a note, you are the orchestrator you shold not habe ben doing this work. continue on, but for your reviewer use /pij and use copilot gpt 5.6 sol xhigh reviewer."

- The stream orchestrator coordinates and verifies; a pij coder implements the phase.
- Review uses a separate Copilot `gpt-5.6-sol` peer at `xhigh`.
- Direct work already started (T001 RED tests and the opening T002 parser patch) is handed to the coder as current worktree context; the orchestrator stops coding.

## 4. Coder and reviewer model

**Jordan, 2026-07-11**: "kill it. sol 5.6 xhigh coder and reviewer pelsae"

- Close the Claude Opus 4.8 coder spawned for `dlg-0001`.
- Use Copilot `gpt-5.6-sol` at `xhigh` for both coder and reviewer.
- Reviewer remains lazy until the review step.

## 5. RED-set yield and close contract

**O-prime, 2026-07-11**: full-suite green is part of `dlg-0001` definition of done. If the coder yields or pauses with TDD RED tests standing, its report must disclose the exact RED set.

## 6. cli.ts window first act

**O-prime, 2026-07-11**: when the `.pi/extensions/pij/cli.ts` window opens, first repair the pre-existing bin consumer at current line 1959 that was broken by the core follow-contract reshape, then prove typecheck before completing the remaining wait-loop behavior.

## 7. peer route ship-time edit

**O-prime, 2026-07-11**: `skills/pij/references/routes/peer.md` edit approved after T004 E-16. Add broadcast syntax only in the existing Converse code block, stay under 150 lines, preserve sibling-blindness, and provide `pij-skill-check` plus diff for o-prime look before commit.
