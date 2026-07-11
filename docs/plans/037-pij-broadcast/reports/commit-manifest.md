# s037 pathspec commit manifest

**Proposed commit**: `feat(pij): add broadcast send`

Stage only:

- `.pi/extensions/pij/core/cli.ts`
- `.pi/extensions/pij/core/cli.test.ts`
- `.pi/extensions/pij/cli.ts`
- `.pi/extensions/pij/cli.integration.test.ts`
- `docs/how/pij.md`
- `docs/domains/pij-messaging/domain.md`
- `skills/pij/references/routes/peer.md`
- `docs/plans/037-pij-broadcast/`

Never stage:

- `.flow-pair/**`
- `.harness/temp/**`
- `government/**`
- any s036 path outside the already-committed shared-file base
- unrelated worktree changes

Before staging:

1. o-prime has approved the final `peer.md` diff and `just pij-skill-check` output.
2. reviewer verdict has passed Dim-0 and orchestrator sanity check.
3. `harness checks` is green.
4. git-index baton is explicitly granted.
