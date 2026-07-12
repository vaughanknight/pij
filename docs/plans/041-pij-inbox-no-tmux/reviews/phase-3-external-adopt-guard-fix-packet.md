# Phase 3 Post-Green Fix — External Adopt Guard

## Incident

A genuine no-tmux Copilot session ran `/pij adopt`, confirmed `TMUX` and
`TMUX_PANE` were absent, listed every pane in a shared tmux server, guessed `%0`,
and adopted that unrelated pane. This can bind the external session to another
user/agent's identity.

## Mission

Harden the `/pij` skill so this route is explicitly forbidden and mechanically
guarded.

## Allowed Files

- `skills/pij/references/00-routing.md`
- `skills/pij/references/routes/peer.md`
- `.pi/extensions/pij/cli.integration.test.ts`
- `docs/plans/041-pij-inbox-no-tmux/tasks/phase-3-push-path-convergence-and-guidance/execution.log.md`

## Required Contract

1. Delivery-owner detection occurs before self-registration advice.
2. Empty/absent `TMUX_PANE` means external pull mode.
3. In external pull mode:
   - never run `tmux list-panes`, `display-message`, or another pane-discovery
     command;
   - never infer, guess, select, or adopt any pane id;
   - redirect `/pij adopt` intent to `pij inbox register` (or first
     `pij inbox --wait` auto-registration).
4. Tmux self-adopt may use only the exact non-empty `$TMUX_PANE` supplied by the
   current process.
5. Remove/reword every unconditional `E-NOID -> adopt first` instruction.
6. Preserve pi/tmux push-first and external pull guidance already approved.

## Test Quality

Strengthen the existing CLI/skill integration test to assert the exact hard-ban
language and mode-specific identity action. Perform a reversible mutation that
removes the no-pane ban or restores adopt-first guidance; the named test must go
RED, restore byte-identically, then GREEN.

## Gates

- Focused named integration test
- `just pij-skill-check`
- `just typecheck`
- `just lint`
- `harness checks --quick`

Restore package-audit-only timestamp drift.

## Forbidden

- No CLI production behavior change.
- No daemon restart, live proof, package/lock, harness, flow-state, commit, push,
  or merge.
- No edits outside the four allowed files.

## Report

Send a concise JSON report to `pij-concrete-reptile` with files, tests, gates,
and mutation evidence.
