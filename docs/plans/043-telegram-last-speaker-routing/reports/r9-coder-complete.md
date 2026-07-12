# s043 R9 coder report — dlg-0003

**Outcome**: COMPLETE

## claim

Exact prefix normalization now runs before text/caption budgeting:

- canonical same-sender prefix remains single;
- same-sender tag-only input upgrades to canonical;
- different sender tags and arbitrary bracketed content remain content.

## filesChanged[]

- `.pi/extensions/pij/telegram/bridge.ts`
- `.pi/extensions/pij/telegram/bridge.test.ts`
- `docs/plans/043-telegram-last-speaker-routing/telegram-last-speaker-routing-plan.md`
- `docs/plans/043-telegram-last-speaker-routing/execution.log.md`

## evidence

- RED: 5 expected failures / 99 passes.
- Normalization-bypass mutation: same 5 failures.
- Restore: `bridge.ts` SHA-256 `43249de69d6beb66919f2301b6308941682ff6d2ccbbcc4779ba72fdcf1f6c38`.
- GREEN: targeted 104/104.
- Isolated `harness checks`: every sensor PASS.
- `.pi/packages.yaml`: clean.
