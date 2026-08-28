# Item 11: fix the pij-skill-check order-check false-positive

**Status**: complete — implementation commit `f6d3734c0583259f78f1ee3b7ae76dea40344c1f`

**Fence** (o-prime-widened): `harness/scripts/pij-skill-check.sh` + its test (`harness/scripts/pij-skill-check.test.*` or add one) + possibly REVERT the item-9 F5 reorder in `skills/pij/references/prime/orchestrator.md` (see Req 3). Lands AFTER item 9, BEFORE 10b.
**Source**: `reports/item-9-F5-harness-check-ticket.md` (cold review F5, verified).

## Problem
The order check greps `head -1` for a required marker and matches the FIRST line that matches ANY marker — so a backward cross-reference (e.g. 'human preamble' mentioned above the Ordered-entry section) is matched instead of the section itself → false positive. This forced a live-doctrine reorder in `orchestrator.md` (bfbb08d) to silence the linter.

## Requirements (o-prime)
1. The check must match the **FIRST occurrence IN DOCUMENT ORDER of each required marker** (per-marker first position), NOT the first line matching any of them. So it verifies markers appear in the required RELATIVE order by their first real occurrence.
2. **Fixture**: pin it with a test fixture that reproduces the exact reorder the bug forced today (a doc with a backward cross-reference above the section) — the fixed check must PASS on the correct-order doc and FAIL only on a genuine out-of-order doc.
3. **Revert decision**: if the item-9 F5 reorder harmed reading order, REVERT it in this PR (state the call in the report). [Pre-assessment: TBD after reading the exact F5 edit — quote base vs head and judge reading-order harm.]

## Tasks (draft — finalize when item 9 lands)
| Status | ID | Task | Path |
|--------|-----|------|------|
| [x] | 1 | Read the order-check impl (`check_order`/head -1 logic) in `pij-skill-check.sh`; write a failing test/fixture reproducing the false positive | `harness/scripts/pij-skill-check.sh`, new fixture/test |
| [x] | 2 | Fix: per-marker first-document-order matching; confirm the fixture flips RED→GREEN and real out-of-order still fails | `pij-skill-check.sh` |
| [x] | 3 | Assess F5 reading-order harm; revert the orchestrator.md reorder if harmful (state the call); re-run `just pij-skill-check` = 0 ✗ | orchestrator.md (maybe) |
| [x] | 4 | Gates + pathspec commit + report | `reports/item-11-report.md` |

## Note
Blast radius: `harness/scripts/**` affects the gate for EVERY skill PR machine-wide. Cold-reviewed like any check change. This is the "fix the check first, then the code" second-objective encode (orient-global).

## → R1 (folded in from item-9 re-review, o-prime-endorsed) — NEW requirement
The item-9 saga proves the deeper hole: `pij-skill-check` pins the PRESENCE of "read it back verbatim" but NOT its ORDER, so the F1 inversion (read-back moved to AFTER human confirmation) passed green — twice. Item 11 (fix the broken head-1 order match) does NOT close this: R1 is a MISSING check, not a broken one.
- **R1 requirement**: ADD an ordering assertion that the read-back precondition (`read it back verbatim`/`confirm inline`) appears BEFORE the fleet-confirmation/creation marker (`confirms the fleet`/`before fleet creation`) in document order in `orchestrator.md` — so F1's mandate gets deterministic back-pressure.
- **RED fixture (ready-made by the reviewer)**: `pij-joint-nightingale` re-inverted F1 at both sites with the literal string still present and the gate stayed GREEN — reproduce that as the fixture; the fixed check must go RED on it and GREEN on the correct order (fa6378a/346c19f).
- Optional (non-blocking, 6 spare lines in orchestrator.md): "never a modal question UI" phrase has been absent since bfbb08d (adjudicated as covered by invariant 9). Restoring it is optional — state the call.

## Precise bug + anchors (orchestrator-verified on fa6378a)
- The order loop is at `harness/scripts/pij-skill-check.sh:380-390`; the offending line is **:382** `line=$(grep -nF "$marker" "$orchestrator" | head -1 | cut -d: -f1)`. The marker list is the `while IFS='|' read` heredoc around **:398** (`preamble|human preamble`, etc.).
- **Mechanism**: `head -1` takes the FIRST occurrence of the marker string anywhere — including an incidental backward CROSS-REFERENCE above the marker's canonical section (e.g. "human preamble" mentioned in prose above the Ordered-entry section). That earlier line < `previous` → false "out of order". Req 1 fix: resolve each marker to its CANONICAL occurrence (anchor to a heading/section, or use a marker string unique to the canonical spot), not an incidental mention — while still enforcing real relative order.
- **No test exists** for `pij-skill-check.sh` (siblings like `local-path-check.test.ts` show the pattern). ADD `harness/scripts/pij-skill-check.test.ts` (or a fixture-driven test) that runs the script against fixture docs: (a) a correct-order doc with a backward cross-ref → PASS (proves Req 1); (b) the R1 mutant (read-back moved AFTER fleet-confirmation, literal string still present) → FAIL (proves R1); (c) a genuinely out-of-order doc → FAIL.
- **F5 revert call**: read the bfbb08d 'human preamble'/step-11 reorder; if it harmed reading order, revert it in this PR now that the check no longer forces it (state the call in the report; the Ordered-entry section was byte-identical fa6378a..bfbb08d per the reviewer, so the reorder was cosmetic-to-satisfy-the-linter — likely safe to revert).
