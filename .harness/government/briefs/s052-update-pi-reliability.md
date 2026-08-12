# s052 — update-pi reliability

**Owner**: `pij-pregnant-dragon`  
**Base**: current `origin/main`  
**Branch/worktree**: `s052/update-pi-reliability` / `pij-worktrees/s052-update-pi-reliability`
**Lifecycle**: pr25-manifest-lock-fix-active

## Mission

Make canonical `just update-pi` reliably recover from stale or subsequently unpublished npm metadata without manual cache repair, while standardizing npm resolution on Microsoft's package-feed proxy and preserving the client seven-day release-age policy.

## Banked incident evidence

- Failed targets: `pi-lean-ctx@^3.9.8`, `@tintinweb/pi-subagents@^0.14.0`, and Pi `0.80.7`.
- Current registry truth: `pi-lean-ctx@3.9.2`, `@tintinweb/pi-subagents@0.13.0`, Pi `0.80.3`.
- npm cache contained tarballs/metadata for vanished newer releases.
- `NPM_CONFIG_PREFER_ONLINE=true NPM_CONFIG_MIN_RELEASE_AGE=7 just update-pi` completed successfully: packages 6/6 and healthy `pi-doctor`.
- `pi-smart-fetch` requiring Node `>=24.16` is a separate warning, not this failure.
- Bare `pi update` is not the supported pij workflow and must not become the fix target.
- Human registry ruling: `https://packagefeedproxy.microsoft.io/npm/` is mandatory under Microsoft's Secure Future Initiative (SFI) for every npm pull/read/resolution/download/install/check. It is authoritative: no direct npmjs reads, fallback, or live diagnostic comparison. The sole direct npmjs exception is an authenticated publish **write** (for example GitHub OIDC trusted publishing). Proxy inconsistency fails closed. Client `min-release-age=7` remains a separate mandatory read layer.
- s052 worktree bootstrap observed proxy-stale vanished versions: initial `npm ci --min-release-age=null` selected `pi-tui@0.80.6`; retry with prefer-online selected vanished `pi-coding-agent@0.80.6`. Prefer-online alone may not repair stale proxy truth.
- Harness-engineering observed every `pij orchestration baton ...` invocation silently invoking npm to install missing `tsx@4.23.0`. First-class orchestration must not repeatedly bootstrap an unpinned runtime dependency, or must expose and prove its proxy/age/version contract.
- Current trace: repository manifest/lock already route `pij` through `harness/scripts/pij-cli.cjs` and pin `tsx@4.23.0`; the machine-global link is stale and still resolves to the legacy `cli.ts` npx shebang. `just pij` also still invokes npx. Distinguish stale deployment from repository packaging before proposing manifest changes.

## Required work

1. Reproduce the stale/unpublished-version failure deterministically without mutating real global Pi/npm state.
2. Design the smallest canonical-updater fix; prefer explicit online metadata revalidation over cache deletion.
3. Preserve seven-day quarantine for all fresh npm/Pi/package resolution and the existing frozen-lock exception only.
4. Add tests proving the updater/package subprocesses receive the intended online and age-policy environment.
5. Cover `just install`, `just update-pi`, package bootstrap, and `pi update --extensions` consistently where the same seam applies.
6. Route applicable npm/npm-view/npx resolution through `https://packagefeedproxy.microsoft.io/npm/`; prove configuration reaches every intended subprocess.
7. Determine whether client cache or proxy metadata contributed to vanished-version selection using proxy-only live diagnostics plus hermetic fixtures. Model upstream divergence only in fixtures; never contact npmjs directly or fall back to it.
8. Keep client `min-release-age=7` even when using the proxy until deterministic evidence proves equivalent server-side age behavior.
9. Keep report-and-continue vetting semantics unchanged.
10. Trace the `pij orchestration` runtime path that triggers `npx tsx`; recommend the smallest fix. If it requires package manifest/lock/bin-packaging paths outside the recorded touch set, stop and report that separate boundary before editing.
11. Run targeted tests, then full `harness checks`; obtain a cold cross-model review and fix any findings.

## Fences

- Work only in the s052 worktree.
- Record the descriptive touch set and expected overlaps. Ordinary reads/edits, hermetic tests/builds, local commits, and sole-owner branch pushes are notify-only while the worktree and branch remain isolated.
- Current descriptive touch set may include `.npmrc`, `harness/scripts/release-age-policy.ts`, `harness/scripts/release-age-policy.test.ts`, `harness/scripts/packages.ts` only at its existing policy-helper seam if evidence requires it, `justfile`, `install-windows.ps1`, focused hermetic fixtures/tests under `harness/scripts/`, and s052 plan/evidence.
- Do not modify the installed Pi binary, pi-mono, global npm cache, or real `~/.pi` during reproduction/tests.
- Do not alter package manifests, lockfiles, `.pi/settings.json`, or `.pi/packages.yaml` unless evidence proves they are part of the root fix and prime expands the fence.
- Synchronize before consuming a moving branch, rebasing, landing/merging, opening a shared-target PR, or using limited CI/external/global mutable resources.
- The stream orchestrator delegates coding and cold review; it does not implement product changes itself.
- Reusable-peer completion compaction is immediate and fire-and-forget without `--wait`.

## Done

Canonical `just update-pi` succeeds deterministically under a stale/unpublished metadata fixture, keeps the seven-day policy intact, all gates pass, and the stream returns an exact reviewed change inventory plus ship recommendation.

## Pre-code gates

- Satisfied: worktree fast-forwarded to `origin/main@591f188`, `harness boot` passed, and reconciled seams remain valid.
- `node_modules` is local/untracked and never stageable.
- Satisfied by contract: canonical `harness checks` runs only in a disposable isolated validation checkout with the exact implementation diff overlaid; implementation-worktree `.pi/packages.yaml` is never mutated/restored.

## PR #25 lock reconciliation

- Proxy-only research proves newest present and age-eligible `@earendil-works/pi-coding-agent` + `pi-ai` family is `0.80.3`; locked `0.80.6` is absent.
- `package.json` wildcard declarations need no change.
- Proposed scope expansion is `package-lock.json` only, generated by governed npm resolution (proxy, replace-host always, prefer-online, age 7), never hand-edited.
- Generate/inspect the lock diff in disposable state first; apply only the reviewed lockfile result, then prove governed root `npm ci --min-release-age=null` and hosted CI.
- Rejected broad candidate `27efaf02...` / diff `9cda063b...`: proxy policy blocked `vite@8.1.4`, 608 records rewrote, 453 registry integrities regressed to SHA-1, and writer attribution was not trustworthy.
- Retry must use a fresh verified named exclusive writer and exact Pi-family targeting (`pi-coding-agent`, `pi-ai`, `pi-tui`, `pi-agent-core` at 0.80.3); every non-Pi lock entry must remain byte-identical. If npm cannot produce that narrow lock mechanically, stop—no hand edit or broad re-resolve.
- First verified narrow attempt using `npm install --no-save --package-lock-only` was a no-op and produced no candidate.
- One further npm-native strategy is authorized in disposable state: targeted `npm update --package-lock-only` for pi-coding-agent/pi-ai/pi-tui under governed policy, allowing pi-agent-core only as transitive; any no-op, failure, non-Pi change, or integrity regression stops the attempt.
- Second targeted `npm update --package-lock-only` strategy was also a verified no-op; the lock-only authorization is exhausted and no third generation strategy is permitted.
- Jordan authorized exact root devDependencies at `0.80.3` for pi-ai, pi-coding-agent, and pi-tui while preserving wildcard peerDependencies; package.json and lock must regenerate/land atomically after disposable generation and cold review.
- Seq 378 generation produced no candidate: governed `replace-registry-host=always` rewrote proxy-returned Microsoft/Azure backend tarball URLs into invalid proxy paths and all Pi 0.80.3 tarballs 404ed.
- Mechanical lock URL/integrity postprocessing is NOT authorized.
- Before any further mutation, prove read-only/disposable whether governed npm's standard `replace-registry-host=npmjs` mode rewrites locked `registry.npmjs.org` URLs to the proxy while preserving proxy-issued Microsoft backend URLs, with zero npmjs traffic and successful exact Pi 0.80.3 manifest+lock generation.
- Seq 379 proved routing/backend/no-npmjs behavior under standard mode, but native generation still failed because the proxy graph advertises blocked Vite, unavailable Smithy, and stale nested Pi 0.80.6 artifacts.
- Jordan authorized a deterministic narrow baseline-lock derivation limited to the three root dev specs and Pi-family 0.80.3 nodes, using exact proxy-delivered bytes and reviewed SHA1→SHA512 evidence.

## Disposable full-gate envelope

- Use temporary HOME, npm cache/user/global config, PIJ_HOME, and Pi agent directory with only the minimum copied nonsecret package/config state.
- Attach existing dependencies without resolution.
- Live npm reads are allowed only to `https://packagefeedproxy.microsoft.io/npm/`, with prefer-online and client age=7; no npmjs traffic/fallback.
- All downloads/audit/cache writes land in disposable state. Real HOME, `~/.pi`, global npm cache/config, and installed Pi remain unchanged.
- If a sensor cannot run under this envelope, report it blocked; never fall back to standard HOME.
