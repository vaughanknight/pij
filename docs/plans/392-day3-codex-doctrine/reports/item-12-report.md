# Item 12 report — skill-check residual hardening

**Outcome**: PARTIAL — R2/R3/R4/R6/ADV-2 and NIT-1 are implemented; the mandatory
repository-wide gate is red outside this item fence.

## Claim

`pij-skill-check` now rejects the in-section R2 decoy bypass, protects the original
Build-configuration defect site, and prevents the second pair-order loop from resolving
markers elsewhere in the document. R5 now skips only simple pointy placeholders, not real
paths wrapped in CommonMark angle brackets. ADV-2 limits R3's literal to the Build-config
section, so a duplicate elsewhere cannot mask an inversion.

## Behavior

- Canonical real skill tree: **PASS**, zero failures.
- R2 step-11 inversion plus an earlier in-section read-back decoy: **FAIL**.
- R3 Build-configuration-only inversion with canonical step 11 intact: **FAIL**.
- ADV-2 Build-config inversion plus a later exact-literal decoy: **FAIL**.
- R4 outside fallback: later pair markers are no longer reported falsely out of order.
- R5 `<path>` placeholder: **PASS**.
- R6 `[x](<./does-not-exist.md>)` pointy real path: **FAIL**.
- Existing R1 inversion and genuine journey inversion: **FAIL**.
- Required suites: **PASS**, 126 passed and 1 skipped across checker, CLI integration,
  and acceptance sweep.

## Decisions

**R2** keeps the reviewer-verified `grep -E '^11\. '` anchor. This hard-codes the current
step number, but renumbering empties `profile_step` and reaches the existing missing-marker
failure. The tradeoff is therefore brittle but fail-closed.

**R4** is section-scoped, not deliberately whole-file. The pair-order loop reuses the
canonical `## Ordered entry` slice already used by the journey loop.

**ADV-2** replaces R3's whole-file marker check with the reviewer-verified
`## Build configuration` slice. The new test first proved the old bypass with checker
exit 0, then turned green when the section scope landed.

**R6** preserves R5's placeholder behavior. Targets shaped as `<word>` still skip, while
targets containing a slash or extension are unwrapped before the normal filesystem check.

**NIT-1** moves the full self-adopt flags to `Tmux push identity`, away from the
external-pull prohibition. The route remains 146/150 lines.

## Item gates

- `just pij-skill-check`: **PASS**.
- Required checker + CLI integration + acceptance sweep tests: **PASS**, 126 passed and
  1 skipped.
- `bash -n harness/scripts/pij-skill-check.sh`: **PASS**.
- Shellcheck of the changed shell surface with existing `SC2164/SC2015/SC2016` baseline
  codes excluded: **PASS**.
- Changed-test/route Biome: **PASS**.
- `just typecheck`: **PASS**.

## Full-gate blocker

`just lint` and `just self-check` fail on existing files outside the authorized item-12
paths. `harness checks` also reports repository-wide failures in `lint`, full `test`,
`windows-compat`, and `smoke`. The packet fence forbids fixing those surfaces, so this
candidate cannot claim `gatesClean: true`.

## Blast radius

This checker gates every pij skill change. The added tests execute the real shell checker
against copied real skill fixtures, preserving the item-11 proof shape rather than
reimplementing the assertions in TypeScript.
