# Item 12 execution log — skill-check residual hardening

**Delegation**: `dlg-0014`
**Worker**: `pij-remote-falcon`
**Base**: `a0ea133` (full item-12 candidate)

## Implementation

- R2 anchors all three read-back-order markers to the numbered step-11 line with
  `grep -E '^11\. '`. An in-section summary decoy can no longer satisfy the assertion.
- R3 pins the full Build-configuration clause `read it back verbatim and confirm inline
  before fleet creation` inside the `## Build configuration` slice, so neither an inversion
  nor an exact decoy in another section can satisfy it.
- R4 resolves the second pair-order loop against the existing `## Ordered entry` slice
  instead of the whole orchestrator document.
- R6 preserves R5 for simple `<placeholder>` link targets, but unwraps pointy-bracket
  targets containing a slash or extension and checks the resulting real path.
- NIT-1 moves the full-flags self-adopt note from the external-pull prohibition paragraph
  to the `Tmux push identity` heading. `peer.md` remains within its hard budget.
- Added one fixture mutation for each residual. The R4 fixture proves an outside fallback
  no longer turns the later coder, reviewer, and delegation markers into false order errors;
  the R6 fixture proves `[x](<./does-not-exist.md>)` fails while `<path>` still passes.

## ADV-2 TDD

- RED on old R3: the new Build-config inversion plus later exact-literal decoy made the
  checker exit 0; the 10-test checker suite reported exactly 1 failed and 9 passed.
- GREEN: replacing the whole-file `require_marker` with the reviewer-verified
  `section "$orchestrator" "## Build configuration"` check makes the decoy mutant fail
  with `missing in ## Build configuration`.

## R2 anchor decision

Kept the reviewer-verified literal step-11 anchor. It is intentionally narrow because all
three compared phrases are on that canonical line. Renumbering empties `profile_step` and
trips the existing missing-marker error, so the brittle edge fails closed rather than
silently accepting a weakened contract.

## Gates

- `just pij-skill-check`: passed, real skill tree has zero failures.
- `just test harness/scripts/pij-skill-check.test.ts .pi/extensions/pij/cli.integration.test.ts .pi/extensions/pij/acceptance-sweep.test.ts`: 126 passed, 1 skipped.
- `bash -n harness/scripts/pij-skill-check.sh`: passed.
- `shellcheck -e SC2164,SC2015,SC2016 harness/scripts/pij-skill-check.sh`: passed.
  The excluded codes are existing findings elsewhere in the unchanged script.
- `npx biome check harness/scripts/pij-skill-check.test.ts skills/pij/references/routes/peer.md`: passed.
- `just typecheck`: passed.
- `just lint`: failed on existing files outside this item fence.
- `harness checks`: `local-paths`, typecheck, package audit, and snapshot checks passed;
  repository-wide `lint`, full `test`, `windows-compat`, and `smoke` failed.

## Outcome

R2, R3, R4, R6, ADV-2, and NIT-1 are implemented and individually pinned. The phase
remains `PARTIAL` because the repository's mandatory full gate is red on out-of-fence work.
