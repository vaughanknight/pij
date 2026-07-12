# s043 fix report — round 1

**Coder**: `pij-planned-tiglon`
**Outcome**: COMPLETE

## filesChanged[]

- `.pi/extensions/pi-peacock/smoke.ts`
- `.pi/extensions/pij/telegram/index.test.ts`
- `docs/plans/043-telegram-last-speaker-routing/execution.log.md`

## evidence

- First-write-only production mutation: RED, 1 strengthened test failed / 90 passed.
- Restore: `index.ts` SHA-256 `5a50db6330224b3bc866048d2f7345027859a64ae9b1e550793f2d64e24ccb6a`.
- Targeted Telegram GREEN: 91/91.
- Targeted pi-peacock smoke: PASS.
- `harness checks`: PASS across typecheck, lint, full tests, all smoke, package audit, snapshots.
- `.pi/packages.yaml`: clean.
