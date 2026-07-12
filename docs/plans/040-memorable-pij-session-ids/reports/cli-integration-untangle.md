# cli.integration.test.ts untangle
**Incident**: `government/incidents/INC-002.md`
**Date**: 2026-07-12

## Decision

Use the o-prime's three-step untangle now; do not wait for reviewer completion.

## Evidence preservation

- s040's original file hunks are preserved in
  `reviews/review-input.patch`.
- Patch SHA-256:
  `5750000067f3f94e381f211972fb6cddd17bd067c85cf9c77d89adcbc3b956d5`.
- Reviewer is instructed that the frozen patch remains authoritative while the live
  file temporarily returns to `HEAD`.

## Sequence

1. s040 restores `.pi/extensions/pij/cli.integration.test.ts` to `HEAD`.
2. o-prime reapplies and commits only the CI timeout repair.
3. s040 reapplies only its file hunks from `review-input.patch` with three-way apply.
4. s040 reruns the focused integration suite and refreshes the review patch/hash if the
   merged file differs.

## Completed

- O-prime timeout commit: `021d07a`.
- s040 hunks were reconstructed from the old base + frozen patch and merged into the
  committed timeout fix without touching the git index.
- Live s040 diff relative to `021d07a`: 232 insertions, 2 deletions.
- File SHA-256:
  `c97582c59a2ae7a509a067cfe18d4e945216f2afab4d0c6bf77fb0a3cafef7a4`.
- `cli.integration.test.ts`: 26/26 passed, including the prime timeout case and all
  memorable-id spawn/adopt cases.
- Frozen review patch remains authoritative for the coder-only diff; the committed
  timeout repair is independently covered by the live focused test.

## Round 2 - CI formatting repair

The timeout commit passed tests but failed Biome line-width formatting on CI.

Sequence:

1. s040 restores the live file to `021d07a`; round-2 s040 hunks remain preserved in
   `reviews/review-input-fixed.patch` SHA
   `71d8482aaf1a558116646d463221066d0dc4f0f527b9cccfb719ddfffbd24c46`.
2. O-prime formats, lint-gates, commits, and pushes the timeout-only repair.
3. s040 three-way reapplies its hunks, runs Biome `--write` on the live file, and reruns
   the focused integration test.

Completed:

- O-prime format commit: `40528df`.
- s040 hunks merged from round-2 patch without index use.
- Biome `check --write` and clean check both passed.
- `cli.integration.test.ts`: 27/27 passed.
- Live file SHA-256:
  `d7f82dfd2f4fcdb037ae5cb2d98c47e6904c5df04a1358fd1bd97f14e4f83f5d`.
