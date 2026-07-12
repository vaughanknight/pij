# Cold Review — External Adopt Guard

## Mission

Cold-review the post-green external-adopt guard fix prompted by the incident
captured in `phase-3-external-adopt-guard-fix-packet.md`.

## Scope

Review the current uncommitted diff in:

- `skills/pij/references/00-routing.md`
- `skills/pij/references/routes/peer.md`
- `.pi/extensions/pij/cli.integration.test.ts`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-3-push-path-convergence-and-guidance/execution.log.md`

Write the verdict to:
`docs/plans/041-pij-inbox-no-tmux/reviews/phase-3-external-adopt-guard-review.md`.

## Required Contract

1. No/empty `TMUX_PANE` deterministically means external pull.
2. External pull must never list, infer, guess, select, or adopt a tmux pane.
3. `/pij adopt` intent outside tmux redirects to `pij inbox register`.
4. Tmux self-adopt may use only the current process's exact non-empty
   `$TMUX_PANE`.
5. No unconditional `E-NOID -> adopt first` or adopt-before-conversation wording
   remains.
6. Existing pi/tmux push and external pull behavior remains intact.

## Mandatory Dimension 0

Independently remove or invert the external no-pane hard ban. The named test must
go RED. Restore byte-identically and prove GREEN. Do not accept the coder's
mutation report without direct proof.

Also inspect whether the test checks behavioral associations rather than merely
the presence of words such as `TMUX_PANE`, `adopt`, and `inbox`.

## Gates

- Focused named integration test
- `just pij-skill-check`
- `just typecheck`
- `just lint`
- `harness checks --quick`
- scope/package audit and `git diff --check`

## Boundaries

- Read any source needed.
- Do not fix source or tests.
- Temporary mutation must restore byte-identically.
- Write only the review artifact.
- No CLI production edit, daemon restart, global deployment, commit, push, or
  merge.

## Verdict

Use `APPROVE`, `APPROVE_WITH_NOTES`, or `FIX_REQUIRED`, then send a concise JSON
report to `pij-concrete-reptile`.
