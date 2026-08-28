# Item 22: watchdog-ratchet hardening (item-18 tail)

**Plan**: `../../day3-codex-doctrine-plan.md` (§ Item 22) · **Source**: item-18 review (`../../reviews/item-18-review.md`, ADV-1/ADV-2/INFO-7). **Order**: jumped ahead of the blocked item 30 (item 30 waits on item-24 merge).
**Base**: main (fetch at dispatch). **SKILL-TEXT PR** → gate: `just pij-skill-check` 0 ✗ + `npx vitest run .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts` + cold SEMANTIC review.
**Fence**: `.pi/extensions/pij/cli.integration.test.ts` (the ratchet), `docs/how/pij-watchdog.md` (fenced block target), `skills/pij/references/00-routing.md` (C9 citation). NO watchdog.ts change. Build PR fresh-from-main (COORD-004).

### The E6 residuals (from item 18's own review)
Item 18 pinned the watchdog doc to `buildWatchdogTurn` output — but:
- **ADV-1**: the ratchet asserts each emitted clause is "present SOMEWHERE in pij-watchdog.md", NOT "in the watchdog-turn EXAMPLE block". The reviewer replaced the example with garbage + restated the clauses as prose elsewhere → STILL GREEN. The named section can be actively wrong while the gate passes. Residual = POSITION not CONTENT.
- **ADV-2**: item 18's INFO-7 fix cited `state.ts:142` in C9 — but nothing PINS that line; a line inserted above BADGE_SEVERITY silently mis-cites with no red (the E6 class, one indirection over).
- **INFO-7 precision**: "blocked/waiting per state.ts:142" over-claims — `state.ts:137` is `"blocked", // cannot proceed`; `:142` is `"waiting", // dependent on something external`. So `:142` covers waiting only.

### Tasks
| # | Task | Domain | Path(s) | Done When | Notes |
|---|------|--------|---------|-----------|-------|
| [ ] | T001 (ADV-1: scope to fenced block) | in `cli.integration.test.ts`, extract the fenced ```text watchdog-turn block from `pij-watchdog.md` and assert `buildWatchdogTurn`'s emitted clauses are IN THAT BLOCK (not merely somewhere in the file). RED-first: garbage in the example block ⇒ RED even if the clauses appear as prose elsewhere. | pij-control-plane | `cli.integration.test.ts`, `docs/how/pij-watchdog.md` (ensure the block is fenced+parseable) | RED→GREEN; garbage-example REDs | the reviewer's proven hole |
| [ ] | T002 (ADV-2: pin the state.ts citation) | add an assertion that `state.ts` line for the cited numbers actually holds the semantic — e.g. read `state.ts`, assert the `"waiting",` entry is at the cited line (and `"blocked",` at its). A line-insertion above BADGE_SEVERITY that shifts them ⇒ RED. | pij-control-plane | `cli.integration.test.ts` | RED→GREEN; a shift REDs | closes the unpinned-cite E6 |
| [ ] | T003 (INFO-7 precision) | `00-routing.md` C9: "blocked/waiting per state.ts:142" → ":137,142" (blocked at :137, waiting at :142) — or cite the SYMBOL/enum. Whichever T002 can pin. Budget-flat (205 lines). | pij-skill | `skills/pij/references/00-routing.md` | citation accurate + pinned | skill-text; keep C9 otherwise identical |
| [ ] | T004 | gates (`just pij-skill-check` 0 ✗ before/after zero new findings; cli.integration + acceptance-sweep green; typecheck), pathspec commit, `reports/item-22-report.md` | pij-skill | reports/ | recorded | one PR |

### Cold-review Dim-0
- **MUT-EXAMPLE**: garbage in the watchdog-turn example block (clauses still as prose elsewhere) ⇒ T001 RED (ADV-1 closed — the gate now certifies the EXAMPLE, not the file).
- **MUT-CITE**: insert a line above BADGE_SEVERITY shifting `"waiting",`'s line ⇒ T002 RED (ADV-2 closed — the cite is pinned).
- Semantic: C9's ":137,142" is accurate (blocked→137, waiting→142); no C9 content lost.
