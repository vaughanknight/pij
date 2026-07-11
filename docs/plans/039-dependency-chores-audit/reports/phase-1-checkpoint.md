# Phase 1 checkpoint — dependency audit

## Claim

Plan 039 safely removed every actionable root audit finding in two attributable dependency batches. The repository moved from 34 findings with one critical advisory to 26 findings with zero critical advisories; every residual vulnerable node is rooted in pinned minih 0.2.4.

## Commits

- `6cd65060ded75704307da1d0525554de0bb52f9e` — `chore(deps): upgrade vitest and tsx`
- `16a57e1b7ebb77b7101b65ec1403f40fee3a29c4` — `chore(deps): update pi family and ci`

## Audit delta

| Point | Total | Critical | Result |
|-------|-------|----------|--------|
| Baseline | 34 | 1 | Vitest, Pi, and minih roots present. |
| Vitest/tsx | 29 | 0 | Vitest 4.1.10, `tsx` 4.23.0, and root `esbuild` 0.28.1 removed the critical/toolchain root. |
| Pi/ws | 26 | 0 | Pi family 0.80.6 and root `ws` 8.21.0 removed the remaining actionable roots. |

## Final dependency contract

- Manifest keeps wildcard Pi peers and minih pinned to `github:AI-Substrate/minih#minih-v0.2.4`.
- Lock resolves all three Pi packages at 0.80.6, root `ws` at 8.21.0, Vitest at 4.1.10, `tsx` at 4.23.0, and root `esbuild` at 0.28.1.
- Root `picomatch` remains at its prior 4.0.4 resolution; no unrelated direct dependency was refreshed.
- CI now runs Node 22 and 24. Root audit remains report-only and names the 26-finding minih residual.

## Proof

- Pre-bump failure sets were empty before both dependency batches.
- Vitest 4 initially exposed its removed `it(name, fn, options)` signature in three opt-in live suites. Ruling §8 granted reorder-only migration; all names, assertions, and timeout values were preserved.
- Fresh `npm ci` installed the final lock successfully.
- The minih contract drift alarm passed: 1 file, 2 tests.
- Final `just test`: 123 files passed, 4 skipped; 1,738 tests passed, 10 skipped.
- Final `harness checks`: typecheck, lint, test, smoke, package audit, and snapshots all passed.
- Package-lock traversal proved all 27 vulnerable node paths representing the 26 findings are reachable from `node_modules/minih`; `minih` is the only direct vulnerable package.

## Scope integrity

The two commits contain only:

- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`
- `harness/scripts/vetters/agent.live.test.ts`
- `.pi/extensions/pij/core/agents/peer.live.test.ts`
- `.pi/extensions/pij/core/agents/adapters/adapters.live.test.ts`

No Dependabot configuration, GitHub security setting, minih ref, work item 040 package artifact, or unrelated direct dependency changed.

## Observations

- Vitest 4 required a three-file reorder-only migration; the discriminator stopped the phase before the addendum was granted.
- npm install produced two transient control-plane/test brownouts while `node_modules` and `.bin` were repopulated; both recovered at quiescence.
- Future baton returns should use `--evidence <commit-shas>` so the handover notice carries its proof.

## Open

- The 26 minih-rooted findings remain blocked on a green released upstream fix; PR 73 is still open and unstable.
- Node 22/24 GitHub Actions is a ship-stage remote proof; this checkpoint records the workflow change and local green gates.
- Git-index lease `lease-8fe94a5d-506e-4faa-8275-e8c9be012773` was returned by holder `pij-1yz3gyy` at `2026-07-11T12:28:27.762Z`; the shared index is free.
