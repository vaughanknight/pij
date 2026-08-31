# Governance

Governance for this repo does **not** live on `main`. It lives on the standing
`prime-governance` branch, checked out permanently at:

`/Users/jordanknight/pi-hacking/pij-worktrees/pij-governance/.harness/government/`

Spine, baton book, prime-flow, briefs, canaries, rulings, doctrine, incidents
and handovers all live under that root. **Single writer: the o-prime**; anyone
may read, nobody else writes.

`main` keeps product code and product docs — per-plan folders under
`docs/plans/<ord>-<slug>/` and the PRD under `docs/plans/prd/`.

Do not hand-write governance on `main`: `.harness/government/` and top-level `government/` are gitignored so they cannot silently resurrect here.
