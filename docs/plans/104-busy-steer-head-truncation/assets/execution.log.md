# Execution log

## T001 — Boundary comparison

- OMP sender event: `pij_send` input starts with the expected opening and contains no leading control bytes.
- Durable receiver inbox: exact complete opening and tail persisted.
- Claude native transcript: busy-turn `queue-operation` starts at a variable later byte (`ed, so…`; `he topic…`) before the turn is processed.
- Pane screenshot matches the clipped Claude queue bytes.
- Ownership: pij's `DaemonTmux.sendTextUnchecked` uses `typeLiteral` → `tmux send-keys -l`; the existing `pasteBuffer(..., { bracketed: true })` seam is documented and tested as safe for multiline payloads.

Evidence: receiver packet `/Users/jordanknight/substrate/flowspace/flowspace3/.harness/temp/s104-evidence-lynx.md`; sanitized root-cause report will retain only boundary prefixes.

## T002 — RED regression

- Added an adapter-boundary matrix for idle and busy Claude delivery.
- The exact body starts with `HEAD-SENTINEL`, contains real newlines and non-BMP Unicode, exceeds 10 KiB, and ends with `TAIL-SENTINEL`.
- RED: focused Vitest produced 2 expected failures because no `set-buffer` call existed; 31 pre-existing tests passed.

## T003 — Bracketed Claude injection

- `DaemonTmux.sendTextUnchecked` now uses the existing argv-only `pasteBuffer` primitive with `{ bracketed: true }` for Claude only.
- Copilot keeps literal key injection because its focus wake, visible-tail confirmation, clearing, and retype loop are calibrated to that path. Codex is unchanged because no evidence implicated it.
- GREEN: `just test .pi/extensions/pij/adapters/daemon-tmux.test.ts` → 33 passed, 0 failed.

## T004 — Verification

- `just format` → completed; only scoped files changed.
- `just test .pi/extensions/pij/adapters/daemon-tmux.test.ts` → 33 passed, 0 failed.
- `just typecheck` → passed.
- `just lint` → exited 0; 9 pre-existing warnings in untouched files and one schema-version info remain outside this allocation.
- Full `just test` / `harness checks` was not run because the delegation explicitly requires Jordan approval before the full suite.

## Phase complete

All implementation tasks and authorized gates are complete. No domain-mode files apply.
