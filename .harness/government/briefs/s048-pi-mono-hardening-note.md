# s048 upstream note — pi-mono supply-chain hardening
**From**: Jordan · **Recorded by**: pij-primary-carp · **Date**: 2026-07-13T23:41:00Z

## Human note, verbatim

> Supply-chain hardening
> We treat npm dependency changes as reviewed code changes.
>
> Direct external dependencies are pinned to exact versions. Internal workspace packages remain version-ranged.
> .npmrc sets save-exact=true and min-release-age=2 to avoid same-day dependency releases during npm resolution.
> package-lock.json is the dependency ground truth. Pre-commit blocks accidental lockfile commits unless PI_ALLOW_LOCKFILE_CHANGE=1 is set.
> npm run check verifies pinned direct deps, native TypeScript import compatibility, and the generated coding-agent shrinkwrap.
> The published CLI package includes packages/coding-agent/npm-shrinkwrap.json, generated from the root lockfile, to pin transitive deps for npm users.
> Release smoke tests use npm run release:local to build, pack, and create isolated npm and Bun installs outside the repo before tagging a release.
> Local release installs, documented npm installs, and pi update --self use --ignore-scripts where supported.
> CI installs with npm ci --ignore-scripts, and a scheduled GitHub workflow runs npm audit --omit=dev plus npm audit signatures --omit=dev.
> Shrinkwrap generation has an explicit allowlist for dependency lifecycle scripts; new lifecycle-script deps fail checks until reviewed.

## Required s048 reconciliation

Before implementation or coder dispatch:

1. Verify the npm version and unit/semantics behind pi-mono's `min-release-age=2` before asserting that pij's planned `10080` value is equivalent to seven days.
2. Compare pij's current controls against each upstream control: exact pins, `save-exact`, lockfile guard, shrinkwrap, release smoke, `--ignore-scripts`, audit signatures, and lifecycle-script allowlisting.
3. Reuse compatible native/upstream patterns rather than creating parallel machinery.
4. Preserve the documented Pi self-update boundary and do not overclaim coverage of upstream commands.
5. Classify each upstream control as adopted, already covered, complementary, or explicitly outside the current plan.
6. Do not expand the granted path scope without reporting to the prime and receiving a refreshed fence.

## Verified correction

Installed npm 11.10.0 defines `min-release-age` in **days**, not minutes:

- `@npmcli/config/lib/definitions/definitions.js` uses `hint: '<days>'`.
- Its documentation says only versions available more than the given number of days are eligible.
- Its implementation computes `Date.now() - (86400000 * value)`.

Therefore:

- pi-mono's `min-release-age=2` means **two days**.
- pij's intended seven-day policy must be `min-release-age=7`.
- The s048 plan's current `10080` value would mean 10,080 days and is invalid.

Stop before implementation or coder dispatch. Repair every minutes/`10080` assumption in the plan, acceptance criteria, tasks, tests/probes, and validation; rerun cold validation and report the corrected checkpoint before requesting implementation release again.
