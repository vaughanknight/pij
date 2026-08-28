# Item 18 review packet — E6 watchdog-doc ratchet (cold, SKILL-TEXT)

**PR**: #20, branch `s392-pr18` (built FRESH from current main — NOT my drifted stream branch; review the PR branch head).
**Base**: current origin/main (447526e at build). **Dossier**: `../tasks/item-18-watchdog-ratchet/tasks.md`.
**Files (4)**: `.pi/extensions/pij/cli.integration.test.ts`, `docs/how/pij-watchdog.md`, `skills/pij/references/prime/orient-oprime.md`, `skills/pij/references/00-routing.md`. **Write verdict to** `reviews/item-18-review.md`.

## What this closes — E6 (a green gate certifying wrong text)
The old gate asserted the DOC's own literal (`liveGuidance.toContain("If done, run \`pij report state done\`")`), so `pij-watchdog.md` could omit the `ready` clause `buildWatchdogTurn` actually emits and stay green. The ratchet now DERIVES the expectation from `buildWatchdogTurn(id,1,{owesCard:true,ownAltitude:false})` output (header stripped, split into 2 clauses) and from `mutesWatchdogNudge` over `SEMANTIC_STATES`.

## Dim-0 mutation gate (skill-text variant — run BY YOU, sha-verify)
- **MUT-E6**: in `pij-watchdog.md`, revert the watchdog-turn example to omit the `ready` clause ⇒ `cli.integration.test.ts` ("...retires completion self-pause") RED. Orchestrator self-ran: RED 1 failed. Confirm on disk. THE proof the doc is now pinned to code.
- **MUT-MUTE**: change the doc's mute-set line (drop `hold`) ⇒ the `muteStates.join("|")` assertion RED. Confirm the mute set is pinned to `mutesWatchdogNudge`, not a literal.
- **MUT-CLAUSES**: change `toHaveLength(2)` expectation reality — add a 3rd sentence to the emitter's close (don't; just confirm the clause-count assertion would catch emitter drift).

## Semantic review (Dim-1) — this is the load-bearing half for a skill-text PR
1. `pij-watchdog.md`'s recovery axis + watchdog-turn example now match `buildWatchdogTurn`'s actual output in SUBSTANCE (ready present, done present, the mute-set line correct).
2. **ADV-5** (`orient-oprime.md` duty 7): the relay menu now reads `now`/`ready`/issuer-`hold` and explicitly says `waiting|blocked|question` are the seat's own first-person claims. Confirm it did NOT drop the legitimate issuer-`hold`, and the "manufactures a permanent silencer" rationale is correct (matches item-14 ADV-4 one layer up).
3. **INFO-7** (`00-routing.md` C9): `per state.ts:142` — confirm `state.ts:142` is where the waiting/blocked external-vs-self split actually lives (the reason I moved it off "per node doctrine").
4. Budgets: 00-routing 205, orient-oprime 193 — flat/under. pij-skill-check 0 ✗ (before/after zero new findings).
5. **No collateral**: the PR is fresh from main; confirm `git diff main..s392-pr18` is ONLY the 4 item-18 changes and main's dispatch-retirement tests (s391 42fceda/1fca60e) are intact (cli.integration count 120, not 116).

Report verdict + the mutation shas/RED lines + the Dim-1 findings to me.
