# s043 fix report — round 2

**Coder**: `pij-planned-tiglon`
**Outcome**: COMPLETE

## filesChanged[]

- `.pi/extensions/pij/telegram/index.test.ts`
- `docs/plans/043-telegram-last-speaker-routing/execution.log.md`

## evidence

- Delayed duplicate-to-A mutation after 100 ms: RED, 1 test failed / 90 passed.
- Restore: `index.ts` SHA-256 `5a50db6330224b3bc866048d2f7345027859a64ae9b1e550793f2d64e24ccb6a`.
- GREEN: targeted Telegram 91/91.
- Negative proof: `settleWhile` checks A/B exclusivity every 10 ms for a bounded 200 ms while both watchers remain live.
- `git diff --check`: clean.
- `.pi/packages.yaml`: clean.
