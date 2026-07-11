# Plan 039 — rulings

## 1. Scope: triage npm-audit findings; defer Dependabot enablement

**Date**: 2026-07-11  
**Source**: Jordan, relayed by o-prime `pij-3vetx8`

- This work triages the 34 current `npm audit` findings and drives safe dependency updates through the full gate.
- Enabling Dependabot, adding its repository configuration, and changing GitHub security settings are explicit non-goals for this plan.
- Jordan's ruling on enablement: **"we will later"**.
- Any Dependabot configuration sketch produced during planning remains future input only.

## 2. Package manifest seam with work item 040

**Date**: 2026-07-11  
**Source**: o-prime `pij-3vetx8`

- Work item 040 owns the current unstaged `unique-names-generator` additions in `package.json` and `package-lock.json`.
- Plan 039 must preserve and exclude that artifact from its dependency changes and pathspec commits.
- The o-prime sequences the shared package-manifest seam at plan validation.

## 3. Take the Pi update and retire the Node 20 CI leg

**Date**: 2026-07-11  
**Source**: Jordan, in-plan clarification

- Upgrade the Pi dependency lock to the safe 0.80.6 line.
- Change the CI matrix from Node 20/22 to Node 22/24 so it satisfies Pi's Node `>=22.19.0` requirement and exercises the repository's declared Node `>=24` runtime.
- The CI workflow is therefore an approved Plan 039 surface, subject to the o-prime's validated fence grant.

## 4. Planning posture

**Date**: 2026-07-11  
**Source**: stream mode decision; Jordan's in-plan testing, mock, and documentation clarifications

- Mode: Simple (stream decision under the brief's delegated mode choice).
- Testing: lightweight — real audit deltas plus the existing full gates.
- Mocks: none; use the real npm graph and existing suite.
- Documentation: no new user documentation; retain evidence in plan and reports.

## 5. SW-5 package seam: revert, verify, then baton

**Date**: 2026-07-11  
**Source**: o-prime `pij-3vetx8`, spine Seq 26

- Work item 040 reverted its package POC rather than committing it.
- The o-prime verified `package.json` and `package-lock.json` byte-clean against HEAD.
- Hunk-level index mechanisms are refused as an INC-004-class hazard.
- Plan 039 waits for the queued git-index slot, then requests:
  `pij orchestration baton request git-index --purpose "s039 package window"`.
- No staging occurs before the pushed baton grant.

## 6. Cross-stream test discriminator during dependency bumps

**Date**: 2026-07-11  
**Source**: o-prime `pij-3vetx8`, spine Seq 30

- Proceed despite the earlier seven s038 mid-packet failures; the o-prime re-ran the two affected files and verified 38/38 green.
- Immediately before each package mutation, record the full-suite failure set as that bump's baseline.
- Pre-existing failures confined to s038 fenced test files are tolerated sibling churn.
- Any post-bump failure absent from that bump's pre-bump baseline is presumed caused by Plan 039, including failures in s038 files: stop mutation and escalate.
- Global green is mandatory at the ship gate.

## 7. s038 authoritative expected-red set

**Date**: 2026-07-11  
**Source**: o-prime `pij-3vetx8`, spine Seq 30 relay

During s038's current mutation window, the only tolerated sibling failures are exactly these three `writeMerged` / prime-persistence assertions:

1. Latest persisted `prime=false` beats stale daemon `true`.
2. Latest persisted `prime=true` beats stale daemon `false`.
3. Latest persisted `prime=true` beats stale daemon `undefined`.

Every other s038 test is expected green. Any additional post-bump failure is presumed Plan 039's and requires immediate stop/escalation.

**Update**: s038 fired the three-test mutation, verified a byte-identical restore by SHA, and yielded globally green. The tolerated sibling failure set is now **empty**. Any test failure appearing post-bump anywhere is presumed Plan 039's.

## 8. Vitest 4 live-test compatibility addendum

**Date**: 2026-07-11  
**Source**: o-prime `pij-3vetx8`, spine Seq 32

The discriminator stop is credited. A test-only fence addendum grants exactly:

- `harness/scripts/vetters/agent.live.test.ts`
- `.pi/extensions/pij/core/agents/peer.live.test.ts`
- `.pi/extensions/pij/core/agents/adapters/adapters.live.test.ts`

Constraint: reorder-only migration from `it(name, fn, { timeout })` to `it(name, { timeout }, fn)`. Test names, assertions, and timeout values must remain byte-equivalent apart from argument position. Disclose the reorder diff at commit and run the full gate afterward. `vitest.config.ts` remains read-only.

## 9. s038 strict-grammar expected-red window

**Date**: 2026-07-11  
**Source**: o-prime `pij-3vetx8`, Seq 30 relay

The current tolerated sibling set is exactly five s038 tests:

1. Parser rejects `list --prime=false`.
2. Parser rejects `list --prime=true`.
3. Parser rejects `list --here=false`.
4. Parser rejects `list --json=true`.
5. Real CLI rejects `list --prime=false`.

Everything else is expected green. The per-bump baseline discriminator remains authoritative.

During npm replacement, `minih` may be absent from `node_modules` briefly and sever the live pij CLI/control plane. This transient flicker is expected environmental behavior, not a Plan 039 failure; use atomic npm operations where supported and expect peer retries.

**Update**: s038 implemented the five strict-grammar cases green. The tolerated sibling failure set is again **empty**.

A second npm brownout class is confirmed: subprocess-spawning tests may fail with empty output while `node_modules/.bin` is being repopulated, then return green at quiescence. Retry after the install settles; escalate only if the failure persists.
