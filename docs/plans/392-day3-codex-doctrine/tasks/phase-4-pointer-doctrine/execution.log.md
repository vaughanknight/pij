# Phase 4 execution log — pointer delivery doctrine

**Delegation**: `dlg-0004`
**Worker**: `pij-gunboat-diplomat`
**Starting tip**: `246f234feb9199e8c6623b51ba4a0b62bfcb309e`
**Implementation commit**: `cb6a9ebbb6a1c5cbd1ed276ea2b5fe0422e25dce`

## Implementation

- Added the named four-harness routing invariant in
  `.pi/extensions/pij/core/daemon/loop.test.ts`.
- Documented body-vs-pointer routing and corrected the sqlite-default message history in
  `docs/how/pij.md`.
- Changed only global invariant 2 in `skills/pij/SKILL.md`; the file remains 85 lines.
- Added the DRAFT doctrine amendment for o-prime single-writer incorporation.
- Did not modify `loop.ts`, government, or `orient-global.md`.

## Skill-check PD-02 evidence

- Before: `.harness/temp/s392/skill-check-before.txt` (`just pij-skill-check`, exit 1 on
  pre-existing debt).
- After: `.harness/temp/s392/skill-check-after.txt` (exit 1 on the same debt).
- `diff -u` exit: 0. There are zero new findings, budgets, or required-string changes.

## Gates

| Gate | Result |
|------|--------|
| Named routing invariant | PASS — 4/4 |
| `npx vitest run .pi/extensions/pij/core/daemon/` | PASS — 19 files, 446 tests |
| `just typecheck` | PASS |
| Changed test Biome | PASS |
| `just pij-skill-check` | Expected repository red; before/after outputs are byte-identical |
| `just lint` | Known out-of-fence repository diagnostics; changed TypeScript is clean |

## Observation

The planning brief referred to C10, but C10 contains no pointer clause. The live owner is
`skills/pij/SKILL.md` global invariant 2, so that single clause was edited and C10 was left
untouched.
