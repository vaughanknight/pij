# Ship Report — pij-grown-up (plan 054)

**Generated**: 2026-07-17T07:30Z
**Branch**: `s054/pij-grown-up` → **Base**: `main` (97 ahead / 0 behind — no divergence, no reconcile)
**PR**: https://github.com/AI-Substrate/pij/pull/27 (#27) · **State**: open · **Merge**: NOT armed (sequenced behind s051, per R2 + o-prime Seq 456)

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

## Blocked on (human)

1. ~~**GitHub Actions billing**~~ — RESOLVED by Jordan; re-run green.
2. **s051 landing** — merge gate (no remote branch/PR exists yet).
3. **Ship checklist §3–5** — daemon-restart baton, live two-peer AC-07 demo, `just pij-skill-install`. All R3-frozen pending Jordan.

## Deferred & Noteworthy

Nothing deferred — 12/12 ACs met, no open tasks, no TODO/FIXME introduced. Two out-of-fence fixes disclosed in the PR manifest under Jordan's ruling: `cdf1d68` (pwsh probe timeout headroom) and `828d972` (attribution probe fidelity).

## Resume

- CI: green as of 2026-07-17T07:35Z (run 29562817870). Re-check: `gh pr checks 27`
- Merge: blocked behind s051 + o-prime deconfliction + Jordan's word.
