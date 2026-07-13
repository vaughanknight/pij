# Original ask — real pij trees

Human-created adopted-pane brief:

> ensure pij has real trees.

Required capabilities:

1. Link child sessions when pij automatically boots another tmux node.
2. Adopt and link a human-created tmux/Copilot/pi node under its prime.
3. Persist parent relationships on sessions or equivalent durable graph state.
4. Add a `pij tree` command.
5. Show repository trees across worktrees, not only equal folders.
6. Show the global tree across all pij sessions.
7. Show a prime subtree or any node subtree.
8. Filter or represent idle, closed, dead, dissolved, and related states.
9. Mark primes.
10. Support multiple primes and an `old-prime` role/state for seat takeover.

Forbidden packet paths:

- `.the-flow-state.json`
- `the-flow.json`
- `the-flow.md`
- orchestration ledger directories

The adopted orchestrator began in main. All work must use the allocated s046
worktree explicitly; the cwd mismatch is part of the adoption-linkage dogfood.
