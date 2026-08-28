# 27 — `pij tail <id> --type <T>` is accepted and ignored: make it filter

**Item id / stream at handover:** 27 · s391-day3-core
**Status at v0.2.0 (tag `d120c53`):** designed (Phase 11 of the s391 plan; dossier + packet ready; no branch)
**Size estimate:** S (1–2 h) · **Order / dependencies:** none

## 1. Why this exists (the observed failure, with evidence)
- O-prime, 2026-08-27 14:50Z (s391 plan Phase 11, `docs/plans/391-day3-core/391-day3-core-plan.md` § "Phase 11: Item 27", encode E21): `pij tail <id> --type receipt` prints the whole transcript — the flag is parsed and never applied. Verified from the prime's seat while chasing receipts during the sqlite-queue migration; item 23 already stopped advertising `--type` in the send hint because it did nothing.
- At `d120c53`, `core/cli.ts:1296-1306`: usage string names `--type T`, `:1301` rejects a bare `--type`, `:1306` stores `type: flags.type` on the parsed command — and the tail handler never reads `type` (grep `\.type` in the tail execution path: no consumer). Dossier: `docs/plans/391-day3-core/tasks/phase-11-item-27-tail-type-filter/tasks.md`.

## 2. What is ruled (design / spec)
- AC-25 (plan): `pij tail <id> --type receipt` prints only receipt lines (same with `--json`); an unknown `--type` is `E-ARG` naming the valid kinds; the unfiltered default is unchanged.
- Valid kinds = the transcript event kinds the tail renderer already distinguishes (`text`, `receipt`, `cmd`, `bg`, watchdog turns …) — enumerate from the renderer, not from memory; the error message lists them.

## 3. Where the code is (at tag `d120c53`)
- `.pi/extensions/pij/core/cli.ts` — parse `:1290-1310` (`case "tail"`); the tail executor (grep `verb: "tail"` / `runTail`) reads the seat's transcript/log via the registry `dataDir` and renders lines; add the filter there, before rendering, for both text and `--json`.
- `.pi/extensions/pij/core/cli.test.ts` — existing tail tests (grep `"tail"`); `.pi/extensions/pij/cli.integration.test.ts` — sandbox-home fixtures (`pij tail` over a real transcript).
- `docs/how/pij.md` — tail docs (`--type` currently documented as if it worked).
- `skills/pij/**` — the `/pij` skill mentions `pij tail` (grep); if the valid-kinds list appears there, `just pij-skill-check` gates it.

## 4. Acceptance (behavioural, mechanical)
- Test (sandbox home, fixture transcript with ≥1 line of each kind): `pij tail <id> --type receipt` → only receipt lines; `--json` → only objects with `kind: "receipt"`; no `--type` → all lines byte-identical to today; `--type bogus` → exit ≠ 0, `E-ARG: --type must be one of: …` naming every kind.
- **MUT-27a**: drop the filter call → the receipt-only test RED (extra lines). **MUT-27b**: filter on `kind !== type` (inverted) → RED. **MUT-27c**: accept any string as type → the `bogus` test RED.
- Gates: `npx vitest run .pi/extensions/pij/` at the merge product; `just typecheck`; `just pij-skill-check`.

## 5. Live verification (after a daemon restart carrying it)
CLI-only: `pij tail pij-relative-panther --type receipt --lines 5` → five `[pij receipt …]` lines and nothing else; `--type bogus` → `E-ARG` with the list.

## 6. Risks / gotchas that already bit us
- E21 (encode row): a flag that parses but does nothing is a lie in the help text; item 23 removed the advertisement rather than the flag — finish the job.
- `just pij-skill-check` is load-bearing when skill text quotes CLI flags.

## 7. Open questions for the human
None.
