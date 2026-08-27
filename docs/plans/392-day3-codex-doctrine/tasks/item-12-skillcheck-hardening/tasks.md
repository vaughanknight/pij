# Item 12: harden pij-skill-check (R2/R3/R4/R6/ADV-2 + NIT-1) — follow-up

**Status**: full implementation including ADV-2 complete; repository pre-commit remains blocked outside this item fence.

**Fence**: `harness/scripts/pij-skill-check.sh` + `pij-skill-check.test.ts` + the line-neutral NIT-1 move in `skills/pij/references/routes/peer.md`. Non-blocking follow-up to item 11. Sources: `reviews/item-11-review.md` §§ R2/R3/R4 and the item-9-FX review's R6/NIT-1.
- **R2** (decoy bypass): `marker_position` takes the FIRST in-section occurrence, so one incidental line mentioning "back verbatim" inside the Ordered-entry section disarms the R1 check (EXIT 0 on an inverted step 11). The doc grows such cross-refs on its own (line 10). Fix = the reviewer's verified 4-line prototype: anchor the R1 markers to the NUMBERED step-11 line, not any in-section occurrence (prototype green-on-real, red-on-decoy; text in the review). Add the decoy-mutant test case.
- **R3** (Build-config site): inverting ONLY the Build-configuration read-back clause (the original defect's own site) stays green — the order check covers the journey, not that clause. Add a LITERAL clause pin (presence + relative order) for the Build-config read-back-before-confirm. Add a test.
- **R4** (second order loop): `pij-skill-check.sh:479-495` ("orchestrator pair order") still uses whole-file `grep|head -1` (reproduced 3 spurious failures on correct doctrine). Either section-scope it like the first loop, or add a `:479` comment recording it is deliberately whole-file (state the call). Add a fixture if scoped.

Cold-reviewed like any gate change (blast radius = every skill PR). Lands after item 11; independent of 10b.

## R2 prototype (reviewer-verified, ready to apply) — harness/scripts/pij-skill-check.sh
Anchor the R1 markers to the numbered step-11 line so an in-section decoy can't win `marker_position`'s first-occurrence:
```diff
-  readback_pos=$(printf '%s\n' "$ordered_entry" | marker_position "back verbatim")
-  confirm_inline_pos=$(printf '%s\n' "$ordered_entry" | marker_position "confirm inline")
-  fleet_confirm_pos=$(printf '%s\n' "$ordered_entry" | marker_position "After the human confirms the fleet")
+  profile_step=$(printf '%s\n' "$ordered_entry" | grep -E '^11\. ' || true)
+  readback_pos=$(printf '%s\n' "$profile_step" | marker_position "back verbatim")
+  confirm_inline_pos=$(printf '%s\n' "$profile_step" | marker_position "confirm inline")
+  fleet_confirm_pos=$(printf '%s\n' "$profile_step" | marker_position "After the human confirms the fleet")
```
Verified: real skills EXIT=0; R2 decoy mutant EXIT=1. **Caveat (state your call in the report)**: it hard-codes step `11` — renumbering empties `profile_step` and trips the `missing` arm, which FAILS CLOSED (safe). Add the R2 decoy-mutant as a test case. If you can anchor to the read-back step by a more stable signal than the literal "11.", do so and say why; else keep the prototype + document the fails-closed tradeoff.

**Implementation call**: keep the reviewer-verified `^11\. ` anchor. The three required
phrases intentionally resolve on that one canonical numbered line; a future renumber
empties `profile_step` and fails closed through the existing missing-marker arm.

## Tasks
| Status | ID | Task | Path | Done When |
|--------|-----|------|------|-----------|
| [x] | 1 | R2: apply the anchor fix + add the decoy-mutant test case | `harness/scripts/pij-skill-check.sh`, `pij-skill-check.test.ts` | decoy mutant → FAIL; real skills → 0 ✗ |
| [x] | 2 | R4: section-scope the second order loop (:479-495) like the first, OR add a `:479` comment stating it is deliberately whole-file (state the call); add a fixture if scoped | same | R4 loop no longer spurious on correct doctrine, or documented |
| [x] | 3 | R3: add a literal clause pin (presence + relative order) for the Build-config read-back-before-confirm site + a test | same | inverting only the Build-config clause → FAIL |
| [x] | 4 | R6: preserve R5's simple `<placeholder>` exemption but unwrap and check pointy-bracket real paths | same | `<path>` passes; `<./does-not-exist.md>` fails |
| [x] | 5 | NIT-1: move the full-flags adopt note away from the external-pull prohibition without growing `peer.md` | `skills/pij/references/routes/peer.md` | wording is no longer adjacent; route stays within budget |
| [x] | 6 | ADV-2: section-scope the R3 literal to `## Build configuration` and add the outside-decoy mutant | `harness/scripts/pij-skill-check.sh`, `pij-skill-check.test.ts` | inverted Build config plus a later exact decoy → FAIL |
| [ ] | 7 | Gates + pathspec commit + `reports/item-12-report.md` | report | Item gates are green; full `just self-check`/`harness checks` remain blocked outside this fence |

## Base note (2026-08-27)
Built on main `9912bf8`, preserving R5 from item 9-FX. R6 refines rather than removes
that exemption: only a simple pointy-bracket placeholder with no slash or extension is
skipped; a pointy-bracket real path is unwrapped and checked.

## ADV-2 (item-12 review, Low non-blocking, reviewer-VERIFIED fix)
R3's Build-config pin is a WHOLE-FILE `require_marker` (unlike section-scoped R2/R4), so inverting the Build-config clause AND planting the same sentence under '## Packaging and review law' goes fully green with doctrine wrong — the SAME bypass class item 12 closes. Reviewer ran the fix: section-scope R3 via the existing `section()` helper (5 lines, drop-in, 9/9 existing checker tests pass, green on canonical, catches the decoy). Fold decision: o-prime.

**Folded**: R3 now searches only the `## Build configuration` slice. The added decoy
fixture proved RED on the old whole-file pin (checker exit 0) and GREEN after the fix.
