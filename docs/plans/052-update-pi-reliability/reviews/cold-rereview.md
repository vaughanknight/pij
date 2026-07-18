# s052 cold rereview - authoritative npm resolution

**Verdict:** `APPROVE_WITH_NOTES`

**Reviewed base:** `591f188f394ab17d8c34a800fd55f87c752d4005`

## Findings

No implementation findings.

## Correction adjudication

### F1 - lock-host authority: pass

The committed policy now fixes `replace-registry-host=always`
(`.npmrc:1-5`). Both TypeScript environments remove caller variants
case-insensitively and write only the governed lowercase value; root replay
retains registry, lock-host replacement, and online policy while clearing age
and `before` (`harness/scripts/release-age-policy.ts:7-45`). The
pre-dependency Unix path independently strips the same five keys before setting
the proxy, replacement, and online values
(`justfile:124-134`). Windows saves, sets, and restores the fifth variable in
the same wrapper (`install-windows.ps1:86-138`).

The lock-host test is non-vacuous. It creates a lock, rewrites its resolved
tarball to the fixture upstream, supplies caller
`NPM_CONFIG_REPLACE_REGISTRY_HOST=never`, then runs root replay and requires a
proxy tarball request, zero upstream requests, success, and an unchanged lock
(`harness/scripts/npm-resolution-policy.integration.test.ts:495-525`). After
the proxy removes the exact artifact, the same age-null replay fails without
using upstream or changing the lock
(`harness/scripts/npm-resolution-policy.integration.test.ts:527-540`). This
directly covers the unchanged root lock's npmjs-resolved URLs, exemplified at
`package-lock.json:48-51`; the current lock contains 563 such URLs.

Independent helper execution with mixed-case caller overrides produced:

```text
fresh: registry=proxy, replace-registry-host=always, prefer-online=true, age=7
root:  registry=proxy, replace-registry-host=always, prefer-online=true
args:  ci --min-release-age=null
```

The caller object remained unchanged and no caller policy key survived in either
child environment.

### F2 - bootstrap operational status versus vet reporting: pass

Unix bootstrap attempts every enabled entry, records prerequisite or `pi
install` failures, avoids the success-prefixed summary when any installation
fails, completes stale vet reporting, and finally sets nonzero status
(`harness/scripts/packages.ts:288-351`). `just update-pi` invokes bootstrap
before extension update and doctor without a success-masking operator, so the
recipe stops naturally on that nonzero status (`justfile:365-390`).

The copied-CLI test uses a temporary root, copied scripts, dependency symlink,
temporary manifest/settings, and fake executables. Its middle install fails,
all three sources must still be attempted, the real worktree settings must
remain byte-identical, and the copied CLI must exit 1
(`harness/scripts/packages-bootstrap.test.ts:19-44,101-138`). Its second case
requires a stale `fail` vet verdict after a successful install to remain
report-only with exit 0 (`harness/scripts/packages-bootstrap.test.ts:140-168`).
Strict `pkg vet` still exits 2 for a non-ok verdict while `pkg audit` remains
unconditionally report-only (`harness/scripts/packages.ts:427-442,532-555`).

### F3 - corrupt artifact: pass

The fixture actually serves bytes different from the advertised integrity when
state is `corrupt`
(`harness/scripts/npm-resolution-policy.integration.test.ts:224-240`). The
separate corrupt operation resets cache and request logs, requires nonzero npm
status, requires a proxy tarball request, and requires zero upstream requests
(`harness/scripts/npm-resolution-policy.integration.test.ts:474-488`).
Retry suppression exists only in the test fixture environment
(`harness/scripts/npm-resolution-policy.integration.test.ts:107-123`); no
production policy or runner contains it.

### Runtime and Windows hygiene: pass

The two new operational scripts have no executable `tsx`/`npx tsx` shebang
(`harness/scripts/npm-resolution-run.ts:1-28`;
`harness/scripts/npm-resolution-diagnostic.ts:1-12`). `just pij` uses the
checked-in local wrapper (`justfile:106-109`), and the blocked runtime-packaging
paths are unchanged.

The real PowerShell test uses `-NoLogo -NoProfile -NonInteractive`, a 30-second
child timeout, and a derived 35-second named timeout
(`harness/scripts/release-age-policy.test.ts:25-27,180-203`). It proves
registry, lock-host replacement, online, age, and `before` restoration after a
forced error, plus root mode retaining the first three while clearing only age
and `before` (`harness/scripts/release-age-policy.test.ts:460-488`).

## Dimension 0 - non-vacuity

| Required behavior | Load-bearing proof |
|---|---|
| Caller `never` cannot preserve a lock host | The upstream-host lock replay requires proxy tarball traffic and zero upstream traffic (`npm-resolution-policy.integration.test.ts:495-525`); removing governed `always` exposes the upstream URL and breaks those assertions. |
| Operational install failures are nonzero after all attempts | The copied CLI requires status 1 and the ordered three-entry attempt log (`packages-bootstrap.test.ts:101-138`). |
| Vet findings remain report-only | The stale fail-verdict case requires status 0 and a visible REVIEW summary (`packages-bootstrap.test.ts:140-168`). |
| Corrupt bytes fail closed | The server returns corrupt bytes and the operation must be nonzero with proxy traffic and zero upstream traffic (`npm-resolution-policy.integration.test.ts:224-240,474-488`). |
| Online/cache, age, no-fallback, and exact-lock guards remain load-bearing | The same fixture contrasts stale no-online behavior, governed recovery, age seven versus test-only age zero, an upstream-only mutation, governed no-fallback, and unchanged exact locks (`npm-resolution-policy.integration.test.ts:416-472,527-588`). |
| Windows restoration remains load-bearing | The real process probe requires all five restored values, root-only clearing, and propagated failure (`release-age-policy.test.ts:460-488`). |
| Local runtime cannot opportunistically resolve `tsx` | Source assertions reject new `tsx` shebangs and operational bare `npx`, while offline wrapper execution succeeds (`release-age-policy.test.ts:391-404`). |

The focused policy/integration/bootstrap/vetter run independently passed 68
tests with only the two existing opt-in live-agent tests skipped.

## Disposable validation, inventory, and isolation

The final post-fix disposable result is 8/8 with no skipped sensors
(`reports/disposable-harness-checks.json:1`). The accepted report records a
disposable HOME/npm/Pi/XDG envelope, a short dedicated tmux server, zero npmjs
log hits, no accepted-token real Pi session, unchanged critical real configs
and installed package roots, and protected package-audit drift confined to the
clone (`reports/disposable-validation.md:12-64`).

All 15 product entries match the final inventory hash, size, mode, and kind.
The current tree matches 27/30 inventory entries overall. The three mismatches
are post-gate evidence artifacts, not product:

```text
disposable-harness-checks.json
  inventory b784e722... / current 081b87fc... (same 1123-byte size)
disposable-validation-inventory.json
  inventory 111658a0... / current 4c5d58b4... (4813 -> 6417 bytes)
disposable-validation.md
  inventory 3e7686d2... / current ead7b2cd... (4912 -> 5502 bytes)
```

That evidence-only drift is consistent with copying final raw results and
writing the final report after the source inventory capture. It means the
current evidence tree should not be described as 30/30 byte-identical, but it
does not weaken the exact product inventory or the accepted gate.

The first rejected run remains honestly disclosed
(`reports/disposable-validation.md:66-90`). Its exact real Pi session residue
still exists:

```text
~/.pi/agent/sessions/--private-var-folders-mv-9mcvlzg504b158ctlswmgwph0000gn-T-pij-s052-validation-k_uajea4-repo--
```

No real Pi session path contains the final accepted token
`pij-s052-validation-iehxs4jr`. The rejected residue is uncleaned as required,
outside the implementation worktree, excluded from accepted proof, and does not
contaminate the diff. Concurrently volatile whole npm/Pi trees remain correctly
distinguished from unchanged critical configs, installed package roots, and
installed Pi.

## Independent execution and boundaries

- Focused policy/integration/bootstrap/vetter suite: 12 files passed, one
  opt-in file skipped; 68 tests passed, two skipped.
- Real PowerShell restoration: five consecutive independent passes.
- Isolated release-age probe: ten checks true, including governed lock-host
  replacement; four local-registry requests; temporary root removed.
- Typecheck: exit 0.
- Lint: exit 0 with ten pre-existing warnings and one schema notice outside the
  changed s052 product files.
- Full unit suite: 138 files passed, four skipped; 2023 tests passed, 11 skipped.
- Offline local wrapper and `just pij --help`: both exit 0 with identical
  non-empty help output.
- `git diff --check` clean; index empty; protected status empty.

The diff is confined to the 15 allowed product paths plus s052
research/design/task/review evidence and the authorized operational
`node_modules` symlink. There is no manifest, package lock, settings, package
YAML, CI, government, `.pi/extensions/pij`, `skills/flow-pair`, or unrelated
product change. No live proxy/npmjs request, full worktree gate, global install,
global configuration/cache mutation, product edit beyond this review, stage,
commit, or push was performed by this rereview.
