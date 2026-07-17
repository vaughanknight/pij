# Ship Report — pij-grown-up (plan 054)

**Generated**: 2026-07-17T07:30Z
**Branch**: `s054/pij-grown-up` → **Base**: `main` (97 ahead / 0 behind — no divergence, no reconcile)
**PR**: https://github.com/AI-Substrate/pij/pull/27 (#27) · **State**: ✅ **MERGED** 2026-07-17T08:04:08Z → **`ab16cfb`** on main (squash), second-lander behind s055's `482d604`

## Checks

| Run | Check | Status | Signal |
|---|---|---|---|
| 29562192176 (first) | check (22) / check (24) | ❌ fail | 2831 passed / **1 failed** — `cli.integration.test.ts:1139` (fixed in `828d972`) |
| 29562192176 (first) | windows-compat | ✅ pass | — |
| 29562817870 (after fix) | all three | ❌ fail in 3s | **GitHub Actions billing** — jobs never started |
| 29562817870 (re-run, billing cleared) | check (22) · check (24) · windows-compat | ✅ **all pass** | 4m45s–5m4s; the `828d972` fix verified on Linux CI, the platform that exposed it |

**Verdict**: ✅ **ALL GREEN** (run 29562817870, re-run after Jordan cleared billing). Both Node legs + windows-compat pass with the attribution-probe fix in — verified on the very platform whose path semantics exposed the bug.

_Billing interlude (resolved): the first post-fix attempt returned "The job was not started because recent account payments have failed…" — no step ran, and `windows-compat` (green minutes earlier) failed identically, which was the tell that it was infrastructure, not code._

## The one real CI finding (fixed)

`828d972` — the `link` attribution probe asserted a refusal it never constructed. `resolveSelf` has three ways in (session id, lone-local-by-folder, pane-exact); the probe closed none, ran from `main` where `pij-root` is the sole descriptor, so the lone-local branch attributed the caller legitimately and `link` correctly exited 0. **The product was right; the test was wrong.**

It passed locally only by accident: `mkdtemp` returns a `/var` symlink on macOS while the CLI's `process.cwd()` reports `/private/var`, so the folder match never fired — local runs took a different code path than CI. Diagnosis was *proven*, not guessed: realpathing the sandbox root reproduces the CI failure locally byte-for-byte (`expected +0 not to be +0`); reverting only the probe fix brings it back. Fix realpaths the root (both platforms now exercise the same matching) and makes the probe genuinely unattributable.

Local gates after the fix: `tsc` clean · full suite **2832 passed / 0 failed** · biome clean.

## Landing sequence (all resolved)

1. ~~**GitHub Actions billing**~~ — Jordan cleared it; re-run green.
2. ~~**s051 landing gate**~~ — **R2 amended, then inverted.** Its premise (s054 builds atop s051's surfaces) was falsified by the build: zero lines touched in `core/discovery.ts` / `core/current-session.ts` / `core/close.ts`, verified three independent ways. Jordan ruled PD-011 accept; o-prime recorded it. s051 is now the *second* lander and re-runs s054's outcome contracts as its convergence gate (checklist §2).
3. ~~**SW-6 second-lander rebase**~~ — executed. s055 (#26) merged first; s054 converged onto it. The predicted collision surface (`daemon.ts`, `core/types.ts`, `core/spawn.ts`) **auto-merged with zero conflicts** — the additive-only constraint both streams held is why. 7 hunks needed hands, every one an adjacent-insert resolved as a union; nothing dropped from either side. Both descriptor axes survive intact.
4. **Ship checklist §3–5** — STILL OPEN: daemon-restart baton, live two-peer AC-07 demo, `just pij-skill-install`. Now ride **one combined daemon restart shared with s055** (mandrill drives, on Jordan's word) — s054 must not restart separately.

## Convergence evidence (post-merge, re-verified by the orchestrator)

- Full suite on the converged tree: **2886 passed / 0 failed** — s054's 2832 + s055's 54, green together. tsc clean · biome clean · `just pij-skill-check` green.
- CI on the merge commit: run `29564784706`, all three jobs pass; PR went `MERGEABLE`/`CLEAN`.
- **R4 survived the squash**: `government/prime-flow.json` on main is blob `9b7d5b5` — byte-identical to the pre-merge attestation.
- s055 built against s054's contract, recorded in-code (`core/types.ts:68`: *"s055 watchdog consumes `systemState` by these names"*). The WS-6 vocabulary is byte-exact on both sides.
- Independent corroboration worth keeping: s055 diagnosed the pwsh probe flake separately and landed on the **same 60s ceiling**; the merged comment carries both measurements.

## Integration mechanism (disclosed + accepted)

Integrated via **merge-from-main, not literal `git rebase`** — 22 of 97 commits touch the overlap files, so a true rebase meant up to 22 hand-resolutions of the same hunks (22 chances to resolve wrong), and squash-merge makes main's history byte-identical either way. Resolve-once/verify-once was the lower-risk route to the same outcome. Accepted on the record by o-prime (spine Seq 463); no linearisation required.

## Deferred & Noteworthy

Nothing deferred — 12/12 ACs met, no open tasks, no TODO/FIXME introduced. Two out-of-fence fixes disclosed in the PR manifest under Jordan's ruling: `cdf1d68` (pwsh probe timeout headroom) and `828d972` (attribution probe fidelity).

## Resume

- CI: green as of 2026-07-17T07:35Z (run 29562817870). Re-check: `gh pr checks 27`
- Merge: ✅ done (`ab16cfb`). Remaining: checklist §3–5 on the combined restart, then s054 teardown.
