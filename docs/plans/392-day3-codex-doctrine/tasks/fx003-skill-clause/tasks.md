# FX003: Phase 4 SKILL.md clause is false under fs/dual (from reviews/phase-4-review.md finding B)

**Status**: complete

**Branch tip**: Phase 4 `c354d22` (git log first) · **Fence**: `skills/pij/SKILL.md` ONLY (LIVE skill — production push) · **Gate**: PD-02 (o-prime): `just pij-skill-check` before/after into `.harness/temp/s392/skill-check-{before,after}.txt`, diff = ZERO new findings; SKILL.md stays ≤150 lines.

## Problem (verified by orchestrator against source)
`skills/pij/SKILL.md` global invariant 2 says a socketless seat receives a pointer "never a body", under a heading "Global invariants (**every route**)". But `daemon.ts:1089` sets `sq = this.channel instanceof SqliteQueue ? this.channel : undefined` and `:1138` gates the pointer path on `{ pointer: sq !== undefined }`. So the pointer path runs ONLY under `PIJ_QUEUE_BACKEND=sqlite` (the default). Under `fs` AND `dual`, `sq` is undefined → the pointer path is off → the body is TYPED into the pty. The clause is false for two of the three backends.

## Fix (one clause, keep it true for all backends)
Reword invariant 2 so it does not promise "socketless never a body" unconditionally. Keep: persist packets/large bodies to disk first (audit + durability); a socket/RPC seat (claude inbox socket, copilot `--ui-server`) receives the body inline byte-exact; **under the sqlite default a socketless seat receives a path pointer instead of a typed body**; keep sends short (C10) regardless. (Do NOT claim the pointer path for fs/dual — it is off there.) Exact wording is yours; the REQUIREMENT is: no statement that is false under fs or dual, and the PD-02 diff stays empty.

## Tasks
| Status | ID | Task | Path | Done When |
|--------|-----|------|------|-----------|
| [x] | FX003-1 | Capture `just pij-skill-check > .harness/temp/s392/skill-check-before.txt`; reword invariant 2 per above; capture `…-after.txt`; `diff -u` them = empty | `skills/pij/SKILL.md` | clause true under sqlite/fs/dual; diff empty; SKILL.md ≤150 lines |
| [x] | FX003-2 | pathspec commit (`git commit -- skills/pij/SKILL.md docs/plans/392-day3-codex-doctrine/tasks/fx003-skill-clause/tasks.md`) + report | — | committed; before/after attached |

## Evidence

- Before: `.harness/temp/s392/skill-check-before.txt` (`just pij-skill-check`, expected
  pre-existing exit 1).
- After: `.harness/temp/s392/skill-check-after.txt` (same expected exit 1).
- `diff -u` exit: 0 — zero new findings.
- `skills/pij/SKILL.md`: 85 lines.
- Invariant 2 now limits the pointer promise to the sqlite default and makes no false
  claim about fs or dual.

## Note for the re-review
This ships in the Phase 4 PR. The daemon code fix (make dual use `sqliteOf` so the pointer path also covers dual) is a SEPARATE out-of-fence ticket to the o-prime (finding C), not this fix.
