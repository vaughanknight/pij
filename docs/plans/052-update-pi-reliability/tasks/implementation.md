# s052 implementation task — authoritative npm resolution

## Authority and containment

Implement only in `/Users/jordanknight/pi-hacking/pij-worktrees/s052-update-pi-reliability` on `s052/update-pi-reliability`, reconciled base `591f188f394ab17d8c34a800fd55f87c752d4005`. Before any edit, re-prove `HEAD`, `origin/main`, and their merge-base all equal that SHA.

Read the binding contract first:

- `docs/plans/052-update-pi-reliability/reports/design-contract.md`
- reconciled research at `../research/coder-findings.md`
- live owner brief at `/Users/jordanknight/pi-hacking/pij/government/briefs/s052-update-pi-reliability.md`

No stage, commit, amend, push, fetch, rebase, worktree operation, installed-Pi edit, global npm config/cache edit, or real `~/.pi` mutation. `node_modules` is an operational symlink and is excluded from the product inventory.

No direct npmjs read, comparison, fallback, or live diagnostic call. During implementation use hermetic local registries only. Ask the orchestrator before any live proxy call.

## Allowed product files

- `.npmrc`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/release-age-probe.ts`
- `harness/scripts/npm-resolution-run.ts` (new)
- `harness/scripts/npm-resolution-diagnostic.ts` (new)
- `harness/scripts/npm-resolution-policy.integration.test.ts` (new)
- `harness/scripts/packages.ts` only at existing process/environment seams
- `harness/scripts/vetters/npm-audit.ts`
- `harness/scripts/vetters/lockfile-lint.ts`
- `justfile`
- `install-windows.ps1`
- `docs/how/update-pi.md`
- `docs/how/build.md`
- `docs/plans/052-update-pi-reliability/**` evidence

Protected: `package.json`, `package-lock.json`, `.pi/settings.json`, `.pi/packages.yaml`, `.github/workflows/**`, `.pi/extensions/pij/**`, `skills/flow-pair/**`, government, and all unrelated paths.

## Required behavior

1. `.npmrc` is byte-exact proxy + online + age 7 + audit, as frozen in the contract.
2. Expand the typed policy helper to strip caller registry/online/age/before case-insensitively, preserve caller immutability, and supply governed lowercase values.
3. Provide a separate root-lock environment mode/helper that enforces proxy + online while clearing inherited age/before; root `npm ci --min-release-age=null` remains the sole age exception. Do not rely only on `.npmrc` where inherited environment can override authority.
4. A thin fail-closed command wrapper must preserve exact child status and have no retry/fallback. Use it consistently for Unix global npm, Pi package/bootstrap/add, prerequisite shell, extension update, audit/check resolution, and intentional remote `npx`.
5. Inventory every operational `npx` in `justfile`:
   - locally locked tools must execute their local bin/wrapper and fail closed if dependencies are absent;
   - intentional remote resolution must receive explicit proxy + online + age;
   - `just pij` must use `node harness/scripts/pij-cli.cjs`.
6. `pi-doctor` must detect the observed stale global bin link. Inspect the global `pij` symlink target/bin shape robustly (expected suffix `pij/harness/scripts/pij-cli.cjs`); do not compare a fully resolved realpath to a non-resolved `<global npm root>` path.
7. Windows must set/restore registry, online, age, and before on success/failure. Root lock replay must explicitly govern proxy+online while retaining only the age-null exception.
8. `ensureRequires`, package Pi installs, package audit, and remote lockfile-lint must receive the shared environment. Keep vetting report-and-continue unchanged. Pin a remote tool version if needed to make its resolution behavior explicit; do not alter manifests/locks.
9. The manual diagnostic is proxy-only and fail-closed. It must prove age eligibility with an actual npm resolution step before any `npm pack`; never download/pack a too-young version merely because `npm view` can see it. Use empty temporary HOME/cache/config and cleanup in `finally`.
10. Replace/rework any `release-age-probe` use of real HOME/cache/root locked downloads so its deterministic proof is isolated. Preserve the sole lock exception, age refusal, config proof, audit observability, and manifest/lock immutability without assuming the current proxy exposes every root-lock artifact.
11. Hermetic fixture must prove stale-client recovery, proxy truth change, proxy inconsistency fail-closed, exact-lock absence fail-closed, age 7 refusal versus test-only age 0, and zero requests to a fixture-only upstream. Request logs/subprocesses are load-bearing; source-string scans alone are insufficient.
12. Preserve real PowerShell execution. Add `-NoLogo`, use finite 30s child and derived 35s named-test bounds, keep child < test, no global timeout, and retain/expand all restoration and forced-error assertions.
13. Do not add APPEND_SYSTEM-only sync in s052. Do not edit the blocked runtime-packaging paths.

## Test-quality requirements

Demonstrate named mutations or structural non-vacuity for:

- removing online revalidation;
- changing authority away from the fixture proxy;
- weakening age;
- retaining mixed-case caller overrides or `before`;
- adding fallback/requesting fixture upstream;
- treating missing/corrupt tarball or missing exact lock artifact as success;
- removing any Windows restoration;
- allowing local `pij` invocation to trigger npm resolution.

Tests must not mutate real global state/cache/`~/.pi`.

## Execution and evidence

Run, in order:

1. focused policy/integration/vetter tests;
2. repeat real-PowerShell restoration five times;
3. `just typecheck` and `just lint`;
4. offline local-runtime proof for both wrapper and `just pij`;
5. full `just test`.

**Do not run `harness checks` or `just self-check` in the implementation worktree. Do not mutate and then restore any protected file.** After coder completion, the orchestrator will create a disposable isolated validation clone/check-out at the exact reconciled base, apply/copy the exact implementation diff and new product files, attach dependencies without npm resolution, run canonical `harness checks` there, preserve its evidence, and destroy the disposable copy. The implementation worktree's `.pi/packages.yaml` must never be changed by the gate.

Do not run the live proxy diagnostic without orchestrator authorization.

Persist exact commands/results, durations, mutation/non-vacuity reasoning, touch inventory, and residual risks in:

- `docs/plans/052-update-pi-reliability/reports/implementation-checkpoint.md`
- `docs/plans/052-update-pi-reliability/reviews/execution.log.md`

Before completion, prove `git diff --check`, index empty, and no protected diff. Send a pointer-only completion message and idle. Cold review is a separate phase.
