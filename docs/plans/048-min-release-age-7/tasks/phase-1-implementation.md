# Phase 1 — s048 implementation packet source

**Grant**: Seq 211, base `5830b279941538593a04483bfc1068911bdd3ffd`.

## Goal

Implement the corrected native npm release-age quarantine: `min-release-age=7` **days** for pij-owned root/Pi package-resolution paths, without changing package-vetter report-and-continue behavior or claiming coverage for Pi self-update.

## Required work

1. Add a side-effect-free policy module and tests that define the exact seven-day value and compose the child npm environment safely.
2. Add committed root `.npmrc` native policy configuration.
3. Route `cmdAdd` and `cmdBootstrap` Pi install calls through the policy environment while preserving all existing report-and-continue behavior.
4. Route the permitted `justfile` Pi package-resolution recipes through the same policy without disturbing `--ignore-scripts`.
5. Add a deterministic probe that proves fresh native npm resolution refuses under a deliberately huge **days** threshold, while the production policy remains `7`.
6. Update `RUNBOOK.md` and `docs/how/build.md` with operating boundaries, `npm ci`/audit separation, and no routine bypass recipe.

## Allowed product paths

- `.npmrc`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/packages.ts`
- `justfile`
- `harness/scripts/release-age-probe.ts`
- `RUNBOOK.md`
- `docs/how/build.md`

## Evidence paths

Only `docs/plans/048-min-release-age-7/{tasks,reviews,reports,validations}/**`, `.harness/temp/s048/**`, and CLI-owned flow-pair/flow state.

## Forbidden / non-goals

- No package manifests, lockfiles, CI, government files, main checkout/index, daemon/global mutation, or direct main push.
- Do not change the package-vetter verdict policy: add/bootstrap/audit remain report-and-continue; strict `pkg vet` remains strict.
- Do not add a project-level `min-release-age=0` bypass recipe.
- Do not claim coverage for Pi’s own self-update command, which is explicitly outside this release-age boundary.
- Do not stage or commit. The git index is free but needs an actual fresh baton immediately before staging, naming exact paths plus cold-review/gate evidence.

## Proof expectations

Run focused policy and package tests, deterministic probe, `npm ci`, root audit evidence, and the required harness checks appropriate to the phase. Record commands, results, changed-path inventory, and residual risks in the phase evidence.
