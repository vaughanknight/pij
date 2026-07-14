# Cold rereview — dlg-0002

**Verdict**: `APPROVE`
**Base/HEAD**: `5830b279941538593a04483bfc1068911bdd3ffd`
**Reviewed capture**: `diff-0002.patch` (`ae02f07ee52bfdb8a0cf251f60928611eac14d1ce72cfc65bcdfeb1ca4bb270c`)

## Findings

No blocking or non-blocking findings.

## Correction verification

| Requirement | Result | Evidence |
|---|---|---|
| Windows root lock replay uses only the approved exception | PASS | `install-windows.ps1:419-422` preserves the `StartAt` gate and changes only root lock replay to `npm ci --min-release-age=null`. The capture contains no age-zero/null `npm install` path. |
| All four Windows fresh-resolution seams receive seven days | PASS | `install-windows.ps1:83-102` sets `npm_config_min_release_age=7`, clears conflicting `npm_config_before`, and restores both in `finally`. The wrapper governs global lean-ctx (`214-216`), manifest `pi install` (`294-296`), official global Pi (`426-428`), and `pi update --extensions` (`457-459`). |
| Windows source seams and restoration are materially tested | PASS | `release-age-policy.test.ts:147-184` names and structurally asserts all four call sites plus the sole Windows lock exception. `release-age-policy.test.ts:186-196` executes the extracted production function, forces an inner failure, and requires policy visibility, error propagation, and restoration. Independent run: 6/6 passed. |
| Fresh refusal requires age-specific evidence | PASS | `release-age-probe.ts:166-170` parses only the `with a date before` diagnostic. `release-age-probe.ts:257-262` requires non-zero/ETARGET, a parsed cutoff, and a cutoff match to npm's committed-policy `before` within five minutes. |
| Flow-pair execution evidence is reconciled honestly | PASS | `reviews/execution.log.md:7-9` explicitly says it is implementation evidence, not independent review; lines 11-53 cover phase work and the review/fix loop, lines 55-72 inventory changed/protected paths, lines 74-112 retain commands and probe facts, and lines 114-124 disclose residual risks. |
| Original policy contract remains intact | PASS | `.npmrc:1-2` is exactly seven days plus audit. `release-age-policy.ts:7-24` strips conflicting child overrides and exposes only root lock replay. `packages.ts:156-162,212-219,287-315` centralizes governed Pi installs without changing report-and-continue flow. Unix/CI exceptions remain lock-only; bare Pi self-update remains outside coverage. |

## Mandatory Dimension 0 — non-vacuity

### Existing policy guard

Named assertion:
`release-age-policy.test.ts:108-122`,
`overrides a caller-supplied lower value without mutating the caller environment`.

It seeds uppercase age `0` and a conflicting `before`, then requires child age
`7`, both conflicting child keys absent, and both caller values unchanged.
Removing the seven-day assignment, either case-insensitive strip, or the
side-effect-free copy necessarily fails a named assertion. The argument remains
valid after the correction.

### Windows source/restoration guard

Named assertions:

- `release-age-policy.test.ts:167-180` requires each of the four exact production
  commands to be lexically enclosed by `Invoke-WithReleaseAgeEnvironment`.
  Removing any wrapper or moving a command outside it makes its dedicated
  assertion fail.
- `release-age-policy.test.ts:186-196` executes the production function body
  after seeding age `2` and a conflicting historical `before`. Deleting the
  seven-day set, the `before` clear, either `finally` restoration, or exception
  propagation makes one of five exact assertions fail.

These guards are load-bearing rather than green-by-construction source scans.

## Independent evidence

- `git apply --reverse --check .../diff-0002.patch` passed, proving the capture
  matches the current product worktree.
- PowerShell parsing passed and the focused suite passed 6/6.
- A fresh independent probe produced all ten checks true:
  locked replay exit `0`; refusal exit `1` with an age-specific cutoff;
  configured `before` `2026-07-07T08:54:54.875Z` versus refusal cutoff
  `2026-07-07T08:55:11.000Z` (16.125 seconds apart); audit retained separately
  at exit `1` with 10 moderate and 16 high findings; temp root removed.
- Protected diffs and index were empty. SHA-256 values remained:
  - `package.json`: `baefc4af9bf8b44a46f5a27ec67e3722a934cbe25c26bb2caac7da87a1866c04`
  - `package-lock.json`: `44390b8b14039c7d1d95ed90dc6ab8a57189384e68bdbfe2bc5685b1ff2f808d`
  - `.pi/packages.yaml`: `4aaf036b17ab4bf70b59e7a6272e991cc38ba50070fd1f04c5ec80114de66be6`
- `package.json` remains pinned to `minih-v0.2.4`; the lock resolves commit
  `a9bc26e8b19c0236d6aa8c10281c86e03c1e6201`.

The disclosed absence of a full live Windows bootstrap remains a platform
confirmation risk, not a defect in the reviewed contract: the production
PowerShell parses, its environment wrapper executes under failure, and each
Windows source seam has a dedicated load-bearing assertion.
