# Fleet roster — s046

**Run**: `2026-07-12T21-53-55Z-github.com-AI-Substr`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s046-pij-real-trees`
**Branch**: `s046/pij-real-trees`
**Parent SHA**: `347b6dd732110bc76b3d421e61a401cc228149d6`
**Profile grant**: Spine Seq 110

| Role | Harness | Model | Effort | pij id | Spawned by this seat | State |
|------|---------|-------|--------|--------|----------------------|-------|
| coder | Copilot | `gpt-5.6-sol` | `xhigh` | `pij-concrete-roadrunner` (`%857`) | yes | T012 Stage A complete; compact sent fire-and-forget; reusable until merge |
| reviewer | Copilot | `gpt-5.6-sol` | `xhigh` | `pij-minimal-whale` (`%924`) | yes | T012 Stage A approved with notes; compact sent fire-and-forget; reusable until merge |

## Contract

- Every spawn originates from the s046 worktree.
- Coder owns only T001-T004 allowed paths.
- Reviewer is cold and read-only except its review artifact.
- Coder compacts immediately on completion and reviewer compacts before fix or approval; both sends are fire-and-forget with no `--wait` and never block orchestration work (Jordan ruling, Spine Seq 128).
- The installed flow-pair CLI does not persist model/effort/roster fields; this plan-owned roster is the durable configuration truth. The `.flow-pair` ledger remains CLI-only.
