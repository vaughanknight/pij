# s052 coder findings — reconciled npm resolution reliability

**Initial research:** 2026-07-14T20:43Z–20:52Z UTC
**Reconciliation:** 2026-07-15 after human rulings Seq 281/282/284/286/288/300
**Containment:** research and docs only. No product, manifest, lock, package settings,
installed Pi, real npm cache, global config, stage, commit, push, fetch, or rebase mutation.

## Reconciled conclusion

The behavior is now fully ruled:

1. `https://packagefeedproxy.microsoft.io/npm/` is the sole authority for every npm
   read, resolution, download, install, and check. Authenticated publish writes are the
   only npmjs exception.
2. `prefer-online=true` is mandatory so fresh client cache entries are revalidated
   against that proxy. It addresses stale client metadata but cannot repair proxy truth.
3. Client `min-release-age=7` remains independently mandatory. Only frozen root
   `npm ci` lock replay may pass `--min-release-age=null`.
4. Proxy metadata/tarball inconsistency and unavailable exact locked artifacts fail
   closed. Pij adds no public-registry comparison, fallback, lock rewrite, or custom
   retry loop.
5. Upstream divergence is modeled only by hermetic local fixtures. Live diagnostics
   report proxy truth only.

There is no remaining Jordan-owned behavior decision for s052. The later human rulings
close the retry/fallback question left open by the initial research.

## Root cause layers

The incident was not one cache bug:

- **Client cache:** npm `prefer-online=true` forces cached-data staleness checks and
  immediate registry revalidation, including when the local packument is fresh.
- **Proxy truth:** online revalidation still accepts the configured proxy as truth. It
  does not force that proxy to refresh, cross-check another registry, or make metadata
  and tarballs consistent.
- **Frozen replay:** `npm ci` installs exact lock targets. If an exact target is absent
  or unusable at the proxy, replay fails even though age is cleared.

The banked retry with `prefer-online=true` rules out stale client metadata as the sole
cause. Confidence remains high for npm/client semantics and medium for the historical
server sequence because the failing run did not preserve an HTTP trace.

## Historical pre-ruling registry evidence

The 2026-07-14 isolated comparison with the public registry happened before the binding
proxy-only/no-npmjs ruling. It is retained only as dated historical evidence and must
not be repeated, automated, or used by production diagnostics.

At that time, the Microsoft proxy exposed older, internally consistent metadata and
reachable tarballs for the incident package families, while the public registry exposed
newer versions. Every omitted incident version was younger than the seven-day cutoff.
That was consistent with holdback or feed lag, but did not prove server-side age
enforcement. The client age policy therefore remains necessary.

The comparison does not authorize a fallback. Future live work uses the Microsoft proxy
only.

## Policy spelling and semantics

Committed config:

```ini
registry=https://packagefeedproxy.microsoft.io/npm/
prefer-online=true
min-release-age=7
audit=true
```

Governed child environment:

```text
npm_config_registry=https://packagefeedproxy.microsoft.io/npm/
npm_config_prefer_online=true
npm_config_min_release_age=7
```

Before writing those lowercase keys, the shared helper must remove caller variants of
`npm_config_registry`, `npm_config_prefer_online`, `npm_config_min_release_age`, and
`npm_config_before` case-insensitively. It must not mutate the caller object.

npm 11 normalizes age seven to a null raw `min-release-age` plus a derived `before`
timestamp approximately seven days earlier. Tests must distinguish:

- the pre-npm child environment, where `npm_config_min_release_age=7` is present and
  `npm_config_before` is absent; and
- effective npm config, where `before` is derived.

`npm view` exposes registry metadata even when a version is too young for installation.
It is diagnostic metadata, not install-eligibility proof.

## Resolution seam matrix

| Surface | Required behavior |
|---|---|
| Root project npm/npx | `.npmrc` supplies proxy + online + age + audit. |
| Root frozen lock replay | Same proxy + online policy; only `--min-release-age=null` clears age. Exact absence fails. |
| Official global Pi npm install | Shared explicit environment; global npm mode must not rely on project `.npmrc`. |
| `pkg add` / `pkg bootstrap` Pi installs | Shared explicit environment inherited by Pi's nested npm. Report-and-continue vetting is unchanged. |
| Manifest prerequisite shell | Shared explicit environment so any npm invoked by the trusted shell command remains governed. |
| `pi update --extensions` | Shared explicit environment; bare `pi update` remains outside pij's canonical flow. |
| Windows Pi, prerequisite npm, package install, extension update | Native wrapper sets and restores registry, online, age, and `before` on success and failure. |
| Package `npm audit` and remote `npx lockfile-lint` | Explicit shared environment; package cwd must not determine registry authority. |
| Root CI `npm ci`, `npm audit`, and intentional remote `npx` | Committed `.npmrc`; CI lock replay keeps only the age exception. |
| Proxy diagnostic `npm view` / download | Empty temporary HOME/cache/config, explicit shared environment, proxy only. |
| Locally pinned `pij`/tsx tooling | Direct local wrapper/bin; missing runtime fails closed instead of opportunistic `npx` installation. |

## `pij orchestration` / `tsx` runtime trace

The observed machine has two contradictory facts:

```text
global package root -> /Users/jordanknight/pi-hacking/pij
global package.json bin.pij -> harness/scripts/pij-cli.cjs
actual ~/.npm-global/bin/pij -> ../lib/node_modules/pij/.pi/extensions/pij/cli.ts
```

The current wrapper resolves `tsx/cli` from the linked package and spawns it with Node.
The current package and lock declare `tsx@4.23.0`. The actual global bin symlink is stale
output from an older `npm link`, so bare `pij` still enters an `npx tsx` shebang.

This establishes:

- **Observed root cause:** stale generated global bin linkage, not the current
  `package.json#bin.pij` declaration.
- **In-fence correction:** keep `npm link` in `just install` and `just update-pi`; make
  `pi-doctor` fail when the resolved global `pij` bin is not the declared
  `harness/scripts/pij-cli.cjs`; route `just pij` through that wrapper rather than
  `npx tsx`.
- **Separate blocked boundary:** current `.pi/extensions/pij/cli.ts` still starts the
  daemon with `npx tsx`; the CLI and daemon TypeScript shebangs and the
  `flow-pair` bin also use `npx`. Eliminating those paths requires
  `package.json`/bin packaging, `.pi/extensions/pij/**`, or `skills/flow-pair/**`.
  It is not part of s052 and must receive a separate authorized packet.

The s052 doctor correction materially detects and repairs the observed stale-link seam,
but s052 must not claim that every pij runtime `npx` path is eliminated.

## PowerShell load flake

The existing test already runs real `pwsh` with `-NoProfile` and `-NonInteractive`,
parses the real installer function, invokes it, forces failure, and verifies restoration.
A reconciliation run completed the policy test in 448 ms, with the PowerShell assertion
at 318 ms; five isolated PowerShell starts ranged from 167.4 ms to 397.9 ms.

Cross-stream full-gate evidence nevertheless shows occasional exhaustion of the 15 s
child bound. More fixture isolation would remove the real startup/load behavior the test
is meant to retain. The narrow correction is:

- add `-NoLogo`;
- increase child timeout from 15 s to 30 s;
- keep the named-test timeout finite at 35 s;
- retain the invariant `child timeout < named-test timeout`;
- change no suite-wide timeout.

The policy assertions and deliberate failure path remain unchanged and expand to all
four governed variables.

## APPEND_SYSTEM sync request

A standalone APPEND_SYSTEM sync is useful but not required by npm resolution. Extracting
it during s052 would mix an operator convenience change into the reliability boundary.

Disposition: separate follow-up. S052 leaves the current `just install`,
`just update-pi`, and Windows stage-3 copies intact. A later packet may add a lightweight
`just sync-append-system` that creates the agent directory and copies only
`.pi/APPEND_SYSTEM.md`, without Pi update, package bootstrap, npm resolution, or model
sync.

## Hermetic fixture requirements

The deterministic suite uses mutable local proxy and upstream fixtures plus temporary
HOME, cache, user config, global config, project, tarballs, and request logs.

It must prove:

1. fresh cached stale metadata fails without online revalidation;
2. governed resolution revalidates and follows changed proxy truth;
3. advertised eligible version plus missing/invalid tarball fails closed;
4. exact frozen lock target absence still fails with age cleared;
5. a young version is rejected at age seven;
6. a test-only age-zero mutation accepts the same young version;
7. a fixture-only upstream can expose a missing version, but receives zero governed
   requests and is never used as fallback.

Non-vacuity mutations must make the suite red: remove online, change authority, lower
age, preserve caller `before`/uppercase overrides, allow upstream fallback, accept a
missing tarball, or remove Windows restoration.

## Exact implementation boundary

In-fence files:

- `.npmrc`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/release-age-probe.ts`
- `harness/scripts/npm-resolution-run.ts` (new shared command wrapper)
- `harness/scripts/npm-resolution-diagnostic.ts` (new proxy-only diagnostic)
- `harness/scripts/npm-resolution-policy.integration.test.ts` (new hermetic fixture)
- `harness/scripts/packages.ts`
- `harness/scripts/vetters/npm-audit.ts`
- `harness/scripts/vetters/lockfile-lint.ts`
- `justfile`
- `install-windows.ps1`
- `docs/how/update-pi.md`
- `docs/how/build.md`

Separately blocked:

- `package.json`
- `package-lock.json`
- `.pi/extensions/pij/**`
- `skills/flow-pair/**`

Protected and unchanged:

- `.pi/settings.json`
- `.pi/packages.yaml`
- `.github/workflows/**`
- installed Pi, global npm config/cache, and `~/.pi`

The normative behavior and acceptance commands are frozen in
`../reports/design-contract.md`.
