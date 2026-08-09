# Stream brief — PR #14 Windows installer reconciliation
**From**: pij-primary-carp · **Date**: 2026-07-13T23:50:00Z · **Lifecycle**: allocated

## Structure tree

```text
human
└─ o-prime pij-primary-carp
   ├─ PR #14 reconcile pij-male-mastodon
   │  ├─ coder: spawn lazily through /pij pair
   │  └─ reviewer: spawn lazily after coder completion
   └─ s048 pij-pregnant-dragon · held pending PR #14
```

## Work item

- **PR**: `https://github.com/AI-Substrate/pij/pull/14`
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/pr14-windows-reconcile`
- **Local branch**: `reconcile/pr14-windows`
- **PR head**: `f854adf3773a7cf41f17e024f72a24c3691b9202`
- **Target main**: `b8a8b6ea1d7f8dcf68cf8a47da10e8bdcab7f1dd`
- **Human authorization**: Seq 200 exact `PROCEED`
- **Merge-tree result**: only `.harness/extensions/checks/instructions.md` and `docs/how/build.md` conflict
- **Bootstrap**: use `npm ci --no-audit --no-fund`; `--ignore-scripts` breaks the git-sourced `minih` prepare/build contract in this repository
- **Landing**: push the resolved branch to `origin/feat/windows-installer`, watch hosted checks, then report for authorized squash merge

## Assignment

Remain the reconciliation orchestrator; do not resolve the files yourself.

1. Invoke `/pij pair` with separate Copilot `github-copilot/gpt-5.6-sol:xhigh` coder and reviewer peers.
2. Merge `origin/main` into the local reconciliation branch.
3. Delegate the complete two-file conflict resolution plus integration validation as one bounded packet.
4. Preserve the Windows installer behavior from PR #14 and all newer main guidance. Do not choose one side wholesale.
5. Require a cold review, Dim-0/named-assertion evidence appropriate to documentation/check wiring, and an orchestrator sanity pass.
6. Run focused validation and full `harness checks`.
7. Commit the merge resolution and push exactly `HEAD:feat/windows-installer`.
8. Watch hosted checks and report `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`.

## Fences

### Writable

- `.harness/extensions/checks/instructions.md`
- `docs/how/build.md`
- Reconciliation evidence under `.harness/temp/pr14-reconcile/**`
- CLI-owned `.flow-pair/**`

### Read-only

- Every other PR #14 and current-main file
- `government/**`
- `docs/plans/048-min-release-age-7/**`

### Forbidden

- `.the-flow-state.json`
- Direct writes to `the-flow.json` or `the-flow.md`
- Product changes outside the two conflict resolutions
- Main checkout/index
- Pushes to `main`
- Any PR other than #14
- Daemon restart or machine-global mutation

Outside-fence need: stop and report to `pij-primary-carp`.
