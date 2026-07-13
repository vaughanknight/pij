# s044 fleet roster

**Status**: Phase 1 APPROVED; coder/reviewer compacted; awaiting ship authorization
**Run id**: `2026-07-13T00-33-52Z-github.com-AI-Substr`
**Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s044-compact-before-redispatch`
**Branch**: `s044/compact-before-redispatch`
**Base**: `1336291a5a2285d37487cf83bda86b7438ba93c4`
**Plan**: `compact-before-redispatch-plan.md` v1.8 · sha256 `a422da9f735a2be20fd00c9ed9fb8a147d876791cf2bf9164760b83c9c277018`
**Grant**: Spine Seq 149, exact five-file implementation fence

| Role | Harness | Model | Effort | Peer | Spawned by s044 | Acquire |
|------|---------|-------|--------|------|-----------------|---------|
| coder | Copilot | `gpt-5.6-sol` | `xhigh` | `pij-useful-whitefish` · pane `%1042` · canary 3/3 · COMPLETE/compacted | yes | acquired |
| reviewer | Copilot | `gpt-5.6-sol` | `xhigh` | `pij-vital-toad` · pane `%1099` · canary 3/3 · review in flight | yes | acquired cold |

## Canary contract

For each peer, persist before use:

- pij id and pane id;
- descriptor cwd and branch;
- process/footer model `gpt-5.6-sol`;
- effort `xhigh`;
- first inference completes without model/auth/quota error;
- placement is a split in the s044 orchestrator window.

## Completion contract

- Reusable peer completion triggers immediate `pij send <id> --command compact`.
- Never add `--wait`; continue report/review/fix work immediately.
- Reviewer is not spawned before the coder completes.
- Only peers spawned by s044 are closed.

## Implementation fence

1. `skills/pij/SKILL.md`
2. `skills/pij/references/00-routing.md`
3. `skills/pij/references/routes/pair.md`
4. `harness/scripts/pij-skill-check.sh`
5. `docs/domains/pij-skill/domain.md`

Plan evidence may be written under `docs/plans/044-compact-before-redispatch/**`; scratch may use `.harness/temp/s044/**`.

## Forbidden

- `.the-flow-state.json`
- `docs/plans/044-compact-before-redispatch/the-flow.json`
- `docs/plans/044-compact-before-redispatch/the-flow.md`
- `.flow-pair/**` manual edits
- `.pi/extensions/pij/**`
- package manifests, lockfiles, daemon, CLI product code, flow-pair engine, schemas
- daemon restart, global skill link mutation, commit, push, or PR
