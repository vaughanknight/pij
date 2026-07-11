# FX002 Execution Log

## 2026-07-11 — live diagnosis

- Reporter `pij-uec99o` sent twice to healthy adopted peer `pij-vsa9qj`; both
  sends remained queued and no injected turn appeared.
- Verified target descriptor: Claude session `08e6f786…`, pane `%39`, lifecycle
  `bound`, PID alive. `tmux list-panes` also showed `%39` alive after the window
  rename to `orch-1`.
- Captured the daemon pane and found every tick aborting on an unrelated old
  descriptor: `tmux send-keys -t %902 ...` → `can't find pane: %902`.
- Descriptor `pij-1bovprr` owned `%902`; its pane no longer existed. With user
  approval, ran `pij close pij-1bovprr --force`.
- The next tick then blocked on another old pane, `%828`, confirming global
  head-of-line blocking across the registry.

## 2026-07-11 — tests-first regression

Added two tests and ran:

```text
npx vitest run .pi/extensions/pij/daemon.test.ts \
  .pi/extensions/pij/adapters/daemon-tmux.test.ts
```

Both new tests failed before implementation:

- adapter test: `Error: can't find pane: %42` escaped `sendText`;
- daemon test: `%dead` exception escaped `tick()` before `%live` drained.

## 2026-07-11 — implementation and live recovery

- Wrapped the real tmux send boundary: errors now log once and map to
  `unverified`.
- Isolated pending and bound processing per descriptor inside `Daemon.tick`.
- Targeted tests passed: 37/37.
- Restarted the daemon with user approval. The restarted linked daemon consumed
  old impossible sends as unverified and continued across the registry instead
  of aborting.
- It drained three queued messages to live pane `%34` (`pij-uec99o`) and two to
  `%39` (`pij-vsa9qj`) in the same run.
- Sender receipts advanced to delivered; `pij-uec99o` replied:
  `received — injected turn arrived cleanly`.

## Validation so far

- `just typecheck`: pass.
- `just lint`: pass with the repository's existing 9 warnings + Biome schema info.
- `npx vitest run .pi/extensions/pij`: pass — 70 files passed, 2 skipped;
  1,034 tests passed, 6 skipped.
- Full `harness checks`: pass — typecheck, lint, test, smoke, package audit, and snapshots all green.
- Independent read-only reviewer: **APPROVE**; residuals are documented uncertainty after partial sends, global pre-loop setup still being outside per-descriptor isolation, and stale-descriptor cleanup remaining separate.
