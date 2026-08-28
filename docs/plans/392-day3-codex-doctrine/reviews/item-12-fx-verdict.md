# Item 12-FX — stream verdict (flake fix; E22 gate)

**Candidate**: cf1f04c758513191435ddefdc109718f1a04b5a7.
**Gate for a flake fix** = deterministic under full-suite parallelism over N runs, repro + logs kept (E22). No mutant.

## Verified
- **Root cause pinned**: the first canonical-order case exceeded Vitest's 30 s timeout under full-suite parallel contention because the checker re-read the SHARED git worktree (recursive skills/pij copy + un-fixtured doc/evidence reads). A timeout under I/O/process contention, not a data race.
- **Fix = true isolation** (not serialize/retry): `pij-skill-check.sh` honors `PIJ_REPO_ROOT` (:7-8); the test builds one isolated repo snapshot per file and restores only mutated fixtures between cases.
- **E22 logs kept + verified by orchestrator (read committed logs)**:
  - pre-fix repro `pre-fix-full-suite-run-6.log`: 1 failed (pij-skill-check.test.ts) — the flake captured.
  - post-fix `run-1/2/3`: **4771 passed | 19 skipped, 0 failed** each (3 consecutive green full-suite runs, ~200 s each). Proof runs excluded `release-age-policy.test.ts` (pwsh ENOENT, environmental — separately skip-with-reason'd).
- Gates: typecheck PASS, changed-file biome PASS.

**Verdict: 12-FX COMPLETE.** Bundling into a harness-hygiene PR with 23-FX + the pwsh skip-with-reason (o-prime ruling #4).
