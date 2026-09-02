# Ship Report — statusline-generation-badge

**Generated**: 2026-09-02T04:29:42Z
**Branch**: `129-statusline-generation-badge` → **Base**: `main`
**PR**: https://github.com/AI-Substrate/pij/pull/353 (#353) · **State**: open

## Checks

| Check | Status | Details |
|---|---|---|
| check (22) | pass | https://github.com/AI-Substrate/pij/actions/runs/33590299820/job/100122753353 |
| check (24) | pass | https://github.com/AI-Substrate/pij/actions/runs/33590299820/job/100122753362 |
| rust | pass | https://github.com/AI-Substrate/pij/actions/runs/33590299820/job/100122753346 |
| windows-compat | pass | https://github.com/AI-Substrate/pij/actions/runs/33590299820/job/100122753258 |

**Verdict**: all green after the Rust clippy fix preserved the `claude-*` doctor command names without the prefixed enum variants.

## Repo guidance applied

- PR body: dd-native `harness plan pr-body --pin-head` acceptance table plus incident, verification, and deferred-notes context
- Base: `main`
- Review: Claude Opus r2 `APPROVE`

## Deferred & Noteworthy

| Kind | Item | Where | Reason / note |
|---|---|---|---|
| Reviewer note n1 | Prior-statusline command forms that cannot be resolved are left in place without a copied backup | `assets/reviews/review-r2-cross-model.dd.md` | Deferred to prime; supported tilde and absolute forms are backed up |
| Reviewer note n3 | No separate rs-arm content assertion for turn-start reassertion | `assets/reviews/review-r2-cross-model.dd.md` | Shared field/closure plus legacy assertion covers realistic mutations; non-blocking |
| Known main baseline | npm resolution replay status 1; worktree cleanup `ENOTEMPTY` | `assets/live-statusline.md` | Prime-ruled pre-existing failures; neither test changed |
| Harness observations | 13 pending entries | `.harness/temp/agent/session-buffer.md` | Listed, never cleared; o-prime owns drain |

## Resume

- PR is open with all CI checks green.
- Merge is prime-owned; this PM did not merge main.
