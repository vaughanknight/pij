# Item-30 PR — build and gate evidence

Base: origin/main 9742d37  ·  PR branch: s392/item-30-pr  ·  head: ba807ca8afcf513cef7805979c82936e7cbcc010
Worktree: fresh-from-main (E35); node_modules symlinked (lock IDENTICAL).

## Cherry-pick chain (3 commits onto fresh main) — ALL CLEAN
  ba807ca test(telegram): close dead-routing advisories
  178256e test(telegram): retire last-speaker integration
  017ddeb fix(telegram): route inbound messages to live owners

## Gates
- typecheck 0; biome clean (bridge.ts, bridge.test.ts, index.test.ts)
- GREEN RUN 1: 4155 passed | 15 skipped, 0 failed
- GREEN RUN 2: 4155 passed | 15 skipped, 0 failed

## Cold review + mutant gates (RUN authoritatively)
- CONDITIONAL APPROVE (reviews/item-30-dead-routing-verdict.md); conditions closed in C1/C2/C3 (reviews/item-30-c1c2c3-verdict.md).
- 5 mutants RED->GREEN: MUT-PRIME-RESOLUTION-LASTSPEAKER (retirement proof), MUT-ALIVE-CHECK, MUT-DEAD-NEVER-QUEUED, MUT-ADDRESS-RECHECK (C3), MUT-MEDIA-RECHECK (C2). Baseline telegram fence 230.
- C1 guidance command = 'pij watchdog watch pij-telegram' (o-prime confirmed), pinned by bridge.test.ts:577 + index.test.ts:446.
