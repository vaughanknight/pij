# Plan 041 Final Ship and Teardown

- PR: https://github.com/AI-Substrate/pij/pull/9
- Merged: 2026-07-12T23:50:01Z
- Merge commit: `1336291a5a2285d37487cf83bda86b7438ba93c4`
- Final source head: `2503a2212c7fac241e277ac56e5a463aa25e1a68`
- Final hosted CI: run `29212258335`
  - Node 22: pass
  - Node 24: pass
  - Windows compatibility: pass
- Final cold review: APPROVE
- Full tests: 1,878 passed, 10 skipped
- Final live proof:
  - genuine no-tmux Copilot Terra/medium
  - contaminated explicit identity rejected
  - same durable id repaired to paneless pull
  - repeat registration idempotent
  - explicit whoami succeeded after repair
  - append-only `reportedAt` preserved
- Canonical deployment:
  - skill: `/Users/jordanknight/pi-hacking/pij/skills/pij`
  - CLI: `/Users/jordanknight/pi-hacking/pij/.pi/extensions/pij/cli.ts`
  - daemon: PID `92943`, main checkout daemon source
- R-004 remains the active non-blocking ruling for shared Pi folder-trust smoke
  debt.
- Quarantined `pij-grieving-gibbon` was not reused or mutated.
- User-started `pij-minor-tuna` and `pij-consistent-cheetah` are not owned by
  this stream and are excluded from teardown.
