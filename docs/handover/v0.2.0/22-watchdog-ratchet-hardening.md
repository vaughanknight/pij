# 22 — watchdog-ratchet hardening (scope the pin, close the E6 residuals)

**Item id / stream at handover:** 22 · s392-day3-codex-doctrine
**Status at v0.2.0 (tag `d120c53`):** designed, NOT started. Item-18 tail (the two ironic E6-residuals its review found IN the E6-fixing PR + INFO-7 precision). Skill/doc-text change → `just pij-skill-check` gate.
**Size estimate:** S, ~2–3 h · **Order / dependencies:** after item 18 (landed). Independent otherwise.

## 1. Why this exists (the observed failure, with evidence)
The pij-watchdog ratchet test is an E6 shape: a green gate certifying wrong text.
- **ADV-1:** the ratchet asserts the routing text is present SOMEWHERE in `docs/how/pij-watchdog.md`, NOT that the example block is correct — the item-18 reviewer PROVED a garbage watchdog-turn example stays green. Anchor: `.pi/extensions/pij/cli.integration.test.ts:406` reads `docs/how/pij-watchdog.md`; `:418` calls `buildWatchdogTurn`.
- **ADV-2:** INFO-7's `core/state.ts:142` citation is itself a NEW UNPINNED code cite — its only repo occurrence is the doc line, so a line inserted above it silently mis-cites with no red (the E6 class one indirection down).
- **INFO-7 precision:** the doc's "blocked/waiting per `state.ts:142`" over-claims by half — at `d120c53`, `state.ts:137` is `"blocked"` (cannot proceed) and `:142` is `"waiting"` (dependent on something external), both in the `BADGE_SEVERITY` array (`:133`).
- Prior-art + table: `docs/plans/392-day3-codex-doctrine/tasks/item-22-ratchet-hardening/tasks.md`; rulings `docs/plans/392-day3-codex-doctrine/rulings.md:166-167`.

## 2. What is ruled (design / spec)
- Scope the ratchet assertion to the FENCED code block in `pij-watchdog.md` (the example), not "text present anywhere" — a wrong example must go RED.
- Pin the `state.ts:142` citation: assert in the ratchet test that `core/state.ts:142` still matches `/^\s*"waiting",/` (or cite the enum SYMBOL instead of a line).
- Fix the doc precision: "blocked/waiting per state.ts:142" → ":137,142" (or symbol). `blocked` is `:137`, `waiting` is `:142`.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/core/state.ts:133` `BADGE_SEVERITY`; `:137` `"blocked"`; `:142` `"waiting"`.
- `.pi/extensions/pij/core/watchdog.ts` — `buildWatchdogTurn` (the `ready` case ~`:351`; `ready`/`done` never mute).
- `.pi/extensions/pij/cli.integration.test.ts:406-418` — the ratchet: reads the doc, builds the turn, compares. Scope the comparison to the fenced block.
- `docs/how/pij-watchdog.md` — the doc whose example + the "per state.ts:142" line get fixed.

## 4. Acceptance (behavioural, mechanical)
- Test: a deliberately garbage watchdog-turn example in `pij-watchdog.md` → the ratchet REDs (today it stays green — that IS the bug); a correct example → green. A line inserted above `state.ts:142` that shifts `"waiting"` → the citation-pin test REDs.
- Mutant `MUT-RATCHET-SCOPE`: revert the assertion to "text present anywhere" → the garbage-example test REDs. Name the covering test (E40).
- Gates: `just pij-skill-check` (skill/doc-text gate), the vitest files that pin skill strings (`cli.integration.test.ts`, `acceptance-sweep.test.ts`), full suite at merge product, two green runs, logs kept.

## 5. Live verification
CLI/doc only — no daemon restart. Run the ratchet test against a hand-corrupted `pij-watchdog.md` example and confirm RED; restore → green.

## 6. Risks / gotchas that already bit us
- **E6** — a gate that pins "present somewhere" certifies nothing about correctness; this item exists because that shape shipped inside the PR that was fixing the same shape.
- Skill/doc text is LIVE-deployed by symlink — treat as a production push; the `pij-skill-check` diff must show zero NEW findings.

## 7. Open questions for the human
- Resolved (o-prime, 2026-08-28): the "(unpark)" annotation was a STATE note — item 22 had been parked behind item 24 — NOT a rescope. This IS the watchdog-ratchet item (`docs/plans/392-day3-codex-doctrine/day3-codex-doctrine-plan.md:319`). No open questions.
