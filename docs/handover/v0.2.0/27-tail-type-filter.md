# 27 — `pij tail <id> --type <T>`: an unknown type is silently "(no events)" — make it an `E-ARG` that names the valid kinds

**Item id / stream at handover:** 27 · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** designed (Phase 11 of the s391 plan; dossier + packet ready; no branch)
**Size estimate:** S (1–2 h) · **Order / dependencies:** none

## 1. Why this exists (the observed failure, with evidence)
- Plan premise correction (cold-read F-27-1, 2026-08-28): the s391 plan's Phase 11 (`docs/plans/391-day3-core/391-day3-core-plan.md` § "Phase 11: Item 27", from an o-prime observation of 2026-08-27 14:50Z) said the flag was "accepted and ignored". At `d120c53` that is FALSE — `--type` filters end-to-end: parse `core/cli.ts:1296-1306` (`type: flags.type`), executor `:3653` `.read({ since, type: cmd.type, last })`, event log filter `core/events.ts:27-30` `out.filter((e) => e.type === type)`. Live read-only proof by the reviewer on an idle seat with 4 message events: `--lines 3` → 3 rows; `--type receipt --lines 3` → `(no events)` — the filter excludes.
- What IS unbuilt (AC-25's second clause): an unknown kind — `pij tail <id> --type bogus` — returns `(no events)` with exit 0: no `E-ARG`, no list of valid kinds. Item 23 had already stopped advertising `--type` in the send hint because its behaviour was misread; the help text still names it without the kinds.
- Encode E21 stands in its corrected form: a flag whose bad input is indistinguishable from an empty result is a lie in the help text.

## 2. What is ruled (design / spec)
- AC-25 (plan), rescoped to the unbuilt clause: an unknown `--type` is `E-ARG` naming the valid kinds (text and `--json`); the existing filter and the unfiltered default are unchanged (pin them with a test so the rescope cannot regress them).
- Valid kinds = the `type` values the event log records (`core/events.ts` — the event `type` union; enumerate from the type definition, not from memory); the error message lists them; help text (`:1296` usage string) shows `--type <kind>`.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/core/cli.ts` — parse `:1290-1310` (`case "tail"`; `:1301` already rejects a bare `--type`): add the kind validation HERE (parse-time `E-ARG`, like `:1301`), so both text and `--json` refuse before the executor runs; executor `:3650-3656` (`eventLogFor(id).read({ since, type, last })`) and `core/events.ts:27-30` are the existing filter — do not duplicate it.
- `.pi/extensions/pij/core/cli.test.ts` — existing tail tests (grep `"tail"`); `.pi/extensions/pij/cli.integration.test.ts` — sandbox-home fixtures (`pij tail` over a real transcript).
- `docs/how/pij.md` — tail docs (`--type` currently documented as if it worked).
- `skills/pij/**` — the `/pij` skill mentions `pij tail` (grep); if the valid-kinds list appears there, `just pij-skill-check` gates it.

## 4. Acceptance (behavioural, mechanical)
- Test (sandbox home, fixture event log with ≥1 event of each kind): `--type bogus` → exit ≠ 0, `E-ARG: --type must be one of: …` naming every kind (text and `--json`); regression pins: `--type receipt` → only receipt events (already true — pin it), no `--type` → all events unchanged.
- **MUT-27a**: remove the parse-time validation → the `bogus` test RED (back to `(no events)` exit 0). **MUT-27b**: list the kinds from a hard-coded array missing one → a test that asserts the message names EVERY member of the event-type union RED. **MUT-27c** (regression guard): drop `type` from the `.read({...})` call at `:3653` → the receipt-only pin RED.
- Gates: `npx vitest run .pi/extensions/pij/` at the merge product; `just typecheck`; `just pij-skill-check`.

## 5. Live verification (after a daemon restart carrying it)
CLI-only: `pij tail $(pij whoami) --type bogus` → `E-ARG: --type must be one of: …`, exit ≠ 0 (today: `(no events)`, exit 0); `--type receipt --lines 5` → only receipt events (unchanged).

## 6. Risks / gotchas that already bit us
- E21 (encode row) and this section's own history: the plan carried a premise ("accepted and ignored") for a day without anyone re-running the command at the tag; the cold-read did — verify a premise by running it before writing acceptance for it (DL-023).
- `just pij-skill-check` is load-bearing when skill text quotes CLI flags.

## 7. Open questions for the human
None.
