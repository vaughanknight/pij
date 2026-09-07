- id: DL-001
  kind: difficulty
  description: "Worktree harness boot fails TS2688: node type definition missing from per-package node_modules symlinks; preserve shared dependencies and repair only worktree links."
  fp: 5416d6174b1f
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T01:47:44.838Z"

## Archive note (prime, 2026-09-07)
Only the coder session buffer survived my archive step: the packet and `commit-trailers-delivery.txt` were lost when a zsh glob aborted the copy before `git worktree remove --force`. The delivery facts are in PR #379's body and mockingbird's handoff message (spine); the packet text is reproducible from the prime transcript. My error.
