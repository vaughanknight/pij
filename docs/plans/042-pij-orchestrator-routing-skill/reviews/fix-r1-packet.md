# Fix packet — review r1 / dlg-0001

**Reviewer verdict**: `FIX_REQUIRED`
**Source report**: `review-r1.md`
**Coder**: `pij-few-chipmunk`
**Scope**: exactly three files
**Commit**: forbidden

## Allowed files

- `skills/pij/references/prime/orchestrator.md`
- `skills/pij/references/prime/rituals/bootstrap.md`
- `harness/scripts/pij-skill-check.sh`

No other implementation file may change.

## HIGH-01 — Thread confirmed peer configuration into pair

The module records/reads back the confirmed profile but only says `/pij pair`.
Fix the consumption seam:

- Explicitly pass the recorded values through `/pij pair start` using
  `--coder-model <confirmed>` and `--reviewer-model <confirmed>`.
- Make clear that the current provided-peer path explicitly spawns/canaries the
  selected models and persists the plan roster; never silently use pair's
  built-in defaults and never claim the current flow-pair engine persists the
  overrides.
- Add structural checks for both override markers and their position after
  human confirmation but before delegation.
- Mutation: remove each override marker independently; each must go RED, restore
  byte-identical, then GREEN.

## HIGH-02 — One owner constructs the worktree

Kickoff already owns `git worktree add`. Bootstrap must only derive/reserve and
persist worktree/branch/base inputs, then delegate construction to kickoff.

- Remove `git worktree add` from bootstrap's steady-state intake step.
- State explicitly that kickoff is the sole construction owner.
- Keep kickoff's construction behavior unchanged unless a pointer wording fix
  is unavoidable (kickoff is not in this fix allowlist).
- Structural check:
  - bootstrap must not contain `git worktree add`;
  - kickoff must contain the construction command exactly once.
- Mutation: inject a `git worktree add` into a copied bootstrap; gate must go
  RED, restore byte-identical, then GREEN.

## Proof and return

- `just pij-skill-check`
- `just typecheck`
- `just lint`
- targeted mutations above, with byte-identical restoration
- `git diff --check`
- `git diff --name-only` equals the three-file allowlist

Return the original packet COMPLETE schema with an r1-fix summary. Do not rerun
the expensive cold dogfood or full smoke; the reviewer will re-check the narrow
diff and the orchestrator will run final gates after approval.
