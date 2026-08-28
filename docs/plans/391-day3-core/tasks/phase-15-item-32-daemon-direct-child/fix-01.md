# FX-01 — item 32 (dlg-0030) — review lows, base 61d68f1

Verdict `review-01.md`: APPROVE (lows only). Orchestrator ruling: three small fixes before PR because they touch the property under review (signal handling) and the builder's single-source guarantee. Same fence.

## P-1 (low) — one source of the launch shape
`daemon.test.ts:~2843` (the 15-FX SIGTERM test) still hand-composes `["--import", "tsx", DAEMON_BIN]` — a second, cwd-dependent copy (fails to boot from a no-node_modules cwd). Make it spawn `daemonLaunchArgv(DAEMON_BIN)` (import the builder from cli.ts). Any other hand-composed `--import` tsx spawn in tests → same.

## P-2 (low) — SIGINT sensor
SIGINT has zero coverage repo-wide (reviewer's M5: dropping the SIGINT handler leaves the suite green). Extend the new `it.each` real-launch cases to `["SIGTERM", "SIGHUP", "SIGINT"]`; RED evidence: remove `onSignal("SIGINT", …)` → the SIGINT case RED; restore → GREEN.

## P-3 (info) — stale source comments
`daemon.ts:1` shebang and `:8` ("Run it in a tmux window: npx tsx …") and `core/daemon/lifecycle.ts:59` (budget attributed to "npx + the tsx transform") describe the removed relay. Update the prose (comment-only; lifecycle.ts is otherwise OFF LIMITS — the constant stays).

Gates: full vitest via `pij bg` → `docs/plans/391-day3-core/logs/vitest-phase15-fx01.log`; run the three process-spawning tests 10× in a loop (`-t "direct child"` or equivalent) and keep the log (`docs/plans/391-day3-core/logs/item32-spawn-x10.log`) — Phase 14 was a flake hunt; tsc; biome. One commit; report per schema via `--body-file` with the SIGINT RED evidence and the ×10 result.
