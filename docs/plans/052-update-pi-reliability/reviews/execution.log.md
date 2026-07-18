# s052 implementation execution log

All commands ran in
`/Users/jordanknight/pi-hacking/pij-worktrees/s052-update-pi-reliability`.
No command contacted a live npm registry during implementation.

## Identity and containment

```text
HEAD        591f188f394ab17d8c34a800fd55f87c752d4005
origin/main 591f188f394ab17d8c34a800fd55f87c752d4005
merge-base  591f188f394ab17d8c34a800fd55f87c752d4005
branch      s052/update-pi-reliability
```

Protected files remained unchanged throughout. No stage, commit, or push ran.

## Iteration evidence

1. Initial focused run:

   ```bash
   just test harness/scripts/release-age-policy.test.ts \
     harness/scripts/npm-resolution-policy.integration.test.ts \
     harness/scripts/vetters/npm-audit.test.ts
   ```

   Result: 9 passed, 3 failed. The failures exposed three useful fixture
   defects rather than product fallback:

   - the npm tarball builder shared the client cache, making the stale-cache
     control incorrectly succeed without requests;
   - the just recipe used Make-style `$$`, producing PID-prefixed paths;
   - the PowerShell nullable root-lock parameter did not execute its action.

   Corrections: separate pack cache, normal just `$` shell syntax, and an
   explicit `-ClearReleaseAge` switch.

2. Hermetic integration rerun:

   ```bash
   just test harness/scripts/npm-resolution-policy.integration.test.ts
   ```

   Result: 1 passed in 2.79 s.

3. Initial isolated probe:

   ```bash
   just release-age-probe
   ```

   Result: failed because locale-formatted npm cutoff text was parsed as a
   timestamp and the fake audit bulk endpoint returned the quick-audit shape.
   The probe was corrected to assert native age-refusal text without
   locale-dependent timestamp parsing and return `{}` from the bulk advisory
   endpoint.

4. Corrected isolated probe:

   ```bash
   just release-age-probe
   ```

   Result: exit 0. All nine checks passed:

   - audit JSON observed;
   - exact lock absence failed closed;
   - fixture lock unchanged;
   - young fresh resolution refused;
   - npm min-release-age support observed;
   - seven-day derived `before` observed;
   - proxy-only command evidence;
   - repository manifests unchanged;
   - sole root-lock override preserved.

   The probe recorded four local-registry requests and removed its temporary
   root.

5. Initial static run:

   ```bash
   just typecheck
   just lint
   ```

   Typecheck passed in 1.87 s. Lint identified only formatter changes in five
   new/changed npm-reliability files plus pre-existing warnings. Those five
   files were formatted with the repository's locked Biome binary.

## Required final sequence

### 1. Focused policy, integration, and vetter tests

```bash
/usr/bin/time -p just test \
  harness/scripts/release-age-policy.test.ts \
  harness/scripts/npm-resolution-policy.integration.test.ts \
  harness/scripts/vetters/npm-audit.test.ts
```

Result:

```text
Test Files  3 passed (3)
Tests       12 passed (12)
Duration    2.99s
real        3.40s
```

### 2. Real PowerShell restoration, repeated five times

```bash
for i in 1 2 3 4 5; do
  just test harness/scripts/release-age-policy.test.ts \
    -t "restores the Windows caller environment"
done
```

Result: five passes. Named-test durations were 359 ms, 301 ms, 272 ms,
332 ms, and 339 ms. Total real time was 3.74 s. Each run executed real `pwsh`
with `-NoLogo -NoProfile -NonInteractive`, a 30 s child bound, and a derived
35 s named-test bound.

### 3. Typecheck and lint

```bash
just typecheck
just lint
```

Result:

```text
typecheck exit 0, real 1.77s
lint      exit 0, real 0.48s
```

Lint checked 333 files. It reported ten pre-existing warnings and one schema
info notice, all outside the s052 changed product files.

### 4. Offline local-runtime proof

```bash
npm_config_offline=true node harness/scripts/pij-cli.cjs --help
npm_config_offline=true just pij --help
```

Result: both exit 0 and print `pij` help. Real times were 0.85 s and 0.60 s.
Neither path attempted npm resolution.

### 5. Full unit suite

```bash
/usr/bin/time -p just test
```

Result:

```text
Test Files  137 passed | 4 skipped (141)
Tests       2021 passed | 11 skipped (2032)
Duration    41.64s
real        42.12s
```

The skips are the suite's existing gated/conditional tests.

## Additional local-only checks

Invalid manual diagnostic input:

```bash
node_modules/.bin/tsx harness/scripts/npm-resolution-diagnostic.ts invalid-target
```

Result: exit 5 with `DIAGNOSTIC_ERROR`, the governed proxy/online/age fields,
and no registry request.

Final hygiene:

```bash
git diff --check
git diff --cached --name-only
test -z "$(git status --short -- \
  package.json package-lock.json \
  .pi/settings.json .pi/packages.yaml \
  .pi/extensions/pij skills/flow-pair .github/workflows)"
```

Result: clean diff, empty index, protected paths clean.

## Intentionally not run

```text
harness checks
just self-check
live proxy diagnostic
just update-pi
just pi-doctor against real global state
```

The corrected implementation packet forbids the first two in this worktree,
forbids live proxy/global mutation, and assigns full-gate proof to an
orchestrator-owned disposable validation copy.

## Cold-review fix cycle (Seq 330)

The fix packet authorized only F1 lock-host authority, F2 bootstrap execution
status, F3 corrupt artifact coverage, and the two new scripts' shebang hygiene.
The worktree/base identity was re-proved before editing. A separate attachment
hold established that literal `TMUX_PANE=%1398`, tmux pane PID `18327`, registry
PID `18327`, and Copilot session
`5b4b820b-880e-49f3-8c0f-e97272fd6a97` uniquely identify this coder seat.

### Corrections

1. Added governed `replace-registry-host=always` to `.npmrc`, the typed
   TypeScript policy, Unix root bootstrap, Windows wrappers, the diagnostic,
   docs, and executable tests. Caller case variants are stripped in fresh and
   root-lock modes.
2. Extended the lock fixture with an upstream-host `resolved` URL and caller
   `NPM_CONFIG_REPLACE_REGISTRY_HOST=never`. Governed replay requests the proxy,
   never requests the fixture upstream, preserves the lock, and retains only
   `--min-release-age=null`.
3. Changed Unix bootstrap to attempt every entry, preserve stale warn/fail vet
   reporting, print a failure-prefixed install summary, and set non-zero exit
   status after all attempts when prerequisite or package execution fails.
4. Added `packages-bootstrap.test.ts`, which runs a copied CLI under a temporary
   root with a dependency symlink and fake `pi`/`gh` executables. One scenario
   proves all installs are attempted and only temporary settings change; a
   second proves a fail vet verdict remains report-only.
5. Added a distinct corrupt-tarball operation requiring non-zero npm status, a
   proxy tarball request, and zero upstream requests.
6. Removed `#!/usr/bin/env tsx` from the two new scripts; callers use the locked
   local `tsx` executable explicitly.

### Focused iteration

Initial focused command:

```bash
node_modules/.bin/biome check --write \
  harness/scripts/release-age-policy.ts \
  harness/scripts/release-age-policy.test.ts \
  harness/scripts/npm-resolution-run.ts \
  harness/scripts/npm-resolution-diagnostic.ts \
  harness/scripts/npm-resolution-policy.integration.test.ts \
  harness/scripts/packages-bootstrap.test.ts \
  harness/scripts/packages.ts \
  harness/scripts/release-age-probe.ts

just test \
  harness/scripts/release-age-policy.test.ts \
  harness/scripts/npm-resolution-policy.integration.test.ts \
  harness/scripts/packages-bootstrap.test.ts \
  harness/scripts/vetters/npm-audit.test.ts
```

The policy, bootstrap, and npm-audit tests passed (13 tests); the integration
test timed out at 120 s in the new corrupt operation. Live process inspection
showed the waiting child was `npm install` in the fixture's `project/corrupt`.
The fixture now sets test-only `npm_config_fetch_retries=0`, eliminating npm's
retry backoff without changing the required corrupt failure.

Integration rerun:

```bash
just test harness/scripts/npm-resolution-policy.integration.test.ts
```

Result: 1 passed, 3.21 s named duration, 3.35 s total duration.

### Required final sequence

#### 1. Focused policy, integration, bootstrap, and vetter tests

```bash
/usr/bin/time -p just test \
  harness/scripts/release-age-policy.test.ts \
  harness/scripts/npm-resolution-policy.integration.test.ts \
  harness/scripts/packages-bootstrap.test.ts \
  harness/scripts/vetters
```

```text
Test Files  12 passed | 1 skipped (13)
Tests       68 passed | 2 skipped (70)
Duration    3.21s
real        3.57s
```

The two skips are the existing opt-in live agent-vetter tests.

#### 2. Real PowerShell restoration, five consecutive runs

```bash
for i in 1 2 3 4 5; do
  just test harness/scripts/release-age-policy.test.ts \
    -t "restores the Windows caller environment"
done
```

All five runs passed. Named-test durations were 580 ms, 394 ms, 374 ms,
316 ms, and 284 ms; real times were 1.04 s, 0.86 s, 0.78 s, 0.73 s, and
0.70 s. Every run used real `pwsh`, `-NoLogo`, the 30 s child timeout, and the
derived 35 s named-test timeout while proving all five variables restore after
the forced error.

#### 3. Isolated release-age probe

```bash
/usr/bin/time -p just release-age-probe
```

Exit 0, real 1.64 s. Ten checks passed, including governed
`replace-registry-host=always`; four local-registry requests were recorded and
the temporary root was removed.

#### 4. Typecheck and lint

```bash
just typecheck
just lint
```

Typecheck exited 0 in the required sequence in 2.28 s and in the final
post-assertion revalidation in 2.06 s. Lint exited 0 in 0.49 s after checking 334 files;
the ten warnings and one schema notice are pre-existing and outside changed
s052 product files.

#### 5. Offline local runtime

```bash
npm_config_offline=true node harness/scripts/pij-cli.cjs --help
npm_config_offline=true just pij --help
```

Both exited 0 in 0.41 s each and produced non-empty help without npm
resolution.

#### 6. Full unit suite

```bash
/usr/bin/time -p just test
```

```text
Test Files  138 passed | 4 skipped (142)
Tests       2023 passed | 11 skipped (2034)
Duration    38.29s
real        38.65s
```

### Final containment

```bash
git diff --check
git diff --cached --name-only
git status --short -- \
  package.json package-lock.json \
  .pi/settings.json .pi/packages.yaml \
  .pi/extensions/pij skills/flow-pair .github/workflows
git rev-parse HEAD
git rev-parse origin/main
git merge-base HEAD origin/main
```

Result: diff check clean, index empty, protected status empty, and all three
SHAs remain `591f188f394ab17d8c34a800fd55f87c752d4005`.

No live proxy/npmjs request, global install/config/cache mutation, real `~/.pi`
mutation, protected edit, stage, commit, push, `harness checks`, or
`just self-check` occurred.
