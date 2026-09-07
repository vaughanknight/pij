- id: DL-001
  kind: difficulty
  description: "rs-bg-jobs baseline harness boot: typecheck passes; file-watch-notify smoke fails before source edits. Restarted background-job polling cannot recover wait exit code, so runtime requires durable child exit receipt."
  fp: 2455b863579c
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T05:13:19.895Z"
- id: DL-002
  kind: difficulty
  description: "Private tmux server inherited stale PIJ_SPAWN_TASK from supervised launcher despite filtered Python environment; own OMP probe replayed obsolete bootstrap intent against isolated daemon only. Explicitly remove every PIJ_/CLAUDE/agent-dir key from private tmux server before setting scoped proof env."
  target: tooling
  suggested_encoding: "Private live-proof launcher must clear inherited tmux-server spawn intent, not only filter child process env"
  fp: aa661d228f84
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T05:35:51.722Z"
- id: DL-003
  kind: difficulty
  description: "Process-supervisor signal targets the entire process tree even when jobs use their own process groups. First isolated restart probe correctly reported exit143 because the harness killed the job too. Verify daemon PID identity then signal only that PID to prove detached survival; repeat observed running readoption then OK exit0 and native OMP inbox-ack."
  target: tooling
  suggested_encoding: "Live daemon-restart probe must use PID-only termination after runtime identity verification, not tree teardown"
  fp: 0725043b4359
  system:
    compound:
      status: open
      source: agent-self
      first_seen_at: "2026-09-07T05:42:18.455Z"
