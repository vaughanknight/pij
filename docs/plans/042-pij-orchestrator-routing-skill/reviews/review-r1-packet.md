# Review packet — Plan 042 / dlg-0001 / r1

**Reviewer role**: cold, read-only, separate session
**Required profile**: Copilot `gpt-5.6-sol`, `xhigh`
**Base HEAD**: `18a81918d1b002863c4920149e29bbda3277dd2f`
**Tracked diff SHA-256**: `c2e568f4fa8cbb38126df305c86d0497cbddb877ce7b10ff745302a26db9dd70`
**New module SHA-256**: `c6948a106991f71d752de22e9f2afe38b7f6d328e9addef80c8534e25d6487b5`

## Read in order

1. `reviewer-brief.md`
2. `../pij-orchestrator-routing-skill-plan.md`
3. `../implementation-amendments.md`
4. `../reports/coder-completion.md`
5. Actual worktree diff and new module

Form findings before reading any future orchestrator conclusion. The coder is
frozen; if any reviewed byte changes, stop with `TARGET_MUTATED`.

## Review work

- Verify base, changed paths, tracked diff hash, and new-file hash.
- Apply all review dimensions in `skills/flow-pair/references/review-rubrics.md`.
- Re-run the structural gate and inspect its mutation strategy.
- Independently verify the cold evidence hashes and claims.
- Execute the mandatory mutation checks in `reviewer-brief.md`; restore every
  mutation byte-identical.
- Check no product code, dependency manifests, flow state, government files, or
  pair engine changed.
- Check the docs consistently teach worktree-first construction, Builder ship
  PR landing, narrowed batons, and explicit shared-tree fallback.
- Check outage-first silence recovery and vet-noise classification do not weaken
  push-not-poll, allowed-path law, or the package hand-edit ban.

## Return

Write `review-r1.md` beside this packet and send its absolute path to
`pij-vital-tiglon`. Do not edit implementation files and do not commit.
