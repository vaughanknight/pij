# s043 R8 prefix-budget fix report

**Outcome**: COMPLETE

## filesChanged[]

- `.pi/extensions/pij/telegram/bridge.ts`
- `.pi/extensions/pij/telegram/bridge.test.ts`
- `docs/plans/043-telegram-last-speaker-routing/execution.log.md`

## behavior

- All prefixed text payloads are at most 4096 characters.
- Media captions are at most 1024 characters.
- Overflow captions are losslessly sent as prefix-aware text before prefix-only media.
- Reply threading, one `onSpoke`, and one sender-context lookup per delivered message are preserved.

## evidence

- RED: 4 expected boundary failures / 96 passes.
- Mutation using the full 4096 body budget emitted 4136/4193-character payloads and failed 4 tests.
- Restore: `bridge.ts` SHA-256 `312b3d7ab5486f50d83ce5a20731796e8f73dd862ad649d71607059393499eed`.
- GREEN: targeted 100/100.
- Typecheck and touched-file Biome PASS.
- Diff check/package cleanliness PASS.
