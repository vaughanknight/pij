# Stream brief — s048-min-release-age-7 build
**From**: pij-primary-carp · **Date**: 2026-07-13T23:17:00Z · **Lifecycle**: reactivated

## Structure tree

```text
human
└─ o-prime pij-primary-carp
   └─ s048 pij-pregnant-dragon
      ├─ coder: spawn lazily via /pij pair
      └─ reviewer: spawn lazily after coder completion
```

## Work item

- **Plan folder**: `docs/plans/048-min-release-age-7/`
- **Worktree**: `/Users/jordanknight/pi-hacking/pij-worktrees/s048-min-release-age-7`
- **Branch**: `s048/min-release-age-7`
- **Current base**: `3b1a47beaed0455611e443ae8e2827cfb1aa460d`
- **Required base before coding**: `origin/main` at `b8a8b6ea1d7f8dcf68cf8a47da10e8bdcab7f1dd` or newer
- **Human ruling**: “do it”
- **Current flow state**: plan validated; phase 1 at `WAITING_FOR_BUILD_CONFIG`
- **Build profile**: separate Copilot `github-copilot/gpt-5.6-sol:xhigh` coder and reviewer peers through `/pij pair`

## Assignment

Remain the stream orchestrator. Do not implement code directly.

1. Fire-and-forget compact this reusable seat, then preserve the untracked plan folder.
2. Fetch and rebase the branch onto current `origin/main`; rerun `harness boot`.
3. Start `/pij pair` for the whole implementation phase. Persist the run/roster before spawning; acquire the reviewer only after coder completion.
4. Begin the non-overlapping tasks while the PR #14 overlap remains held.
5. Require a cold review, Dim-0 mutation evidence, orchestrator sanity pass, and full `harness checks`.
6. Report with `claim · artifacts[] · shas[] · gates[] · observations[] · open[]`.

## Fences

### Granted implementation paths

- `.npmrc`
- `harness/scripts/release-age-policy.ts`
- `harness/scripts/release-age-policy.test.ts`
- `harness/scripts/release-age-probe.ts`
- `RUNBOOK.md`
- `docs/plans/048-min-release-age-7/reports/**`
- `.harness/temp/s048/**`

### Held read-only pending PR #14 disposition

- `justfile`
- `harness/scripts/packages.ts`
- `docs/how/build.md`

After PR #14 lands or is otherwise disposed, fetch/rebase, reread those paths, and request a refreshed grant before writing them.

### Forbidden

- `.the-flow-state.json`
- Direct writes to `the-flow.json` or `the-flow.md`
- `.flow-pair/**` outside the CLI-owned ledger
- `government/**`
- `.pi/packages.yaml`
- `package.json`
- `package-lock.json`
- CI configuration
- Any commit, push, PR, merge, daemon restart, or machine-global mutation

Outside-fence need: stop and report to `pij-primary-carp`.
