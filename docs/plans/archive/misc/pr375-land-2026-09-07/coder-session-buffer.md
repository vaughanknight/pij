- id: DL-001
  kind: difficulty
  description: "PR375 isolated-worktree boot failed TS2688: @types/node unresolved despite precreated per-package symlink node_modules; investigating local-only link repair without install or main mutations."
  fp: 485f11e6d701
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T01:25:14.126Z"
- id: DL-002
  kind: difficulty
  description: "CI's Linux npm test runs only Vitest; PR375 adds two Linux-only native node:test identity checks that are currently skipped by CI. pr375-land pushes also do not trigger main-only workflow."
  fp: ad3c43dc0ab9
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T01:26:31.132Z"
- id: DL-003
  kind: difficulty
  description: "ProcLiveness classify treats empty ps stdout/stderr as absent while PsRunner discards exit code/signal. Existing ordinary missing-PID contract is covered, but signal-terminated empty probe is indistinguishable; preserve exit status and add refusal fixture before claiming unconditional live-owner safety."
  target: security
  severity: degrading
  fp: 77fc05125162
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T01:49:20.151Z"
