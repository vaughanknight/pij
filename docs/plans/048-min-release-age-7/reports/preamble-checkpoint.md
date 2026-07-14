# s048 preamble checkpoint

- **claim**: Read-only orient is complete; the s048 worktree/base and main-read-only boundary are verified before research/planning.
- **artifacts[]**:
  - `/Users/jordanknight/pi-hacking/pij/government/briefs/s048-brief.md`
  - `/Users/jordanknight/pi-hacking/pij/government/orient-local.md`
  - `/Users/jordanknight/pi-hacking/pij/.pi/skills/pij/references/prime/orient-global.md`
  - `/Users/jordanknight/pi-hacking/pij-worktrees/s048-min-release-age-7/docs/plans/048-min-release-age-7/original-ask.md`
  - `/Users/jordanknight/pi-hacking/pij-worktrees/s048-min-release-age-7/docs/plans/048-min-release-age-7/reports/preamble-checkpoint.md`
- **shas[]**:
  - Worktree `HEAD`: `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
  - Worktree `merge-base(HEAD, origin/main)`: `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
  - `original-ask.md` SHA-256: `f6a5fef6a48c9ed346fe1b13e2d97e14e5b94250aafc848676e688ad636524dd`
- **gates[]**:
  - `git -C /Users/jordanknight/pi-hacking/pij-worktrees/s048-min-release-age-7 status --short --branch && rev-parse --show-toplevel && rev-parse --abbrev-ref HEAD && rev-parse HEAD && merge-base HEAD origin/main` — PASS: worktree root is the assigned s048 path; branch is `s048/min-release-age-7`; `HEAD` and merge base equal the brief's `3b1a47b` base.
  - No build/test/install gate run — this checkpoint is intentionally read-only orientation, before Builder research and planning.
- **observations[]**:
  - `s048-001 / win / governance / The adopted-process/main-rooted rule is explicit and the target worktree/base can be mechanically verified before planning / retain this checkpoint pattern for future adopted streams.`
- **open[]**:
  - Which installed npm/tooling surface can enforce a seven-day release-age quarantine is unresolved and is the first research question.
  - `npm audit` must remain enabled and be separately evidenced; release-age mitigation must not be presented as universal zero-day/CVE detection.

## Thesis

**Thesis** — Reduce exposure to malicious or compromised newly published package versions by enforcing or verifying a seven-day quarantine at the real npm/tooling seam.

**Now** — The repository has a report-and-continue package-vetter policy and an unmodified s048 worktree pinned to `origin/main@3b1a47b`, with the enforcement mechanism and deterministic proof strategy still unknown.

**Toward** — A cold-validated plan that preserves `npm ci`, install/build/typecheck/test workflows and separately proves `npm audit` remains operational, ready to stop at `WAITING_FOR_BUILD_CONFIG`.

**Keep** — Treat release age as a bounded supply-chain mitigation, not a claim to detect every zero-day or CVE, and keep main/read-only plus all non-plan surfaces fenced during planning.

> **My read:** Right means a verifiable, npm-compatible quarantine policy that blocks controlled fresh versions without disrupting locked dependencies or weakening the existing report-and-continue vetting/audit posture. The next decision must come from research into the installed npm surface, rather than assuming a configuration flag exists.
