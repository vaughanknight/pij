# Build configuration — s047

**Confirmed by**: `pij-primary-carp` from Jordan’s ruling · Spine Seq 118
**Flow-pair run**: `2026-07-12T22-11-49Z-github.com-AI-Substr`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s047-portable-pi-models`
**Branch**: `s047/portable-pi-models`
**Parent**: `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
**Tmux placement**: window `9:s047-portable-models` — orchestrator `%827`, coder `%908` (human ruled both must move out of the prime window)

## Fleet roster

| Role | pij id | Pane | Harness | Model | Effort | Canary | Ownership |
|------|--------|------|---------|-------|--------|--------|-----------|
| coder | `pij-pleased-cardinal` | `%908` | copilot | `gpt-5.6-sol` | `xhigh` | `CANARY-S047-CODER-6219` passed | spawned by s047 |
| reviewer | `pij-grubby-marsupial` | `%1023` | copilot | `gpt-5.6-sol` | `xhigh` | `CANARY-S047-REVIEWER-7351` passed | spawned by s047 |

Coder compaction was requested immediately after spawn and again after canary. Per Jordan’s Spine Seq 128 ruling, reusable-peer compact is **fire-and-forget**: send it immediately without `--wait`, then continue report/review/fix work without blocking on compact latency. Only the one-shot `E-DEAD` exception remains.

## Granted implementation fence

- `.pi/models.json`
- `harness/scripts/sync-models.ts`
- `harness/scripts/sync-models.test.ts`
- `justfile`
- `AGENTS.md`
- `RUNBOOK.md`
- `docs/how/build.md`
- `docs/how/update-pi.md`
- `docs/plans/047-portable-pi-models/tasks/phase-1-portable-model-catalog-sync/**`

## Holds / forbidden

- HOLD `docs/how/pij-models-discovery.md` until s045 converges, this branch rebases, and the file is reread.
- Never modify `.the-flow-state.json`, `the-flow.json`, `the-flow.md`, or `.flow-pair/**` manually.
- No `auth.json`, general skills, `pi-doctor`, real-home test writes, `npm link`, main-checkout writes, push, or public remote.
