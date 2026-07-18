# s052 design contract — authoritative npm resolution

**Status:** binding implementation contract after human rulings
Seq 281/282/284/286/288/300.

## 1. Non-negotiable invariants

1. `https://packagefeedproxy.microsoft.io/npm/` is the only live npm authority for
   reads, resolution, downloads, installs, and checks.
2. There is no npmjs read, comparison, diagnostic, or fallback. Authenticated publish
   writes are the sole exception and are outside s052.
3. Every fresh resolver uses `prefer-online=true` and client
   `min-release-age=7`.
4. Only frozen root `npm ci` may pass `--min-release-age=null`; registry,
   lock-host replacement, and online revalidation remain governed on that path.
5. Proxy inconsistency and unavailable exact artifacts fail closed. Pij adds no custom
   retry loop, lock rewrite, alternate registry, cache deletion, or success-shaped
   fallback.
6. Upstream divergence exists only in hermetic fixtures.

## 2. Behavior matrix

| Condition | Required action | Required result/diagnostic |
|---|---|---|
| Fresh client cache contains stale packument | Revalidate against proxy because online is true. | Resolver follows current proxy truth; request log proves revalidation. |
| Proxy truth removes or changes a version | Fresh non-lock resolution may select another semver-eligible, age-eligible proxy version. | No use of cached removed metadata and no alternate authority. |
| Proxy advertises an eligible version but tarball is missing, corrupt, or integrity-invalid | Let the governed npm operation fail; do not retry through another source. | `PROXY_INCONSISTENT`; command exits non-zero. |
| Proxy omits an exact frozen lock target | Replay exact lock with age null only. | `PROXY_ABSENT`; `npm ci` exits non-zero; lock is unchanged. |
| Proxy exposes a version younger than seven days | Keep age seven. | Fresh install refuses it; metadata visibility through `npm view` does not count as eligibility. |
| Hermetic upstream exposes a version absent at hermetic proxy | Keep the test client configured only to hermetic proxy. | Governed operation fails closed and upstream request count remains zero. |
| Proxy metadata and tarball are both usable | Proceed under normal npm semantics. | `PROXY_OK`; this does not prove a prior failure was cache-related. |

No live code or diagnostic emits an `UPSTREAM_DIVERGENT` verdict. That label is valid
only in the two-registry fixture.

## 3. Policy keys and environment contract

### Committed `.npmrc`

The file is byte-exact:

```ini
registry=https://packagefeedproxy.microsoft.io/npm/
replace-registry-host=always
prefer-online=true
min-release-age=7
audit=true
```

### Typed constants

`harness/scripts/release-age-policy.ts` remains the single policy module and exports:

```text
NPM_REGISTRY_URL = https://packagefeedproxy.microsoft.io/npm/
NPM_REPLACE_REGISTRY_HOST = always
NPM_PREFER_ONLINE = true
MIN_RELEASE_AGE_DAYS = 7
ROOT_LOCK_REPLAY_MIN_RELEASE_AGE = "null"
```

The production helper is renamed to `npmResolutionEnvironment(environment?)`.
It:

1. clones the supplied environment;
2. removes keys whose lowercase form is any of:
   - `npm_config_registry`
   - `npm_config_replace_registry_host`
   - `npm_config_prefer_online`
   - `npm_config_min_release_age`
   - `npm_config_before`
3. writes only these lowercase governed keys:
   - `npm_config_registry`
   - `npm_config_replace_registry_host`
   - `npm_config_prefer_online`
   - `npm_config_min_release_age`
4. does not mutate the caller object.

`npm_config_before` is always absent before npm starts so npm derives it from age seven.

`rootLockReplayNpmArgs()` remains exactly:

```text
ci --min-release-age=null
```

It does not return `install`, a registry override, a lock-host override, or an
online override.

### Shared command wrapper

`harness/scripts/npm-resolution-run.ts` is a thin fail-closed subprocess adapter:

- requires a command and argv;
- spawns it with `npmResolutionEnvironment()`;
- inherits stdio;
- returns the exact child status;
- exits non-zero on spawn failure or signal;
- contains no fallback or retry.

Unix `justfile` global npm/Pi resolution commands use this wrapper instead of copying
policy values into shell fragments.

### Windows restoration

`Invoke-WithNpmResolutionEnvironment` replaces the age-only wrapper. It saves, sets,
and restores process values for:

```text
npm_config_registry
npm_config_replace_registry_host
npm_config_prefer_online
npm_config_min_release_age
npm_config_before
```

Inside the action, the first four equal the governed values and `before` is cleared.
The `finally` block restores all five byte-for-byte after success or failure. Windows
environment names are case-insensitive; the TypeScript helper separately proves
mixed-case stripping on Unix.

## 4. Command and seam coverage

| Command/seam | Authority mechanism | Age exception |
|---|---|---|
| `just install` root `npm ci` | Root `.npmrc` | `--min-release-age=null` only |
| Linux and Windows CI root `npm ci` | Root `.npmrc` | Existing `--min-release-age=null` only |
| `just pi-official-install` global npm | `npm-resolution-run.ts` | None |
| Windows official global Pi npm | PowerShell wrapper | None |
| `installPiPackage` for add/bootstrap | `npmResolutionEnvironment()` | None |
| Unix manifest `requires.install` shell | `npmResolutionEnvironment()` | None |
| Windows `lean-ctx-bin` npm | PowerShell wrapper | None |
| Unix/Windows `pi update --extensions` | Shared Unix/Windows wrapper | None |
| Windows Pi package install | PowerShell wrapper | None |
| Vetter `npm audit` in package cwd | Explicit `npmResolutionEnvironment()` | None |
| Vetter remote `npx --yes lockfile-lint` | Explicit `npmResolutionEnvironment()` | None |
| Root `npm audit` / intentional remote root `npx` | Root `.npmrc` | None |
| Proxy-only `npm view` / `npm pack` diagnostic | Empty temp state + explicit helper | None |
| `npm run` scripts using locked local bins | npm local-bin behavior | No resolution expected |
| Bare `pij` and `just pij` | `harness/scripts/pij-cli.cjs` direct local `tsx/cli` | No npm resolution |

`pi remove`, `pi list`, and already-installed local tool execution are not resolution
operations. They receive no artificial registry work.

## 5. `pij` runtime boundary

S052 makes only these in-fence changes:

1. `just pij` executes `node harness/scripts/pij-cli.cjs`.
2. `just install` and `just update-pi` retain their existing `npm link`.
3. `just pi-doctor` resolves the global `pij` bin and fails unless it resolves to
   `<global npm root>/pij/harness/scripts/pij-cli.cjs`. The failure tells the operator
   to run `npm link` from the local main checkout or the canonical update recipe.

S052 does not edit:

- `.pi/extensions/pij/cli.ts` daemon auto-start (`npx tsx`);
- `.pi/extensions/pij/cli.ts` or `daemon.ts` shebangs;
- `skills/flow-pair/lib/cli.ts` or its package bin;
- `package.json` or `package-lock.json`.

Those are a separate runtime-packaging boundary. The s052 completion report must state
that the stale global `pij` bin is covered while remaining extension/flow-pair `npx`
paths are not.

## 6. Hermetic fake-registry fixture

`npm-resolution-policy.integration.test.ts` creates one temporary root containing:

```text
home/
cache/
user.npmrc
global.npmrc
project/
proxy-state.json
proxy-requests.ndjson
upstream-state.json
upstream-requests.ndjson
tarballs/
```

Both local registries bind to `127.0.0.1` random ports. Tarballs are real minimal npm
packages with valid shasum/integrity. Package publication times are explicit fixture
data, never wall-clock accidents.

Every child receives explicit temporary:

```text
HOME
npm_config_cache
npm_config_userconfig
npm_config_globalconfig
```

The fixture sequence is:

1. Proxy advertises old-enough `2.0.0` with long cache freshness; `npm view` primes
   only metadata.
2. Proxy changes to old-enough `1.0.0`; `2.0.0` tarball becomes unavailable.
3. Control without online revalidation uses cached `2.0.0`, makes no packument request,
   and fails.
4. Governed resolution revalidates, sees `1.0.0`, downloads it, and succeeds.
5. Proxy advertises eligible `2.0.0` while its tarball is missing or integrity-invalid;
   governed resolution fails.
6. A lock whose tarball URL names the fixture upstream is replayed with a caller
   `replace-registry-host=never`; governed replacement downloads from the proxy and
   makes zero upstream requests.
7. The same exact lock is replayed after proxy removal; root age null does not heal it.
8. Proxy advertises a young version; age seven rejects it, while an explicit
   test-only age-zero mutation accepts it.
9. Hermetic upstream advertises a version absent at proxy; a governed operation still
   fails and upstream request count is exactly zero.

### Non-vacuity

Each mutation must make at least one focused test fail:

- remove online revalidation;
- configure upstream/default instead of proxy;
- lower or omit age;
- retain caller `before`;
- retain mixed-case caller registry/online/age overrides;
- retain a caller `replace-registry-host=never`;
- add upstream fallback;
- treat missing/corrupt tarball as success;
- make exact lock replay resolve a replacement;
- remove Windows `finally` restoration.

Source-string assertions may supplement but never replace subprocess/request-log proof.

## 7. Live diagnostic contract

`npm-resolution-diagnostic.ts <exact-package-version>` is manual, read-only, and
proxy-only. It:

1. requires an exact package version;
2. creates empty temporary HOME/cache/user/global config;
3. uses `npm view` under `npmResolutionEnvironment()` to inspect proxy metadata and
   publication time;
4. uses `npm pack --ignore-scripts` under the same environment to prove eligible
   tarball download and integrity;
5. removes its temporary root in `finally`;
6. never reads another registry and never deletes the user's cache.

Verdicts:

| Verdict | Exit | Meaning |
|---|---:|---|
| `PROXY_OK` | 0 | Exact version is present, age-eligible, downloadable, and integrity-valid. |
| `PROXY_ABSENT` | 2 | Exact version is absent from proxy metadata. |
| `PROXY_INCONSISTENT` | 3 | Eligible metadata advertises the version but download/integrity fails. |
| `POLICY_TOO_YOUNG` | 4 | Proxy contains the version but client age seven excludes it. |
| `DIAGNOSTIC_ERROR` | 5 | Proxy/config/process failure prevents a conclusion. |

The tool prints governed registry, lock-host replacement, online, age, exact target,
verdict, and the failing proxy URL when available. It never prints or queries an
upstream comparison.

`PROXY_OK` after a normal-path failure makes client cache/config a candidate; it does
not claim proof. Upstream divergence is diagnosed only by the hermetic fixture.

## 8. PowerShell flake treatment

The real PowerShell restoration test remains. Change only:

```text
arguments: add -NoLogo
child timeout: 30_000 ms
named test timeout: 35_000 ms
```

The child bound remains below the named-test bound. Do not change global Vitest
timeouts. Expand the evidence object and assertions to registry, lock-host replacement,
online, age, and `before`, including deliberate failure propagation and
byte-exact restoration.

## 9. APPEND_SYSTEM disposition

No APPEND_SYSTEM-only recipe is added in s052. The existing composite copies stay
unchanged.

A separate follow-up may add `just sync-append-system` with exactly two effects:

1. create `~/.pi/agent` if absent;
2. copy `.pi/APPEND_SYSTEM.md` to `~/.pi/agent/APPEND_SYSTEM.md`.

It must not install/update Pi, resolve npm, bootstrap packages, sync models/MCP, or link
extensions.

## 10. Exact file boundary

### Allowed implementation touch set

```text
.npmrc
harness/scripts/release-age-policy.ts
harness/scripts/release-age-policy.test.ts
harness/scripts/release-age-probe.ts
harness/scripts/npm-resolution-run.ts
harness/scripts/npm-resolution-diagnostic.ts
harness/scripts/npm-resolution-policy.integration.test.ts
harness/scripts/packages-bootstrap.test.ts
harness/scripts/packages.ts
harness/scripts/vetters/npm-audit.ts
harness/scripts/vetters/lockfile-lint.ts
justfile
install-windows.ps1
docs/how/update-pi.md
docs/how/build.md
```

### Separate blocked boundary

```text
package.json
package-lock.json
.pi/extensions/pij/**
skills/flow-pair/**
```

### Protected and unchanged

```text
.pi/settings.json
.pi/packages.yaml
.github/workflows/**
```

No installed Pi, global npm configuration/cache, or `~/.pi` mutation is part of
implementation or test acceptance.

## 11. Acceptance

Targeted:

```bash
just test harness/scripts/release-age-policy.test.ts \
  harness/scripts/npm-resolution-policy.integration.test.ts \
  harness/scripts/packages-bootstrap.test.ts
just typecheck
just lint
```

PowerShell repeat proof:

```bash
for i in 1 2 3 4 5; do
  just test harness/scripts/release-age-policy.test.ts \
    -t "restores the Windows caller environment"
done
```

Offline local-runtime proof:

```bash
npm_config_offline=true node harness/scripts/pij-cli.cjs --help
npm_config_offline=true just pij --help
```

Proxy-only live proof, when explicitly authorized:

```bash
just release-age-probe
node_modules/.bin/tsx harness/scripts/npm-resolution-diagnostic.ts <exact-package-version>
```

The live proof must show the configured registry is the Microsoft proxy. It must contain
no public-registry comparison.

Protected-path check:

```bash
test -z "$(git status --short -- \
  package.json package-lock.json \
  .pi/settings.json .pi/packages.yaml \
  .pi/extensions/pij skills/flow-pair .github/workflows)"
```

Full completion gate runs **only in a disposable isolated validation clone/check-out**, never in the implementation worktree. The validator starts at reconciled base `591f188f394ab17d8c34a800fd55f87c752d4005`, applies/copies the exact implementation diff and new product files, attaches already-installed dependencies without npm resolution, runs:

```bash
harness checks
```

It captures the applied inventory and results, then destroys the disposable copy. Any gate-generated `.pi/packages.yaml` drift remains confined there; the implementation worktree's protected files are never mutated and restored.

Acceptance additionally requires:

- fake-registry request logs prove all governed fixture requests hit only the proxy;
- upstream fixture request count is zero;
- exact lock and proxy inconsistency cases exit non-zero;
- report-and-continue package-vetter behavior is unchanged;
- `pi-doctor` rejects the stale global `pij` bin shape;
- docs contain no npmjs fallback or live comparison command.
