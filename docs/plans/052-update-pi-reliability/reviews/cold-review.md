# s052 cold review - authoritative npm resolution

**Verdict:** `FIX_REQUIRED`

**Reviewed base:** `591f188f394ab17d8c34a800fd55f87c752d4005`

## Findings

### High - A retained npm lock-host override can bypass the Microsoft proxy

`npmResolutionEnvironment()` and `rootLockReplayEnvironment()` remove only
registry, online, age, and `before` overrides
(`harness/scripts/release-age-policy.ts:6-29,33-40`). The pre-dependency root
recipe removes the same four keys (`justfile:124-132`). Both preserve
`NPM_CONFIG_REPLACE_REGISTRY_HOST`.

That is authority-relevant because the unchanged root lock contains 563
`https://registry.npmjs.org/...` resolved tarball URLs
(`package-lock.json:50` and subsequent entries). The installed npm 11 runtime
maps the default `npmjs` setting to `registry.npmjs.org`, but explicitly skips
rewriting a resolved URL when `replaceRegistryHost === "never"`
(`/Users/jordanknight/.npm-global/lib/node_modules/npm/node_modules/pacote/lib/fetcher.js:85-91`;
`.../pacote/lib/remote.js:8-17`).

Independent policy execution confirmed that an uppercase caller value survives
both helpers:

```text
fresh.NPM_CONFIG_REPLACE_REGISTRY_HOST = never
root.NPM_CONFIG_REPLACE_REGISTRY_HOST  = never
```

An isolated `npm config get replace-registry-host` also returned `never` for
that uppercase environment key. A caller can therefore keep the governed
registry value while causing frozen-lock tarball downloads to use the npmjs
URLs already recorded in the lock. This violates the SFI-only authority and
the non-vacuity requirement that caller authority overrides be rejected
(`reviews/cold-review-request.md:14,30-32`).

Fix by governing `replace-registry-host` at every root and child seam, stripping
case variants, and adding a hermetic lock replay that proves a caller `never`
override cannot reach the fixture upstream. The frozen `.npmrc`/environment
contract will need to be updated consistently.

### High - Unix package bootstrap turns governed install failures into success

`cmdBootstrap()` catches both prerequisite and `pi install` failures, increments
`failed`, prints a success-prefixed summary, and returns normally
(`harness/scripts/packages.ts:287-315`). `main()` then completes with exit 0
(`harness/scripts/packages.ts:561-601`). The canonical updater invokes this
bootstrap and proceeds to extension update and doctor
(`justfile:363-388`).

Consequently, a proxy-inconsistent or unavailable package can make the nested
governed install fail while `just pkg bootstrap` and potentially
`just update-pi` still succeed. That is the success-shaped fallback prohibited
by the fail-closed contract (`reports/design-contract.md:16-18`) and is not
covered by the direct npm fixture. Windows does the correct aggregate behavior:
it continues collecting package failures and then throws
(`install-windows.ps1:300-337`).

Preserve report-and-continue for vet findings, but return non-zero after Unix
bootstrap has attempted all installs if any prerequisite or package install
failed. Add a hermetic bootstrap status test; this does not require changing
strict/report-only vetter semantics.

### Medium - Corrupt tarball behavior is implemented in the fixture but never exercised

The integration fixture defines a `"corrupt"` state and can serve corrupt bytes
(`harness/scripts/npm-resolution-policy.integration.test.ts:34-37,223-236`),
but the scenario only invokes the `"missing"` state
(`harness/scripts/npm-resolution-policy.integration.test.ts:451-464`). No test
uses `"corrupt"`.

The focused suite would therefore stay green if corrupt artifact handling were
weakened. This misses the explicit corrupt/missing non-vacuity requirement
(`reviews/cold-review-request.md:17,34`). Add a separate corrupt-tarball
operation that asserts non-zero status, a proxy tarball request, and zero
upstream requests.

## Mandatory-lens adjudication

| Lens | Result |
|---|---|
| SFI authority | **Fail:** registry propagation is otherwise consistent and changed production code contains no direct npmjs authority or fallback, but the retained `replace-registry-host` override is a lock-download escape. |
| Independent age | **Pass:** fresh helpers force age 7; root replay clears only age while retaining proxy and online policy (`release-age-policy.ts:22-44`). |
| Cache recovery | **Pass:** the fixture primes fresh metadata, proves the no-online stale control makes no packument request and fails, then proves governed resolution revalidates and installs current proxy truth (`npm-resolution-policy.integration.test.ts:399-449`). |
| Fail closed | **Fail:** direct missing artifact and exact-lock cases are non-zero, but Unix bootstrap masks nested install failure; corrupt artifact is not exercised. |
| Seam coverage | **Pass with F1/F2:** Unix/Windows global install, Pi install/update, prerequisite shell, audit, remote lockfile-lint, root replay, and local tools are wired to the intended seams. |
| Runtime hardening | **Pass:** `just pij` uses `harness/scripts/pij-cli.cjs` and the doctor compares resolved wrapper targets (`justfile:106-109,403-441`). Protected extension/flow-pair `npx` paths remain unchanged and disclosed. |
| Diagnostic | **Pass:** metadata inspection is followed by an actual age-governed lock resolution before packing, verdicts are proxy-only, and temporary state is removed in `finally` (`npm-resolution-diagnostic.ts:147-247`). |
| Windows | **Pass:** real `pwsh` uses `-NoLogo`, a 30-second child bound and 35-second named bound, and restores all four variables after deliberate failure (`release-age-policy.test.ts:24-26,46-180,406-431`). |
| Vetter semantics | **Pass:** `pkg vet` remains strict and `pkg audit` remains report-only (`packages.ts:417-545`). F2 concerns installation status, not vet findings. |
| Boundaries | **Pass:** no manifest, lock, settings, package YAML, CI, government, `.pi/extensions/pij`, or `skills/flow-pair` diff exists. |

## Independent execution

- Focused policy/integration/vetter run: 3 files, 12 tests passed.
- Real PowerShell restoration: five additional consecutive passes.
- `just typecheck`: exit 0.
- `just lint`: exit 0; ten pre-existing warnings and one schema notice, none in
  the s052 product files.
- `just release-age-probe`: all nine checks true, four local-registry requests,
  temporary root removed.
- Offline local wrapper and `just pij --help`: both exit 0.
- Invalid diagnostic target: truthful `DIAGNOSTIC_ERROR`, exit 5, no registry
  operation.
- `git diff --check`: clean; index empty; protected status empty.
- No live proxy/npmjs call, global install, `harness checks`, or
  `just self-check` was run by this review.

## Disposable validation and residue

The retained accepted gate is 8/8 with no skips
(`reports/disposable-harness-checks.json:1`) at the required base. The
disposable report records the dedicated short tmux server, disposable HOME/npm/
Pi state, zero npmjs log hits, and no accepted-token real Pi session
(`reports/disposable-validation.md:12-64`).

Independent inventory verification found:

- all 14 product-file hashes, sizes, and modes match the accepted inventory;
- 22 of the 23 retained input entries match;
- the only mismatch is the review-only
  `reviews/cold-review-request.md`, whose retained inventory value is
  `e2b7c3...` / 3713 bytes
  (`reports/disposable-validation-inventory.json:58-62`) while the current
  release packet is `5cbb8e...` / 4434 bytes;
- the three disposable evidence files were generated after the accepted input
  inventory and are not product drift.

The post-gate review-packet drift does not contaminate product proof, but the
retained inventory is not byte-identical to the entire current plan/evidence
tree and should not be described that way.

The first rejected run is honestly disclosed
(`reports/disposable-validation.md:66-86`). The exact real residue still exists:

```text
~/.pi/agent/sessions/--private-var-folders-mv-9mcvlzg504b158ctlswmgwph0000gn-T-pij-s052-validation-k_uajea4-repo--
```

It has not been cleaned. No real session path contains the accepted
`pij-s052-validation-l0nhp897` token. The real npm tree had 367 file writes in
the surrounding 12:50-13:06 window, including a dense cache burst at
12:57-12:58; concurrent sessions prevent assigning every volatile cache entry
to s052, so the report correctly distinguishes that tree from unchanged
critical configs, installed package roots, and installed Pi. The residue is
outside the implementation worktree, excluded from accepted proof, and does
not appear in the product diff.
