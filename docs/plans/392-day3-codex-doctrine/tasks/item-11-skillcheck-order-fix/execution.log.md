# Item 11 execution log — skill-check order hardening

**Delegation**: `dlg-0011`
**Worker**: `pij-gunboat-diplomat`
**Implementation commit**: `f6d3734c0583259f78f1ee3b7ae76dea40344c1f`

## TDD

- RED fixture run: 2 failed, 1 passed.
  - Correct canonical journey with a backward `human preamble` cross-reference failed
    under the old global `grep | head -1`.
  - The R1 mutant stayed checker-green, so the test expecting an order failure went RED.
  - A genuinely out-of-order journey already failed.
- GREEN: all 3 fixture-driven script tests pass.

## Implementation

- The role marker remains document-level.
- Journey markers are resolved only inside the canonical `## Ordered entry` section, using
  the first occurrence of each marker within that section.
- R1 compares line-and-column positions for read-back and `confirm inline` against
  `After the human confirms the fleet`, catching same-line inversions.
- The fixture copies the real skill tree and its external team-scaffold link, then runs the
  real shell script through `PIJ_SKILL_ROOT`.

## F5 decision

Reverted the forced wording from `preamble checkpoint` to `human preamble checkpoint`.
The latter is clearer and was safe once order resolution became section-bounded. The
ordered-entry steps themselves were not reordered.

The optional `never a modal question UI` phrase was not restored; global invariant 9
already owns that rule.

## Gates

- `npx vitest run harness/scripts/pij-skill-check.test.ts`: 3/3 passed.
- `just pij-skill-check`: all green, including R1.
- `bash -n harness/scripts/pij-skill-check.sh`: passed.
- `npx biome check harness/scripts/pij-skill-check.test.ts`: passed.
- `just typecheck`: passed.
