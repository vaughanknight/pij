# s052 implementation checkpoint

**Completed:** 2026-07-15T02:41:28Z
**Cold-review fixes completed:** 2026-07-15T03:59:02Z
**Base:** `591f188f394ab17d8c34a800fd55f87c752d4005`
**Branch:** `s052/update-pi-reliability`
**Containment:** no live proxy/npmjs request, installed-Pi edit, npm global
config/cache edit, `~/.pi` mutation, protected-path edit, stage, commit, or push.

## Outcome

The canonical npm resolution surfaces now use the Microsoft package-feed proxy
as their only authority, replace every lock-resolved registry host with that
authority, force online client metadata revalidation, and retain the seven-day
client release-age policy. Frozen root lock replay remains the sole age
exception and still governs registry, lock-host replacement, and online
behavior.

The implementation:

- freezes `.npmrc` to proxy + lock-host replacement + online + age seven + audit;
- strips caller registry, lock-host replacement, online, age, and `before` overrides
  case-insensitively without mutating the caller;
- adds a fail-closed runner that preserves exact child exit status;
- governs global Pi install, Pi package install, prerequisite shells,
  extension update, package audit, and remote lockfile-lint resolution;
- replaces operational local-tool `npx` calls in `justfile` with locked local
  bins or the checked-in `pij` wrapper;
- detects the observed stale globally linked `pij` bin shape in `pi-doctor`;
- saves, sets, and restores all five Windows policy variables on success and
  failure, including the root-lock age-clear mode;
- adds a proxy-only manual diagnostic with isolated temporary npm state;
- replaces the release-age probe's real cache/root-lock use with a local
  deterministic registry;
- makes Unix bootstrap attempt every package but exit non-zero after any
  prerequisite or `pi install` execution failure, without changing report-only
  vet verdict semantics;
- adds a two-registry hermetic integration fixture with real npm tarballs and
  request logs, including corrupt bytes and an upstream-host lock URL;
- removes executable `tsx` shebangs from the two new scripts so they run only
  through the locked local `node_modules/.bin/tsx` boundary.

## Product touch inventory

Modified:

- `.npmrc`
- `docs/how/build.md`
- `docs/how/update-pi.md`
- `harness/scripts/packages.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-probe.ts`
- `harness/scripts/vetters/lockfile-lint.ts`
- `harness/scripts/vetters/npm-audit.ts`
- `install-windows.ps1`
- `justfile`

Added:

- `harness/scripts/npm-resolution-run.ts`
- `harness/scripts/npm-resolution-diagnostic.ts`
- `harness/scripts/npm-resolution-policy.integration.test.ts`
- `harness/scripts/packages-bootstrap.test.ts`
- `docs/plans/052-update-pi-reliability/reports/implementation-checkpoint.md`
- `docs/plans/052-update-pi-reliability/reviews/execution.log.md`

Reconciled evidence:

- `docs/plans/052-update-pi-reliability/reports/design-contract.md`

The existing untracked s052 research/design/task files predated implementation.
The untracked `node_modules` entry remains the authorized operational symlink.

## Non-vacuity and mutation proof

| Mutation or weakened behavior | Proof that turns red or changes outcome |
|---|---|
| Remove online revalidation | The stale-cache control removes `prefer-online`, makes zero packument requests, follows cached `2.0.0`, and fails on its removed tarball. Governed resolution revalidates, requests current proxy truth, installs `1.0.0`, and succeeds. |
| Change authority away from proxy | A test-only upstream registry mutation succeeds and records an upstream request. The governed exact request then fails at proxy with upstream request count exactly zero. |
| Lower age | Age seven rejects the explicitly young `3.0.0`; a test-only age-zero mutation installs that same tarball. |
| Retain caller override or `before` | Unit coverage supplies mixed-case registry/lock-host/online/age/`before` values and requires all to be absent before the governed lowercase values are written. |
| Preserve an upstream lock host | The fixture rewrites the exact lock tarball URL to the upstream server and supplies caller `NPM_CONFIG_REPLACE_REGISTRY_HOST=never`; root replay succeeds through the proxy, records a proxy tarball request, records zero upstream requests, and leaves the lock unchanged. Removing governed `always` exposes the upstream request. |
| Add fallback | The fixture upstream exposes proxy-absent `9.0.0`; the governed install fails and the upstream log remains empty. |
| Accept missing/corrupt proxy artifact | Separate missing and corrupt `2.0.0` operations both exit non-zero, record the attempted proxy tarball request, and record zero upstream requests. The fixture disables npm fetch retries only to avoid retry backoff hiding the corrupt verdict. |
| Heal missing exact lock target | Root replay with `--min-release-age=null` exits non-zero after proxy removal and leaves the lock hash unchanged. |
| Remove Windows restoration | Real PowerShell forces an error inside the wrapper and asserts byte-exact restoration of registry, lock-host replacement, online, age, and `before`; it separately proves root-lock age/`before` clearing and restoration. |
| Mask Unix bootstrap execution failure | A copied temporary CLI with a fake `pi` makes the middle of three installs fail. All three sources are attempted, the summary has no success prefix, only temporary settings change, and the copied CLI exits 1. |
| Turn a vet finding into an install blocker | A separate stale GitHub fixture produces a fail vet verdict after a successful install; bootstrap prints the review finding and exits 0. |
| Allow local `pij` to resolve npm | Both the wrapper and `just pij --help` succeed with `npm_config_offline=true`; the source contract forbids an operational bare local-tool `npx` line. |
| Lose runner exit status | A recorder child exits 7 and the wrapper test requires status 7; spawn failure requires status 1. |
| Accept stale global `pij` link | A temporary valid wrapper symlink passes; changing it to the legacy `.pi/extensions/pij/cli.ts` target fails with repair guidance. |

## Cold-review fix validation

```text
Focused policy/integration/bootstrap/vetters:
  Test Files  12 passed | 1 skipped
  Tests       68 passed | 2 skipped
  real        3.57s

Real PowerShell restoration:
  five consecutive passes
  named tests 580ms, 394ms, 374ms, 316ms, 284ms
  real        1.04s, 0.86s, 0.78s, 0.73s, 0.70s

Isolated release-age probe:
  ten checks true, four local-registry requests, temp root removed
  real        1.64s

Typecheck:
  exit 0, final real 2.06s

Lint:
  exit 0, real 0.49s
  334 files; ten pre-existing warnings and one schema notice

Offline wrapper / just pij:
  both exit 0, real 0.41s each

Full unit suite:
  Test Files  138 passed | 4 skipped
  Tests       2023 passed | 11 skipped
  real        38.65s
```

## Residual risks and explicit deferrals

- The live proxy diagnostic was not run because the implementation packet
  forbids live proxy access without separate authorization. Its invalid-input
  path was exercised locally; proxy behavior is covered by the hermetic
  registries.
- `harness checks` and `just self-check` were deliberately not run in this
  worktree. The corrected packet assigns canonical full-gate proof to the
  orchestrator's disposable isolated validation copy so protected
  `.pi/packages.yaml` is never mutated here.
- The stale global `pij` bin is now detected, but protected
  `.pi/extensions/pij/**` daemon/shebang paths and `skills/flow-pair/**` still
  contain their separate runtime-packaging `npx` boundary.
- `just lint` reports ten pre-existing warnings in protected focus/model,
  Telegram, and flow-pair files introduced on the reconciled base; it exits
  zero and reports no changed-file error.
- `pi-doctor` was not run against real global state. Its new bin-shape check is
  covered with temporary valid and stale symlinks.

## Recommendation

Ready for the orchestrator-owned disposable `harness checks` proof and cold
rereview. No implementation commit or push was made.
