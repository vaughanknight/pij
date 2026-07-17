# P1 fix packet 003 — resolve cycle-3 findings (fix cycle 3)
**From**: pij-civilian-takin (orchestrator) · **Date**: 2026-07-17 · **Immutable once dispatched**
**Coder**: pij-general-llama (compacted — re-ground from this packet + cited files)

## Context — the loop is converging; these are surgical
Cycle-3 verdict `docs/plans/054-pij-grown-up/reviews/p1-review-003.md` (READ FIRST — probe traces + smallest fixes): G1 root-cause DEAD, G2/G3 main traces CLOSED, your three rulings adjudicated SOUND. Remaining: the crash-window edges around your recovery gate + parity/hostile-key gaps. No new architecture — refine what exists.

## Findings (H1..H2, M3..M5)
- **H1 (marker trusted over state)**: recovery must not append from a committed marker when canonical state ≠ next AND no once-file exists — once-file present ⇒ return existing event + clear (the true moved-on case); absent ⇒ BLOCK, never forge. Pin: committed-marker + old/missing state + no once-file.
- **H2 (corrupt journal bypassed)**: journal enumeration returns a Result/corrupt-entry sentinel; ANY unreadable/invalid op-shaped `.json` fails recovery BEFORE mutation, naming the path. Real-fs probe: malformed UUID entry + `project create` must refuse.
- **M3 (silent clear poison-pill)**: `clear(opId): Result<void>`, durably synced removal; recovery/current verb stops unless the entry is confirmed absent. Pin the reviewer's abandoned-intent → failed-clear → successor trace.
- **M4 (__proto__ canonical drop)**: build canonical records `Object.create(null)` (or defineProperty for unknown keys); pin top-level + nested `created` + unknown-nested `__proto__` cases.
- **M5 (fake write-lock parity)**: fake gets held-state semantics (shared backing per machine-home); add `PlatformWriteLockPort` to the fs↔fake contract suite; pin nested acquisition + release-after-throw parity.

## Standing contract
fix-packet-001/002 still bind: worktree `/Users/jordanknight/pi-hacking/pij-worktrees/s054-pij-grown-up` only, fence, TDD red-first (reviewer probes become regressions verbatim), execution-log appends (H/M ids), port-first when ports.ts changes, no push/PR.

## Gates before checkpoint
`just typecheck` · fenced `npx vitest run .pi/extensions/pij/core/platform .pi/extensions/pij/adapters .pi/extensions/pij/core/cli.test.ts` · full `npx vitest run` (release-age-policy flake out of scope).

## Checkpoint
`pij send pij-civilian-takin "P1 FIX CYCLE 3 COMPLETE · commits <shas> · H1..M5 status · gates: <results> · <notes>"`
