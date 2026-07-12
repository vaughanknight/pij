# R8 prefix-budget re-review

**Prior finding**: `review.r8.md` F-01 Medium
**Verdict**: `APPROVE`

No material findings. F-01 is resolved.

## Mutation evidence

The full-body-budget mutation replaced prefix-aware budgeting with the complete Telegram text limit:

```ts
const budget = TELEGRAM_TEXT_LIMIT;
```

- RED: 4 boundary tests failed.
- Restore: `bridge.ts` was byte-identical before and after:
  `312b3d7ab5486f50d83ce5a20731796e8f73dd862ad649d71607059393499eed`.
- GREEN: targeted Telegram tests returned 100/100.

The prefix subtraction is load-bearing.

## Limit and content proof

`prefixedTextParts` subtracts `prefix.length + 1` before chunking, then adds the prefix to each emitted part. All text-producing paths use the same helper.

| Path | Proof |
|---|---|
| Ordinary boundary body | Every emitted part is `<=4096`; content reassembles exactly |
| Long chunked reply | Every part is `<=4096`; body reassembles exactly |
| Oversize attachment notice | Notice chunks are `<=4096`; path/content is preserved |
| No-media-sender fallback | Fallback chunks are `<=4096`; content reassembles exactly |
| Overflow media caption | Caption is emitted losslessly as prefix-aware text chunks, each `<=4096`, before media |

Every media caption is `<=1024`. If the full prefixed caption does not fit, the media is sent with the prefix-only caption after the caption text bubbles. `boundedSenderPrefix` also degrades an independently overlong context to the sender tag.

## Regression proof

The overflow-caption test proves:

- the full caption reassembles without truncation;
- the first caption text bubble retains the original reply id;
- subsequent text bubbles and the media do not reuse the reply id;
- media follows the text and carries only the bounded sender prefix;
- `onSpoke` fires once for the delivered pij message;
- sender context is resolved once.

Existing sender-tag parsing, reply routing, repository-context resolution, and main/non-main formatting remain unchanged.

## Gates and scope

| Check | Result |
|---|---|
| Targeted bridge/index/matcher tests | GREEN: 100/100 |
| `git diff --check 5e3a8ae` | GREEN |
| `.pi/packages.yaml` | Clean after restoring package-audit timestamp churn |
| `harness checks --json` | Typecheck, lint, tests, package audit, and snapshots passed; smoke alone failed with the recurring environment-wide missing-pane condition before scenario assertions |

The fix is bounded to the three authorized files:

```text
.pi/extensions/pij/telegram/bridge.ts
.pi/extensions/pij/telegram/bridge.test.ts
docs/plans/043-telegram-last-speaker-routing/execution.log.md
```
