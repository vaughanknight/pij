# Focused re-review — s046 T011 R2

**Original review**: `reviews/review-t011.md`
**Fix**: `reviews/fix-t011-r1.md`
**Current diff**: `.flow-pair/runs/2026-07-12T21-53-55Z-github.com-AI-Substr/diffs/diff-0009.patch`

## Question

Are H1 and M1 fully fixed without regression or scope expansion?

## Required checks

1. Kickoff executable order is:
   - adopted canary legs (a)+(b);
   - link and tree verification;
   - brief pointer as leg (c), then canary closure.
2. Adoption variant distinguishes structural parent from absent/unknown
   `spawnedBy` close ownership.
3. Sensor enforces identity-before-link and link-before-leg-(c) brief.
4. Link-after-brief mutation goes RED; restore byte-identical.
5. `PIJ_PARENT_ID` docs describe an environment snapshot, not live registry state;
   `pij link` truth is observed through tree; explicit-root stale-shell clearing
   guidance is accurate and does not invent product behavior.
6. All original seven T011 guards and PR15/17/18 preservation remain green.
7. R1 scope is exactly skill-check, kickoff, `docs/how/pij.md`, and execution evidence.

## Commands

- `just pij-skill-check`
- `just test harness/scripts/local-path-check.test.ts`
- `just test .pi/extensions/pij/cli.integration.test.ts`
- `just lint`
- `just typecheck`

## Output

Write `docs/plans/046-pij-real-trees/reviews/review-t011-r2.md` with verdict,
mutation evidence, scope, and remaining uncertainty. No edits.
