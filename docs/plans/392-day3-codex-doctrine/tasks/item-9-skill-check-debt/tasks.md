# Item 9: pay the `just pij-skill-check` debt

**Status**: complete — live-skill commit `bfbb08d4d32da70417850dde6d8cdec5664cae47`

**Base**: origin/main `fa6378a` (git log first) · **Fence**: `skills/pij/**` ONLY (LIVE skills — every agent reads them; consolidate redundancy, NEVER delete a load-bearing instruction). · **Ruling**: o-prime (`../../rulings.md`, item 9 = its own PR, cold-reviewed). · **Gate**: `just pij-skill-check` must go to **0 ✗** (`PIJ_SKILL_ROOT:-skills/pij` → it reads THIS worktree; iterate locally).

## The 10 failures to clear (from `just pij-skill-check`)
**Budget overages** (trim by consolidating duplicated prose + citing `§ C*n*`/`§ Shared conventions` instead of restating; do NOT remove any instruction, mandate, or example that changes behaviour):
1. `references/routes/peer.md` 155 → ≤150 (−5)
2. `references/routes/node.md` 157 → ≤150 (−7)
3. `references/prime/orchestrator.md` 139 → ≤120 (−19)

**Missing/misordered required marker strings** (the check wants these VERBATIM — some may exist in different wording; make the exact string present):
4. `references/routes/peer.md`: add `pij link <child> --parent <parent> [--json]`
5. `references/routes/prime.md`: add `` `pij list --prime --here --json` is current-prime-only ``
6. `references/routes/prime.md`: add `never an active-seat signal`
7. `references/prime/rituals/kickoff.md`: add `verify the automatically persisted structural link with ``pij tree <id> --json``
8. `references/prime/rituals/kickoff.md`: add ``run `pij link <id> --parent <o-prime-id> --json` ``
9. `references/prime/orchestrator.md`: add the missing prime pointer `→ <path>`
10. `references/prime/orchestrator.md`: fix the `human preamble` marker ORDER (currently out of order — the check `check_order` expects the preamble marker in sequence)

## Tasks
| Status | ID | Task | Path | Done When |
|--------|-----|------|------|-----------|
| [x] | T001 | Capture `just pij-skill-check > .harness/temp/s392/skillcheck-9-before.txt` (baseline 10 ✗). Add the 7 verbatim marker strings (#4–#10) in their natural place — for #10 reorder the orchestrator preamble marker so `check_order` passes. Re-run; confirm the 7 marker/order ✗ clear | `skills/pij/references/routes/peer.md`, `…/routes/prime.md`, `…/prime/rituals/kickoff.md`, `…/prime/orchestrator.md` | 7 marker/order ✗ gone |
| [x] | T002 | Trim the 3 over-budget files to budget by consolidating redundant prose and replacing restated conventions with a `§ C*n*` citation (the `dup-prose` rule already forbids restating conventions — use it). PRESERVE every mandate/example/rule; a trim that changes behaviour is a FAIL. Re-run until `just pij-skill-check` = 0 ✗ | same files + `references/routes/node.md` | `just pij-skill-check` 0 ✗; each file ≤ its budget |
| [x] | T003 | Capture `…-after.txt`; gates (`just pij-skill-check` = 0 ✗) + pathspec commit (`git commit -- skills/pij/...`) + `reports/item-9-report.md` listing every line removed with WHY it was redundant (so the reviewer can confirm nothing load-bearing was lost) | `docs/plans/392-day3-codex-doctrine/reports/item-9-report.md` | 0 ✗; report lists each trim with rationale |

## Review focus (for the cold reviewer, stated so the coder aims for it)
The risk is a trim that silently drops a load-bearing instruction from a live skill. The report MUST enumerate each removed/consolidated line with its rationale; the reviewer diffs `git show <commit>` and confirms every deletion is genuine redundancy (restated elsewhere or a cited convention), not a unique rule. `just pij-skill-check` 0 ✗ is necessary but NOT sufficient — semantic preservation is the real gate.
